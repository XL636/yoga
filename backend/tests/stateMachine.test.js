import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations, seedDefaults } from '../src/db/migrations.js';
import {
  canTransitionBooking,
  canTransitionSession,
  BookingStatus,
  SessionStatus,
} from '../src/domain/stateMachine.js';
import { holdBooking, confirmBooking, cancelBooking } from '../src/services/bookingService.js';
import { getPolicy } from '../src/services/policyService.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// State Machine Unit Tests
// ============================================================

describe('Booking state machine transitions', () => {
  it('HOLD → CONFIRMED is valid', () => {
    assert.ok(canTransitionBooking('HOLD', 'CONFIRMED'));
  });

  it('HOLD → CANCELLED is valid', () => {
    assert.ok(canTransitionBooking('HOLD', 'CANCELLED'));
  });

  it('CONFIRMED → CANCELLED is valid', () => {
    assert.ok(canTransitionBooking('CONFIRMED', 'CANCELLED'));
  });

  it('CONFIRMED → CHECKED_IN is valid', () => {
    assert.ok(canTransitionBooking('CONFIRMED', 'CHECKED_IN'));
  });

  it('CONFIRMED → NO_SHOW is valid', () => {
    assert.ok(canTransitionBooking('CONFIRMED', 'NO_SHOW'));
  });

  it('CANCELLED → CONFIRMED is invalid (terminal state)', () => {
    assert.ok(!canTransitionBooking('CANCELLED', 'CONFIRMED'));
  });

  it('CANCELLED → HOLD is invalid (terminal state)', () => {
    assert.ok(!canTransitionBooking('CANCELLED', 'HOLD'));
  });

  it('CHECKED_IN → CANCELLED is invalid (terminal state)', () => {
    assert.ok(!canTransitionBooking('CHECKED_IN', 'CANCELLED'));
  });

  it('HOLD → CHECKED_IN is invalid (must confirm first)', () => {
    assert.ok(!canTransitionBooking('HOLD', 'CHECKED_IN'));
  });
});

describe('Session state machine transitions', () => {
  it('SCHEDULED → CANCELLED is valid', () => {
    assert.ok(canTransitionSession('SCHEDULED', 'CANCELLED'));
  });

  it('SCHEDULED → COMPLETED is valid', () => {
    assert.ok(canTransitionSession('SCHEDULED', 'COMPLETED'));
  });

  it('CANCELLED → SCHEDULED is invalid', () => {
    assert.ok(!canTransitionSession('CANCELLED', 'SCHEDULED'));
  });

  it('COMPLETED → SCHEDULED is invalid', () => {
    assert.ok(!canTransitionSession('COMPLETED', 'SCHEDULED'));
  });
});

// ============================================================
// Booking Service Integration Tests
// ============================================================

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  seedDefaults(db);
  return db;
}

function seedTestData(db) {
  const templateId = uuidv4();
  const sessionId = uuidv4();
  const userId = uuidv4();

  db.prepare(`
    INSERT INTO class_templates (id, name, duration_minutes, difficulty, default_capacity)
    VALUES (?, 'Vinyasa Flow', 60, 'intermediate', 5)
  `).run(templateId);

  db.prepare(`
    INSERT INTO sessions (id, template_id, coach_name, start_time, end_time, capacity, confirmed_count, status)
    VALUES (?, ?, 'Coach Li', datetime('now', '+1 day'), datetime('now', '+1 day', '+1 hour'), 5, 0, 'SCHEDULED')
  `).run(sessionId, templateId);

  db.prepare(`
    INSERT INTO users (id, openid, nickname)
    VALUES (?, ?, 'Test User')
  `).run(userId, 'test-openid-' + userId);

  return { templateId, sessionId, userId };
}

describe('Hold booking', () => {
  let db;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('creates a HOLD booking successfully', () => {
    const { sessionId, userId } = seedTestData(db);
    const result = holdBooking(db, userId, sessionId);
    assert.ok(result.ok);
    assert.equal(result.data.status, 'HOLD');
    assert.equal(result.data.user_id, userId);
    assert.equal(result.data.session_id, sessionId);
    assert.ok(result.data.expires_at);
  });

  it('rejects hold when session is not SCHEDULED', () => {
    const { sessionId, userId } = seedTestData(db);
    db.prepare("UPDATE sessions SET status = 'CANCELLED' WHERE id = ?").run(sessionId);
    const result = holdBooking(db, userId, sessionId);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'SESSION_NOT_BOOKABLE');
  });

  it('rejects duplicate active booking for same session', () => {
    const { sessionId, userId } = seedTestData(db);
    const first = holdBooking(db, userId, sessionId);
    assert.ok(first.ok);
    const second = holdBooking(db, userId, sessionId);
    assert.ok(!second.ok);
    assert.equal(second.error.code, 'POLICY_BLOCKED');
  });
});

describe('Confirm booking', () => {
  let db;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('confirms a HOLD booking and increments confirmed_count', () => {
    const { sessionId, userId } = seedTestData(db);
    const hold = holdBooking(db, userId, sessionId);
    assert.ok(hold.ok);

    const result = confirmBooking(db, hold.data.id, userId);
    assert.ok(result.ok);
    assert.equal(result.data.status, 'CONFIRMED');

    const session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 1);
  });

  it('rejects confirm on expired HOLD', () => {
    const { sessionId, userId } = seedTestData(db);
    const hold = holdBooking(db, userId, sessionId);
    assert.ok(hold.ok);

    // Force expire the hold
    db.prepare("UPDATE bookings SET expires_at = datetime('now', '-1 hour') WHERE id = ?").run(hold.data.id);

    const result = confirmBooking(db, hold.data.id, userId);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'BOOKING_EXPIRED');

    // Booking should now be CANCELLED with reason EXPIRED
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(hold.data.id);
    assert.equal(booking.status, 'CANCELLED');
    assert.equal(booking.cancel_reason, 'EXPIRED');
  });

  it('rejects confirm on CANCELLED booking (invalid state)', () => {
    const { sessionId, userId } = seedTestData(db);
    const hold = holdBooking(db, userId, sessionId);
    assert.ok(hold.ok);

    // Cancel first
    const cancel = cancelBooking(db, hold.data.id, userId);
    assert.ok(cancel.ok);

    // Try to confirm the cancelled booking
    const result = confirmBooking(db, hold.data.id, userId);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'INVALID_STATE');
  });

  it('rejects confirm by wrong user', () => {
    const { sessionId, userId } = seedTestData(db);
    const hold = holdBooking(db, userId, sessionId);
    assert.ok(hold.ok);

    const result = confirmBooking(db, hold.data.id, 'wrong-user-id');
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'UNAUTHORIZED');
  });
});

describe('Cancel booking', () => {
  let db;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('cancels a HOLD booking', () => {
    const { sessionId, userId } = seedTestData(db);
    const hold = holdBooking(db, userId, sessionId);
    assert.ok(hold.ok);

    const result = cancelBooking(db, hold.data.id, userId);
    assert.ok(result.ok);
    assert.equal(result.data.status, 'CANCELLED');
    assert.equal(result.data.cancel_reason, 'USER_CANCEL');
  });

  it('cancels a CONFIRMED booking and rolls back confirmed_count', () => {
    const { sessionId, userId } = seedTestData(db);
    const hold = holdBooking(db, userId, sessionId);
    assert.ok(hold.ok);
    const confirm = confirmBooking(db, hold.data.id, userId);
    assert.ok(confirm.ok);

    // Verify count incremented
    let session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 1);

    // Cancel
    const result = cancelBooking(db, hold.data.id, userId);
    assert.ok(result.ok);
    assert.equal(result.data.status, 'CANCELLED');

    // Verify count rolled back
    session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 0);
  });

  it('rejects cancel on already CANCELLED booking', () => {
    const { sessionId, userId } = seedTestData(db);
    const hold = holdBooking(db, userId, sessionId);
    assert.ok(hold.ok);
    cancelBooking(db, hold.data.id, userId);

    const result = cancelBooking(db, hold.data.id, userId);
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'INVALID_STATE');
  });

  it('rejects cancel by wrong user', () => {
    const { sessionId, userId } = seedTestData(db);
    const hold = holdBooking(db, userId, sessionId);
    assert.ok(hold.ok);

    const result = cancelBooking(db, hold.data.id, 'wrong-user-id');
    assert.ok(!result.ok);
    assert.equal(result.error.code, 'UNAUTHORIZED');
  });
});

describe('Policy service', () => {
  let db;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('returns default policy when no template-specific policy exists', () => {
    const policy = getPolicy(db, null);
    assert.equal(policy.cancel_free_before_minutes, 240);
    assert.equal(policy.hold_ttl_minutes, 10);
    assert.equal(policy.max_active_bookings, 3);
  });

  it('returns template-specific policy when it exists', () => {
    const templateId = uuidv4();
    db.prepare(`
      INSERT INTO class_templates (id, name) VALUES (?, 'Test')
    `).run(templateId);
    db.prepare(`
      INSERT INTO policies (id, template_id, cancel_free_before_minutes, hold_ttl_minutes, max_active_bookings)
      VALUES (?, ?, 120, 5, 2)
    `).run(uuidv4(), templateId);

    const policy = getPolicy(db, templateId);
    assert.equal(policy.cancel_free_before_minutes, 120);
    assert.equal(policy.hold_ttl_minutes, 5);
    assert.equal(policy.max_active_bookings, 2);
  });
});

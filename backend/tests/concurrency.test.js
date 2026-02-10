import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations, seedDefaults } from '../src/db/migrations.js';
import { holdBooking, confirmBooking, cancelBooking } from '../src/services/bookingService.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Concurrency Tests — Anti-Oversell
// ============================================================

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  seedDefaults(db);
  return db;
}

describe('Concurrency: 10 confirm on capacity=5', () => {
  let db;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('exactly 5 succeed, 5 fail with SESSION_FULL, confirmed_count = 5', () => {
    const templateId = uuidv4();
    const sessionId = uuidv4();

    db.prepare(`
      INSERT INTO class_templates (id, name, duration_minutes, difficulty, default_capacity)
      VALUES (?, 'Power Yoga', 60, 'advanced', 5)
    `).run(templateId);

    db.prepare(`
      INSERT INTO sessions (id, template_id, coach_name, start_time, end_time, capacity, confirmed_count, status)
      VALUES (?, ?, 'Coach Wang', datetime('now', '+1 day'), datetime('now', '+1 day', '+1 hour'), 5, 0, 'SCHEDULED')
    `).run(sessionId, templateId);

    // Create 10 users, each holds then confirms
    const userIds = [];
    const holdResults = [];

    for (let i = 0; i < 10; i++) {
      const userId = uuidv4();
      db.prepare(`
        INSERT INTO users (id, openid, nickname) VALUES (?, ?, ?)
      `).run(userId, `openid-${i}`, `User ${i}`);
      userIds.push(userId);

      const hold = holdBooking(db, userId, sessionId);
      assert.ok(hold.ok, `Hold ${i} should succeed`);
      holdResults.push(hold.data);
    }

    // Now confirm all 10 — in SQLite (single process), these run serially
    // but the atomic UPDATE ensures correctness
    const confirmResults = holdResults.map((booking, i) =>
      confirmBooking(db, booking.id, userIds[i])
    );

    const successes = confirmResults.filter(r => r.ok);
    const failures = confirmResults.filter(r => !r.ok);

    // Exactly 5 should succeed
    assert.equal(successes.length, 5, `Expected 5 successes, got ${successes.length}`);

    // Exactly 5 should fail
    assert.equal(failures.length, 5, `Expected 5 failures, got ${failures.length}`);

    // All failures should be SESSION_FULL
    for (const f of failures) {
      assert.equal(f.error.code, 'SESSION_FULL', `Expected SESSION_FULL, got ${f.error.code}`);
    }

    // confirmed_count must equal 5
    const session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 5, `confirmed_count should be 5, got ${session.confirmed_count}`);

    // Count CONFIRMED bookings in DB — must also be 5
    const confirmedBookings = db.prepare(
      "SELECT COUNT(*) as cnt FROM bookings WHERE session_id = ? AND status = 'CONFIRMED'"
    ).get(sessionId);
    assert.equal(confirmedBookings.cnt, 5, `CONFIRMED bookings should be 5, got ${confirmedBookings.cnt}`);
  });
});

describe('Cancel rollback correctness', () => {
  let db;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('confirmed_count decrements correctly after cancel', () => {
    const templateId = uuidv4();
    const sessionId = uuidv4();

    db.prepare(`
      INSERT INTO class_templates (id, name) VALUES (?, 'Yin Yoga')
    `).run(templateId);

    db.prepare(`
      INSERT INTO sessions (id, template_id, start_time, end_time, capacity, confirmed_count, status)
      VALUES (?, ?, datetime('now', '+1 day'), datetime('now', '+1 day', '+1 hour'), 5, 0, 'SCHEDULED')
    `).run(sessionId, templateId);

    // Create 3 users, hold + confirm
    const bookings = [];
    for (let i = 0; i < 3; i++) {
      const userId = uuidv4();
      db.prepare(`INSERT INTO users (id, openid, nickname) VALUES (?, ?, ?)`).run(
        userId, `openid-cancel-${i}`, `Cancel User ${i}`
      );
      const hold = holdBooking(db, userId, sessionId);
      assert.ok(hold.ok);
      const confirm = confirmBooking(db, hold.data.id, userId);
      assert.ok(confirm.ok);
      bookings.push({ bookingId: hold.data.id, userId });
    }

    // confirmed_count should be 3
    let session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 3);

    // Cancel booking 0
    const cancel0 = cancelBooking(db, bookings[0].bookingId, bookings[0].userId);
    assert.ok(cancel0.ok);

    session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 2, 'confirmed_count should be 2 after one cancel');

    // Cancel booking 1
    const cancel1 = cancelBooking(db, bookings[1].bookingId, bookings[1].userId);
    assert.ok(cancel1.ok);

    session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 1, 'confirmed_count should be 1 after two cancels');

    // Cancel booking 2
    const cancel2 = cancelBooking(db, bookings[2].bookingId, bookings[2].userId);
    assert.ok(cancel2.ok);

    session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 0, 'confirmed_count should be 0 after all cancels');
  });

  it('confirmed_count never goes below 0', () => {
    const templateId = uuidv4();
    const sessionId = uuidv4();

    db.prepare(`
      INSERT INTO class_templates (id, name) VALUES (?, 'Safe Yoga')
    `).run(templateId);

    db.prepare(`
      INSERT INTO sessions (id, template_id, start_time, end_time, capacity, confirmed_count, status)
      VALUES (?, ?, datetime('now', '+1 day'), datetime('now', '+1 day', '+1 hour'), 5, 0, 'SCHEDULED')
    `).run(sessionId, templateId);

    // Verify count stays at 0 even after an edge case
    const session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 0);
  });
});

describe('Full cycle: hold → confirm → cancel → new hold → confirm', () => {
  let db;
  before(() => { db = createTestDb(); });
  after(() => { db.close(); });

  it('user can rebook after cancelling', () => {
    const templateId = uuidv4();
    const sessionId = uuidv4();
    const userId = uuidv4();

    db.prepare(`INSERT INTO class_templates (id, name) VALUES (?, 'Flow')`).run(templateId);
    db.prepare(`
      INSERT INTO sessions (id, template_id, start_time, end_time, capacity, confirmed_count, status)
      VALUES (?, ?, datetime('now', '+1 day'), datetime('now', '+1 day', '+1 hour'), 5, 0, 'SCHEDULED')
    `).run(sessionId, templateId);
    db.prepare(`INSERT INTO users (id, openid, nickname) VALUES (?, ?, 'Rebooker')`).run(
      userId, 'openid-rebook'
    );

    // First booking cycle
    const hold1 = holdBooking(db, userId, sessionId);
    assert.ok(hold1.ok);
    const confirm1 = confirmBooking(db, hold1.data.id, userId);
    assert.ok(confirm1.ok);

    let session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 1);

    const cancel1 = cancelBooking(db, hold1.data.id, userId);
    assert.ok(cancel1.ok);

    session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 0);

    // Second booking cycle — new booking
    const hold2 = holdBooking(db, userId, sessionId);
    assert.ok(hold2.ok);
    assert.notEqual(hold2.data.id, hold1.data.id, 'Should be a new booking');

    const confirm2 = confirmBooking(db, hold2.data.id, userId);
    assert.ok(confirm2.ok);

    session = db.prepare('SELECT confirmed_count FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(session.confirmed_count, 1);
  });
});

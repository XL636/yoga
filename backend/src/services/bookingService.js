import { v4 as uuidv4 } from 'uuid';
import {
  BookingStatus,
  SessionStatus,
  assertBookingTransition,
} from '../domain/stateMachine.js';
import { getPolicy } from './policyService.js';

// ============================================================
// Booking Service — hold, confirm, cancel with atomic ops
// ============================================================

/**
 * Create a HOLD booking for a session.
 *
 * Checks:
 * - Session exists and is SCHEDULED
 * - User has not exceeded max_active_bookings
 * - User does not already have an active booking for this session
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} userId
 * @param {string} sessionId
 * @returns {{ ok: true, data: object } | { ok: false, error: { code: string, message: string } }}
 */
export function holdBooking(db, userId, sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return { ok: false, error: { code: 'SESSION_NOT_BOOKABLE', message: 'Session not found' } };
  }
  if (session.status !== SessionStatus.SCHEDULED) {
    return { ok: false, error: { code: 'SESSION_NOT_BOOKABLE', message: `Session status is ${session.status}` } };
  }

  // Check capacity (confirmed + active holds)
  if (session.confirmed_count >= session.capacity) {
    return { ok: false, error: { code: 'SESSION_FULL', message: 'No available spots' } };
  }

  // Get policy
  const policy = getPolicy(db, session.template_id);

  // Check max active bookings for user (HOLD + CONFIRMED)
  const activeCount = db.prepare(
    `SELECT COUNT(*) as cnt FROM bookings
     WHERE user_id = ? AND status IN ('HOLD', 'CONFIRMED')`
  ).get(userId).cnt;

  if (activeCount >= policy.max_active_bookings) {
    return { ok: false, error: { code: 'POLICY_BLOCKED', message: `Max active bookings (${policy.max_active_bookings}) reached` } };
  }

  // Check user doesn't already have active booking for this session
  const existingBooking = db.prepare(
    `SELECT id FROM bookings
     WHERE user_id = ? AND session_id = ? AND status IN ('HOLD', 'CONFIRMED')`
  ).get(userId, sessionId);

  if (existingBooking) {
    return { ok: false, error: { code: 'POLICY_BLOCKED', message: 'Already have an active booking for this session' } };
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const expiresAt = new Date(Date.now() + policy.hold_ttl_minutes * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  const bookingId = uuidv4();
  db.prepare(`
    INSERT INTO bookings (id, user_id, session_id, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, 'HOLD', ?, ?, ?)
  `).run(bookingId, userId, sessionId, expiresAt, now, now);

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);

  console.log(JSON.stringify({
    event: 'session_hold_created',
    booking_id: bookingId,
    session_id: sessionId,
    user_id: userId,
    expires_at: expiresAt,
  }));

  return { ok: true, data: booking };
}

/**
 * Confirm a HOLD booking — atomic capacity decrement.
 *
 * Steps (in a transaction):
 * 1. Verify booking is HOLD and not expired
 * 2. Atomic UPDATE sessions SET confirmed_count = confirmed_count + 1 WHERE confirmed_count < capacity
 * 3. Update booking status to CONFIRMED
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} bookingId
 * @param {string} userId - For ownership check
 * @returns {{ ok: true, data: object } | { ok: false, error: { code: string, message: string } }}
 */
export function confirmBooking(db, bookingId, userId) {
  const txn = db.transaction(() => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) {
      return { ok: false, error: { code: 'INVALID_STATE', message: 'Booking not found' } };
    }

    // Ownership check
    if (booking.user_id !== userId) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Not your booking' } };
    }

    // Check expired HOLD
    if (booking.status === BookingStatus.HOLD) {
      const now = new Date();
      const expiresAt = new Date(booking.expires_at.replace(' ', 'T') + 'Z');
      if (now > expiresAt) {
        // Expire the booking
        const ts = now.toISOString().replace('T', ' ').slice(0, 19);
        db.prepare(`
          UPDATE bookings SET status = 'CANCELLED', cancel_reason = 'EXPIRED', cancelled_at = ?, updated_at = ?
          WHERE id = ?
        `).run(ts, ts, bookingId);
        return { ok: false, error: { code: 'BOOKING_EXPIRED', message: 'Hold has expired' } };
      }
    }

    // Validate state transition
    try {
      assertBookingTransition(booking.status, BookingStatus.CONFIRMED);
    } catch (e) {
      return { ok: false, error: { code: e.code, message: e.message } };
    }

    // Atomic capacity increment — the core anti-oversell mechanism
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const result = db.prepare(`
      UPDATE sessions
      SET confirmed_count = confirmed_count + 1, updated_at = ?
      WHERE id = ?
        AND status = 'SCHEDULED'
        AND confirmed_count < capacity
    `).run(now, booking.session_id);

    if (result.changes === 0) {
      return { ok: false, error: { code: 'SESSION_FULL', message: 'No available spots' } };
    }

    // Update booking to CONFIRMED
    db.prepare(`
      UPDATE bookings SET status = 'CONFIRMED', confirmed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, bookingId);

    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    const session = db.prepare('SELECT id, confirmed_count FROM sessions WHERE id = ?').get(booking.session_id);

    console.log(JSON.stringify({
      event: 'booking_confirmed',
      booking_id: bookingId,
      session_id: booking.session_id,
      user_id: userId,
    }));
    console.log(JSON.stringify({
      event: 'session_capacity_changed',
      session_id: booking.session_id,
      confirmed_count: session.confirmed_count,
    }));

    return { ok: true, data: updatedBooking };
  });

  return txn();
}

/**
 * Cancel a booking (HOLD or CONFIRMED).
 *
 * If CONFIRMED → atomically rollback confirmed_count.
 * Respects cancel_free_before_minutes policy (marks LATE_CANCEL if outside window).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} bookingId
 * @param {string} userId
 * @returns {{ ok: true, data: object } | { ok: false, error: { code: string, message: string } }}
 */
export function cancelBooking(db, bookingId, userId) {
  const txn = db.transaction(() => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) {
      return { ok: false, error: { code: 'INVALID_STATE', message: 'Booking not found' } };
    }

    // Ownership check
    if (booking.user_id !== userId) {
      return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Not your booking' } };
    }

    // Validate state transition
    try {
      assertBookingTransition(booking.status, BookingStatus.CANCELLED);
    } catch (e) {
      return { ok: false, error: { code: e.code, message: e.message } };
    }

    const now = new Date();
    const ts = now.toISOString().replace('T', ' ').slice(0, 19);
    let cancelReason = 'USER_CANCEL';

    // If booking was CONFIRMED, check cancel policy and rollback capacity
    if (booking.status === BookingStatus.CONFIRMED) {
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(booking.session_id);
      const policy = getPolicy(db, session.template_id);

      const startTime = new Date(session.start_time.replace(' ', 'T') + 'Z');
      const minutesBefore = (startTime - now) / (1000 * 60);

      if (minutesBefore < policy.cancel_free_before_minutes) {
        cancelReason = 'LATE_CANCEL';
      }

      // Rollback confirmed_count (only if session is SCHEDULED and count > 0)
      if (session.status === SessionStatus.SCHEDULED) {
        db.prepare(`
          UPDATE sessions
          SET confirmed_count = confirmed_count - 1, updated_at = ?
          WHERE id = ? AND confirmed_count > 0
        `).run(ts, booking.session_id);

        const updatedSession = db.prepare('SELECT id, confirmed_count FROM sessions WHERE id = ?').get(booking.session_id);
        console.log(JSON.stringify({
          event: 'session_capacity_changed',
          session_id: booking.session_id,
          confirmed_count: updatedSession.confirmed_count,
        }));
      }
    } else if (booking.status === BookingStatus.HOLD) {
      cancelReason = 'USER_CANCEL';
    }

    // Update booking to CANCELLED
    db.prepare(`
      UPDATE bookings SET status = 'CANCELLED', cancel_reason = ?, cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).run(cancelReason, ts, ts, bookingId);

    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);

    console.log(JSON.stringify({
      event: 'booking_cancelled',
      booking_id: bookingId,
      reason: cancelReason,
    }));

    return { ok: true, data: updatedBooking };
  });

  return txn();
}

import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { confirmBooking, cancelBooking } from '../services/bookingService.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export default function bookingRoutes(db) {
  const router = Router();

  /**
   * POST /bookings/:id/confirm
   * Auth required. Confirms a HOLD booking (atomic capacity decrement).
   */
  router.post('/bookings/:id/confirm', requireUser, (req, res) => {
    const result = confirmBooking(db, req.params.id, req.userId);

    if (!result.ok) {
      const statusMap = {
        UNAUTHORIZED: 403,
        BOOKING_EXPIRED: 410,
        SESSION_FULL: 409,
        INVALID_STATE: 409,
      };
      const status = statusMap[result.error.code] || 400;
      return res.status(status).json(result);
    }

    return res.json(result);
  });

  /**
   * POST /bookings/:id/cancel
   * Auth required. Cancels a HOLD or CONFIRMED booking.
   */
  router.post('/bookings/:id/cancel', requireUser, (req, res) => {
    const result = cancelBooking(db, req.params.id, req.userId);

    if (!result.ok) {
      const status = result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      return res.status(status).json(result);
    }

    return res.json(result);
  });

  /**
   * GET /me/bookings
   * Auth required. List current user's bookings.
   */
  router.get('/me/bookings', requireUser, (req, res) => {
    const bookings = db.prepare(`
      SELECT b.*, s.start_time as session_start_time, s.end_time as session_end_time,
             s.coach_name, s.status as session_status,
             ct.name as template_name, ct.difficulty
      FROM bookings b
      JOIN sessions s ON b.session_id = s.id
      JOIN class_templates ct ON s.template_id = ct.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(req.userId);

    return res.json({ ok: true, data: bookings });
  });

  return router;
}

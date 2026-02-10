import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { holdBooking } from '../services/bookingService.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export default function sessionRoutes(db) {
  const router = Router();

  /**
   * GET /sessions?date=YYYY-MM-DD
   * Public: list sessions for a given date.
   */
  router.get('/sessions', (req, res) => {
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'date query param required (YYYY-MM-DD)' } });
    }

    const sessions = db.prepare(`
      SELECT s.*, ct.name as template_name, ct.description as template_description,
             ct.difficulty, ct.duration_minutes
      FROM sessions s
      JOIN class_templates ct ON s.template_id = ct.id
      WHERE date(s.start_time) = ?
      ORDER BY s.start_time ASC
    `).all(date);

    return res.json({ ok: true, data: sessions });
  });

  /**
   * GET /sessions/:id
   * Public: get session detail.
   */
  router.get('/sessions/:id', (req, res) => {
    const session = db.prepare(`
      SELECT s.*, ct.name as template_name, ct.description as template_description,
             ct.difficulty, ct.duration_minutes
      FROM sessions s
      JOIN class_templates ct ON s.template_id = ct.id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!session) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }

    return res.json({ ok: true, data: session });
  });

  /**
   * POST /sessions/:id/hold
   * Auth required. Creates a HOLD booking.
   */
  router.post('/sessions/:id/hold', requireUser, (req, res) => {
    const result = holdBooking(db, req.userId, req.params.id);

    if (!result.ok) {
      const status = result.error.code === 'UNAUTHORIZED' ? 403 : 400;
      return res.status(status).json(result);
    }

    return res.status(201).json(result);
  });

  return router;
}

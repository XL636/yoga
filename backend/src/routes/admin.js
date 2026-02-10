import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAdmin } from '../middleware/auth.js';
import { createSession } from '../services/sessionService.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export default function adminRoutes(db) {
  const router = Router();

  // All admin routes require Basic Auth
  router.use(requireAdmin);

  // ==================== Templates ====================

  /**
   * POST /admin/templates
   * Create a class template.
   */
  router.post('/templates', (req, res) => {
    const { name, description, duration_minutes, difficulty, default_capacity } = req.body;

    if (!name) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'name is required' } });
    }

    const id = uuidv4();
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    db.prepare(`
      INSERT INTO class_templates (id, name, description, duration_minutes, difficulty, default_capacity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      description || '',
      duration_minutes || 60,
      difficulty || 'beginner',
      default_capacity || 20,
      now,
      now,
    );

    const template = db.prepare('SELECT * FROM class_templates WHERE id = ?').get(id);
    return res.status(201).json({ ok: true, data: template });
  });

  /**
   * GET /admin/templates
   * List all templates.
   */
  router.get('/templates', (req, res) => {
    const templates = db.prepare('SELECT * FROM class_templates ORDER BY created_at DESC').all();
    return res.json({ ok: true, data: templates });
  });

  // ==================== Sessions ====================

  /**
   * POST /admin/sessions
   * Create a session (schedule a class) from a template.
   * Body: { template_id, coach_name?, start_time, end_time?, capacity? }
   */
  router.post('/sessions', (req, res) => {
    const { template_id, start_time } = req.body;

    if (!template_id || !start_time) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_INPUT', message: 'template_id and start_time are required' },
      });
    }

    const result = createSession(db, req.body);
    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  });

  /**
   * GET /admin/sessions?date=YYYY-MM-DD
   * List sessions, optionally filtered by date.
   */
  router.get('/sessions', (req, res) => {
    const { date } = req.query;

    let sessions;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      sessions = db.prepare(`
        SELECT s.*, ct.name as template_name
        FROM sessions s
        JOIN class_templates ct ON s.template_id = ct.id
        WHERE date(s.start_time) = ?
        ORDER BY s.start_time ASC
      `).all(date);
    } else {
      sessions = db.prepare(`
        SELECT s.*, ct.name as template_name
        FROM sessions s
        JOIN class_templates ct ON s.template_id = ct.id
        ORDER BY s.start_time DESC
        LIMIT 50
      `).all();
    }

    return res.json({ ok: true, data: sessions });
  });

  /**
   * GET /admin/sessions/:id/bookings
   * List bookings for a specific session.
   */
  router.get('/sessions/:id/bookings', (req, res) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }

    const bookings = db.prepare(`
      SELECT b.*, u.nickname, u.avatar_url
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.session_id = ?
      ORDER BY b.created_at ASC
    `).all(req.params.id);

    return res.json({ ok: true, data: { session, bookings } });
  });

  return router;
}

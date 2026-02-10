import { v4 as uuidv4 } from 'uuid';

/**
 * Create a session from a template.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ template_id: string, coach_name?: string, start_time: string, end_time?: string, capacity?: number }} params
 * @returns {{ ok: true, data: object } | { ok: false, error: { code: string, message: string } }}
 */
export function createSession(db, params) {
  const { template_id, coach_name, start_time, end_time, capacity } = params;

  const template = db.prepare('SELECT * FROM class_templates WHERE id = ?').get(template_id);
  if (!template) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Template not found' } };
  }

  // Calculate end_time from template duration if not provided
  const resolvedEndTime = end_time || new Date(
    new Date(start_time).getTime() + template.duration_minutes * 60 * 1000
  ).toISOString().replace('T', ' ').slice(0, 19);

  const resolvedCapacity = capacity || template.default_capacity;

  const sessionId = uuidv4();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  db.prepare(`
    INSERT INTO sessions (id, template_id, coach_name, start_time, end_time, capacity, confirmed_count, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'SCHEDULED', ?, ?)
  `).run(sessionId, template_id, coach_name || '', start_time, resolvedEndTime, resolvedCapacity, now, now);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  return { ok: true, data: session };
}

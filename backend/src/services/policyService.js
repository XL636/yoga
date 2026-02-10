// ============================================================
// Policy Service — configurable rules (global + per-template)
// ============================================================

const DEFAULTS = {
  cancel_free_before_minutes: 240,
  hold_ttl_minutes: 10,
  max_active_bookings: 3,
};

/**
 * Get the effective policy for a given template.
 * Merges: template-specific policy > global policy > hardcoded defaults.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string|null} templateId
 * @returns {{ cancel_free_before_minutes: number, hold_ttl_minutes: number, max_active_bookings: number }}
 */
export function getPolicy(db, templateId) {
  // Try template-specific first
  if (templateId) {
    const tpl = db.prepare(
      'SELECT cancel_free_before_minutes, hold_ttl_minutes, max_active_bookings FROM policies WHERE template_id = ?'
    ).get(templateId);
    if (tpl) return tpl;
  }

  // Fall back to global (template_id IS NULL)
  const global = db.prepare(
    'SELECT cancel_free_before_minutes, hold_ttl_minutes, max_active_bookings FROM policies WHERE template_id IS NULL'
  ).get();

  return global || { ...DEFAULTS };
}

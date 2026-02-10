/**
 * Run all migrations on the given database connection.
 * Idempotent: uses IF NOT EXISTS.
 * @param {import('better-sqlite3').Database} db
 */
export function runMigrations(db) {
  db.exec(`
    -- Users (WeChat login)
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      openid        TEXT NOT NULL UNIQUE,
      nickname      TEXT NOT NULL DEFAULT '',
      avatar_url    TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Class templates (course types)
    CREATE TABLE IF NOT EXISTS class_templates (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      description       TEXT NOT NULL DEFAULT '',
      duration_minutes  INTEGER NOT NULL DEFAULT 60,
      difficulty        TEXT NOT NULL DEFAULT 'beginner',
      default_capacity  INTEGER NOT NULL DEFAULT 20,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Sessions (scheduled classes)
    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,
      template_id     TEXT NOT NULL REFERENCES class_templates(id),
      coach_name      TEXT NOT NULL DEFAULT '',
      start_time      TEXT NOT NULL,
      end_time        TEXT NOT NULL,
      capacity        INTEGER NOT NULL,
      confirmed_count INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'SCHEDULED'
                      CHECK (status IN ('SCHEDULED', 'CANCELLED', 'COMPLETED')),
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

    -- Bookings (reservations with state machine)
    CREATE TABLE IF NOT EXISTS bookings (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id),
      session_id    TEXT NOT NULL REFERENCES sessions(id),
      status        TEXT NOT NULL DEFAULT 'HOLD'
                    CHECK (status IN ('HOLD', 'CONFIRMED', 'CANCELLED', 'CHECKED_IN', 'NO_SHOW')),
      expires_at    TEXT,
      confirmed_at  TEXT,
      cancelled_at  TEXT,
      cancel_reason TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_session_id ON bookings(session_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

    -- Policy (rules, configurable per template)
    CREATE TABLE IF NOT EXISTS policies (
      id                          TEXT PRIMARY KEY,
      template_id                 TEXT UNIQUE REFERENCES class_templates(id),
      cancel_free_before_minutes  INTEGER NOT NULL DEFAULT 240,
      hold_ttl_minutes            INTEGER NOT NULL DEFAULT 10,
      max_active_bookings         INTEGER NOT NULL DEFAULT 3,
      created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Insert default policy (global, template_id = NULL).
 * @param {import('better-sqlite3').Database} db
 */
export function seedDefaults(db) {
  const exists = db.prepare('SELECT id FROM policies WHERE template_id IS NULL').get();
  if (!exists) {
    db.prepare(`
      INSERT INTO policies (id, template_id, cancel_free_before_minutes, hold_ttl_minutes, max_active_bookings)
      VALUES ('default-policy', NULL, 240, 10, 3)
    `).run();
  }
}

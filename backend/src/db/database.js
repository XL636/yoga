import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Get or create the database connection.
 * @param {string} [dbPath] - Override path for testing (use ':memory:' for in-memory DB)
 * @returns {import('better-sqlite3').Database}
 */
export function getDb(dbPath) {
  if (db) return db;
  const resolvedPath = dbPath || path.join(__dirname, '..', '..', 'data', 'yoga.db');
  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Create a fresh in-memory database (for testing).
 * Each call returns a NEW independent database.
 * @returns {import('better-sqlite3').Database}
 */
export function createTestDb() {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  return testDb;
}

/**
 * Close the singleton database connection.
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

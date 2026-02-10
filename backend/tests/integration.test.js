/**
 * Integration test: full booking cycle via HTTP API.
 *
 * Starts a single test server, then tests the complete flow:
 * Admin creates template → Admin schedules session → User login →
 * hold → confirm → cancel → verify rollback
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTestDb } from '../src/db/database.js';
import { runMigrations, seedDefaults } from '../src/db/migrations.js';
import authRoutes from '../src/routes/auth.js';
import sessionRoutes from '../src/routes/sessions.js';
import bookingRoutes from '../src/routes/bookings.js';
import adminRoutes from '../src/routes/admin.js';

const ADMIN_AUTH = 'Basic ' + Buffer.from('admin:yoga2024').toString('base64');

describe('Full booking cycle integration', () => {
  let db, server, baseUrl;

  before(async () => {
    db = createTestDb();
    runMigrations(db);
    seedDefaults(db);

    const app = express();
    app.use(express.json());
    app.use('/auth', authRoutes(db));
    app.use('/', sessionRoutes(db));
    app.use('/', bookingRoutes(db));
    app.use('/admin', adminRoutes(db));

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
    db.close();
  });

  async function api(method, path, { body, headers } = {}) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${baseUrl}${path}`, opts);
    const data = await res.json();
    return { status: res.status, body: data };
  }

  let templateId, sessionId, token, bookingId;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  it('1. Admin creates a template', async () => {
    const res = await api('POST', '/admin/templates', {
      body: { name: 'Hatha Yoga', duration_minutes: 60, difficulty: 'beginner', default_capacity: 5 },
      headers: { Authorization: ADMIN_AUTH },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.ok);
    templateId = res.body.data.id;
    assert.ok(templateId);
  });

  it('2. Admin creates a session', async () => {
    const startTime = `${tomorrow} 10:00:00`;
    const res = await api('POST', '/admin/sessions', {
      body: { template_id: templateId, coach_name: 'Coach Zhang', start_time: startTime, capacity: 5 },
      headers: { Authorization: ADMIN_AUTH },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.ok);
    sessionId = res.body.data.id;
    assert.equal(res.body.data.capacity, 5);
    assert.equal(res.body.data.confirmed_count, 0);
  });

  it('3. Admin lists templates', async () => {
    const res = await api('GET', '/admin/templates', {
      headers: { Authorization: ADMIN_AUTH },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
  });

  it('4. Admin lists sessions', async () => {
    const res = await api('GET', `/admin/sessions?date=${tomorrow}`, {
      headers: { Authorization: ADMIN_AUTH },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
  });

  it('5. User logs in (dev mode)', async () => {
    const res = await api('POST', '/auth/login', {
      body: { code: 'test', openid: 'integration-test-user', nickname: 'Tester' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
    token = res.body.data.token;
    assert.ok(token);
  });

  it('6. User lists sessions by date', async () => {
    const res = await api('GET', `/sessions?date=${tomorrow}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.equal(res.body.data[0].id, sessionId);
  });

  it('7. User gets session detail', async () => {
    const res = await api('GET', `/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.template_name, 'Hatha Yoga');
  });

  it('8. User holds a spot', async () => {
    const res = await api('POST', `/sessions/${sessionId}/hold`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.ok);
    bookingId = res.body.data.id;
    assert.equal(res.body.data.status, 'HOLD');
  });

  it('9. User confirms the booking', async () => {
    const res = await api('POST', `/bookings/${bookingId}/confirm`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
    assert.equal(res.body.data.status, 'CONFIRMED');
  });

  it('10. User sees booking in my bookings', async () => {
    const res = await api('GET', '/me/bookings', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.equal(res.body.data[0].status, 'CONFIRMED');
  });

  it('11. Admin sees booking in session roster', async () => {
    const res = await api('GET', `/admin/sessions/${sessionId}/bookings`, {
      headers: { Authorization: ADMIN_AUTH },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.session.confirmed_count, 1);
    assert.equal(res.body.data.bookings.length, 1);
    assert.equal(res.body.data.bookings[0].nickname, 'Tester');
  });

  it('12. User cancels the booking', async () => {
    const res = await api('POST', `/bookings/${bookingId}/cancel`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
    assert.equal(res.body.data.status, 'CANCELLED');
  });

  it('13. Session confirmed_count rolled back to 0', async () => {
    const res = await api('GET', `/sessions/${sessionId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.confirmed_count, 0);
  });

  it('14. Unauthorized access is rejected', async () => {
    const res = await api('POST', `/sessions/${sessionId}/hold`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('15. Admin auth required for admin routes', async () => {
    const res = await api('GET', '/admin/templates');
    assert.equal(res.status, 401);
  });
});

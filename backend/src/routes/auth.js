import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { signToken } from '../middleware/auth.js';

const APPID = process.env.WX_APPID || '';
const SECRET = process.env.WX_SECRET || '';

/**
 * @param {import('better-sqlite3').Database} db
 */
export default function authRoutes(db) {
  const router = Router();

  /**
   * POST /auth/login
   * Body: { code: string }
   *
   * Production: calls WeChat code2session API to get openid.
   * Dev mode (no APPID configured): accepts { code: "test", openid: "xxx" } for testing.
   */
  router.post('/login', async (req, res) => {
    try {
      const { code, openid: devOpenid, nickname, avatar_url } = req.body;

      if (!code) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'code is required' } });
      }

      let openid;

      if (APPID && SECRET && code !== 'test') {
        // Production: call WeChat code2session
        const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data.errcode) {
          return res.status(400).json({
            ok: false,
            error: { code: 'WX_LOGIN_FAILED', message: data.errmsg || 'WeChat login failed' },
          });
        }
        openid = data.openid;
      } else {
        // Dev mode: use provided openid or generate from code
        openid = devOpenid || `dev-openid-${code}`;
      }

      // Find or create user
      let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);

      if (!user) {
        const userId = uuidv4();
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        db.prepare(`
          INSERT INTO users (id, openid, nickname, avatar_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, openid, nickname || '', avatar_url || '', now, now);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      }

      const token = signToken(user);

      return res.json({
        ok: true,
        data: { token, user: { id: user.id, nickname: user.nickname, avatar_url: user.avatar_url } },
      });
    } catch (e) {
      console.error('Login error:', e);
      return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Login failed' } });
    }
  });

  return router;
}

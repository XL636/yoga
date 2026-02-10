import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'yoga-dev-secret-change-in-production';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'yoga2024';

/**
 * Sign a JWT token for a user.
 * @param {{ id: string, openid: string }} user
 * @returns {string}
 */
export function signToken(user) {
  return jwt.sign({ userId: user.id, openid: user.openid }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Express middleware: require JWT auth.
 * Sets req.userId on success.
 */
export function requireUser(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}

/**
 * Express middleware: require Basic Auth for admin routes.
 */
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Admin auth required' } });
  }

  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const [user, pass] = decoded.split(':');

  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  }

  next();
}

export { JWT_SECRET };

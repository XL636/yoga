import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb } from './db/database.js';
import { runMigrations, seedDefaults } from './db/migrations.js';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import bookingRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// CORS for admin frontend (dev)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = getDb();
runMigrations(db);
seedDefaults(db);

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, data: { status: 'healthy' } });
});

// Routes
app.use('/auth', authRoutes(db));
app.use('/', sessionRoutes(db));
app.use('/', bookingRoutes(db));
app.use('/admin', adminRoutes(db));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Yoga booking API running on http://localhost:${PORT}`);
});

export default app;

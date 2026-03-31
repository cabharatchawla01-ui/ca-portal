require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, mobile apps) or known origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/client/auth', require('./routes/clientAuth'));
app.use('/api/ca/auth',     require('./routes/caAuth'));
app.use('/api/clients',     require('./routes/clients'));
app.use('/api/documents',   require('./routes/documents'));

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  CA Portal API running on port ${PORT}`);
  console.log(`    Health: http://localhost:${PORT}/health\n`);
});

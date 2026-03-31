const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query } = require('./config/db');
const { signCAToken, requireCA } = require('./middleware/auth');

const router = express.Router();

// ── POST /api/ca/auth/register ────────────────────────────────
const RegisterSchema = z.object({
  firmName: z.string().min(2),
  firmSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug: lowercase letters, numbers, hyphens only'),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { firmName, firmSlug, name, email, password } = parsed.data;

  try {
    // Check slug is available
    const existingFirm = await query('SELECT id FROM firms WHERE slug = $1', [firmSlug]);
    if (existingFirm.rows.length > 0) {
      return res.status(409).json({ error: 'Firm ID already taken. Choose another.' });
    }
    const existingUser = await query('SELECT id FROM ca_users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create firm + admin user in one transaction
    await query('BEGIN');
    const firmResult = await query(
      'INSERT INTO firms (name, slug) VALUES ($1, $2) RETURNING id, name, slug',
      [firmName, firmSlug]
    );
    const firm = firmResult.rows[0];

    const userResult = await query(
      `INSERT INTO ca_users (firm_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'admin') RETURNING id, name, email, role`,
      [firm.id, name, email, passwordHash]
    );
    await query('COMMIT');

    const caUser = { ...userResult.rows[0], firm_id: firm.id };
    const token = signCAToken(caUser);

    res.status(201).json({ token, caUser: { id: caUser.id, name, email, role: 'admin', firmId: firm.id, firmName: firm.name, firmSlug: firm.slug } });
  } catch (err) {
    await query('ROLLBACK').catch(() => {});
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/ca/auth/login ───────────────────────────────────
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { email, password } = parsed.data;

  try {
    const result = await query(
      `SELECT u.*, f.name as firm_name, f.slug as firm_slug
       FROM ca_users u JOIN firms f ON f.id = u.firm_id
       WHERE u.email = $1 AND u.is_active = TRUE`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signCAToken(user);
    res.json({
      token,
      caUser: { id: user.id, name: user.name, email: user.email, role: user.role, firmId: user.firm_id, firmName: user.firm_name, firmSlug: user.firm_slug },
    });
  } catch (err) {
    console.error('CA login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/ca/auth/me ───────────────────────────────────────
router.get('/me', requireCA, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, f.id as firm_id, f.name as firm_name, f.slug as firm_slug
       FROM ca_users u JOIN firms f ON f.id = u.firm_id WHERE u.id = $1`,
      [req.caUser.sub]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const u = result.rows[0];
    res.json({ id: u.id, name: u.name, email: u.email, role: u.role, firmId: u.firm_id, firmName: u.firm_name, firmSlug: u.firm_slug });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;

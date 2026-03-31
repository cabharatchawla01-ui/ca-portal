const express = require('express');
const { z } = require('zod');
const { query } = require('./config/db');
const { signClientToken } = require('./middleware/auth');

const router = express.Router();

// ── POST /api/client/auth/pan-login ──────────────────────────
// Client enters their PAN + firm slug → gets JWT if found
const Schema = z.object({
  pan:      z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format'),
  firmSlug: z.string().min(1),
});

router.post('/pan-login', async (req, res) => {
  // Normalise PAN to uppercase before validation
  const body = { ...req.body, pan: (req.body.pan || '').toUpperCase().trim() };
  const parsed = Schema.safeParse(body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { pan, firmSlug } = parsed.data;

  try {
    // Look up firm
    const firmResult = await query(
      'SELECT id, name FROM firms WHERE slug = $1',
      [firmSlug]
    );
    if (firmResult.rows.length === 0) {
      return res.status(404).json({ error: 'Firm not found' });
    }
    const firm = firmResult.rows[0];

    // Look up client by PAN within this firm
    const clientResult = await query(
      'SELECT * FROM clients WHERE pan = $1 AND firm_id = $2',
      [pan, firm.id]
    );

    if (clientResult.rows.length === 0) {
      // Generic message — don't reveal whether PAN exists
      return res.status(401).json({ error: 'No records found for this PAN. Please contact your CA.' });
    }

    const client = clientResult.rows[0];
    const token  = signClientToken(client);

    res.json({
      token,
      client: {
        id:       client.id,
        name:     client.name,
        pan:      client.pan,
        firmId:   client.firm_id,
        firmName: firm.name,
        firmSlug,
      },
    });
  } catch (err) {
    console.error('PAN login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/client/auth/me ───────────────────────────────────
const { requireClient } = require('./middleware/auth');

router.get('/me', requireClient, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, f.name as firm_name, f.slug as firm_slug
       FROM clients c JOIN firms f ON f.id = c.firm_id
       WHERE c.id = $1`,
      [req.client.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const c = result.rows[0];
    res.json({ id: c.id, name: c.name, pan: c.pan, firmName: c.firm_name, firmSlug: c.firm_slug });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;

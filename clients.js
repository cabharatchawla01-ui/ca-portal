const express = require('express');
const { z } = require('zod');
const { query } = require('./config/db');
const { requireCA } = require('./middleware/auth');

const router = express.Router();

const ClientSchema = z.object({
  name: z.string().min(1),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format'),
  mobile: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  gstin: z.string().optional(),
  notes: z.string().optional(),
});

// ── GET /api/clients ──────────────────────────────────────────
router.get('/', requireCA, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, COUNT(d.id) as doc_count
       FROM clients c
       LEFT JOIN documents d ON d.client_id = c.id AND d.is_active = TRUE
       WHERE c.firm_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.caUser.firmId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// ── POST /api/clients ─────────────────────────────────────────
router.post('/', requireCA, async (req, res) => {
  const body = { ...req.body, pan: (req.body.pan || '').toUpperCase().trim() };
  const parsed = ClientSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  try {
    const result = await query(
      `INSERT INTO clients (firm_id, name, pan, mobile, email, gstin, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.caUser.firmId, parsed.data.name, parsed.data.pan, parsed.data.mobile || null,
       parsed.data.email || null, parsed.data.gstin || null, parsed.data.notes || null, req.caUser.sub]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A client with this PAN already exists in your firm.' });
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// ── GET /api/clients/:id ──────────────────────────────────────
router.get('/:id', requireCA, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM clients WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.caUser.firmId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// ── PATCH /api/clients/:id ────────────────────────────────────
router.patch('/:id', requireCA, async (req, res) => {
  const body = { ...req.body, pan: (req.body.pan || '').toUpperCase().trim() };
  const parsed = ClientSchema.partial().safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const fields = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(parsed.data)) {
    const col = k === 'name' ? 'name' : k === 'pan' ? 'pan' : k === 'mobile' ? 'mobile' : k === 'email' ? 'email' : k === 'gstin' ? 'gstin' : k === 'notes' ? 'notes' : null;
    if (col) { fields.push(`${col} = $${i++}`); vals.push(v); }
  }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  try {
    vals.push(req.params.id, req.caUser.firmId);
    const result = await query(
      `UPDATE clients SET ${fields.join(', ')} WHERE id = $${i} AND firm_id = $${i + 1} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'PAN already in use by another client.' });
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// ── DELETE /api/clients/:id ───────────────────────────────────
router.delete('/:id', requireCA, async (req, res) => {
  try {
    await query('DELETE FROM clients WHERE id = $1 AND firm_id = $2', [req.params.id, req.caUser.firmId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

module.exports = router;

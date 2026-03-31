const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { query } = require('./config/db');
const { uploadFile, getSignedUrl, deleteFile } = require('./config/storage');
const { requireCA, requireClient } = require('./middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB

const VALID_CATEGORIES = ['itr', 'gst', 'balance_sheet', 'audit', 'tds', 'invoice', 'other'];

// ── CA: Upload a document ─────────────────────────────────────
// POST /api/documents   (multipart/form-data)
router.post('/', requireCA, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { clientId, title, description, category, financial_year } = req.body;
  if (!clientId || !title) return res.status(400).json({ error: 'clientId and title are required' });
  if (category && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });

  try {
    // Verify client belongs to this firm
    const clientResult = await query('SELECT id FROM clients WHERE id = $1 AND firm_id = $2', [clientId, req.caUser.firmId]);
    if (!clientResult.rows.length) return res.status(404).json({ error: 'Client not found' });

    const ext = req.file.originalname.split('.').pop();
    const storageKey = `${req.caUser.firmId}/${clientId}/${Date.now()}.${ext}`;

    await uploadFile(req.file.buffer, storageKey, req.file.mimetype);

    const result = await query(
      `INSERT INTO documents (firm_id, client_id, uploaded_by, title, description, category, financial_year, storage_key, file_name, file_size, mime_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.caUser.firmId, clientId, req.caUser.sub, title, description || null,
       category || 'other', financial_year || null, storageKey, req.file.originalname,
       req.file.size, req.file.mimetype]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// ── CA: List documents for a client ───────────────────────────
// GET /api/documents?clientId=xxx
router.get('/', requireCA, async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId query param required' });

  try {
    const result = await query(
      `SELECT d.*, u.name as uploaded_by_name
       FROM documents d
       LEFT JOIN ca_users u ON u.id = d.uploaded_by
       WHERE d.client_id = $1 AND d.firm_id = $2 AND d.is_active = TRUE
       ORDER BY d.uploaded_at DESC`,
      [clientId, req.caUser.firmId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ── CA: Delete a document ─────────────────────────────────────
router.delete('/:id', requireCA, async (req, res) => {
  try {
    const result = await query(
      'SELECT storage_key FROM documents WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.caUser.firmId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

    await deleteFile(result.rows[0].storage_key).catch(() => {});
    await query('UPDATE documents SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ── CLIENT: List their own documents ──────────────────────────
// GET /api/documents/my
router.get('/my', requireClient, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, description, category, financial_year, file_name, file_size, mime_type, uploaded_at
       FROM documents
       WHERE client_id = $1 AND firm_id = $2 AND is_active = TRUE
       ORDER BY uploaded_at DESC`,
      [req.client.sub, req.client.firmId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ── CLIENT: Get signed download URL ───────────────────────────
// GET /api/documents/:id/download
router.get('/:id/download', requireClient, async (req, res) => {
  try {
    const result = await query(
      'SELECT storage_key, file_name, mime_type FROM documents WHERE id = $1 AND client_id = $2 AND firm_id = $3 AND is_active = TRUE',
      [req.params.id, req.client.sub, req.client.firmId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });

    const { storage_key, file_name, mime_type } = result.rows[0];
    const url = await getSignedUrl(storage_key);

    // Log the download
    await query(
      'INSERT INTO download_logs (document_id, client_id, firm_id, ip_address) VALUES ($1,$2,$3,$4)',
      [req.params.id, req.client.sub, req.client.firmId, req.ip]
    ).catch(() => {});

    res.json({ url, fileName: file_name, mimeType: mime_type, expiresIn: 3600 });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
});

module.exports = router;

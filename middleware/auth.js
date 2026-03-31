const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// ── Sign tokens ───────────────────────────────────────────────

function signClientToken(client) {
  return jwt.sign(
    { sub: client.id, type: 'client', pan: client.pan, firmId: client.firm_id },
    SECRET,
    { expiresIn: process.env.JWT_CLIENT_EXPIRES_IN || '7d' }
  );
}

function signCAToken(caUser) {
  return jwt.sign(
    { sub: caUser.id, type: 'ca', firmId: caUser.firm_id, role: caUser.role },
    SECRET,
    { expiresIn: process.env.JWT_CA_EXPIRES_IN || '1d' }
  );
}

// ── Middleware ────────────────────────────────────────────────

function requireClient(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    if (payload.type !== 'client') throw new Error('Wrong token type');
    req.client = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireCA(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    if (payload.type !== 'ca') throw new Error('Wrong token type');
    req.caUser = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireCA(req, res, () => {
    if (req.caUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { signClientToken, signCAToken, requireClient, requireCA, requireAdmin };

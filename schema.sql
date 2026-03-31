-- ============================================================
-- CA Document Portal (PAN Auth) — Supabase / PostgreSQL Schema
-- Run this in your Supabase SQL editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Firms ────────────────────────────────────────────────────
CREATE TABLE firms (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  logo_url   TEXT,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── CA Users ─────────────────────────────────────────────────
CREATE TABLE ca_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id       UUID REFERENCES firms(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Clients ──────────────────────────────────────────────────
-- PAN is the unique identifier clients use to access their documents
CREATE TABLE clients (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id    UUID REFERENCES firms(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  pan        TEXT NOT NULL,              -- e.g. ABCDE1234F  ← login key
  mobile     TEXT,
  email      TEXT,
  gstin      TEXT,
  notes      TEXT,
  created_by UUID REFERENCES ca_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_id, pan)                   -- one PAN per firm
);

-- ── Documents ────────────────────────────────────────────────
CREATE TABLE documents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id        UUID REFERENCES firms(id) ON DELETE CASCADE,
  client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by    UUID REFERENCES ca_users(id),
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'other'
                 CHECK (category IN ('itr','gst','balance_sheet','audit','tds','invoice','other')),
  financial_year TEXT,
  storage_key    TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  file_size      BIGINT,
  mime_type      TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  uploaded_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Download Logs ─────────────────────────────────────────────
CREATE TABLE download_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  firm_id       UUID REFERENCES firms(id),
  ip_address    TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX idx_clients_firm       ON clients(firm_id);
CREATE INDEX idx_clients_pan        ON clients(pan);
CREATE INDEX idx_documents_client   ON documents(client_id);
CREATE INDEX idx_documents_firm     ON documents(firm_id);
CREATE INDEX idx_download_logs_doc  ON download_logs(document_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE firms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_logs  ENABLE ROW LEVEL SECURITY;

# CA Portal — Deployment Guide

## What's in this folder

```
backend/
├── server.js              ← Express app entry point
├── package.json
├── .env.example           ← Copy to .env and fill in values
├── schema.sql             ← Run this once in Supabase
├── config/
│   ├── db.js              ← PostgreSQL connection
│   └── storage.js         ← Supabase file storage
├── middleware/
│   └── auth.js            ← JWT sign/verify
├── routes/
│   ├── clientAuth.js      ← POST /api/client/auth/pan-login
│   ├── caAuth.js          ← POST /api/ca/auth/login & /register
│   ├── clients.js         ← CRUD /api/clients
│   └── documents.js       ← Upload, list, download /api/documents
├── client-portal.html     ← Client-facing page (updated to use real API)
└── ca-dashboard.html      ← CA dashboard (needs API URL update too)
```

---

## Step 1 — Supabase (Database + File Storage)

1. Go to https://supabase.com → New project
2. **SQL Editor** → paste contents of `schema.sql` → Run
3. **Storage** → Create a new bucket called `documents` → set to **Private**
4. Note down from **Settings → API**:
   - Project URL  →  `SUPABASE_URL`
   - `service_role` key  →  `SUPABASE_SERVICE_KEY`
5. Note down from **Settings → Database → Connection string (URI)**  →  `DATABASE_URL`

---

## Step 2 — Deploy Backend

### Option A: Railway (recommended, easiest)
1. Go to https://railway.app → New Project → Deploy from GitHub
2. Push this folder to a GitHub repo first
3. Add environment variables (from `.env.example`) in Railway dashboard
4. Railway auto-detects Node.js and runs `npm start`
5. Copy the deployed URL (e.g. `https://ca-portal.up.railway.app`)

### Option B: Render
1. Go to https://render.com → New Web Service → Connect GitHub repo
2. Build command: `npm install`
3. Start command: `node server.js`
4. Add environment variables in the Render dashboard
5. Copy the deployed URL

### Option C: Run locally first
```bash
cd backend
cp .env.example .env
# Fill in your Supabase values in .env
npm install
npm run dev
# API now running at http://localhost:3000
```

---

## Step 3 — Update Frontend HTML

In **both** `client-portal.html` and `ca-dashboard.html`, find this line near the top of the `<script>` block:

```js
const API = 'https://YOUR-BACKEND-URL.railway.app'; // ← change this!
```

Replace it with your actual deployed backend URL.

Then host the HTML files on:
- **Netlify**: drag & drop the two HTML files at https://netlify.com/drop
- **Vercel**: `npx vercel` in this folder
- Or just open them locally with Live Server in VS Code

---

## Step 4 — First CA registration

Once the backend is running, register your first CA account:

```bash
curl -X POST https://YOUR-BACKEND-URL/api/ca/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firmName": "Sharma & Associates",
    "firmSlug": "sharma-associates",
    "name": "Your Name",
    "email": "you@example.com",
    "password": "yourpassword123"
  }'
```

This creates the firm + admin CA account. Log in via `ca-dashboard.html`.

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/ca/auth/register` | None | Create firm + admin account |
| POST | `/api/ca/auth/login` | None | CA login → JWT |
| GET | `/api/ca/auth/me` | CA JWT | Get CA profile |
| POST | `/api/client/auth/pan-login` | None | Client login by PAN → JWT |
| GET | `/api/client/auth/me` | Client JWT | Get client profile |
| GET | `/api/clients` | CA JWT | List all clients |
| POST | `/api/clients` | CA JWT | Add a client |
| PATCH | `/api/clients/:id` | CA JWT | Update a client |
| DELETE | `/api/clients/:id` | CA JWT | Delete a client |
| POST | `/api/documents` | CA JWT | Upload document (multipart) |
| GET | `/api/documents?clientId=xxx` | CA JWT | List client docs |
| DELETE | `/api/documents/:id` | CA JWT | Delete document |
| GET | `/api/documents/my` | Client JWT | Client: list own docs |
| GET | `/api/documents/:id/download` | Client JWT | Client: get signed URL |
| GET | `/health` | None | Health check |

'use strict';
const crypto = require('crypto');
const express = require('express');
const { Client } = require('pg');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const SERVICE = 'qa-rw-express';
const VERSION = 'v2';
const started = new Date().toISOString();

function pgConfig(raw) {
  const u = new URL(raw);
  const mode = u.searchParams.get('sslmode');
  u.searchParams.delete('sslmode');
  const cfg = { connectionString: u.toString(), connectionTimeoutMillis: 8000 };
  if (mode && mode !== 'disable') cfg.ssl = { rejectUnauthorized: false };
  return cfg;
}

app.get('/', (req, res) => {
  res.json({ service: SERVICE, version: VERSION, port: PORT, port_from_env: Boolean(process.env.PORT), hostname: require('os').hostname(), started });
});

app.get('/health', (req, res) => {
  if (process.env.HEALTH_MODE === 'fail') return res.status(500).json({ ok: false, reason: 'HEALTH_MODE=fail' });
  res.json({ ok: true });
});

app.get('/fail', (req, res) => res.status(500).json({ ok: false, reason: 'always fails' }));

app.get('/env', (req, res) => {
  const name = String(req.query.name || '');
  if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(name)) return res.status(400).json({ error: 'name must be an env var name' });
  const v = process.env[name];
  res.json({ name, set: v !== undefined, length: v === undefined ? 0 : v.length, sha256_12: v === undefined ? null : crypto.createHash('sha256').update(v).digest('hex').slice(0, 12) });
});

app.get('/db', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(500).json({ ok: false, error: 'DATABASE_URL not set' });
  let client;
  try {
    client = new Client(pgConfig(process.env.DATABASE_URL));
    await client.connect();
    const r = await client.query('select 1 as one');
    res.json({ ok: true, result: r.rows[0].one, host: new URL(process.env.DATABASE_URL).hostname });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code || null });
  } finally {
    if (client) client.end().catch(() => {});
  }
});

app.get('/call', async (req, res) => {
  const target = String(req.query.target || process.env.CALL_URL || '');
  let u;
  try { u = new URL(target); } catch { return res.status(400).json({ ok: false, error: 'target must be a URL' }); }
  if (!u.hostname.endsWith('.internal')) return res.status(400).json({ ok: false, error: 'only *.internal hosts' });
  const t0 = Date.now();
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const body = await r.text();
    res.json({ ok: r.ok, target: u.toString(), status: r.status, ms: Date.now() - t0, body: body.slice(0, 500) });
  } catch (e) {
    res.status(502).json({ ok: false, target: u.toString(), error: String(e.cause ? e.cause.code || e.cause.message : e.message), ms: Date.now() - t0 });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`${SERVICE} ${VERSION} listening on 0.0.0.0:${PORT} (PORT env ${process.env.PORT ? 'set' : 'unset'})`));

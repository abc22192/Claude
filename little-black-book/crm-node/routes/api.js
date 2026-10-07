'use strict';
/**
 * Public API for Grok and other tools. Everything under /api/v1 needs the API_KEY, except the instructions file.
 * Every write goes through the same undoable path as the app.
 */
const express = require('express');
const { config } = require('../lib/config');
const auth = require('../lib/auth');
const db = require('../lib/db');
const fmt = require('../lib/format');
const people = require('../lib/people');
const ops = require('../lib/ops');
const dump = require('../lib/dump');
const followups = require('../lib/followups');
const changes = require('../lib/changes');

const router = express.Router();
const MIN_KEY = 20;
const hits = new Map();

function wrapApi(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      const friendly = err && !err.code && !(err instanceof TypeError) && !(err instanceof ReferenceError);
      if (!friendly) console.error('[api]', err && err.stack ? err.stack : err);
      res.status(friendly ? 400 : 500).json({ ok: false, error: friendly ? err.message : 'Server problem. Check the app health page.' });
    });
  };
}

function limiter(req, res, next) {
  const key = req.ip || 'x';
  const now = Date.now();
  const rec = hits.get(key) || { start: now, n: 0 };
  if (now - rec.start > 60000) { rec.start = now; rec.n = 0; }
  rec.n += 1;
  hits.set(key, rec);
  if (rec.n > 120) return res.status(429).json({ ok: false, error: 'Too many requests. Wait a minute.' });
  next();
}

function openapi(req) {
  const server = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  const personRef = { person: { type: 'string', description: 'Name or username of the person. Created if they are new.' }, person_id: { type: 'integer' } };
  return {
    openapi: '3.0.3',
    info: { title: 'Little Black Book', version: config.version, description: 'Private relationship memory. Send the key as: Authorization: Bearer YOUR_API_KEY.' },
    servers: [{ url: server + '/api/v1' }],
    components: { securitySchemes: { key: { type: 'http', scheme: 'bearer' } } },
    security: [{ key: [] }],
    paths: {
      '/people': { get: { summary: 'Search people', operationId: 'searchPeople', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'People with totals' } } } },
      '/people/{id}': { get: { summary: 'One person with purchases and notes', operationId: 'getPerson', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Person' } } } },
      '/dump': { post: { summary: 'Brain dump. Free text. It is sorted and only certain things are filed.', operationId: 'brainDump', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, person_id: { type: 'integer' } } } } } }, responses: { 200: { description: 'Receipt' } } } },
      '/bella-effect': { post: { summary: 'Record a Bella Effect purchase (level L1 to L4). Marks the person as knowing Bella Effect.', operationId: 'bellaEffect', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['level'], properties: { ...personRef, level: { type: 'string', enum: ['L1', 'L2', 'L3', 'L4'] }, amount: { type: 'number' }, platform: { type: 'string', enum: Object.keys(fmt.PLATFORMS) }, occurred_on: { type: 'string', format: 'date' } } } } } }, responses: { 200: { description: 'Sale saved' } } } },
      '/sales': { post: { summary: 'Record any purchase', operationId: 'addSale', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { ...personRef, title: { type: 'string' }, kind: { type: 'string', enum: Object.keys(fmt.KINDS) }, amount: { type: 'number' }, platform: { type: 'string', enum: Object.keys(fmt.PLATFORMS) }, occurred_on: { type: 'string', format: 'date' } } } } } }, responses: { 200: { description: 'Sale saved' } } } },
      '/checkins': { get: { summary: 'Who to reach out to now', operationId: 'checkins', responses: { 200: { description: 'Due check-ins' } } } },
      '/undo': { post: { summary: 'Undo the last change', operationId: 'undo', responses: { 200: { description: 'Result' } } } },
    },
  };
}

router.get('/v1/openapi.json', (req, res) => res.json(openapi(req)));

router.use('/v1', limiter, (req, res, next) => {
  if (!config.apiKey || config.apiKey.length < MIN_KEY) {
    return res.status(503).json({ ok: false, error: `The API is switched off. Set API_KEY (at least ${MIN_KEY} characters) in the app settings on Hostinger.` });
  }
  const header = req.get('authorization') || '';
  const given = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : (req.get('x-api-key') || '');
  if (!given || !auth.safeEqual(given, config.apiKey)) return res.status(401).json({ ok: false, error: 'Wrong or missing key.' });
  return require('../server').ensureDb().then((ok) => (ok ? next() : res.status(503).json({ ok: false, error: 'The database is not connected yet.' })));
});

async function findOrCreate(body, source) {
  if (body.person_id) {
    const p = await db.one('SELECT id, name FROM lbb_people WHERE id = ?', [Number(body.person_id)]);
    if (!p) throw new Error('No person with that person_id.');
    return { id: p.id, name: p.name, created: false };
  }
  const ref = String(body.person || '').trim();
  if (!ref) throw new Error('Say who: send person (a name) or person_id.');
  const hit = await people.matchExisting({ name: ref.replace(/^@/, ''), username: ref.startsWith('@') ? ref : undefined });
  if (hit) return { id: hit.id, name: hit.name, created: false };
  if (body.create_if_missing === false) throw new Error(`I do not know "${ref}". Add them first or allow creating.`);
  const made = await ops.createPerson({ name: ref.replace(/^@/, ''), source });
  return { id: made.id, name: ref, created: true };
}

router.get('/v1/people', wrapApi(async (req, res) => {
  const q = String(req.query.q || '').trim();
  let list = await people.allPeople();
  if (q) { const n = fmt.normName(q); list = list.filter((p) => fmt.normName(p.name).includes(n)); }
  list.sort((a, b) => b.total_spent - a.total_spent);
  res.json({ ok: true, people: list.slice(0, 50).map((p) => ({ id: p.id, name: p.name, status: p.status, tier: p.tier, total_spent: p.total_spent, purchases: p.purchases, last_purchase_on: p.last_purchase_on, platforms: p.platforms.map((x) => ({ platform: x.platform, username: x.username })) })) });
}));

router.get('/v1/people/:id(\\d+)', wrapApi(async (req, res) => {
  const p = await people.getPerson(Number(req.params.id));
  if (!p) return res.status(404).json({ ok: false, error: 'Not found.' });
  const sales = await db.query('SELECT id, title, kind, level, amount, platform, occurred_on, status FROM lbb_sessions WHERE person_id = ? ORDER BY occurred_on DESC LIMIT 50', [p.id]);
  const notes = await db.query('SELECT occurred_at, summary FROM lbb_interactions WHERE person_id = ? ORDER BY occurred_at DESC LIMIT 20', [p.id]);
  const { archived, created_at, updated_at, ...rest } = p;
  res.json({ ok: true, person: rest, sales, notes });
}));

router.post('/v1/dump', wrapApi(async (req, res) => {
  const out = await dump.receive({ text: req.body.text, source: 'api', personId: req.body.person_id ? Number(req.body.person_id) : undefined });
  if (out.duplicate) return res.json({ ok: true, duplicate: true });
  const rec = await dump.receiptFor(out.rawId);
  res.json({
    ok: true, id: out.rawId, filed_under: rec.person ? rec.person.name : null,
    filed: rec.proposal.items.filter((i) => i.state === 'applied').map((i) => i.label),
    needs_ok: rec.proposal.items.filter((i) => i.state === 'waiting').map((i) => i.label),
    suggestions: rec.proposal.nudges, undo_set_id: out.setId,
  });
}));

router.post('/v1/sales', wrapApi(async (req, res) => {
  const who = await findOrCreate(req.body, 'api');
  const out = await ops.addSale(who.id, { ...req.body, title: req.body.title }, 'api');
  res.json({ ok: true, person: who, sale_id: out.id, counted: out.status === 'confirmed', undo_set_id: out.setId });
}));

router.post('/v1/bella-effect', wrapApi(async (req, res) => {
  const level = String(req.body.level || '').toUpperCase();
  if (!/^L[1-4]$/.test(level)) throw new Error('level must be L1, L2, L3 or L4.');
  const who = await findOrCreate(req.body, 'api');
  const out = await ops.addSale(who.id, { ...req.body, kind: 'bella_effect', level, title: `Bella Effect ${level}` }, 'api');
  res.json({ ok: true, person: who, sale_id: out.id, counted: out.status === 'confirmed', undo_set_id: out.setId });
}));

router.get('/v1/checkins', wrapApi(async (req, res) => {
  const fu = await followups.collect();
  const row = (i) => ({ person_id: i.person.id, name: i.person.name, total_spent: i.person.total_spent, stage: i.label, last_purchase_on: i.anchor_on, days_overdue: i.overdue });
  res.json({ ok: true, due: fu.due.slice(0, 25).map(row), gone_quiet: fu.quiet.slice(0, 25).map(row) });
}));

router.post('/v1/undo', wrapApi(async (req, res) => {
  const r = await changes.undo(req.body && req.body.set_id ? Number(req.body.set_id) : undefined);
  res.json({ ok: r.ok, message: r.ok ? `Undid: ${r.label}` : r.reason });
}));

router.use((req, res) => res.status(404).json({ ok: false, error: 'No such API address.' }));

module.exports = { router };

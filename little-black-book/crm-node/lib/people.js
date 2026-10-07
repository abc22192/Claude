'use strict';
/**
 * people.js: reading people, their money, their platforms, and the settings.
 * Money always comes from confirmed purchases. It is never typed into a person.
 */
const db = require('./db');
const { normName } = require('./format');

const DEFAULT_SETTINGS = {
  checkin1_days: 30,
  checkin2_days: 90,
  quiet_after_days: 180,
  whale_min: 250,
  regular_min: 75,
  today_count: 5,
};

let settingsCache = null;
let settingsAt = 0;

async function getSettings(force) {
  if (!force && settingsCache && Date.now() - settingsAt < 15000) return settingsCache;
  const rows = await db.query('SELECT k, v FROM lbb_settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.k in DEFAULT_SETTINGS && r.v !== null && r.v !== '' && !Number.isNaN(Number(r.v))) out[r.k] = Number(r.v);
  }
  settingsCache = out;
  settingsAt = Date.now();
  return out;
}

async function saveSettings(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) continue;
    await db.query('INSERT INTO lbb_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(n)]);
  }
  return getSettings(true);
}

function tierFor(total, s) {
  if (total >= s.whale_min) return 'Whale';
  if (total >= s.regular_min) return 'Regular';
  if (total > 0) return 'Small';
  return 'No purchases yet';
}

const STATS_JOIN = `
  LEFT JOIN (
    SELECT person_id, SUM(amount) AS total, COUNT(*) AS cnt,
           MAX(occurred_on) AS last_on, MIN(occurred_on) AS first_on
    FROM lbb_sessions WHERE status = 'confirmed' GROUP BY person_id
  ) s ON s.person_id = p.id`;

const STATS_COLS = `p.*, COALESCE(s.total, 0) AS total_spent, COALESCE(s.cnt, 0) AS purchases,
  s.last_on AS last_purchase_on, s.first_on AS first_purchase_on`;

async function attachPlatforms(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const plats = await db.query('SELECT * FROM lbb_platforms WHERE person_id IN (?) ORDER BY is_primary DESC, id ASC', [ids]);
  const by = new Map();
  for (const pl of plats) {
    if (!by.has(pl.person_id)) by.set(pl.person_id, []);
    by.get(pl.person_id).push(pl);
  }
  for (const r of rows) r.platforms = by.get(r.id) || [];
  return rows;
}

/** Every active person with money stats. Fine for a few thousand people. */
async function allPeople(opts = {}) {
  const s = await getSettings();
  const rows = await db.query(
    `SELECT ${STATS_COLS} FROM lbb_people p ${STATS_JOIN} WHERE p.archived = ${opts.includeArchived ? 'p.archived' : '0'}`
  );
  for (const r of rows) r.tier = tierFor(r.total_spent, s);
  return attachPlatforms(rows);
}

async function getPerson(id) {
  const s = await getSettings();
  const rows = await db.query(`SELECT ${STATS_COLS} FROM lbb_people p ${STATS_JOIN} WHERE p.id = ?`, [id]);
  if (!rows[0]) return null;
  rows[0].tier = tierFor(rows[0].total_spent, s);
  await attachPlatforms(rows);
  return rows[0];
}

/** Name, username, Telegram id and email lookups used by search and the sorter. */
async function findIndex() {
  const people = await db.query('SELECT id, name, email FROM lbb_people WHERE archived = 0');
  const plats = await db.query('SELECT person_id, platform, username, external_id FROM lbb_platforms');
  const handles = new Map();
  const ids = new Map();
  for (const pl of plats) {
    if (pl.username) handles.set(String(pl.username).replace(/^@/, '').toLowerCase(), pl.person_id);
    if (pl.external_id) ids.set(String(pl.external_id), pl.person_id);
  }
  return { people, handles, ids };
}

/** Look for an existing person by exact normalized name, handle, id or email. Returns the person row or null. */
async function matchExisting({ name, username, externalId, email }) {
  const idx = await findIndex();
  if (externalId && idx.ids.has(String(externalId))) return idx.people.find((p) => p.id === idx.ids.get(String(externalId)));
  if (username) {
    const pid = idx.handles.get(String(username).replace(/^@/, '').toLowerCase());
    if (pid) return idx.people.find((p) => p.id === pid);
  }
  if (email) {
    const e = String(email).toLowerCase();
    const hit = idx.people.find((p) => p.email && p.email.toLowerCase() === e);
    if (hit) return hit;
  }
  if (name) {
    const n = normName(name);
    if (n) {
      const hits = idx.people.filter((p) => normName(p.name) === n);
      if (hits.length === 1) return hits[0];
    }
  }
  return null;
}

module.exports = {
  DEFAULT_SETTINGS, getSettings, saveSettings, tierFor, allPeople, getPerson,
  findIndex, matchExisting, attachPlatforms, STATS_JOIN, STATS_COLS,
};

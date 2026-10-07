'use strict';
/**
 * ops.js: the everyday writes (add a person, add a sale, edit a field, merge duplicates).
 * Routes, the Telegram bot and the API all call these, so every path behaves the same and is undoable.
 */
const db = require('./db');
const changes = require('./changes');
const fmt = require('./format');
const people = require('./people');

const EDITABLE = new Set([
  'name', 'status', 'tone', 'dream_night', 'fetishes', 'magic_words', 'likes_about_me', 'call_me', 'felt', 'plans',
  'notes', 'purchases_text', 'payment_method', 'payment_vibe', 'red_flags', 'green_flags', 'email', 'date_met', 'last_contact',
  'knows_audio', 'knows_bella_effect', 'knows_inhalers',
]);
const DATE_FIELDS = new Set(['date_met', 'last_contact']);
const FLAG_FIELDS = new Set(['knows_audio', 'knows_bella_effect', 'knows_inhalers']);

function cleanDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = fmt.parseDate(v);
  if (!d) throw new Error('That date is not valid. Use the format 2026-10-07.');
  return fmt.toStr(d);
}

function cleanAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new Error('That amount is not a valid number.');
  return Math.round(n * 100) / 100;
}

async function createPerson({ name, platform, username, source }) {
  const nm = String(name || '').trim();
  if (!nm) throw new Error('Give them a name first.');
  const existing = await people.matchExisting({ name: nm });
  const out = await changes.run(`Added person: ${nm}`, async (t) => {
    const id = await t.insert('lbb_people', { name: nm.slice(0, 190), status: 'new', source: source || 'app', date_met: fmt.today() });
    if (username || platform) {
      await t.insert('lbb_platforms', {
        person_id: id, platform: platform && fmt.PLATFORMS[platform] ? platform : 'other',
        username: username ? String(username).replace(/^@/, '').trim() : null, is_primary: 1, met_here: 1,
      });
    }
    return id;
  }, { source });
  return { id: out.result, setId: out.setId, possibleDuplicate: existing ? { id: existing.id, name: existing.name } : null };
}

async function setField(personId, field, value, source) {
  if (!EDITABLE.has(field)) throw new Error('That field cannot be edited.');
  const person = await db.one('SELECT name FROM lbb_people WHERE id = ?', [personId]);
  if (!person) throw new Error('Person not found.');
  let v = value;
  if (DATE_FIELDS.has(field)) v = cleanDate(value);
  else if (FLAG_FIELDS.has(field)) v = value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
  else {
    v = value === null || value === undefined ? null : String(value).replace(/\r\n/g, '\n').trim();
    if (v === '') v = null;
    if (field === 'name' && !v) throw new Error('A person needs a name.');
    if (field === 'status' && !fmt.STATUSES[v]) throw new Error('Status must be New, Active, VIP or Ghosted.');
    if (field === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('That does not look like an email address.');
    if (field === 'name') v = v.slice(0, 190);
  }
  const res = await changes.run(`Edited ${field.replace(/_/g, ' ')}: ${person.name}`, async (t) => {
    await t.update('lbb_people', personId, { [field]: v });
  }, { source });
  return { setId: res.setId, value: v };
}

async function addSale(personId, d, source) {
  const person = await db.one('SELECT name FROM lbb_people WHERE id = ?', [personId]);
  if (!person) throw new Error('Person not found.');
  const title = String(d.title || '').trim() || (fmt.KINDS[d.kind] || 'Purchase');
  const kind = fmt.KINDS[d.kind] ? d.kind : 'other';
  const amount = cleanAmount(d.amount);
  const level = kind === 'bella_effect' && /^L[1-4]$/i.test(String(d.level || '')) ? String(d.level).toUpperCase() : null;
  const status = amount === null ? 'unconfirmed' : (d.status === 'unconfirmed' ? 'unconfirmed' : 'confirmed');
  const reason = status === 'unconfirmed' ? (d.unconfirmed_reason || (amount === null ? 'No amount was given.' : null)) : null;
  const when = cleanDate(d.occurred_on) || fmt.today();
  const platform = d.platform && fmt.PLATFORMS[d.platform] ? d.platform : null;
  const res = await changes.run(`Sale: ${title} (${person.name})`, async (t) => {
    const id = await t.insert('lbb_sessions', {
      person_id: personId, title: title.slice(0, 250), kind, level, amount, platform, occurred_on: when,
      notes: d.notes ? String(d.notes).slice(0, 2000) : null, status, unconfirmed_reason: reason, source: source || 'app',
    });
    if (kind === 'bella_effect') await t.update('lbb_people', personId, { knows_bella_effect: 1 });
    if (kind === 'audio') await t.update('lbb_people', personId, { knows_audio: 1 });
    const cur = await t.get('lbb_people', personId);
    if (!cur.last_contact || when > cur.last_contact) await t.update('lbb_people', personId, { last_contact: when });
    return id;
  }, { source });
  return { id: res.result, setId: res.setId, status };
}

async function updateSale(id, d) {
  const s = await db.one('SELECT s.*, p.name AS person_name FROM lbb_sessions s JOIN lbb_people p ON p.id = s.person_id WHERE s.id = ?', [id]);
  if (!s) throw new Error('Sale not found.');
  const patch = {};
  if (d.title !== undefined) patch.title = String(d.title).trim().slice(0, 250) || s.title;
  if (d.kind !== undefined && fmt.KINDS[d.kind]) patch.kind = d.kind;
  if (d.amount !== undefined) patch.amount = cleanAmount(d.amount);
  if (d.occurred_on !== undefined) patch.occurred_on = cleanDate(d.occurred_on);
  if (d.platform !== undefined) patch.platform = d.platform && fmt.PLATFORMS[d.platform] ? d.platform : null;
  if (d.notes !== undefined) patch.notes = d.notes ? String(d.notes).slice(0, 2000) : null;
  if (d.level !== undefined) patch.level = /^L[1-4]$/i.test(String(d.level || '')) ? String(d.level).toUpperCase() : null;
  if (d.status !== undefined && ['confirmed', 'unconfirmed'].includes(d.status)) patch.status = d.status;
  const amount = patch.amount !== undefined ? patch.amount : s.amount;
  if (patch.status === 'confirmed' && amount === null) throw new Error('Add an amount before confirming.');
  if (patch.status === 'confirmed') patch.unconfirmed_reason = null;
  if (patch.status === 'unconfirmed' && !s.unconfirmed_reason) patch.unconfirmed_reason = 'You marked this as not sure.';
  const label = patch.status === 'confirmed' ? `Confirmed sale: ${s.title} (${s.person_name})` : `Edited sale: ${s.title} (${s.person_name})`;
  const res = await changes.run(label, async (t) => { await t.update('lbb_sessions', id, patch); });
  return { setId: res.setId, personId: s.person_id };
}

async function deleteSale(id) {
  const s = await db.one('SELECT s.title, p.name FROM lbb_sessions s JOIN lbb_people p ON p.id = s.person_id WHERE s.id = ?', [id]);
  if (!s) throw new Error('Sale not found.');
  const res = await changes.run(`Deleted sale: ${s.title} (${s.name})`, async (t) => { await t.delete('lbb_sessions', id); });
  return { setId: res.setId };
}

async function addInteraction(personId, { summary, platform, source }) {
  const person = await db.one('SELECT name FROM lbb_people WHERE id = ?', [personId]);
  if (!person) throw new Error('Person not found.');
  const text = String(summary || '').trim();
  if (!text) throw new Error('Write what happened first.');
  const res = await changes.run(`Note: ${person.name}`, async (t) => {
    await t.insert('lbb_interactions', {
      person_id: personId, summary: text.slice(0, 20000), platform: platform && fmt.PLATFORMS[platform] ? platform : null,
      source: source || 'app', occurred_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
    await t.update('lbb_people', personId, { last_contact: fmt.today() });
  }, { source });
  return { setId: res.setId };
}

async function addPlatform(personId, { platform, username }) {
  const person = await db.one('SELECT name FROM lbb_people WHERE id = ?', [personId]);
  if (!person) throw new Error('Person not found.');
  if (!fmt.PLATFORMS[platform]) throw new Error('Pick a platform from the list.');
  const uname = String(username || '').replace(/^@/, '').trim() || null;
  const res = await changes.run(`Added ${fmt.PLATFORMS[platform]}: ${person.name}`, async (t) => {
    const has = await t.q('SELECT COUNT(*) AS n FROM lbb_platforms WHERE person_id = ?', [personId]);
    await t.insert('lbb_platforms', { person_id: personId, platform, username: uname, is_primary: has[0].n ? 0 : 1, met_here: 0 });
  });
  return { setId: res.setId };
}

async function removePlatform(personId, platformId) {
  const row = await db.one('SELECT * FROM lbb_platforms WHERE id = ? AND person_id = ?', [platformId, personId]);
  if (!row) throw new Error('That platform is not on this person.');
  const res = await changes.run(`Removed ${fmt.PLATFORMS[row.platform] || row.platform}`, async (t) => { await t.delete('lbb_platforms', platformId); });
  return { setId: res.setId };
}

async function archivePerson(personId, archived) {
  const person = await db.one('SELECT name FROM lbb_people WHERE id = ?', [personId]);
  if (!person) throw new Error('Person not found.');
  const res = await changes.run(`${archived ? 'Archived' : 'Restored'}: ${person.name}`, async (t) => { await t.update('lbb_people', personId, { archived: archived ? 1 : 0 }); });
  return { setId: res.setId };
}

async function addExpense(d) {
  const name = String(d.name || '').trim();
  if (!name) throw new Error('Give the expense a name.');
  const amount = cleanAmount(d.amount);
  if (amount === null) throw new Error('Add the amount.');
  const cadence = ['monthly', 'yearly', 'one_time'].includes(d.cadence) ? d.cadence : 'monthly';
  const starts = cleanDate(d.starts_on) || fmt.today();
  const res = await changes.run(`Added expense: ${name}`, async (t) => {
    await t.insert('lbb_expenses', { name: name.slice(0, 190), amount, cadence, category: d.category ? String(d.category).slice(0, 60) : null, starts_on: starts, ends_on: cleanDate(d.ends_on) });
  });
  return { setId: res.setId };
}

async function removeExpense(id) {
  const row = await db.one('SELECT name FROM lbb_expenses WHERE id = ?', [id]);
  if (!row) throw new Error('Expense not found.');
  const res = await changes.run(`Removed expense: ${row.name}`, async (t) => { await t.delete('lbb_expenses', id); });
  return { setId: res.setId };
}

/** Groups of people who look like the same person: same name, same handle, or same email. */
async function findDuplicates() {
  const all = await db.query('SELECT id, name, email FROM lbb_people WHERE archived = 0');
  const plats = await db.query('SELECT person_id, platform, username FROM lbb_platforms WHERE username IS NOT NULL AND username <> \'\'');
  const groups = new Map();
  const add = (key, why, id) => {
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { why, ids: new Set() });
    groups.get(key).ids.add(id);
  };
  for (const p of all) {
    const n = fmt.normName(p.name);
    if (n.length >= 3) add('name:' + n, `Same name: ${p.name}`, p.id);
    if (p.email) add('email:' + p.email.toLowerCase(), `Same email: ${p.email}`, p.id);
  }
  for (const pl of plats) add(`h:${pl.platform}:${String(pl.username).replace(/^@/, '').toLowerCase()}`, `Same ${fmt.PLATFORMS[pl.platform] || pl.platform} username: @${String(pl.username).replace(/^@/, '')}`, pl.person_id);
  const out = [];
  const seen = new Set();
  for (const g of groups.values()) {
    if (g.ids.size < 2) continue;
    const key = [...g.ids].sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ why: g.why, ids: [...g.ids].sort((a, b) => a - b) });
  }
  return out;
}

const MERGE_TEXT = ['tone', 'dream_night', 'fetishes', 'magic_words', 'likes_about_me', 'call_me', 'felt', 'plans', 'notes', 'purchases_text', 'payment_method', 'payment_vibe', 'red_flags', 'green_flags', 'email'];

/** Move everything from `fromId` into `keepId`. Fill-only-empty, never overwrite. The extra person is archived, not deleted. */
async function mergePeople(keepId, fromId) {
  if (Number(keepId) === Number(fromId)) throw new Error('Pick two different people.');
  const keep = await db.one('SELECT * FROM lbb_people WHERE id = ?', [keepId]);
  const from = await db.one('SELECT * FROM lbb_people WHERE id = ?', [fromId]);
  if (!keep || !from) throw new Error('Person not found.');
  const res = await changes.run(`Merged ${from.name} into ${keep.name}`, async (t) => {
    const patch = {};
    for (const f of MERGE_TEXT) {
      if (!keep[f] && from[f]) patch[f] = from[f];
      else if (keep[f] && from[f] && f === 'notes' && !keep[f].includes(from[f])) patch[f] = `${keep[f]}\n\nFrom ${from.name}:\n${from[f]}`;
    }
    for (const f of FLAG_FIELDS) if (!keep[f] && from[f]) patch[f] = 1;
    if (!keep.date_met && from.date_met) patch.date_met = from.date_met;
    if (from.last_contact && (!keep.last_contact || from.last_contact > keep.last_contact)) patch.last_contact = from.last_contact;
    if (keep.status === 'new' && from.status && from.status !== 'new') patch.status = from.status;
    await t.update('lbb_people', keepId, patch);
    for (const tbl of ['lbb_sessions', 'lbb_interactions', 'lbb_followups', 'lbb_raw']) {
      const rows = await t.q('SELECT id FROM ?? WHERE person_id = ?', [tbl, fromId]);
      for (const r of rows) await t.update(tbl, r.id, { person_id: keepId });
    }
    const plats = await t.q('SELECT * FROM lbb_platforms WHERE person_id = ?', [fromId]);
    const mine = await t.q('SELECT platform, username FROM lbb_platforms WHERE person_id = ?', [keepId]);
    for (const pl of plats) {
      const dup = mine.some((m) => m.platform === pl.platform && String(m.username || '').toLowerCase() === String(pl.username || '').toLowerCase());
      if (dup) await t.delete('lbb_platforms', pl.id);
      else await t.update('lbb_platforms', pl.id, { person_id: keepId, is_primary: 0 });
    }
    await t.update('lbb_people', fromId, { archived: 1, notes: (from.notes ? from.notes + '\n\n' : '') + `Merged into ${keep.name} (#${keepId}).` });
  });
  return { setId: res.setId };
}

module.exports = {
  EDITABLE, createPerson, setField, addSale, updateSale, deleteSale, addInteraction, addPlatform, removePlatform,
  archivePerson, addExpense, removeExpense, findDuplicates, mergePeople, cleanAmount, cleanDate,
};

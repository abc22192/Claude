'use strict';
/**
 * dump.js: the brain dump pipeline.
 *   receive()      saves the words, sorts them, applies only what is certain, and returns a receipt
 *   approve/skip   Bella's answers on the items that waited
 *   assignPerson   picks the person when the sorter was not sure
 *   fixPerson      undoes a dump and files it again under a different person
 * Every step is one undoable change set.
 */
const db = require('./db');
const changes = require('./changes');
const fmt = require('./format');
const people = require('./people');
const sorter = require('./sorter');
const ai = require('./ai');

const SINGLE = sorter.SINGLE_VALUE;

function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function applyItem(t, personId, item, rawId, opts = {}) {
  const d = item.data;
  const today = fmt.today();
  switch (item.type) {
    case 'interaction': {
      await t.insert('lbb_interactions', { person_id: personId, summary: d.summary, platform: d.platform || null, source: opts.source || 'dump', raw_id: rawId, occurred_at: nowStamp() });
      await t.update('lbb_people', personId, { last_contact: today });
      return { state: 'applied' };
    }
    case 'field': {
      const person = await t.get('lbb_people', personId);
      const current = person[d.field] == null ? '' : String(person[d.field]);
      const incoming = String(d.value);
      if (!current.trim()) {
        await t.update('lbb_people', personId, { [d.field]: incoming });
        return { state: 'applied' };
      }
      if (current.toLowerCase().includes(incoming.toLowerCase())) return { state: 'dup', note: 'Already there.' };
      if (SINGLE.has(d.field) || d.mode === 'set') {
        if (!opts.force) return { state: 'waiting', note: `It currently says "${current.slice(0, 60)}". Replace it?`, conflict: true };
        await t.update('lbb_people', personId, { [d.field]: incoming });
        return { state: 'applied' };
      }
      await t.update('lbb_people', personId, { [d.field]: current + '\n' + incoming });
      return { state: 'applied' };
    }
    case 'flag': {
      await t.update('lbb_people', personId, { [d.field]: 1 });
      return { state: 'applied' };
    }
    case 'platform': {
      const uname = String(d.username).replace(/^@/, '');
      const mine = await t.q('SELECT id FROM lbb_platforms WHERE person_id = ? AND platform = ? AND LOWER(username) = ?', [personId, d.platform, uname.toLowerCase()]);
      if (mine.length) return { state: 'dup', note: 'Already on their card.' };
      const other = await t.q('SELECT p.id, p.name FROM lbb_platforms pl JOIN lbb_people p ON p.id = pl.person_id WHERE pl.platform = ? AND LOWER(pl.username) = ? AND pl.person_id <> ? LIMIT 1', [d.platform, uname.toLowerCase(), personId]);
      if (other.length && !opts.force) return { state: 'waiting', note: `@${uname} is already saved on ${other[0].name}. Add it here too?`, conflict: true };
      const has = await t.q('SELECT COUNT(*) AS n FROM lbb_platforms WHERE person_id = ?', [personId]);
      await t.insert('lbb_platforms', { person_id: personId, platform: d.platform, username: uname, is_primary: has[0].n ? 0 : 1, met_here: 0 });
      return { state: 'applied' };
    }
    case 'sale': {
      const same = await t.q(
        'SELECT id FROM lbb_sessions WHERE person_id = ? AND kind = ? AND occurred_on <=> ? AND amount <=> ? LIMIT 1',
        [personId, d.kind, d.occurred_on, d.amount]
      );
      if (same.length) return { state: 'dup', note: 'This sale was already logged.' };
      await t.insert('lbb_sessions', {
        person_id: personId, title: d.title, kind: d.kind, level: d.level || null, amount: d.amount, platform: d.platform || null,
        occurred_on: d.occurred_on, notes: d.notes || null, status: d.status, unconfirmed_reason: d.unconfirmed_reason || null,
        source: opts.source || 'dump', raw_id: rawId,
      });
      return { state: 'applied' };
    }
    case 'followup': {
      const same = await t.q("SELECT id FROM lbb_followups WHERE person_id = ? AND kind = 'custom' AND due_on = ? AND status = 'open' LIMIT 1", [personId, d.due_on]);
      if (same.length) return { state: 'dup', note: 'A reminder for that day exists.' };
      await t.insert('lbb_followups', { person_id: personId, kind: 'custom', due_on: d.due_on, reason: d.reason, status: 'open' });
      return { state: 'applied' };
    }
    default:
      return { state: 'skipped' };
  }
}

/** Keep the Telegram number ID on the card. It survives username changes, so he is still recognised later. */
async function rememberTelegramId(t, personId, externalId, username) {
  const uname = username ? String(username).replace(/^@/, '') : null;
  const rows = await t.q("SELECT * FROM lbb_platforms WHERE person_id = ? AND platform = 'telegram'", [personId]);
  const byId = rows.find((r) => String(r.external_id) === String(externalId));
  if (byId) {
    if (uname && String(byId.username || '').toLowerCase() !== uname.toLowerCase()) await t.update('lbb_platforms', byId.id, { username: uname });
    return;
  }
  const byName = uname ? rows.find((r) => String(r.username || '').toLowerCase() === uname.toLowerCase()) : null;
  if (byName) { await t.update('lbb_platforms', byName.id, { external_id: String(externalId) }); return; }
  await t.insert('lbb_platforms', { person_id: personId, platform: 'telegram', username: uname, external_id: String(externalId), is_primary: rows.length ? 0 : 1, met_here: 0 });
}

/** Find or create the person the proposal points at. Returns { id, created, name } or null if not certain. */
async function settlePerson(t, person, source) {
  if (person.conf !== 'high') return null;
  if (person.id) return { id: person.id, created: false, name: person.name };
  if (person.isNew && person.name) {
    const existing = await people.matchExisting({ name: person.name });
    if (existing) return { id: existing.id, created: false, name: existing.name };
    const id = await t.insert('lbb_people', { name: person.name.slice(0, 190), status: 'new', source: source || 'dump', date_met: fmt.today() });
    return { id, created: true, name: person.name };
  }
  return null;
}

async function loadPersonName(id) {
  const r = await db.one('SELECT name FROM lbb_people WHERE id = ?', [id]);
  return r ? r.name : null;
}

/** Turn a stored raw row into a receipt the screens can show. */
async function receiptFor(rawId) {
  const raw = await db.one('SELECT * FROM lbb_raw WHERE id = ?', [rawId]);
  if (!raw) return null;
  const proposal = raw.proposal ? JSON.parse(raw.proposal) : { person: {}, items: [], nudges: [] };
  const person = raw.person_id ? await db.one('SELECT id, name FROM lbb_people WHERE id = ?', [raw.person_id]) : null;
  const setRow = await db.one("SELECT set_id FROM lbb_changerows WHERE tbl = 'lbb_raw' AND row_id = ? AND op = 'insert' ORDER BY id DESC LIMIT 1", [rawId]);
  const top = await db.one("SELECT id FROM lbb_changesets WHERE state = 'applied' ORDER BY id DESC LIMIT 1");
  return {
    raw, proposal, person,
    setId: setRow ? setRow.set_id : null,
    canUndo: !!(setRow && top && top.id === setRow.set_id),
  };
}

/**
 * Save and sort a dump.
 * opts: { text, source, personId, externalId, username, forwarded, dedupeKey, newName }
 */
async function receive(opts) {
  const text = String(opts.text || '').trim();
  if (!text) throw new Error('There was nothing to save.');
  if (text.length > 20000) throw new Error('That dump is too long (over 20,000 characters). Split it up.');
  const source = opts.source || 'app';

  if (opts.dedupeKey) {
    const dup = await db.one('SELECT id FROM lbb_raw WHERE source = ? AND meta = ? LIMIT 1', [source, opts.dedupeKey]);
    if (dup) return { duplicate: true, rawId: dup.id };
  }

  const index = await people.findIndex();
  const proposal = sorter.sort(text, {
    today: fmt.today(), index, forcePersonId: opts.personId, forceNewName: opts.newName,
    externalId: opts.externalId, username: opts.username, forwarded: !!opts.forwarded, suggestName: opts.suggestName, source,
  });

  // Optional AI second opinion, always held for approval
  if (ai.enabled() && !opts.forwarded && proposal.person.conf !== 'low') {
    const have = proposal.items.filter((i) => i.type === 'field').map((i) => i.data.field);
    const extra = await ai.suggest(text, have);
    for (const e of extra) {
      if (!proposal.items.some((i) => i.type === 'field' && i.data.field === e.data.field && i.data.value === e.data.value)) {
        e.id = 'ai' + proposal.items.length;
        proposal.items.push(e);
      }
    }
  }

  proposal.origin = { externalId: opts.externalId || null, username: opts.username || null, forwarded: !!opts.forwarded };

  // The "how did they make you feel" style nudges only help when that card is still empty
  let label = 'Brain dump';
  const result = await changes.run('Brain dump', async (t) => {
    const settled = await settlePerson(t, proposal.person, source);
    const rawId = await t.insert('lbb_raw', {
      source, text, person_id: settled ? settled.id : null, status: settled ? 'filed' : 'needs_person',
      proposal: null, meta: opts.dedupeKey || null,
    });
    if (settled) {
      label = `Brain dump: ${settled.name}`;
      const cur = await t.get('lbb_people', settled.id);
      proposal.nudges = proposal.nudges.filter((n) => !(n === sorter.NUDGE_FELT && cur.felt) && !(n === sorter.NUDGE_TONE && cur.tone));
      proposal.person.id = settled.id;
      proposal.person.name = settled.name;
      proposal.person.created = settled.created;
      if (opts.externalId) await rememberTelegramId(t, settled.id, opts.externalId, opts.username);
      for (const item of proposal.items) {
        if (item.conf === 'high') {
          const r = await applyItem(t, settled.id, item, rawId, { source });
          item.state = r.state;
          if (r.note) item.note = r.note;
        } else {
          item.state = 'waiting';
        }
      }
    } else {
      for (const item of proposal.items) item.state = 'waiting';
    }
    await t.update('lbb_raw', rawId, { proposal: JSON.stringify(proposal), status: settled ? (proposal.items.some((i) => i.state === 'waiting') ? 'needs_ok' : 'filed') : 'needs_person' });
    return { rawId, personId: settled ? settled.id : null };
  }, { source });

  // changes.run labels were fixed at call time, so fix the label for people reading the history
  if (result.setId) await db.query('UPDATE lbb_changesets SET label = ? WHERE id = ?', [label.slice(0, 250), result.setId]);

  return { duplicate: false, rawId: result.result.rawId, personId: result.result.personId, setId: result.setId };
}

/** Apply some of the items that were waiting for her OK. */
async function approve(rawId, itemIds, opts = {}) {
  const rec = await receiptFor(rawId);
  if (!rec) throw new Error('That dump was not found.');
  if (!rec.raw.person_id) throw new Error('Pick who this is about first.');
  const proposal = rec.proposal;
  const wanted = new Set(itemIds);
  const name = rec.person ? rec.person.name : 'person';
  return changes.run(`Approved notes for ${name}`, async (t) => {
    let count = 0;
    for (const item of proposal.items) {
      if (!wanted.has(item.id) || item.state === 'applied') continue;
      const r = await applyItem(t, rec.raw.person_id, item, rawId, { force: true, source: rec.raw.source });
      item.state = r.state === 'waiting' ? 'waiting' : r.state;
      if (r.note) item.note = r.note;
      if (r.state === 'applied') count += 1;
    }
    const still = proposal.items.some((i) => i.state === 'waiting');
    await t.update('lbb_raw', rawId, { proposal: JSON.stringify(proposal), status: still ? 'needs_ok' : 'filed' });
    return count;
  });
}

async function skip(rawId, itemIds) {
  const rec = await receiptFor(rawId);
  if (!rec) throw new Error('That dump was not found.');
  const wanted = new Set(itemIds);
  return changes.run('Skipped suggestions', async (t) => {
    for (const item of rec.proposal.items) if (wanted.has(item.id) && item.state === 'waiting') item.state = 'skipped';
    const still = rec.proposal.items.some((i) => i.state === 'waiting');
    await t.update('lbb_raw', rawId, { proposal: JSON.stringify(rec.proposal), status: rec.raw.person_id ? (still ? 'needs_ok' : 'filed') : 'needs_person' });
  });
}

/** The sorter was not sure who it was about. Bella picks, or says it is someone new. */
async function assignPerson(rawId, { personId, newName }) {
  const rec = await receiptFor(rawId);
  if (!rec) throw new Error('That dump was not found.');
  if (rec.raw.person_id) throw new Error('That dump is already filed. Use "Wrong person?" to move it.');
  const text = rec.raw.text;
  const source = rec.raw.source;
  // Remove the waiting copy, then file it properly so it is one clean undoable step.
  await changes.run('Removed unfiled dump', async (t) => { await t.delete('lbb_raw', rawId); });
  const origin = rec.proposal.origin || {};
  const out = await receive({ text, source, personId: personId ? Number(personId) : undefined, newName: newName || undefined, forwarded: !!origin.forwarded, externalId: origin.externalId || undefined, username: origin.username || undefined });
  return out;
}

/** Wrong person: undo the dump (must be the latest change) and file the same words under someone else. */
async function fixPerson(rawId, { personId, newName }) {
  const rec = await receiptFor(rawId);
  if (!rec) throw new Error('That dump was not found.');
  if (!rec.canUndo) {
    return { ok: false, reason: 'Other changes were made after this dump. Press Undo until this one is on top, then try again.' };
  }
  const text = rec.raw.text;
  const source = rec.raw.source;
  const origin = rec.proposal.origin || {};
  const u = await changes.undo(rec.setId);
  if (!u.ok) return { ok: false, reason: u.reason };
  const out = await receive({ text, source, personId: personId ? Number(personId) : undefined, newName: newName || undefined, forwarded: !!origin.forwarded, externalId: origin.externalId || undefined, username: origin.username || undefined });
  return { ok: true, ...out };
}

async function unfiled(limit = 20) {
  return db.query("SELECT id, text, source, received_at, status FROM lbb_raw WHERE status IN ('needs_person','needs_ok') ORDER BY id DESC LIMIT ?", [limit]);
}

module.exports = { receive, approve, skip, assignPerson, fixPerson, receiptFor, unfiled, applyItem, loadPersonName };

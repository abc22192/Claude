'use strict';
/**
 * changes.js: the undo and redo engine.
 *
 * Every write the app makes goes through run(). It records the before and after of each row,
 * so any change set can be undone and redone, including a whole import or a merge.
 */
const db = require('./db');

const TABLES = new Set([
  'lbb_people', 'lbb_platforms', 'lbb_sessions', 'lbb_interactions',
  'lbb_raw', 'lbb_followups', 'lbb_expenses',
]);
const AUTO_COLUMNS = ['created_at', 'updated_at'];
const KEEP_SETS = 500;

function assertTable(table) {
  if (!TABLES.has(table)) throw new Error('Table not allowed: ' + table);
}

function strip(obj, keys) {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

function sameValue(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

/**
 * Run fn(t) in one transaction. t.insert / t.update / t.delete / t.get / t.q are the only way to write.
 * Returns { setId, result }. setId is null if nothing changed.
 */
async function run(label, fn, opts = {}) {
  return db.tx(async (q) => {
    const log = [];

    const t = {
      q,
      async get(table, id) {
        assertTable(table);
        const rows = await q('SELECT * FROM ?? WHERE id = ?', [table, id]);
        return rows[0] || null;
      },
      async insert(table, obj) {
        assertTable(table);
        const res = await q('INSERT INTO ?? SET ?', [table, obj]);
        const id = res.insertId;
        const after = (await q('SELECT * FROM ?? WHERE id = ?', [table, id]))[0];
        log.push({ tbl: table, row_id: id, op: 'insert', before: null, after });
        return id;
      },
      async update(table, id, patch) {
        assertTable(table);
        const before = (await q('SELECT * FROM ?? WHERE id = ?', [table, id]))[0];
        if (!before) throw new Error(`Row ${id} not found in ${table}`);
        const changed = {};
        for (const [k, v] of Object.entries(patch)) {
          if (!sameValue(before[k], v)) changed[k] = v;
        }
        if (!Object.keys(changed).length) return false;
        await q('UPDATE ?? SET ? WHERE id = ?', [table, changed, id]);
        const after = (await q('SELECT * FROM ?? WHERE id = ?', [table, id]))[0];
        log.push({ tbl: table, row_id: id, op: 'update', before, after });
        return true;
      },
      async delete(table, id) {
        assertTable(table);
        const before = (await q('SELECT * FROM ?? WHERE id = ?', [table, id]))[0];
        if (!before) return false;
        await q('DELETE FROM ?? WHERE id = ?', [table, id]);
        log.push({ tbl: table, row_id: id, op: 'delete', before, after: null });
        return true;
      },
    };

    const result = await fn(t);

    if (!log.length) return { setId: null, result };

    // A new change wipes the redo stack, like every editor.
    await q("UPDATE lbb_changesets SET state = 'discarded' WHERE state = 'undone'");
    const set = await q('INSERT INTO lbb_changesets (label, source) VALUES (?, ?)', [String(label).slice(0, 250), opts.source || null]);
    const setId = set.insertId;
    for (let i = 0; i < log.length; i += 200) {
      const chunk = log.slice(i, i + 200).map((r, j) => [
        setId, i + j, r.tbl, r.row_id, r.op,
        r.before ? JSON.stringify(r.before) : null,
        r.after ? JSON.stringify(r.after) : null,
      ]);
      await q('INSERT INTO lbb_changerows (set_id, ord, tbl, row_id, op, before_json, after_json) VALUES ?', [chunk]);
    }
    await prune(q);
    return { setId, result };
  });
}

async function prune(q) {
  const old = await q('SELECT id FROM lbb_changesets ORDER BY id DESC LIMIT 1 OFFSET ?', [KEEP_SETS]);
  if (old[0]) {
    await q('DELETE FROM lbb_changerows WHERE set_id <= ?', [old[0].id]);
    await q('DELETE FROM lbb_changesets WHERE id <= ?', [old[0].id]);
  }
}

async function insertExact(q, table, row) {
  await q('INSERT INTO ?? SET ?', [table, row]);
}

async function applyRows(q, rows, direction) {
  const ordered = direction === 'undo' ? [...rows].reverse() : rows;
  for (const r of ordered) {
    assertTable(r.tbl);
    const before = r.before_json ? JSON.parse(r.before_json) : null;
    const after = r.after_json ? JSON.parse(r.after_json) : null;
    if (direction === 'undo') {
      if (r.op === 'insert') await q('DELETE FROM ?? WHERE id = ?', [r.tbl, r.row_id]);
      else if (r.op === 'update') await q('UPDATE ?? SET ? WHERE id = ?', [r.tbl, strip(before, AUTO_COLUMNS), r.row_id]);
      else if (r.op === 'delete') await insertExact(q, r.tbl, before);
    } else {
      if (r.op === 'insert') await insertExact(q, r.tbl, after);
      else if (r.op === 'update') await q('UPDATE ?? SET ? WHERE id = ?', [r.tbl, strip(after, AUTO_COLUMNS), r.row_id]);
      else if (r.op === 'delete') await q('DELETE FROM ?? WHERE id = ?', [r.tbl, r.row_id]);
    }
  }
}

/** Undo the most recent applied change set. If expectedSetId is given it must be that one. */
async function undo(expectedSetId) {
  return db.tx(async (q) => {
    const set = (await q("SELECT * FROM lbb_changesets WHERE state = 'applied' ORDER BY id DESC LIMIT 1"))[0];
    if (!set) return { ok: false, reason: 'Nothing to undo.' };
    if (expectedSetId && Number(expectedSetId) !== set.id) {
      return { ok: false, reason: `A newer change was made after that one ("${set.label}"). Undo that first.` };
    }
    const rows = await q('SELECT * FROM lbb_changerows WHERE set_id = ? ORDER BY ord ASC', [set.id]);
    await applyRows(q, rows, 'undo');
    await q("UPDATE lbb_changesets SET state = 'undone', undone_at = NOW() WHERE id = ?", [set.id]);
    return { ok: true, label: set.label, setId: set.id };
  });
}

/** Redo the change that was undone most recently. */
async function redo() {
  return db.tx(async (q) => {
    const set = (await q("SELECT * FROM lbb_changesets WHERE state = 'undone' ORDER BY id ASC LIMIT 1"))[0];
    if (!set) return { ok: false, reason: 'Nothing to redo.' };
    const rows = await q('SELECT * FROM lbb_changerows WHERE set_id = ? ORDER BY ord ASC', [set.id]);
    await applyRows(q, rows, 'redo');
    await q("UPDATE lbb_changesets SET state = 'applied', undone_at = NULL WHERE id = ?", [set.id]);
    return { ok: true, label: set.label, setId: set.id };
  });
}

/** What the header buttons should say. */
async function peek() {
  const u = await db.one("SELECT id, label FROM lbb_changesets WHERE state = 'applied' ORDER BY id DESC LIMIT 1");
  const r = await db.one("SELECT id, label FROM lbb_changesets WHERE state = 'undone' ORDER BY id ASC LIMIT 1");
  return { undo: u, redo: r };
}

async function history(limit = 40) {
  return db.query(
    "SELECT id, label, source, state, created_at FROM lbb_changesets WHERE state IN ('applied','undone') ORDER BY id DESC LIMIT ?",
    [limit]
  );
}

module.exports = { run, undo, redo, peek, history };

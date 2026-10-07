'use strict';
/**
 * followups.js: the check-in system.
 *
 * Rule from Bella: reach out to people who already paid and trust her.
 * One month after their last purchase, and again at three months.
 * Check-ins are calculated, so they never pile up or go stale. Only her answers are stored.
 */
const db = require('./db');
const changes = require('./changes');
const fmt = require('./format');
const { getSettings, allPeople } = require('./people');

function latest(rows, kind, anchor, status) {
  return rows
    .filter((r) => r.kind === kind && r.anchor_on === anchor && (!status || r.status === status))
    .sort((a, b) => b.id - a.id)[0];
}

/**
 * Work out who needs a check-in. Returns { due, upcoming, quiet, custom }.
 * due: ready now, biggest spenders first. quiet: last purchase older than the "gone quiet" limit.
 */
async function collect(now) {
  const todayStr = now || fmt.today();
  const s = await getSettings();
  const people = await allPeople();
  const rows = await db.query("SELECT * FROM lbb_followups WHERE kind IN ('1_month','3_month','custom')");
  const byPerson = new Map();
  for (const r of rows) {
    if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, []);
    byPerson.get(r.person_id).push(r);
  }

  const due = [];
  const upcoming = [];
  const quiet = [];
  const custom = [];

  for (const p of people) {
    const mine = byPerson.get(p.id) || [];

    for (const r of mine) {
      if (r.kind === 'custom' && r.status === 'open') {
        custom.push({ person: p, kind: 'custom', followupId: r.id, due_on: r.due_on, reason: r.reason, overdue: fmt.daysBetween(r.due_on, todayStr) });
      }
    }

    const last = p.last_purchase_on;
    if (!last) continue;
    const handled = (kind) => mine.some((r) => r.kind === kind && r.anchor_on === last && ['done', 'skipped'].includes(r.status));
    let stage = null;
    if (!handled('1_month')) stage = '1_month';
    else if (!handled('3_month')) stage = '3_month';
    if (!stage) continue;

    const base = fmt.addDays(last, stage === '1_month' ? s.checkin1_days : s.checkin2_days);
    const snooze = latest(mine, stage, last, 'snoozed');
    const dueOn = snooze && snooze.due_on ? snooze.due_on : base;
    const item = {
      person: p,
      kind: stage,
      anchor_on: last,
      due_on: dueOn,
      overdue: fmt.daysBetween(dueOn, todayStr),
      sinceLast: fmt.daysBetween(last, todayStr),
      label: stage === '1_month' ? '1 month check-in' : '3 month check-in',
    };
    if (item.overdue >= 0) {
      if (item.sinceLast >= s.quiet_after_days) quiet.push(item);
      else due.push(item);
    } else if (item.overdue >= -21) {
      upcoming.push(item);
    }
  }

  const bySpend = (a, b) => b.person.total_spent - a.person.total_spent;
  due.sort(bySpend);
  quiet.sort(bySpend);
  upcoming.sort((a, b) => a.overdue - b.overdue);
  custom.sort((a, b) => (a.due_on || '').localeCompare(b.due_on || ''));
  return { due, upcoming, quiet, custom };
}

/** Record Bella's answer to a check-in. action is done, skip or snooze. */
async function act({ personId, stage, anchorOn, followupId, action, days }) {
  const todayStr = fmt.today();
  const label = { done: 'Checked in', skip: 'Skipped check-in', snooze: 'Snoozed check-in' }[action] || 'Check-in';
  const person = await db.one('SELECT name FROM lbb_people WHERE id = ?', [personId]);
  if (!person) throw new Error('Person not found');
  return changes.run(`${label}: ${person.name}`, async (t) => {
    if (stage === 'custom') {
      const row = await t.get('lbb_followups', followupId);
      if (!row) throw new Error('Follow-up not found');
      if (action === 'snooze') {
        await t.update('lbb_followups', followupId, { due_on: fmt.addDays(todayStr, days || 7) });
      } else {
        await t.update('lbb_followups', followupId, { status: action === 'done' ? 'done' : 'skipped', done_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
      }
    } else if (action === 'snooze') {
      await t.insert('lbb_followups', { person_id: personId, kind: stage, anchor_on: anchorOn, due_on: fmt.addDays(todayStr, days || 14), status: 'snoozed' });
    } else {
      await t.insert('lbb_followups', {
        person_id: personId, kind: stage, anchor_on: anchorOn, status: action === 'done' ? 'done' : 'skipped',
        done_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      if (action === 'done') {
        await t.insert('lbb_interactions', {
          person_id: personId,
          summary: stage === '1_month' ? 'Checked in (1 month).' : stage === '3_month' ? 'Checked in (3 months).' : 'Checked in.',
          source: 'checkin',
        });
        await t.update('lbb_people', personId, { last_contact: todayStr });
      }
    }
  });
}

module.exports = { collect, act };

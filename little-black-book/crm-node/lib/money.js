'use strict';
/** money.js: income, expenses and profit for any date range. */
const db = require('./db');
const fmt = require('./format');

const RANGES = {
  this_month: 'This month',
  last_month: 'Last month',
  last_90: 'Last 90 days',
  this_year: 'This year',
  all: 'All time',
};

async function resolveRange(key) {
  const t = fmt.today();
  const thisMonth = fmt.monthKey(t);
  if (key === 'last_month') {
    const m = fmt.addMonths(thisMonth, -1);
    return { key, from: m + '-01', to: fmt.addDays(thisMonth + '-01', -1), label: RANGES[key] };
  }
  if (key === 'last_90') return { key, from: fmt.addDays(t, -89), to: t, label: RANGES[key] };
  if (key === 'this_year') return { key, from: t.slice(0, 4) + '-01-01', to: t, label: RANGES[key] };
  if (key === 'all') {
    const r = await db.one("SELECT MIN(occurred_on) AS d FROM lbb_sessions WHERE status = 'confirmed'");
    return { key, from: (r && r.d) || t, to: t, label: RANGES[key] };
  }
  return { key: 'this_month', from: thisMonth + '-01', to: t, label: RANGES.this_month };
}

function monthsBetween(from, to) {
  const out = [];
  let k = fmt.monthKey(from);
  const end = fmt.monthKey(to);
  while (k <= end && out.length < 120) {
    out.push(k);
    k = fmt.addMonths(k, 1);
  }
  return out;
}

/** What one expense costs in a given month (YYYY-MM). */
function costInMonth(e, key) {
  const start = e.starts_on ? fmt.monthKey(e.starts_on) : null;
  const end = e.ends_on ? fmt.monthKey(e.ends_on) : null;
  if (e.cadence === 'one_time') return start === key ? Number(e.amount) : 0;
  if (start && key < start) return 0;
  if (end && key > end) return 0;
  return e.cadence === 'yearly' ? Number(e.amount) / 12 : Number(e.amount);
}

async function summary(rangeKey) {
  const range = await resolveRange(rangeKey);
  const sessions = await db.query(
    `SELECT s.*, p.name AS person_name FROM lbb_sessions s JOIN lbb_people p ON p.id = s.person_id
     WHERE s.status = 'confirmed' AND s.amount IS NOT NULL AND s.occurred_on BETWEEN ? AND ?`,
    [range.from, range.to]
  );
  const expenses = await db.query('SELECT * FROM lbb_expenses ORDER BY name');
  const months = monthsBetween(range.from, range.to).map((key) => ({ key, label: fmt.monthLabel(key), income: 0, expense: 0 }));
  const idx = new Map(months.map((m) => [m.key, m]));
  const byPlatform = new Map();
  const byKind = new Map();
  const byPerson = new Map();
  let income = 0;

  for (const s of sessions) {
    const amt = Number(s.amount);
    income += amt;
    const m = idx.get(fmt.monthKey(s.occurred_on));
    if (m) m.income += amt;
    const pl = s.platform ? (fmt.PLATFORMS[s.platform] || s.platform) : 'Not recorded';
    byPlatform.set(pl, (byPlatform.get(pl) || 0) + amt);
    const kd = fmt.KINDS[s.kind] || s.kind;
    byKind.set(kd, (byKind.get(kd) || 0) + amt);
    const cur = byPerson.get(s.person_id) || { id: s.person_id, name: s.person_name, total: 0, count: 0 };
    cur.total += amt;
    cur.count += 1;
    byPerson.set(s.person_id, cur);
  }

  let expense = 0;
  for (const m of months) {
    m.expense = expenses.reduce((sum, e) => sum + costInMonth(e, m.key), 0);
    expense += m.expense;
  }

  const sortDesc = (map) => [...map.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  return {
    range,
    income,
    expense,
    profit: income - expense,
    sales: sessions.length,
    months,
    byPlatform: sortDesc(byPlatform),
    byKind: sortDesc(byKind),
    top: [...byPerson.values()].sort((a, b) => b.total - a.total).slice(0, 10),
    expenses,
  };
}

/** Monthly running cost of everything recurring right now, for the Today tiles. */
async function monthlyBurn() {
  const key = fmt.monthKey(fmt.today());
  const expenses = await db.query('SELECT * FROM lbb_expenses');
  return expenses.reduce((sum, e) => sum + costInMonth(e, key), 0);
}

module.exports = { RANGES, summary, resolveRange, monthlyBurn, costInMonth };

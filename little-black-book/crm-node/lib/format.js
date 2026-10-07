'use strict';
/** format.js: money, dates and labels. Dates are plain 'YYYY-MM-DD' strings everywhere. */
const { config } = require('./config');

const PLATFORMS = {
  telegram: 'Telegram',
  onlyfans: 'OnlyFans',
  x: 'X',
  atw: 'AllThingsWorn',
  snapchat: 'Snapchat',
  instagram: 'Instagram',
  email: 'Email',
  other: 'Other',
};

const KINDS = {
  bella_effect: 'Bella Effect',
  custom: 'Custom',
  call: 'Call / live',
  clip: 'Clip / video',
  audio: 'Audio',
  vault: 'Vault / membership',
  worn: 'Worn items',
  tip: 'Tip',
  session: 'Session',
  other: 'Other',
};

const STATUSES = { new: 'New', active: 'Active', vip: 'VIP', ghosted: 'Ghosted' };

function money(n, cents) {
  const v = Number(n) || 0;
  const showCents = cents === true || (cents !== false && Math.abs(v - Math.round(v)) > 0.004);
  return '$' + v.toLocaleString('en-US', {
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

/** Today's date in her time zone as YYYY-MM-DD. */
function today(now) {
  const d = now || new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function toStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(s, n) {
  const d = parseDate(s);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateShort(s, withYear) {
  const d = parseDate(s);
  if (!d) return '';
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return withYear === false ? base : `${base}, ${d.getUTCFullYear()}`;
}

function monthKey(s) {
  return s ? String(s).slice(0, 7) : null;
}

function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "3 days ago", "in 2 weeks", "today". */
function ago(dateStr, from) {
  const n = daysBetween(dateStr, from || today());
  if (n === null) return '';
  if (n === 0) return 'today';
  const abs = Math.abs(n);
  let text;
  if (abs < 14) text = `${abs} day${abs === 1 ? '' : 's'}`;
  else if (abs < 60) text = `${Math.round(abs / 7)} weeks`;
  else if (abs < 700) text = `${Math.round(abs / 30)} months`;
  else text = `${(abs / 365).toFixed(1)} years`;
  return n > 0 ? `${text} ago` : `in ${text}`;
}

function normName(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
}

module.exports = {
  PLATFORMS, KINDS, STATUSES, money, today, parseDate, toStr, addDays, daysBetween,
  dateShort, monthKey, monthLabel, addMonths, ago, normName,
};

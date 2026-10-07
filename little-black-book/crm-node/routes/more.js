'use strict';
const express = require('express');
const db = require('../lib/db');
const fmt = require('../lib/format');
const { config, problems } = require('../lib/config');
const { html, page } = require('../lib/html');
const ui = require('../lib/ui');
const changes = require('../lib/changes');
const ops = require('../lib/ops');
const people = require('../lib/people');
const money = require('../lib/money');
const dump = require('../lib/dump');
const auth = require('../lib/auth');
const telegram = require('../lib/telegram');
const { wrap, act, back } = require('../lib/http');

const router = express.Router();

function safeBack(b, fallback) {
  return typeof b === 'string' && /^\/[a-z]*/.test(b) && !b.startsWith('//') ? b : fallback;
}

/* ---------- menu ---------- */

router.get('/more', wrap(async (req, res) => {
  const [conf, unf, dups] = await Promise.all([
    db.one("SELECT COUNT(*) AS n FROM lbb_sessions WHERE status = 'unconfirmed'"),
    dump.unfiled(50),
    ops.findDuplicates(),
  ]);
  const item = (href, title, sub, badge) => html`<a class="pcard" href="${href}"><div class="row between"><div><div class="pname">${title}</div><div class="pmeta">${sub}</div></div>${badge ? html`<span class="badge wine">${badge}</span>` : ''}</div></a>`;
  const body = html`
    <h1>More</h1>
    ${ui.flash(req)}
    ${item('/confirm', 'Needs your OK', 'Purchases I saved but am not counting until you check them', conf.n ? String(conf.n) : '')}
    ${item('/inbox', 'Brain dump inbox', 'Notes waiting for you to pick a person or approve', unf.length ? String(unf.length) : '')}
    ${item('/duplicates', 'Merge duplicates', 'Same person saved twice', dups.length ? String(dups.length) : '')}
    ${item('/history', 'Activity and undo', 'Every change, newest first')}
    ${item('/export', 'Download my data', 'Spreadsheets for Google Sheets and a full backup')}
    ${item('/settings', 'Settings and connections', 'Check-in timing, Telegram, Grok, health')}
    <form method="post" action="/logout" style="margin-top:16px"><button class="ghost block" type="submit">Log out</button></form>`;
  res.send(await page(req, res, { title: 'More', body, active: 'more' }));
}));

/* ---------- undo and redo ---------- */

async function undoRedo(req, res, which) {
  const result = which === 'undo' ? await changes.undo(req.body.set_id ? Number(req.body.set_id) : undefined) : await changes.redo();
  const p = await changes.peek();
  if (auth.wantsJson(req)) {
    return res.json({ ok: result.ok, message: result.ok ? `${which === 'undo' ? 'Undid' : 'Redid'}: ${result.label}` : result.reason, undo: p.undo ? p.undo.label : null, redo: p.redo ? p.redo.label : null });
  }
  const target = safeBack(req.body.back, req.get('referer') ? new URL(req.get('referer'), 'http://x').pathname : '/');
  const dest = /^\/dump\/\d+$/.test(target) || target === '/dump' ? '/' : target;
  return back(res, dest, result.ok ? `${which === 'undo' ? 'Undid' : 'Redid'}: ${result.label}` : null, result.ok ? null : result.reason);
}
router.post('/undo', wrap((req, res) => undoRedo(req, res, 'undo')));
router.post('/redo', wrap((req, res) => undoRedo(req, res, 'redo')));

/* ---------- needs your OK ---------- */

router.get('/confirm', wrap(async (req, res) => {
  const rows = await db.query(`SELECT s.*, p.name FROM lbb_sessions s JOIN lbb_people p ON p.id = s.person_id WHERE s.status = 'unconfirmed' ORDER BY s.occurred_on DESC, s.id DESC LIMIT 200`);
  const body = html`
    <h1>Needs your OK</h1>
    <p class="muted">These purchases are saved, but I am not adding them to anyone's total until you check them. That keeps your money numbers honest.</p>
    ${ui.flash(req)}
    ${rows.length ? rows.map((s) => html`<div class="card">
      <div class="row between"><div><a class="pname" style="font:600 1.3rem var(--serif)" href="/people/${s.person_id}">${s.name}</a>
        <div class="muted">${s.title} · ${fmt.dateShort(s.occurred_on)}${s.platform ? ' · ' + (fmt.PLATFORMS[s.platform] || s.platform) : ''}</div></div>
        <span class="badge wine">not counted</span></div>
      ${s.unconfirmed_reason ? html`<p class="small" style="color:var(--warn);margin:6px 0">${s.unconfirmed_reason}</p>` : ''}
      ${s.notes ? html`<p class="faint small">${s.notes}</p>` : ''}
      <form method="post" action="/people/sale/${s.id}"><input type="hidden" name="back" value="/confirm"><input type="hidden" name="status" value="confirmed">
        <div class="grid2"><div class="field"><label>Amount</label><input name="amount" inputmode="decimal" value="${s.amount === null ? '' : s.amount}" placeholder="$"></div>
        <div class="field"><label>Date</label><input type="date" name="occurred_on" value="${s.occurred_on || ''}"></div></div>
        <div class="row wrapit"><button type="submit">Yes, count it</button>
        <button class="danger" type="submit" formaction="/people/sale/${s.id}/delete">Not real, delete</button></div>
      </form></div>`) : ui.empty('Nothing waiting. Every purchase is counted.')}`;
  res.send(await page(req, res, { title: 'Needs your OK', body, active: 'more' }));
}));

router.get('/inbox', wrap(async (req, res) => {
  const rows = await dump.unfiled(60);
  const body = html`
    <h1>Brain dump inbox</h1>
    <p class="muted">Notes where I was not sure who it is about, or where I want your OK before filing something.</p>
    ${rows.length ? rows.map((r) => html`<a class="pcard" href="/dump/${r.id}"><div class="pname" style="font-size:1.05rem">${String(r.text).slice(0, 120)}${r.text.length > 120 ? '…' : ''}</div>
      <div class="pmeta">${r.status === 'needs_person' ? 'Who is this about?' : 'Waiting for your OK'} · ${fmt.ago(String(r.received_at).slice(0, 10))}</div></a>`) : ui.empty('Inbox is clear.')}`;
  res.send(await page(req, res, { title: 'Inbox', body, active: 'more' }));
}));

/* ---------- duplicates ---------- */

router.get('/duplicates', wrap(async (req, res) => {
  const groups = await ops.findDuplicates();
  const ids = [...new Set(groups.flatMap((g) => g.ids))];
  const byId = new Map();
  if (ids.length) {
    const all = await people.allPeople();
    for (const p of all) if (ids.includes(p.id)) byId.set(p.id, p);
  }
  const body = html`
    <h1>Merge duplicates</h1>
    <p class="muted">Same name, same username or same email. Merging moves purchases, notes and history into the one you keep. Nothing is deleted, and you can undo.</p>
    ${ui.flash(req)}
    ${groups.length ? groups.map((g) => html`<div class="card"><p class="muted small">${g.why}</p>
      ${g.ids.map((id) => byId.get(id)).filter(Boolean).map((p) => html`<div class="receipt-item"><div style="flex:1"><a href="/people/${p.id}"><b>${p.name}</b></a>
        <div class="faint small">${fmt.money(p.total_spent)} · ${p.purchases} purchases ${p.platforms.length ? '· ' + p.platforms.map((x) => fmt.PLATFORMS[x.platform]).join(', ') : ''}</div></div>
        <form method="post" action="/duplicates/merge" data-confirm="Keep ${p.name} and merge the others into it?"><input type="hidden" name="keep_id" value="${p.id}"><input type="hidden" name="ids" value="${g.ids.join(',')}"><button class="small" type="submit">Keep this one</button></form></div>`)}
    </div>`) : ui.empty('No duplicates found.')}`;
  res.send(await page(req, res, { title: 'Duplicates', body, active: 'more' }));
}));

router.post('/duplicates/merge', wrap(async (req, res) => {
  const keep = Number(req.body.keep_id);
  const others = String(req.body.ids || '').split(',').map(Number).filter((n) => n && n !== keep);
  const out = await act(req, res, '/duplicates', async () => {
    for (const id of others) await ops.mergePeople(keep, id);
    return true;
  });
  if (out) back(res, `/people/${keep}`, 'Merged. Use Undo at the top if that was a mistake.');
}));

/* ---------- history ---------- */

router.get('/history', wrap(async (req, res) => {
  const rows = await changes.history(60);
  const p = await changes.peek();
  const body = html`
    <h1>Activity</h1>
    <p class="muted">Every change, newest first. Undo goes back one step at a time. Redo brings it back.</p>
    ${ui.flash(req)}
    <div class="row wrapit" style="margin-bottom:12px">
      <form method="post" action="/undo"><input type="hidden" name="back" value="/history"><button ${p.undo ? '' : 'disabled'} type="submit">↶ Undo${p.undo ? ': ' + p.undo.label.slice(0, 30) : ''}</button></form>
      <form method="post" action="/redo"><input type="hidden" name="back" value="/history"><button class="ghost" ${p.redo ? '' : 'disabled'} type="submit">↷ Redo</button></form>
    </div>
    <div class="card"><div class="timeline">${rows.length ? rows.map((r) => html`<div class="item ${r.state === 'undone' ? '' : 'sale'}"><div class="when">${String(r.created_at).slice(0, 16).replace('T', ' ')}${r.source ? ' · ' + r.source : ''}${r.state === 'undone' ? ' · undone' : ''}</div>
      <div class="what" style="${r.state === 'undone' ? 'text-decoration:line-through;opacity:.6' : ''}">${r.label}</div></div>`) : ui.empty('No changes yet.')}</div></div>`;
  res.send(await page(req, res, { title: 'Activity', body, active: 'more' }));
}));

/* ---------- settings ---------- */

router.get('/settings', wrap(async (req, res) => {
  const s = await people.getSettings();
  const issues = problems();
  const tg = await telegram.status();
  const field = (key, label, hint) => html`<div class="field"><label>${label}</label><input name="${key}" inputmode="numeric" value="${s[key]}"><div class="faint small">${hint}</div></div>`;
  const body = html`
    <h1>Settings</h1>
    ${ui.flash(req)}
    <div class="card"><h3>Health</h3>
      ${issues.length ? issues.map((i) => html`<div class="flash warn">${i}</div>`) : html`<p><span class="tick">✓</span> Passwords and keys are set.</p>`}
      <p><span class="tick">✓</span> Database connected. Version ${config.version}.</p>
    </div>
    <form class="card" method="post" action="/settings">
      <h3>Check-ins and tiers</h3>
      ${field('checkin1_days', 'First check-in after (days)', 'Default 30. About one month after their last purchase.')}
      ${field('checkin2_days', 'Second check-in after (days)', 'Default 90. About three months.')}
      ${field('quiet_after_days', 'Call someone "gone quiet" after (days)', 'Default 180.')}
      ${field('whale_min', 'Whale starts at ($)', 'Total spent that makes someone a Whale.')}
      ${field('regular_min', 'Regular starts at ($)', 'Total spent that makes someone a Regular.')}
      ${field('today_count', 'People to show on Today', 'How many check-ins appear on your home screen.')}
      <button class="block" type="submit">Save settings</button>
    </form>
    <div class="card"><h3>Telegram bot</h3>
      <p>${tg.configured ? html`<span class="tick">✓</span> Bot token is set.` : html`<span class="ask">!</span> No bot token yet. Add <span class="kbd">TELEGRAM_BOT_TOKEN</span> in Hostinger.`}</p>
      <p>${tg.owner ? html`<span class="tick">✓</span> Locked to your Telegram account.` : html`<span class="ask">!</span> Not locked yet. Message your bot once and it replies with your ID. Put that in <span class="kbd">TELEGRAM_OWNER_ID</span>. Until then it saves nothing.`}</p>
      <p class="faint small">${tg.webhook ? 'Connected: ' + tg.webhook : 'Not connected to Telegram yet.'}</p>
      ${tg.configured && config.publicUrl ? html`<form method="post" action="/settings/telegram"><button class="small" type="submit">Connect or refresh the bot</button></form>` : html`<p class="faint small">Set <span class="kbd">PUBLIC_URL</span> (your site address) so the bot can connect.</p>`}
    </div>
    <div class="card"><h3>Grok and other apps</h3>
      <p>${config.apiKey ? html`<span class="tick">✓</span> API key is set.` : html`<span class="ask">!</span> No <span class="kbd">API_KEY</span> yet.`}</p>
      <p class="faint small">Address for Grok: <span class="kbd">${(config.publicUrl || 'https://your-site')}/api/v1</span>. The instructions file is at <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>.</p>
    </div>
    <div class="card"><h3>Optional smart sorting</h3>
      <p>${config.anthropicKey ? html`<span class="tick">✓</span> On. It only adds ideas that wait for your OK.` : html`Off. The sorter already works without it.`}</p></div>`;
  res.send(await page(req, res, { title: 'Settings', body, active: 'more' }));
}));

router.post('/settings', wrap(async (req, res) => {
  await people.saveSettings(req.body);
  back(res, '/settings', 'Saved.');
}));

router.post('/settings/telegram', wrap(async (req, res) => {
  const out = await telegram.setWebhook();
  back(res, '/settings', out.ok ? 'Connected.' : null, out.ok ? null : out.error);
}));

/* ---------- downloads ---------- */

function sendCsv(res, name, rows, headers) {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
  res.send('﻿' + ui.csv(rows, headers));
}

router.get('/export', wrap(async (req, res) => {
  const link = (href, title, sub) => html`<a class="pcard" href="${href}"><div class="pname" style="font-size:1.1rem">${title}</div><div class="pmeta">${sub}</div></a>`;
  const body = html`<h1>Download my data</h1>
    <p class="muted">Files open in Google Sheets. Money numbers match the app because they come from the same counted purchases.</p>
    ${link('/export/people.csv', 'Everyone', 'Name, status, email, totals, platforms')}
    ${link('/export/emails.csv', 'Email list', 'Only people with an email')}
    ${link('/export/sales.csv?r=all', 'All sales', 'Every counted purchase')}
    ${link('/export/months.csv?r=all', 'Month by month', 'Income, costs and profit')}
    ${link('/export/expenses.csv', 'Costs', 'Everything you pay for')}
    ${link('/export/backup.json', 'Full backup', 'Everything in one file, to keep somewhere safe')}`;
  res.send(await page(req, res, { title: 'Download', body, active: 'more' }));
}));

router.get('/export/people.csv', wrap(async (req, res) => {
  const list = await people.allPeople();
  const rows = list.map((p) => ({
    name: p.name, status: p.status, tier: p.tier, email: p.email || '', total_spent: p.total_spent, purchases: p.purchases,
    first_purchase: p.first_purchase_on || '', last_purchase: p.last_purchase_on || '', last_contact: p.last_contact || '',
    platforms: p.platforms.map((x) => `${fmt.PLATFORMS[x.platform] || x.platform}${x.username ? ' @' + x.username : ''}`).join('; '),
    tone: p.tone || '', fetishes: p.fetishes || '', how_they_made_me_feel: p.felt || '', dream_night: p.dream_night || '', notes: p.notes || '',
  }));
  sendCsv(res, 'little-black-book-people.csv', rows, Object.keys(rows[0] || { name: '' }));
}));

router.get('/export/emails.csv', wrap(async (req, res) => {
  const list = (await people.allPeople()).filter((p) => p.email);
  sendCsv(res, 'email-list.csv', list.map((p) => ({ name: p.name, email: p.email, total_spent: p.total_spent })), ['name', 'email', 'total_spent']);
}));

router.get('/export/sales.csv', wrap(async (req, res) => {
  const range = await money.resolveRange(money.RANGES[req.query.r] ? req.query.r : 'all');
  const rows = await db.query(`SELECT s.occurred_on AS date, p.name AS person, s.title, s.kind, s.level, s.platform, s.amount FROM lbb_sessions s JOIN lbb_people p ON p.id = s.person_id WHERE s.status = 'confirmed' AND s.occurred_on BETWEEN ? AND ? ORDER BY s.occurred_on`, [range.from, range.to]);
  sendCsv(res, 'sales.csv', rows.map((r) => ({ ...r, kind: fmt.KINDS[r.kind] || r.kind, platform: r.platform ? (fmt.PLATFORMS[r.platform] || r.platform) : '' })), ['date', 'person', 'title', 'kind', 'level', 'platform', 'amount']);
}));

router.get('/export/months.csv', wrap(async (req, res) => {
  const m = await money.summary(money.RANGES[req.query.r] ? req.query.r : 'all');
  sendCsv(res, 'month-by-month.csv', m.months.map((x) => ({ month: x.key, income: x.income.toFixed(2), costs: x.expense.toFixed(2), profit: (x.income - x.expense).toFixed(2) })), ['month', 'income', 'costs', 'profit']);
}));

router.get('/export/expenses.csv', wrap(async (req, res) => {
  const rows = await db.query('SELECT name, amount, cadence, category, starts_on, ends_on FROM lbb_expenses ORDER BY name');
  sendCsv(res, 'costs.csv', rows, ['name', 'amount', 'cadence', 'category', 'starts_on', 'ends_on']);
}));

router.get('/export/backup.json', wrap(async (req, res) => {
  const out = { exported_at: new Date().toISOString(), version: config.version };
  for (const t of ['lbb_people', 'lbb_platforms', 'lbb_sessions', 'lbb_interactions', 'lbb_followups', 'lbb_expenses', 'lbb_raw', 'lbb_settings']) {
    out[t] = await db.query('SELECT * FROM ??', [t]);
  }
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="little-black-book-backup.json"' });
  res.send(JSON.stringify(out, null, 1));
}));

module.exports = { router };

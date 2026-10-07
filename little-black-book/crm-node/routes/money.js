'use strict';
const express = require('express');
const db = require('../lib/db');
const fmt = require('../lib/format');
const { html, page } = require('../lib/html');
const ui = require('../lib/ui');
const money = require('../lib/money');
const ops = require('../lib/ops');
const { wrap, act, back } = require('../lib/http');

const router = express.Router();

function bars(months) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));
  return html`<div class="bars">${months.map((m) => html`<div class="bar" title="${m.label}: ${fmt.money(m.income)} in, ${fmt.money(m.expense)} out"><i style="height:${Math.max(1, Math.round((m.income / max) * 100))}%"></i><span>${m.label.slice(0, 3)}</span></div>
    <div class="bar cost"><i style="height:${Math.max(1, Math.round((m.expense / max) * 100))}%"></i><span></span></div>`)}</div>`;
}

function hbars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return rows.length ? rows.map((r) => html`<div class="hbar"><span>${r.label}</span><div class="track"><i style="width:${Math.round((r.total / max) * 100)}%"></i></div><b>${fmt.money(r.total)}</b></div>`) : ui.empty('Nothing here yet.');
}

router.get('/', wrap(async (req, res) => {
  const key = money.RANGES[req.query.r] ? req.query.r : 'this_month';
  const m = await money.summary(key);
  const rangeChips = Object.entries(money.RANGES).map(([k, label]) => ({ key: k, label }));
  const body = html`
    <h1>Money</h1>
    ${ui.flash(req)}
    ${ui.chips(rangeChips, key, '/money?r=')}
    <div class="grid4" style="margin-bottom:14px">
      ${ui.tile('Money in', fmt.money(m.income), `${m.sales} sale${m.sales === 1 ? '' : 's'}`, 'good')}
      ${ui.tile('Money out', fmt.money(m.expense), 'your costs')}
      ${ui.tile('Profit', fmt.money(m.profit), m.income ? Math.round((m.profit / m.income) * 100) + '% kept' : '', m.profit < 0 ? 'bad' : 'good')}
      ${ui.tile('Average sale', fmt.money(m.sales ? m.income / m.sales : 0))}
    </div>
    <div class="card"><h2>Month by month</h2>${bars(m.months)}<p class="faint small">Gold is money in. Rose is costs.</p></div>
    <div class="grid2" style="align-items:start">
      <div class="card"><h3>By platform</h3>${hbars(m.byPlatform)}</div>
      <div class="card"><h3>By service</h3>${hbars(m.byKind)}</div>
    </div>
    <div class="card"><h2>Top 10 spenders</h2>
      ${m.top.length ? html`<ol class="list" style="padding-left:0">${m.top.map((t, i) => html`<li><div class="row between"><a href="/people/${t.id}">${i + 1}. ${t.name}</a><b class="amount">${fmt.money(t.total)}</b></div></li>`)}</ol>` : ui.empty('No sales in this range.')}</div>
    <div class="card">
      <h2>Costs</h2>
      ${m.expenses.length ? html`<ul class="list">${m.expenses.map((e) => html`<li><div class="row between"><div><b>${e.name}</b><div class="faint small">${{ monthly: 'every month', yearly: 'every year', one_time: 'one time' }[e.cadence]}${e.category ? ' · ' + e.category : ''}</div></div>
        <div class="row"><b>${fmt.money(e.amount)}</b><form method="post" action="/money/expense/${e.id}/remove"><button class="small ghost" type="submit">×</button></form></div></div></li>`)}</ul>` : '<p class="muted small">No costs added yet. Add what you pay for so profit is real.</p>'}
      <details class="more"><summary>+ Add a cost</summary>
        <form method="post" action="/money/expense">
          <div class="grid2"><div class="field"><label>What</label><input name="name" placeholder="Hostinger, editor, ads" required></div>
          <div class="field"><label>Amount</label><input name="amount" inputmode="decimal" placeholder="$" required></div></div>
          <div class="grid2"><div class="field"><label>How often</label><select name="cadence"><option value="monthly">Every month</option><option value="yearly">Every year</option><option value="one_time">One time</option></select></div>
          <div class="field"><label>Starts</label><input type="date" name="starts_on" value="${fmt.today()}"></div></div>
          <div class="field"><label>Category (optional)</label><input name="category" placeholder="Software, marketing"></div>
          <button class="block" type="submit">Add cost</button>
        </form></details>
    </div>
    <div class="card"><h3>Download for Google Sheets</h3>
      <div class="row wrapit">
        <a class="btn ghost small" href="/export/sales.csv?r=${key}">Sales (${m.range.label})</a>
        <a class="btn ghost small" href="/export/months.csv?r=${key}">Month by month</a>
        <a class="btn ghost small" href="/export/expenses.csv">Costs</a>
      </div></div>`;
  res.send(await page(req, res, { title: 'Money', body, active: 'money' }));
}));

router.post('/expense', wrap(async (req, res) => {
  const out = await act(req, res, '/money', () => ops.addExpense(req.body));
  if (out) back(res, '/money', 'Cost added.');
}));

router.post('/expense/:id(\\d+)/remove', wrap(async (req, res) => {
  const out = await act(req, res, '/money', () => ops.removeExpense(Number(req.params.id)));
  if (out) back(res, '/money', 'Removed. Use Undo if that was a mistake.');
}));

module.exports = { router };

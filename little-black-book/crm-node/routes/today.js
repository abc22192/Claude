'use strict';
const express = require('express');
const db = require('../lib/db');
const fmt = require('../lib/format');
const { html, page } = require('../lib/html');
const ui = require('../lib/ui');
const people = require('../lib/people');
const followups = require('../lib/followups');
const money = require('../lib/money');
const dump = require('../lib/dump');
const { wrap } = require('../lib/http');

const router = express.Router();

router.get('/', wrap(async (req, res) => {
  const s = await people.getSettings();
  const [fu, thisMonth, toConfirm, unfiled, recent, total] = await Promise.all([
    followups.collect(),
    money.summary('this_month'),
    db.one("SELECT COUNT(*) AS n FROM lbb_sessions WHERE status = 'unconfirmed'"),
    dump.unfiled(10),
    db.query(`SELECT i.*, p.name FROM lbb_interactions i JOIN lbb_people p ON p.id = i.person_id ORDER BY i.occurred_at DESC, i.id DESC LIMIT 6`),
    db.one('SELECT COUNT(*) AS n FROM lbb_people WHERE archived = 0'),
  ]);
  const reachOut = fu.due.slice(0, s.today_count);
  const empty = total.n === 0;

  const body = html`
    <div class="hero">
      <h1>${greeting()}, Bella</h1>
      <p class="muted">${fmt.dateShort(fmt.today())}. ${empty ? 'Your book is empty. Start with a brain dump below.' : `${total.n} people in your book.`}</p>
    </div>
    ${ui.flash(req)}

    <div class="grid4" style="margin-bottom:14px">
      ${ui.tile('This month', fmt.money(thisMonth.income), `${thisMonth.sales} sale${thisMonth.sales === 1 ? '' : 's'}`, 'good', '/money')}
      ${ui.tile('Profit', fmt.money(thisMonth.profit), thisMonth.expense ? `after ${fmt.money(thisMonth.expense)} costs` : 'add costs on Money', thisMonth.profit < 0 ? 'bad' : '', '/money')}
      ${ui.tile('Check-ins due', String(fu.due.length), fu.quiet.length ? `${fu.quiet.length} gone quiet` : 'people who trust you', '', '/followups')}
      ${ui.tile('Needs your OK', String(toConfirm.n + unfiled.length), 'sales and notes waiting', toConfirm.n + unfiled.length ? 'bad' : '', toConfirm.n ? '/confirm' : '/inbox')}
    </div>

    <div class="card gold">
      <form method="post" action="/dump">
        <label for="d">Brain dump</label>
        <textarea id="d" name="text" placeholder="Type or talk. Who, what happened, what he paid, how it felt. I will sort it and show you what I filed." required></textarea>
        <div class="row between" style="margin-top:10px"><span class="faint small">Nothing is lost. I save your words first.</span><button type="submit">Save</button></div>
      </form>
    </div>

    ${unfiled.length ? html`<div class="card">
      <h2>Waiting on you</h2>
      <ul class="list">${unfiled.map((u) => html`<li><a href="/dump/${u.id}">${String(u.text).slice(0, 90)}${u.text.length > 90 ? '…' : ''}</a>
        <div class="faint small">${u.status === 'needs_person' ? 'I was not sure who this is about.' : 'I need your OK on a few things.'}</div></li>`)}</ul></div>` : ''}

    <div class="card">
      <div class="row between"><h2>Reach out today</h2><a href="/followups" class="small">See all</a></div>
      ${reachOut.length ? reachOut.map((i) => checkinCard(i)) : ui.empty(empty ? 'Add people and purchases and your check-ins appear here.' : 'No one is due. Nice.')}
    </div>

    ${recent.length ? html`<div class="card">
      <h2>Latest notes</h2>
      <div class="timeline">${recent.map((r) => html`<div class="item"><div class="when">${fmt.ago(String(r.occurred_at).slice(0, 10))}</div>
        <a href="/people/${r.person_id}"><b>${r.name}</b></a> <span class="muted">${String(r.summary).slice(0, 140)}</span></div>`)}</div></div>` : ''}
  `;
  res.send(await page(req, res, { title: 'Today', body, active: 'today' }));
}));

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: require('../lib/config').config.tz }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function checkinCard(i) {
  return html`<div class="pcard" style="cursor:default">
    <div class="row between">
      <div><a class="pname" href="/people/${i.person.id}">${i.person.name}</a>
        <div class="pmeta">${i.label}. Last bought ${fmt.ago(i.anchor_on)}${i.overdue > 0 ? ` (${i.overdue} days past)` : ''}</div></div>
      <div class="pmoney">${fmt.money(i.person.total_spent)}</div>
    </div>
    <div class="row wrapit" style="margin-top:10px">
      ${checkinForm(i, 'done', 'Reached out', '')}
      ${checkinForm(i, 'snooze', 'Later', 'ghost')}
      ${checkinForm(i, 'skip', 'Skip', 'ghost')}
    </div>
  </div>`;
}

function checkinForm(i, action, label, cls) {
  return html`<form method="post" action="/followups/act" data-ajax-remove>
    <input type="hidden" name="person_id" value="${i.person.id}">
    <input type="hidden" name="stage" value="${i.kind}">
    <input type="hidden" name="anchor_on" value="${i.anchor_on || ''}">
    <input type="hidden" name="followup_id" value="${i.followupId || ''}">
    <input type="hidden" name="action" value="${action}">
    <button class="small ${cls}" type="submit">${label}</button></form>`;
}

module.exports = { router, checkinCard };

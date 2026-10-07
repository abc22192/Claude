'use strict';
const express = require('express');
const fmt = require('../lib/format');
const { html, page } = require('../lib/html');
const ui = require('../lib/ui');
const followups = require('../lib/followups');
const people = require('../lib/people');
const auth = require('../lib/auth');
const { wrap, act, back } = require('../lib/http');
const { checkinCard } = require('./today');

const router = express.Router();

const TABS = [
  { key: 'due', label: 'Due now' },
  { key: 'soon', label: 'Coming up' },
  { key: 'quiet', label: 'Gone quiet' },
  { key: 'reminders', label: 'My reminders' },
];

router.get('/', wrap(async (req, res) => {
  const s = await people.getSettings();
  const fu = await followups.collect();
  const tab = TABS.some((t) => t.key === req.query.tab) ? req.query.tab : 'due';
  const tabs = TABS.map((t) => ({ ...t, label: t.label + ` (${{ due: fu.due.length, soon: fu.upcoming.length, quiet: fu.quiet.length, reminders: fu.custom.length }[t.key]})` }));

  let list;
  if (tab === 'due') {
    list = fu.due.length ? fu.due.map(checkinCard) : ui.empty('No one is due right now.');
  } else if (tab === 'soon') {
    list = fu.upcoming.length ? fu.upcoming.map((i) => html`<a class="pcard" href="/people/${i.person.id}"><div class="row between">
      <div><div class="pname">${i.person.name}</div><div class="pmeta">${i.label} ${fmt.ago(i.due_on)}</div></div>
      <div class="pmoney">${fmt.money(i.person.total_spent)}</div></div></a>`) : ui.empty('Nothing in the next three weeks.');
  } else if (tab === 'quiet') {
    list = html`<p class="muted small">Bought before, but nothing in ${s.quiet_after_days}+ days. These are your best win-backs, biggest spenders first.</p>
      ${fu.quiet.length ? fu.quiet.map(checkinCard) : ui.empty('No one has gone quiet.')}`;
  } else {
    list = fu.custom.length ? fu.custom.map((c) => html`<div class="pcard" style="cursor:default"><div class="row between">
      <div><a class="pname" href="/people/${c.person.id}">${c.person.name}</a><div class="pmeta">${fmt.dateShort(c.due_on)}${c.overdue > 0 ? ' (overdue)' : ''}: ${c.reason || 'Reminder'}</div></div></div>
      <div class="row wrapit" style="margin-top:10px">
        <form method="post" action="/followups/act" data-ajax-remove><input type="hidden" name="person_id" value="${c.person.id}"><input type="hidden" name="stage" value="custom"><input type="hidden" name="followup_id" value="${c.followupId}"><input type="hidden" name="action" value="done"><button class="small" type="submit">Done</button></form>
        <form method="post" action="/followups/act" data-ajax-remove><input type="hidden" name="person_id" value="${c.person.id}"><input type="hidden" name="stage" value="custom"><input type="hidden" name="followup_id" value="${c.followupId}"><input type="hidden" name="action" value="snooze"><button class="small ghost" type="submit">Next week</button></form>
      </div></div>`) : ui.empty('No reminders. Add one from any person.');
  }

  const body = html`
    <h1>Check-ins</h1>
    <p class="muted">Reach out to people who already paid and trust you. A month after their last purchase, and again at three months.</p>
    ${ui.flash(req)}
    ${ui.chips(tabs, tab, '/followups?tab=')}
    ${list}`;
  res.send(await page(req, res, { title: 'Check-ins', body, active: 'followups' }));
}));

router.post('/act', wrap(async (req, res) => {
  const b = req.body;
  const out = await act(req, res, '/followups', () => followups.act({
    personId: Number(b.person_id), stage: b.stage, anchorOn: b.anchor_on || null,
    followupId: b.followup_id ? Number(b.followup_id) : null, action: b.action, days: b.action === 'snooze' ? (b.stage === 'custom' ? 7 : 14) : undefined,
  }));
  if (!out) return;
  if (auth.wantsJson(req)) return res.json({ ok: true, setId: out.setId });
  back(res, req.get('referer') && req.get('referer').includes('/people/') ? `/people/${b.person_id}` : '/followups', { done: 'Marked as reached out.', skip: 'Skipped.', snooze: 'Snoozed. It will come back.' }[b.action]);
}));

module.exports = { router };

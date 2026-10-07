'use strict';
const express = require('express');
const db = require('../lib/db');
const fmt = require('../lib/format');
const { html, page } = require('../lib/html');
const ui = require('../lib/ui');
const dump = require('../lib/dump');
const people = require('../lib/people');
const { wrap, act, back } = require('../lib/http');

const router = express.Router();

async function peopleOptions(exceptId) {
  const rows = await db.query('SELECT id, name FROM lbb_people WHERE archived = 0 ORDER BY name LIMIT 1500');
  return rows.filter((r) => r.id !== exceptId).map((r) => html`<option value="${r.id}">${r.name}</option>`);
}

router.get('/', wrap(async (req, res) => {
  const personId = Number(req.query.person) || null;
  const person = personId ? await db.one('SELECT id, name FROM lbb_people WHERE id = ?', [personId]) : null;
  const recent = await db.query("SELECT r.id, r.text, r.status, r.received_at, p.name FROM lbb_raw r LEFT JOIN lbb_people p ON p.id = r.person_id ORDER BY r.id DESC LIMIT 8");
  const body = html`
    <h1>Brain dump</h1>
    <p class="muted">${person ? html`About <b>${person.name}</b>. ` : ''}Say it however it comes out. I save your exact words first, then sort. I only file what I am sure about and ask you about the rest.</p>
    ${ui.flash(req)}
    <form class="card gold" method="post" action="/dump">
      ${person ? html`<input type="hidden" name="person_id" value="${person.id}">` : ''}
      <textarea name="text" style="min-height:200px" placeholder="${person ? 'What happened with ' + person.name + '?' : 'Example: Mike bought Bella Effect L2 for $150 on Telegram yesterday. Dream night: ... Follow up in 2 weeks.'}" required autofocus></textarea>
      <button class="block" type="submit" style="margin-top:12px">Save and sort</button>
    </form>
    ${recent.length ? html`<div class="card"><h3>Recent dumps</h3><ul class="list">${recent.map((r) => html`<li><a href="/dump/${r.id}">${String(r.text).slice(0, 80)}${r.text.length > 80 ? '…' : ''}</a>
      <div class="faint small">${r.name ? 'Filed under ' + r.name : 'Not filed yet'} · ${fmt.ago(String(r.received_at).slice(0, 10))}</div></li>`)}</ul></div>` : ''}`;
  res.send(await page(req, res, { title: 'Brain dump', body, active: 'today' }));
}));

router.post('/', wrap(async (req, res) => {
  const out = await act(req, res, '/dump', () => dump.receive({ text: req.body.text, source: 'app', personId: req.body.person_id ? Number(req.body.person_id) : undefined }));
  if (!out) return;
  if (req.headers.accept && req.headers.accept.includes('application/json')) return res.json({ ok: true, rawId: out.rawId });
  res.redirect(`/dump/${out.rawId}`);
}));

router.get('/:id(\\d+)', wrap(async (req, res) => {
  const rec = await dump.receiptFor(Number(req.params.id));
  if (!rec) return res.status(404).send(await page(req, res, { title: 'Not found', body: ui.empty('That dump is not here. It may have been undone.'), active: 'today' }));
  const { raw, proposal, person } = rec;
  const applied = proposal.items.filter((i) => i.state === 'applied');
  const dups = proposal.items.filter((i) => i.state === 'dup');
  const waiting = proposal.items.filter((i) => i.state === 'waiting');
  const opts = await peopleOptions(person ? person.id : null);
  const find = String(req.query.find || '').trim();
  const found = find ? (await people.search(find)).slice(0, 12) : null;

  const body = html`
    <div class="row between wrapit"><h1>${person ? 'Saved' : 'Saved, but who is it?'}</h1>
      ${rec.canUndo ? html`<form method="post" action="/undo"><input type="hidden" name="set_id" value="${rec.setId}"><input type="hidden" name="back" value="/dump"><button class="ghost small" type="submit">↶ Undo this</button></form>` : ''}</div>
    ${ui.flash(req)}

    ${person ? html`<div class="card gold">
      <div class="row between"><div><div class="muted small">Filed under</div><a class="pname" style="font:600 1.6rem var(--serif)" href="/people/${person.id}">${person.name}</a>
        ${proposal.person.created ? html`<span class="badge good">new person</span>` : ''}</div>
        <a class="btn small" href="/people/${person.id}">Open ${person.name.split(' ')[0]}</a></div>
      <p class="faint small" style="margin:8px 0 0">${proposal.person.reason || ''}</p>
    </div>` : html`<div class="card gold">
      <h2>Who is this about?</h2>
      <p class="muted">${proposal.person.reason || ''} Your words are saved. Nothing else is filed until you pick.</p>
      ${proposal.person.candidates && proposal.person.candidates.length ? html`<div class="chips">${proposal.person.candidates.map((c) => html`<form method="post" action="/dump/${raw.id}/person"><input type="hidden" name="person_id" value="${c.id}"><button class="chip" type="submit">${c.name}</button></form>`)}</div>` : ''}
      ${proposal.person.isNew && proposal.person.name ? html`<form method="post" action="/dump/${raw.id}/person"><input type="hidden" name="new_name" value="${proposal.person.name}"><button class="block" type="submit">Yes, ${proposal.person.name} is new. Add them.</button></form>` : ''}
      <form method="post" action="/dump/${raw.id}/person" style="margin-top:12px"><div class="field"><label>Pick someone in your book</label>
        <select name="person_id"><option value="">Choose…</option>${opts}</select></div><button class="small" type="submit">File it there</button></form>
      <form method="post" action="/dump/${raw.id}/person" style="margin-top:12px"><div class="field"><label>Or add a new person</label><input name="new_name" placeholder="Name or username"></div><button class="small ghost" type="submit">Add and file</button></form>
    </div>`}

    ${!person || proposal.person.created ? html`<div class="card"><h3>Is he someone you already know?</h3>
      <p class="muted small">New account, deleted account, new name? Search what you remember: a name, a username, a word from your notes.</p>
      <form method="get" action="/dump/${raw.id}"><div class="searchbar"><input name="find" value="${find}" placeholder="boots, works nights, Mike..."><button type="submit">Find</button></div></form>
      ${found ? (found.length ? found.map((f) => html`<div class="receipt-item"><div style="flex:1"><a href="/people/${f.id}"><b>${f.name}</b></a><div class="faint small">${fmt.money(f.total_spent)} · ${f.purchases} purchases${f.last_contact ? ' · talked ' + fmt.ago(f.last_contact) : ''}</div></div>
        <form method="post" action="/dump/${raw.id}/${person ? 'fix' : 'person'}"><input type="hidden" name="person_id" value="${f.id}"><button class="small" type="submit">That is him</button></form></div>`) : html`<p class="muted">No one matches that. Try another word.</p>`) : ''}
    </div>` : ''}

    ${applied.length ? html`<div class="card"><h3>Filed for you</h3>
      ${applied.map((i) => html`<div class="receipt-item"><span class="tick">✓</span><div>${i.label}</div></div>`)}</div>` : ''}
    ${dups.length ? html`<div class="card"><h3>Already there</h3>
      ${dups.map((i) => html`<div class="receipt-item"><span class="faint">=</span><div class="muted">${i.label}<div class="small">${i.note || ''}</div></div></div>`)}</div>` : ''}

    ${waiting.length && person ? html`<div class="card"><h3>Is this right?</h3>
      <p class="muted small">I was not certain about these, so I did not file them.</p>
      <form method="post" action="/dump/${raw.id}/decide">
        ${waiting.map((i) => html`<label class="receipt-item" style="color:var(--ink)"><input type="checkbox" name="items" value="${i.id}" ${i.conf === 'low' ? '' : 'checked'} style="width:auto;margin-top:4px">
          <div>${i.label}${i.note ? html`<div class="small" style="color:var(--warn)">${i.note}</div>` : ''}<div class="faint small">${i.conf === 'low' ? 'a guess' : 'probably'}</div></div></label>`)}
        <div class="row wrapit" style="margin-top:10px"><button type="submit" name="do" value="approve">Add checked</button><button class="ghost" type="submit" name="do" value="skip">Skip checked</button></div>
      </form></div>` : ''}
    ${waiting.length && !person ? html`<div class="card"><h3>Ready once you pick someone</h3>${waiting.map((i) => html`<div class="receipt-item"><span class="ask">?</span><div>${i.label}</div></div>`)}</div>` : ''}

    ${proposal.nudges && proposal.nudges.length && person ? html`<div class="card"><h3>Worth adding?</h3>
      <p class="muted small">Only if it comes naturally. Add it below and I will file it too.</p>
      <ul class="list">${proposal.nudges.map((n) => html`<li class="muted">${n}</li>`)}</ul>
      <form method="post" action="/dump"><input type="hidden" name="person_id" value="${person.id}">
        <textarea name="text" placeholder="Add more about ${person.name}..." style="min-height:80px"></textarea>
        <button class="small" style="margin-top:8px" type="submit">Add</button></form></div>` : ''}

    ${person ? html`<details class="card more"><summary>Wrong person?</summary>
      <form method="post" action="/dump/${raw.id}/fix"><div class="field" style="margin-top:10px"><label>Move this dump to</label>
        <select name="person_id">${opts}</select></div><button class="small ghost" type="submit">Move it</button>
        ${rec.canUndo ? '' : html`<p class="small" style="color:var(--warn)">Other changes happened after this dump. Press Undo at the top until this one is on top first.</p>`}</form>
      <form method="post" action="/dump/${raw.id}/fix" style="margin-top:10px"><div class="field"><label>Or it is someone new</label><input name="new_name"></div><button class="small ghost" type="submit">Move to new person</button></form>
    </details>` : ''}

    <details class="card more"><summary>Your words</summary><p class="what" style="white-space:pre-wrap">${raw.text}</p></details>
    <div class="row wrapit"><a class="btn" href="/">Done</a><a class="btn ghost" href="/dump">Another dump</a></div>`;
  res.send(await page(req, res, { title: 'Saved', body, active: 'today' }));
}));

router.post('/:id(\\d+)/decide', wrap(async (req, res) => {
  const id = Number(req.params.id);
  let items = req.body.items || [];
  if (!Array.isArray(items)) items = [items];
  const out = await act(req, res, `/dump/${id}`, async () => {
    if (!items.length) throw new Error('Tick at least one.');
    return req.body.do === 'skip' ? dump.skip(id, items) : dump.approve(id, items);
  });
  if (out) back(res, `/dump/${id}`, req.body.do === 'skip' ? 'Skipped.' : 'Added.');
}));

router.post('/:id(\\d+)/person', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/dump/${id}`, async () => {
    if (!req.body.person_id && !String(req.body.new_name || '').trim()) throw new Error('Pick someone or type a name.');
    return dump.assignPerson(id, { personId: req.body.person_id, newName: String(req.body.new_name || '').trim() });
  });
  if (out) res.redirect(`/dump/${out.rawId}`);
}));

router.post('/:id(\\d+)/fix', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/dump/${id}`, async () => {
    if (!req.body.person_id && !String(req.body.new_name || '').trim()) throw new Error('Pick someone or type a name.');
    return dump.fixPerson(id, { personId: String(req.body.new_name || '').trim() ? undefined : req.body.person_id, newName: String(req.body.new_name || '').trim() || undefined });
  });
  if (!out) return;
  if (!out.ok) return back(res, `/dump/${id}`, null, out.reason);
  res.redirect(`/dump/${out.rawId}?msg=${encodeURIComponent('Moved.')}`);
}));

module.exports = { router };

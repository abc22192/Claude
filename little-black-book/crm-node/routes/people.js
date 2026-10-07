'use strict';
const express = require('express');
const db = require('../lib/db');
const fmt = require('../lib/format');
const { html, page } = require('../lib/html');
const ui = require('../lib/ui');
const people = require('../lib/people');
const ops = require('../lib/ops');
const changes = require('../lib/changes');
const auth = require('../lib/auth');
const { wrap, act, back } = require('../lib/http');

const router = express.Router();
const PAGE = 60;

const VIEWS = [
  { key: 'top', label: 'Top 10' },
  { key: 'all', label: 'Everyone' },
  { key: 'whales', label: 'Whales' },
  { key: 'regulars', label: 'Regulars' },
  { key: 'new', label: 'New' },
  { key: 'recent', label: 'Recently talked' },
  { key: 'quiet', label: 'Gone quiet' },
  { key: 'vip', label: 'VIP' },
  { key: 'ghosted', label: 'Ghosted' },
  { key: 'be', label: 'Bella Effect' },
  { key: 'nobuy', label: 'Never bought' },
  { key: 'email', label: 'Email list' },
];

function applyView(list, view, s) {
  const today = fmt.today();
  const bySpend = (a, b) => b.total_spent - a.total_spent || a.name.localeCompare(b.name);
  switch (view) {
    case 'top': return list.filter((p) => p.total_spent > 0).sort(bySpend).slice(0, 10);
    case 'whales': return list.filter((p) => p.total_spent >= s.whale_min).sort(bySpend);
    case 'regulars': return list.filter((p) => p.total_spent >= s.regular_min && p.total_spent < s.whale_min).sort(bySpend);
    case 'new': return list.filter((p) => (p.status === 'new' && !p.purchases) || (p.date_met && fmt.daysBetween(p.date_met, today) <= 30)).sort((a, b) => b.id - a.id);
    case 'recent': return list.filter((p) => p.last_contact).sort((a, b) => b.last_contact.localeCompare(a.last_contact) || b.id - a.id);
    case 'quiet': return list.filter((p) => p.last_purchase_on && fmt.daysBetween(p.last_purchase_on, today) >= s.quiet_after_days).sort(bySpend);
    case 'vip': return list.filter((p) => p.status === 'vip').sort(bySpend);
    case 'ghosted': return list.filter((p) => p.status === 'ghosted').sort(bySpend);
    case 'be': return list.filter((p) => p.knows_bella_effect).sort(bySpend);
    case 'nobuy': return list.filter((p) => !p.purchases).sort((a, b) => a.name.localeCompare(b.name));
    case 'email': return list.filter((p) => p.email).sort((a, b) => a.name.localeCompare(b.name));
    default: return list.sort((a, b) => a.name.localeCompare(b.name));
  }
}

router.get('/', wrap(async (req, res) => {
  const view = VIEWS.some((v) => v.key === req.query.v) ? req.query.v : 'top';
  const q = String(req.query.q || '').trim();
  const s = await people.getSettings();
  let list = await people.allPeople();
  if (q) {
    const nq = fmt.normName(q);
    const lq = q.toLowerCase().replace(/^@/, '');
    list = list.filter((p) => fmt.normName(p.name).includes(nq)
      || (p.email && p.email.toLowerCase().includes(lq))
      || ['notes', 'tone', 'felt', 'fetishes', 'dream_night', 'magic_words', 'likes_about_me', 'plans', 'purchases_text'].some((f) => p[f] && String(p[f]).toLowerCase().includes(q.toLowerCase()))
      || p.platforms.some((pl) => pl.username && String(pl.username).toLowerCase().includes(lq)))
      .sort((a, b) => b.total_spent - a.total_spent || a.name.localeCompare(b.name));
  } else {
    list = applyView(list, view, s);
  }
  const total = list.length;
  const pageNo = Math.max(1, Number(req.query.page) || 1);
  const shown = list.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  const pages = Math.ceil(total / PAGE);
  const viewLabel = (VIEWS.find((v) => v.key === view) || {}).label;

  const body = html`
    <div class="row between"><h1>People</h1><a class="btn small" href="/people/new">+ Add</a></div>
    ${ui.flash(req)}
    <form class="searchbar" method="get" action="/people">
      <input type="search" name="q" value="${q}" placeholder="Search name, username, email or what you remember" autocomplete="off">
      <button type="submit">Find</button>
    </form>
    ${ui.chips(VIEWS, q ? '' : view, '/people?v=')}
    <p class="muted small">${q ? `${total} match${total === 1 ? '' : 'es'} for "${q}"` : `${viewLabel}: ${total} ${total === 1 ? 'person' : 'people'}`}
      ${view === 'email' && !q ? html` · <a href="/export/emails.csv">Download email list</a>` : ''}</p>
    ${shown.length ? (view === 'email' && !q
      ? html`<div class="card"><table><thead><tr><th>Name</th><th>Email</th><th class="num">Spent</th></tr></thead><tbody>
          ${shown.map((p) => html`<tr><td><a href="/people/${p.id}">${p.name}</a></td><td>${p.email}</td><td class="num">${fmt.money(p.total_spent)}</td></tr>`)}</tbody></table></div>`
      : shown.map((p, i) => ui.personCard(p, view === 'top' && !q ? html`<div class="faint small" style="margin-top:6px">#${i + 1}</div>` : '')))
      : ui.empty(q ? 'No one matches. Try fewer letters.' : 'No one in this view yet.')}
    ${pages > 1 ? html`<div class="row between">
      ${pageNo > 1 ? html`<a class="btn ghost small" href="/people?v=${view}&q=${q}&page=${pageNo - 1}">Previous</a>` : html`<span></span>`}
      <span class="muted small">Page ${pageNo} of ${pages}</span>
      ${pageNo < pages ? html`<a class="btn ghost small" href="/people?v=${view}&q=${q}&page=${pageNo + 1}">Next</a>` : html`<span></span>`}</div>` : ''}
  `;
  res.send(await page(req, res, { title: 'People', body, active: 'people' }));
}));

router.get('/new', wrap(async (req, res) => {
  const body = html`
    <h1>Add someone</h1>
    ${ui.flash(req)}
    <form class="card" method="post" action="/people">
      <div class="field"><label>Name or username</label><input name="name" required autofocus value="${req.query.name || ''}"></div>
      <div class="field"><label>Where did you meet?</label>
        <select name="platform"><option value="">Not sure</option>${ui.platformOptions('')}</select></div>
      <div class="field"><label>Their username there (optional)</label><input name="username" placeholder="@name"></div>
      <button class="block" type="submit">Add to my book</button>
    </form>
    <p class="muted small">Tip: for anything more, use the brain dump. I will sort it for you.</p>`;
  res.send(await page(req, res, { title: 'Add person', body, active: 'people' }));
}));

router.post('/', wrap(async (req, res) => {
  const out = await act(req, res, '/people/new', () => ops.createPerson({ name: req.body.name, platform: req.body.platform, username: req.body.username }));
  if (!out) return;
  const note = out.possibleDuplicate ? ` Heads up: someone with that name already exists (${out.possibleDuplicate.name}). You can merge them in More.` : '';
  back(res, `/people/${out.id}`, 'Added.' + note);
}));

/* ---------- one person ---------- */

const REMEMBER = [
  ['dream_night', 'Dream Night', true],
  ['felt', 'How they made me feel', true],
  ['tone', 'Tone', false],
  ['fetishes', 'Fetishes', false],
  ['magic_words', 'Magic words', false],
  ['likes_about_me', 'What they like about me', false],
  ['call_me', 'What they call me', false],
  ['plans', 'Plans and next steps', false],
  ['payment_method', 'How they pay', false],
  ['red_flags', 'Red flags', false],
  ['green_flags', 'Green flags', false],
  ['email', 'Email', false],
  ['notes', 'Notes', true],
];

router.get('/:id(\\d+)', wrap(async (req, res) => {
  const p = await people.getPerson(Number(req.params.id));
  if (!p) return res.status(404).send(await page(req, res, { title: 'Not found', body: ui.empty('That person is not in the book.'), active: 'people' }));
  const [sessions, interactions, reminders, otherPeople] = await Promise.all([
    db.query('SELECT * FROM lbb_sessions WHERE person_id = ? ORDER BY occurred_on DESC, id DESC', [p.id]),
    db.query('SELECT * FROM lbb_interactions WHERE person_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 60', [p.id]),
    db.query("SELECT * FROM lbb_followups WHERE person_id = ? AND kind = 'custom' AND status = 'open' ORDER BY due_on", [p.id]),
    db.query('SELECT id, name FROM lbb_people WHERE archived = 0 AND id <> ? ORDER BY name LIMIT 600', [p.id]),
  ]);
  const today = fmt.today();
  const confirmedSales = sessions.filter((s) => s.status === 'confirmed');
  const flags = [['knows_bella_effect', 'Knows Bella Effect'], ['knows_audio', 'Knows audio'], ['knows_inhalers', 'Knows inhalers']];

  const body = html`
    <div class="hero">
      <div class="row between wrapit"><a href="/people" class="small">← People</a><span class="faint small">${p.archived ? 'Archived' : ''}</span></div>
      <h1 class="rem-title" data-edit-name data-field="name" data-pid="${p.id}" title="Tap to rename">${p.name}</h1>
      <div class="row wrapit" style="gap:6px">${ui.tierBadge(p)}${ui.statusBadge(p)}
        ${p.last_contact ? html`<span class="muted small">Last talked ${fmt.ago(p.last_contact)}</span>` : ''}</div>
      <div style="margin-top:8px">${ui.platformChips(p.platforms)}</div>
    </div>
    ${ui.flash(req)}

    <div class="money-strip">
      ${ui.tile('Total spent', fmt.money(p.total_spent), '', 'good')}
      ${ui.tile('Purchases', String(p.purchases))}
      ${ui.tile('Last bought', p.last_purchase_on ? fmt.dateShort(p.last_purchase_on, false) : 'Never', p.last_purchase_on ? fmt.ago(p.last_purchase_on) : '')}
      ${ui.tile('Since', p.first_purchase_on ? fmt.dateShort(p.first_purchase_on, p.first_purchase_on.slice(0, 4) !== fmt.today().slice(0, 4)) : (p.date_met ? fmt.dateShort(p.date_met, p.date_met.slice(0, 4) !== fmt.today().slice(0, 4)) : '–'), p.first_purchase_on ? 'first purchase' : 'met')}
    </div>

    <div class="card gold">
      <h2>Log something</h2>
      <form method="post" action="/people/${p.id}/log">
        <div class="field"><label>What happened</label><textarea name="summary" placeholder="Talked, flirted, he said..." required></textarea></div>
        <div class="grid2">
          <div class="field"><label>He paid (optional)</label><input name="amount" inputmode="decimal" placeholder="$0"></div>
          <div class="field"><label>For what</label><input name="title" placeholder="Custom, audio, Bella Effect L2"></div>
        </div>
        <div class="field"><label>Where</label><select name="platform"><option value="">Not sure</option>${ui.platformOptions('')}</select></div>
        <button class="block" type="submit">Save</button>
        <p class="faint small" style="margin:8px 0 0">Or <a href="/dump?person=${p.id}">brain dump about ${p.name}</a> and I sort it.</p>
      </form>
    </div>

    <div class="card">
      <h2>What to remember</h2>
      <p class="faint small">Tap any box to edit. It saves as you leave it.</p>
      <div class="remember">
        ${REMEMBER.map(([key, label, big]) => html`<div class="rem ${big ? 'big' : ''}" data-field="${key}" data-pid="${p.id}">
          <div class="k">${label}</div>
          <div class="v ${p[key] ? '' : 'empty'}">${p[key] || 'Tap to add'}</div></div>`)}
      </div>
      <div class="chips" style="margin-top:12px">
        ${flags.map(([k, l]) => html`<form method="post" action="/people/${p.id}/field" style="display:inline">          <input type="hidden" name="field" value="${k}"><input type="hidden" name="value" value="${p[k] ? 0 : 1}">
          <button class="chip ${p[k] ? 'on' : ''}" type="submit">${p[k] ? '✓ ' : ''}${l}</button></form>`)}
      </div>
      <div class="chips">
        ${Object.entries(fmt.STATUSES).map(([k, l]) => html`<form method="post" action="/people/${p.id}/field" style="display:inline">          <input type="hidden" name="field" value="status"><input type="hidden" name="value" value="${k}">
          <button class="chip ${p.status === k ? 'on' : ''}" type="submit">${l}</button></form>`)}
      </div>
    </div>

    <div class="card">
      <div class="row between"><h2>Purchases</h2><span class="muted small">${confirmedSales.length} counted</span></div>
      ${sessions.length ? html`<ul class="list">${sessions.map((s) => saleRow(s, res))}</ul>` : ui.empty('No purchases yet.')}
      <details class="more"><summary>+ Add a purchase</summary>
        <form method="post" action="/people/${p.id}/sale">
          <div class="field"><label>What</label><input name="title" placeholder="Custom video"></div>
          <div class="grid2">
            <div class="field"><label>Type</label><select name="kind">${ui.kindOptions('other')}</select></div>
            <div class="field"><label>Bella Effect level</label><select name="level"><option value="">–</option><option>L1</option><option>L2</option><option>L3</option><option>L4</option></select></div>
          </div>
          <div class="grid2">
            <div class="field"><label>Amount</label><input name="amount" inputmode="decimal" placeholder="$"></div>
            <div class="field"><label>Date</label><input type="date" name="occurred_on" value="${today}"></div>
          </div>
          <div class="field"><label>Where</label><select name="platform"><option value="">Not sure</option>${ui.platformOptions('')}</select></div>
          <button class="block" type="submit">Add purchase</button>
        </form>
      </details>
    </div>

    <div class="card">
      <h2>Reminders</h2>
      ${reminders.length ? html`<ul class="list">${reminders.map((r) => html`<li><div class="row between"><div><b>${fmt.dateShort(r.due_on)}</b> <span class="muted">${r.reason || ''}</span></div>
        <form method="post" action="/followups/act"><input type="hidden" name="person_id" value="${p.id}"><input type="hidden" name="stage" value="custom"><input type="hidden" name="followup_id" value="${r.id}"><input type="hidden" name="action" value="done"><button class="small ghost" type="submit">Done</button></form></div></li>`)}</ul>` : '<p class="muted small">None set.</p>'}
      <details class="more"><summary>+ Remind me</summary>
        <form method="post" action="/people/${p.id}/remind">
          <div class="grid2"><div class="field"><label>When</label><input type="date" name="due_on" value="${fmt.addDays(today, 7)}" required></div>
          <div class="field"><label>About</label><input name="reason" placeholder="Ask about the custom"></div></div>
          <button class="block" type="submit">Set reminder</button></form>
      </details>
    </div>

    <div class="card">
      <h2>History</h2>
      ${interactions.length ? html`<div class="timeline">${interactions.map((i) => html`<div class="item">
        <div class="when">${fmt.dateShort(String(i.occurred_at).slice(0, 10))}${i.platform ? ' · ' + (fmt.PLATFORMS[i.platform] || i.platform) : ''}${i.source && i.source !== 'app' ? ' · ' + i.source : ''}</div>
        <div class="what">${i.summary}</div></div>`)}</div>` : ui.empty('Nothing logged yet.')}
    </div>

    <div class="card">
      <h3>Where we talk</h3>
      <ul class="list">${p.platforms.map((pl) => html`<li><div class="row between"><span>${fmt.PLATFORMS[pl.platform] || pl.platform}${pl.username ? ' @' + String(pl.username).replace(/^@/, '') : ''}${pl.is_primary ? ' · main' : ''}</span>
        <form method="post" action="/people/${p.id}/platform/${pl.id}/remove"><button class="small ghost" type="submit">Remove</button></form></div></li>`)}</ul>
      <form method="post" action="/people/${p.id}/platform">
        <div class="grid2"><div class="field"><label>Platform</label><select name="platform">${ui.platformOptions('telegram')}</select></div>
        <div class="field"><label>Username</label><input name="username" placeholder="@name"></div></div>
        <button class="small" type="submit">Add</button></form>
    </div>

    <details class="card more"><summary>More</summary>
      <form method="post" action="/people/${p.id}/field" class="field" style="margin-top:10px">
        <div class="grid2"><div class="field"><label>Date we met</label><input type="date" name="value" value="${p.date_met || ''}"></div>
        <div class="field"><label>&nbsp;</label><input type="hidden" name="field" value="date_met"><button class="small" type="submit">Save date</button></div></div>
      </form>
      <form method="post" action="/people/${p.id}/merge" data-confirm="Move everything from this person into the one you pick?">
        <div class="field"><label>Same person as someone else? Merge this one into</label>
          <select name="keep_id">${otherPeople.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select></div>
        <button class="small ghost" type="submit">Merge</button>
        <span class="faint small">You can undo it right after.</span>
      </form>
      <form method="post" action="/people/${p.id}/${p.archived ? 'restore' : 'archive'}" style="margin-top:12px">
        <button class="small danger" type="submit">${p.archived ? 'Restore to my book' : 'Archive (hide, not delete)'}</button></form>
    </details>
  `;
  res.send(await page(req, res, { title: p.name, body, active: 'people' }));
}));

function saleRow(s, res) {
  const counted = s.status === 'confirmed';
  return html`<li>
    <div class="row between">
      <div><b>${s.title}</b>${s.level ? html` <span class="badge gold">${s.level}</span>` : ''}
        <div class="faint small">${fmt.dateShort(s.occurred_on)}${s.platform ? ' · ' + (fmt.PLATFORMS[s.platform] || s.platform) : ''}${counted ? '' : ' · not counted yet'}</div>
        ${!counted && s.unconfirmed_reason ? html`<div class="small" style="color:var(--warn)">${s.unconfirmed_reason}</div>` : ''}</div>
      <div class="right"><div class="amount">${s.amount === null ? '?' : fmt.money(s.amount)}</div>
        ${counted ? '' : html`<span class="badge wine">needs OK</span>`}</div>
    </div>
    <details class="more"><summary class="small">Edit</summary>
      <form method="post" action="/people/sale/${s.id}">
        <div class="grid2">
          <div class="field"><label>What</label><input name="title" value="${s.title}"></div>
          <div class="field"><label>Amount</label><input name="amount" inputmode="decimal" value="${s.amount === null ? '' : s.amount}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Date</label><input type="date" name="occurred_on" value="${s.occurred_on || ''}"></div>
          <div class="field"><label>Where</label><select name="platform"><option value="">Not sure</option>${ui.platformOptions(s.platform)}</select></div>
        </div>
        <div class="row wrapit">
          <button class="small" type="submit" name="status" value="confirmed">${counted ? 'Save' : 'Save and count it'}</button>
          ${counted ? html`<button class="small ghost" type="submit" name="status" value="unconfirmed">Mark not sure</button>` : ''}
          <button class="small danger" type="submit" formaction="/people/sale/${s.id}/delete">Delete</button>
        </div>
      </form>
    </details></li>`;
}

/* ---------- actions ---------- */

function reply(req, res, personPath, out, okMsg) {
  if (auth.wantsJson(req)) return res.json({ ok: true, setId: out && out.setId, ...(out || {}) });
  return back(res, personPath, okMsg);
}

router.post('/:id(\\d+)/field', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const field = req.body.field;
  const value = req.body.value;
  const out = await act(req, res, `/people/${id}`, () => ops.setField(id, field, value));
  if (!out) return;
  reply(req, res, `/people/${id}`, out, 'Saved.');
}));

router.post('/:id(\\d+)/log', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/people/${id}`, async () => {
    const { summary, amount, title, platform } = req.body;
    let msg = 'Saved.';
    await ops.addInteraction(id, { summary, platform });
    if (amount !== undefined && String(amount).trim() !== '') {
      const kindGuess = /bella\s*effect/i.test(`${title} ${summary}`) ? 'bella_effect' : 'other';
      const lv = /\bL\s?([1-4])\b/i.exec(`${title} ${summary}`);
      await ops.addSale(id, { title: title || (kindGuess === 'bella_effect' ? 'Bella Effect' : 'Purchase'), kind: kindGuess, level: lv ? 'L' + lv[1] : null, amount, platform });
      msg = 'Saved, and the purchase is counted.';
    }
    return { msg };
  });
  if (!out) return;
  reply(req, res, `/people/${id}`, out, out.msg);
}));

router.post('/:id(\\d+)/sale', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/people/${id}`, () => ops.addSale(id, req.body));
  if (!out) return;
  reply(req, res, `/people/${id}`, out, out.status === 'confirmed' ? 'Purchase added and counted.' : 'Saved, but it will not count until you add an amount.');
}));

router.post('/:id(\\d+)/remind', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/people/${id}`, async () => {
    const due = ops.cleanDate(req.body.due_on);
    if (!due) throw new Error('Pick a date.');
    const p = await db.one('SELECT name FROM lbb_people WHERE id = ?', [id]);
    if (!p) throw new Error('Person not found.');
    return changes.run(`Reminder: ${p.name}`, async (t) => {
      await t.insert('lbb_followups', { person_id: id, kind: 'custom', due_on: due, reason: String(req.body.reason || '').slice(0, 250) || null, status: 'open' });
    });
  });
  if (!out) return;
  reply(req, res, `/people/${id}`, out, 'Reminder set.');
}));

router.post('/:id(\\d+)/platform', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/people/${id}`, () => ops.addPlatform(id, req.body));
  if (!out) return;
  reply(req, res, `/people/${id}`, out, 'Added.');
}));

router.post('/:id(\\d+)/platform/:pid(\\d+)/remove', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/people/${id}`, () => ops.removePlatform(id, Number(req.params.pid)));
  if (!out) return;
  reply(req, res, `/people/${id}`, out, 'Removed.');
}));

router.post('/:id(\\d+)/archive', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/people/${id}`, () => ops.archivePerson(id, true));
  if (!out) return;
  reply(req, res, '/people', out, 'Archived. Use Undo if that was a mistake.');
}));

router.post('/:id(\\d+)/restore', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const out = await act(req, res, `/people/${id}`, () => ops.archivePerson(id, false));
  if (!out) return;
  reply(req, res, `/people/${id}`, out, 'Restored.');
}));

router.post('/:id(\\d+)/merge', wrap(async (req, res) => {
  const fromId = Number(req.params.id);
  const keepId = Number(req.body.keep_id);
  const out = await act(req, res, `/people/${fromId}`, () => ops.mergePeople(keepId, fromId));
  if (!out) return;
  reply(req, res, `/people/${keepId}`, out, 'Merged. Use Undo at the top if that was a mistake.');
}));

function safeBack(b, fallback) {
  return typeof b === 'string' && /^\/[a-z]/.test(b) && !b.startsWith('//') ? b : fallback;
}

router.post('/sale/:sid(\\d+)', wrap(async (req, res) => {
  const sid = Number(req.params.sid);
  const row = await db.one('SELECT person_id FROM lbb_sessions WHERE id = ?', [sid]);
  const path = safeBack(req.body.back, row ? `/people/${row.person_id}` : '/people');
  const out = await act(req, res, path, () => ops.updateSale(sid, req.body));
  if (!out) return;
  reply(req, res, path, out, 'Saved.');
}));

router.post('/sale/:sid(\\d+)/delete', wrap(async (req, res) => {
  const sid = Number(req.params.sid);
  const row = await db.one('SELECT person_id FROM lbb_sessions WHERE id = ?', [sid]);
  const path = safeBack(req.body.back, row ? `/people/${row.person_id}` : '/people');
  const out = await act(req, res, path, () => ops.deleteSale(sid));
  if (!out) return;
  reply(req, res, path, out, 'Deleted. Use Undo at the top to bring it back.');
}));

module.exports = { router, VIEWS, applyView };

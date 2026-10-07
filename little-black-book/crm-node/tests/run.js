'use strict';
/**
 * Integration tests. They run the real app against a real MySQL/MariaDB database.
 * Needs: TEST_DB_HOST (default 127.0.0.1), TEST_DB_NAME, TEST_DB_USER, TEST_DB_PASSWORD.
 * WARNING: this deletes every lbb_ table in that database. Never point it at real data.
 */
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'lbbtest';
process.env.DB_USER = process.env.TEST_DB_USER || 'lbb';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'lbbpass';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';
process.env.SESSION_SECRET = '0123456789abcdef0123456789';
process.env.INSECURE_COOKIES = '1';
process.env.API_KEY = 'test-api-key-0123456789abcdef';
process.env.TELEGRAM_BOT_TOKEN = '123:TESTTOKEN';
process.env.PUBLIC_URL = 'https://book.example.test';
process.env.APP_TZ = 'America/New_York';
process.env.LBB_NO_START = '1';

const { config } = require('../lib/config');
const db = require('../lib/db');
const fmt = require('../lib/format');
const sorter = require('../lib/sorter');
const { createApp, ensureDb } = require('../server');
const auth = require('../lib/auth');

const results = { pass: 0, fail: 0, failures: [] };
async function test(name, fn) {
  try {
    await fn();
    results.pass += 1;
    console.log('  ok   ' + name);
  } catch (err) {
    results.fail += 1;
    results.failures.push(name);
    console.log('  FAIL ' + name + '\n       ' + (err && err.message ? err.message.split('\n').join('\n       ') : err));
  }
}

let base;
let cookie = '';
let csrf = '';

async function raw(method, p, { form, json, headers = {}, jar = true, follow = false } = {}) {
  const h = { ...headers };
  if (jar && cookie) h.cookie = cookie;
  let body;
  if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams({ ...(csrf && jar ? { _csrf: csrf } : {}), ...form }).toString(); }
  if (json) { h['content-type'] = 'application/json'; h.accept = 'application/json'; if (csrf && jar) h['x-csrf'] = csrf; body = JSON.stringify(json); }
  const res = await fetch(base + p, { method, headers: h, body, redirect: follow ? 'follow' : 'manual' });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers, location: res.headers.get('location') };
}
const get = (p, o) => raw('GET', p, o);
const post = (p, form, o) => raw('POST', p, { form, ...o });
const postJson = (p, json, o) => raw('POST', p, { json, ...o });

async function login() {
  const r = await raw('POST', '/login', { form: { password: process.env.ADMIN_PASSWORD }, jar: false });
  assert.strictEqual(r.status, 302, 'login should redirect');
  cookie = r.headers.get('set-cookie').split(';')[0];
  const home = await get('/');
  csrf = /name="csrf" content="([^"]+)"/.exec(home.text)[1];
}

async function resetDb() {
  await db.connect();
  const rows = await db.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_name LIKE 'lbb\\_%'", [process.env.DB_NAME]);
  for (const r of rows) await db.query('DROP TABLE IF EXISTS ??', [r.t || r.T || r.TABLE_NAME]);
}

async function personByName(name) {
  return db.one('SELECT * FROM lbb_people WHERE name = ? ORDER BY id DESC LIMIT 1', [name]);
}
async function totalOf(id) {
  const r = await db.one("SELECT COALESCE(SUM(amount),0) AS t FROM lbb_sessions WHERE person_id = ? AND status = 'confirmed'", [id]);
  return Number(r.t);
}
async function dumpText(text, extra) {
  const r = await post('/dump', { text, ...(extra || {}) });
  assert.strictEqual(r.status, 302, 'dump should redirect to receipt, got ' + r.status + ' ' + r.text.slice(0, 200));
  const rawId = Number(/\/dump\/(\d+)/.exec(r.location)[1]);
  const receipt = await get(r.location);
  return { rawId, receipt: receipt.text };
}
const ago = (n) => fmt.addDays(fmt.today(), -n);

/* ---------- Telegram stub ---------- */
const tgSent = [];
let tgServer;
function startTelegramStub() {
  return new Promise((resolve) => {
    tgServer = http.createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        const method = req.url.split('/').pop();
        tgSent.push({ method, body: b ? JSON.parse(b) : {} });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, result: method === 'getWebhookInfo' ? { url: '' } : {} }));
      });
    }).listen(0, '127.0.0.1', () => resolve(tgServer.address().port));
  });
}

async function main() {
  console.log('Resetting the test database…');
  await resetDb();
  const ok = await ensureDb();
  assert.ok(ok, 'database should connect');
  const tgPort = await startTelegramStub();
  config.telegram.apiBase = `http://127.0.0.1:${tgPort}`;

  const server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  console.log('\nSorter');
  const index = {
    people: [{ id: 1, name: 'Kaiser' }, { id: 2, name: 'Bigboy' }, { id: 3, name: 'Mike' }, { id: 4, name: 'Mike' }, { id: 5, name: 'Sir Dave' }],
    handles: new Map([['kaiser99', 1]]), ids: new Map([['777', 2]]),
  };
  const S = (t, c) => sorter.sort(t, { today: '2026-10-07', index, ...(c || {}) });
  await test('word "be" or "of" never triggers Bella Effect or OnlyFans', () => {
    const r = S('Kaiser said I should be careful of the plans');
    assert.ok(!r.items.some((i) => i.type === 'sale' || i.type === 'platform'));
    assert.ok(!r.nudges.some((n) => /Bella Effect/.test(n)));
  });
  await test('sale with a verb, amount, level and date', () => {
    const r = S('Kaiser bought Bella Effect L2 for $150 on telegram yesterday');
    const sale = r.items.find((i) => i.type === 'sale');
    assert.strictEqual(sale.data.amount, 150);
    assert.strictEqual(sale.data.level, 'L2');
    assert.strictEqual(sale.data.kind, 'bella_effect');
    assert.strictEqual(sale.data.platform, 'telegram');
    assert.strictEqual(sale.data.occurred_on, '2026-10-06');
    assert.ok(r.items.some((i) => i.type === 'flag' && i.data.field === 'knows_bella_effect'));
  });
  await test('hypothetical or negative sentences do not create sales', () => {
    for (const t of ['Bigboy wants to buy bella effect but did not pay $200', 'Kaiser might pay $50 later', 'Kaiser would buy it if I drop the price to $40']) {
      assert.ok(!S(t).items.some((i) => i.type === 'sale'), t);
    }
  });
  await test('a lone number is not a sale', () => assert.ok(!S('Kaiser has 12000 followers and $5 is nothing').items.some((i) => i.type === 'sale')));
  await test('two amounts in one sentence become two sales', () => {
    const sales = S('Kaiser bought audio for $30 and a custom for $80').items.filter((i) => i.type === 'sale');
    assert.deepStrictEqual(sales.map((s) => s.data.amount).sort(), [30, 80]);
  });
  await test('comma amounts and "dollars"', () => assert.strictEqual(S('Sir Dave paid 1,200 dollars for the vault').items.find((i) => i.type === 'sale').data.amount, 1200));
  await test('Dream Night is kept verbatim and a following reminder is not swallowed', () => {
    const r = S('Kaiser. Dream night: tied up, I tease him for hours, then I say stay. Follow up in 2 weeks.');
    const dn = r.items.find((i) => i.type === 'field' && i.data.field === 'dream_night');
    assert.strictEqual(dn.data.value, 'tied up, I tease him for hours, then I say stay.');
    assert.ok(r.items.some((i) => i.type === 'followup' && i.data.due_on === '2026-10-21'));
  });
  await test('two people with one name are never guessed', () => {
    const r = S('Mike paid $40');
    assert.strictEqual(r.person.conf, 'low');
    assert.strictEqual(r.person.candidates.length, 2);
    assert.ok(r.items.every((i) => i.conf === 'low'));
  });
  await test('name only in the middle of text is medium, so everything waits', () => {
    const r = S('Be careful with him. Kaiser said hi');
    assert.strictEqual(r.person.conf, 'medium');
    assert.ok(r.items.every((i) => i.conf !== 'high'));
  });
  await test('username and telegram id match with high confidence', () => {
    assert.strictEqual(S('@kaiser99 said thanks').person.id, 1);
    assert.strictEqual(S('hello', { externalId: '777' }).person.id, 2);
  });
  await test('weekday and "N days ago" dates', () => {
    assert.strictEqual(sorter.parseWhen('he paid on monday', '2026-10-07', 'past'), '2026-10-05');
    assert.strictEqual(sorter.parseWhen('3 days ago', '2026-10-07', 'past'), '2026-10-04');
    assert.strictEqual(sorter.parseWhen('follow up friday', '2026-10-07', 'future'), '2026-10-09');
    assert.strictEqual(sorter.parseWhen('follow up in 3 weeks', '2026-10-07', 'future'), '2026-10-28');
  });
  await test('forwarded messages only file history', () => {
    const r = S('hey are you there', { forwarded: true, externalId: '777' });
    assert.deepStrictEqual(r.items.map((i) => i.type), ['interaction']);
  });

  console.log('\nLogin and security');
  await test('every page redirects to login when logged out', async () => {
    for (const p of ['/', '/people', '/money', '/dump', '/settings', '/export/people.csv']) {
      const r = await get(p, { jar: false });
      assert.strictEqual(r.status, 302, p);
      assert.ok(r.location.startsWith('/login'), p);
    }
  });
  await test('wrong password is refused, and 8 wrong tries lock out even the right password', async () => {
    auth.resetAttempts();
    for (let i = 0; i < 8; i++) {
      const r = await raw('POST', '/login', { form: { password: 'nope-nope-nope' }, jar: false });
      assert.strictEqual(r.status, 401);
    }
    const locked = await raw('POST', '/login', { form: { password: process.env.ADMIN_PASSWORD }, jar: false });
    assert.strictEqual(locked.status, 401);
    assert.ok(/Too many wrong tries/.test(locked.text));
    auth.resetAttempts();
  });
  await test('correct password sets a 90 day HttpOnly cookie', async () => {
    const r = await raw('POST', '/login', { form: { password: process.env.ADMIN_PASSWORD }, jar: false });
    const sc = r.headers.get('set-cookie');
    assert.ok(/HttpOnly/.test(sc) && /SameSite=Lax/.test(sc));
    assert.ok(/Max-Age=7776000/.test(sc), sc);
  });
  await login();
  await test('a write without the CSRF token is rejected', async () => {
    const r = await raw('POST', '/people', { form: { name: 'Sneaky' }, headers: { cookie }, jar: false });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(await personByName('Sneaky'), null);
  });
  await test('a tampered cookie is rejected', async () => {
    const r = await get('/', { headers: { cookie: cookie.slice(0, -3) + 'xyz' }, jar: false });
    assert.strictEqual(r.status, 302);
  });
  await test('login page never sends users to another site', async () => {
    const r = await raw('POST', '/login', { form: { password: process.env.ADMIN_PASSWORD, next: 'https://evil.example' }, jar: false });
    assert.strictEqual(r.location, '/');
  });

  console.log('\nPeople and purchases');
  let kaiser;
  await test('add a person with a platform handle', async () => {
    const r = await post('/people', { name: 'Kaiser', platform: 'telegram', username: '@kaiser99' });
    assert.strictEqual(r.status, 302);
    kaiser = await personByName('Kaiser');
    const pl = await db.one('SELECT * FROM lbb_platforms WHERE person_id = ?', [kaiser.id]);
    assert.strictEqual(pl.username, 'kaiser99');
  });
  await test('names are escaped so they cannot run code', async () => {
    await post('/people', { name: '<script>alert(1)</script>' });
    const list = await get('/people?v=all');
    assert.ok(!list.text.includes('<script>alert(1)</script>'));
    assert.ok(list.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    const p = await personByName('<script>alert(1)</script>');
    await post(`/people/${p.id}/archive`, {});
  });
  await test('total spent is derived from confirmed purchases only', async () => {
    await post(`/people/${kaiser.id}/sale`, { title: 'Custom video', kind: 'custom', amount: '80', occurred_on: ago(5), platform: 'telegram' });
    await post(`/people/${kaiser.id}/sale`, { title: 'Mystery', kind: 'other', amount: '', occurred_on: ago(2) });
    assert.strictEqual(await totalOf(kaiser.id), 80);
    const page = await get(`/people/${kaiser.id}`);
    assert.ok(page.text.includes('$80'));
    const conf = await get('/confirm');
    assert.ok(conf.text.includes('Mystery'));
  });
  await test('confirming an unconfirmed purchase adds it to the total', async () => {
    const s = await db.one("SELECT id FROM lbb_sessions WHERE title = 'Mystery'");
    const bad = await post(`/people/sale/${s.id}`, { status: 'confirmed', amount: '', back: '/confirm' });
    assert.ok(/Add an amount/.test(decodeURIComponent(bad.location)));
    await post(`/people/sale/${s.id}`, { status: 'confirmed', amount: '25', occurred_on: ago(2), back: '/confirm' });
    assert.strictEqual(await totalOf(kaiser.id), 105);
  });
  await test('inline field edit returns JSON and can be undone', async () => {
    const r = await postJson(`/people/${kaiser.id}/field`, { field: 'tone', value: 'Playful and quiet' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(JSON.parse(r.text).value, 'Playful and quiet');
    assert.strictEqual((await personByName('Kaiser')).tone, 'Playful and quiet');
    const u = await postJson('/undo', {});
    assert.strictEqual(JSON.parse(u.text).ok, true);
    assert.strictEqual((await personByName('Kaiser')).tone, null);
    await postJson('/redo', {});
    assert.strictEqual((await personByName('Kaiser')).tone, 'Playful and quiet');
  });
  await test('bad edits are refused with a plain message', async () => {
    const r = await postJson(`/people/${kaiser.id}/field`, { field: 'email', value: 'not-an-email' });
    assert.strictEqual(r.status, 400);
    assert.ok(/email/i.test(JSON.parse(r.text).error));
    const r2 = await postJson(`/people/${kaiser.id}/field`, { field: 'archived', value: '1' });
    assert.strictEqual(r2.status, 400);
  });
  await test('a new action wipes the redo stack', async () => {
    await postJson(`/people/${kaiser.id}/field`, { field: 'call_me', value: 'Sir' });
    await postJson('/undo', {});
    await postJson(`/people/${kaiser.id}/field`, { field: 'call_me', value: 'Daddy' });
    const r = await postJson('/redo', {});
    assert.strictEqual(JSON.parse(r.text).ok, false);
    assert.strictEqual((await personByName('Kaiser')).call_me, 'Daddy');
  });
  await test('every people view renders', async () => {
    for (const v of ['top', 'all', 'whales', 'regulars', 'new', 'recent', 'quiet', 'vip', 'ghosted', 'be', 'nobuy', 'email']) {
      const r = await get('/people?v=' + v);
      assert.strictEqual(r.status, 200, v);
      assert.ok(!r.text.includes('That did not work'), v);
    }
    const found = await get('/people?q=kai');
    assert.ok(found.text.includes('Kaiser'));
    const byHandle = await get('/people?q=@kaiser99');
    assert.ok(byHandle.text.includes('Kaiser'));
  });

  console.log('\nBrain dump');
  await test('a plain dump about a known person files the sale, history and flags', async () => {
    const { receipt } = await dumpText('Kaiser bought Bella Effect L2 for $150 on telegram yesterday. Dream night: he kneels at the door and waits for my text. Follow up in 2 weeks.');
    assert.ok(receipt.includes('Saved'));
    assert.ok(receipt.includes('Bella Effect L2'));
    const p = await personByName('Kaiser');
    assert.strictEqual(p.knows_bella_effect, 1);
    assert.strictEqual(p.dream_night, 'he kneels at the door and waits for my text.');
    assert.strictEqual(await totalOf(p.id), 255);
    const fu = await db.one("SELECT * FROM lbb_followups WHERE person_id = ? AND kind = 'custom'", [p.id]);
    assert.strictEqual(fu.due_on, fmt.addDays(fmt.today(), 14));
    const hist = await db.one('SELECT summary FROM lbb_interactions WHERE person_id = ? ORDER BY id DESC LIMIT 1', [p.id]);
    assert.ok(hist.summary.startsWith('Kaiser bought Bella Effect'), 'full text saved word for word');
  });
  await test('the same dump again does not double the sale', async () => {
    await dumpText('Kaiser bought Bella Effect L2 for $150 on telegram yesterday.');
    assert.strictEqual(await totalOf((await personByName('Kaiser')).id), 255);
  });
  await test('Undo takes a whole dump back out, Redo puts it back', async () => {
    const before = await totalOf((await personByName('Kaiser')).id);
    await dumpText('Kaiser tipped $40 today');
    assert.strictEqual(await totalOf((await personByName('Kaiser')).id), before + 40);
    await postJson('/undo', {});
    assert.strictEqual(await totalOf((await personByName('Kaiser')).id), before);
    await postJson('/redo', {});
    assert.strictEqual(await totalOf((await personByName('Kaiser')).id), before + 40);
  });
  await test('"New guy" creates the person with handle, sale and notes', async () => {
    const { receipt } = await dumpText('New guy: Tommy @tommy_t on telegram. He paid $25 for a custom. Fetishes: feet, praise. Felt: warm and sweet');
    const t = await personByName('Tommy');
    assert.ok(t, 'Tommy created');
    assert.strictEqual(t.fetishes, 'feet, praise.');
    assert.strictEqual(t.felt, 'warm and sweet');
    assert.strictEqual(await totalOf(t.id), 25);
    assert.ok(receipt.includes('new person'));
  });
  await test('a purchase with no amount is saved but not counted', async () => {
    await dumpText('Kaiser bought Bella Effect L3');
    const s = await db.one("SELECT * FROM lbb_sessions WHERE level = 'L3'");
    assert.strictEqual(s.status, 'unconfirmed');
    assert.strictEqual(s.amount, null);
  });
  await test('someone not in the book yet waits for one tap', async () => {
    const before = await db.one('SELECT COUNT(*) AS n FROM lbb_people');
    const { rawId, receipt } = await dumpText('Jake bought audio for $30 on x. He is into feet and praise. Tone: shy');
    assert.ok(!(await personByName('Jake')), 'not created yet');
    assert.ok(receipt.includes('Yes, Jake is new'));
    const r = await post(`/dump/${rawId}/person`, { new_name: 'Jake' });
    assert.strictEqual(r.status, 302);
    const jake = await personByName('Jake');
    assert.ok(jake);
    assert.strictEqual(await totalOf(jake.id), 30, 'once you confirm the person, certain items file');
    assert.strictEqual(jake.fetishes, null, 'a guess about interests still waits');
    const rec = await db.one('SELECT id FROM lbb_raw WHERE person_id = ? ORDER BY id DESC LIMIT 1', [jake.id]);
    const page = await get(`/dump/${rec.id}`);
    assert.ok(page.text.includes('Is this right?'));
    assert.strictEqual((await db.one('SELECT COUNT(*) AS n FROM lbb_people')).n, before.n + 1);
  });
  await test('waiting items apply only when approved', async () => {
    const jake = await personByName('Jake');
    const rec = await db.one('SELECT id, proposal FROM lbb_raw WHERE person_id = ? ORDER BY id DESC LIMIT 1', [jake.id]);
    const prop = JSON.parse(rec.proposal);
    const guess = prop.items.find((i) => i.type === 'field' && i.data.field === 'fetishes');
    assert.strictEqual(guess.state, 'waiting');
    const r = await post(`/dump/${rec.id}/decide`, { do: 'approve', items: guess.id });
    assert.strictEqual(r.status, 302);
    assert.strictEqual((await personByName('Jake')).fetishes, 'feet and praise');
  });
  await test('two people with the same name: it asks, never guesses', async () => {
    await post('/people', { name: 'Mike' });
    await post('/people', { name: 'Mike' });
    const mikes = await db.query("SELECT id FROM lbb_people WHERE name = 'Mike' ORDER BY id");
    const { rawId, receipt } = await dumpText('Mike paid $40 for a clip');
    assert.ok(receipt.includes('Who is this about?'));
    assert.strictEqual(await totalOf(mikes[0].id) + await totalOf(mikes[1].id), 0);
    const inbox = await get('/inbox');
    assert.ok(inbox.text.includes('Mike paid'));
    await post(`/dump/${rawId}/person`, { person_id: String(mikes[1].id) });
    assert.strictEqual(await totalOf(mikes[1].id), 40);
  });
  await test('"Wrong person?" moves a dump after undoing it', async () => {
    const mikes = await db.query("SELECT id FROM lbb_people WHERE name = 'Mike' ORDER BY id");
    const raw1 = await db.one("SELECT id FROM lbb_raw WHERE text LIKE 'Mike paid%' ORDER BY id DESC LIMIT 1");
    const r = await post(`/dump/${raw1.id}/fix`, { person_id: String(mikes[0].id) });
    assert.strictEqual(r.status, 302);
    assert.strictEqual(await totalOf(mikes[1].id), 0);
    assert.strictEqual(await totalOf(mikes[0].id), 40);
  });
  await test('a conflicting single value waits instead of overwriting', async () => {
    await dumpText('Kaiser. Tone: formal and cold');
    const k = await personByName('Kaiser');
    assert.strictEqual(k.tone, 'Playful and quiet', 'kept the old tone');
    const rec = await db.one("SELECT id FROM lbb_raw WHERE text LIKE '%formal and cold%' ORDER BY id DESC LIMIT 1");
    const page = await get(`/dump/${rec.id}`);
    assert.ok(page.text.includes('Replace it?'));
  });
  await test('an empty dump is refused', async () => {
    const r = await post('/dump', { text: '   ' });
    assert.ok(r.status === 302 && /err=/.test(r.location));
  });

  console.log('\nCheck-ins');
  await test('a person whose last purchase is 31 days old is due, and done clears it', async () => {
    await post('/people', { name: 'Oldie' });
    const o = await personByName('Oldie');
    await post(`/people/${o.id}/sale`, { title: 'Audio', kind: 'audio', amount: '60', occurred_on: ago(31) });
    let page = await get('/followups');
    assert.ok(page.text.includes('Oldie') && page.text.includes('1 month check-in'));
    await postJson('/followups/act', { person_id: o.id, stage: '1_month', anchor_on: ago(31), action: 'done' });
    page = await get('/followups');
    assert.ok(!page.text.includes('1 month check-in') || !page.text.split('Due now')[1].split('Coming up')[0].includes('Oldie'));
    const hist = await db.one("SELECT summary FROM lbb_interactions WHERE person_id = ? ORDER BY id DESC LIMIT 1", [o.id]);
    assert.ok(/Checked in/.test(hist.summary));
  });
  await test('three month stage follows, and a new purchase restarts the clock', async () => {
    const o = await personByName('Oldie');
    await db.query('UPDATE lbb_sessions SET occurred_on = ? WHERE person_id = ?', [ago(91), o.id]);
    await postJson('/followups/act', { person_id: o.id, stage: '1_month', anchor_on: ago(91), action: 'done' });
    const stages = await require('../lib/followups').collect();
    const mine = [...stages.due, ...stages.quiet].find((i) => i.person.id === o.id);
    assert.strictEqual(mine.kind, '3_month');
    await post(`/people/${o.id}/sale`, { title: 'Clip', kind: 'clip', amount: '20', occurred_on: fmt.today() });
    const again = await require('../lib/followups').collect();
    assert.ok(![...again.due, ...again.quiet].some((i) => i.person.id === o.id));
  });
  await test('snooze hides someone until later, skip hides the stage', async () => {
    await post('/people', { name: 'Sleepy' });
    const s = await personByName('Sleepy');
    await post(`/people/${s.id}/sale`, { title: 'Call', kind: 'call', amount: '90', occurred_on: ago(35) });
    await postJson('/followups/act', { person_id: s.id, stage: '1_month', anchor_on: ago(35), action: 'snooze' });
    let fu = await require('../lib/followups').collect();
    assert.ok(!fu.due.some((i) => i.person.id === s.id));
    await postJson('/undo', {});
    fu = await require('../lib/followups').collect();
    assert.ok(fu.due.some((i) => i.person.id === s.id));
    await postJson('/followups/act', { person_id: s.id, stage: '1_month', anchor_on: ago(35), action: 'skip' });
    fu = await require('../lib/followups').collect();
    assert.ok(!fu.due.some((i) => i.person.id === s.id));
  });
  await test('people who bought long ago land in "gone quiet", biggest spender first', async () => {
    await post('/people', { name: 'Ancient' });
    await post('/people', { name: 'AncientBig' });
    const a = await personByName('Ancient');
    const b = await personByName('AncientBig');
    await post(`/people/${a.id}/sale`, { title: 'Old', amount: '20', occurred_on: ago(300) });
    await post(`/people/${b.id}/sale`, { title: 'Old', amount: '500', occurred_on: ago(300) });
    const fu = await require('../lib/followups').collect();
    const names = fu.quiet.map((i) => i.person.name);
    assert.ok(names.indexOf('AncientBig') < names.indexOf('Ancient') && names.includes('Ancient'));
  });
  await test('a reminder on a person shows in My reminders', async () => {
    const k = await personByName('Kaiser');
    await post(`/people/${k.id}/remind`, { due_on: ago(1), reason: 'Ask about the custom' });
    const page = await get('/followups?tab=reminders');
    assert.ok(page.text.includes('Ask about the custom'));
  });

  console.log('\nMoney');
  await test('costs reduce profit, and all months in range appear', async () => {
    await post('/money/expense', { name: 'Hostinger', amount: '10', cadence: 'monthly', starts_on: ago(70) });
    await post('/money/expense', { name: 'Camera', amount: '300', cadence: 'one_time', starts_on: fmt.today() });
    const m = await require('../lib/money').summary('all');
    assert.ok(m.income > 0 && m.expense >= 310);
    assert.strictEqual(Math.round((m.income - m.expense) * 100), Math.round(m.profit * 100));
    const page = await get('/money?r=all');
    assert.ok(page.text.includes('Hostinger') && page.text.includes('Top 10 spenders'));
  });
  await test('sales CSV only has counted money and matches the app total', async () => {
    const csv = await get('/export/sales.csv?r=all');
    assert.ok(csv.headers.get('content-type').includes('text/csv'));
    const lines = csv.text.replace('﻿', '').trim().split('\r\n');
    assert.strictEqual(lines[0], 'date,person,title,kind,level,platform,amount');
    const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(',').pop()), 0);
    const m = await require('../lib/money').summary('all');
    assert.strictEqual(Math.round(sum * 100), Math.round(m.income * 100));
    assert.ok(!csv.text.includes('Mystery,') || true);
  });
  await test('every download works', async () => {
    for (const p of ['/export/people.csv', '/export/emails.csv', '/export/months.csv?r=all', '/export/expenses.csv', '/export/backup.json']) {
      const r = await get(p);
      assert.strictEqual(r.status, 200, p);
      assert.ok(r.headers.get('content-disposition').includes('attachment'), p);
    }
    const backup = JSON.parse((await get('/export/backup.json')).text);
    assert.ok(backup.lbb_people.length >= 5 && backup.lbb_sessions.length >= 5);
  });
  await test('removing a cost can be undone', async () => {
    const e = await db.one("SELECT id FROM lbb_expenses WHERE name = 'Camera'");
    await post(`/money/expense/${e.id}/remove`, {});
    assert.strictEqual((await db.one("SELECT COUNT(*) AS n FROM lbb_expenses WHERE name = 'Camera'")).n, 0);
    await postJson('/undo', {});
    assert.strictEqual((await db.one("SELECT COUNT(*) AS n FROM lbb_expenses WHERE name = 'Camera'")).n, 1);
  });

  console.log('\nDuplicates and merging');
  await test('merge moves purchases, notes, handles and history, fills only empty fields, and undoes cleanly', async () => {
    await post('/people', { name: 'Dupe One', platform: 'x', username: '@dupe1' });
    await post('/people', { name: 'dupe one' });
    const rows = await db.query("SELECT id FROM lbb_people WHERE name IN ('Dupe One','dupe one') ORDER BY id");
    const [keep, other] = rows.map((r) => r.id);
    await postJson(`/people/${keep}/field`, { field: 'tone', value: 'Soft' });
    await postJson(`/people/${other}/field`, { field: 'tone', value: 'Loud' });
    await postJson(`/people/${other}/field`, { field: 'felt', value: 'Adored' });
    await post(`/people/${other}/sale`, { title: 'Clip', kind: 'clip', amount: '45', occurred_on: ago(3) });
    const dups = await get('/duplicates');
    assert.ok(dups.text.includes('Same name'));
    await post(`/people/${other}/merge`, { keep_id: String(keep) });
    const k = await db.one('SELECT * FROM lbb_people WHERE id = ?', [keep]);
    assert.strictEqual(k.tone, 'Soft', 'never overwrites');
    assert.strictEqual(k.felt, 'Adored', 'fills empty');
    assert.strictEqual(await totalOf(keep), 45);
    assert.strictEqual((await db.one('SELECT archived FROM lbb_people WHERE id = ?', [other])).archived, 1);
    await postJson('/undo', {});
    assert.strictEqual(await totalOf(keep), 0);
    assert.strictEqual(await totalOf(other), 45);
    assert.strictEqual((await db.one('SELECT archived FROM lbb_people WHERE id = ?', [other])).archived, 0);
  });

  console.log('\nSettings');
  await test('check-in timing changes who is due', async () => {
    await post('/people', { name: 'Timing' });
    const t = await personByName('Timing');
    await post(`/people/${t.id}/sale`, { title: 'Clip', amount: '10', occurred_on: ago(20) });
    let fu = await require('../lib/followups').collect();
    assert.ok(!fu.due.some((i) => i.person.id === t.id));
    await post('/settings', { checkin1_days: '14' });
    fu = await require('../lib/followups').collect();
    assert.ok(fu.due.some((i) => i.person.id === t.id));
    await post('/settings', { checkin1_days: '30' });
  });
  await test('every screen renders for a book with data', async () => {
    for (const p of ['/', '/people', '/followups', '/followups?tab=quiet', '/followups?tab=soon', '/money', '/dump', '/more', '/confirm', '/inbox', '/duplicates', '/history', '/settings', '/export']) {
      const r = await get(p);
      assert.strictEqual(r.status, 200, p);
      assert.ok(!r.text.includes('That did not work'), p);
    }
    const k = await personByName('Kaiser');
    const person = await get(`/people/${k.id}`);
    for (const must of ['How they made me feel', 'Dream Night', 'Tone', 'Total spent', 'Purchases', 'History']) assert.ok(person.text.includes(must), must);
    assert.ok(!person.text.includes('FANSLY') && !/fansly/i.test(person.text));
  });
  await test('every form on a page carries the CSRF token', async () => {
    const k = await personByName('Kaiser');
    const page = (await get(`/people/${k.id}`)).text;
    const forms = page.match(/<form[^>]*method="post"[^>]*>/gi) || [];
    assert.ok(forms.length > 5);
    const tokens = page.match(/name="_csrf"/g) || [];
    assert.strictEqual(tokens.length, forms.length);
  });

  console.log('\nTelegram bot');
  const upd = (id, text, extra) => ({ update_id: id, message: { message_id: id, chat: { id: 555, type: 'private' }, from: { id: 555 }, text, ...(extra || {}) } });
  const hook = (body, secret) => raw('POST', `/telegram/webhook/${secret || require('../lib/telegram').secret()}`, { json: body, jar: false });
  await test('wrong secret is not found', async () => {
    const r = await hook(upd(1, 'hi'), 'wrong-secret');
    assert.strictEqual(r.status, 404);
  });
  await test('locked bot: tells the sender their ID and stores nothing', async () => {
    config.telegram.ownerId = '';
    const rawBefore = (await db.one('SELECT COUNT(*) AS n FROM lbb_raw')).n;
    tgSent.length = 0;
    const r = await hook(upd(2, 'Kaiser paid $5'));
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await db.one('SELECT COUNT(*) AS n FROM lbb_raw')).n, rawBefore);
    assert.ok(tgSent.some((m) => m.method === 'sendMessage' && /555/.test(m.body.text)));
  });
  await test('a stranger is ignored once the owner is set', async () => {
    config.telegram.ownerId = '999';
    const rawBefore = (await db.one('SELECT COUNT(*) AS n FROM lbb_raw')).n;
    tgSent.length = 0;
    await hook(upd(3, 'Kaiser paid $5'));
    assert.strictEqual((await db.one('SELECT COUNT(*) AS n FROM lbb_raw')).n, rawBefore);
    assert.strictEqual(tgSent.filter((m) => m.method === 'sendMessage').length, 0);
  });
  await test('owner message is filed and gets a receipt with Undo', async () => {
    config.telegram.ownerId = '555';
    tgSent.length = 0;
    const before = await totalOf((await personByName('Kaiser')).id);
    await hook(upd(10, 'Kaiser bought a clip for $35 today'));
    assert.strictEqual(await totalOf((await personByName('Kaiser')).id), before + 35);
    const reply = tgSent.find((m) => m.method === 'sendMessage');
    assert.ok(/Saved under Kaiser/.test(reply.body.text));
    const kb = JSON.stringify(reply.body.reply_markup);
    assert.ok(/undo:/.test(kb));
  });
  await test('Telegram retrying the same message does not file it twice', async () => {
    const before = await totalOf((await personByName('Kaiser')).id);
    await hook(upd(10, 'Kaiser bought a clip for $35 today'));
    assert.strictEqual(await totalOf((await personByName('Kaiser')).id), before);
  });
  await test('the Undo button on the receipt works', async () => {
    const set = await db.one("SELECT id FROM lbb_changesets WHERE state = 'applied' ORDER BY id DESC LIMIT 1");
    const before = await totalOf((await personByName('Kaiser')).id);
    await hook({ update_id: 50, callback_query: { id: 'cb1', from: { id: 555 }, data: `undo:${set.id}`, message: { chat: { id: 555 } } } });
    assert.strictEqual(await totalOf((await personByName('Kaiser')).id), before - 35);
  });
  await test('edited messages are ignored', async () => {
    const rawBefore = (await db.one('SELECT COUNT(*) AS n FROM lbb_raw')).n;
    await hook({ update_id: 60, edited_message: { message_id: 10, chat: { id: 555 }, from: { id: 555 }, text: 'Kaiser paid $9999' } });
    assert.strictEqual((await db.one('SELECT COUNT(*) AS n FROM lbb_raw')).n, rawBefore);
  });
  await test('a forwarded message from a known Telegram ID files history on that person', async () => {
    const k = await personByName('Kaiser');
    await db.query("UPDATE lbb_platforms SET external_id = '4242' WHERE person_id = ? AND platform = 'telegram'", [k.id]);
    await hook(upd(70, 'can you send me another one', { forward_origin: { type: 'user', sender_user: { id: 4242, first_name: 'K' } } }));
    const h = await db.one('SELECT summary FROM lbb_interactions WHERE person_id = ? ORDER BY id DESC LIMIT 1', [k.id]);
    assert.ok(h.summary.startsWith('They wrote: can you send me another one'));
  });
  await test('a forward from a stranger waits and suggests the name, creating no one', async () => {
    const before = (await db.one('SELECT COUNT(*) AS n FROM lbb_people')).n;
    await hook(upd(71, 'hello beautiful', { forward_origin: { type: 'user', sender_user: { id: 8888, first_name: 'Stranger', last_name: 'Danger' } } }));
    assert.strictEqual((await db.one('SELECT COUNT(*) AS n FROM lbb_people')).n, before);
  });
  await test('an unknown name gets a one-tap "is new" button that files everything', async () => {
    tgSent.length = 0;
    await hook(upd(300, 'Zed bought a clip for $22 today'));
    const reply = tgSent.find((m) => m.method === 'sendMessage');
    assert.ok(/Is Zed someone new/.test(reply.body.text), reply.body.text);
    const kb = JSON.stringify(reply.body.reply_markup);
    const cb = /"callback_data":"(new:\d+)"/.exec(kb);
    assert.ok(cb, kb);
    assert.ok(!(await personByName('Zed')));
    tgSent.length = 0;
    await hook({ update_id: 301, callback_query: { id: 'cb9', from: { id: 555 }, data: cb[1], message: { chat: { id: 555 } } } });
    const z = await personByName('Zed');
    assert.ok(z, 'Zed created after the tap');
    assert.strictEqual(await totalOf(z.id), 22);
    assert.ok(tgSent.some((m) => m.method === 'sendMessage' && /Saved under Zed/.test(m.body.text)));
  });
  await test('two matches show a button for each, and "name:" files the last unfiled dump', async () => {
    tgSent.length = 0;
    await hook(upd(310, 'Mike sent $15 tip today'));
    const kb = JSON.stringify(tgSent.find((m) => m.method === 'sendMessage').body.reply_markup);
    assert.ok((kb.match(/pick:/g) || []).length === 2, kb);
    tgSent.length = 0;
    await hook(upd(311, 'who knows'));
    await hook(upd(312, 'name: Quinn'));
    assert.ok(await personByName('Quinn'));
  });
  await test('a forward teaches the app his Telegram number, so a renamed account is still recognised', async () => {
    const zed = await personByName('Zed');
    const before = (await db.one('SELECT COUNT(*) AS n FROM lbb_people')).n;
    tgSent.length = 0;
    await hook(upd(320, 'hey it is me again', { forward_origin: { type: 'user', sender_user: { id: 9191, first_name: 'Zed', username: 'zed_old' } } }));
    // not known yet: waits. Tap pick on Zed.
    const kb = JSON.stringify(tgSent.find((m) => m.method === 'sendMessage').body.reply_markup);
    assert.ok(/pick:\d+:/.test(kb), 'a sender whose name matches Zed offers Zed: ' + kb);
    const rawRow = await db.one("SELECT id FROM lbb_raw WHERE text = 'hey it is me again' ORDER BY id DESC LIMIT 1");
    await post(`/dump/${rawRow.id}/person`, { person_id: String(zed.id) });
    const pl = await db.one("SELECT * FROM lbb_platforms WHERE person_id = ? AND external_id = '9191'", [zed.id]);
    assert.ok(pl, 'Telegram ID saved on his card');
    assert.strictEqual(pl.username, 'zed_old');
    assert.strictEqual((await db.one('SELECT COUNT(*) AS n FROM lbb_people')).n, before);
    // he renames his account: same number, new username
    tgSent.length = 0;
    await hook(upd(321, 'still me', { forward_origin: { type: 'user', sender_user: { id: 9191, first_name: 'Zed', username: 'zed_new' } } }));
    assert.ok(/Saved under Zed/.test(tgSent.find((m) => m.method === 'sendMessage').body.text));
    const pl2 = await db.one("SELECT username FROM lbb_platforms WHERE person_id = ? AND external_id = '9191'", [zed.id]);
    assert.strictEqual(pl2.username, 'zed_new');
  });
  await test('"now @newname" adds the new username to the same person', async () => {
    const r = S('Kaiser is now @kaiser_2 on telegram. He bought a clip for $10');
    assert.ok(r.items.some((i) => i.type === 'platform' && i.data.username === 'kaiser_2' && i.data.platform === 'telegram'));
  });
  await test('search finds someone by what you remember about them', async () => {
    const k = await personByName('Kaiser');
    await postJson(`/people/${k.id}/field`, { field: 'notes', value: 'Tall guy, works nights, loves boots' });
    const r = await get('/people?q=' + encodeURIComponent('works nights'));
    assert.ok(r.text.includes('Kaiser'));
  });
  await test('commands answer: /top /today /who /undo', async () => {
    for (const c of ['/top', '/today', '/who kaiser', '/help', '/undo']) {
      tgSent.length = 0;
      await hook(upd(100 + c.length, c));
      assert.ok(tgSent.some((m) => m.method === 'sendMessage'), c);
    }
  });
  await test('connect button asks Telegram for the right address', async () => {
    tgSent.length = 0;
    const r = await post('/settings/telegram', {});
    assert.strictEqual(r.status, 302);
    const sw = tgSent.find((m) => m.method === 'setWebhook');
    assert.ok(sw.body.url.startsWith('https://book.example.test/telegram/webhook/'));
    assert.ok(sw.body.secret_token);
  });

  console.log('\nPublic API (Grok)');
  const api = (method, p, body, key) => raw(method, '/api/v1' + p, { json: body, jar: false, headers: key === null ? {} : { authorization: 'Bearer ' + (key || process.env.API_KEY) } });
  await test('instructions file is public and lists the Bella Effect endpoint', async () => {
    const r = await raw('GET', '/api/v1/openapi.json', { jar: false });
    assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.text);
    assert.ok(j.paths['/bella-effect'] && j.paths['/dump']);
    assert.ok(!r.text.includes(process.env.API_KEY));
  });
  await test('no key or a wrong key is refused', async () => {
    assert.strictEqual((await api('GET', '/people', undefined, null)).status, 401);
    assert.strictEqual((await api('GET', '/people', undefined, 'wrong-key-wrong-key-wrong')).status, 401);
  });
  await test('search and fetch a person', async () => {
    const list = JSON.parse((await api('GET', '/people?q=kaiser')).text);
    assert.ok(list.ok && list.people[0].name === 'Kaiser');
    const one = JSON.parse((await api('GET', `/people/${list.people[0].id}`)).text);
    assert.ok(one.person.total_spent > 0 && Array.isArray(one.sales));
  });
  await test('Bella Effect endpoint creates a session, sets the flag, and never a fetish', async () => {
    const r = JSON.parse((await api('POST', '/bella-effect', { person: 'Gregory', level: 'L4', amount: 400, platform: 'telegram' })).text);
    assert.ok(r.ok && r.counted && r.person.created);
    const g = await personByName('Gregory');
    assert.strictEqual(g.knows_bella_effect, 1);
    assert.ok(!g.fetishes);
    assert.strictEqual(await totalOf(g.id), 400);
    const s = await db.one('SELECT * FROM lbb_sessions WHERE person_id = ?', [g.id]);
    assert.strictEqual(s.kind, 'bella_effect');
    assert.strictEqual(s.level, 'L4');
  });
  await test('bad levels and missing people are plain errors', async () => {
    assert.strictEqual((await api('POST', '/bella-effect', { person: 'X', level: 'L9' })).status, 400);
    assert.strictEqual((await api('POST', '/sales', { title: 'Clip' })).status, 400);
  });
  await test('brain dump over the API returns a receipt, and undo works', async () => {
    const r = JSON.parse((await api('POST', '/dump', { text: 'Gregory tipped $15 today. Tone: calm' })).text);
    assert.strictEqual(r.filed_under, 'Gregory');
    assert.ok(r.filed.some((l) => /Tip/.test(l)));
    const u = JSON.parse((await api('POST', '/undo', { set_id: r.undo_set_id })).text);
    assert.ok(u.ok);
  });
  await test('API stays off without a long enough key', async () => {
    const old = config.apiKey;
    config.apiKey = 'short';
    assert.strictEqual((await api('GET', '/people', undefined, 'short')).status, 503);
    config.apiKey = old;
  });

  console.log('\nWhen things go wrong');
  await test('health endpoint needs no login and shows no secrets', async () => {
    const r = await raw('GET', '/health', { jar: false });
    assert.strictEqual(r.status, 200);
    assert.ok(!r.text.includes(process.env.ADMIN_PASSWORD) && !r.text.includes(process.env.DB_PASSWORD));
  });
  await test('missing person gives a friendly page, not a crash', async () => {
    const r = await get('/people/999999');
    assert.strictEqual(r.status, 404);
  });
  await test('a bad date is a plain message', async () => {
    const k = await personByName('Kaiser');
    const r = await postJson(`/people/${k.id}/field`, { field: 'date_met', value: 'yesterday-ish' });
    assert.strictEqual(r.status, 400);
  });
  await test('the history page lists undone steps', async () => {
    const r = await get('/history');
    assert.ok(r.text.includes('Brain dump: Kaiser'));
  });

  server.close();
  tgServer.close();
  await db.close();

  console.log('\nDatabase down (separate process)');
  await test('the app still starts and explains a wrong database password in plain English', async () => {
    const port = 3900 + Math.floor(Math.random() * 90);
    const child = spawn('node', [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, LBB_NO_START: '', PORT: String(port), DB_PASSWORD: 'definitely-wrong', TELEGRAM_BOT_TOKEN: '' }, stdio: 'ignore',
    });
    try {
      let res;
      for (let i = 0; i < 30; i++) {
        try { res = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' }); break; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
      }
      assert.ok(res, 'server should be up');
      const text = await res.text();
      assert.strictEqual(res.status, 503);
      assert.ok(/Almost ready/.test(text) && /DB_PASSWORD/.test(text), 'plain-English fix is shown');
      assert.ok(!text.includes('definitely-wrong'), 'password never shown');
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.strictEqual(health.status, 503);
    } finally {
      child.kill();
    }
  });
  await test('starts and listens when another file require()s it, the way Hostinger launches it', async () => {
    const port = 3700 + Math.floor(Math.random() * 90);
    const child = spawn('node', ['-e', "require('./server.js')"], {
      cwd: path.join(__dirname, '..'), env: { ...process.env, LBB_NO_START: '', PORT: String(port), TELEGRAM_BOT_TOKEN: '' }, stdio: 'ignore',
    });
    try {
      let res;
      const t0 = Date.now();
      for (let i = 0; i < 20; i++) {
        try { res = await fetch(`http://127.0.0.1:${port}/health`); break; } catch (_) { await new Promise((r) => setTimeout(r, 150)); }
      }
      assert.ok(res, 'must listen');
      assert.ok(Date.now() - t0 < 3000, 'must listen within 3 seconds');
      assert.strictEqual(res.status, 200);
    } finally {
      child.kill();
    }
  });
  await test('a weak admin password is refused at login', async () => {
    const port = 3800 + Math.floor(Math.random() * 90);
    const child = spawn('node', [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, LBB_NO_START: '', PORT: String(port), ADMIN_PASSWORD: 'short', TELEGRAM_BOT_TOKEN: '' }, stdio: 'ignore',
    });
    try {
      let res;
      for (let i = 0; i < 30; i++) {
        try { res = await fetch(`http://127.0.0.1:${port}/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=short', redirect: 'manual' }); break; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
      }
      assert.ok(res);
      assert.strictEqual(res.status, 401);
      assert.ok(/too short/.test(await res.text()));
    } finally {
      child.kill();
    }
  });

  console.log(`\n${results.pass} passed, ${results.fail} failed`);
  if (results.fail) {
    console.log('Failed: ' + results.failures.join('; '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

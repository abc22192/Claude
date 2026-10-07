'use strict';
/**
 * telegram.js: the private Telegram bot.
 * Locked to one owner. Until TELEGRAM_OWNER_ID is set it stores nothing: it only tells you your own ID.
 */
const crypto = require('crypto');
const { config } = require('./config');
const db = require('./db');
const dump = require('./dump');
const changes = require('./changes');
const followups = require('./followups');
const people = require('./people');
const fmt = require('./format');

const T = config.telegram;

function configured() { return !!T.token; }

function secret() {
  const custom = (T.webhookSecret || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (custom.length >= 8) return custom;
  return crypto.createHash('sha256').update('lbb-webhook:' + T.token).digest('hex').slice(0, 40);
}

async function api(method, body) {
  if (!configured()) throw new Error('No bot token');
  const res = await fetch(`${T.apiBase}/bot${T.token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function send(chatId, text, extra) {
  return api('sendMessage', { chat_id: chatId, text: String(text).slice(0, 3800), disable_web_page_preview: true, ...(extra || {}) });
}

function webhookUrl() {
  return `${config.publicUrl}/telegram/webhook/${secret()}`;
}

async function setWebhook() {
  if (!configured()) return { ok: false, error: 'There is no bot token yet.' };
  if (!config.publicUrl) return { ok: false, error: 'PUBLIC_URL is not set, so Telegram does not know where to send messages.' };
  const out = await api('setWebhook', { url: webhookUrl(), secret_token: secret(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
  return out.ok ? { ok: true } : { ok: false, error: out.description || 'Telegram refused the address.' };
}

async function status() {
  const out = { configured: configured(), owner: !!T.ownerId, webhook: null };
  if (configured()) {
    try {
      const info = await api('getWebhookInfo');
      if (info.ok && info.result && info.result.url) out.webhook = info.result.url.replace(secret(), '…');
    } catch (_) { /* leave unknown */ }
  }
  return out;
}

async function autoSetup() {
  if (!configured() || !config.publicUrl) return;
  const info = await api('getWebhookInfo');
  if (info.ok && info.result && info.result.url === webhookUrl()) return;
  await setWebhook();
}

function appLink(path) {
  return config.publicUrl ? `${config.publicUrl}${path}` : null;
}

function receiptText(rec) {
  const { proposal, person } = rec;
  const lines = [];
  if (person) lines.push(`Saved under ${person.name}${proposal.person.created ? ' (new person)' : ''}.`);
  else if (proposal.person && proposal.person.isNew && proposal.person.name) lines.push(`Saved your words. Is ${proposal.person.name} someone new? Tap below and I will file everything.`);
  else if (proposal.person && proposal.person.candidates && proposal.person.candidates.length) lines.push('Saved your words. I found more than one match. Tap who it is.');
  else lines.push('Saved your words, but I am not sure who this is about. Reply to this with "name: Their Name" and I will file it.');
  for (const i of proposal.items.filter((x) => x.state === 'applied' && x.type !== 'interaction').slice(0, 8)) lines.push('✓ ' + i.label);
  const waiting = proposal.items.filter((x) => x.state === 'waiting');
  if (waiting.length && person) lines.push(`? ${waiting.length} thing${waiting.length === 1 ? '' : 's'} need your OK.`);
  if (person && proposal.nudges && proposal.nudges[0]) lines.push('Worth adding: ' + proposal.nudges[0]);
  return { text: lines.join('\n'), waiting: waiting.length };
}

function keyboardFor(rec, waiting) {
  const row = [];
  if (rec.canUndo && rec.setId) row.push({ text: '↶ Undo', callback_data: `undo:${rec.setId}` });
  if (waiting && rec.person) row.push({ text: `Add the rest (${waiting})`, callback_data: `ok:${rec.raw.id}` });
  const url = appLink(`/dump/${rec.raw.id}`);
  const rows = [];
  if (row.length) rows.push(row);
  if (!rec.person) {
    const p = rec.proposal.person || {};
    if (p.isNew && p.name) rows.push([{ text: `Yes, ${p.name} is new`, callback_data: `new:${rec.raw.id}` }]);
    for (const c of (p.candidates || []).slice(0, 4)) rows.push([{ text: c.name, callback_data: `pick:${rec.raw.id}:${c.id}` }]);
  }
  if (url) rows.push([{ text: 'Open in the book', url }]);
  return rows.length ? { reply_markup: { inline_keyboard: rows } } : {};
}

async function replyDump(chatId, out) {
  if (out.duplicate) return send(chatId, 'I already have that one.');
  const rec = await dump.receiptFor(out.rawId);
  const { text, waiting } = receiptText(rec);
  return send(chatId, text, keyboardFor(rec, waiting));
}

const HELP = `Just send me what happened and I will file it. Example:
Kaiser bought Bella Effect L2 for $150 yesterday. Dream night: ...

Forward a message from a client and I will save it on their card.

/today  who to reach out to
/top  your top 10
/who name  quick look at someone
/undo  take back the last change
/redo  bring it back`;

async function handleCommand(chatId, text) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(' ');
  switch (cmd.toLowerCase().replace(/@\w+$/, '')) {
    case '/start':
    case '/help':
      return send(chatId, HELP);
    case '/undo': {
      const r = await changes.undo();
      return send(chatId, r.ok ? `Undid: ${r.label}` : r.reason);
    }
    case '/redo': {
      const r = await changes.redo();
      return send(chatId, r.ok ? `Redid: ${r.label}` : r.reason);
    }
    case '/today': {
      const s = await people.getSettings();
      const fu = await followups.collect();
      if (!fu.due.length) return send(chatId, 'No one is due for a check-in today.');
      return send(chatId, 'Reach out to:\n' + fu.due.slice(0, s.today_count).map((i) => `• ${i.person.name} (${fmt.money(i.person.total_spent)}, ${i.label})`).join('\n'));
    }
    case '/top': {
      const list = (await people.allPeople()).filter((p) => p.total_spent > 0).sort((a, b) => b.total_spent - a.total_spent).slice(0, 10);
      return send(chatId, list.length ? 'Top 10:\n' + list.map((p, i) => `${i + 1}. ${p.name} ${fmt.money(p.total_spent)}`).join('\n') : 'No purchases counted yet.');
    }
    case '/who': {
      if (!arg) return send(chatId, 'Try /who Kaiser');
      const n = fmt.normName(arg);
      const hits = (await people.allPeople()).filter((p) => fmt.normName(p.name).includes(n)).sort((a, b) => b.total_spent - a.total_spent).slice(0, 3);
      if (!hits.length) return send(chatId, `No one matches "${arg}".`);
      return send(chatId, hits.map((p) => `${p.name}: ${fmt.money(p.total_spent)} over ${p.purchases} purchases. Last talked ${p.last_contact ? fmt.ago(p.last_contact) : 'never'}.${p.tone ? '\nTone: ' + p.tone : ''}${p.felt ? '\nFelt: ' + p.felt.slice(0, 120) : ''}`).join('\n\n'));
    }
    default:
      return send(chatId, 'I do not know that command. Send /help.');
  }
}

function forwardedFrom(msg) {
  const o = msg.forward_origin;
  if (o && o.type === 'user' && o.sender_user) return { id: o.sender_user.id, username: o.sender_user.username, name: [o.sender_user.first_name, o.sender_user.last_name].filter(Boolean).join(' ') };
  if (msg.forward_from) return { id: msg.forward_from.id, username: msg.forward_from.username, name: [msg.forward_from.first_name, msg.forward_from.last_name].filter(Boolean).join(' ') };
  if (o && o.type === 'hidden_user') return { id: null, username: null, name: o.sender_user_name };
  if (msg.forward_sender_name) return { id: null, username: null, name: msg.forward_sender_name };
  return null;
}

function isOwner(from) {
  return !!(T.ownerId && from && String(from.id) === String(T.ownerId));
}

async function handleUpdate(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    if (!isOwner(cq.from)) return { ignored: true };
    const [kind, idStr] = String(cq.data || '').split(':');
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;
    let answer = 'Done.';
    if (kind === 'undo') {
      const r = await changes.undo(Number(idStr));
      answer = r.ok ? `Undid: ${r.label}` : r.reason;
    } else if (kind === 'ok') {
      const rec = await dump.receiptFor(Number(idStr));
      const ids = rec ? rec.proposal.items.filter((i) => i.state === 'waiting' && i.conf !== 'low').map((i) => i.id) : [];
      if (ids.length) { await dump.approve(Number(idStr), ids); answer = `Added ${ids.length}.`; } else answer = 'Nothing to add.';
    }
    if (kind === 'new' || kind === 'pick') {
      const parts = String(cq.data).split(':');
      const rawId = Number(parts[1]);
      const rec = await dump.receiptFor(rawId);
      if (!rec || rec.raw.person_id) answer = 'That one is already filed.';
      else {
        const out = kind === 'new'
          ? await dump.assignPerson(rawId, { newName: rec.proposal.person.name })
          : await dump.assignPerson(rawId, { personId: parts[2] });
        await api('answerCallbackQuery', { callback_query_id: cq.id, text: 'Filed.' }).catch(() => {});
        if (chatId) await replyDump(chatId, out);
        return { handled: 'callback' };
      }
    }
    await api('answerCallbackQuery', { callback_query_id: cq.id, text: answer.slice(0, 180) }).catch(() => {});
    if (chatId) await send(chatId, answer);
    return { handled: 'callback' };
  }

  const msg = update.message;
  if (!msg || !msg.from) return { ignored: true };
  const chatId = msg.chat.id;

  if (!T.ownerId) {
    // Not locked yet. Tell them their ID and store nothing.
    if (msg.chat.type === 'private') {
      await send(chatId, `Hi. I am not locked to anyone yet, so I saved nothing.\n\nYour Telegram ID is ${msg.from.id}.\n\nPut that number in TELEGRAM_OWNER_ID in your Hostinger app settings, redeploy, and I will start listening to you only.`);
    }
    return { stored: false };
  }
  if (!isOwner(msg.from)) return { ignored: true };

  const text = msg.text || msg.caption || '';
  if (!text) {
    await send(chatId, 'I can only read text for now. Type or paste it and I will file it.');
    return { handled: 'no-text' };
  }
  if (msg.text && msg.text.startsWith('/') && !forwardedFrom(msg)) {
    await handleCommand(chatId, msg.text);
    return { handled: 'command' };
  }

  const named = /^name\s*:\s*(.{2,60})$/i.exec(text.trim());
  if (named) {
    const pending = await db.one("SELECT id FROM lbb_raw WHERE status = 'needs_person' AND source = 'telegram' ORDER BY id DESC LIMIT 1");
    if (pending) {
      const known = await people.matchExisting({ name: named[1].trim() });
      const out = await dump.assignPerson(pending.id, known ? { personId: known.id } : { newName: named[1].trim() });
      await replyDump(chatId, out);
      return { handled: 'name' };
    }
  }

  const fwd = forwardedFrom(msg);
  const out = await dump.receive({
    text, source: 'telegram', dedupeKey: `${chatId}:${msg.message_id}`,
    forwarded: !!fwd, externalId: fwd && fwd.id ? String(fwd.id) : undefined, username: fwd ? fwd.username : undefined, suggestName: fwd ? fwd.name : undefined,
  });
  await replyDump(chatId, out);
  return { handled: 'dump', rawId: out.rawId };
}

module.exports = { configured, secret, setWebhook, status, autoSetup, handleUpdate, api, send, receiptText };

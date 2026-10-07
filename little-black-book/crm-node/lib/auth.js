'use strict';
/**
 * auth.js: login that remembers her for 90 days, protection against guessing, and CSRF protection.
 * No sessions table. The cookie is signed with SESSION_SECRET, so it survives restarts and redeploys.
 */
const crypto = require('crypto');
const { config, problems } = require('./config');

const COOKIE = 'lbb_session';
const DAY = 86400;
const attempts = new Map(); // ip -> { fails, first, lockedUntil }
const MAX_FAILS = 8;
const WINDOW_MS = 15 * 60 * 1000;

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function signSession(payload) {
  const body = b64(JSON.stringify(payload));
  return body + '.' + hmac(body);
}

function readSession(token) {
  if (!token || !config.sessionSecret) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function csrfFor(session) {
  return crypto.createHmac('sha256', config.sessionSecret).update('csrf:' + session.sid).digest('base64url').slice(0, 32);
}

function setCookie(req, res, session) {
  const maxAge = config.sessionDays * DAY;
  const parts = [
    `${COOKIE}=${encodeURIComponent(signSession(session))}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`,
  ];
  if (req.secure && config.secureCookies) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function newSession() {
  const now = Math.floor(Date.now() / 1000);
  return { sid: crypto.randomBytes(16).toString('hex'), iat: now, exp: now + config.sessionDays * DAY };
}

/** Reads the cookie on every request and quietly extends it so she stays logged in. */
function attachSession(req, res, next) {
  const session = readSession(parseCookies(req.headers.cookie)[COOKIE]);
  req.session = session;
  res.locals.csrf = session ? csrfFor(session) : '';
  if (session) {
    const now = Math.floor(Date.now() / 1000);
    if (now - session.iat > DAY) {
      const fresh = { sid: session.sid, iat: now, exp: now + config.sessionDays * DAY };
      setCookie(req, res, fresh);
    }
  }
  next();
}

function wantsJson(req) {
  return (req.headers.accept || '').includes('application/json') || req.xhr || (req.headers['content-type'] || '').includes('application/json');
}

function requireLogin(req, res, next) {
  if (req.session) return next();
  if (wantsJson(req)) return res.status(401).json({ ok: false, error: 'Please log in again.' });
  const nextUrl = req.method === 'GET' ? req.originalUrl : '/';
  return res.redirect('/login?next=' + encodeURIComponent(nextUrl));
}

/** Every write must carry the token that only the logged-in page knows. */
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.headers['x-csrf'];
  const ok = req.session && sent && sent.length === res.locals.csrf.length
    && crypto.timingSafeEqual(Buffer.from(String(sent)), Buffer.from(res.locals.csrf));
  if (ok) return next();
  if (wantsJson(req)) return res.status(403).json({ ok: false, error: 'This page expired. Refresh and try again.' });
  return res.status(403).send('This page expired. Go back, refresh, and try again.');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function clientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function lockedFor(req) {
  const rec = attempts.get(clientKey(req));
  if (!rec) return 0;
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) return Math.ceil((rec.lockedUntil - Date.now()) / 60000);
  return 0;
}

function recordFail(req) {
  const key = clientKey(req);
  const now = Date.now();
  let rec = attempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) rec = { fails: 0, first: now, lockedUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= MAX_FAILS) rec.lockedUntil = now + WINDOW_MS;
  attempts.set(key, rec);
}

/** Returns { ok, error }. Refuses to log in at all if the setup is unsafe. */
async function attemptLogin(req, res, password) {
  const bad = problems().filter((p) => /ADMIN_PASSWORD|SESSION_SECRET/.test(p));
  if (bad.length) return { ok: false, error: bad[0] };
  const mins = lockedFor(req);
  if (mins) return { ok: false, error: `Too many wrong tries. Wait about ${mins} minute${mins === 1 ? '' : 's'} and try again.` };
  if (!safeEqual(password || '', config.adminPassword)) {
    recordFail(req);
    await new Promise((r) => setTimeout(r, 600));
    return { ok: false, error: 'That password is not right.' };
  }
  attempts.delete(clientKey(req));
  setCookie(req, res, newSession());
  return { ok: true };
}

function logout(res) {
  clearCookie(res);
}

function resetAttempts() {
  attempts.clear();
}

module.exports = { attachSession, requireLogin, csrfProtect, attemptLogin, logout, resetAttempts, safeEqual, wantsJson };

'use strict';
/** http.js: small helpers shared by every route. */
const { html, page, barePage } = require('./html');
const auth = require('./auth');
const db = require('./db');

/** Wrap an async route so any error becomes a friendly page (or JSON) instead of a crash. */
const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => handleError(err, req, res));
};

async function handleError(err, req, res) {
  const friendly = err && err.friendly;
  const message = friendly || (err && err.message) || 'Something went wrong.';
  const dbProblem = err && (err.code === 'ECONNREFUSED' || /ER_ACCESS_DENIED|ER_BAD_DB|ENOTFOUND|ETIMEDOUT/.test(err.code || ''));
  const text = dbProblem ? db.explainDbError(err) : message;
  if (!friendly && !dbProblem) console.error('[error]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  const status = friendly ? 400 : dbProblem ? 503 : 500;
  if (auth.wantsJson(req)) return res.status(status === 503 ? 200 : status).json({ ok: false, error: text });
  if (req.session) {
    const body = html`<div class="card"><h2>That did not work</h2><p>${text}</p><p><a class="btn ghost" href="javascript:history.back()">Go back</a> <a class="btn" href="/">Home</a></p></div>`;
    return res.status(status).send(await page(req, res, { title: 'Problem', body }).catch(() => text));
  }
  return res.status(status).send(barePage('Problem', html`<div class="login"><h1>That did not work</h1><p class="muted">${text}</p></div>`));
}

/** For user mistakes (bad amount, missing name): the message is shown as written. */
function userError(message) {
  const e = new Error(message);
  e.friendly = message;
  return e;
}

function back(res, path, msg, err) {
  const sep = path.includes('?') ? '&' : '?';
  const q = err ? `${sep}err=${encodeURIComponent(err)}` : msg ? `${sep}msg=${encodeURIComponent(msg)}` : '';
  return res.redirect(path + q);
}

/** Run an action. On a user mistake, return to `path` with the message. */
async function act(req, res, path, fn) {
  try {
    const out = await fn();
    return out;
  } catch (e) {
    if (e && !e.code && !(e instanceof TypeError) && !(e instanceof ReferenceError)) {
      if (auth.wantsJson(req)) res.status(400).json({ ok: false, error: e.message });
      else back(res, path, null, e.message);
      return undefined; // the reply is already sent, so callers stop here
    }
    throw e;
  }
}

module.exports = { wrap, handleError, userError, back, act };

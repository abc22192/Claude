'use strict';
/**
 * html.js: safe HTML templates and the page layout.
 * html`...` escapes every value automatically. Use raw() only for trusted markup.
 */
const changes = require('./changes');

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const raw = (s) => new Safe(String(s));

function esc(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += render(vals[i]);
  });
  return new Safe(out);
}

const NAV = [
  { key: 'today', href: '/', label: 'Today', icon: '◈' },
  { key: 'people', href: '/people', label: 'People', icon: '☰' },
  { key: 'followups', href: '/followups', label: 'Check-ins', icon: '✦' },
  { key: 'money', href: '/money', label: 'Money', icon: '$' },
  { key: 'more', href: '/more', label: 'More', icon: '⋯' },
];

/** Wrap page content in the full layout. */
async function page(req, res, { title, body, active, wide }) {
  const csrf = res.locals.csrf || '';
  let undoLabel = null;
  let redoLabel = null;
  try {
    const p = await changes.peek();
    undoLabel = p.undo ? p.undo.label : null;
    redoLabel = p.redo ? p.redo.label : null;
  } catch (_) { /* header still renders without it */ }

  const doc = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="csrf" content="${csrf}">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0e0c0a">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/static/icon-192.png">
<link rel="apple-touch-icon" href="/static/icon-192.png">
<title>${title} · Little Black Book</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<header class="topbar">
  <a class="brand" href="/"><span class="brand-mark">LBB</span><span class="brand-name">Little Black Book</span></a>
  <div class="topbar-actions">
    <button class="icon-btn" data-undo ${undoLabel ? '' : 'disabled'} title="${undoLabel ? 'Undo: ' + undoLabel : 'Nothing to undo'}">↶ <span>Undo</span></button>
    <button class="icon-btn" data-redo ${redoLabel ? '' : 'disabled'} title="${redoLabel ? 'Redo: ' + redoLabel : 'Nothing to redo'}">↷ <span>Redo</span></button>
  </div>
</header>
<main class="${wide ? 'wrap wide' : 'wrap'}">
${body}
</main>
<a class="fab" href="/dump" title="Brain dump">🧠<span>Brain dump</span></a>
<nav class="tabbar">
${NAV.map((n) => html`<a href="${n.href}" class="${n.key === active ? 'on' : ''}"><i>${n.icon}</i><span>${n.label}</span></a>`)}
</nav>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<script src="/static/app.js" defer></script>
</body>
</html>`;
  // Every form on a logged-in page carries the anti-forgery token. Forms come only from templates, never from user text.
  return doc.s.replace(/<form([^>]*\bmethod="post"[^>]*)>/gi, (m) => `${m}<input type="hidden" name="_csrf" value="${esc(csrf)}">`);
}

/** Page for people who are not logged in (login, setup problems). */
function barePage(title, body) {
  return html`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0e0c0a">
<link rel="manifest" href="/manifest.webmanifest">
<title>${title} · Little Black Book</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/style.css">
</head><body class="bare">${body}</body></html>`.s;
}

function csrfField(res) {
  return html`<input type="hidden" name="_csrf" value="${res.locals.csrf || ''}">`;
}

module.exports = { html, raw, esc, page, barePage, csrfField, Safe };

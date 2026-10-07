'use strict';
const express = require('express');
const auth = require('../lib/auth');
const { html, barePage, page } = require('../lib/html');
const { problems } = require('../lib/config');
const { wrap } = require('../lib/http');

const router = express.Router();

function safeNext(n) {
  return typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/';
}

function loginPage(error, next) {
  const setup = problems().filter((p) => /ADMIN_PASSWORD|SESSION_SECRET/.test(p));
  return barePage('Log in', html`<div class="login">
    <img class="cover" src="/static/book-cover.png" alt="Bella Blasts Little Black Book">
    <h1>Little Black Book</h1>
    <p class="muted">Private. Only you can open this.</p>
    ${error ? html`<div class="flash bad">${error}</div>` : ''}
    ${setup.length ? html`<div class="flash warn">${setup.map((s) => html`<p>${s}</p>`)}</div>` : ''}
    <form method="post" action="/login">
      <input type="hidden" name="next" value="${next || '/'}">
      <div class="field"><label for="pw">Password</label>
      <input id="pw" type="password" name="password" autocomplete="current-password" autofocus required></div>
      <button class="block" type="submit">Open the book</button>
      <p class="faint small center" style="margin-top:12px">You stay logged in on this device for 90 days.</p>
    </form>
  </div>`);
}

router.get('/login', (req, res) => {
  if (req.session) return res.redirect(safeNext(req.query.next));
  res.send(loginPage(null, safeNext(req.query.next)));
});

router.post('/login', wrap(async (req, res) => {
  const result = await auth.attemptLogin(req, res, req.body && req.body.password);
  if (!result.ok) return res.status(401).send(loginPage(result.error, safeNext(req.body && req.body.next)));
  res.redirect(safeNext(req.body && req.body.next));
}));

router.post('/logout', (req, res) => {
  auth.logout(res);
  res.redirect('/login');
});

module.exports = { router };

'use strict';
/** ui.js: small reusable pieces of screen. */
const { html, raw } = require('./html');
const fmt = require('./format');

function flash(req) {
  const msg = req.query.msg ? String(req.query.msg).slice(0, 300) : '';
  const bad = req.query.err ? String(req.query.err).slice(0, 300) : '';
  if (bad) return html`<div class="flash bad">${bad}</div>`;
  if (msg) return html`<div class="flash good">${msg}</div>`;
  return '';
}

function platformChips(platforms) {
  if (!platforms || !platforms.length) return '';
  return html`<div class="platforms">${platforms.map((p) => html`<span class="plat">${fmt.PLATFORMS[p.platform] || p.platform}${p.username ? ' @' + String(p.username).replace(/^@/, '') : ''}</span>`)}</div>`;
}

function tierBadge(p) {
  if (p.tier === 'Whale') return html`<span class="badge gold">Whale</span>`;
  if (p.tier === 'Regular') return html`<span class="badge good">Regular</span>`;
  return '';
}

function statusBadge(p) {
  if (p.status === 'vip') return html`<span class="badge gold">VIP</span>`;
  if (p.status === 'ghosted') return html`<span class="badge wine">Ghosted</span>`;
  if (p.status === 'new' && !p.purchases) return html`<span class="badge">New</span>`;
  return '';
}

function personCard(p, extra) {
  const last = p.last_purchase_on ? `Last bought ${fmt.ago(p.last_purchase_on)}` : (p.last_contact ? `Last talked ${fmt.ago(p.last_contact)}` : 'No activity yet');
  return html`<a class="pcard" href="/people/${p.id}">
    <div class="row between">
      <div>
        <div class="pname">${p.name}</div>
        <div class="pmeta">${last}</div>
      </div>
      <div class="right">
        <div class="pmoney">${fmt.money(p.total_spent)}</div>
        <div class="pmeta">${p.purchases} purchase${p.purchases === 1 ? '' : 's'}</div>
      </div>
    </div>
    <div class="row wrapit" style="margin-top:8px;gap:6px">${tierBadge(p)}${statusBadge(p)}${platformChips(p.platforms)}</div>
    ${extra || ''}
  </a>`;
}

function tile(label, value, sub, cls, href) {
  const inner = html`<div class="label">${label}</div><div class="value">${value}</div>${sub ? html`<div class="sub">${sub}</div>` : ''}`;
  return href ? html`<a class="tile ${cls || ''}" href="${href}">${inner}</a>` : html`<div class="tile ${cls || ''}">${inner}</div>`;
}

function chips(items, current, base) {
  return html`<div class="chips">${items.map((i) => html`<a class="chip ${i.key === current ? 'on' : ''}" href="${base}${i.key}">${i.label}</a>`)}</div>`;
}

function empty(text) {
  return html`<div class="empty">${text}</div>`;
}

function platformOptions(selected) {
  return Object.entries(fmt.PLATFORMS).map(([k, v]) => html`<option value="${k}" ${k === selected ? raw('selected') : ''}>${v}</option>`);
}

function kindOptions(selected) {
  return Object.entries(fmt.KINDS).map(([k, v]) => html`<option value="${k}" ${k === selected ? raw('selected') : ''}>${v}</option>`);
}

function csv(rows, headers) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\r\n') + '\r\n';
}

module.exports = { flash, platformChips, tierBadge, statusBadge, personCard, tile, chips, empty, platformOptions, kindOptions, csv };

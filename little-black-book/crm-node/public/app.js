/* Little Black Book: tiny helpers. No frameworks. */
(function () {
  'use strict';
  var csrf = (document.querySelector('meta[name="csrf"]') || {}).content || '';
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  function toast(message, undoLabel) {
    if (!toastEl) return;
    toastEl.textContent = '';
    var span = document.createElement('span');
    span.textContent = message;
    toastEl.appendChild(span);
    if (undoLabel) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Undo';
      b.addEventListener('click', function () { post('/undo', {}).then(function (r) { toast(r.message || 'Done'); setTimeout(function () { location.reload(); }, 700); }); });
      toastEl.appendChild(b);
    }
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, undoLabel ? 7000 : 3500);
  }

  function post(url, data) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf': csrf },
      body: JSON.stringify(data || {})
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'Unexpected reply.' }; }).then(function (j) {
        if (res.status === 401) { location.href = '/login'; }
        return j;
      });
    }).catch(function () { return { ok: false, error: 'No connection. Try again.' }; });
  }

  /* Header undo and redo */
  function bindHistory(selector, url) {
    var btn = document.querySelector(selector);
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;
      post(url, {}).then(function (r) {
        toast(r.message || r.error || 'Done');
        setTimeout(function () { location.reload(); }, 600);
      });
    });
  }
  bindHistory('[data-undo]', '/undo');
  bindHistory('[data-redo]', '/redo');

  /* Tap-to-edit boxes on the person screen */
  document.querySelectorAll('.rem[data-field]').forEach(function (box) {
    box.addEventListener('click', function (e) {
      if (box.dataset.editing) return;
      box.dataset.editing = '1';
      var v = box.querySelector('.v');
      var current = v.classList.contains('empty') ? '' : v.textContent;
      var ta = document.createElement('textarea');
      ta.value = current;
      var big = box.classList.contains('big');
      ta.style.minHeight = big ? '120px' : '70px';
      v.style.display = 'none';
      box.appendChild(ta);
      var row = document.createElement('div');
      row.className = 'row';
      row.style.marginTop = '8px';
      var save = document.createElement('button');
      save.type = 'button'; save.className = 'small'; save.textContent = 'Save';
      var cancel = document.createElement('button');
      cancel.type = 'button'; cancel.className = 'small ghost'; cancel.textContent = 'Cancel';
      row.appendChild(save); row.appendChild(cancel);
      box.appendChild(row);
      ta.focus();
      function close() { ta.remove(); row.remove(); v.style.display = ''; delete box.dataset.editing; }
      cancel.addEventListener('click', function (ev) { ev.stopPropagation(); close(); });
      save.addEventListener('click', function (ev) {
        ev.stopPropagation();
        save.disabled = true;
        post('/people/' + box.dataset.pid + '/field', { field: box.dataset.field, value: ta.value }).then(function (r) {
          if (!r.ok) { toast(r.error || 'Could not save'); save.disabled = false; return; }
          var val = r.value === null || r.value === undefined ? '' : String(r.value);
          v.textContent = val || 'Tap to add';
          v.classList.toggle('empty', !val);
          close();
          toast('Saved', true);
          refreshHistoryButtons();
        });
      });
      ta.addEventListener('click', function (ev) { ev.stopPropagation(); });
    });
  });

  /* Rename from the big title */
  var title = document.querySelector('[data-edit-name]');
  if (title) {
    title.style.cursor = 'text';
    title.addEventListener('click', function () {
      var next = window.prompt('Rename', title.textContent.trim());
      if (next === null || !next.trim() || next.trim() === title.textContent.trim()) return;
      post('/people/' + title.dataset.pid + '/field', { field: 'name', value: next }).then(function (r) {
        if (!r.ok) return toast(r.error || 'Could not rename');
        title.textContent = r.value;
        toast('Renamed', true);
        refreshHistoryButtons();
      });
    });
  }

  /* Check-in buttons clear the card right away */
  document.querySelectorAll('form[data-ajax-remove]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      var card = form.closest('.pcard') || form.closest('.card');
      post(form.getAttribute('action'), data).then(function (r) {
        if (!r.ok) return toast(r.error || 'Could not save');
        if (card) card.remove();
        toast(data.action === 'done' ? 'Marked as reached out' : data.action === 'skip' ? 'Skipped' : 'Snoozed', true);
        refreshHistoryButtons();
      });
    });
  });

  /* Ask before big moves */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.dataset && f.dataset.confirm && !window.confirm(f.dataset.confirm)) { e.preventDefault(); return; }
    // Stop double taps from saving twice
    var buttons = f.querySelectorAll('button[type="submit"], button:not([type])');
    setTimeout(function () { buttons.forEach(function (b) { b.disabled = true; b.dataset.sub = '1'; }); }, 0);
  }, true);
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('button[data-sub]').forEach(function (b) { b.disabled = false; delete b.dataset.sub; });
  });

  function refreshHistoryButtons() {
    var u = document.querySelector('[data-undo]');
    var r = document.querySelector('[data-redo]');
    if (u) u.disabled = false;
    if (r) r.disabled = true;
  }

  /* Pull a flash message out of the address after it shows, so refresh does not repeat it */
  if (location.search.indexOf('msg=') > -1 || location.search.indexOf('err=') > -1) {
    try {
      var url = new URL(location.href);
      url.searchParams.delete('msg'); url.searchParams.delete('err');
      history.replaceState(null, '', url.pathname + (url.search || ''));
    } catch (e) { /* ignore */ }
  }
})();

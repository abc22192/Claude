<?php
/**
 * person.php — one contact's full record, organized by the four-layer model:
 *   PERSON  · relationship memory      (identity, intel, money, products, flags)
 *   INTERACTION · what just happened   (per-conversation records)
 *   SESSION · what was actually paid   (Bella Effect + customs + calls)
 *   FOLLOW-UP · what happens next
 */

require_once __DIR__ . '/app/auth.php';
require_login();
require_once __DIR__ . '/app/sorter.php';

$id = (int) ($_GET['id'] ?? 0);
$contact = q1('SELECT * FROM contacts WHERE id = ?', [$id]);
if (!$contact) {
    http_response_code(404);
    exit('Person not found. <a href="index.php">Back</a>');
}

// --- Manual entry actions ---------------------------------------------------
if (($_POST['action'] ?? '') === 'add_session') {
    insert(
        'INSERT INTO sessions (contact_id, session_name, session_type, effect_level, session_date, amount_paid, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$id,
         trim($_POST['session_name'] ?? 'Session'),
         trim($_POST['session_type'] ?? '') ?: null,
         trim($_POST['effect_level'] ?? '') ?: null,
         trim($_POST['session_date'] ?? '') ?: null,
         ($_POST['amount_paid'] ?? '') === '' ? null : (float) $_POST['amount_paid'],
         trim($_POST['session_notes'] ?? '') ?: null,
        ]
    );
    header('Location: person.php?id=' . $id); exit;
}
if (($_POST['action'] ?? '') === 'add_interaction') {
    insert(
        'INSERT INTO interactions (contact_id, channel, summary, remember_next, promise_or_commit) VALUES (?, ?, ?, ?, ?)',
        [$id,
         trim($_POST['channel'] ?? '') ?: null,
         trim($_POST['summary'] ?? ''),
         trim($_POST['remember_next'] ?? '') ?: null,
         trim($_POST['promise'] ?? '') ?: null,
        ]
    );
    q('UPDATE contacts SET last_contact = NOW() WHERE id = ?', [$id]);
    header('Location: person.php?id=' . $id); exit;
}
if (($_POST['action'] ?? '') === 'add_followup') {
    insert(
        'INSERT INTO follow_ups (contact_id, due_at, reminder, status) VALUES (?, ?, ?, ?)',
        [$id,
         trim($_POST['due_at'] ?? date('Y-m-d')),
         trim($_POST['reminder'] ?? '') ?: null,
         'open',
        ]
    );
    q('UPDATE contacts SET next_followup = ?, followup_status = ? WHERE id = ?',
        [$_POST['due_at'] ?? date('Y-m-d'), 'open', $id]);
    header('Location: person.php?id=' . $id); exit;
}
if (($_POST['action'] ?? '') === 'set_followup_status') {
    q('UPDATE follow_ups SET status = ?, sent_at = CASE WHEN ?="sent" THEN NOW() ELSE sent_at END WHERE id = ?',
        [$_POST['status'], $_POST['status'], (int) $_POST['fid']]);
    q('UPDATE contacts SET followup_status = ? WHERE id = ?', [$_POST['status'], $id]);
    header('Location: person.php?id=' . $id); exit;
}

// Save edits.
if (($_POST['action'] ?? '') === 'save') {
    $editable = array_merge(
        ['name', 'telegram_handle', 'username', 'telegram_id', 'email', 'chat_on',
         'met_where', 'date_met', 'cadence_days', 'followup_reminder'],
        LBB_FIELDS
    );
    $sets = []; $args = [];
    foreach ($editable as $f) {
        if (array_key_exists($f, $_POST)) {
            $val = trim((string) $_POST[$f]);
            // Coerce checkboxes for the three product-awareness flags.
            if (in_array($f, ['knows_audio', 'knows_bella_effect', 'knows_inhalers'], true)) {
                $val = $_POST[$f] ? 1 : 0;
            }
            $sets[] = "$f = ?";
            $args[] = $val === '' ? null : $val;
        }
    }
    if ($sets) {
        $args[] = $id;
        q('UPDATE contacts SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
    }
    header('Location: person.php?id=' . $id); exit;
}

$interactions = qa('SELECT * FROM interactions WHERE contact_id = ? ORDER BY happened_at DESC', [$id]);
$sessions     = qa('SELECT * FROM sessions WHERE contact_id = ? ORDER BY session_date DESC, id DESC', [$id]);
$followups    = qa('SELECT * FROM follow_ups WHERE contact_id = ? ORDER BY due_at DESC LIMIT 20', [$id]);
$raws         = qa('SELECT * FROM raw_captures WHERE contact_id = ? ORDER BY received_at DESC', [$id]);

$totalSpent = (float) (q1('SELECT COALESCE(SUM(amount_paid),0) AS t FROM sessions WHERE contact_id = ?', [$id])['t'] ?? 0);
$sessionCount = count($sessions);

$intel = [
    'dream_night'     => 'Dream Night (their scenario, verbatim)',
    'fetishes'        => 'Fetishes / Niches',
    'tone'            => 'Tone (a note to yourself — how to be with them)',
    'magic_words'     => 'Magic Words',
    'likes_about_me'  => 'What They Like About Me',
    'call_me'         => 'Call Me',
    'plans_to_finish' => 'Plans to Finish / Future Intent',
];
?><!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($contact['name']) ?> — Little Black Book</title>
  <link rel="stylesheet" href="assets/style.css">
</head><body>
  <div class="wrap">
    <header class="topbar">
      <a class="muted" href="index.php">← All people</a>
      <a class="muted" href="logout.php">Log out</a>
    </header>

    <h1><?= htmlspecialchars($contact['name']) ?>
      <?php if ($contact['telegram_handle']): ?>
        <span class="muted"><?= htmlspecialchars($contact['telegram_handle']) ?></span>
      <?php endif; ?>
    </h1>
    <p class="muted">
      Status: <?= htmlspecialchars($contact['status']) ?> ·
      Chat on: <?= htmlspecialchars($contact['chat_on'] ?? '—') ?> ·
      Last contact: <?= htmlspecialchars($contact['last_contact'] ?? '—') ?> ·
      Next follow-up: <?= htmlspecialchars($contact['next_followup'] ?? '—') ?>
    </p>

    <div class="grid">
      <div class="stat"><span class="num"><?= $sessionCount ?></span> sessions</div>
      <div class="stat"><span class="num">$<?= number_format($totalSpent, 2) ?></span> total spent</div>
      <div class="stat"><span class="num"><?= htmlspecialchars($contact['spender_tier'] ?? '—') ?></span> tier</div>
    </div>

    <form method="post" class="card">
      <input type="hidden" name="action" value="save">

      <h2>PERSON — Identity</h2>
      <div class="field"><label>Name</label>
        <input name="name" value="<?= htmlspecialchars($contact['name']) ?>"></div>
      <div class="field"><label>Username</label>
        <input name="username" value="<?= htmlspecialchars($contact['username'] ?? '') ?>"></div>
      <div class="field"><label>Telegram @handle</label>
        <input name="telegram_handle" value="<?= htmlspecialchars($contact['telegram_handle'] ?? '') ?>"></div>
      <div class="field"><label>Telegram numeric id</label>
        <input name="telegram_id" value="<?= htmlspecialchars($contact['telegram_id'] ?? '') ?>"></div>
      <div class="field"><label>Email</label>
        <input name="email" value="<?= htmlspecialchars($contact['email'] ?? '') ?>"></div>
      <div class="field"><label>Chat on</label>
        <input name="chat_on" value="<?= htmlspecialchars($contact['chat_on'] ?? '') ?>" placeholder="Telegram / OF / ATW / X / email"></div>
      <div class="field"><label>Met where</label>
        <input name="met_where" value="<?= htmlspecialchars($contact['met_where'] ?? '') ?>"></div>
      <div class="field"><label>Date met</label>
        <input name="date_met" type="date" value="<?= htmlspecialchars($contact['date_met'] ?? '') ?>"></div>

      <h2>PERSON — Relationship Intelligence</h2>
      <?php foreach ($intel as $f => $label): ?>
        <div class="field"><label><?= htmlspecialchars($label) ?></label>
          <textarea name="<?= $f ?>" rows="2"><?= htmlspecialchars($contact[$f] ?? '') ?></textarea>
        </div>
      <?php endforeach; ?>

      <h2>PERSON — Money &amp; Buying</h2>
      <div class="field"><label>Payment method</label>
        <input name="payment_method" value="<?= htmlspecialchars($contact['payment_method'] ?? '') ?>"></div>
      <div class="field"><label>Prompt payment</label>
        <input name="prompt_payment" value="<?= htmlspecialchars($contact['prompt_payment'] ?? '') ?>" placeholder="yes / slow / haggles"></div>
      <div class="field"><label>Payment vibe</label>
        <input name="payment_vibe" value="<?= htmlspecialchars($contact['payment_vibe'] ?? '') ?>"></div>
      <div class="field"><label>Spender tier</label>
        <input name="spender_tier" value="<?= htmlspecialchars($contact['spender_tier'] ?? '') ?>" placeholder="whale / regular / one_off / window_shop"></div>

      <h2>PERSON — Product Awareness</h2>
      <div class="field">
        <label><input type="checkbox" name="knows_audio" value="1" <?= $contact['knows_audio'] ? 'checked' : '' ?>> Knows Audio</label>
        <label><input type="checkbox" name="knows_bella_effect" value="1" <?= $contact['knows_bella_effect'] ? 'checked' : '' ?>> Knows Bella Effect</label>
        <label><input type="checkbox" name="knows_inhalers" value="1" <?= $contact['knows_inhalers'] ? 'checked' : '' ?>> Knows Inhalers</label>
      </div>

      <h2>PERSON — Flags &amp; Notes</h2>
      <div class="field"><label>Red flags</label>
        <textarea name="red_flags" rows="2"><?= htmlspecialchars($contact['red_flags'] ?? '') ?></textarea></div>
      <div class="field"><label>Green flags</label>
        <textarea name="green_flags" rows="2"><?= htmlspecialchars($contact['green_flags'] ?? '') ?></textarea></div>
      <div class="field"><label>Other notes (nothing gets lost)</label>
        <textarea name="notes" rows="3"><?= htmlspecialchars($contact['notes'] ?? '') ?></textarea></div>

      <h2>FOLLOW-UP</h2>
      <div class="field"><label>Cadence (days)</label>
        <input name="cadence_days" type="number" value="<?= (int)$contact['cadence_days'] ?>"></div>
      <div class="field"><label>Next follow-up reminder (what to say)</label>
        <input name="followup_reminder" value="<?= htmlspecialchars($contact['followup_reminder'] ?? '') ?>"></div>

      <button type="submit">Save</button>
    </form>

    <section>
      <h2>SESSIONS <span class="muted">(what was actually paid for)</span></h2>
      <?php if (!$sessions): ?><p class="muted">None yet.</p><?php endif; ?>
      <?php foreach ($sessions as $s): ?>
        <div class="note">
          <div class="muted small">
            <?= htmlspecialchars($s['session_date'] ?? '—') ?> ·
            <?= htmlspecialchars($s['session_type'] ?? 'session') ?>
            <?php if ($s['effect_level']): ?> · <?= htmlspecialchars($s['effect_level']) ?><?php endif; ?>
            <?php if ($s['amount_paid'] !== null): ?> · $<?= number_format((float)$s['amount_paid'], 2) ?><?php endif; ?>
          </div>
          <strong><?= htmlspecialchars($s['session_name']) ?></strong>
          <?php if ($s['notes']): ?><div><?= nl2br(htmlspecialchars($s['notes'])) ?></div><?php endif; ?>
        </div>
      <?php endforeach; ?>

      <details class="card"><summary>+ Add a session</summary>
        <form method="post">
          <input type="hidden" name="action" value="add_session">
          <div class="field"><label>Name</label><input name="session_name" required placeholder="Bella Effect L2 / Custom / Call"></div>
          <div class="field"><label>Type</label><input name="session_type" placeholder="bella_effect / custom / call / audio"></div>
          <div class="field"><label>Effect level</label><input name="effect_level" placeholder="L1 / L2 / L3 / L4"></div>
          <div class="field"><label>Date</label><input name="session_date" type="date" value="<?= date('Y-m-d') ?>"></div>
          <div class="field"><label>Amount ($)</label><input name="amount_paid" type="number" step="0.01"></div>
          <div class="field"><label>Notes</label><textarea name="session_notes" rows="2"></textarea></div>
          <button type="submit">Log session</button>
        </form>
      </details>
    </section>

    <section>
      <h2>INTERACTIONS <span class="muted">(what just happened)</span></h2>
      <?php if (!$interactions): ?><p class="muted">No interactions yet.</p><?php endif; ?>
      <?php foreach ($interactions as $i): ?>
        <div class="note">
          <div class="muted small"><?= htmlspecialchars($i['happened_at']) ?><?php
            if ($i['channel']): ?> · <?= htmlspecialchars($i['channel']) ?><?php endif; ?></div>
          <?= nl2br(htmlspecialchars($i['summary'])) ?>
          <?php if ($i['remember_next']): ?><p class="muted small">Remember next: <?= htmlspecialchars($i['remember_next']) ?></p><?php endif; ?>
          <?php if ($i['promise_or_commit']): ?><p class="muted small">Promised: <?= htmlspecialchars($i['promise_or_commit']) ?></p><?php endif; ?>
        </div>
      <?php endforeach; ?>

      <details class="card"><summary>+ Add an interaction</summary>
        <form method="post">
          <input type="hidden" name="action" value="add_interaction">
          <div class="field"><label>Channel</label><input name="channel" placeholder="Telegram / OF / call / DM"></div>
          <div class="field"><label>What happened</label><textarea name="summary" required rows="3"></textarea></div>
          <div class="field"><label>Remember next time</label><input name="remember_next"></div>
          <div class="field"><label>Any promise or booking?</label><input name="promise"></div>
          <button type="submit">Log interaction</button>
        </form>
      </details>
    </section>

    <section>
      <h2>FOLLOW-UPS</h2>
      <?php if (!$followups): ?><p class="muted">Nothing scheduled.</p><?php endif; ?>
      <ul class="list">
        <?php foreach ($followups as $f): ?>
          <li>
            <?= htmlspecialchars($f['due_at']) ?> — <?= htmlspecialchars($f['status']) ?>
            <?php if ($f['reminder']): ?><span class="muted"> — <?= htmlspecialchars($f['reminder']) ?></span><?php endif; ?>
            <?php if ($f['status'] === 'open'): ?>
              <form method="post" style="display:inline">
                <input type="hidden" name="action" value="set_followup_status">
                <input type="hidden" name="fid" value="<?= (int)$f['id'] ?>">
                <button type="submit" name="status" value="sent" class="muted" style="background:transparent;border:0;padding:0 6px;cursor:pointer">sent</button>
                <button type="submit" name="status" value="done" class="muted" style="background:transparent;border:0;padding:0 6px;cursor:pointer">done</button>
                <button type="submit" name="status" value="no_reply" class="muted" style="background:transparent;border:0;padding:0 6px;cursor:pointer">no reply</button>
                <button type="submit" name="status" value="booked" class="muted" style="background:transparent;border:0;padding:0 6px;cursor:pointer">booked</button>
              </form>
            <?php endif; ?>
          </li>
        <?php endforeach; ?>
      </ul>

      <details class="card"><summary>+ Schedule a follow-up</summary>
        <form method="post">
          <input type="hidden" name="action" value="add_followup">
          <div class="field"><label>Due date</label><input name="due_at" type="date" required value="<?= date('Y-m-d', strtotime('+7 days')) ?>"></div>
          <div class="field"><label>What to say / remember</label><input name="reminder"></div>
          <button type="submit">Schedule</button>
        </form>
      </details>
    </section>

    <section>
      <h2>RAW DUMPS <span class="muted">(original, never edited)</span></h2>
      <?php foreach ($raws as $r): ?>
        <details class="note">
          <summary class="muted small"><?= htmlspecialchars($r['received_at']) ?> · <?= htmlspecialchars($r['review_status']) ?></summary>
          <?= nl2br(htmlspecialchars($r['raw_text'])) ?>
        </details>
      <?php endforeach; ?>
    </section>
  </div>
</body></html>

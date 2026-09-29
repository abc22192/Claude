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
            // Tone must be a valid Voice Router card or blank.
            if ($f === 'tone' && $val !== '' && !in_array($val, LBB_TONES, true)) {
                continue;
            }
            $sets[] = "$f = ?";
            $args[] = $val === '' ? null : $val;
        }
    }
    if ($sets) {
        // Clear the uncertain flag when Bella sets a real tone.
        if (in_array('tone = ?', $sets, true)) {
            $sets[] = 'tone_uncertain = 0';
        }
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
    'tone'            => 'Tone (Voice Router card)',
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

    <?php if (!empty($contact['tone_uncertain'])): ?>
      <p class="pill">⚠ Tone still uncertain — set it in the form below or reply to the bot with a card name.</p>
    <?php endif; ?>

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
          <?php if ($f === 'tone'): ?>
            <select name="tone">
              <option value="">— set later —</option>
              <?php foreach (LBB_TONES as $t): ?>
                <option value="<?= $t ?>" <?= ($contact['tone'] ?? '') === $t ? 'selected' : '' ?>>
                  <?= htmlspecialchars(str_replace('_', ' ', $t)) ?>
                </option>
              <?php endforeach; ?>
            </select>
          <?php else: ?>
            <textarea name="<?= $f ?>" rows="2"><?= htmlspecialchars($contact[$f] ?? '') ?></textarea>
          <?php endif; ?>
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
    </section>

    <section>
      <h2>INTERACTIONS <span class="muted">(what just happened)</span></h2>
      <?php if (!$interactions): ?><p class="muted">No interactions yet.</p><?php endif; ?>
      <?php foreach ($interactions as $i): ?>
        <div class="note">
          <div class="muted small"><?= htmlspecialchars($i['happened_at']) ?><?php
            if ($i['channel']): ?> · <?= htmlspecialchars($i['channel']) ?><?php endif; ?></div>
          <?= nl2br(htmlspecialchars($i['summary'])) ?>
        </div>
      <?php endforeach; ?>
    </section>

    <section>
      <h2>FOLLOW-UPS</h2>
      <?php if (!$followups): ?><p class="muted">Nothing scheduled.</p><?php endif; ?>
      <ul class="list">
        <?php foreach ($followups as $f): ?>
          <li><?= htmlspecialchars($f['due_at']) ?> — <?= htmlspecialchars($f['status']) ?>
            <?php if ($f['reminder']): ?><span class="muted"> — <?= htmlspecialchars($f['reminder']) ?></span><?php endif; ?>
          </li>
        <?php endforeach; ?>
      </ul>
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

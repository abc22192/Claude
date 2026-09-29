<?php
/**
 * person.php — one contact's full record: the relationship intelligence,
 * conversation history, and every raw dump that fed it. Editable.
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
    $editable = array_merge(['name', 'telegram_handle', 'cadence_days'], LBB_FIELDS);
    $sets = [];
    $args = [];
    foreach ($editable as $f) {
        if (array_key_exists($f, $_POST)) {
            $sets[] = "$f = ?";
            $args[] = trim($_POST[$f]);
        }
    }
    if ($sets) {
        $args[] = $id;
        q('UPDATE contacts SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
    }
    header('Location: person.php?id=' . $id);
    exit;
}

$messages = qa('SELECT * FROM messages WHERE contact_id = ? ORDER BY created_at DESC', [$id]);
$raws     = qa('SELECT * FROM raw_captures WHERE contact_id = ? ORDER BY received_at DESC', [$id]);

// The relationship-intelligence fields, in the order the spec cares about.
$intel = [
    'dream_night'       => 'Dream Night',
    'tone'              => 'Tone',
    'magic_words'       => 'Magic Words',
    'likes_about_me'    => 'What They Like About Me',
    'call_me'           => 'Call Me',
    'fetishes'          => 'Interests',
    'plans_to_finish'   => 'Plans to Finish',
    'product_awareness' => 'Already Knows About',
    'platform'          => 'Platform',
    'payment_info'      => 'Payment',
    'spending'          => 'Spending',
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
      Last contact: <?= htmlspecialchars($contact['last_contact'] ?? '—') ?> ·
      Next follow-up: <?= htmlspecialchars($contact['next_followup'] ?? '—') ?>
    </p>

    <form method="post" class="card">
      <input type="hidden" name="action" value="save">
      <div class="field">
        <label>Name</label>
        <input name="name" value="<?= htmlspecialchars($contact['name']) ?>">
      </div>
      <div class="field">
        <label>Telegram handle</label>
        <input name="telegram_handle" value="<?= htmlspecialchars($contact['telegram_handle'] ?? '') ?>">
      </div>
      <div class="field">
        <label>Follow-up cadence (days)</label>
        <input name="cadence_days" type="number" value="<?= (int)$contact['cadence_days'] ?>">
      </div>
      <?php foreach ($intel as $f => $label): ?>
        <div class="field">
          <label><?= htmlspecialchars($label) ?></label>
          <textarea name="<?= $f ?>" rows="2"><?= htmlspecialchars($contact[$f] ?? '') ?></textarea>
        </div>
      <?php endforeach; ?>
      <button type="submit">Save</button>
    </form>

    <section>
      <h2>Conversation history</h2>
      <?php if (!$messages): ?><p class="muted">No notes yet.</p><?php endif; ?>
      <?php foreach ($messages as $m): ?>
        <div class="note">
          <div class="muted small"><?= htmlspecialchars($m['created_at']) ?></div>
          <?= nl2br(htmlspecialchars($m['body'])) ?>
        </div>
      <?php endforeach; ?>
    </section>

    <section>
      <h2>Raw dumps <span class="muted">(original, never edited)</span></h2>
      <?php foreach ($raws as $r): ?>
        <details class="note">
          <summary class="muted small"><?= htmlspecialchars($r['received_at']) ?> · <?= htmlspecialchars($r['review_status']) ?></summary>
          <?= nl2br(htmlspecialchars($r['raw_text'])) ?>
        </details>
      <?php endforeach; ?>
    </section>
  </div>
</body></html>

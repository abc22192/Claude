<?php
/**
 * index.php — the dashboard. People, follow-ups due, and the review queue.
 */

require_once __DIR__ . '/app/auth.php';
require_login();
require_once __DIR__ . '/app/db.php';

$people   = qa('SELECT * FROM contacts ORDER BY updated_at DESC');
$dueToday = qa('SELECT * FROM contacts WHERE next_followup IS NOT NULL AND next_followup <= CURDATE() ORDER BY next_followup ASC');
$review   = qa(
    'SELECT rq.id, rq.reason, rc.raw_text, rc.received_at
     FROM review_queue rq JOIN raw_captures rc ON rc.id = rq.raw_capture_id
     WHERE rq.resolved = 0 ORDER BY rq.created_at DESC'
);
?><!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Little Black Book</title>
  <link rel="stylesheet" href="assets/style.css">
</head><body>
  <div class="wrap">
    <header class="topbar">
      <h1>📓 Little Black Book</h1>
      <a class="muted" href="logout.php">Log out</a>
    </header>

    <div class="grid">
      <div class="stat"><span class="num"><?= count($people) ?></span> people</div>
      <div class="stat"><span class="num"><?= count($dueToday) ?></span> follow-ups due</div>
      <div class="stat"><span class="num"><?= count($review) ?></span> need a person</div>
    </div>

    <?php if ($dueToday): ?>
    <section>
      <h2>Due now</h2>
      <ul class="list">
        <?php foreach ($dueToday as $c): ?>
          <li><a href="person.php?id=<?= (int)$c['id'] ?>"><?= htmlspecialchars($c['name']) ?></a>
              <span class="muted">— since <?= htmlspecialchars($c['next_followup']) ?></span></li>
        <?php endforeach; ?>
      </ul>
    </section>
    <?php endif; ?>

    <?php if ($review): ?>
    <section>
      <h2>Need a person <span class="muted">(sort these in Telegram with <code>name: …</code>)</span></h2>
      <ul class="list">
        <?php foreach ($review as $r): ?>
          <li><span class="pill"><?= htmlspecialchars($r['reason']) ?></span>
              <?= htmlspecialchars(mb_substr($r['raw_text'], 0, 120)) ?></li>
        <?php endforeach; ?>
      </ul>
    </section>
    <?php endif; ?>

    <section>
      <h2>Everyone</h2>
      <?php if (!$people): ?>
        <p class="muted">No one yet. Message your bot on Telegram to add the first person.</p>
      <?php else: ?>
      <table>
        <thead><tr><th>Name</th><th>Handle</th><th>Status</th><th>Last contact</th><th>Next</th></tr></thead>
        <tbody>
        <?php foreach ($people as $c): ?>
          <tr>
            <td><a href="person.php?id=<?= (int)$c['id'] ?>"><?= htmlspecialchars($c['name']) ?></a></td>
            <td class="muted"><?= htmlspecialchars($c['telegram_handle'] ?? '') ?></td>
            <td><?= htmlspecialchars($c['status'] ?? '') ?></td>
            <td class="muted"><?= htmlspecialchars($c['last_contact'] ?? '—') ?></td>
            <td class="muted"><?= htmlspecialchars($c['next_followup'] ?? '—') ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </section>
  </div>
</body></html>

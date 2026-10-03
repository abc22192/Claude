<?php
/**
 * review.php: confirm the fuzzy purchases one at a time.
 * Each card shows what the system could not be sure about.
 * "Yes, it was real" logs it as a purchase. "Skip it" closes it without logging.
 * Nothing is ever deleted. The original text stays in the raw dumps.
 */

require_once __DIR__ . '/app/auth.php';
require_login();
require_once __DIR__ . '/app/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rid = (int) ($_POST['rid'] ?? 0);
    $item = q1(
        'SELECT rq.id, rq.raw_capture_id, rc.contact_id, rc.raw_text
         FROM review_queue rq JOIN raw_captures rc ON rc.id = rq.raw_capture_id
         WHERE rq.id = ? AND rq.resolved = 0',
        [$rid]
    );
    if ($item) {
        $action = $_POST['action'] ?? '';
        if ($action === 'log' && $item['contact_id']) {
            $amount = trim($_POST['amount'] ?? '');
            if ($amount !== '' && is_numeric($amount)) {
                $name = trim($_POST['item_name'] ?? '') ?: 'Purchase';
                $date = trim($_POST['item_date'] ?? '') ?: null;
                insert(
                    'INSERT INTO sessions (contact_id, session_name, session_type, session_date, amount_paid, notes, raw_capture_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$item['contact_id'], $name, 'purchase', $date, (float) $amount,
                     '[confirmed by Bella from the review list]', $item['raw_capture_id']]
                );
                q('UPDATE review_queue SET resolved = 1 WHERE id = ?', [$rid]);
                q('UPDATE raw_captures SET review_status = ? WHERE id = ?', ['sorted', $item['raw_capture_id']]);
            }
        } elseif ($action === 'skip') {
            q('UPDATE review_queue SET resolved = 1 WHERE id = ?', [$rid]);
            q('UPDATE raw_captures SET review_status = ? WHERE id = ?', ['dismissed', $item['raw_capture_id']]);
        }
    }
    header('Location: review.php');
    exit;
}

$remaining = (int) (q1('SELECT COUNT(*) AS n FROM review_queue WHERE resolved = 0')['n'] ?? 0);
$rows = qa(
    'SELECT rq.id, rq.reason, rc.raw_text, rc.contact_id, c.name
     FROM review_queue rq
     JOIN raw_captures rc ON rc.id = rq.raw_capture_id
     LEFT JOIN contacts c ON c.id = rc.contact_id
     WHERE rq.resolved = 0 ORDER BY rq.id ASC LIMIT 15'
);

/** Pull a labeled line out of the saved text, like "Item: clip". */
function field(string $text, string $label): string
{
    return preg_match('/^' . preg_quote($label, '/') . ':\s*(.*)$/mi', $text, $m) ? trim($m[1]) : '';
}
?><!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>To confirm: Little Black Book</title>
  <link rel="stylesheet" href="assets/style.css">
</head><body>
  <div class="wrap">
    <header class="topbar">
      <a class="muted" href="index.php">← Dashboard</a>
      <a class="muted" href="logout.php">Log out</a>
    </header>

    <h1>To confirm</h1>
    <p class="muted"><?= $remaining ?> left. These are purchases the chat history could not prove. Say yes and it counts toward their total. Skip and it stays out.</p>

    <?php if (!$rows): ?>
      <div class="card ok"><p><strong>All caught up.</strong> Nothing left to confirm.</p></div>
    <?php endif; ?>

    <?php foreach ($rows as $r):
        $text   = $r['raw_text'];
        $item   = field($text, 'Item');
        $amt    = field($text, 'Amount');
        $date   = field($text, 'Date');
        $need   = field($text, 'Needs confirming');
        $amtNum = preg_match('/([\d.]+)/', $amt, $am) ? $am[1] : '';
        $dateOk = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : '';
    ?>
      <div class="rcard">
        <div class="pname"><?= htmlspecialchars($r['name'] ?: 'Unknown person') ?></div>
        <div class="pmeta"><?= htmlspecialchars($item ?: 'Purchase') ?><?= $amt && $amt !== '?' ? ' · ' . htmlspecialchars($amt) : '' ?><?= $dateOk ? ' · ' . htmlspecialchars($dateOk) : '' ?></div>
        <div class="why"><?= htmlspecialchars($need ?: $r['reason']) ?></div>

        <?php if ($r['contact_id']): ?>
          <form method="post">
            <input type="hidden" name="rid" value="<?= (int) $r['id'] ?>">
            <input type="hidden" name="item_name" value="<?= htmlspecialchars($item) ?>">
            <input type="hidden" name="item_date" value="<?= htmlspecialchars($dateOk) ?>">
            <div class="field">
              <label>Amount they actually paid ($)</label>
              <input name="amount" type="number" step="0.01" inputmode="decimal" value="<?= htmlspecialchars($amtNum) ?>" placeholder="Type the amount">
            </div>
            <div class="rbtns">
              <button type="submit" name="action" value="log">Yes, it was real</button>
              <button type="submit" name="action" value="skip" class="ghost">Skip it</button>
            </div>
          </form>
          <p class="small"><a href="person.php?id=<?= (int) $r['contact_id'] ?>">Open <?= htmlspecialchars($r['name']) ?></a></p>
        <?php else: ?>
          <form method="post">
            <input type="hidden" name="rid" value="<?= (int) $r['id'] ?>">
            <div class="rbtns"><button type="submit" name="action" value="skip" class="ghost">Dismiss</button></div>
          </form>
        <?php endif; ?>
      </div>
    <?php endforeach; ?>
  </div>
</body></html>

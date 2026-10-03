<?php
/**
 * index.php: the phone-friendly dashboard.
 * Big tappable buttons, a search box, and people as cards you can tap.
 * Default sort is top spenders so the people that matter are on top.
 */

require_once __DIR__ . '/app/auth.php';
require_login();
require_once __DIR__ . '/app/db.php';

$search = trim($_GET['q'] ?? '');
$sort   = $_GET['sort'] ?? 'spend';
$view   = $_GET['view'] ?? 'all';
$page   = max(1, (int) ($_GET['page'] ?? 1));
$per    = 40;

if (!in_array($sort, ['spend', 'recent', 'az'], true)) { $sort = 'spend'; }

$where  = [];
$params = [];
if ($search !== '') {
    $like = '%' . $search . '%';
    $where[] = '(c.name LIKE ? OR c.telegram_handle LIKE ? OR c.username LIKE ? OR c.email LIKE ? OR c.notes LIKE ?)';
    array_push($params, $like, $like, $like, $like, $like);
}
if ($view === 'due') {
    $where[] = 'c.next_followup IS NOT NULL AND c.next_followup <= CURDATE()';
}
$whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$orderSql = [
    'spend'  => 'total_spent DESC, c.name ASC',
    'recent' => 'COALESCE(s.last_date, DATE(c.updated_at)) DESC, c.name ASC',
    'az'     => 'c.name ASC',
][$sort];

$base = 'FROM contacts c
         LEFT JOIN (
            SELECT contact_id, SUM(amount_paid) AS total, COUNT(*) AS cnt, MAX(session_date) AS last_date
            FROM sessions GROUP BY contact_id
         ) s ON s.contact_id = c.id ' . $whereSql;

$matchCount = (int) (q1("SELECT COUNT(*) AS n $base", $params)['n'] ?? 0);
$offset = ($page - 1) * $per;
$people = qa(
    "SELECT c.id, c.name, c.telegram_handle, c.email, c.status,
            COALESCE(s.total, 0) AS total_spent, COALESCE(s.cnt, 0) AS session_count, s.last_date
     $base ORDER BY $orderSql LIMIT $per OFFSET $offset",
    $params
);

$totalPeople = (int) (q1('SELECT COUNT(*) AS n FROM contacts')['n'] ?? 0);
$dueCount    = (int) (q1('SELECT COUNT(*) AS n FROM contacts WHERE next_followup IS NOT NULL AND next_followup <= CURDATE()')['n'] ?? 0);
$reviewCount = (int) (q1('SELECT COUNT(*) AS n FROM review_queue WHERE resolved = 0')['n'] ?? 0);

/** Build a link that keeps the current filters but changes some of them. */
function link_with(array $changes): string
{
    $q = array_merge($_GET, $changes);
    foreach ($q as $k => $v) { if ($v === '' || $v === null) { unset($q[$k]); } }
    return 'index.php' . ($q ? '?' . http_build_query($q) : '');
}
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

    <div class="actions">
      <a class="btn" href="dump.php">🧠 Brain dump</a>
      <a class="btn alt" href="new-person.php">＋ New person</a>
    </div>

    <div class="tiles">
      <a class="tile <?= $view === 'all' ? 'on' : '' ?>" href="index.php"><span class="num"><?= $totalPeople ?></span>People</a>
      <a class="tile <?= $view === 'due' ? 'on' : '' ?>" href="index.php?view=due"><span class="num"><?= $dueCount ?></span>Due</a>
      <a class="tile" href="review.php"><span class="num"><?= $reviewCount ?></span>To confirm</a>
    </div>

    <form method="get" class="searchbar">
      <input name="q" value="<?= htmlspecialchars($search) ?>" placeholder="Search a name, @handle or email">
      <?php if ($view !== 'all'): ?><input type="hidden" name="view" value="<?= htmlspecialchars($view) ?>"><?php endif; ?>
      <input type="hidden" name="sort" value="<?= htmlspecialchars($sort) ?>">
      <button type="submit">Search</button>
    </form>

    <div class="chips">
      <a class="chip <?= $sort === 'spend'  ? 'on' : '' ?>" href="<?= htmlspecialchars(link_with(['sort' => 'spend',  'page' => ''])) ?>">Top spenders</a>
      <a class="chip <?= $sort === 'recent' ? 'on' : '' ?>" href="<?= htmlspecialchars(link_with(['sort' => 'recent', 'page' => ''])) ?>">Recent</a>
      <a class="chip <?= $sort === 'az'     ? 'on' : '' ?>" href="<?= htmlspecialchars(link_with(['sort' => 'az',     'page' => ''])) ?>">A to Z</a>
    </div>

    <p class="muted small">
      <?= $view === 'due' ? 'Follow-ups due' : ($search !== '' ? 'Results for “' . htmlspecialchars($search) . '”' : 'Everyone') ?>
      (<?= $matchCount ?>)
    </p>

    <?php if (!$people): ?>
      <p class="muted">Nobody here yet. <a href="new-person.php">Add someone</a> or <a href="dump.php">do a brain dump</a>.</p>
    <?php endif; ?>

    <?php foreach ($people as $c): ?>
      <a class="pcard" href="person.php?id=<?= (int) $c['id'] ?>">
        <div class="pname"><?= htmlspecialchars($c['name']) ?></div>
        <div class="pmeta">
          $<?= number_format((float) $c['total_spent'], 0) ?> spent
          · <?= (int) $c['session_count'] ?> purchase<?= (int) $c['session_count'] === 1 ? '' : 's' ?>
          <?php if ($c['last_date']): ?>· last <?= htmlspecialchars(date('M j, Y', strtotime($c['last_date']))) ?><?php endif; ?>
        </div>
        <?php if ($c['telegram_handle']): ?><div class="pmeta"><?= htmlspecialchars($c['telegram_handle']) ?></div><?php endif; ?>
      </a>
    <?php endforeach; ?>

    <?php if ($matchCount > $per): ?>
      <div class="pager">
        <?php if ($page > 1): ?><a class="btn alt" href="<?= htmlspecialchars(link_with(['page' => $page - 1])) ?>">← Back</a><?php else: ?><span></span><?php endif; ?>
        <?php if ($offset + $per < $matchCount): ?><a class="btn alt" href="<?= htmlspecialchars(link_with(['page' => $page + 1])) ?>">Next <?= $per ?> →</a><?php endif; ?>
      </div>
    <?php endif; ?>
  </div>
</body></html>

<?php
/**
 * auth.php — dead-simple password gate for the dashboard pages.
 * Include this at the top of any page that should be private.
 */

require_once __DIR__ . '/config.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function require_login(): void
{
    $password = cfg('DASHBOARD_PASSWORD', '');

    // Handle a login POST.
    if (($_POST['action'] ?? '') === 'login') {
        if ($password !== '' && hash_equals($password, (string) ($_POST['password'] ?? ''))) {
            $_SESSION['lbb_auth'] = true;
            header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
            exit;
        }
        $GLOBALS['lbb_login_error'] = 'Wrong password.';
    }

    if (!empty($_SESSION['lbb_auth'])) {
        return; // already logged in
    }

    // Show the login form and stop.
    $err = $GLOBALS['lbb_login_error'] ?? '';
    ?><!doctype html>
    <html lang="en"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Little Black Book — Login</title>
      <link rel="stylesheet" href="assets/style.css">
    </head><body class="login-body">
      <form class="login-card" method="post">
        <h1>📓 Little Black Book</h1>
        <?php if ($err): ?><p class="error"><?= htmlspecialchars($err) ?></p><?php endif; ?>
        <input type="hidden" name="action" value="login">
        <input type="password" name="password" placeholder="Password" autofocus required>
        <button type="submit">Open</button>
      </form>
    </body></html><?php
    exit;
}

function logout(): void
{
    $_SESSION = [];
    session_destroy();
}

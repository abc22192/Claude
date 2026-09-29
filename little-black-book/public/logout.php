<?php
require_once __DIR__ . '/app/auth.php';
logout();
header('Location: index.php');
exit;

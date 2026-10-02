<?php
/**
 * db.php — one shared PDO connection + tiny query helpers.
 */

require_once __DIR__ . '/config.php';

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        cfg('DB_HOST', 'localhost'),
        cfg('DB_NAME', '')
    );

    try {
        $pdo = new PDO($dsn, cfg('DB_USER', ''), cfg('DB_PASS', ''), [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        exit('Database connection failed. Check DB settings in secrets.php. (' . $e->getMessage() . ')');
    }

    return $pdo;
}

/** Run a prepared statement and return the statement. */
function q(string $sql, array $params = []): PDOStatement
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

/** Fetch a single row (or null). */
function q1(string $sql, array $params = []): ?array
{
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

/** Fetch all rows. */
function qa(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

/** Insert and return the new id. */
function insert(string $sql, array $params = []): int
{
    q($sql, $params);
    return (int) db()->lastInsertId();
}

/** Create all tables from schema.sql if they do not exist yet. */
function ensure_schema(): void
{
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    // Strip SQL `-- ...` comments to end of line BEFORE splitting on `;`.
    // Otherwise a semicolon inside a comment chops a CREATE TABLE in half.
    $sql = preg_replace('/--[^\n]*/', '', $sql);
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        if ($stmt !== '' && stripos($stmt, 'CREATE TABLE') !== false) {
            db()->exec($stmt);
        }
    }
}

<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('DATA_FILE', __DIR__ . '/../data/board.json');
define('AUTH_TOKEN', 'blast-or-treat-2026-admin');

function getDefaultBoard() {
    return [
        'windows' => [
            'A' => ['capacity' => 3, 'slots' => []],
            'B' => ['capacity' => 3, 'slots' => []],
            'C' => ['capacity' => 3, 'slots' => []],
            'D' => ['capacity' => 3, 'slots' => []],
            'E' => ['capacity' => 3, 'slots' => []],
            'F' => ['capacity' => 3, 'slots' => []],
        ],
        'event_time' => 'TBD',
        'updated_at' => null,
    ];
}

function readBoard() {
    if (!file_exists(DATA_FILE)) {
        return getDefaultBoard();
    }
    $content = file_get_contents(DATA_FILE);
    $data = json_decode($content, true);
    return $data ?: getDefaultBoard();
}

function writeBoard($data) {
    $data['updated_at'] = date('c');
    $content = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    $fp = fopen(DATA_FILE, 'c');
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, $content);
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
}

function isAuthorized() {
    $headers = array_change_key_case(getallheaders(), CASE_LOWER);
    $auth = $headers['authorization'] ?? '';
    return $auth === 'Bearer ' . AUTH_TOKEN;
}

function generateCode($letter) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 3; $i++) {
        $code .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return "TREAT-{$letter}-{$code}";
}

function sanitizeBoard($data) {
    $public = [
        'windows' => [],
        'event_time' => $data['event_time'] ?? 'TBD',
        'updated_at' => $data['updated_at'] ?? null,
    ];
    foreach ($data['windows'] as $letter => $window) {
        $publicSlots = [];
        foreach ($window['slots'] as $slot) {
            $publicSlots[] = [
                'status' => $slot['status'],
                'alias' => $slot['alias'] ?? null,
            ];
        }
        $cap = $window['capacity'];
        $taken = count($window['slots']);
        $public['windows'][$letter] = [
            'capacity' => $cap,
            'taken' => $taken,
            'available' => $cap - $taken,
            'slots' => $publicSlots,
        ];
    }
    return $public;
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = readBoard();
    if (isset($_GET['full']) && $_GET['full'] === '1') {
        if (!isAuthorized()) respond(['error' => 'Unauthorized'], 403);
        respond($data);
    }
    respond(sanitizeBoard($data));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['action'])) {
        respond(['error' => 'Invalid request'], 400);
    }

    $action = $input['action'];
    $window = strtoupper($input['window'] ?? '');

    if (!in_array($window, ['A','B','C','D','E','F'], true)) {
        respond(['error' => 'Invalid window'], 400);
    }

    $data = readBoard();
    $win = &$data['windows'][$window];

    switch ($action) {

        case 'reserve':
            $alias = trim($input['alias'] ?? '');
            $side = $input['side'] ?? 'open';
            if ($alias === '') respond(['error' => 'Name required'], 400);
            if (count($win['slots']) >= $win['capacity']) respond(['error' => 'Window full'], 409);

            $code = generateCode($window);
            $win['slots'][] = [
                'status' => 'pending',
                'alias' => $alias,
                'code' => $code,
                'platform' => $side === 'of' ? 'of' : 'open',
                'reserved_at' => date('c'),
                'is_fake' => false,
            ];
            writeBoard($data);
            respond(['success' => true, 'code' => $code]);

        case 'confirm':
            if (!isAuthorized()) respond(['error' => 'Unauthorized'], 403);
            $code = $input['code'] ?? '';
            foreach ($win['slots'] as &$slot) {
                if ($slot['code'] === $code && $slot['status'] === 'pending') {
                    $slot['status'] = 'confirmed';
                    if (!empty($input['alias'])) $slot['alias'] = $input['alias'];
                    writeBoard($data);
                    respond(['success' => true]);
                }
            }
            respond(['error' => 'Reservation not found'], 404);

        case 'release':
            if (!isAuthorized()) respond(['error' => 'Unauthorized'], 403);
            $code = $input['code'] ?? '';
            $idx = $input['slot_index'] ?? null;
            if ($code) {
                foreach ($win['slots'] as $i => $slot) {
                    if ($slot['code'] === $code) {
                        array_splice($win['slots'], $i, 1);
                        writeBoard($data);
                        respond(['success' => true]);
                    }
                }
            } elseif ($idx !== null && isset($win['slots'][$idx])) {
                array_splice($win['slots'], (int)$idx, 1);
                writeBoard($data);
                respond(['success' => true]);
            }
            respond(['error' => 'Slot not found'], 404);

        case 'add_fake':
            if (!isAuthorized()) respond(['error' => 'Unauthorized'], 403);
            $alias = trim($input['alias'] ?? '');
            if ($alias === '') respond(['error' => 'Alias required'], 400);
            if (count($win['slots']) >= $win['capacity']) respond(['error' => 'Window full'], 409);
            $win['slots'][] = [
                'status' => 'confirmed',
                'alias' => $alias,
                'code' => 'FAKE',
                'platform' => 'fake',
                'reserved_at' => date('c'),
                'is_fake' => true,
            ];
            writeBoard($data);
            respond(['success' => true]);

        case 'remove_fake':
            if (!isAuthorized()) respond(['error' => 'Unauthorized'], 403);
            $targetAlias = $input['alias'] ?? '';
            foreach ($win['slots'] as $i => $slot) {
                if (($slot['is_fake'] ?? false) && $slot['alias'] === $targetAlias) {
                    array_splice($win['slots'], $i, 1);
                    writeBoard($data);
                    respond(['success' => true]);
                }
            }
            respond(['error' => 'Fake slot not found'], 404);

        case 'quick_sell':
            if (!isAuthorized()) respond(['error' => 'Unauthorized'], 403);
            $alias = trim($input['alias'] ?? '');
            $platform = $input['platform'] ?? 'open';
            if ($alias === '') respond(['error' => 'Name required'], 400);
            if (count($win['slots']) >= $win['capacity']) respond(['error' => 'Window full'], 409);
            $code = generateCode($window);
            $win['slots'][] = [
                'status' => 'confirmed',
                'alias' => $alias,
                'code' => $code,
                'platform' => $platform,
                'reserved_at' => date('c'),
                'is_fake' => false,
            ];
            writeBoard($data);
            respond(['success' => true, 'code' => $code]);

        default:
            respond(['error' => 'Unknown action'], 400);
    }
}

respond(['error' => 'Method not allowed'], 405);

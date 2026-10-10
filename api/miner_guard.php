<?php
/**
 * ProofCash Protocol — IP Mining Anti-Farming & Sybil Defense Guard
 * 
 * Enforces strictly ONE active edge mining device per public IP address.
 * Prevents industrial device farms (running 20+ phones on a single router/tether)
 * and cloud botnets from monopolizing block subsidies.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$slotsFile = __DIR__ . '/miner_slots.json';
$LEASE_DURATION_SECONDS = 15 * 60; // 15-minute lease per IP

// Determine client IP
$clientIp = '127.0.0.1';
if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
    $clientIp = $_SERVER['HTTP_CF_CONNECTING_IP'];
} elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
    $clientIp = trim($parts[0]);
} elseif (!empty($_SERVER['REMOTE_ADDR'])) {
    $clientIp = $_SERVER['REMOTE_ADDR'];
}

// Clean IP hash for privacy
$ipKey = hash('sha256', $clientIp . '_proofcash_ip_salt');

// Read existing slots
$slots = [];
if (file_exists($slotsFile)) {
    $content = file_get_contents($slotsFile);
    if ($content) {
        $slots = json_decode($content, true) ?: [];
    }
}

$now = time();
// Prune expired slots
foreach ($slots as $k => $slot) {
    if ($now - $slot['lastHeartbeat'] > $LEASE_DURATION_SECONDS) {
        unset($slots[$k]);
    }
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $input['action'] ?? ($_GET['action'] ?? 'claim');
$minerAddr = trim($input['miner'] ?? ($_GET['miner'] ?? ''));

if ($action === 'release') {
    if (isset($slots[$ipKey]) && $slots[$ipKey]['miner'] === $minerAddr) {
        unset($slots[$ipKey]);
        @file_put_contents($slotsFile, json_encode($slots));
    }
    echo json_encode(['status' => 'released', 'ip' => $clientIp]);
    exit;
}

// Action: claim or renew
if (isset($slots[$ipKey])) {
    $existing = $slots[$ipKey];
    if ($existing['miner'] !== $minerAddr && ($now - $existing['lastHeartbeat'] < $LEASE_DURATION_SECONDS)) {
        $remaining = $LEASE_DURATION_SECONDS - ($now - $existing['lastHeartbeat']);
        http_response_code(429);
        echo json_encode([
            'allowed' => false,
            'code' => 'ERR_IP_MINER_LIMIT',
            'error' => 'Only 1 active edge miner device is allowed per IP network.',
            'activeMiner' => substr($existing['miner'], 0, 14) . '...',
            'cooldownSeconds' => $remaining,
            'ip' => $clientIp
        ]);
        exit;
    }
}

// Grant or renew slot
$slots[$ipKey] = [
    'miner' => $minerAddr,
    'lastHeartbeat' => $now,
    'startedAt' => $slots[$ipKey]['startedAt'] ?? $now
];

@file_put_contents($slotsFile, json_encode($slots));

echo json_encode([
    'allowed' => true,
    'status' => 'granted',
    'ip' => $clientIp,
    'leaseSeconds' => $LEASE_DURATION_SECONDS
]);

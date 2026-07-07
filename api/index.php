<?php
/**
 * api/index.php — the task-manager board's WRITE ENDPOINT (multi-project version).
 *
 * The PHP built-in server runs this file directly. Started via docker compose (see
 * docker-compose.yml), or manually (docroot = the project root):
 *   php -S localhost:3333 -t /Users/mgeri1993/code/projects/claude-task-manager
 *   → board:    http://localhost:3333/
 *   → endpoint: http://localhost:3333/api/index.php
 *
 * Writes go EXCLUSIVELY through engine/task.sh (allowlisted commands, `--as <as>`,
 * `TM_DIR=<project data dir>`), so tasks.json's ONLY writer remains task.sh (atomic lock,
 * history, events.jsonl, per-agent inbox). The browser NEVER writes the JSON directly.
 *
 * The `project` field is allowlisted against data/projects.json's registered ids — this
 * decides which project's data directory (TM_DIR) the engine gets.
 *
 * The optional `lang` field (the board's current UI language) is persisted as the
 * project's preferred language in a small `.board-lang` file next to tasks.json — NOT
 * inside any task. engine/task.sh reads it on every invocation and prints a reminder, so
 * an agent running task.sh next knows which language to reply/work in.
 *
 * Security:
 *   - proc_open ARRAY form → no shell, no injection (no escaping needed on POSIX).
 *   - command allowlist: destructive commands (rm/restore/raw/archive) are NOT exposed.
 *   - the real perimeter is docker-compose.yml's port binding (127.0.0.1:<port>:<port>) —
 *     the container is unreachable from anywhere but the host's own loopback. Requests that
 *     DO reach this script still show a private/link-local REMOTE_ADDR (the docker bridge's
 *     gateway, e.g. 172.x.x.1), never a public one, since Docker NATs the host-loopback
 *     connection — so this check accepts private ranges too, not just literal 127.0.0.1.
 *   - the project id is checked against data/projects.json's registered list — the client
 *     can never supply an arbitrary TM_DIR.
 */

header('Content-Type: application/json; charset=utf-8');

/** True for 127.0.0.0/8, ::1, and the RFC1918 private ranges Docker's bridge networks use. */
function is_local_or_private_addr(string $addr): bool
{
    if ($addr === '' || $addr === '::1') return true;
    if (str_starts_with($addr, '127.')) return true;
    $long = ip2long($addr);
    if ($long === false) return false;
    $inRange = static fn(string $cidr, int $bits) => ($long & ~((1 << (32 - $bits)) - 1)) === (ip2long($cidr) & ~((1 << (32 - $bits)) - 1));
    return $inRange('10.0.0.0', 8) || $inRange('172.16.0.0', 12) || $inRange('192.168.0.0', 16);
}

$remote = $_SERVER['REMOTE_ADDR'] ?? '';
if (!is_local_or_private_addr($remote)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'localhost only']);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

// task.sh commands exposed from the board. rm/restore/raw/archive are DELIBERATELY excluded.
const ALLOWED = [
    'status', 'note', 'priority', 'module', 'tag', 'assign', 'dep',
    'status-many', 'reopen', 'add',
];

const ALLOWED_LANGS = ['en', 'hu'];

$ROOT_DIR       = dirname(__DIR__);                       // claude-task-manager/
$ENGINE_TASK_SH = $ROOT_DIR . '/engine/task.sh';
$PROJECTS_FILE  = $ROOT_DIR . '/data/projects.json';

$raw  = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid JSON body']);
    exit;
}

// Actor (--as): the board SENDS who the caller is — a selectable agent/reviewer, NOT a
// fixed "human".
$actor = isset($body['as']) ? preg_replace('/[^A-Za-z0-9_.-]/', '', (string) $body['as']) : '';
if ($actor === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'missing "as" (agent name) — set it on the board: "As …"']);
    exit;
}

// Project: allowlisted against data/projects.json's registered ids — the client can never
// supply an arbitrary path, only an already-registered project id.
$projectId = isset($body['project']) ? preg_replace('/[^A-Za-z0-9_-]/', '', (string) $body['project']) : '';
if ($projectId === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'missing "project" (set it in the Source selector)']);
    exit;
}

$projects = [];
if (is_file($PROJECTS_FILE)) {
    $decoded = json_decode((string) file_get_contents($PROJECTS_FILE), true);
    if (is_array($decoded)) $projects = $decoded;
}
// Only used to check that $projectId is actually registered — NOT for its stored
// "dataDir" value, which is a HOST-absolute path baked in by engine/projects.sh (run on
// the host). Inside the docker container the filesystem root is /app, not the host's path,
// so the real data dir is always computed relative to THIS script's own $ROOT_DIR instead
// — that resolves correctly whether this file is running on the host or in the container.
$known = false;
foreach ($projects as $p) {
    if (is_array($p) && ($p['id'] ?? null) === $projectId) { $known = true; break; }
}
if (!$known) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "unknown project: $projectId"]);
    exit;
}
$dataDir = $ROOT_DIR . '/data/' . $projectId;

// Persist the board's current UI language as this project's preferred language (best
// effort — never fails the request). engine/task.sh reads this file on every run.
$lang = isset($body['lang']) ? (string) $body['lang'] : '';
if (in_array($lang, ALLOWED_LANGS, true)) {
    @file_put_contents($dataDir . '/.board-lang', $lang);
}

// One or more operations: { cmd, args } OR { ops: [ {cmd,args}, ... ] }.
$ops = [];
if (isset($body['ops']) && is_array($body['ops'])) {
    $ops = $body['ops'];
} elseif (isset($body['cmd'])) {
    $ops = [['cmd' => $body['cmd'], 'args' => $body['args'] ?? []]];
}
if (!$ops) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'missing cmd/ops']);
    exit;
}

/** Run one task.sh command as an argv array (no shell), with the project's TM_DIR. */
function run_task_sh(string $taskSh, string $cmd, array $args, string $actor, string $tmDir): array
{
    $argv = array_merge([$taskSh, $cmd], array_map('strval', array_values($args)), ['--as', $actor]);
    $desc = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $env  = ['TM_DIR' => $tmDir, 'PATH' => getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin'];
    $proc = proc_open($argv, $desc, $pipes, dirname($taskSh), $env);
    if (!is_resource($proc)) {
        return ['ok' => false, 'code' => -1, 'out' => '', 'err' => 'proc_open failed'];
    }
    $out = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $err = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($proc);
    return ['ok' => $code === 0, 'code' => $code, 'out' => trim((string) $out), 'err' => trim((string) $err)];
}

$results = [];
$allOk = true;
foreach ($ops as $op) {
    $cmd  = is_array($op) ? ($op['cmd'] ?? '') : '';
    $args = (is_array($op) && isset($op['args']) && is_array($op['args'])) ? $op['args'] : [];
    if (!in_array($cmd, ALLOWED, true)) {
        $results[] = ['ok' => false, 'cmd' => $cmd, 'err' => "command not allowed: $cmd"];
        $allOk = false;
        break; // don't continue the chain after an invalid step
    }
    $r = run_task_sh($ENGINE_TASK_SH, $cmd, $args, $actor, $dataDir);
    $r['cmd'] = $cmd;
    $results[] = $r;
    if (!$r['ok']) { $allOk = false; break; } // stop at the first failure (don't let note+status split)
}

http_response_code($allOk ? 200 : 422);
echo json_encode(['ok' => $allOk, 'results' => $results]);

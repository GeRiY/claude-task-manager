<?php
/**
 * api/index.php — a task-manager board ÍRÁS-ENDPOINTJA (multi-project verzió).
 *
 * A PHP beépített szerver közvetlenül futtatja ezt a fájlt. Indítás docker compose-szal
 * (lásd docker-compose.yml), vagy kézzel (docroot = a projekt gyökere):
 *   php -S localhost:3333 -t /Users/mgeri1993/code/projects/claude-task-manager
 *   → board:    http://localhost:3333/
 *   → endpoint: http://localhost:3333/api/index.php
 *
 * Az írás KIZÁRÓLAG az engine/task.sh-n át megy (allowlistelt parancsok, `--as <as>`,
 * `TM_DIR=<projekt adat-könyvtára>`), így a tasks.json EGYETLEN írója továbbra is a
 * task.sh marad (atomikus lock, history, events.jsonl, per-agent inbox). A böngésző
 * SOSEM írja közvetlenül a JSON-t.
 *
 * A `project` mezőt a data/projects.json regisztrált id-jei ellen allowlist-eljük — ez
 * dönti el, melyik projekt adat-könyvtárát (TM_DIR) kapja az engine.
 *
 * Biztonság:
 *   - proc_open TÖMB-alak → nincs shell, nincs injection (POSIX-on nem kell escape).
 *   - parancs-allowlist: a destruktív parancsok (rm/restore/raw/archive) NINCSENEK kiengedve.
 *   - csak localhost REMOTE_ADDR; a szervert 127.0.0.1/localhost-ra kösd.
 *   - a project-id-t a data/projects.json regisztrált listája ellen ellenőrizzük — a
 *     kliens sosem adhat meg tetszőleges TM_DIR-t.
 */

header('Content-Type: application/json; charset=utf-8');

// Csak lokális kliens (öv + nadrágtartó a bind-cím mellett).
$remote = $_SERVER['REMOTE_ADDR'] ?? '';
if ($remote !== '' && $remote !== '127.0.0.1' && $remote !== '::1') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'csak localhost']);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'csak POST']);
    exit;
}

// A boardról kiengedhető task.sh parancsok. A rm/restore/raw/archive SZÁNDÉKOSAN kimarad.
const ALLOWED = [
    'status', 'note', 'priority', 'tag', 'assign', 'dep',
    'status-many', 'reopen', 'add',
];

$ROOT_DIR     = dirname(__DIR__);                       // claude-task-manager/
$ENGINE_TASK_SH = $ROOT_DIR . '/engine/task.sh';
$PROJECTS_FILE  = $ROOT_DIR . '/data/projects.json';

$raw  = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'érvénytelen JSON test']);
    exit;
}

// Actor (--as): a board KÜLDI, hogy ki a hívó — kiválasztható agent/reviewer, NEM fix "human".
$actor = isset($body['as']) ? preg_replace('/[^A-Za-z0-9_.-]/', '', (string) $body['as']) : '';
if ($actor === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'hiányzó "as" (agent-név) — állíts be a boardon: "Mint …"']);
    exit;
}

// Project: allowlist a data/projects.json regisztrált id-jei ellen — a kliens sosem
// adhat meg tetszőleges elérési utat, csak egy már regisztrált projekt-azonosítót.
$projectId = isset($body['project']) ? preg_replace('/[^A-Za-z0-9_-]/', '', (string) $body['project']) : '';
if ($projectId === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'hiányzó "project" (állítsd be a Forrás-választóban)']);
    exit;
}

$projects = [];
if (is_file($PROJECTS_FILE)) {
    $decoded = json_decode((string) file_get_contents($PROJECTS_FILE), true);
    if (is_array($decoded)) $projects = $decoded;
}
$dataDir = null;
foreach ($projects as $p) {
    if (is_array($p) && ($p['id'] ?? null) === $projectId) { $dataDir = $p['dataDir'] ?? null; break; }
}
if ($dataDir === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "ismeretlen projekt: $projectId"]);
    exit;
}

// Egy vagy több művelet: { cmd, args } VAGY { ops: [ {cmd,args}, ... ] }.
$ops = [];
if (isset($body['ops']) && is_array($body['ops'])) {
    $ops = $body['ops'];
} elseif (isset($body['cmd'])) {
    $ops = [['cmd' => $body['cmd'], 'args' => $body['args'] ?? []]];
}
if (!$ops) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'hiányzó cmd/ops']);
    exit;
}

/** Egy task.sh parancs futtatása argv-tömbként (shell nélkül), a projekt TM_DIR-jével. */
function run_task_sh(string $taskSh, string $cmd, array $args, string $actor, string $tmDir): array
{
    $argv = array_merge([$taskSh, $cmd], array_map('strval', array_values($args)), ['--as', $actor]);
    $desc = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $env  = ['TM_DIR' => $tmDir, 'PATH' => getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin'];
    $proc = proc_open($argv, $desc, $pipes, dirname($taskSh), $env);
    if (!is_resource($proc)) {
        return ['ok' => false, 'code' => -1, 'out' => '', 'err' => 'proc_open sikertelen'];
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
        $results[] = ['ok' => false, 'cmd' => $cmd, 'err' => "nem engedélyezett parancs: $cmd"];
        $allOk = false;
        break; // érvénytelen lépésnél ne folytassuk a láncot
    }
    $r = run_task_sh($ENGINE_TASK_SH, $cmd, $args, $actor, $dataDir);
    $r['cmd'] = $cmd;
    $results[] = $r;
    if (!$r['ok']) { $allOk = false; break; } // első hibánál állj (note+status ne csússzon szét)
}

http_response_code($allOk ? 200 : 422);
echo json_encode(['ok' => $allOk, 'results' => $results]);

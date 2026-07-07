#!/usr/bin/env bash
#
# task.sh — token-hatékony CLI a task-manager tasks.json (és context.json) kezeléséhez.
#
# Cél: a Claude Code NE olvassa/írja újra a teljes JSON-t minden művelethez (sok token),
# hanem tömör parancsokkal dolgozzon. Minden mutáció atomikus (temp fájl + mv), és
# automatikusan karbantartja a timestampeket + a history/notes bejegyzéseket.
#
# Használat:  ./task.sh <parancs> [argumentumok]
# Súgó:       ./task.sh help
#
# A tároló alapból a projekt .claude/task-manager/ mappája; felülírható a
# TM_DIR környezeti változóval.

set -euo pipefail

# ---------------------------------------------------------------------------
# Konfiguráció / útvonalak
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Projekt gyökér: a skill mappából két szint fel (.claude/skills/task-manager -> projekt).
# Ha a git elérhető, azt használjuk; különben a relatív útvonalat.
default_dir() {
  local root
  if root="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
    echo "$root/.claude/task-manager"
  else
    echo "$SCRIPT_DIR/../../task-manager"
  fi
}

TM_DIR="${TM_DIR:-$(default_dir)}"
TASKS_FILE="$TM_DIR/tasks.json"
CONTEXT_FILE="$TM_DIR/context.json"
BACKUP_FILE="$TM_DIR/tasks.json.bak"
CTX_BACKUP_FILE="$TM_DIR/context.json.bak"
LOCK_DIR="$TM_DIR/.tm.lock"

# --- Agent-értesítés (inbox) tárolók ----------------------------------------
# events.jsonl: append-only esemény-feed (a per-task history MELLETT, azt nem érinti),
# amiből az `inbox <agent>` parancs per-agent cursorral csak az ÚJ, MÁS agent által
# generált eseményeket adja vissza. A PostToolUse hook ezt injektálja a hívónak.
# Ez ADDITÍV: a tasks.json/history meglévő logikáját nem módosítja.
EVENTS_FILE="$TM_DIR/events.jsonl"
CURSORS_DIR="$TM_DIR/.cursors"

VALID_STATUSES="todo in_progress blocked review done"
VALID_PRIORITIES="low normal high urgent"

# A hívó agent neve (--as <név>); a main() tölti ki a parancs-argumentumokból.
# Az emit_event ezt írja `by`-ként, az inbox ezzel szűri ki a saját-visszhangot.
ACTOR=""

# ---------------------------------------------------------------------------
# Segédfüggvények
# ---------------------------------------------------------------------------

die() { echo "hiba: $*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || die "jq nincs telepítve (kell a scripthez)."

now_iso() { date -u +%Y-%m-%dT%H:%M:%S.000Z; }

# --- Konkurrencia-zár (mkdir-alapú, portábilis) ------------------------------
# macOS-en nincs beépített flock(1), ezért atomikus mkdir-lockot használunk
# (ugyanaz a minta, mint az agent-message-bus skillben). Így két egyidejűleg
# író agent nem tapossa el egymást (a last-write-wins megszűnik). A zárat trap
# takarítja el, ha a folyamat idő előtt kilép.
LOCK_HELD=0

# A zár korának meghatározása másodpercben (dir mtime alapján), portábilisan
# (BSD/macOS `stat -f %m`, GNU/Linux `stat -c %Y`). Üres, ha nincs zár.
lock_age() {
  local m now
  m="$(stat -f %m "$LOCK_DIR" 2>/dev/null || stat -c %Y "$LOCK_DIR" 2>/dev/null || echo "")"
  [[ -z "$m" ]] && { echo ""; return; }
  now="$(date +%s)"
  echo $(( now - m ))
}

acquire_lock() {
  local waited=0 timeout="${TM_LOCK_TIMEOUT:-15}" stale="${TM_LOCK_STALE:-60}"
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    # Elárvult zár TÖRLÉSE — KIZÁRÓLAG kor alapján (valódi crash után). A forró
    # úton (gyors, egészséges írók) ez SOHA nem fut, ezért egy aktív zárat nem
    # törölhetünk el, és nem lehet két író egyszerre a kritikus szakaszban.
    local age; age="$(lock_age)"
    if [[ -n "$age" && "$age" -ge "$stale" ]]; then
      rm -rf "$LOCK_DIR" 2>/dev/null || true
      continue
    fi
    waited=$((waited + 1))
    [[ $waited -ge $((timeout * 20)) ]] && die "nem sikerült zárat szerezni ${timeout}s alatt: $LOCK_DIR"
    sleep 0.05
  done
  LOCK_HELD=1
  trap release_lock EXIT INT TERM
}
release_lock() {
  [[ "$LOCK_HELD" == "1" ]] && rm -rf "$LOCK_DIR" 2>/dev/null || true
  LOCK_HELD=0
}

# --- Pre-write backup --------------------------------------------------------
# Minden mutáció ELŐTT eltesszük az előző állapotot (egy generáció), hogy a
# `restore` paranccsal egy elrontott írás visszavonható legyen.
backup_tasks()   { [[ -f "$TASKS_FILE"   ]] && cp "$TASKS_FILE"   "$BACKUP_FILE"     2>/dev/null || true; }
backup_context() { [[ -f "$CONTEXT_FILE" ]] && cp "$CONTEXT_FILE" "$CTX_BACKUP_FILE" 2>/dev/null || true; }

ensure_tasks_file() {
  if [[ ! -f "$TASKS_FILE" ]]; then
    mkdir -p "$TM_DIR"
    jq -n --arg now "$(now_iso)" \
      '{schemaVersion:1, updatedAt:$now, tasks:[]}' > "$TASKS_FILE"
  fi
}

require_tasks_file() {
  [[ -f "$TASKS_FILE" ]] || die "nincs tasks.json: $TASKS_FILE (futtasd: task.sh init)"
}

is_valid_status() {
  local s="$1"
  for v in $VALID_STATUSES; do [[ "$s" == "$v" ]] && return 0; done
  return 1
}

# Atomikus írás: jq-filter a TASKS_FILE-ra, temp fájlon keresztül. A filter előre
# frissíti a gyökér updatedAt mezőt is.
apply_jq() {
  acquire_lock
  backup_tasks
  local tmp
  tmp="$(mktemp "${TASKS_FILE}.XXXXXX")"
  if jq "$@" "$TASKS_FILE" > "$tmp"; then
    mv "$tmp" "$TASKS_FILE"
  else
    rm -f "$tmp"
    release_lock
    die "jq művelet sikertelen."
  fi
  release_lock
}

task_exists() {
  local id="$1"
  [[ "$(jq --arg id "$id" '[.tasks[]|select(.id==$id)]|length' "$TASKS_FILE")" != "0" ]]
}

# --- Esemény-feed (inbox) ----------------------------------------------------
# Egy sor az events.jsonl-be: {seq, at, by, task, kind, text}. A `seq` monoton nő
# (a fájl sorainak száma + 1, a zár alatt konzisztens). A `by` a hívó agent (ACTOR).
# Csak a MUTÁCIÓK hívják; a lekérdezések nem generálnak eseményt. Hibát elnyel:
# az értesítés best-effort, sosem bukhat el rajta egy task-művelet.
emit_event() {
  local task="$1" kind="$2" text="${3:-}"
  [[ -n "$ACTOR" ]] || return 0
  local now; now="$(now_iso)"
  acquire_lock
  mkdir -p "$TM_DIR" 2>/dev/null || true
  touch "$EVENTS_FILE" 2>/dev/null || true
  local seq; seq=$(( $(wc -l < "$EVENTS_FILE" 2>/dev/null || echo 0) + 1 ))
  jq -cn --argjson seq "$seq" --arg at "$now" --arg by "$ACTOR" \
     --arg task "$task" --arg kind "$kind" --arg text "$text" \
     '{seq:$seq, at:$at, by:$by, task:$task, kind:$kind, text:$text}' \
     >> "$EVENTS_FILE" 2>/dev/null || true
  release_lock
}

# --- context.json helperek (ugyanaz az atomikus minta, külön fájlra) ---------

ensure_context_file() {
  if [[ ! -f "$CONTEXT_FILE" ]]; then
    mkdir -p "$TM_DIR"
    jq -n --arg now "$(now_iso)" '{
      schemaVersion:1, updatedAt:$now, initPrompt:"", goal:"",
      currentFocus:"", constraints:[], decisions:[], openQuestions:[], notes:""
    }' > "$CONTEXT_FILE"
  fi
}

require_context_file() {
  [[ -f "$CONTEXT_FILE" ]] || die "nincs context.json: $CONTEXT_FILE (futtasd: task.sh ctx-init)"
}

# Atomikus írás a CONTEXT_FILE-ra (mint apply_jq, csak másik fájlra).
apply_ctx() {
  acquire_lock
  backup_context
  local tmp
  tmp="$(mktemp "${CONTEXT_FILE}.XXXXXX")"
  if jq "$@" "$CONTEXT_FILE" > "$tmp"; then
    mv "$tmp" "$CONTEXT_FILE"
  else
    rm -f "$tmp"
    release_lock
    die "jq művelet sikertelen (context)."
  fi
  release_lock
}

# ---------------------------------------------------------------------------
# Parancsok
# ---------------------------------------------------------------------------

cmd_help() {
  cat <<'EOF'
task.sh — token-hatékony tasks.json kezelő

TÁROLÓ
  Alap: <projekt>/.claude/task-manager/tasks.json  (felülírás: TM_DIR env)

HÍVÓ AZONOSÍTÁS (--as) — KÖTELEZŐ minden nem-meta parancsnál
  Minden hívásodhoz add meg: --as <agent-név>   (a te neved; a main agent: main).
  Ebből tudja a PostToolUse hook, kinek injektálja a friss eseményeket (inbox),
  és ezzel íródik minden esemény `by`-ja. Meta parancsok kivétel (nem kell --as):
  help, inbox, init, validate, restore, raw.
  Példa:  task.sh status fix-login done --as backend-auth

ÉRTESÍTÉS (inbox — a hook automatikusan hívja, de kézzel is)
  inbox <agent>            Az <agent> cursorja óta keletkezett, MÁS agent által
                           generált események (a sajátjait nem), majd cursort léptet.
                           NÉMA, ha nincs új. A hook ezt fűzi additionalContext-ként.

LEKÉRDEZÉS (nem módosít, tömör kimenet)
  list [status] [szűrők]   Tömör lista: "<id> [status] (prio) title #tag".
                           Szűrők: --tag <t> --agent <a> --priority <p>
                                   --all (archiváltak is)  --json (gépi kimenet)
  ids [status]             Csak az id-k, soronként egy
  get <id>                 EGY task teljes JSON-je (nem a teljes fájl)
  field <id> <mező>        Egy task egy mezőjének nyers értéke
  summary                  Darabszám státuszonként + összesen
  find <szöveg>            Cím/leírás keresés (case-insensitive), tömör lista
  next                     Következő ajánlott todo (nincs nyitott függősége), prioritás szerint
  deps <id>                Mire vár ez a task és mit blokkol (függőség-nézet)
  history <id>             Egy task history bejegyzései tömören
  validate                 Séma-ellenőrzés (kötelező mezők, státusz, prioritás, törött függőség, duplikált id)
  raw                      A teljes fájl (ritkán kell — token-drága)

MUTÁCIÓ (atomikus írás mkdir-lock alatt; timestamp + history automatikus; pre-write backup)
  init                     Üres tasks.json létrehozása, ha hiányzik
  add <id> <title> [desc]  Új task (todo, priority=normal, tags=[], dependsOn=[])
  status <id> <status> [note]
                           Státuszváltás + history bejegyzés (todo|in_progress|blocked|review|done)
  status-many <status> <id...>
                           Több task egy státuszra, EGY atomikus írással
  reopen <id> [status]     Lezárt/archivált task újranyitása (alap: todo) history-val
  note <id> <szöveg>       Megjegyzés hozzáfűzése a notes tömbhöz ({at,text})
  priority <id> <low|normal|high|urgent>
                           Prioritás beállítása
  tag <id> <add|rm> <címke>
                           Címke hozzáadása/eltávolítása (tags tömb, egyedi)
  assign <id> <agent>      assignedAgentId beállítása (claim-hez kényelmesebb, mint set)
  dep <id> <add|rm> <másik-id>
                           Függőség (dependsOn): 'id' vár 'másik-id'-re; ciklus- és lét-ellenőrzés
  set <id> <mező> <json>   Tetszőleges mező beállítása NYERS JSON értékkel
                           (pl. set x assignedAgentId '"main"'  vagy  set x isInferred true)
  archive <id>             isArchived=true
  unarchive <id>           isArchived=false
  restore                  A legutóbbi pre-write backup visszaállítása (tasks.json.bak)
  rm <id>                  Task törlése

CONTEXT (session-folytonosság — a context.json-t IS csak ezeken át írd, sose közvetlenül)
  ctx                      A teljes context.json kiírása (kicsi, olcsó)
  ctx-init [init] [goal]   context.json létrehozása, ha hiányzik (initPrompt, goal)
  ctx-set <mező> <json>    Top-szintű mező beállítása (goal|currentFocus|initPrompt|notes …)
  ctx-decision <téma> <döntés> [indoklás]
                           Döntés hozzáfűzése a decisions tömbhöz (timestamppel)
  ctx-constraint <szöveg>  Állandó megkötés hozzáfűzése a constraints tömbhöz
  ctx-question <add|rm> <szöveg>
                           Nyitott kérdés felvétele / lezárása az openQuestions tömbben

STÁTUSZOK:   todo, in_progress, blocked, review, done
PRIORITÁSOK: low, normal, high, urgent

PÉLDÁK (a --as minden nem-meta parancsnál kötelező)
  task.sh list todo --priority high --as main
  task.sh add fix-login "Login javítás" "A bejelentkezés 500-at dob" --as main
  task.sh priority fix-login urgent --as main
  task.sh dep deploy add fix-login --as main   # a deploy vár a fix-login-ra
  task.sh next --as main                       # mivel folytasd?
  task.sh status fix-login in_progress "elkezdtem" --as backend-auth
  task.sh status-many done fix-login deploy --as main
  task.sh inbox backend-auth                    # (meta: nincs --as) friss események
  task.sh validate                              # (meta: nincs --as)
  task.sh ctx-init "Portold a legacy event-editet" "Teljes port" --as main
  task.sh ctx-constraint "Legacy: csak megfigyelés, gombokat nem nyomunk" --as main
EOF
}

cmd_init() {
  ensure_tasks_file
  echo "kész: $TASKS_FILE"
}

cmd_list() {
  require_tasks_file
  local status="" tag="" agent="" prio="" show_all=0 as_json=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag)                    tag="${2:-}"; shift 2 ;;
      --agent)                  agent="${2:-}"; shift 2 ;;
      --priority|--prio)        prio="${2:-}"; shift 2 ;;
      --all|--include-archived) show_all=1; shift ;;
      --json)                   as_json=1; shift ;;
      --*)                      die "ismeretlen kapcsoló: $1" ;;
      *)                        status="$1"; shift ;;
    esac
  done
  [[ -n "$status" ]] && { is_valid_status "$status" || die "érvénytelen státusz: $status (érvényes: $VALID_STATUSES)"; }
  local flt='.tasks[]
    | select(($all==1) or ((.isArchived // false)|not))
    | select($status=="" or (.status==$status))
    | select($tag=="" or (((.tags//[]) | index($tag)) != null))
    | select($agent=="" or (.assignedAgentId==$agent))
    | select($prio=="" or ((.priority//"normal")==$prio))'
  if [[ $as_json == 1 ]]; then
    jq --arg status "$status" --arg tag "$tag" --arg agent "$agent" --arg prio "$prio" --argjson all "$show_all" \
      "[ $flt | {id, status, title, priority:(.priority//\"normal\"), tags:(.tags//[]), assignedAgentId, dependsOn:(.dependsOn//[])} ]" \
      "$TASKS_FILE"
  else
    jq -r --arg status "$status" --arg tag "$tag" --arg agent "$agent" --arg prio "$prio" --argjson all "$show_all" \
      "$flt | \"\(.id)\t[\(.status)]\t\((.priority//\"normal\") | if .==\"normal\" then \"\" else \"(\"+.+\")\" end)\t\(.title)\t\((.tags//[]) | if length>0 then \"#\"+join(\" #\") else \"\" end)\"" \
      "$TASKS_FILE" | column -t -s $'\t'
  fi
}

cmd_ids() {
  require_tasks_file
  if [[ $# -ge 1 ]]; then
    jq -r --arg s "$1" '.tasks[]|select(.status==$s)|.id' "$TASKS_FILE"
  else
    jq -r '.tasks[].id' "$TASKS_FILE"
  fi
}

cmd_get() {
  require_tasks_file
  [[ $# -ge 1 ]] || die "használat: get <id>"
  local id="$1"
  task_exists "$id" || die "nincs ilyen task: $id"
  jq --arg id "$id" '.tasks[]|select(.id==$id)' "$TASKS_FILE"
}

cmd_field() {
  require_tasks_file
  [[ $# -ge 2 ]] || die "használat: field <id> <mező>"
  local id="$1" f="$2"
  task_exists "$id" || die "nincs ilyen task: $id"
  jq -r --arg id "$id" --arg f "$f" '.tasks[]|select(.id==$id)|.[$f]' "$TASKS_FILE"
}

cmd_summary() {
  require_tasks_file
  jq -r '
    (.tasks|group_by(.status)|map("\(.[0].status)\t\(length)")|.[]),
    "─\t─",
    "összesen\t\(.tasks|length)"
  ' "$TASKS_FILE" | column -t -s $'\t'
}

cmd_find() {
  require_tasks_file
  [[ $# -ge 1 ]] || die "használat: find <szöveg>"
  local q="$1"
  # hulower: ASCII + magyar ékezetes nagybetűk kisbetűsítése (jq ascii_downcase
  # csak A-Z-t kezel, az ékezeteseket nem).
  jq -r --arg q "$q" '
    def hulower:
      ascii_downcase
      | gsub("Á";"á") | gsub("É";"é") | gsub("Í";"í") | gsub("Ó";"ó")
      | gsub("Ö";"ö") | gsub("Ő";"ő") | gsub("Ú";"ú") | gsub("Ü";"ü") | gsub("Ű";"ű");
    .tasks[]
    | select((.title|hulower|contains($q|hulower))
             or ((.description//"")|hulower|contains($q|hulower)))
    | "\(.id)\t[\(.status)]\t\(.title)"
  ' "$TASKS_FILE" | column -t -s $'\t'
}

cmd_history() {
  require_tasks_file
  [[ $# -ge 1 ]] || die "használat: history <id>"
  local id="$1"
  task_exists "$id" || die "nincs ilyen task: $id"
  jq -r --arg id "$id" '
    .tasks[]|select(.id==$id)|.history[]
    | "\(.at)\t\(.type)\t\(.fromStatus // "-") -> \(.toStatus // "-")\t\(.note // "")"
  ' "$TASKS_FILE" | column -t -s $'\t'
}

cmd_raw() {
  require_tasks_file
  cat "$TASKS_FILE"
}

cmd_add() {
  ensure_tasks_file
  [[ $# -ge 2 ]] || die "használat: add <id> <title> [description]"
  local id="$1" title="$2" desc="${3:-}"
  task_exists "$id" && die "már létezik task ezzel az id-vel: $id"
  local now; now="$(now_iso)"
  apply_jq --arg id "$id" --arg title "$title" --arg desc "$desc" --arg now "$now" '
    .updatedAt = $now
    | .tasks += [{
        id: $id,
        title: $title,
        description: $desc,
        status: "todo",
        priority: "normal",
        tags: [],
        dependsOn: [],
        source: "claude_code",
        sourceEventId: null,
        assignedAgentId: "main",
        createdAt: $now,
        updatedAt: $now,
        playbookJobId: null,
        runId: null,
        channel: null,
        externalThreadId: null,
        lastActivityAt: $now,
        notes: [],
        isArchived: false,
        isInferred: false,
        history: [ { at: $now, type: "created", note: "Task created.", fromStatus: null, toStatus: "todo" } ]
      }]'
  emit_event "$id" "created" "$title"
  echo "hozzáadva: $id [todo]"
}

cmd_status() {
  require_tasks_file
  [[ $# -ge 2 ]] || die "használat: status <id> <status> [note]"
  local id="$1" new="$2" note="${3:-}"
  task_exists "$id" || die "nincs ilyen task: $id"
  is_valid_status "$new" || die "érvénytelen státusz: $new (érvényes: $VALID_STATUSES)"
  local now; now="$(now_iso)"
  local notval="null"; [[ -n "$note" ]] && notval="\$note"
  apply_jq --arg id "$id" --arg new "$new" --arg now "$now" --arg note "$note" "
    .updatedAt = \$now
    | (.tasks[] | select(.id==\$id)) |= (
        .history += [ { at: \$now, type: \"status_changed\", note: $notval, fromStatus: .status, toStatus: \$new } ]
        | .status = \$new
        | .updatedAt = \$now
        | .lastActivityAt = \$now
      )"
  emit_event "$id" "status:$new" "$note"
  echo "státusz: $id -> $new"
}

cmd_note() {
  require_tasks_file
  [[ $# -ge 2 ]] || die "használat: note <id> <szöveg>"
  local id="$1" text="$2"
  task_exists "$id" || die "nincs ilyen task: $id"
  local now; now="$(now_iso)"
  apply_jq --arg id "$id" --arg text "$text" --arg now "$now" '
    .updatedAt = $now
    | (.tasks[] | select(.id==$id)) |= (
        .notes += [ { at: $now, text: $text } ]
        | .updatedAt = $now
        | .lastActivityAt = $now
      )'
  emit_event "$id" "note" "$text"
  echo "megjegyzés hozzáfűzve: $id"
}

cmd_set() {
  require_tasks_file
  [[ $# -ge 3 ]] || die "használat: set <id> <mező> <json-érték>"
  local id="$1" field="$2" value="$3"
  task_exists "$id" || die "nincs ilyen task: $id"
  # Érvényes JSON-e az érték?
  echo "$value" | jq -e . >/dev/null 2>&1 || die "az érték nem érvényes JSON: $value (string esetén idézd: '\"szöveg\"')"
  local now; now="$(now_iso)"
  apply_jq --arg id "$id" --arg field "$field" --argjson value "$value" --arg now "$now" '
    .updatedAt = $now
    | (.tasks[] | select(.id==$id)) |= (
        .[$field] = $value
        | .updatedAt = $now
        | .lastActivityAt = $now
      )'
  emit_event "$id" "set:$field" "$value"
  echo "beállítva: $id.$field"
}

cmd_archive() { _set_archived "$1" true; }
cmd_unarchive() { _set_archived "$1" false; }
_set_archived() {
  require_tasks_file
  local id="$1" val="$2"
  task_exists "$id" || die "nincs ilyen task: $id"
  local now; now="$(now_iso)"
  apply_jq --arg id "$id" --argjson val "$val" --arg now "$now" '
    .updatedAt = $now
    | (.tasks[] | select(.id==$id)) |= (.isArchived = $val | .updatedAt = $now)'
  emit_event "$id" "archived:$val" ""
  echo "isArchived=$val: $id"
}

cmd_rm() {
  require_tasks_file
  [[ $# -ge 1 ]] || die "használat: rm <id>"
  local id="$1"
  task_exists "$id" || die "nincs ilyen task: $id"
  local now; now="$(now_iso)"
  apply_jq --arg id "$id" --arg now "$now" '
    .updatedAt = $now | .tasks |= map(select(.id != $id))'
  emit_event "$id" "removed" ""
  echo "törölve: $id"
}

# --- Strukturált mezők: priority / tag / assign / dep ------------------------

cmd_priority() {
  require_tasks_file
  [[ $# -ge 2 ]] || die "használat: priority <id> <low|normal|high|urgent>"
  local id="$1" p="$2"
  task_exists "$id" || die "nincs ilyen task: $id"
  local ok=0; for v in $VALID_PRIORITIES; do [[ "$p" == "$v" ]] && ok=1; done
  [[ $ok == 1 ]] || die "érvénytelen prioritás: $p (érvényes: $VALID_PRIORITIES)"
  local now; now="$(now_iso)"
  apply_jq --arg id "$id" --arg p "$p" --arg now "$now" '
    .updatedAt=$now
    | (.tasks[]|select(.id==$id)) |= (.priority=$p | .updatedAt=$now | .lastActivityAt=$now)'
  emit_event "$id" "priority:$p" ""
  echo "prioritás: $id -> $p"
}

cmd_tag() {
  require_tasks_file
  [[ $# -ge 3 ]] || die "használat: tag <id> <add|rm> <címke>"
  local id="$1" op="$2" t="$3"
  task_exists "$id" || die "nincs ilyen task: $id"
  local now; now="$(now_iso)"
  case "$op" in
    add) apply_jq --arg id "$id" --arg t "$t" --arg now "$now" '
        .updatedAt=$now
        | (.tasks[]|select(.id==$id)) |= (.tags = (((.tags//[]) + [$t]) | unique) | .updatedAt=$now | .lastActivityAt=$now)'
      echo "címke hozzáadva: $id +$t" ;;
    rm)  apply_jq --arg id "$id" --arg t "$t" --arg now "$now" '
        .updatedAt=$now
        | (.tasks[]|select(.id==$id)) |= (.tags = ((.tags//[]) - [$t]) | .updatedAt=$now | .lastActivityAt=$now)'
      echo "címke eltávolítva: $id -$t" ;;
    *) die "ismeretlen tag művelet: $op (add|rm)" ;;
  esac
  emit_event "$id" "tag:$op" "$t"
}

cmd_assign() {
  require_tasks_file
  [[ $# -ge 2 ]] || die "használat: assign <id> <agent>"
  local id="$1" agent="$2"
  task_exists "$id" || die "nincs ilyen task: $id"
  local now; now="$(now_iso)"
  apply_jq --arg id "$id" --arg a "$agent" --arg now "$now" '
    .updatedAt=$now
    | (.tasks[]|select(.id==$id)) |= (.assignedAgentId=$a | .updatedAt=$now | .lastActivityAt=$now)'
  emit_event "$id" "assign" "$agent"
  echo "hozzárendelve: $id -> $agent"
}

cmd_dep() {
  require_tasks_file
  [[ $# -ge 3 ]] || die "használat: dep <id> <add|rm> <másik-id>"
  local id="$1" op="$2" other="$3"
  task_exists "$id" || die "nincs ilyen task: $id"
  local now; now="$(now_iso)"
  case "$op" in
    add)
      [[ "$id" == "$other" ]] && die "egy task nem függhet önmagától: $id"
      task_exists "$other" || die "nincs ilyen task (függőség): $other"
      # Közvetlen ciklus tiltása: ha 'other' már függ 'id'-től.
      local rev; rev="$(jq -r --arg o "$other" --arg id "$id" \
        '[.tasks[]|select(.id==$o)|(.dependsOn//[])[]]|index($id)' "$TASKS_FILE")"
      [[ "$rev" != "null" ]] && die "ciklikus függőség: $other már függ ettől: $id"
      apply_jq --arg id "$id" --arg o "$other" --arg now "$now" '
        .updatedAt=$now
        | (.tasks[]|select(.id==$id)) |= (.dependsOn = (((.dependsOn//[]) + [$o]) | unique) | .updatedAt=$now | .lastActivityAt=$now)'
      emit_event "$id" "dep:add" "$other"
      echo "függőség: $id ⛔ vár erre: $other" ;;
    rm)
      apply_jq --arg id "$id" --arg o "$other" --arg now "$now" '
        .updatedAt=$now
        | (.tasks[]|select(.id==$id)) |= (.dependsOn = ((.dependsOn//[]) - [$o]) | .updatedAt=$now | .lastActivityAt=$now)'
      emit_event "$id" "dep:rm" "$other"
      echo "függőség törölve: $id -$other" ;;
    *) die "ismeretlen dep művelet: $op (add|rm)" ;;
  esac
}

cmd_deps() {
  require_tasks_file
  [[ $# -ge 1 ]] || die "használat: deps <id>"
  local id="$1"
  task_exists "$id" || die "nincs ilyen task: $id"
  jq -r --arg id "$id" '
    . as $root
    | def stat($i): ($root.tasks[]|select(.id==$i)|.status) // "?";
      ($root.tasks[]|select(.id==$id)) as $t
    | "Task: \($id) [\($t.status)]",
      "",
      "Erre vár (dependsOn):",
      ( if (($t.dependsOn//[])|length)==0 then "  – nincs"
        else ($t.dependsOn[] | "  \(.) [\(stat(.))]") end ),
      "",
      "Ezeket blokkolja (rá hivatkozik):",
      ( [ $root.tasks[] | select(((.dependsOn//[])|index($id)) != null) | "  \(.id) [\(.status)]" ]
        | if length==0 then "  – nincs" else .[] end )
  ' "$TASKS_FILE"
}

cmd_next() {
  require_tasks_file
  jq -r '
    . as $root
    | def doneish($i): ($root.tasks[]|select(.id==$i)) as $d
        | ($d==null) or ($d.status=="done") or ($d.isArchived==true);
      def prio_rank: {"urgent":0,"high":1,"normal":2,"low":3}[(.priority//"normal")] // 2;
      [ $root.tasks[]
        | select((.isArchived//false)|not)
        | select(.status=="todo")
        | select( ((.dependsOn//[]) | map(doneish(.)) | all) ) ]
      | sort_by(prio_rank, .createdAt)
      | if length==0 then "nincs elérhető todo (mind blokkolt, kész, vagy nincs todo)"
        else (.[] | "\(.id)\t[\(.priority//"normal")]\t\(.title)") end
  ' "$TASKS_FILE" | column -t -s $'\t'
}

cmd_reopen() {
  require_tasks_file
  [[ $# -ge 1 ]] || die "használat: reopen <id> [status=todo]"
  local id="$1" new="${2:-todo}"
  task_exists "$id" || die "nincs ilyen task: $id"
  is_valid_status "$new" || die "érvénytelen státusz: $new (érvényes: $VALID_STATUSES)"
  local now; now="$(now_iso)"
  apply_jq --arg id "$id" --arg new "$new" --arg now "$now" '
    .updatedAt=$now
    | (.tasks[]|select(.id==$id)) |= (
        .history += [{at:$now, type:"reopened", note:"Task reopened.", fromStatus:.status, toStatus:$new}]
        | .status=$new | .isArchived=false | .updatedAt=$now | .lastActivityAt=$now)'
  emit_event "$id" "status:$new" "reopened"
  echo "újranyitva: $id -> $new"
}

cmd_status_many() {
  require_tasks_file
  [[ $# -ge 2 ]] || die "használat: status-many <status> <id> [id...]"
  local new="$1"; shift
  is_valid_status "$new" || die "érvénytelen státusz: $new (érvényes: $VALID_STATUSES)"
  local id
  for id in "$@"; do task_exists "$id" || die "nincs ilyen task: $id"; done
  local ids_json; ids_json="$(printf '%s\n' "$@" | jq -R . | jq -s .)"
  local now; now="$(now_iso)"
  apply_jq --arg new "$new" --arg now "$now" --argjson ids "$ids_json" '
    .updatedAt=$now
    | (.tasks[] | select((.id as $i | $ids | index($i)) != null)) |= (
        .history += [{at:$now, type:"status_changed", note:null, fromStatus:.status, toStatus:$new}]
        | .status=$new | .updatedAt=$now | .lastActivityAt=$now)'
  for id in "$@"; do emit_event "$id" "status:$new" ""; done
  echo "státusz (tömeges): $* -> $new"
}

# --- Robusztusság: validate / restore ----------------------------------------

cmd_validate() {
  require_tasks_file
  jq -e . "$TASKS_FILE" >/dev/null 2>&1 || { echo "VALIDÁCIÓ: HIBÁS – érvénytelen JSON"; return 1; }
  local report
  report="$(jq -r --arg statuses "$VALID_STATUSES" --arg prios "$VALID_PRIORITIES" '
    ($statuses|split(" ")) as $vs
    | ($prios|split(" ")) as $vp
    | ([.tasks[].id]) as $ids
    | ( [ .tasks[]
          | . as $t
          | ( if ($t.id//"")=="" then "üres/hiányzó id egy tasknál" else empty end ),
            ( if ($t.title//"")=="" then "\($t.id): hiányzó title" else empty end ),
            ( if ($vs|index($t.status)) then empty else "\($t.id): érvénytelen státusz: \($t.status)" end ),
            ( if (($t.priority//"normal") as $p | $vp|index($p)) then empty else "\($t.id): érvénytelen prioritás: \($t.priority)" end ),
            ( ($t.dependsOn//[])[] as $d | select(($ids|index($d))==null) | "\($t.id): törött függőség -> \($d)" )
        ] )
    + ( [.tasks[].id] | group_by(.) | map(select(length>1)|.[0]) | map("duplikált id: \(.)") )
    | .[]
  ' "$TASKS_FILE")"
  if [[ -n "$report" ]]; then
    echo "$report"
    echo "─"
    echo "VALIDÁCIÓ: HIBÁS ($(printf '%s\n' "$report" | grep -c . ) probléma)"
    return 1
  fi
  echo "VALIDÁCIÓ: OK ($(jq '.tasks|length' "$TASKS_FILE") task)"
}

cmd_restore() {
  [[ -f "$BACKUP_FILE" ]] || die "nincs backup: $BACKUP_FILE"
  acquire_lock
  [[ -f "$TASKS_FILE" ]] && cp "$TASKS_FILE" "$TASKS_FILE.prerestore" 2>/dev/null || true
  cp "$BACKUP_FILE" "$TASKS_FILE"
  release_lock
  echo "visszaállítva a backupból: $BACKUP_FILE -> $TASKS_FILE (előző: $TASKS_FILE.prerestore)"
}

# --- Inbox: per-agent, dedup-olt esemény-értesítés ---------------------------
# `inbox <agent>`: az <agent> cursorja óta keletkezett, MÁS agent által generált
# eseményeket adja vissza (a sajátjait nem), majd lépteti a cursort. NÉMA, ha nincs
# új esemény (üres kimenet) — így a hook csak akkor injektál, ha van mit.
# Első csatlakozáskor NEM dumpolja a teljes múltat: a cursort a jelenlegi végére
# állítja, és csak az onnantól keletkező eseményeket hozza. A hívó agentet a
# PostToolUse hook adja meg (a --as jelzőből); ez a parancs maga NEM igényel --as-t.
cmd_inbox() {
  [[ $# -ge 1 ]] || die "használat: inbox <agent>"
  local agent="$1"
  [[ -f "$EVENTS_FILE" ]] || return 0
  local maxseq; maxseq="$(wc -l < "$EVENTS_FILE" 2>/dev/null | tr -d ' ')"
  [[ -z "$maxseq" ]] && maxseq=0
  mkdir -p "$CURSORS_DIR" 2>/dev/null || true
  # Fájlnév-biztos cursor-kulcs (az agent-nevek jellemzően [A-Za-z0-9_-], de védünk).
  local safe; safe="$(printf '%s' "$agent" | tr -c 'A-Za-z0-9_.-' '_')"
  local cursor_file="$CURSORS_DIR/$safe"
  if [[ ! -f "$cursor_file" ]]; then
    printf '%s\n' "$maxseq" > "$cursor_file" 2>/dev/null || true
    return 0
  fi
  local seen; seen="$(cat "$cursor_file" 2>/dev/null || echo 0)"
  [[ "$seen" =~ ^[0-9]+$ ]] || seen=0
  # Cursort előre visszük (a saját eseményeinken se pörögjön újra), majd szűrünk.
  printf '%s\n' "$maxseq" > "$cursor_file" 2>/dev/null || true
  jq -r --argjson seen "$seen" --arg me "$agent" '
      select(.seq > $seen and .by != $me)
      | "📬 [\(.task)] \(.by) → \(.kind)" + (if ((.text//"")|length)==0 then "" else ": \(.text)" end)
    ' "$EVENTS_FILE" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Parancsok — context.json (session-folytonosság)
# ---------------------------------------------------------------------------
# A context.json-t IS csak ezeken a parancsokon át szabad írni (soha közvetlen
# Read/Write/Edit), hogy egyetlen atomikus író legyen mindkét store-hoz.

cmd_ctx() {  # a teljes context.json (kicsi, olcsó olvasni)
  require_context_file
  cat "$CONTEXT_FILE"
}

cmd_ctx_init() {
  local init="${1:-}" goal="${2:-}"
  if [[ -f "$CONTEXT_FILE" ]]; then
    echo "már létezik: $CONTEXT_FILE"
    return 0
  fi
  ensure_context_file
  local now; now="$(now_iso)"
  apply_ctx --arg init "$init" --arg goal "$goal" --arg now "$now" \
    '.updatedAt=$now | .initPrompt=$init | .goal=$goal'
  echo "kész: $CONTEXT_FILE"
}

cmd_ctx_set() {
  ensure_context_file
  [[ $# -ge 2 ]] || die "használat: ctx-set <mező> <json-érték>"
  local field="$1" value="$2"
  echo "$value" | jq -e . >/dev/null 2>&1 \
    || die "az érték nem érvényes JSON: $value (string esetén idézd: '\"szöveg\"')"
  local now; now="$(now_iso)"
  apply_ctx --arg field "$field" --argjson value "$value" --arg now "$now" \
    '.updatedAt=$now | .[$field]=$value'
  echo "context beállítva: $field"
}

cmd_ctx_decision() {
  ensure_context_file
  [[ $# -ge 2 ]] || die "használat: ctx-decision <téma> <döntés> [indoklás]"
  local topic="$1" decision="$2" rationale="${3:-}"
  local now; now="$(now_iso)"
  apply_ctx --arg topic "$topic" --arg decision "$decision" \
            --arg rationale "$rationale" --arg now "$now" \
    '.updatedAt=$now
     | .decisions += [{at:$now, topic:$topic, decision:$decision, rationale:$rationale}]'
  echo "döntés rögzítve: $topic"
}

cmd_ctx_constraint() {
  ensure_context_file
  [[ $# -ge 1 ]] || die "használat: ctx-constraint <szöveg>"
  local text="$1"
  local now; now="$(now_iso)"
  apply_ctx --arg text "$text" --arg now "$now" \
    '.updatedAt=$now | .constraints += [$text]'
  echo "megkötés hozzáadva"
}

cmd_ctx_question() {
  ensure_context_file
  [[ $# -ge 2 ]] || die "használat: ctx-question <add|rm> <szöveg>"
  local op="$1" text="$2"
  local now; now="$(now_iso)"
  case "$op" in
    add)
      apply_ctx --arg text "$text" --arg now "$now" \
        '.updatedAt=$now | .openQuestions += [$text]'
      echo "nyitott kérdés hozzáadva" ;;
    rm|resolve)
      apply_ctx --arg text "$text" --arg now "$now" \
        '.updatedAt=$now | .openQuestions |= map(select(. != $text))'
      echo "kérdés lezárva" ;;
    *) die "ismeretlen ctx-question művelet: $op (add|rm)" ;;
  esac
}

# ---------------------------------------------------------------------------
# Belépési pont
# ---------------------------------------------------------------------------

# A parancsok, amelyeknél a --as NEM kötelező (meta / diagnosztika / a hook maga hívja).
# Minden más parancs KÖTELEZŐEN igényli a --as <agent>-et (a hívó agent azonosítása,
# amiből a hook a helyes inboxot injektálja, és amit az emit_event `by`-ként rögzít).
actor_optional() {
  case "$1" in
    help|-h|--help|inbox|init|validate|check|restore|raw) return 0 ;;
    *) return 1 ;;
  esac
}

main() {
  local cmd="${1:-help}"
  shift || true

  # --as <agent> kiszedése BÁRHONNAN az argumentumok közül; a maradék az A tömb.
  local -a A=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --as) ACTOR="${2:-}"; shift 2 || shift ;;
      --as=*) ACTOR="${1#--as=}"; shift ;;
      *) A+=("$1"); shift ;;
    esac
  done

  # --as követelése (a meta parancsok kivételével). Így a hook mindig tudja a hívót,
  # és minden esemény `by`-jal íródik.
  if ! actor_optional "$cmd"; then
    [[ -n "$ACTOR" ]] || die "kötelező a --as <agent> megadása (pl. --as main). Parancs: $cmd"
  fi

  # A "${A[@]}" bash 3.2 (macOS) + set -u alatt üres tömbnél 'unbound' hibát dobna;
  # a ${A[@]+...} guard ezt kerüli meg.
  set -- ${A[@]+"${A[@]}"}

  case "$cmd" in
    help|-h|--help) cmd_help ;;
    inbox)     cmd_inbox "$@" ;;
    init)      cmd_init "$@" ;;
    list|ls)   cmd_list "$@" ;;
    ids)       cmd_ids "$@" ;;
    get)       cmd_get "$@" ;;
    field)     cmd_field "$@" ;;
    summary)   cmd_summary "$@" ;;
    find)      cmd_find "$@" ;;
    history)   cmd_history "$@" ;;
    raw)       cmd_raw "$@" ;;
    next)      cmd_next "$@" ;;
    deps)      cmd_deps "$@" ;;
    validate|check) cmd_validate "$@" ;;
    add)       cmd_add "$@" ;;
    status)    cmd_status "$@" ;;
    status-many|status-multi) cmd_status_many "$@" ;;
    reopen)    cmd_reopen "$@" ;;
    note)      cmd_note "$@" ;;
    set)       cmd_set "$@" ;;
    priority|prio) cmd_priority "$@" ;;
    tag)       cmd_tag "$@" ;;
    assign)    cmd_assign "$@" ;;
    dep)       cmd_dep "$@" ;;
    archive)   cmd_archive "$@" ;;
    unarchive) cmd_unarchive "$@" ;;
    restore)   cmd_restore "$@" ;;
    rm|remove) cmd_rm "$@" ;;
    ctx|context)    cmd_ctx "$@" ;;
    ctx-init)       cmd_ctx_init "$@" ;;
    ctx-set)        cmd_ctx_set "$@" ;;
    ctx-decision)   cmd_ctx_decision "$@" ;;
    ctx-constraint) cmd_ctx_constraint "$@" ;;
    ctx-question)   cmd_ctx_question "$@" ;;
    *) die "ismeretlen parancs: $cmd (súgó: task.sh help)" ;;
  esac
}

main "$@"

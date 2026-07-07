#!/usr/bin/env bash
#
# projects.sh — projekt-regisztráló admin CLI a claude-task-manager-hez.
#
# Minden regisztrált projekthez létrehoz egy saját adat-könyvtárat
# (data/<id>/tasks.json stb., a meglévő task.sh init-jével) és egy abszolút
# útvonalú, a projekt-azonosítót "beégető" wrapper scriptet
# (wrappers/<id>.sh), amit a célprojektbe ki lehet másolni, hogy az ottani agentek TM_DIR
# nélkül, közvetlenül hívhassák.
#
# Használat:
#   ./projects.sh add <id> <label>
#   ./projects.sh list
#   ./projects.sh rm <id>
#   ./projects.sh wrapper <id>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DATA_ROOT="$ROOT_DIR/data"
WRAPPERS_DIR="$ROOT_DIR/wrappers"
ENGINE_TASK_SH="$ROOT_DIR/engine/task.sh"
PROJECTS_FILE="$DATA_ROOT/projects.json"
LOCK_DIR="$DATA_ROOT/.projects.lock"

die() { echo "hiba: $*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || die "jq nincs telepítve (kell a scripthez)."

now_iso() { date -u +%Y-%m-%dT%H:%M:%S.000Z; }

is_valid_id() {
  [[ "$1" =~ ^[A-Za-z0-9_-]+$ ]]
}

# --- Konkurrencia-zár (ugyanaz a mkdir-alapú minta, mint az engine task.sh-ban) --------------
LOCK_HELD=0
acquire_lock() {
  local waited=0 timeout=15
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
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

ensure_projects_file() {
  mkdir -p "$DATA_ROOT"
  [[ -f "$PROJECTS_FILE" ]] || echo '[]' > "$PROJECTS_FILE"
}

project_exists() {
  local id="$1"
  [[ "$(jq --arg id "$id" '[.[]|select(.id==$id)]|length' "$PROJECTS_FILE")" != "0" ]]
}

# Atomikus írás a PROJECTS_FILE-ra (jq-filter, temp fájlon át).
apply_jq() {
  acquire_lock
  local tmp
  tmp="$(mktemp "${PROJECTS_FILE}.XXXXXX")"
  if jq "$@" "$PROJECTS_FILE" > "$tmp"; then
    mv "$tmp" "$PROJECTS_FILE"
  else
    rm -f "$tmp"
    release_lock
    die "jq művelet sikertelen."
  fi
  release_lock
}

wrapper_path() { echo "$WRAPPERS_DIR/$1.sh"; }
data_dir()     { echo "$DATA_ROOT/$1"; }

write_wrapper() {
  local id="$1" label="$2" dataDir="$3" wpath="$4"
  mkdir -p "$WRAPPERS_DIR"
  cat > "$wpath" <<EOF
#!/usr/bin/env bash
# Automatikusan generálva a claude-task-manager "${label}" projektjéhez — kézzel ne szerkeszd.
# Újragenerálás: engine/projects.sh add ${id} "${label}"  (felülírja)
exec env TM_DIR="${dataDir}" \\
  "${ENGINE_TASK_SH}" "\$@"
EOF
  chmod +x "$wpath"
}

cmd_add() {
  [[ $# -ge 2 ]] || die "használat: add <id> <label>"
  local id="$1" label="$2"
  is_valid_id "$id" || die "érvénytelen id (csak A-Za-z0-9_- engedett): $id"
  ensure_projects_file
  local dataDir wpath now
  dataDir="$(data_dir "$id")"
  wpath="$(wrapper_path "$id")"
  now="$(now_iso)"

  mkdir -p "$dataDir"
  TM_DIR="$dataDir" "$ENGINE_TASK_SH" init >/dev/null
  TM_DIR="$dataDir" "$ENGINE_TASK_SH" ctx-init "" "" --as projects-admin >/dev/null

  write_wrapper "$id" "$label" "$dataDir" "$wpath"

  if project_exists "$id"; then
    apply_jq --arg id "$id" --arg label "$label" --arg dataDir "$dataDir" \
             --arg wpath "$wpath" --arg now "$now" \
      '(.[]|select(.id==$id)) |= (.label=$label | .dataDir=$dataDir | .wrapperPath=$wpath)'
    echo "frissítve: $id"
  else
    apply_jq --arg id "$id" --arg label "$label" --arg dataDir "$dataDir" \
             --arg wpath "$wpath" --arg now "$now" \
      '. += [{id:$id, label:$label, dataDir:$dataDir, wrapperPath:$wpath, createdAt:$now}]'
    echo "hozzáadva: $id -> $dataDir (wrapper: $wpath)"
  fi
}

cmd_list() {
  ensure_projects_file
  jq -r '.[] | "\(.id)\t\(.label)\t\(.dataDir)"' "$PROJECTS_FILE" | column -t -s $'\t'
}

cmd_rm() {
  [[ $# -ge 1 ]] || die "használat: rm <id>"
  local id="$1"
  ensure_projects_file
  project_exists "$id" || die "nincs ilyen projekt: $id"
  apply_jq --arg id "$id" '[.[]|select(.id!=$id)]'
  rm -rf "$(data_dir "$id")"
  rm -f "$(wrapper_path "$id")"
  echo "törölve: $id (adatok és wrapper is)"
}

cmd_wrapper() {
  [[ $# -ge 1 ]] || die "használat: wrapper <id>"
  local id="$1"
  ensure_projects_file
  project_exists "$id" || die "nincs ilyen projekt: $id"
  cat "$(wrapper_path "$id")"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    add)     cmd_add "$@" ;;
    list|ls) cmd_list "$@" ;;
    rm|remove) cmd_rm "$@" ;;
    wrapper) cmd_wrapper "$@" ;;
    *) die "ismeretlen parancs: $cmd (add|list|rm|wrapper)" ;;
  esac
}

main "$@"

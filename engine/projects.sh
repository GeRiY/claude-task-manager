#!/usr/bin/env bash
#
# projects.sh — project-registration admin CLI for claude-task-manager.
#
# For every registered project, creates its own data directory (data/<id>/tasks.json etc.,
# using the existing task.sh init) and an absolute-path wrapper script with the project id
# "baked in" (wrappers/<id>.sh), which can be copied into the target project so its agents
# can call it directly, without needing TM_DIR.
#
# Usage:
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

# shellcheck source=engine/check-update.sh
source "$ROOT_DIR/engine/check-update.sh"
check_for_updates "$ROOT_DIR"

die() { echo "error: $*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || die "jq is not installed (required for this script)."

now_iso() { date -u +%Y-%m-%dT%H:%M:%S.000Z; }

is_valid_id() {
  [[ "$1" =~ ^[A-Za-z0-9_-]+$ ]]
}

# --- Concurrency lock (same mkdir-based pattern as the engine task.sh) --------------
LOCK_HELD=0
acquire_lock() {
  local waited=0 timeout=15
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    waited=$((waited + 1))
    [[ $waited -ge $((timeout * 20)) ]] && die "could not acquire lock within ${timeout}s: $LOCK_DIR"
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

# Atomic write to PROJECTS_FILE (jq filter, via a temp file).
apply_jq() {
  acquire_lock
  local tmp
  tmp="$(mktemp "${PROJECTS_FILE}.XXXXXX")"
  if jq "$@" "$PROJECTS_FILE" > "$tmp"; then
    mv "$tmp" "$PROJECTS_FILE"
  else
    rm -f "$tmp"
    release_lock
    die "jq operation failed."
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
# Auto-generated for the claude-task-manager "${label}" project — do not edit by hand.
# Regenerate with: engine/projects.sh add ${id} "${label}"  (overwrites)
exec env TM_DIR="${dataDir}" \\
  "${ENGINE_TASK_SH}" "\$@"
EOF
  chmod +x "$wpath"
}

cmd_add() {
  [[ $# -ge 2 ]] || die "usage: add <id> <label>"
  local id="$1" label="$2"
  is_valid_id "$id" || die "invalid id (only A-Za-z0-9_- allowed): $id"
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
    echo "updated: $id"
  else
    apply_jq --arg id "$id" --arg label "$label" --arg dataDir "$dataDir" \
             --arg wpath "$wpath" --arg now "$now" \
      '. += [{id:$id, label:$label, dataDir:$dataDir, wrapperPath:$wpath, createdAt:$now}]'
    echo "added: $id -> $dataDir (wrapper: $wpath)"
  fi
}

cmd_list() {
  ensure_projects_file
  jq -r '.[] | "\(.id)\t\(.label)\t\(.dataDir)"' "$PROJECTS_FILE" | column -t -s $'\t'
}

cmd_rm() {
  [[ $# -ge 1 ]] || die "usage: rm <id>"
  local id="$1"
  ensure_projects_file
  project_exists "$id" || die "no such project: $id"
  apply_jq --arg id "$id" '[.[]|select(.id!=$id)]'
  rm -rf "$(data_dir "$id")"
  rm -f "$(wrapper_path "$id")"
  echo "removed: $id (data and wrapper too)"
}

cmd_wrapper() {
  [[ $# -ge 1 ]] || die "usage: wrapper <id>"
  local id="$1"
  ensure_projects_file
  project_exists "$id" || die "no such project: $id"
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
    *) die "unknown command: $cmd (add|list|rm|wrapper)" ;;
  esac
}

main "$@"

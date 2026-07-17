#!/usr/bin/env bash
#
# feedback.sh — a GLOBAL, cross-project feedback log for claude-task-manager itself: a place
# for a Claude Code agent (working in ANY project this tool is installed into) to report a bug
# or observation about the TOOL, so the tool's own developer can act on it. This is deliberately
# NOT part of any project's tasks.json — it lives once, in claude-task-manager's own data/ dir,
# shared across every installed project.
#
# Two callers:
#   - engine/task.sh's `feedback` command — the one agents actually use (already on the
#     project's Bash allowlist, so it runs frictionless like every other task.sh call).
#   - bin/ctm's `feedback` subcommand — for the human maintainer: `add` (same write path, for
#     filing something by hand) and `show` (read the log back).
#
# Format: ONE line per entry —
#   [<UTC timestamp>] [<project>/<agent>] - <cause>, <parameter>, <explanation>
# All three free-text fields have embedded newlines stripped, so an entry can never wrap into
# a second line and corrupt the one-entry-per-line invariant.
#
# Storage: claude-task-manager/data/_feedback.log — data/ is already gitignored (see
# .gitignore's `/data/`), so this never ends up committed, exactly like per-project state.
# The leading underscore keeps it visually and namespace-distinct from a project id's own
# data/<id>/ directory (project ids are validated elsewhere to be non-empty [A-Za-z0-9_-]+,
# so a literal project called "_feedback" would collide on a DIRECTORY name, not this FILE).

_FB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEEDBACK_FILE="${FEEDBACK_FILE:-$_FB_ROOT/data/_feedback.log}"
_FEEDBACK_LOCK_DIR="${FEEDBACK_FILE}.lock"

# Self-contained mkdir-lock — deliberately NOT sharing state with task.sh's per-project
# tasks.json lock (a different file, different concern): two agents in two different
# projects can file feedback at the same moment and must still serialize against each other
# on this one shared file.
_fb_lock_age() {
  local m now
  m="$(stat -f %m "$_FEEDBACK_LOCK_DIR" 2>/dev/null || stat -c %Y "$_FEEDBACK_LOCK_DIR" 2>/dev/null || echo "")"
  [[ -z "$m" ]] && { echo ""; return; }
  now="$(date +%s)"
  echo $(( now - m ))
}

_fb_acquire_lock() {
  local waited=0 timeout=15 stale=60
  while ! mkdir "$_FEEDBACK_LOCK_DIR" 2>/dev/null; do
    local age; age="$(_fb_lock_age)"
    if [[ -n "$age" && "$age" -ge "$stale" ]]; then
      rm -rf "$_FEEDBACK_LOCK_DIR" 2>/dev/null || true
      continue
    fi
    waited=$((waited + 1))
    [[ $waited -ge $((timeout * 20)) ]] && { echo "error: could not acquire feedback lock within ${timeout}s: $_FEEDBACK_LOCK_DIR" >&2; return 1; }
    sleep 0.05
  done
  trap '_fb_release_lock' EXIT INT TERM
  return 0
}

_fb_release_lock() {
  rm -rf "$_FEEDBACK_LOCK_DIR" 2>/dev/null || true
}

# log_feedback <cause> <parameter> <explanation> <actor> <project>
# Appends one line. Returns non-zero (with a message on stderr) if the lock can't be taken.
log_feedback() {
  local cause="$1" param="$2" body="$3" actor="$4" project="$5"
  local clean_cause clean_param clean_body ts
  clean_cause="$(printf '%s' "$cause" | tr '\n\r' '  ')"
  clean_param="$(printf '%s' "$param" | tr '\n\r' '  ')"
  clean_body="$(printf '%s'  "$body"  | tr '\n\r' '  ')"
  ts="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

  mkdir -p "$(dirname "$FEEDBACK_FILE")"
  _fb_acquire_lock || return 1
  printf '[%s] [%s/%s] - %s, %s, %s\n' "$ts" "$project" "$actor" "$clean_cause" "$clean_param" "$clean_body" >> "$FEEDBACK_FILE"
  _fb_release_lock
  return 0
}

# show_feedback [n] — print the last <n> entries (default: all), plus a total count.
show_feedback() {
  local n="${1:-}"
  if [[ ! -f "$FEEDBACK_FILE" ]]; then
    echo "(no feedback filed yet — $FEEDBACK_FILE doesn't exist)"
    return 0
  fi
  local total; total="$(wc -l < "$FEEDBACK_FILE" | tr -d '[:space:]')"
  if [[ -n "$n" ]]; then
    tail -n "$n" "$FEEDBACK_FILE"
    echo "--- showing last $n of $total ---"
  else
    cat "$FEEDBACK_FILE"
    echo "--- $total total ---"
  fi
}

# Standalone use: feedback.sh add <cause> <param> <body> <actor> <project> | feedback.sh show [n]
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-show}" in
    add)  shift; log_feedback "$@" ;;
    show) shift; show_feedback "$@" ;;
    *) echo "usage: feedback.sh {add <cause> <param> <body> <actor> <project> | show [n]}" >&2; exit 1 ;;
  esac
fi

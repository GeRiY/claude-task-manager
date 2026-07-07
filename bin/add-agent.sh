#!/usr/bin/env bash
#
# add-agent.sh — create a custom teammate agent definition in an ALREADY installed
# (ctm init-ed) project.
#
# Naming convention: claude-task-manager's base set, installed by install.sh, is always
# "ctm-*" (ctm-frontend-developer / ctm-backend-developer / ctm-code-investigator) —
# generated/refreshed by "ctm init". Custom agents created with THIS script, as needed by
# the user, are always named "tm-*" — so at a glance you can tell what's the auto-refreshed
# base set apart from a custom, hand-edited addition ("ctm init" never touches these).
#
# Usage (typically invoked via the "ctm agent add" subcommand):
#   /Users/mgeri1993/code/projects/claude-task-manager/bin/add-agent.sh [target-dir] <name> [description]
#
# target-dir  – defaults to the current directory's git root (or the cwd)
# name        – the custom agent's name, WITH or WITHOUT the "tm-" prefix — the result is
#               always "tm-<name>" (the "ctm-" prefix is reserved, you cannot use it).
# description – a short, one-sentence role description (goes into the generated .md's
#               description field)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

die() { echo "error: $*" >&2; exit 1; }

# shellcheck source=engine/check-update.sh
source "$ROOT_DIR/engine/check-update.sh"
check_for_updates "$ROOT_DIR"

TARGET_ARG="${1:-}"
if [[ -n "$TARGET_ARG" && -d "$TARGET_ARG" ]]; then
  TARGET_DIR="$(cd "$TARGET_ARG" && pwd)"
  shift
elif ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  TARGET_DIR="$ROOT"
else
  TARGET_DIR="$(pwd)"
fi

RAW_NAME="${1:-}"
[[ -n "$RAW_NAME" ]] || die "usage: add-agent.sh [target-dir] <name> [description]"
shift || true
DESCRIPTION="${*:-Custom, project-specific teammate.}"

SKILL_DIR="$TARGET_DIR/.claude/skills/task-manager"
TASK_SH="$SKILL_DIR/task.sh"
[[ -x "$TASK_SH" ]] || die "this project is not installed — run first: ctm init (here: $TARGET_DIR)"

# Normalize the name: always with a "tm-" prefix; "ctm-" is reserved (the base set's prefix).
SHORT="${RAW_NAME#tm-}"
[[ "$SHORT" == ctm-* || "$SHORT" == ctm ]] && die 'the "ctm-" prefix is reserved (for the base agents) — choose a different name'
[[ "$SHORT" =~ ^[A-Za-z0-9_-]+$ ]] || die "invalid name (only A-Za-z0-9_- allowed): $RAW_NAME"
AGENT_NAME="tm-$SHORT"

# The project label, from the already-installed SKILL.md's "# Task Manager (Label)" heading
# (more accurate than the folder name, if "ctm init" was given a custom label); falls back
# to the folder name if there's no such line.
LABEL="$(sed -n 's/^# Task Manager (\(.*\))$/\1/p' "$SKILL_DIR/SKILL.md" 2>/dev/null | head -1)"
LABEL="${LABEL:-$(basename "$TARGET_DIR")}"

AGENTS_DIR="$TARGET_DIR/.claude/agents"
mkdir -p "$AGENTS_DIR"
OUT="$AGENTS_DIR/$AGENT_NAME.md"
[[ -e "$OUT" ]] && die "already exists: $OUT (delete it by hand if you want to regenerate it)"

sed \
  -e "s#__AGENT_NAME__#$AGENT_NAME#g" \
  -e "s#__AGENT_SHORT__#$SHORT#g" \
  -e "s#__AGENT_DESCRIPTION__#$DESCRIPTION#g" \
  -e "s#__PROJECT_LABEL__#$LABEL#g" \
  -e "s#__TASK_SH_PATH__#$TASK_SH#g" \
  "$ROOT_DIR/templates/tm-custom.md.tmpl" > "$OUT"

echo "created: $OUT"
echo "(--as/assign value: \"$SHORT\" — edit the file if you need to refine its role/scope)"

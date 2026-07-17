#!/usr/bin/env bash
#
# add-agent.sh — create a custom teammate agent definition in an ALREADY installed
# (ctm init-ed) project.
#
# Naming convention: claude-task-manager's base roster, installed by install.sh, is always
# named "ctm-*" (the be-/fe- x junior/medior/senior dev tiers + ctm-investigator /
# ctm-playwright-tester — the launch name IS the task-manager identity, nothing is stripped)
# — generated/refreshed by "ctm init". Custom agents created with THIS script, as needed by
# the user, are always named "tm-*" instead — two disjoint namespaces, so at a glance (and by
# construction) you can tell the auto-refreshed base roster apart from a custom, hand-edited
# addition ("ctm init" never touches "tm-*" files).
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

# shellcheck source=engine/roster.sh
source "$ROOT_DIR/engine/roster.sh"

# shellcheck source=engine/agent-tools.sh
source "$ROOT_DIR/engine/agent-tools.sh"

# shellcheck source=engine/agent-block.sh
source "$ROOT_DIR/engine/agent-block.sh"

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

# Normalize the name: always with a "tm-" prefix. A custom agent's task-manager IDENTITY is the
# stripped SHORT (its `--as` value) — since every base-roster name already lives in the disjoint
# "ctm-" namespace, the blanket "ctm-*"-is-reserved rule below is what actually prevents a
# collision (e.g. `add-agent ctm-be-medior` or `add-agent tm-ctm-be-medior` would both otherwise
# produce a custom agent claiming tasks AS `ctm-be-medior` — the same identity as the real base
# agent, fighting it over the same queue).
#
# The per-name loop below is a second, narrower safety net for the (currently theoretical) case
# of a roster name that does NOT start with "ctm-" — it comes from roster.sh, so adding a tier
# to templates/agents-manifest.json reserves its name here automatically; a hardcoded copy would
# silently rot the moment the roster changes.
BASE_AGENTS="$(roster_agent_names | paste -sd ' ' -)"
SHORT="${RAW_NAME#tm-}"
[[ "$SHORT" == ctm-* || "$SHORT" == ctm ]] && die 'the "ctm-" prefix is reserved — choose a different name'
for reserved in $BASE_AGENTS; do
  [[ "$SHORT" == "$reserved" ]] && die "the name \"$SHORT\" is a base agent — a custom agent would claim tasks as the same identity; choose a different name"
done
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

AGENT_TOOLS="$(resolve_agent_tools "$AGENT_NAME" "$TARGET_DIR")"
BLOCK_FILE="$(agent_block_tempfile "$AGENT_NAME" "$TARGET_DIR")"
sed \
  -e "s#__AGENT_NAME__#$AGENT_NAME#g" \
  -e "s#__AGENT_SHORT__#$SHORT#g" \
  -e "s#__AGENT_DESCRIPTION__#$DESCRIPTION#g" \
  -e "s#__PROJECT_LABEL__#$LABEL#g" \
  -e "s#__TASK_SH_PATH__#$TASK_SH#g" \
  -e "s#__AGENT_TOOLS__#$AGENT_TOOLS#g" \
  -e "s#__PROJECT_CLAUDE_DIR__#$TARGET_DIR/.claude#g" \
  "$ROOT_DIR/templates/tm-custom.md.tmpl" | sed -e "/^__AGENT_BLOCK__\$/r $BLOCK_FILE" -e "/^__AGENT_BLOCK__\$/d" > "$OUT"
rm -f "$BLOCK_FILE"

echo "created: $OUT"
echo "(--as/assign value: \"$SHORT\" — edit the file if you need to refine its role/scope)"

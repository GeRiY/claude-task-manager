#!/usr/bin/env bash
#
# install.sh — installs the claude-task-manager "client" into an arbitrary project.
#
# Run from inside any project, it registers that project with claude-task-manager (data
# directory + wrapper task.sh generation via engine/projects.sh), then creates in the target
# project:
#   - .claude/skills/task-manager/task.sh   — a COPY of the generated wrapper (carries its
#     own TM_DIR baked in; no docker needed, plain host-bash script)
#   - .claude/skills/task-manager/SKILL.md  — the Claude Code skill documentation (from this
#     project's own "SKILL.md" template)
#   - .claude/agents/*.md                   — generic teammate agent definitions (the roster:
#                                             engine/roster.sh + templates/agents-manifest.json)
#   - .claude/hooks/allow-task-sh.sh + notify-inbox.sh — PreToolUse/PostToolUse hooks
#     (auto-allow + inbox notification), registered in .claude/settings.json
# and extends the target project's .claude/settings.local.json Bash allowlist with the
# task.sh call, so it runs without a permission prompt.
#
# The board itself (index.html, port 3333) does NOT get installed into the target project —
# it runs from claude-task-manager's own docker compose, shared by every installed project
# (pick your project in the Source selector).
#
# Usage:
#   /Users/mgeri1993/code/projects/claude-task-manager/install.sh [target-dir] [project-id] [label] [--force|-y]
#
# target-dir  – defaults to the current directory's git root (or the cwd itself, if no git)
# project-id  – defaults to the target-dir folder name (A-Za-z0-9_- characters only)
# label       – defaults to project-id
# --force/-y  – overwrite existing generated files without prompting (also the default
#               behavior in a non-interactive/non-tty session, where prompting isn't possible
#               — pass this explicitly to opt into overwriting there)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "error: $*" >&2; exit 1; }

# shellcheck source=engine/check-update.sh
source "$SCRIPT_DIR/engine/check-update.sh"
check_for_updates "$SCRIPT_DIR"

# shellcheck source=engine/roster.sh
# Provides roster_agent_names / roster_agent_field / roster_area_field — the authoritative
# roster (templates/agents-manifest.json + the standalone templates/agents/*.md.tmpl set).
source "$SCRIPT_DIR/engine/roster.sh"

# shellcheck source=engine/agent-tools.sh
# Provides resolve_agent_tools <name> [target-dir] — the per-agent tools allow-list baked into
# each generated agent's frontmatter (config: templates/agent-tools.json, project override:
# <target>/.claude/agent-tools.json).
source "$SCRIPT_DIR/engine/agent-tools.sh"

# shellcheck source=engine/agent-block.sh
# Provides agent_block_tempfile <name> [target-dir] — the optional free-text "project block"
# baked into each generated agent's body (config: templates/agent-blocks/, project override:
# <target>/.claude/agent-blocks/).
source "$SCRIPT_DIR/engine/agent-block.sh"

command -v jq >/dev/null 2>&1 || die "jq is not installed (required for this script)."

# --force/-y/--yes can appear anywhere in the arguments; the rest are positional.
FORCE=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --force|-y|--yes) FORCE=1 ;;
    *) ARGS+=("$a") ;;
  esac
done
set -- ${ARGS[@]+"${ARGS[@]}"}

TARGET_ARG="${1:-}"
if [[ -n "$TARGET_ARG" ]]; then
  TARGET_DIR="$(cd "$TARGET_ARG" && pwd)"
elif ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  TARGET_DIR="$ROOT"
else
  TARGET_DIR="$(pwd)"
fi

# Two steps (not `basename ... | tr ...` in one): basename's own trailing newline would
# otherwise be fed into tr and get translated into a stray trailing "-" (tr -c matches it
# as a "non-allowed" byte too), leaving every directory-derived id with a spurious dash.
DEFAULT_ID="$(basename "$TARGET_DIR")"
DEFAULT_ID="$(printf '%s' "$DEFAULT_ID" | tr -c 'A-Za-z0-9_-' '-')"
PROJECT_ID="${2:-$DEFAULT_ID}"
LABEL="${3:-$PROJECT_ID}"

[[ "$PROJECT_ID" =~ ^[A-Za-z0-9_-]+$ ]] || die "invalid project-id (only A-Za-z0-9_- allowed): $PROJECT_ID"

echo "Install target : $TARGET_DIR"
echo "Project id     : $PROJECT_ID"
echo "Label          : $LABEL"
echo

# Ask before overwriting an already-generated file. Skips (returns 1) without asking in a
# non-interactive session — pass --force/-y to overwrite there instead.
confirm_overwrite() {
  local path="$1"
  [[ -e "$path" ]] || return 0
  if [[ "$FORCE" == "1" ]]; then
    echo "overwriting (--force): $path"
    return 0
  fi
  if [[ ! -t 0 ]]; then
    echo "skipped (already exists, non-interactive session — pass --force to overwrite): $path" >&2
    return 1
  fi
  local reply
  read -r -p "File already exists: $path — overwrite? [y/N] " reply || reply="n"
  if [[ "$reply" =~ ^[Yy]$ ]]; then
    return 0
  fi
  echo "skipped: $path"
  return 1
}

# 1) Registration + wrapper generation in claude-task-manager (host, no docker).
"$SCRIPT_DIR/engine/projects.sh" add "$PROJECT_ID" "$LABEL"

# 2) Target project's .claude/skills/task-manager/ directory.
SKILL_DIR="$TARGET_DIR/.claude/skills/task-manager"
mkdir -p "$SKILL_DIR"

# task.sh — a copy of the generated wrapper in the target project, so the usual
# ".claude/skills/task-manager/task.sh" relative calling pattern keeps working unchanged.
if confirm_overwrite "$SKILL_DIR/task.sh"; then
  cp "$SCRIPT_DIR/wrappers/$PROJECT_ID.sh" "$SKILL_DIR/task.sh"
  chmod +x "$SKILL_DIR/task.sh"
fi

# SKILL.md — fill in the template.
if confirm_overwrite "$SKILL_DIR/SKILL.md"; then
  sed \
    -e "s#__PROJECT_LABEL__#$LABEL#g" \
    -e "s#__PROJECT_ID__#$PROJECT_ID#g" \
    -e "s#__TASK_SH_PATH__#$SKILL_DIR/task.sh#g" \
    "$SCRIPT_DIR/templates/SKILL.md.tmpl" > "$SKILL_DIR/SKILL.md"
fi

# 3) Generic teammate definitions (.claude/agents/) — NOT project-specific; they read the
# concrete stack/conventions from the target project's own documentation.
#
# Two sources, one roster (engine/roster.sh):
#   - the tiered dev set (be-/fe- x junior/medior/senior) — ONE template (agents/dev.md.tmpl)
#     rendered once per templates/agents-manifest.json entry, with the matching
#     templates/agent-tiers/<tier>.md fragment spliced in at __TIER_SCOPE__. Six near-identical
#     files are generated, but the workflow text exists exactly once.
#   - the standalone agents (ctm-investigator, ctm-playwright-tester) — their own one-off templates.
AGENTS_DIR="$TARGET_DIR/.claude/agents"
mkdir -p "$AGENTS_DIR"
installed_agents=()

# Escape a manifest-derived value for use as a sed `s#...#VALUE#` replacement.
sed_escape() { printf '%s' "$1" | sed -e 's/[&#\]/\\&/g'; }

# render_agent <name> <template> [tier]
# Renders one agent definition. With a <tier>, the tier fragment is spliced in FIRST (raw,
# placeholders intact) so the single substitution pass below covers the fragment's text too.
render_agent() {
  local name="$1" tmpl="$2" tier="${3:-}"
  local out="$AGENTS_DIR/$name.md"
  confirm_overwrite "$out" || return 0

  local body_file block_file agent_tools
  body_file="$(mktemp)"
  if [[ -n "$tier" ]]; then
    local frag="$SCRIPT_DIR/templates/agent-tiers/$tier.md"
    [[ -f "$frag" ]] || die "missing tier fragment: $frag"
    sed -e "/^__TIER_SCOPE__\$/r $frag" -e "/^__TIER_SCOPE__\$/d" "$tmpl" > "$body_file"
  else
    cat "$tmpl" > "$body_file"
  fi

  agent_tools="$(resolve_agent_tools "$name" "$TARGET_DIR")"
  block_file="$(agent_block_tempfile "$name" "$TARGET_DIR")"

  # Manifest attributes — all empty for a standalone agent, whose template has no such
  # placeholders, so the substitutions are simply no-ops there.
  local area model color
  area="$(roster_agent_field "$name" area)"
  model="$(roster_agent_field "$name" model)"
  color="$(roster_agent_field "$name" color)"

  sed \
    -e "s#__PROJECT_LABEL__#$(sed_escape "$LABEL")#g" \
    -e "s#__PROJECT_ID__#$(sed_escape "$PROJECT_ID")#g" \
    -e "s#__TASK_SH_PATH__#$SKILL_DIR/task.sh#g" \
    -e "s#__AGENT_TOOLS__#$(sed_escape "$agent_tools")#g" \
    -e "s#__PROJECT_CLAUDE_DIR__#$TARGET_DIR/.claude#g" \
    -e "s#__AGENT_NAME__#$name#g" \
    -e "s#__TIER__#$tier#g" \
    -e "s#__MODEL__#$model#g" \
    -e "s#__COLOR__#$color#g" \
    -e "s#__AREA_LABEL__#$(sed_escape "$(roster_area_field "$area" label)")#g" \
    -e "s#__AREA_WORD__#$(sed_escape "$(roster_area_field "$area" word)")#g" \
    -e "s#__AREA_TAG__#$(sed_escape "$(roster_area_field "$area" tag)")#g" \
    -e "s#__AREA_JUNIOR__#$(sed_escape "$(roster_area_field "$area" junior)")#g" \
    -e "s#__AREA_MEDIOR__#$(sed_escape "$(roster_area_field "$area" medior)")#g" \
    -e "s#__AREA_SENIOR__#$(sed_escape "$(roster_area_field "$area" senior)")#g" \
    -e "s#__PEER_MEDIOR__#$(sed_escape "$(roster_area_field "$area" peerMedior)")#g" \
    -e "s#__AREA_EXAMPLE_FILES__#$(sed_escape "$(roster_area_field "$area" exampleFiles)")#g" \
    -e "s#__AREA_WORK_NOTE__#$(sed_escape "$(roster_area_field "$area" workNote)")#g" \
    -e "s#__AREA_DOMAIN_NOTE__#$(sed_escape "$(roster_area_field "$area" domainNote)")#g" \
    "$body_file" | sed -e "/^__AGENT_BLOCK__\$/r $block_file" -e "/^__AGENT_BLOCK__\$/d" > "$out"

  rm -f "$block_file" "$body_file"
  installed_agents+=("$name")
}

DEV_TMPL="$SCRIPT_DIR/templates/agents/dev.md.tmpl"
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  render_agent "$name" "$DEV_TMPL" "$(roster_agent_field "$name" tier)"
done < <(roster_manifest_names)

while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  render_agent "$name" "$SCRIPT_DIR/templates/agents/$name.md.tmpl"
done < <(roster_standalone_names)

# 4) Hooks (.claude/hooks/) — PreToolUse auto-allow + PostToolUse inbox notification for
# task.sh calls, registered additively in .claude/settings.json.
HOOKS_DIR="$TARGET_DIR/.claude/hooks"
mkdir -p "$HOOKS_DIR"
installed_hooks=()
for tmpl in "$SCRIPT_DIR"/templates/hooks/*.sh.tmpl; do
  [[ -e "$tmpl" ]] || continue
  name="$(basename "$tmpl" .tmpl)"
  out="$HOOKS_DIR/$name"
  if confirm_overwrite "$out"; then
    sed -e "s#__TARGET_DIR__#$TARGET_DIR#g" "$tmpl" > "$out"
    chmod +x "$out"
    installed_hooks+=("$name")
  fi
done

SETTINGS_JSON_FILE="$TARGET_DIR/.claude/settings.json"
[[ -f "$SETTINGS_JSON_FILE" ]] || echo '{"hooks":{}}' > "$SETTINGS_JSON_FILE"
PRE_CMD="bash \"\$CLAUDE_PROJECT_DIR/.claude/hooks/allow-task-sh.sh\""
POST_CMD="bash \"\$CLAUDE_PROJECT_DIR/.claude/hooks/notify-inbox.sh\""
tmp="$(mktemp)"
jq --arg pre "$PRE_CMD" --arg post "$POST_CMD" '
  .hooks.PreToolUse //= [] |
  .hooks.PreToolUse |= (
    if any(.[]; (.hooks // [])[]?.command == $pre) then .
    else . + [{matcher:"Bash", hooks:[{type:"command", command:$pre, timeout:10}]}] end
  ) |
  .hooks.PostToolUse //= [] |
  .hooks.PostToolUse |= (
    if any(.[]; (.hooks // [])[]?.command == $post) then .
    else . + [{matcher:"Bash", hooks:[{type:"command", command:$post, timeout:10}]}] end
  )
' "$SETTINGS_JSON_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_JSON_FILE"

# 5) Extend .claude/settings.local.json's Bash allowlist (keeps the existing file, only
# appends — never overwrites other permissions already present).
SETTINGS_FILE="$TARGET_DIR/.claude/settings.local.json"
mkdir -p "$TARGET_DIR/.claude"
ENTRIES_JSON=$(jq -n --arg abs "$SKILL_DIR/task.sh" '
  [
    ("Bash(" + $abs + ":*)"),
    "Bash(.claude/skills/task-manager/task.sh:*)",
    "Bash(bash .claude/skills/task-manager/task.sh:*)",
    "Bash(./task.sh:*)",
    "Bash(bash ./task.sh:*)"
  ]')
if [[ -f "$SETTINGS_FILE" ]]; then
  tmp="$(mktemp)"
  jq --argjson entries "$ENTRIES_JSON" '
    .permissions //= {} | .permissions.allow //= [] |
    .permissions.allow = ((.permissions.allow + $entries) | unique)
  ' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
else
  jq -n --argjson entries "$ENTRIES_JSON" '{permissions:{allow:$entries}}' > "$SETTINGS_FILE"
fi

# 6) Register the global `ctm` command (if not already on PATH) — so "ctm init"/"ctm
# list"/"ctm up" are reachable from any project without remembering the absolute
# install.sh path.
ensure_ctm_command() {
  if command -v ctm >/dev/null 2>&1; then
    return 0
  fi
  local target="$SCRIPT_DIR/bin/ctm"
  local dir candidates=("/usr/local/bin" "$HOME/.local/bin")
  for dir in "${candidates[@]}"; do
    if [[ -d "$dir" && -w "$dir" ]]; then
      ln -sf "$target" "$dir/ctm"
      echo "ctm command registered: $dir/ctm -> $target"
      [[ ":$PATH:" == *":$dir:"* ]] || echo "  NOTE: $dir is not on PATH — add it: export PATH=\"$dir:\$PATH\""
      return 0
    fi
  done
  mkdir -p "$HOME/.local/bin"
  ln -sf "$target" "$HOME/.local/bin/ctm"
  echo "ctm command registered: $HOME/.local/bin/ctm -> $target"
  [[ ":$PATH:" == *":$HOME/.local/bin:"* ]] || echo "  NOTE: $HOME/.local/bin is not on PATH — add it: export PATH=\"$HOME/.local/bin:\$PATH\""
}
ensure_ctm_command

echo
echo "Done."
echo "  task.sh   : $SKILL_DIR/task.sh   (host-bash, docker NOT required)"
echo "  SKILL.md  : $SKILL_DIR/SKILL.md"
echo "  agents    : ${installed_agents[*]:-(none written)} ($AGENTS_DIR)"
echo "  hooks     : ${installed_hooks[*]:-(none written)} ($HOOKS_DIR) — registered in $SETTINGS_JSON_FILE"
echo "  allowlist : $SETTINGS_FILE extended"
echo "  Board     : ctm up   →  http://localhost:3333/"
echo "              (pick \"$LABEL\" in the Source selector)"

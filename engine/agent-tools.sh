#!/usr/bin/env bash
#
# agent-tools.sh — resolves the `tools:` allow-list baked into a teammate agent's frontmatter
# at `ctm init` time. Single source of truth, sourced by install.sh (base ctm-* set) and
# bin/add-agent.sh (custom tm-* agents), and exposed via `ctm agent tools`.
#
# Config: claude-task-manager/templates/agent-tools.json  ("default" + per-name "agents" map).
# A project may override per-agent by placing its own .claude/agent-tools.json in the target
# repo. Precedence for a given agent name (first match wins):
#   1. project override:  .agents[<name>]
#   2. repo config:       .agents[<name>]
#   3. project override:  .default
#   4. repo config:       .default
#   5. built-in fallback  (so a deleted/broken config never blocks an install)
#
# Each config value is either a comma-separated string or a JSON array of tool names; both
# normalize to the "A, B, C" string Claude Code expects in the `tools:` frontmatter field.

# Resolve the claude-task-manager root from this script's location (engine/ -> root).
_AT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_TOOLS_CONFIG="${AGENT_TOOLS_CONFIG:-$_AT_ROOT/templates/agent-tools.json}"

# Built-in fallback, used only if no config file yields a value.
AGENT_TOOLS_FALLBACK="Read, Write, Edit, Bash, Glob, Grep, SendMessage, mcp__ide__getDiagnostics"

# resolve_agent_tools <agent-name> [target-project-dir]
# Prints the effective comma-separated tools string for <agent-name>.
resolve_agent_tools() {
  local name="$1" target="${2:-}"
  local repo="$AGENT_TOOLS_CONFIG"
  local project=""
  [[ -n "$target" && -f "$target/.claude/agent-tools.json" ]] && project="$target/.claude/agent-tools.json"

  # jq program: normalize an array-or-string to "A, B, C"; try each source in precedence order.
  local out
  out="$(jq -r -n \
      --arg name "$name" \
      --slurpfile repo <(cat "$repo" 2>/dev/null || echo '{}') \
      --slurpfile proj <(cat "${project:-/dev/null}" 2>/dev/null || echo '{}') '
    def norm($v): if ($v|type)=="array" then ($v|join(", ")) else ($v // empty) end;
    ($repo[0] // {}) as $r
    | ($proj[0] // {}) as $p
    | ( norm($p.agents[$name]) // norm($r.agents[$name]) // norm($p.default) // norm($r.default) )
    // empty
  ' 2>/dev/null)"

  if [[ -n "$out" ]]; then
    printf '%s\n' "$out"
  else
    printf '%s\n' "$AGENT_TOOLS_FALLBACK"
  fi
}

# Print the effective mapping for all base ctm-* templates (+ one name if given). Used by
# `ctm agent tools [name]`.
print_agent_tools() {
  local target="${1:-}" one="${2:-}"
  if [[ -n "$one" ]]; then
    printf '%s\t%s\n' "$one" "$(resolve_agent_tools "$one" "$target")"
    return 0
  fi
  local tmpl name
  for tmpl in "$_AT_ROOT"/templates/agents/*.md.tmpl; do
    [[ -e "$tmpl" ]] || continue
    name="$(basename "$tmpl" .md.tmpl)"
    printf '%s\t%s\n' "$name" "$(resolve_agent_tools "$name" "$target")"
  done
  printf '%s\t%s\n' "(default)" "$(resolve_agent_tools "__nonexistent__" "$target")"
}

# Standalone use: agent-tools.sh resolve <name> [target] | agent-tools.sh list [target] [name]
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    resolve) shift; resolve_agent_tools "$@" ;;
    list|"") shift || true; print_agent_tools "$@" ;;
    *) echo "usage: agent-tools.sh {resolve <name> [target] | list [target] [name]}" >&2; exit 1 ;;
  esac
fi

#!/usr/bin/env bash
#
# agent-tools.sh — resolves the `tools:` allow-list baked into a teammate agent's frontmatter
# at `ctm init` time, and manages the project-level override. Single source of truth, sourced
# by install.sh (the generated roster) and bin/add-agent.sh (custom tm-* agents), and exposed
# via `ctm agent tools`.
#
# Config: claude-task-manager/templates/agent-tools.json  ("default" + per-name "agents" map).
# A project overrides it with its own .claude/agent-tools.json in the target repo.
#
# Precedence for a given agent name (first match wins):
#   1. project override:  .agents[<name>]     — this one agent, in this project
#   2. project override:  .default            — EVERY agent in this project
#   3. repo config:       .agents[<name>]     — this one agent, everywhere
#   4. repo config:       .default            — the baseline
#   5. built-in fallback  (so a deleted/broken config never blocks an install)
#
# Note the ordering of 2 and 3: the PROJECT config wins over the repo config *entirely*, and
# within each scope the specific beats the default. This is what makes "configure every agent
# at once, from the project" actually work — with the repo's per-agent entries ranked above
# the project's default (as they once were), a project-wide setting was silently ignored for
# any agent the repo happened to name, which is most of them.
#
# The flip side: a project-wide `.default` also overrides the repo's per-agent entries, e.g.
# ctm-playwright-tester's MCP tools. `ctm agent tools set <list>` warns when that happens.
#
# Each config value is either a comma-separated string or a JSON array of tool names; both
# normalize to the "A, B, C" string Claude Code expects in the `tools:` frontmatter field.

# Resolve the claude-task-manager root from this script's location (engine/ -> root).
_AT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_AT_ROOT="$(cd "$_AT_ROOT/.." && pwd)"
AGENT_TOOLS_CONFIG="${AGENT_TOOLS_CONFIG:-$_AT_ROOT/templates/agent-tools.json}"

# shellcheck source=engine/roster.sh
source "$_AT_ROOT/engine/roster.sh"

# Built-in fallback, used only if no config file yields a value.
AGENT_TOOLS_FALLBACK="Read, Write, Edit, Bash, Glob, Grep, SendMessage, mcp__ide__getDiagnostics"

# The core no configuration may remove. task.sh is invoked as a bare command, so an agent
# without Bash cannot claim, note or review — it would be generated fine and then be unable to
# participate in the task manager at all. Read backs every task.sh workflow (the task's files,
# the checklist); SendMessage is how a teammate reaches main when its queue empties or it is
# blocked. These are unioned into every resolved list, and `ctm agent tools rm` refuses them.
MANDATORY_TOOLS="Bash, Read, SendMessage"

# _tools_normalize — read a comma/newline-separated tool list on stdin, print it as a
# de-duplicated, trimmed, order-preserving "A, B, C" string.
_tools_normalize() {
  tr ',' '\n' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | awk 'NF && !seen[$0]++' \
    | paste -sd ',' - \
    | sed -e 's/,/, /g'
}

# _project_tools_file <target-project-dir>
_project_tools_file() { printf '%s\n' "$1/.claude/agent-tools.json"; }

# resolve_agent_tools <agent-name> [target-project-dir]
# Prints the effective comma-separated tools string for <agent-name>, mandatory core included.
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
    | ( norm($p.agents[$name]) // norm($p.default) // norm($r.agents[$name]) // norm($r.default) )
    // empty
  ' 2>/dev/null)"

  [[ -n "$out" ]] || out="$AGENT_TOOLS_FALLBACK"

  # The mandatory core goes FIRST so it is obvious in the generated frontmatter that it is not
  # part of what was configured.
  printf '%s,%s\n' "$MANDATORY_TOOLS" "$out" | _tools_normalize
}

# print_agent_tools [target] [name]
# The effective mapping for the whole roster (+ the "(default)" fallback), or for one name.
# The roster comes from roster.sh — NOT from a templates/agents/*.md.tmpl glob, which would
# miss every manifest-generated tier agent and report a phantom "dev".
print_agent_tools() {
  local target="${1:-}" one="${2:-}"
  if [[ -n "$one" ]]; then
    printf '%s\t%s\n' "$one" "$(resolve_agent_tools "$one" "$target")"
    return 0
  fi
  local name
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    printf '%s\t%s\n' "$name" "$(resolve_agent_tools "$name" "$target")"
  done < <(roster_agent_names)
  printf '%s\t%s\n' "(default)" "$(resolve_agent_tools "__nonexistent__" "$target")"
}

# _warn_default_shadows — called when a project-wide default is written: list the agents whose
# repo-level per-agent list it now shadows, so nobody silently loses e.g. the Playwright MCP.
_warn_default_shadows() {
  local target="$1"
  local shadowed
  shadowed="$(jq -r '.agents // {} | keys[]?' "$AGENT_TOOLS_CONFIG" 2>/dev/null || true)"
  [[ -n "$shadowed" ]] || return 0
  local n proj_has
  proj_has="$(jq -r '.agents // {} | keys[]?' "$(_project_tools_file "$target")" 2>/dev/null || true)"
  local warn=()
  for n in $shadowed; do
    grep -qx "$n" <<<"$proj_has" && continue   # a per-agent project entry still wins
    warn+=("$n")
  done
  [[ ${#warn[@]} -gt 0 ]] || return 0
  echo "warning: this project-wide list now also overrides the built-in per-agent tools of: ${warn[*]}" >&2
  echo "         (e.g. ctm-playwright-tester's MCP tools). Give them their own list to keep it:" >&2
  echo "         ctm agent tools set <agent> <list>" >&2
}

# _write_project_tools <target> <key> <value>   (key: "default" or an agent name)
_write_project_tools() {
  local target="$1" key="$2" value="$3"
  local f; f="$(_project_tools_file "$target")"
  mkdir -p "$(dirname "$f")"
  [[ -f "$f" ]] || echo '{}' > "$f"
  local tmp; tmp="$(mktemp)"
  if [[ "$key" == "default" ]]; then
    jq --arg v "$value" '.default = $v' "$f" > "$tmp"
  else
    jq --arg k "$key" --arg v "$value" '.agents = ((.agents // {}) | .[$k] = $v)' "$f" > "$tmp"
  fi
  mv "$tmp" "$f"
  echo "saved: $f"
  echo "  $key -> $value"
  [[ "$key" == "default" ]] && _warn_default_shadows "$target"
  return 0
}

# set_agent_tools <target> <key> <list>
set_agent_tools() {
  local target="$1" key="$2" list="$3"
  local norm; norm="$(printf '%s' "$list" | _tools_normalize)"
  [[ -n "$norm" ]] || { echo "error: empty tool list" >&2; return 1; }
  _write_project_tools "$target" "$key" "$norm"
}

# add_agent_tools <target> <key> <list> — union onto the CURRENT effective list.
add_agent_tools() {
  local target="$1" key="$2" list="$3"
  local base
  if [[ "$key" == "default" ]]; then
    base="$(resolve_agent_tools "__nonexistent__" "$target")"
  else
    base="$(resolve_agent_tools "$key" "$target")"
  fi
  local norm; norm="$(printf '%s,%s' "$base" "$list" | _tools_normalize)"
  _write_project_tools "$target" "$key" "$norm"
}

# rm_agent_tools <target> <key> <list> — remove from the CURRENT effective list.
# Refuses the mandatory core: without it the agent cannot run task.sh at all.
rm_agent_tools() {
  local target="$1" key="$2" list="$3"
  local t m
  for t in $(printf '%s' "$list" | tr ',' ' '); do
    for m in $(printf '%s' "$MANDATORY_TOOLS" | tr ',' ' '); do
      if [[ "$t" == "$m" ]]; then
        echo "error: \"$t\" is a mandatory tool and cannot be removed — without it the agent cannot run task.sh (mandatory core: $MANDATORY_TOOLS)" >&2
        return 1
      fi
    done
  done

  local base
  if [[ "$key" == "default" ]]; then
    base="$(resolve_agent_tools "__nonexistent__" "$target")"
  else
    base="$(resolve_agent_tools "$key" "$target")"
  fi

  local keep=() b drop
  while IFS= read -r b; do
    [[ -n "$b" ]] || continue
    drop=0
    for t in $(printf '%s' "$list" | tr ',' ' '); do
      [[ "$b" == "$t" ]] && drop=1
    done
    [[ $drop == 1 ]] || keep+=("$b")
  done < <(printf '%s' "$base" | tr ',' '\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

  local norm; norm="$(printf '%s\n' "${keep[@]}" | _tools_normalize)"
  _write_project_tools "$target" "$key" "$norm"
}

# unset_agent_tools <target> <key> — drop the project override, falling back to the repo config.
unset_agent_tools() {
  local target="$1" key="$2"
  local f; f="$(_project_tools_file "$target")"
  [[ -f "$f" ]] || { echo "no project override to remove: $f" >&2; return 1; }
  local has
  if [[ "$key" == "default" ]]; then
    has="$(jq -r 'has("default")' "$f" 2>/dev/null)"
  else
    has="$(jq -r --arg k "$key" '(.agents // {}) | has($k)' "$f" 2>/dev/null)"
  fi
  [[ "$has" == "true" ]] || { echo "no project override to remove for: $key" >&2; return 1; }
  local tmp; tmp="$(mktemp)"
  if [[ "$key" == "default" ]]; then
    jq 'del(.default)' "$f" > "$tmp"
  else
    jq --arg k "$key" '.agents |= del(.[$k])' "$f" > "$tmp"
  fi
  mv "$tmp" "$f"
  echo "removed project override: $key ($f)"
  echo "  now effective: $(resolve_agent_tools "$key" "$target")"
}

# Standalone use: agent-tools.sh resolve <name> [target] | agent-tools.sh list [target] [name]
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    resolve) shift; resolve_agent_tools "$@" ;;
    list|"") shift || true; print_agent_tools "$@" ;;
    *) echo "usage: agent-tools.sh {resolve <name> [target] | list [target] [name]}" >&2; exit 1 ;;
  esac
fi

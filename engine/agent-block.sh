#!/usr/bin/env bash
#
# agent-block.sh — resolves the optional free-text "project block" appended to a teammate
# agent's body at `ctm init` time. Mirrors engine/agent-tools.sh's precedence model, but for
# a chunk of Markdown content instead of a comma-separated tools allow-list.
#
# Storage:
#   claude-task-manager/templates/agent-blocks/{default.md,<name>.md}   (repo config, ships
#     empty — add files there to bake a block into every claude-task-manager install)
#   <target>/.claude/agent-blocks/{default.md,<name>.md}                (project override,
#     set with: ctm agent block set [name] <file>)
#
# Precedence for a given agent name (first EXISTING + NON-EMPTY file wins):
#   1. project override: .claude/agent-blocks/<name>.md
#   2. repo config:      templates/agent-blocks/<name>.md
#   3. project override: .claude/agent-blocks/default.md
#   4. repo config:      templates/agent-blocks/default.md
#   5. (none) — no block section is added to the generated agent file
#
# Unlike agent-tools.sh, there is no hardcoded fallback text: a block is genuinely optional,
# an empty result just means the __AGENT_BLOCK__ placeholder is dropped with nothing added.

_AB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_BLOCK_REPO_DIR="${AGENT_BLOCK_REPO_DIR:-$_AB_ROOT/templates/agent-blocks}"

# shellcheck source=engine/roster.sh
source "$_AB_ROOT/engine/roster.sh"

# resolve_agent_block <agent-name> [target-project-dir]
# Prints the effective block content for <agent-name> (empty output if none configured).
resolve_agent_block() {
  local name="$1" target="${2:-}"
  local candidates=()
  [[ -n "$target" ]] && candidates+=("$target/.claude/agent-blocks/$name.md")
  candidates+=("$AGENT_BLOCK_REPO_DIR/$name.md")
  [[ -n "$target" ]] && candidates+=("$target/.claude/agent-blocks/default.md")
  candidates+=("$AGENT_BLOCK_REPO_DIR/default.md")

  local f
  for f in "${candidates[@]}"; do
    if [[ -s "$f" ]]; then
      cat "$f"
      return 0
    fi
  done
  return 0
}

# agent_block_tempfile <agent-name> [target-project-dir]
# Prints the path to a fresh temp file ready for `sed -e "/^__AGENT_BLOCK__\$/r <file>"`:
# empty if no block is configured, or a leading blank line + the resolved content otherwise.
# The caller is responsible for removing the returned path when done with it.
agent_block_tempfile() {
  local name="$1" target="${2:-}"
  local content tmp
  content="$(resolve_agent_block "$name" "$target")"
  tmp="$(mktemp)"
  if [[ -n "$content" ]]; then
    { echo; printf '%s\n' "$content"; } > "$tmp"
  fi
  printf '%s\n' "$tmp"
}

# set_agent_block <target-project-dir> <name> <source-file>
# Copies <source-file> into <target>/.claude/agent-blocks/<name>.md — "default" for the
# fallback block, or an agent name (e.g. "ctm-be-medior", "tm-foo") for a per-agent override.
set_agent_block() {
  local target="$1" name="$2" src="$3"
  [[ -f "$src" ]] || { echo "error: no such file: $src" >&2; return 1; }
  local dir="$target/.claude/agent-blocks"
  mkdir -p "$dir"
  cp "$src" "$dir/$name.md"
  echo "saved: $dir/$name.md"
}

# unset_agent_block <target-project-dir> <name>
unset_agent_block() {
  local target="$1" name="$2"
  local f="$target/.claude/agent-blocks/$name.md"
  if [[ -e "$f" ]]; then
    rm "$f"
    echo "removed: $f"
  else
    echo "no override to remove: $f" >&2
    return 1
  fi
}

# Print the effective block for every agent in the roster (+ one name, if given) plus the
# "(default)" fallback. Used by `ctm agent block show [name]`.
#
# The names come from roster.sh — NOT from a templates/agents/*.md.tmpl glob, which would miss
# every manifest-generated tier agent and report a phantom "dev".
print_agent_block() {
  local target="${1:-}" one="${2:-}"
  local names=()
  if [[ -n "$one" ]]; then
    names=("$one")
  else
    local n
    while IFS= read -r n; do
      [[ -n "$n" ]] && names+=("$n")
    done < <(roster_agent_names)
    names+=("(default)")
  fi

  local n content lookup
  for n in "${names[@]}"; do
    lookup="$n"
    [[ "$n" == "(default)" ]] && lookup="__nonexistent__"
    content="$(resolve_agent_block "$lookup" "$target")"
    echo "=== $n ==="
    if [[ -n "$content" ]]; then
      printf '%s\n' "$content"
    else
      echo "(none)"
    fi
    echo
  done
}

# Standalone use: agent-block.sh resolve <name> [target] | agent-block.sh list [target] [name]
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    resolve) shift; resolve_agent_block "$@" ;;
    list|"") shift || true; print_agent_block "$@" ;;
    *) echo "usage: agent-block.sh {resolve <name> [target] | list [target] [name]}" >&2; exit 1 ;;
  esac
fi

#!/usr/bin/env bash
#
# check-update.sh — sourced (not executed) by the other scripts to print a yellow notice
# when origin's default branch has commits the local checkout doesn't have yet.
#
# Deliberately NOT sourced by engine/task.sh: that script is called on every single task
# mutation (often many times per agent session), and a network round-trip on every call
# would add real, repeated latency to the hot path. It IS sourced by the admin-facing
# entry points (ctm, install.sh, add-agent.sh, projects.sh), which run far less often.
#
# IMPORTANT: this is sourced into callers that run under `set -e` — every command that
# could plausibly fail (offline, no origin/HEAD set, first commit not yet pushed, etc.)
# is guarded with `|| true` so a failure here can NEVER abort the calling script.
#
# Usage (from a script that has already resolved ROOT_DIR to the repo root):
#   source "$ROOT_DIR/engine/check-update.sh"
#   check_for_updates "$ROOT_DIR"
#
# Silent on: no git, not a git checkout, no "origin" remote, offline/unreachable remote,
# or local already up to date. Only prints when the remote genuinely has something new.

check_for_updates() {
  local root="${1:-.}"
  command -v git >/dev/null 2>&1 || return 0
  [[ -d "$root/.git" ]] || return 0
  git -C "$root" remote get-url origin >/dev/null 2>&1 || return 0

  # origin/HEAD may not be set locally (git push -u doesn't set it the way git clone does)
  # — fall back to "main" when it's missing, rather than letting the lookup fail.
  local branch
  branch="$(git -C "$root" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  branch="${branch#origin/}"
  branch="${branch:-main}"

  # Lightweight ref lookup (no object transfer) with a short low-speed timeout, so a slow
  # or unreachable remote never noticeably delays the command that triggered this check.
  local remote_sha local_sha
  remote_sha="$( (git -C "$root" -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=2 \
    ls-remote origin "refs/heads/$branch" 2>/dev/null || true) | cut -f1)"
  [[ -n "$remote_sha" ]] || return 0
  local_sha="$(git -C "$root" rev-parse HEAD 2>/dev/null || true)"
  [[ -n "$local_sha" ]] || return 0
  [[ "$remote_sha" == "$local_sha" ]] && return 0

  printf '\033[33m[claude-task-manager] A newer version is available on origin/%s — update with: git -C %s pull\033[0m\n' \
    "$branch" "$root" >&2
  return 0
}

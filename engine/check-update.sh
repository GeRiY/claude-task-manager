#!/usr/bin/env bash
#
# check-update.sh — sourced (not executed) by the other scripts to print a yellow notice
# when origin's default branch has commits the local checkout doesn't have yet.
#
# Sourced by the admin-facing entry points (ctm, install.sh, add-agent.sh, projects.sh),
# which run far less often, via check_for_updates() (prints synchronously).
#
# engine/task.sh is the hot path — it is called on every task mutation (often many times per
# agent session), so it must NOT do a network round-trip inline. Instead it sources this file
# ONLY inside an occasional, detached background subshell and calls refresh_update_cache()
# (below), which records the result in a small flag file; task.sh then reads that file cheaply
# (no network) to print a throttled notice, so the coding agents actually learn a newer
# package version exists.
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

# Core detection (shared): is origin's default branch ahead of the local HEAD? On success
# (a genuinely newer remote commit) it prints the branch name to stdout and returns 0; in
# EVERY other case (no git, not a checkout, no origin, offline, up to date) it prints nothing
# and returns non-zero. Never aborts the caller — each fallible command is guarded.
remote_is_ahead() {
  local root="${1:-.}"
  command -v git >/dev/null 2>&1 || return 1
  [[ -d "$root/.git" ]] || return 1
  git -C "$root" remote get-url origin >/dev/null 2>&1 || return 1

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
  [[ -n "$remote_sha" ]] || return 1
  local_sha="$(git -C "$root" rev-parse HEAD 2>/dev/null || true)"
  [[ -n "$local_sha" ]] || return 1
  [[ "$remote_sha" == "$local_sha" ]] && return 1

  printf '%s' "$branch"
  return 0
}

check_for_updates() {
  local root="${1:-.}" branch
  branch="$(remote_is_ahead "$root")" || return 0
  printf '\033[33m[claude-task-manager] A newer version is available on origin/%s — update with: git -C %s pull\033[0m\n' \
    "$branch" "$root" >&2
  return 0
}

# refresh_update_cache <root> <flag-file>: run the (networked) check ONCE and record the
# result in <flag-file> so hot-path callers (engine/task.sh) can decide whether to print a
# notice WITHOUT doing any network I/O themselves. Writes the ahead branch name into the file
# when an update is available; otherwise removes the file. Designed to be called from a
# detached background subshell so it never blocks the foreground command.
refresh_update_cache() {
  local root="${1:-.}" flag="${2:-}"
  [[ -n "$flag" ]] || return 0
  local branch
  if branch="$(remote_is_ahead "$root")"; then
    printf '%s\n' "$branch" > "$flag" 2>/dev/null || true
  else
    rm -f "$flag" 2>/dev/null || true
  fi
  return 0
}

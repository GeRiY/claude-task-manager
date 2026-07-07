#!/usr/bin/env bash
#
# install.sh — a claude-task-manager "kliensének" telepítése egy tetszőleges projektbe.
#
# Bármely projektben futtatva regisztrálja az adott projektet a claude-task-managerben
# (adat-könyvtár + wrapper task.sh generálása az engine/projects.sh-val), majd létrehozza
# a célprojektben a .claude/skills/task-manager/ mappát:
#   - task.sh   — a generált wrapper MÁSOLATA (a projekt saját, TM_DIR-jét beégetve hordozó
#                 task.sh-ja; NEM kell hozzá docker, sima host-bash script)
#   - SKILL.md  — a Claude Code skill-dokumentáció (a projekt saját "SKILL.md" sablonjából)
# és felveszi a célprojekt .claude/settings.local.json Bash-allowlistjébe a task.sh hívást,
# hogy engedélykérés nélkül fusson.
#
# A boardot (index.html, port 3333) NEM kell telepíteni a célprojektbe — az a
# claude-task-manager saját docker compose-ával fut, minden telepített projekt közösen
# használja (a Forrás-választóban válasszák ki a saját projektjüket).
#
# Használat:
#   /Users/mgeri1993/code/projects/claude-task-manager/install.sh [target-dir] [project-id] [label]
#
# target-dir  – alapértelmezetten a jelenlegi könyvtár git-gyökere (vagy maga a cwd, ha nincs git)
# project-id  – alapértelmezetten a target-dir mappa neve (csak A-Za-z0-9_- karakterek)
# label       – alapértelmezetten a project-id

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "hiba: $*" >&2; exit 1; }

command -v jq >/dev/null 2>&1 || die "jq nincs telepítve (kell a scripthez)."

TARGET_ARG="${1:-}"
if [[ -n "$TARGET_ARG" ]]; then
  TARGET_DIR="$(cd "$TARGET_ARG" && pwd)"
elif ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  TARGET_DIR="$ROOT"
else
  TARGET_DIR="$(pwd)"
fi

DEFAULT_ID="$(basename "$TARGET_DIR" | tr -c 'A-Za-z0-9_-' '-')"
PROJECT_ID="${2:-$DEFAULT_ID}"
LABEL="${3:-$PROJECT_ID}"

[[ "$PROJECT_ID" =~ ^[A-Za-z0-9_-]+$ ]] || die "érvénytelen project-id (csak A-Za-z0-9_- engedett): $PROJECT_ID"

echo "Telepítés célja : $TARGET_DIR"
echo "Projekt id      : $PROJECT_ID"
echo "Címke           : $LABEL"
echo

# 1) Regisztráció + wrapper generálás a claude-task-managerben (host, docker nélkül).
"$SCRIPT_DIR/engine/projects.sh" add "$PROJECT_ID" "$LABEL"

# 2) Célprojekt .claude/skills/task-manager/ mappa.
SKILL_DIR="$TARGET_DIR/.claude/skills/task-manager"
mkdir -p "$SKILL_DIR"

# task.sh — a generált wrapper másolata a célprojektben, hogy a megszokott
# ".claude/skills/task-manager/task.sh" relatív hívási minta változatlanul működjön.
cp "$SCRIPT_DIR/wrappers/$PROJECT_ID.sh" "$SKILL_DIR/task.sh"
chmod +x "$SKILL_DIR/task.sh"

# SKILL.md — sablon kitöltése.
sed \
  -e "s#__PROJECT_LABEL__#$LABEL#g" \
  -e "s#__PROJECT_ID__#$PROJECT_ID#g" \
  -e "s#__TASK_SH_PATH__#$SKILL_DIR/task.sh#g" \
  "$SCRIPT_DIR/templates/SKILL.md.tmpl" > "$SKILL_DIR/SKILL.md"

# 3) Generikus ctm-* teammate-definíciók (.claude/agents/) — NEM projekt-specifikusak,
# a konkrét stack/konvenciókat a saját projekt dokumentációjából olvassák ki.
AGENTS_DIR="$TARGET_DIR/.claude/agents"
mkdir -p "$AGENTS_DIR"
installed_agents=()
for tmpl in "$SCRIPT_DIR"/templates/agents/*.md.tmpl; do
  [[ -e "$tmpl" ]] || continue
  name="$(basename "$tmpl" .md.tmpl)"
  sed \
    -e "s#__PROJECT_LABEL__#$LABEL#g" \
    -e "s#__PROJECT_ID__#$PROJECT_ID#g" \
    -e "s#__TASK_SH_PATH__#$SKILL_DIR/task.sh#g" \
    "$tmpl" > "$AGENTS_DIR/$name.md"
  installed_agents+=("$name")
done

# 4) .claude/settings.local.json Bash-allowlist bővítése (a meglévő fájlt megőrizve, csak
# hozzáfűzve — nem írjuk felül, ha már léteznek benne más engedélyek).
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

# 5) A globális `ctm` parancs regisztrálása (ha még nincs a PATH-on) — hogy bármely
# projektből elérhető legyen a "ctm init"/"ctm list"/"ctm up" anélkül, hogy az abszolút
# install.sh útvonalat kellene megjegyezni.
ensure_ctm_command() {
  if command -v ctm >/dev/null 2>&1; then
    return 0
  fi
  local target="$SCRIPT_DIR/bin/ctm"
  local dir candidates=("/usr/local/bin" "$HOME/.local/bin")
  for dir in "${candidates[@]}"; do
    if [[ -d "$dir" && -w "$dir" ]]; then
      ln -sf "$target" "$dir/ctm"
      echo "ctm parancs regisztrálva: $dir/ctm -> $target"
      [[ ":$PATH:" == *":$dir:"* ]] || echo "  FIGYELEM: $dir nincs a PATH-ban — add hozzá: export PATH=\"$dir:\$PATH\""
      return 0
    fi
  done
  mkdir -p "$HOME/.local/bin"
  ln -sf "$target" "$HOME/.local/bin/ctm"
  echo "ctm parancs regisztrálva: $HOME/.local/bin/ctm -> $target"
  [[ ":$PATH:" == *":$HOME/.local/bin:"* ]] || echo "  FIGYELEM: $HOME/.local/bin nincs a PATH-ban — add hozzá: export PATH=\"$HOME/.local/bin:\$PATH\""
}
ensure_ctm_command

echo
echo "Kész."
echo "  task.sh   : $SKILL_DIR/task.sh   (host-bash, docker NEM kell hozzá)"
echo "  SKILL.md  : $SKILL_DIR/SKILL.md"
echo "  agentek   : ${installed_agents[*]} ($AGENTS_DIR)"
echo "  allowlist : $SETTINGS_FILE bővítve"
echo "  Board     : ctm up   →  http://localhost:3333/"
echo "              (válaszd ki a Forrás-választóban: \"$LABEL\")"

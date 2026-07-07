#!/usr/bin/env bash
#
# add-agent.sh — egyedi (custom) teammate agent-definíció létrehozása egy MÁR telepített
# (ctm init-elt) projektben.
#
# Névkonvenció: a claude-task-manager alap, install.sh által telepített készlete mindig
# "ctm-*" (ctm-frontend-developer / ctm-backend-developer / ctm-code-investigator) —
# ezeket "ctm init" generálja/frissíti. Az EZZEL a scripttel létrehozott, felhasználó által
# igény szerint bővített egyedi agentek neve mindig "tm-*" — így egy pillantásra
# megkülönböztethető, mi az alap készlet (automatikusan frissül) és mi az egyedi,
# kézzel szerkesztett kiegészítés ("ctm init" nem nyúl hozzájuk).
#
# Használat (jellemzően a "ctm agent add" alparancson át hívva):
#   /Users/mgeri1993/code/projects/claude-task-manager/bin/add-agent.sh [target-dir] <name> [leírás]
#
# target-dir – alapértelmezetten a jelenlegi könyvtár git-gyökere (vagy a cwd)
# name       – az egyedi agent neve, "tm-" előtag NÉLKÜL vagy azzal megadva — az eredmény
#              mindig "tm-<name>" (a "ctm-" előtag foglalt, azt nem használhatod).
# leírás     – rövid, egy mondatos szerepleírás (a generált .md description mezőjébe kerül)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

die() { echo "hiba: $*" >&2; exit 1; }

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
[[ -n "$RAW_NAME" ]] || die "használat: add-agent.sh [target-dir] <name> [leírás]"
shift || true
DESCRIPTION="${*:-Egyedi, projekt-specifikus teammate.}"

SKILL_DIR="$TARGET_DIR/.claude/skills/task-manager"
TASK_SH="$SKILL_DIR/task.sh"
[[ -x "$TASK_SH" ]] || die "ez a projekt nincs telepítve — futtasd először: ctm init (itt: $TARGET_DIR)"

# Név normalizálása: mindig "tm-" előtaggal; a "ctm-" előtag foglalt (az alap készleté).
SHORT="${RAW_NAME#tm-}"
[[ "$SHORT" == ctm-* || "$SHORT" == ctm ]] && die 'a "ctm-" előtag foglalt (az alap agenteké) — válassz más nevet'
[[ "$SHORT" =~ ^[A-Za-z0-9_-]+$ ]] || die "érvénytelen név (csak A-Za-z0-9_- engedett): $RAW_NAME"
AGENT_NAME="tm-$SHORT"

# A projekt-címke a már telepített SKILL.md "# Task Manager (Címke)" fejlécéből (pontosabb,
# mint a mappanév, ha a "ctm init" egyedi címkét kapott); ha nincs ilyen sor, a mappanévre esik.
LABEL="$(sed -n 's/^# Task Manager (\(.*\))$/\1/p' "$SKILL_DIR/SKILL.md" 2>/dev/null | head -1)"
LABEL="${LABEL:-$(basename "$TARGET_DIR")}"

AGENTS_DIR="$TARGET_DIR/.claude/agents"
mkdir -p "$AGENTS_DIR"
OUT="$AGENTS_DIR/$AGENT_NAME.md"
[[ -e "$OUT" ]] && die "már létezik: $OUT (töröld kézzel, ha újra akarod generálni)"

sed \
  -e "s#__AGENT_NAME__#$AGENT_NAME#g" \
  -e "s#__AGENT_SHORT__#$SHORT#g" \
  -e "s#__AGENT_DESCRIPTION__#$DESCRIPTION#g" \
  -e "s#__PROJECT_LABEL__#$LABEL#g" \
  -e "s#__TASK_SH_PATH__#$TASK_SH#g" \
  "$ROOT_DIR/templates/tm-custom.md.tmpl" > "$OUT"

echo "létrehozva: $OUT"
echo "(--as/assign érték: \"$SHORT\" — szerkeszd a fájlt, ha pontosítanod kell a szerepét/scope-ját)"

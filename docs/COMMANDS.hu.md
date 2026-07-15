# `task.sh` parancs-referencia

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.hu.md)

Az `engine/task.sh` az egyetlen író egy projekt `tasks.json` és `context.json` fájljához —
lásd az
[egyetlen-író invariánst](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.hu.md#az-egyetlen-író-invariáns).
Ez az oldal a ~40 parancsát sorolja fel, cél szerint csoportosítva. A teljes, mindig
aktuális lista egy hívásnyira van:

```bash
task.sh help
```

(A telepített wrapperen keresztül futtatva: `<project>/.claude/skills/task-manager/task.sh help`.)

## A `--as <agent>` szabály

**Minden nem-meta parancs megköveteli a `--as <agent-name>`-et** — a saját identitásodat (a
main agent a `--as main`-t használja; egy teammate a saját nevét, pl. `--as backend-dev`).
Ez kerül rögzítésre minden note/history bejegyzés és event `by` mezőjeként, és ebből tudja
az inbox hook, kinek kell kézbesítenie a friss eventeket. Enélkül egy nem-meta parancs
egyszerűen elhasal.

A **meta parancsok mentesülnek** (nem kell `--as`): `help`, `inbox`, `init`, `validate`,
`restore`, `raw`.

## Task-életciklus

| Parancs | Mit csinál |
|---|---|
| `add <id> <title> [desc]` | Új task (`todo`, `priority=normal`, üres `tags`/`dependsOn`). |
| `status <id> <status> [note]` | Státuszváltás (`todo`\|`in_progress`\|`blocked`\|`review`\|`done`) + history bejegyzés. |
| `status-many <status> <id...>` | Több task áthelyezése egy státuszba egyetlen atomikus írásban. |
| `reopen <id> [status]` | Lezárt/archivált task újranyitása (alapértelmezett: `todo`), history-val. |
| `note <id> <text>` | Note hozzáfűzése. A NAGYBETŰS előtag + `:` (pl. `IMPL:`, `DONE:`, `BLOCK:`) színes kind badge-et kap a board-on. |
| `priority <id> <low\|normal\|high\|urgent>` | Prioritás beállítása (ez vezérli a `next` sorrendjét). |
| `tag <id> <add\|rm> <tag>` | Címke hozzáadása/eltávolítása. |
| `module <id> <module>` | A szabadszöveges modul/terület címke beállítása (üres string törli). |
| `dep <id> <add\|rm> <other-id>` | Függőség: `id` `other-id`-re vár (ciklus- és létezés-ellenőrzött). |
| `set <id> <field> <json>` | Egy tetszőleges mező beállítása nyers JSON értékre — a vészkijárat. |
| `archive <id>` / `unarchive <id>` | Az `isArchived` átkapcsolása. |
| `rm <id>` | Task törlése. |

## Elvétel és átadás

| Parancs | Mit csinál |
|---|---|
| `assign <id> <agent>` | Az `assignedAgentId` közvetlen beállítása. |
| `claim <id> [agent]` | **Atomikus, race-safe**: egy `todo`-t `in_progress`-re fordít, és a `--as` hívóhoz rendeli egyetlen lockolt írásban; elutasít, ha egy másik agent már elvette. |
| `next [--claim]` | A következő ajánlott `todo` (nincs nyitott függősége), prioritás szerint. A `--claim` atomikusan elveszi, és a következő jelöltre lép, ha az elsőt közben más elkapta a race-ablakban. |
| `handoff <id> <to> [note]` | Átrendeli `<to>`-hoz, és egy **irányított** inbox-pinget küld neki (`‼️`) — ez az explicit módja annak, hogy egy findinget/bugot/sub-taskot egy konkrét teammate-hez irányíts. |

## Review

| Parancs | Mit csinál |
|---|---|
| `review <id> [reviewer=main] [note]` | `review`-ba mozgatja, hozzárendeli a reviewert, és pingeli az inboxát — a review-nak így gazdája lesz ahelyett, hogy felhalmozódna. |
| `review-queue [reviewer]` | A `review`-ban lévő taskok, legrégebbi elöl, korral; opcionálisan egy reviewerre szűkítve. |
| `stale [--older-than 24h] [status...]` | Tartott, de tétlen taskok (alapértelmezetten `in_progress`+`review`) a küszöbön túl, `lastActivityAt` szerint — feltárja az elakadt/elfeledett munkát. |

## Context (session-folytonosság)

A `context.json` egy külön, kicsi tár az ember szándékának session-eken átívelő
megőrzésére — ugyanaz az egyetlen-író szabály, sosem közvetlenül írva.

| Parancs | Mit csinál |
|---|---|
| `ctx` | A teljes `context.json` kiírása. |
| `ctx-init [init] [goal]` | Létrehozza a `context.json`-t, ha hiányzik (`initPrompt`, `goal`). |
| `ctx-set <field> <json>` | Egy felső szintű mező beállítása (`goal`\|`currentFocus`\|`initPrompt`\|`notes`…). |
| `ctx-decision <topic> <decision> [rationale]` | Időbélyegzett döntés hozzáfűzése. |
| `ctx-constraint <text>` | Állandó megkötés hozzáfűzése. |
| `ctx-question <add\|rm> <text>` | Nyitott kérdés hozzáadása / lezárása. |

## Checklist

Egy taskon *belüli* apró lépések — azok, amelyek nem érdemelnek saját id-t, ownert,
státuszt vagy board kártyát. Egy valódi, önálló munkaegység továbbra is a `dep`/`handoff`
alá tartozik.

| Parancs | Mit csinál |
|---|---|
| `checklist <id>` | A task checklist-elemeinek listázása. |
| `checklist <id> add <text>...` | Egy vagy több elem hozzáadása (stabil `c<n>` id-k, sosem újrahasznosítva). |
| `checklist <id> done <item-id>...` / `undo <item-id>...` | Elemek kipipálása / visszavonása. |
| `checklist <id> rm <item-id>...` | Elemek eltávolítása. |

Egy task `done`-ra állítása kipipálatlan elemekkel **stderr-en figyelmeztet, de nem
blokkol**; az utolsó elem kipipálása önmagában **nem** mozgatja a státuszt.

## Files

| Parancs | Mit csinál |
|---|---|
| `files <id>` | A taskon rögzített abszolút fájlútvonalak listázása. |
| `files <id> add <abs-path>...` | A task által érintett forrásfájlok rögzítése (egyedi, abszolút útvonalak). |
| `files <id> rm <abs-path>...` | Rögzített fájlútvonalak eltávolítása. |

Az érintett fájlok rögzítése **standard kötelesség** minden teammate munkaciklusában — ez
a változás gépileg olvasható mutatója, a szabadszöveges note-on kívül tartva.

## Lekérdezések (nem módosítók)

| Parancs | Mit csinál |
|---|---|
| `list [status] [filters]` | Tömör lista: `<id> [status] (prio) @module title #tag`. Szűrők: `--tag`, `--agent`, `--priority`, `--module`, `--all` (archiváltakkal együtt), `--json`. |
| `ids [status]` | Csak az id-k, soronként egy. |
| `get <id>` | Egy task teljes JSON-ja (nem a teljes fájl). |
| `field <id> <field>` | Egy task egy mezőjének nyers értéke. |
| `summary` | Darabszám státuszonként + összesen. |
| `find <text>` | Cím/leírás keresés (kis- és nagybetűt nem megkülönböztetve), tömör lista. |
| `deps <id>` | Mire vár egy task, és mit blokkol. |
| `history <id>` | Egy task history-bejegyzései, tömören. |

## Inbox

| Parancs | Mit csinál |
|---|---|
| `inbox <agent>` | A *más* agentek által generált eventek `<agent>` cursora óta (nem a sajátjai), majd léptet a cursoron. Csendes, ha nincs semmi új. A telepített `PostToolUse` hook automatikusan meghívja minden `task.sh` futás után — de kézzel is hívható. |

## Admin / meta (nem kell `--as`)

| Parancs | Mit csinál |
|---|---|
| `help` | Ez a parancslista. |
| `init` | Üres `tasks.json` létrehozása, ha hiányzik. |
| `validate` | Séma-ellenőrzés (kötelező mezők, status, priority, törött függőség, duplikált id). |
| `raw` | A teljes fájl — ritkán szükséges, token-drága. |
| `restore` | A legutóbbi pre-write backup visszaállítása (`tasks.json.bak`). |

## Példák

```bash
task.sh list todo --priority high --as main
task.sh add fix-login "Login javítás" "A login 500-at ad vissza" --as main
task.sh next --claim --as backend-dev            # a legfontosabb kész todo elvétele, race-safe
task.sh handoff fix-login backend-dev "404 az export útvonalon" --as playwright-tester
task.sh review fix-login main "kész, kérlek review-zd" --as backend-dev
task.sh review-queue main --as main               # mi vár a jóváhagyásomra
task.sh stale --older-than 24h --as main          # elakadt in_progress/review taskok
task.sh checklist fix-login add "útvonal hozzáadása" "űrlap bekötése" --as main
task.sh files fix-login add /abs/path/to/file.php --as backend-dev
task.sh inbox backend-dev                         # (meta: nincs --as) friss események
```

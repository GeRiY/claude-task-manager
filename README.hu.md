# claude-task-manager

[![npm version](https://img.shields.io/npm/v/%40mgeri1993%2Fclaude-task-manager.svg)](https://www.npmjs.com/package/@mgeri1993/claude-task-manager)
[![npm downloads](https://img.shields.io/npm/dm/%40mgeri1993%2Fclaude-task-manager.svg)](https://www.npmjs.com/package/@mgeri1993/claude-task-manager)
[![license](https://img.shields.io/npm/l/%40mgeri1993%2Fclaude-task-manager.svg)](https://github.com/GeRiY/claude-task-manager/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/GeRiY/claude-task-manager?style=flat-square)](https://github.com/GeRiY/claude-task-manager/stargazers)
[![last commit](https://img.shields.io/github/last-commit/GeRiY/claude-task-manager?style=flat-square)](https://github.com/GeRiY/claude-task-manager/commits/main)
[![CI](https://img.shields.io/github/actions/workflow/status/GeRiY/claude-task-manager/publish.yml?style=flat-square&label=CI)](https://github.com/GeRiY/claude-task-manager/actions)

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/README.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/README.hu.md)

Önálló, dockerizált, **több projektet** kiszolgáló Kanban task-manager Claude Code
agentek (fő agent + teammate-ek) és a mellettük dolgozó emberek koordinálásához.

**Miért:** ha egynél több agentet futtatsz — vagy csak egy hosszú sessiont —, elveszíted a
fonalat: mi kész, mi blokkolt, ki mivel foglalkozik, és egyáltalán mi volt a cél. A
`claude-task-manager` egy tartós, közös igazságforrást ad az agenteknek és az embereknek
egyaránt, amit egy token-hatékony CLI (`task.sh`) frissít ahelyett, hogy minden alkalommal
újra be kellene olvasni az állapotot — és egy közös böngészős board segítségével az ember
is látja mindezt.

![claude-task-manager architektúra: az agentek és az ember/board is a task.sh-ban fut össze, ami az egyetlen író, atomikus lock alatt, és kizárólag ő írja a projekt tasks.json fájlját](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/img/architecture.svg)

> 📖 **Most ismerkedsz vele? Kezdd az útmutatóval.** Egyszerű, felhasználó-nézőpontú
> bemutató a Claude Code-dal való munkáról a board-on — *mit írj be* (természetes
> nyelven), user story-kon keresztül:
> **[Claude Code + ctm: egyszerű használati útmutató](https://github.com/GeRiY/claude-task-manager/discussions/4)**
> ([in English](https://github.com/GeRiY/claude-task-manager/discussions/3)).

## Képernyőképek

![Élő frissítés: a task.sh valós időben vezeti végig a board-ot todo → in_progress → review → done állapotokon](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-live-update.gif)

| Kanban board (magyar) | Task-részlet (magyar) |
|---|---|
| ![Kanban board, magyar](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-hu-board.png) | ![Task-részlet modal, magyar](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-hu-modal.png) |

| Parancspaletta (⌘K) | Archívum nézet |
|---|---|
| ![Parancspaletta: fuzzy keresés a feladatokon és parancskatalógus egy ⌘K-val megnyíló rétegben](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-en-palette.png) | ![Archívum nézet: az archivált feladatok nap szerint csoportosítva, átbocsátás-sávval és átfutási idővel](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-en-archive.png) |

## Telepítés

Szükséges: `git`, `bash`, `jq`, `docker` (a `docker compose` pluginnal) és `php` — ezek
csak akkor kellenek, ha a böngészős boardot is futtatod. Maga a `task.sh` CLI csak
`bash` + `jq`-t igényel, dockert nem.

```bash
git clone https://github.com/GeRiY/claude-task-manager.git
cd claude-task-manager
cp .env.example .env        # alap: board a 3333-as porton, autostart nélkül
```

Vagy, ha klónozás nélkül csak a `ctm` parancs kell:

```bash
npm install -g @mgeri1993/claude-task-manager
```

Ennyi — nincs build-lépés.

## Gyors indulás

### 1. A `ctm` parancs regisztrálása

Bármely telepítés (`install.sh` / `ctm init`) automatikusan regisztrálja a `ctm`-et a
PATH-on. Ha még sosem futtattál telepítést, regisztrálhatod kézzel is:

```bash
ln -s /path/to/claude-task-manager/bin/ctm ~/.local/bin/ctm
# győződj meg róla, hogy a ~/.local/bin a PATH-adban van
```

### 2. Board indítása (docker)

```bash
ctm up            # alapértelmezett port: 3333 (lásd .env: CTM_PORT)
ctm up 4000        # más port — átírja a .env-et és újraindítja a konténert
```

A `ctm up` idempotens. A board elérhető a `http://localhost:<port>/` címen (a
`?project=<id>&lang=<en|hu>` paraméterekkel közvetlenül mélylinkelhető is).

### 3. Telepítés egy projektbe

```bash
cd /path/to/valamelyik/projekt
ctm init                          # id/label = a mappa neve
```

Ez létrehozza a `.claude/skills/task-manager/task.sh`-t (docker-mentes wrapper), a
telepített `SKILL.md`-t, a nyolc alap teammate-agentet (lásd lentebb), és a
Bash-jogosultsági hookokat, amelyek lehetővé teszik ezeknek az agenteknek, hogy
rákérdezés nélkül hívják a `task.sh`-t. Az újrafuttatott `ctm init` idempotens, és sosem
nyúl a `data/<id>/`-hoz vagy a saját egyedi `tm-*` agent-fájljaidhoz.

### 4. Mindennapi `task.sh` példák

```bash
task.sh assign fix-login ctm-be-medior --as main     # routolás — enélkül egy teammate nem tudja elvenni
task.sh next --claim --as ctm-be-medior              # a saját legfontosabb kész todo-d elvétele, race-safe
task.sh review fix-login main "kész, kérlek review-zd" --as ctm-be-medior
task.sh list --module auth --as main
```

Teljes parancs-referencia (~40 parancs): **[docs/COMMANDS.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.hu.md)**.

### 5. Projektek kezelése

```bash
ctm list                  # regisztrált projektek (id, címke, adat-könyvtár)
ctm rm <id> [--force]     # projekt törlése a regisztrációból (adat + wrapper) — rákérdez
```

## Teammate-ek

A `ctm init` nyolc alap teammate-agentet telepít, amelyeknek az indítási neve *egyben* a
task-manager identitása is, plusz egy `main` koordinátor agentet, amely kiosztja a munkát
és review-zi az eredményeket:

- egy **szintezett dev roster** — **`ctm-be-junior`**, **`ctm-be-medior`**, **`ctm-be-senior`** a
  backendre és **`ctm-fe-junior`**, **`ctm-fe-medior`**, **`ctm-fe-senior`** a frontendre, ahol **a
  szint maga a modell** (junior = haiku, medior = sonnet, senior = opus). **A medior az
  alapértelmezett igásló**; az opuson futó seniorok kizárólag a te kifejezett engedélyeddel
  indíthatók.
- **`ctm-investigator`** (csak olvasásra szolgáló kódvizsgálat) és **`ctm-playwright-tester`**
  (viselkedés ellenőrzése valódi böngészőben).

A roster egy **étlap, nem indítási lista** — továbbra is 3-4 fusson egyszerre. A munka
`todo → in_progress → review → done` állapotokon megy át; egy teammate sosem zárja `done`-ra
a saját feladatát, hanem `review`-ba küldi, és a main dönt. A mainnek explicit módon
`assign`-olnia kell a taskot — a `claim` szigorú, és csak a hozzárendelt agent veheti el.
Ha az alap rosteren felül másra is szükséged van, a `ctm agent add <name>` egyedi `tm-*`
agentet hoz létre.

A teljes modell — a szintek, a `tm-*` konvenció, az agentenkénti tool-allowlistek, és
hogy hány teammate-et érdemes egyszerre futtatni: **[docs/AGENTS.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.hu.md)**.

## Nyelv / i18n

A board alapból **angol**. Kattints a fejléc nyelv-gombjára (vagy tedd hozzá az URL-hez
a `?lang=hu`-t) a **magyarra** váltáshoz — a választás megmarad `localStorage`-ban és az
URL-ben is, így egy board-link megosztható egy adott nyelven.

![Kanban board, angol — a kétnyelvű felület bizonyítéka](https://raw.githubusercontent.com/GeRiY/claude-task-manager/main/docs/screenshots/demo-en-board.png)

A nyelv **nem** kerül semelyik taskba vagy jegyzetbe — egy kis `data/<id>/.board-lang`
fájlban él. Az `engine/task.sh lang` olvassa be, és jelenti, milyen nyelvet használt a
human a boardon; minden generált agent-sablon megköveteli, hogy az agent session-enként
egyszer lekérdezze ezt (lásd a saját definíciójának "task.sh — calling rules" szakaszát).

## Naprakészen tartás

A `ctm`, `install.sh`, `add-agent.sh` és `projects.sh` mindegyike ellenőrzi (egy
könnyűsúlyú `git ls-remote`-tal, nem teljes fetch-csel), hogy az `origin`-on van-e olyan
commit, ami a lokális checkoutból hiányzik, és ha igen, sárga jelzést ír ki. Ezt **nem**
futtatja le az `engine/task.sh` maga — az hálózati késleltetést adna egy olyan
parancshoz, amit minden egyes task-mutációnál meghívnak.

## Dokumentáció

- **[docs/ARCHITECTURE.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.hu.md)** — az egyetlen-író invariáns, a komponensek, a könyvtárszerkezet, a `.env` beállítások.
- **[docs/COMMANDS.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.hu.md)** — a teljes `task.sh` parancs-referencia.
- **[docs/BOARD.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.hu.md)** — a böngészős board: nézetmódok (köztük az Archívum nézet), a ⌘K parancspaletta, szűrés, a task modal, mélylinkek.
- **[docs/AGENTS.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.hu.md)** — a teammate-modell teljes leírása.
- **[CONTRIBUTING.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/CONTRIBUTING.hu.md)** — nincs build-lépés, a board helyi futtatása, a tükrözött fájlok szabálya, és a csak-angol konvenció.

## Biztonság

- A board docker-portja kizárólag `127.0.0.1`-re van kötve — a LAN-ról sosem elérhető.
- Az írás-endpoint (`api/index.php`) egy explicit parancs-allowlistet futtat; a
  destruktív parancsok (`rm`, `restore`, `raw`) sosincsenek kiengedve a
  böngészőnek.
- A teljes biztonsági helyzet és a sebezhetőség-bejelentés módja:
  **[SECURITY.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/SECURITY.hu.md)**.

## Közösség és discussion

Kérdések, ötletek és configok helye a
[**GitHub Discussions**](https://github.com/GeRiY/claude-task-manager/discussions) — a
konkrét bugok az [Issues](https://github.com/GeRiY/claude-task-manager/issues) alá
tartoznak. Amit érdemes hozni: több-agentes setupok és az `--as <agent>` hívási
szerződés, a saját teammate-configjaid, feature ötletek, és használati súrlódások.

Új vagy itt? Köszönj be a
[welcome threadben](https://github.com/GeRiY/claude-task-manager/discussions/1) — írd meg,
milyen projekteken koordinálsz agenteket, és mire használod az eszközt.

## Csillagok alakulása (star history)

[![Star History Chart](https://api.star-history.com/svg?repos=GeRiY/claude-task-manager&type=Date)](https://star-history.com/#GeRiY/claude-task-manager&Date)

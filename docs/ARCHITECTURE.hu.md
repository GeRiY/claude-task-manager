# Architektúra

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.hu.md)

Ez a dokumentum azt mutatja be, hogyan áll össze a `claude-task-manager`: a darabok, az
egészet összetartó egyetlen-író invariáns, a könyvtárszerkezet, és a `.env` beállítások.
Közreműködőknek és az eszközt testre szabóknak szól, nem a mindennapi felhasználóknak — ha
te ilyen vagy, kezdd a [README](https://github.com/GeRiY/claude-task-manager/blob/main/README.hu.md)-vel.

## Az egyetlen-író invariáns

Egy projekt task-adatainak minden módosítása — akár egy agent Bash tool hívásából, akár egy
ember böngészős board-on történő kattintásából ered — pontosan egyetlen programon megy
keresztül: az **`engine/task.sh`**-on. Nincs második útvonal.

- Az `engine/task.sh` minden írás körül felvesz egy atomikus **mkdir-alapú lock**-ot, saját
  maga tartja karban az `updatedAt`/history/notes mezőket, és egy pre-write backupot ír,
  mielőtt hozzányúlna a `tasks.json`-hoz. Két, ugyanazon a taskon versengő hívó (két agent,
  vagy egy agent és a board) sosem nyerhet mindkettő — az egyik megkapja a lockot, a másik
  vár, vagy elutasításra kerül (pl. `claim` egy már lefoglalt taskon).
- **A böngésző sosem ír közvetlenül JSON-t.** A board írás-endpointja, az `api/index.php`,
  egy explicit **parancs-allowlistet** (`status`, `note`, `priority`, `module`, `tag`,
  `assign`, `dep`, `status-many`, `reopen`, `add`, `checklist`) futtat a `task.sh`-on
  keresztül a kiválasztott projekt `TM_DIR`-jével — a destruktív parancsok (`rm`, `restore`,
  `raw`, `archive`) sosincsenek kiengedve neki. A teljes írás-endpoint biztonsági helyzetért
  lásd a [SECURITY.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/SECURITY.hu.md)-t.
- **Az agentek sem kapnak kiskaput.** A telepített `SKILL.md` és minden teammate agent
  template ugyanazt a szigorú szabályt mondja ki: sosem szabad a `tasks.json`/`context.json`
  fájlt `Read`/`Write`/`Edit` tool-lal szerkeszteni — kizárólag `task.sh` parancsokkal.

A gyakorlati hatás: a `tasks.json` és a `context.json` sosem kerül egyszerre két hívó által
read-modify-write módon módosításra, és pontosan egy kódútvonalnak kell helyesen kezelnie a
lockolást, a history-t és az esemény-kibocsátást.

### A task.sh-nak nincs szüksége dockerre; a board-nak van

A `task.sh` hívások (minden agent-munka) **egyszerű host-bash szkriptként** futnak —
docker, konténer és hálózat nélkül. Kizárólag a böngészős **board** és annak **write
API**-ja (`api/index.php`) van konténerizálva (PHP beépített szervere docker
compose-on keresztül). Ez a szétválasztás teszi lehetővé, hogy egy teammate agent olyan
sessionben is frissítsen taskokat, ahol a docker nem is fut.

## Komponensek

- **`engine/task.sh`** — a tényleges Kanban engine (jq-alapú, atomikus írások, lockolás,
  `events.jsonl`-alapú inbox-értesítések). A `TM_DIR` környezeti változón keresztül mutat
  bármely projekt saját adat-könyvtárára. Minden futáskor stderr-emlékeztetőt ír ki, ha a
  projekt preferált nyelve (a board-ról beállítva) nem angol — lásd a README
  [Nyelv / i18n](https://github.com/GeRiY/claude-task-manager/blob/main/README.hu.md#nyelv--i18n)
  szakaszát.
- **`engine/projects.sh`** — a projekt-regisztrációs admin CLI: minden regisztrált
  projekthez létrehoz egy `data/<id>/` adat-könyvtárat és egy `wrappers/<id>.sh` wrappert,
  amelybe már **bele van égetve** a `TM_DIR` és az engine abszolút útvonala.
- **`engine/agent-tools.sh`** — feloldja a `ctm init`/`ctm agent add` időpontjában egy
  teammate agent frontmatterjébe beégetett `tools:` allow-listet. Lásd
  [AGENTS.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.hu.md).
- **`engine/check-update.sh`** — az admin-jellegű szkriptek (`ctm`, `install.sh`,
  `add-agent.sh`, `projects.sh`) source-olják be, hogy egy sárga "elérhető frissítés"
  jelzést írjanak ki, illetve maga a `task.sh` is, a saját fojtott (throttled), nem
  blokkoló jelzéséhez — lásd a README
  [Naprakészen tartás](https://github.com/GeRiY/claude-task-manager/blob/main/README.hu.md#naprakészen-tartás)
  szakaszát.
- **`data/<id>/`** — a projektek tényleges táblái (`tasks.json`, `context.json`,
  `events.jsonl`, `.cursors/`, `.board-lang`) — ITT élnek, a claude-task-manager saját
  repójában, nem a célprojektben.
- **`index.html` + `js/*` + `style.css`** — a böngészős board. PHP beépített szerver
  szolgálja ki docker compose-on keresztül; a Source selector a `data/projects.json`-ban
  regisztrált projektek között vált. Lásd
  [BOARD.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.hu.md).
- **`api/index.php`** — a board WRITE endpointja: a fenti allowlistelt `task.sh`
  parancsokat futtatja, beleégetve a kiválasztott projekt `TM_DIR`-jét.
- **`install.sh`** / **`bin/ctm`** — telepíti a `.claude/skills/task-manager/`-t (wrapper
  `task.sh` + `SKILL.md`), az alap teammate agenteket, és az `allow-task-sh.sh` /
  `notify-inbox.sh` hookokat egy tetszőleges célprojektbe, és kiterjeszti annak Bash
  allowlistjét.
- **`bin/add-agent.sh`** (`ctm agent add`) — egyedi, `tm-*`-nevű teammate-definíciót hoz
  létre egy már telepített projektben.

## Könyvtárszerkezet

```
claude-task-manager/
  engine/task.sh, projects.sh, check-update.sh, agent-tools.sh  # a motor + projekt-admin CLI + frissítés-ellenőrzés + tool-feloldás
  bin/ctm, add-agent.sh                          # a "ctm" parancssori belépési pont
  install.sh                                     # egy célprojekt telepítője (a ctm init hívja)
  templates/                                     # SKILL.md / agents/*.md.tmpl / tm-custom / hook sablonok (__PLACEHOLDER__-ekkel)
  api/index.php                                  # a board írás-endpointja
  index.html, js/, style.css                     # a böngészős board
  favicon.svg, favicon.ico                       # board favicon
  data/<id>/                                     # projektenkénti tábla (gitignore-olva)
  wrappers/<id>.sh                               # generált, projektenkénti task.sh wrapperek (gitignore-olva)
  docker-compose.yml, Dockerfile                 # a board+API konténerizálása (CTM_PORT, CTM_RESTART)
```

## Környezeti változók (`.env`)

| Változó | Alapérték | Jelentés |
|---|---|---|
| `CTM_PORT` | `3333` | A board portja (host loopback: `127.0.0.1:<port>`). A `ctm up <port>` állítja be. |
| `CTM_RESTART` | `no` | Docker restart-policy. `ctm autostart on` → `unless-stopped`. |
| `CTM_UID` / `CTM_GID` | a host felhasználójáé | A `ctm up`/`ctm autostart` írja be, hogy a konténer a host felhasználójaként fusson, így a `data/` fájlok host-tulajdonúak maradnak root helyett. |

Lásd a `.env.example`-t (a valódi `.env` gitignore-olt, mivel a `ctm` írja/frissíti).

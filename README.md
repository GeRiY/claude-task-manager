# claude-task-manager

Önálló, dockerizált, **több projektet** kiszolgáló Kanban task-manager Claude Code
agentek (fő agent + teammate-ek) koordinálásához. Egy közös, böngészős board-dal és egy
`--as <agent>`-alapú, token-hatékony `task.sh` CLI-vel — bármelyik regisztrált projektből
hívva, docker nélkül.

## Architektúra dióhéjban

- **`engine/task.sh`** — a tényleges Kanban-motor (jq-alapú, atomikus írás, lock, history,
  `events.jsonl` alapú inbox-értesítés). `TM_DIR` env-változóval bármelyik projekt saját
  adat-könyvtárára mutatható.
- **`engine/projects.sh`** — projekt-regisztráló admin CLI: minden regisztrált projekthez
  létrehoz egy `data/<id>/` adat-könyvtárat, és egy `wrappers/<id>.sh` wrappert, ami a
  `TM_DIR`-t és az engine abszolút útját már **beégetve** hordozza.
- **`data/<id>/`** — a projektek tényleges táblái (`tasks.json`, `context.json`,
  `events.jsonl`, `.cursors/`) — ITT élnek, nem a célprojektben.
- **`index.html` + `js/*` + `style.css`** — a böngészős board. Docker compose-szal
  szolgálja ki egy PHP beépített szerver; a Forrás-választó a `data/projects.json`
  regisztrált projektjei közt vált.
- **`api/index.php`** — a board ÍRÁS-endpointja: allowlistelt `task.sh` parancsokat futtat
  a kiválasztott projekt `TM_DIR`-jével (a böngésző sosem írja közvetlenül a JSON-t).
- **`install.sh`** / **`bin/ctm`** — egy tetszőleges célprojektbe telepíti a
  `.claude/skills/task-manager/` mappát (wrapper `task.sh` + `SKILL.md`) és a generikus
  `ctm-*` teammate-agenteket, majd bővíti a célprojekt Bash-allowlistjét.
- **`bin/add-agent.sh`** (`ctm agent add`) — egyedi, `tm-*` nevű teammate-definíció
  létrehozása egy már telepített projektben.

**Fontos:** a `task.sh`-hívásokhoz (agent-munkavégzés) **nincs szükség dockerre** — a
wrapperek sima host-bash scriptek. Kizárólag a böngészős **board** és az **API** fut
konténerben.

## Gyors indulás

### 1. A `ctm` parancs regisztrálása

A `ctm` parancsot bármely telepítés (`install.sh` / `ctm init`) automatikusan regisztrálja
a PATH-on (`/usr/local/bin/ctm` vagy `~/.local/bin/ctm`, amelyik írható). Ha még sosem
futtattál telepítést, regisztrálhatod kézzel is:

```bash
ln -s /Users/mgeri1993/code/projects/claude-task-manager/bin/ctm ~/.local/bin/ctm
# győződj meg róla, hogy a ~/.local/bin a PATH-adban van
```

### 2. Board indítása (docker)

```bash
ctm up            # alapértelmezett port: 3333 (lásd .env: CTM_PORT)
ctm up 4000        # más port — átírja a .env-et és újraindítja a konténert
```

`ctm up` **idempotens**: ha a konténer már fut ugyanazzal a konfigurációval, nem csinál
semmit; ha nem fut, elindítja; ha a port változott, újraindítja. Ha a kért port már
foglalt egy MÁS folyamat által, egyértelmű hibával leáll, mielőtt dockert hívna.

```bash
ctm down                 # board leállítása
ctm autostart on|off     # docker restart-policy (unless-stopped / no) — gép/docker
                          # újraindításkor is magától elinduljon-e a board
```

A board ezután elérhető: `http://localhost:<port>/`

### 3. Projekt telepítése

Bármelyik projekt gyökeréből (vagy git-repóból) futtatva:

```bash
cd /path/to/valamelyik/projekt
ctm init                          # id/label = a mappa neve
ctm init sajat-id "Szép Név"      # explicit id/label
```

Ez létrehozza:

- `<projekt>/.claude/skills/task-manager/task.sh` — a projektre szabott wrapper
  (`TM_DIR` + az engine abszolút útja beégetve; docker NEM kell hozzá).
- `<projekt>/.claude/skills/task-manager/SKILL.md` — Claude Code skill-dokumentáció
  (a `task.sh`-hívási kontraktus, workflow, `context.json` stb.) — projekt-agnosztikus.
- `<projekt>/.claude/agents/ctm-frontend-developer.md`,
  `ctm-backend-developer.md`, `ctm-code-investigator.md` — generikus teammate-definíciók
  (a konkrét stack-et a projekt saját dokumentációjából olvassák ki).
- `<projekt>/.claude/settings.local.json` — bővítve a `task.sh` Bash-allowlistjével
  (engedélykérés nélküli futtatás).

Újrafuttatva (`ctm init` ismét) **idempotens** — felülírja/frissíti a generált fájlokat, a
`data/<id>/` tábla tartalmát nem érinti.

### 4. Egyedi (custom) teammate hozzáadása

Egy már telepített projektben, ha a 3 alap szerepkörön (frontend/backend/investigator)
felül másra is szükséged van:

```bash
cd /path/to/mar-telepitett-projekt
ctm agent add reviewer "Kódot review-z és minőségi kaput ellenőriz."
```

Létrehozza `.claude/agents/tm-reviewer.md`-t. **Névkonvenció:** az `install.sh`/`ctm init`
generálta alap készlet mindig `ctm-*`, az így, kézzel hozzáadott egyedi agentek mindig
`tm-*` — így elsőre látszik, mi az automatikusan frissülő alap és mi az egyedi kiegészítés
(a `ctm init` a `tm-*` fájlokhoz nem nyúl).

### 5. Projektek kezelése

```bash
ctm list                  # regisztrált projektek (id, címke, adat-könyvtár)
ctm wrapper <id>          # egy projekt generált wrapperének kiírása (kézi másoláshoz)
```

## `task.sh` a projektből (docker nélkül)

A telepített wrapperen keresztül, a projekt saját `.claude/skills/task-manager/`-jéből:

```bash
/path/to/projekt/.claude/skills/task-manager/task.sh summary --as main
/path/to/projekt/.claude/skills/task-manager/task.sh list todo --as main
/path/to/projekt/.claude/skills/task-manager/task.sh add fix-1 "Bug fix" "leírás" --as main
/path/to/projekt/.claude/skills/task-manager/task.sh status fix-1 in_progress --as main
```

Teljes parancslista: `task.sh help`. A hívási kontraktust (kötelező `--as`, csupasz-hívás
szabály, review→done átadási kör) a telepített `SKILL.md` írja le részletesen.

## Könyvtárszerkezet

```
claude-task-manager/
  engine/task.sh, projects.sh     # a motor + projekt-admin CLI
  bin/ctm, add-agent.sh           # a "ctm" parancssori belépési pont
  install.sh                      # egy célprojekt telepítője (ctm init hívja)
  templates/                      # SKILL.md / ctm-* / tm-custom sablonok (__PLACEHOLDER__-ekkel)
  api/index.php                   # a board írás-endpointja
  index.html, js/, style.css      # a böngészős board
  data/<id>/                      # projektenkénti tábla (gitignore-olva)
  wrappers/<id>.sh                # generált, projektenkénti task.sh wrapperek (gitignore-olva)
  docker-compose.yml, Dockerfile  # a board+API konténerizálása (CTM_PORT, CTM_RESTART)
```

## Környezeti változók (`.env`)

| Változó | Alap | Jelentés |
|---|---|---|
| `CTM_PORT` | `3333` | A board portja (host loopback: `127.0.0.1:<port>`). `ctm up <port>` állítja. |
| `CTM_RESTART` | `no` | Docker restart-policy. `ctm autostart on` → `unless-stopped`. |

Lásd `.env.example`-t (a valódi `.env` gitignore-olva van, mert `ctm` írja/frissíti).

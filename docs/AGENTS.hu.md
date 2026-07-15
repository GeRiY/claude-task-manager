# A teammate-modell

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.hu.md)

A `claude-task-manager` egy **main agentet** (a koordinátort: felveszi és lebontja a
kéréseket, kiosztja a taskokat, review-zi az eredményeket, eldönti a
`review → done | assign+todo` átadást) és egy sor **teammate agentet** koordinál, amelyek
a tényleges implementációs munkát végzik — mindannyian a `task.sh`-on és annak inbox
eventjein keresztül kommunikálva, nem pedig közvetlen üzenetekkel a task állapotáról.

## Alap agentek

A `ctm init` négy általános teammate-definíciót telepít/frissít a
`<project>/.claude/agents/`-be:

| Agent | Mire használd |
|---|---|
| `backend-dev` | Backend munka. |
| `frontend-dev` | Frontend munka. |
| `investigator` | Csak olvasásra szolgáló kódvizsgálat — általában a lánc első tagja. |
| `playwright-tester` | Viselkedés ellenőrzése egy valódi, futó böngészőben — általában a lánc utolsó tagja. **Környezetfüggő**: szüksége van a Playwright MCP szerverre; enélkül az agent telepítve van, de nem tud böngészőt vezérelni, és ilyenkor a helyes lépés ezt kimondani, nem pedig egy taskot "ellenőrzöttként" átengedni, amikor az ellenőrzés sosem futott le. |

**Az indítási név MAGA a task-manager identitás.** Az alap készlethez a fájlnév
(`backend-dev.md`), a frontmatter `name:`-je, az Agent-tool `subagent_type`-ja, amivel
elindítod, és az `assign`/`--as` érték, ami alatt taskokat elvesz, mind ugyanaz a string.
Nincs mit levágni vagy lefordítani — egy `backend-dev`-hez rendelt taskot egy
`backend-dev`-ként indított agent veszi fel, ennyi.

A konkrét stack-jüket/konvencióikat a célprojekt saját dokumentációjából olvassák ki —
maguk a template-ek projekt-függetlenek.

## Egyedi agentek (`tm-*`)

Amikor egy projektnek az alap négyen túli szerepre van szüksége:

```bash
cd /path/to/installed/project
ctm agent add reviewer "Reviews code and checks the quality gate."
```

Ez létrehozza a `.claude/agents/tm-reviewer.md`-t. Az egyedi agentek **mindig** `tm-*`-
előtagú fájlok; a task-manager identitásuk a levágott rövid név (`tm-reviewer.md`
`reviewer`-ként vesz el taskokat). A `ctm init` újrafuttatása sosem nyúl a `tm-*`
fájlokhoz — azok kizárólag a te kézi szerkesztésedre valók.

A `bin/add-agent.sh` **megtagadja egy egyedi agent létrehozását az alap négy név
egyikével** (`backend-dev`, `frontend-dev`, `investigator`, `playwright-tester`), `tm-`
előtaggal vagy anélkül: egy kézzel hozzáadott `tm-backend-dev` továbbra is
`backend-dev`-identitásként venne el taskokat (az előtag csak az indítási/fájlnéven van,
nem a `--as` identitáson), és a valódi `backend-dev` agenttel harcolna ugyanazért a
sorért. Válassz másik rövid nevet.

## Agentenkénti tool-allowlistek

Minden generált agent frontmatter `tools:` sorát az `engine/agent-tools.sh` oldja fel a
`templates/agent-tools.json`-ból (egy `default` plusz egy agentnév szerinti `agents` map;
minden érték vagy egy vesszővel elválasztott string, vagy egy JSON array). Egy projekt
felülírhatja ezt egy saját `.claude/agent-tools.json` elhelyezésével a célrepóban.
Sorrend egy adott agentnévre (az első találat nyer):

1. projekt felülírás — `.agents[<name>]`
2. repo config — `.agents[<name>]`
3. projekt felülírás — `.default`
4. repo config — `.default`
5. beépített fallback (így egy törölt/hibás config sosem blokkol egy telepítést)

A hatályos, feloldott mapping bármikor megvizsgálható:

```bash
ctm agent tools            # minden agent
ctm agent tools backend-dev
```

## Teammate-ek futtatása

Futtass **3-4 teammate-et egyszerre — ne többet —, és folyamatosan etesd őket.** Az
alapértelmezett mix az alap készlet: `investigator`, `backend-dev`, `frontend-dev`, plusz
`playwright-tester`, ahol a környezet engedi. Ez a *párhuzamosságra* vonatkozó korlát, nem
a teljes átbocsátásra: egy teammate, amelyik befejez egy taskot, életben marad, és felveszi
a következőt.

- **Ne állíts le egy teammate-et, hogy elindíts egy másikat.** A spawnolás drága, és eldob
  mindent, amit az adott teammate már megtanult a kódbázisról — inkább küldd neki a
  következő taskot.
- **Etesd őket, ne kötegeld.** Amikor egy teammate visszajelez, azonnal add neki a
  következő taskot, ahelyett hogy megvárnád a többieket — egy blokkolt teammate tétlen
  kapacitás.
- **4-nél többet párhuzamosan csak akkor, ha a munka valóban megkívánja** — azon túl a
  koordinációs költség (routolás, review, két agent ugyanazt a fájlt szerkeszti)
  gyorsabban nő, mint a nyert átbocsátás.

A telepített `SKILL.md` "Roles" és "How many teammates to run" szakaszaiban található a
teljes workflow, amit ez vezérel (claim → work → checklist → files → note → review).

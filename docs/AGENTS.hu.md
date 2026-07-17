# A teammate-modell

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/AGENTS.hu.md)

A `claude-task-manager` egy **main agentet** (a koordinátort: felveszi és lebontja a
kéréseket, kiosztja a taskokat, review-zi az eredményeket, eldönti a
`review → done | assign+todo` átadást) és egy sor **teammate agentet** koordinál, amelyek
a tényleges implementációs munkát végzik — mindannyian a `task.sh`-on és annak inbox
eventjein keresztül kommunikálva, nem pedig közvetlen üzenetekkel a task állapotáról.

## Alap agentek

A `ctm init` nyolc általános teammate-definíciót telepít/frissít a
`<project>/.claude/agents/`-be:

| Agent | Modell | Mire használd |
|---|---|---|
| `ctm-be-junior` | haiku | Már **eldöntött** backend munka — olyan task, aminek van checklistje és megnevezett fájljai. |
| `ctm-be-medior` | sonnet | Backend munka. **Az alapértelmezett igásló.** |
| `ctm-be-senior` | opus | Tervezést/mérlegelést igénylő backend munka. **Az indításához a felhasználó kifejezett engedélye kell.** |
| `ctm-fe-junior` | haiku | Már **eldöntött** frontend munka — olyan task, aminek van checklistje és megnevezett fájljai. |
| `ctm-fe-medior` | sonnet | Frontend munka. **Az alapértelmezett igásló.** |
| `ctm-fe-senior` | opus | Tervezést/mérlegelést igénylő frontend munka. **Az indításához a felhasználó kifejezett engedélye kell.** |
| `ctm-investigator` | sonnet | Csak olvasásra szolgáló kódvizsgálat — általában a lánc első tagja. |
| `ctm-playwright-tester` | sonnet | Viselkedés ellenőrzése egy valódi, futó böngészőben — általában a lánc utolsó tagja. **Környezetfüggő**: szüksége van a Playwright MCP szerverre; enélkül az agent telepítve van, de nem tud böngészőt vezérelni, és ilyenkor a helyes lépés ezt kimondani, nem pedig egy taskot "ellenőrzöttként" átengedni, amikor az ellenőrzés sosem futott le. |

A konkrét stack-jüket/konvencióikat a célprojekt saját dokumentációjából olvassák ki —
maguk a template-ek projekt-függetlenek.

### A szint MAGA a modell

A main **nem** adja át az Agent tool `model` paraméterét. A megfelelő *agentet* választja
ki, és a modell jön vele: junior = haiku, medior = sonnet, senior = opus. Nincs
indításonkénti modell-felülírás, amit el lehetne rontani — a `ctm-be-medior` választása a
`ctm-be-junior` helyett *maga* a modellválasztás.

- **Ha bizonytalan vagy, a mediort használd.** Ő az alapértelmezett igásló mindkét
  területen.
- **A seniorok (`ctm-be-senior`, `ctm-fe-senior`) opuson futnak, és kizárólag a felhasználó
  kifejezett engedélyével indíthatók.** A main előbb megkérdezi. Engedély nélkül a medior
  végzi el a munkát.
- **A juniorok csak olyan taskot fogadnak el, aminek már van checklistje és megnevezett
  fájljai.** Bármi ennél homályosabb azonnal visszapattan egy `BLOCK:` note-tal — a
  mainnek (vagy a seniornak) előbb le kell bontania a munkát. A junior egy eldöntött lista
  ledarálására való, nem a döntésre.
- **A területek közti átadás medior-medior között megy** (`ctm-be-medior` ↔ `ctm-fe-medior`), soha
  nem átlósan, szinteken keresztül.

### A junior review-routingja

Alapból a junior a `main`-nek routolja a kész munkáját. A main **átadhatja** ezt a
review-t az azonos terület mediorjának — és akkor a medior lezárhatja a junior taskját
`done`-ra —, de ehhez az átadáshoz szintén a felhasználó kifejezett engedélye kell.

Ez sosem válik önjóváhagyássá: **egy teammate sem zárja `done`-ra a SAJÁT taskját.**

### Hogyan generálódik a roster

A hat dev agent nem hat template. Egyetlen `templates/agents/dev.md.tmpl`-ból, egy
manifestből (`templates/agents-manifest.json`, ami minden agent területét/szintjét/
modelljét/színét hordozza) és a beillesztett szintenkénti fragmentből
(`templates/agent-tiers/{junior,medior,senior}.md`) renderelődnek. Az `engine/roster.sh` az
egyetlen igazságforrás az agent-nevek listájára — minden fogyasztó (`install.sh`,
`ctm agent tools`, `add-agent.sh`) onnan olvassa a rostert, így a névlista nem tud
elcsúszni attól, ami ténylegesen generálódott.

**Az agentek színei** ugyanezt a két tengelyt kódolják. A backend hideg rámpa —
`ctm-be-junior` cyan, `ctm-be-medior` blue, `ctm-be-senior` purple; a frontend meleg rámpa —
`ctm-fe-junior` yellow, `ctm-fe-medior` orange, `ctm-fe-senior` red. A terület a hőmérsékletből, a
szenioritás a mélységből olvasható ki. Az `ctm-investigator` `pink`, a `ctm-playwright-tester`
`green`.

## Identitás: az indítási név MAGA az identitás

**Az indítási név MAGA a task-manager identitás.** Az alap készlethez a fájlnév
(`ctm-be-medior.md`), a frontmatter `name:`-je, az Agent-tool `subagent_type`-ja, amivel
elindítod, és az `assign`/`--as` érték, ami alatt taskokat elvesz, mind ugyanaz a string.
Nincs mit levágni vagy lefordítani — egy `ctm-be-medior`-hoz rendelt taskot egy
`ctm-be-medior`-ként indított agent veszi fel, ennyi.

Ez most többet számít, mint korábban, mert a **`claim` szigorú**: csak a hozzárendelt agent
veheti el a taskot. Ahhoz az identitáshoz rendeld, amit indítani szándékozol, különben a
taskot sosem lehet elvenni — lásd a
[docs/COMMANDS.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.hu.md#elvétel-és-átadás)-t.

## Egyedi agentek (`tm-*`)

Amikor egy projektnek az alap rosteren túli szerepre van szüksége:

```bash
cd /path/to/installed/project
ctm agent add reviewer "Reviews code and checks the quality gate."
```

Ez létrehozza a `.claude/agents/tm-reviewer.md`-t. Az egyedi agentek **mindig** `tm-*`-
előtagú fájlok; a task-manager identitásuk a levágott rövid név (`tm-reviewer.md`
`reviewer`-ként vesz el taskokat). A `ctm init` újrafuttatása sosem nyúl a `tm-*`
fájlokhoz — azok kizárólag a te kézi szerkesztésedre valók.

A `bin/add-agent.sh` **két dolgot tagad meg**: olyan rövid nevet, ami már ma is az alap
roster egyik neve (`ctm-be-junior`, `ctm-be-medior`, `ctm-be-senior`, `ctm-fe-junior`,
`ctm-fe-medior`, `ctm-fe-senior`, `ctm-investigator`, `ctm-playwright-tester`), és — a
tágabb szabályként — **bármilyen `ctm-`-lel kezdődő rövid nevet**, akkor is, ha az még nincs
a mai rosterben (hogy egy jövőbeli tier nevét se lehessen előre lefoglalni). Ezért él a teljes
alap roster a `ctm-` névtérben, az egyedi agentek pedig a `tm-` névtérben: a `tm-ctm-be-medior`
(rövid neve `ctm-be-medior`) ütközik és elutasításra kerül, de egy sima `tm-be-medior` (rövid
neve `be-medior`, sehol nincs benne `ctm-`) egy MÁSIK identitás, mint a valódi `ctm-be-medior`
agent, és megengedett — válassz a `ctm-` névtéren kívüli rövid nevet, és nincs mivel ütköznie.

## Agentenkénti tool-allowlistek

Minden generált agent frontmatter `tools:` sorát az `engine/agent-tools.sh` oldja fel a
`templates/agent-tools.json`-ból (egy `default` plusz egy agentnév szerinti `agents` map;
minden érték vagy egy vesszővel elválasztott string, vagy egy JSON array). Egy projekt
felülírja ezt egy saját `.claude/agent-tools.json` elhelyezésével a célrepóban. Sorrend egy
adott agentnévre (az első találat nyer):

1. projekt felülírás — `.agents[<name>]` — ez az egy agent, ebben a projektben
2. projekt felülírás — `.default` — minden agent ebben a projektben
3. repo config — `.agents[<name>]` — ez az egy agent, mindenhol
4. repo config — `.default` — az alapvonal
5. beépített fallback (így egy törölt/hibás config sosem blokkol egy telepítést)

Figyeld meg a 2. és 3. sorrendjét: a **projekt configja teljesen legyőzi a repo configját**,
és az egyes hatókörökön belül a specifikus veri az alapértelmezettet. Ettől működik
valóban az, hogy "állítsuk be az összes agentet egyszerre, a projektből". A másik oldala
viszont fontos: egy projekt-szintű `.default` így a repo *agentenkénti* listáit is
felülírja — pl. a `ctm-playwright-tester` Playwright MCP tooljait. A
`ctm agent tools set <list>` figyelmeztet, ha ez történik.

### A kötelező mag

**A `Bash, Read, SendMessage` mindig jelen van, és nem távolítható el.** Minden feloldott
listába beleolvad, és a `ctm agent tools rm` megtagadja ezt a hármat. A `task.sh` csupasz
parancsként hívódik, így egy `Bash` nélküli agent nem tudna claimelni, note-olni vagy
review-zni — legenerálódna rendben, aztán egyáltalán nem tudna részt venni a
task-managerben.

### A listák olvasása és írása

```bash
ctm agent tools                       # a teljes roster hatályos listája
ctm agent tools show ctm-be-medior        # egy agent
ctm agent tools set ctm-be-junior Read,Edit,Bash    # egy agent listájának cseréje
ctm agent tools set Read,Edit,Bash              # név nélkül = projekt-szintű default (minden agent)
ctm agent tools add ctm-be-medior Glob,Grep         # bővítés
ctm agent tools rm  ctm-be-medior Grep              # szűkítés (a kötelező magot megtagadja)
ctm agent tools unset ctm-be-medior                 # a projekt-felülírás eldobása
```

Az írás-oldal a projekt `.claude/agent-tools.json`-ját szerkeszti.

**A toolok nem különböztetik meg a szinteket.** Mind a hat dev agent ugyanazon a
tool-listán osztozik; a szenioritást a modell és az agent-definícióba írt hatókör fejezi
ki, nem a képesség. Toolokkal amúgy sem lennének szétválaszthatók — a `task.sh` minden
agenttől megköveteli a `Bash`-t.

## Teammate-ek futtatása

**A nyolcas roster egy étlap, nem egy indítási lista.** Futtass **3-4 teammate-et
egyszerre — ne többet —, és folyamatosan etesd őket.** Az értelmes alapértelmezett mix a
`ctm-be-medior`, `ctm-fe-medior`, `ctm-investigator`, plusz egy negyedik, ahogy a munka megkívánja:
`ctm-playwright-tester`, ahol a környezet engedi, vagy egy junior vagy egy senior — nem
mindkettő. Ez a *párhuzamosságra* vonatkozó korlát, nem a teljes átbocsátásra: egy
teammate, amelyik befejez egy taskot, életben marad, és felveszi a következőt.

- **Soha ne futtasd ugyanannak a területnek két szintjét egyszerre**, hacsak a munka
  valóban ketté nem válik — pl. a senior tervez, míg a junior egy eldöntött listát darál.
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

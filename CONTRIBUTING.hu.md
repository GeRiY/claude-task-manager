# Közreműködés

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/CONTRIBUTING.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/CONTRIBUTING.hu.md)

Köszönjük, hogy közreműködést fontolgatsz. Ez egy kicsi, egyetlen karbantartós projekt — az
alábbi jegyzetek célja, hogy a változtatásokat könnyen áttekinthetővé tegyék, nem az, hogy
önmagáért való folyamatot adjanak hozzá.

## Nincs build-lépés

Nincs mit fordítani vagy bundle-ölni. A `bash`, `jq`, `php`, és (a board-hoz) a
`docker compose` pluginnal ellátott `docker` az egyetlen futásidejű függőség. Szerkessz egy
fájlt, majd próbáld ki közvetlenül.

## A board futtatása munka közben

```bash
ctm up            # első futtatáskor image-et épít, a 3333-as porton indul (lásd .env: CTM_PORT)
ctm down           # leállítás
```

A `ctm init` egy ideiglenes projektben a leggyorsabb módja, hogy megnézd az `install.sh`
kimenetét, vagy használd a `ctm wrapper <id>`-t, hogy kiírasd egy már regisztrált projekt
generált wrapperét.

## A tükrözött fájloknak tükrözve kell maradniuk

Ebben a repóban minden `X.md` / `X.hu.md` pár — a `README.md`/`README.hu.md`, a
`docs/ARCHITECTURE.md`/`docs/ARCHITECTURE.hu.md`, a `docs/COMMANDS.md`/`docs/COMMANDS.hu.md`,
a `docs/BOARD.md`/`docs/BOARD.hu.md`, a `docs/AGENTS.md`/`docs/AGENTS.hu.md`, a
`SECURITY.md`/`SECURITY.hu.md`, és ennek a fájlnak a saját
`CONTRIBUTING.md`/`CONTRIBUTING.hu.md` párja — a párja strukturális tükörképe: azonos
fejléc-sorrend, azonos szakaszok, azonos kódblokkok — csak a próza különbözik nyelvenként.
**Egy párban lévő fájl minden módosítását ugyanabban a commitban kell tükrözni a párjában.**
Ez szándékos: egy diffben áttekinthető tükör az egyetlen dolog, ami megakadályozza, hogy a
két nyelv csendben eltávolodjon egymástól, és ez a projekt már egyszer pontosan ebbe a
hibába futott bele — egy elavult agent-elnevezési konvenció (`ctm-*` az aktuális, előtag
nélküli nevek helyett) azonosan dokumentálva ült mindkét README-ben több release-en át,
mire bárki is észrevette, mert semmi sem kényszerített ki egy egymás melletti
összehasonlítást.

## Csak angol, kivéve a `.hu.md` fájlokat

A kód, a kommentek, a commit üzenetek, és minden más ebben a repóban **kizárólag angol**. A
kivételek bármely `*.hu.md` fájl (egy tükrözött dokumentum magyar párja — lásd fentebb) és a
`js/i18n.js`-ben lévő magyar stringek (a board kétnyelvű felülete). Ez szándékosan egy minta
formájában van megfogalmazva, nem konkrét fájlok listájaként: egy bővülő felsorolás elavul,
amint valaki hozzáad egy új tükrözött dokumentumot, egy a `.hu.md` kiterjesztésre épülő
szabály viszont nem. Ha egy `.hu.md` fájlt szerkesztesz, ügyelj az ékezetek helyességére —
az `ő`/`ű` könnyen elgépelhető `ö`/`ü`-ként, és fordítva.

## A `data/` helyi, élő állapot — sosem commitold

A `data/<id>/` tartalmazza a gépeden minden regisztrált projekt valódi
`tasks.json`/`context.json`/`events.jsonl` fájljait. Nem véletlenül van gitignore-olva:
telepítésenkénti állapot, nem projekt-forráskód. Sosem add hozzá egy commithoz, és sosem
szerkeszd kézzel — menj a `task.sh`-on keresztül tesztelés közben is.

## Pull request-ek

Tartsd fókuszáltnak a PR-eket, és írd le a *miértet*, ne csak a *mitet* — lásd a
`CHANGELOG.md` meglévő bejegyzéseit a projekt hangneméért. Ha a változtatásod felhasználó
felé néző viselkedést érint, adj hozzá egy `## [Unreleased]` bejegyzést a `CHANGELOG.md`-hez.

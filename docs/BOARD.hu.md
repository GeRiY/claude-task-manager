# A böngészős board

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.hu.md)

A board a megosztott, emberek számára készült nézet ugyanarra az adatra, amit a `task.sh`
ír — egyszerre egy projektet mutat, a fejléc **Source** selectorából kiválasztva. Minden
írása továbbra is az `api/index.php` → `task.sh` úton megy (lásd az
[egyetlen-író invariánst](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.hu.md#az-egyetlen-író-invariáns));
a böngésző sosem írja közvetlenül a `tasks.json`-t.

## Nézetmódok

A **View** vezérlő négy nézetet kínál:

- **Kanban** — az alapértelmezett: oszlopok státusz szerint (`todo` / `in_progress` /
  `blocked` / `review` / `done`), taskonként egy kártya. Az oszlopok státusz-színes felső
  szegéllyel és státuszikonnal olvashatók szín nélkül is, a darabszám-jelvény pedig magas
  WIP-nél figyelmeztet. Az oszlopok egyenként összecsukhatók.
- **Swimlane** — ugyanazok a státuszok, de a sorok a hozzárendelt agent szerint vannak
  csoportosítva, így egy pillantással látod minden teammate sorát.
- **Feed** — oszlopok helyett egy lapos, időrendben visszafelé haladó aktivitás-feed,
  hasznos annak megnézésére, "mi történt épp az imént."
- **Archívum** (`?view=archive`) — az archivált feladatokat mutatja fordított időrendben,
  amelyek egyébként lekerülnek a boardról. Két csoportosítás egy szegmentált kapcsolóval:
  **nap szerint** (`?agroup=day`, az alapértelmezett — minden nap-fejléc darabszámmal és
  arányos átbocsátás-mini-sávval, a legutóbbi napok kinyitva), és **modul szerint**
  (`?agroup=module`). Soronként: kész-pipa (vagy státusz-jelvény a nem kész archivált
  elemeknél), cím, agent-avatar, **átfutási idő** (cycle time) jelvény, és relatív lezárási
  idő. A `#stats` sáv ilyenkor archív metrikákra vált: összes archivált, lezárás/nap átlag,
  átfutás átlag, és a még nyitott feladatok száma.

A **Compact** kapcsoló önmagában nem egy külön layout, hanem egy sűrűség-kapcsoló, amely a
Kanban/Swimlane fölé rakódik: a kártyák kisebbek lesznek, kevesebb részlettel kártyánként,
így több fér ki a képernyőre a board-ból.

Az aktuális nézet (és a compact kapcsoló) megmarad `localStorage`-ban, és tükröződik az
URL-ben is, így egy board-link ugyanabban a layoutban nyílik újra meg.

## Parancspaletta (⌘K)

A keresés és a gyors navigáció fő eszköze a parancspaletta. Megnyitod **⌘K / Ctrl+K**-val,
a **`/`** billentyűvel (ha a fókusz nem beviteli mezőben van), vagy a fejléc **`⌘K`**
chipjére kattintva; az Escape bezárja. Egyetlen mező egyszerre végez **fuzzy keresést a
feladatokon** (cím, id, agent, modul, jegyzet-szöveg) **és** kínál egy **parancskatalógust**
(nézetváltás, kompakt mód, archívum-csoportosítás, HU/EN váltás, a poll szüneteltetése/
folytatása, frissítés, a Context/Projects megnyitása), plusz a projektek, agentek és modulok
élő listáját. Az eredmények Feladatok / Parancsok / Legutóbbi csoportokba rendeződnek; üres
mezőnél az utoljára megnyitott öt elem jelenik meg, egy `>` előtag pedig csak a parancsokra
szűkít. A **↑↓** mozgat, az **Enter** megnyitja a feladat modalját, a **⌘Enter** pedig a
boardon a kártyához görget és megvillantja azt.

## Szűrés

- **Module szűrő** — egy kereshető multi-select dropdown (gomb → popover kereső mezővel,
  modulonkénti checkboxokkal, és egy "Select all" kapcsolóval, amely tükrözi az aktuális
  keresést, és részleges kijelölésnél indeterminate állapotot mutat). Ha nincs kijelölés,
  az az összes modult jelenti; a kijelölés mélylinkelhető egy vesszővel elválasztott
  `?module=` query paraméterként, az agent szűrőt tükrözve.
- **Agent szűrő** — a boardot egy vagy több assignee-re szűkíti.
- **Keresés** — a szabadszöveges keresés a fejléc külön mezője helyett mostantól a ⌘K
  parancspalettán át megy (lásd fentebb); a paletta fuzzy keresést végez a feladatokon, és
  parancsként el is éred belőle a nézet- és szűrő-váltásokat. A további szűkítés a fenti
  board-vezérlőkből (modul, agent) történik.
- **Rendezés** (utolsó aktivitás / létrehozás / cím / team #) — mélylinkelhető
  (`?sort=`).

## A task modal

Egy kártyára kattintva megnyílik a task modalja, amely tartalmazza:

- Kulcs/érték fejléc (id, team, agent, module, channel, source, thread,
  létrehozva/frissítve/utolsó aktivitás).
- **Relations** — "Depends on" / "Blocks", státusz-pillelve és kattinthatóan, a
  kapcsolódó taskra ugorva.
- **Checklist** (`Checklist (done/total)`) — elemek kipipálása, visszavonása, hozzáadása
  és eltávolítása helyben; a böngésző szerkesztései ugyanúgy az `api/index.php` →
  `task.sh checklist` úton mennek, mint minden más.
- **Files** (`Files (n)`) — a `task.sh files add`-del rögzített abszolút útvonalak,
  megjelenítéshez lerövidítve a projekt-relatív útvonalra (a tárolt érték és a
  vágólapra-másolás célja a teljes abszolút útvonal marad — a rövidítés tisztán vizuális).
- **Notes** (`Notes (n)`) — minden note egy alapból összecsukott `<details>` accordion, a
  kind badge-ével, a szerzővel, és egy egysoros előnézettel; kinyitva a teljes szöveg
  látszik. A hosszú note-ok (némelyik több ezer karakterre rúg) már nem borítják fel
  alapból a teljes modalt.
- **History** (`History (n)`) — a tömör státusz-átmenet idővonal, minden bejegyzés `by`
  mezőjével és rögzített `files`-ával, ahol van ilyen.
- Az elsődleges akció-gombok (Approve / Changes needed / Block / Reopen / Starting / To
  review / Done) plusz egy szabadszöveges note mező, amelyek ugyanazokat a
  `review`/`status`/`note` parancsokat vezérlik, amelyeket a
  [COMMANDS.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/COMMANDS.hu.md)
  ír le. Minden státuszban elérhető egy **Archiválás** gomb (kész/review állapotban egy
  **Teendő** gomb is), amely a `task.sh archive` parancsot hívja. Egy archivált feladat
  modalja csak olvasható: az akciósor ekkor mindössze **Kiarchiválás** (unarchive) és
  **Újranyitás** (reopen).

## A projektválasztó

A fejléc **Source** selectora a `data/projects.json`-ban regisztrált projektek között vált
(azaz minden projekt, amelyen lefutott a `ctm init`). A "Copy for Claude Code" akciója egy
azonnal futtatható szkriptet másol a vágólapra (a shebang után egy Claude-Code-nak szóló
utasítás-kommenttel), amit egy coding agent elmenthet és felhasználhat, hogy közvetlenül
elérje és kezelje az adott projekt board-ját.

## Mélylinkek

A board teljes állapota az URL-ben él, így bármely nézet könyvjelezhető/megosztható:

```
?project=<id>&lang=<en|hu>&task=<id>&agent=<a1,a2>&module=<m1,m2>&sort=<activity|created|title|team>&view=<board|swim|feed|archive>&agroup=<day|module>&compact=1
```

Az `agroup=<day|module>` csak az `view=archive` nézetben érvényes, és az archívum
csoportosítását választja ki (nap szerint / modul szerint).

A `project` és a `lang` a két leggyakrabban megosztott: ezek egyetlen projekten, egyetlen
nyelven nyitják meg közvetlenül a boardot — pl. hogy egy konkrét nézetet átadj egy
magyarul beszélő teammate-nek anélkül, hogy neki magának kellene újraválasztania a
projektet vagy nyelvet váltania.

# A böngészős board

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/docs/BOARD.hu.md)

A board a megosztott, emberek számára készült nézet ugyanarra az adatra, amit a `task.sh`
ír — egyszerre egy projektet mutat, a fejléc **Source** selectorából kiválasztva. Minden
írása továbbra is az `api/index.php` → `task.sh` úton megy (lásd az
[egyetlen-író invariánst](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.hu.md#az-egyetlen-író-invariáns));
a böngésző sosem írja közvetlenül a `tasks.json`-t.

## Nézetmódok

A **View** vezérlő négy gombot kínál:

- **Kanban** — az alapértelmezett: oszlopok státusz szerint (`todo` / `in_progress` /
  `blocked` / `review` / `done`), taskonként egy kártya. Az oszlopok egyenként
  összecsukhatók.
- **Swimlane** — ugyanazok a státuszok, de a sorok a hozzárendelt agent szerint vannak
  csoportosítva, így egy pillantással látod minden teammate sorát.
- **Feed** — oszlopok helyett egy lapos, időrendben visszafelé haladó aktivitás-feed,
  hasznos annak megnézésére, "mi történt épp az imént."
- **Compact** — önmagában nem egy negyedik layout, hanem egy sűrűség-kapcsoló, amely a
  Kanban/Swimlane fölé rakódik: a kártyák kisebbek lesznek, kevesebb részlettel
  kártyánként, így több fér ki a képernyőre a board-ból.

Az aktuális nézet (és a compact kapcsoló) megmarad `localStorage`-ban, és tükröződik az
URL-ben is, így egy board-link ugyanabban a layoutban nyílik újra meg.

## Szűrés

- **Module szűrő** — egy kereshető multi-select dropdown (gomb → popover kereső mezővel,
  modulonkénti checkboxokkal, és egy "Select all" kapcsolóval, amely tükrözi az aktuális
  keresést, és részleges kijelölésnél indeterminate állapotot mutat). Ha nincs kijelölés,
  az az összes modult jelenti; a kijelölés mélylinkelhető egy vesszővel elválasztott
  `?module=` query paraméterként, az agent szűrőt tükrözve.
- **Agent szűrő** — a boardot egy vagy több assignee-re szűkíti.
- **Gyorsszűrők** — három egykattintásos kapcsoló a board fölött: **Awaiting you** (a
  `review`-ban lévő taskok), **Active** (`in_progress`), és **Blocked**. A `?quick=`-en
  keresztül mélylinkelhető.
- **Keresés** (`q`) és **rendezés** (utolsó aktivitás / létrehozás / cím / team #) —
  szintén mélylinkelhető (`?q=`, `?sort=`).

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
  ír le.

## A projektválasztó

A fejléc **Source** selectora a `data/projects.json`-ban regisztrált projektek között vált
(azaz minden projekt, amelyen lefutott a `ctm init`). A "Copy for Claude Code" akciója egy
azonnal futtatható szkriptet másol a vágólapra (a shebang után egy Claude-Code-nak szóló
utasítás-kommenttel), amit egy coding agent elmenthet és felhasználhat, hogy közvetlenül
elérje és kezelje az adott projekt board-ját.

## Mélylinkek

A board teljes állapota az URL-ben él, így bármely nézet könyvjelezhető/megosztható:

```
?project=<id>&lang=<en|hu>&task=<id>&agent=<a1,a2>&module=<m1,m2>&quick=<review|active|blocked>&q=<text>&sort=<activity|created|title|team>&view=<board|swim|feed>&compact=1
```

A `project` és a `lang` a két leggyakrabban megosztott: ezek egyetlen projekten, egyetlen
nyelven nyitják meg közvetlenül a boardot — pl. hogy egy konkrét nézetet átadj egy
magyarul beszélő teammate-nek anélkül, hogy neki magának kellene újraválasztania a
projektet vagy nyelvet váltania.

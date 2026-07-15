# Biztonsági szabályzat

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/SECURITY.md)
[![Magyar](https://img.shields.io/badge/lang-Magyar-2b7489?style=flat-square)](https://github.com/GeRiY/claude-task-manager/blob/main/SECURITY.hu.md)

## Sebezhetőség bejelentése

Ez egy egyetlen karbantartós projekt (repó tulajdonosa: **GeRiY**, npm scope
`@mgeri1993`). Ha biztonsági problémát találsz, kérjük, **e-mailben írj a karbantartónak**,
ahelyett hogy nyilvános issue-t nyitnál — használd a karbantartó GitHub profilján
található címet, vagy nyiss egy
[private security advisory](https://github.com/GeRiY/claude-task-manager/security/advisories/new)-t
a GitHubon. Adj meg elég részletet a reprodukáláshoz; néhány napon belül választ kapsz.

## Biztonsági helyzet

A `claude-task-manager` úgy lett tervezve, hogy egy fejlesztő saját gépén fusson, nem
pedig multi-tenant vagy internet felé néző szolgáltatásként. A releváns határok:

- **A board kizárólag a `127.0.0.1`-hez van kötve, sosem a `0.0.0.0`-hoz.** A
  `docker-compose.yml` a portot `127.0.0.1:<port>:<port>`-ként publikálja, így a konténer
  a LAN-ról elérhetetlen — csak magáról a hostról érhető el.
- **Az írás-endpoint (`api/index.php`) egy explicit parancs-allowlistet futtat.** Csak a
  `status`, `note`, `priority`, `module`, `tag`, `assign`, `dep`, `status-many`, `reopen`,
  `add`, és `checklist` érhető el a böngészőből; a destruktív parancsok (`rm`, `restore`,
  `raw`, `archive`) sosincsenek kiengedve neki, függetlenül attól, mit küld egy kliens.
- **A `project` id minden írás-kérésben validálva van** a `data/projects.json` regisztrált
  listája ellenében, mielőtt egy `TM_DIR` kiválasztására használnák — egy kliens sosem
  tudja az API-t egy tetszőleges lemezes könyvtárra irányítani.
- A `tasks.json`/`context.json` minden írása, akár a board-tól, akár egy agenttől érkezik,
  az egyetlen író `engine/task.sh`-on megy keresztül (atomikus lock, backup-írás előtt) —
  lásd [docs/ARCHITECTURE.hu.md](https://github.com/GeRiY/claude-task-manager/blob/main/docs/ARCHITECTURE.hu.md#az-egyetlen-író-invariáns).

Ha ezt egy helyi fejlesztői gépnél kitettebb helyre telepíted, a fentieket kiindulópontnak
tekintsd, nem végállomásnak — ez a projekt nincs megerősítve arra a használati esetre.

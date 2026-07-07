/**
 * ApiClient — a board ÍRÁS-kliense az api/index.php bridge felé.
 *
 * Az írás KIZÁRÓLAG a `POST api/index.php`-n át megy, ami a szerveren az engine/task.sh-t
 * hívja (`--as <actor>`, `TM_DIR=<projekt adat-könyvtára>`). A böngésző sosem írja
 * közvetlenül a JSON-t → megmarad a task.sh egyedüli-író invariánsa (atomikus lock,
 * history, events, inbox). Multi-project: minden kérés tartalmazza, MELYIK regisztrált
 * projektre vonatkozik (a szerver ezt a data/projects.json ellen allowlist-eli).
 */
export class ApiClient {
  /**
   * @param getActor  - () => string : a jelenlegi actor (agent-név) a --as-hoz
   * @param getProject - () => string : a jelenleg kiválasztott projekt id-je
   */
  constructor(getActor, getProject) {
    this.getActor = getActor;
    this.getProject = getProject;
    this.enabled = location.protocol === "http:" || location.protocol === "https:";
  }

  /** Egy task.sh parancs. args: string[]. Hibán dob (a hívó jelzi a bannerben). */
  cmd(cmd, args = []) {
    return this.run([{ cmd, args }]);
  }

  /**
   * Több task.sh parancs EGY kérésben, sorban (pl. „változtatás kell" = note + status).
   * Az első hibás lépésnél a szerver megáll → nincs félkész átmenet.
   * @param ops - [{ cmd, args }]
   */
  async run(ops) {
    if (!this.enabled)
      throw new Error("Az írás a PHP szervert igényli (docker compose / php -S). file://-ról nem elérhető.");
    const as = (this.getActor() || "").trim();
    if (!as)
      throw new Error('Állíts be egy nevet a fejlécben („Mint …"), hogy kinek a nevében írjon a board.');
    const project = (this.getProject() || "").trim();
    if (!project)
      throw new Error("Nincs kiválasztva projekt — válassz egyet a Forrás mezőben.");

    // Relatív út: az index.html a projekt gyökerén van, így ez api/index.php-re oldódik
    // fel (port/host-független).
    const res = await fetch("api/index.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ as, project, ops }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* nem-JSON válasz */ }
    if (!res.ok || !data.ok) {
      const first = Array.isArray(data.results) ? data.results.find(r => !r.ok) : null;
      throw new Error((first && (first.err || first.cmd)) || data.error || ("HTTP " + res.status));
    }
    return data;
  }
}

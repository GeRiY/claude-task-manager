import { I18n } from "./i18n.js";

/**
 * ApiClient — the board's WRITE client toward the api/index.php bridge.
 *
 * Writes go EXCLUSIVELY through `POST api/index.php`, which calls engine/task.sh on the
 * server (`--as <actor>`, `TM_DIR=<project data dir>`). The browser never writes the JSON
 * directly → task.sh's sole-writer invariant is preserved (atomic lock, history, events,
 * inbox). Multi-project: every request states WHICH registered project it targets (the
 * server allowlists this against data/projects.json).
 *
 * Every write also carries the board's current UI language (`lang`). The server persists
 * it as the project's preferred language (NOT inside any task) — engine/task.sh then prints
 * a language reminder whenever an agent next runs it, so the agent replies/works in the
 * language the human was using on the board.
 */
export class ApiClient {
  /**
   * @param getActor  - () => string : the current actor (agent name) for --as
   * @param getProject - () => string : the currently selected project id
   */
  constructor(getActor, getProject) {
    this.getActor = getActor;
    this.getProject = getProject;
    this.enabled = location.protocol === "http:" || location.protocol === "https:";
  }

  /** One task.sh command. args: string[]. Throws on error (the caller shows it in the banner). */
  cmd(cmd, args = []) {
    return this.run([{ cmd, args }]);
  }

  /**
   * Multiple task.sh commands in ONE request, in order (e.g. "changes needed" = note + status).
   * The server stops at the first failing step → no half-applied transition.
   * @param ops - [{ cmd, args }]
   */
  async run(ops) {
    if (!this.enabled)
      throw new Error(I18n.t("app.notEnabled"));
    // Ha nincs kitöltve a "Mint" mező, alapértelmezetten "human" nevében írunk —
    // így a felület nem esik el a task.sh --as miatt (pl. első jóváhagyáskor).
    const as = (this.getActor() || "").trim() || "human";
    const project = (this.getProject() || "").trim();
    if (!project)
      throw new Error(I18n.t("app.noProjectSelected"));

    // Relative path: index.html lives at the project root, so this resolves to
    // api/index.php (port/host-independent).
    const res = await fetch("api/index.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ as, project, lang: I18n.lang, ops }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok || !data.ok) {
      const first = Array.isArray(data.results) ? data.results.find(r => !r.ok) : null;
      throw new Error((first && (first.err || first.cmd)) || data.error || ("HTTP " + res.status));
    }
    return data;
  }
}

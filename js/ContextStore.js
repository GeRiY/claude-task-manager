/**
 * Polls context.json (conditional GET, Last-Modified based) — the source of the user
 * session context (goal, focus, decisions, open questions).
 * context.json lives alongside tasks.json (derived by ctxUrl()).
 */
export class ContextStore {
  constructor(getSrcUrl) {
    this.getSrcUrl = getSrcUrl; // () => string – the tasks.json source URL (input#src value)
    this.lastModified = null;
    this.context = null;
  }

  reset() {
    this.lastModified = null;
    this.context = null;
  }

  ctxUrl() {
    const s = this.getSrcUrl().trim();
    if (/tasks\.json(\?.*)?$/.test(s)) return s.replace(/tasks\.json(\?.*)?$/, "context.json");
    return s.replace(/[^\/?#]*([?#].*)?$/, "context.json");
  }

  /** The context is optional – silently swallows errors/404. Returns { changed }. */
  async poll() {
    try {
      const headers = {}; if (this.lastModified) headers["If-Modified-Since"] = this.lastModified;
      const res = await fetch(this.ctxUrl(), { cache: "no-store", headers });
      if (res.status === 304) return { changed: false };
      if (res.status === 404) { this.context = null; return { changed: true }; }
      if (!res.ok) return { changed: false };
      this.lastModified = res.headers.get("Last-Modified") || this.lastModified;
      this.context = JSON.parse(await res.text());
      return { changed: true };
    } catch (e) {
      return { changed: false };
    }
  }
}

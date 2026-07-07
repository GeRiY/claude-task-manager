/**
 * context.json pollozás (feltételes GET, Last-Modified alapon) — a felhasználói
 * session-kontextus (cél, fókusz, döntések, nyitott kérdések) forrása.
 * A context.json a tasks.json melletti útvonalon van (ctxUrl() vezeti le).
 */
export class ContextStore {
  constructor(getSrcUrl) {
    this.getSrcUrl = getSrcUrl; // () => string – a tasks.json forrás URL-je (input#src értéke)
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

  /** A context opcionális – hibán/404-en csendben elnyeli. Visszaadja: { changed }. */
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

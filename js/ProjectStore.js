/**
 * ProjectStore — a one-shot load and cache of data/projects.json (registered projects).
 * Registration itself happens on the host, via `engine/projects.sh add`; the board only
 * DISPLAYS the already-registered projects (Source selector + wrapper copying).
 */
export class ProjectStore {
  constructor() {
    this.projects = [];
  }

  /** Loads data/projects.json. Returns an empty list on error/absence (the board reports this). */
  async load() {
    try {
      const res = await fetch("data/projects.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      this.projects = Array.isArray(data) ? data : [];
    } catch (e) {
      this.projects = [];
    }
    return this.projects;
  }

  get(id) {
    return this.projects.find(p => p.id === id) || null;
  }
}

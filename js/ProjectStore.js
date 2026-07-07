/**
 * ProjectStore — a data/projects.json (regisztrált projektek) egyszeri betöltése és
 * cache-elése. A regisztráció maga a host gépen, `engine/projects.sh add`-dal történik;
 * a board csak MEGJELENÍTI a már regisztrált projekteket (Forrás-választó + wrapper-másolás).
 */
export class ProjectStore {
  constructor() {
    this.projects = [];
  }

  /** Betölti a data/projects.json-t. Hibán/hiányon üres listát ad (a board ezt jelzi). */
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

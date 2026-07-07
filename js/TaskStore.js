import { Utils } from "./Utils.js";

/**
 * tasks.json pollozás feltételes GET-tel (ETag / Last-Modified),
 * és a két poll közti diff-számítás (állapotváltozás / +jegyzet / +history / frissült / új).
 */
export class TaskStore {
  constructor(getUrl) {
    this.getUrl = getUrl;           // () => string – a jelenlegi forrás URL-je
    this.etag = null;
    this.lastModified = null;
    this.currentTasks = [];
    this.prevTasksById = new Map(); // előző poll teljes taszkjai (diffhez)
    this.changeInfo = new Map();    // id -> {status,notes,history,updated,isNew}
    this.renderedOnce = false;
  }

  reset() {
    this.etag = null;
    this.lastModified = null;
    this.prevTasksById = new Map();
    this.currentTasks = [];
    this.renderedOnce = false;
    this.changeInfo = new Map();
  }

  static diff(prev, cur) {
    if (!prev) return { isNew: true };
    const ch = {};
    if (prev.status !== cur.status) ch.status = `${prev.status}→${cur.status}`;
    if (Utils.norm(prev.notes).length !== Utils.norm(cur.notes).length) ch.notes = true;
    if ((prev.history || []).length !== (cur.history || []).length) ch.history = true;
    if (prev.updatedAt !== cur.updatedAt) ch.updated = true;
    return Object.keys(ch).length ? ch : null;
  }

  /** Egy poll ciklus. Visszaadja: { notModified } vagy { tasks, shouldRender, changeCount }. Hibán dob. */
  async poll() {
    const url = this.getUrl();
    const headers = {};
    if (this.etag) headers["If-None-Match"] = this.etag;
    if (this.lastModified) headers["If-Modified-Since"] = this.lastModified;

    const res = await fetch(url, { cache: "no-store", headers });
    if (res.status === 304) return { notModified: true };
    if (!res.ok) throw new Error("HTTP " + res.status);

    this.etag = res.headers.get("ETag") || this.etag;
    this.lastModified = res.headers.get("Last-Modified") || this.lastModified;

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error("Érvénytelen JSON a fájlban"); }

    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    this.changeInfo = new Map();
    if (this.prevTasksById.size) {
      tasks.forEach(t => {
        const c = TaskStore.diff(this.prevTasksById.get(t.id), t);
        if (c) this.changeInfo.set(t.id, c);
      });
    }
    const countChanged = tasks.length !== this.currentTasks.length;
    this.currentTasks = tasks;
    this.prevTasksById = new Map(tasks.map(t => [t.id, JSON.parse(JSON.stringify(t))]));

    const shouldRender = !this.renderedOnce || this.changeInfo.size > 0 || countChanged;
    return { notModified: false, tasks, shouldRender, changeCount: this.changeInfo.size };
  }

  markRendered() { this.renderedOnce = true; }
}

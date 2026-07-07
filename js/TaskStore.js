import { Utils } from "./Utils.js";

/**
 * Polls tasks.json with conditional GET (ETag / Last-Modified), and computes the diff
 * between two polls (status change / +note / +history / updated / new).
 */
export class TaskStore {
  constructor(getUrl) {
    this.getUrl = getUrl;           // () => string – the current source URL
    this.etag = null;
    this.lastModified = null;
    this.currentTasks = [];
    this.prevTasksById = new Map(); // full tasks from the previous poll (for diffing)
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

  /** One poll cycle. Returns { notModified } or { tasks, shouldRender, changeCount }. Throws on error. */
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
    try { data = JSON.parse(text); } catch (e) { throw new Error("Invalid JSON in the file"); }

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

  /** Marks that at least one render has happened, so subsequent diffs are computed against it. */
  markRendered() { this.renderedOnce = true; }
}

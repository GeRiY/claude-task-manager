import { UrlState } from "./UrlState.js";
import { TaskStore } from "./TaskStore.js";
import { ContextStore } from "./ContextStore.js";
import { ProjectStore } from "./ProjectStore.js";
import { BoardView } from "./BoardView.js";
import { TaskModal } from "./TaskModal.js";
import { ContextPanel } from "./ContextPanel.js";
import { ApiClient } from "./ApiClient.js";
import { Utils } from "./Utils.js";
import { ICONS } from "./Utils.js";
import { I18n } from "./i18n.js";

const el = id => document.getElementById(id);

/**
 * Main application controller: state, events, the polling loop, and wiring together the
 * view/store classes. Multi-project: the Source selector switches between the projects
 * registered in data/projects.json (see applyProject). Bilingual: English by default,
 * switchable to Hungarian at runtime (see toggleLang / applyStaticI18n).
 */
export class App {
  constructor() {
    this.dom = {
      board: el("board"), stats: el("stats"), agents: el("agents"),
      src: el("src"), q: el("q"), interval: el("interval"),
      toggle: el("toggle"), refresh: el("refresh"), sort: el("sort"),
      viewBoard: el("viewBoard"), viewSwim: el("viewSwim"), viewFeed: el("viewFeed"), compact: el("compact"),
      qfReview: el("qfReview"), qfActive: el("qfActive"), qfBlocked: el("qfBlocked"), notifyBtn: el("notifyBtn"),
      moduleFilter: el("moduleFilter"),
      dot: el("dot"), statusText: el("statusText"), clock: el("clock"), banner: el("banner"),
      overlay: el("overlay"), mTitle: el("mTitle"), mBody: el("mBody"), mClose: el("mClose"),
      ctxBtn: el("ctxBtn"), ctxOverlay: el("ctxOverlay"), ctxClose: el("ctxClose"), ctxBody: el("ctxBody"), ctxUpdated: el("ctxUpdated"),
      actor: el("actor"), actorList: el("actorList"),
      srcProject: el("srcProject"),
      agentsWrap: el("agentsWrap"), agentsHead: el("agentsHead"), agentsCount: el("agentsCount"),
      projectsBtn: el("projectsBtn"), projectsOverlay: el("projectsOverlay"), projectsClose: el("projectsClose"), projectsBody: el("projectsBody"),
      langBtn: el("langBtn"),
    };

    // ---- State ----
    this.timer = null;
    this.running = true;
    this.sort = "activity";
    this.view = "board";
    this.compact = false;
    this.agentFilter = null;        // null = all; Set = agents to show
    this.moduleFilter = null;       // null = all modules; string = one module
    this.quickFilter = null;        // null | "review" | "active" | "blocked" (#5)
    this.collapsedCols = new Set();
    this.openTaskId = null;
    this.pendingTask = null;
    this.notify = false;            // #3 browser notification on status change
    this.relTimer = null;           // #6 live relative-time ticker
    this.clockTimer = null;         // header's live clock (the mockup's "clock" pill)
    this.agentsOpen = localStorage.getItem("tm.agentsOpen") !== "0";   // agent-load bar open/closed
    this.project = localStorage.getItem("tm.project") || "";          // currently selected project id

    this.projectStore = new ProjectStore();
    this.taskStore = new TaskStore(() => this.dom.src.value.trim());
    this.contextStore = new ContextStore(() => this.dom.src.value);
    this.api = new ApiClient(() => this.dom.actor.value, () => this.project);   // write bridge (api/index.php)
    this.boardView = new BoardView({ board: this.dom.board, stats: this.dom.stats, agents: this.dom.agents, agentsCount: this.dom.agentsCount });
    this.taskModal = new TaskModal({ overlay: this.dom.overlay, mTitle: this.dom.mTitle, mBody: this.dom.mBody, mClose: this.dom.mClose });
    this.contextPanel = new ContextPanel({ ctxBtn: this.dom.ctxBtn, ctxOverlay: this.dom.ctxOverlay, ctxClose: this.dom.ctxClose, ctxBody: this.dom.ctxBody, ctxUpdated: this.dom.ctxUpdated });
  }

  // ---- URL / localStorage sync ----
  readState() {
    const s = UrlState.read();
    this.dom.q.value = s.q;
    this.sort = s.sort;
    this.view = s.view;
    this.compact = s.compact;
    this.agentFilter = s.agentFilter;
    this.moduleFilter = s.moduleFilter;
    this.quickFilter = s.quickFilter;
    this.pendingTask = s.pendingTask;
    this.collapsedCols = s.collapsedCols;
    if (s.interval) this.dom.interval.value = s.interval;
    this.dom.actor.value = localStorage.getItem("tm.actor") || "";
    this.dom.sort.value = this.sort;
    this.setViewButtons();
    this.setQuickButtons();
    this.dom.compact.classList.toggle("on", this.compact);
    this.setAgentsOpen(this.agentsOpen);
  }

  syncURL() {
    UrlState.sync({
      q: this.dom.q.value, agentFilter: this.agentFilter, moduleFilter: this.moduleFilter, quickFilter: this.quickFilter, sort: this.sort,
      view: this.view, compact: this.compact, openTaskId: this.openTaskId, project: this.project, lang: I18n.lang,
    });
  }

  setStatus(state, text) {
    this.dom.dot.className = "dot" + (state ? " " + state : "");
    this.dom.dot.classList.remove("pulse"); void this.dom.dot.offsetWidth; this.dom.dot.classList.add("pulse");
    this.dom.statusText.textContent = text;
  }
  showBanner(msg) {
    if (!msg) { this.dom.banner.classList.remove("show"); return; }
    this.dom.banner.innerHTML = msg;
    this.dom.banner.classList.add("show");
  }
  setViewButtons() {
    this.dom.viewBoard.classList.toggle("on", this.view === "board");
    this.dom.viewSwim.classList.toggle("on", this.view === "swim");
    this.dom.viewFeed.classList.toggle("on", this.view === "feed");
  }
  setQuickButtons() {
    this.dom.qfReview.classList.toggle("on", this.quickFilter === "review");
    this.dom.qfActive.classList.toggle("on", this.quickFilter === "active");
    this.dom.qfBlocked.classList.toggle("on", this.quickFilter === "blocked");
  }
  toggleQuick(v) {
    this.quickFilter = this.quickFilter === v ? null : v;
    this.setQuickButtons(); this.render(); this.syncURL();
  }

  // ---- Agent-load bar collapse/expand (the mockup's collapsible header) ----
  setAgentsOpen(open) {
    this.agentsOpen = open;
    this.dom.agentsWrap.classList.toggle("open", open);
    this.dom.agentsHead.setAttribute("aria-expanded", String(open));
    localStorage.setItem("tm.agentsOpen", open ? "1" : "0");
  }

  // ---- "Source" select: a real project switcher across the projects registered in
  // data/projects.json (see populateProjectSelect / applyProject). ----

  // Populates <select id="srcProject"> with the loaded projects, and applies the initial
  // selection (URL ?project=, then localStorage tm.project, then the first available one).
  populateProjectSelect() {
    const projects = this.projectStore.projects;
    this.dom.srcProject.innerHTML = projects
      .map(p => `<option value="${Utils.esc(p.id)}">${Utils.esc(p.label)}</option>`)
      .join("");
    if (!projects.length) return;
    if (!projects.some(p => p.id === this.project)) this.project = projects[0].id;
    this.dom.srcProject.value = this.project;
    this.applyProject(this.project, { silent: true });
  }

  // Project switch: sets the src (tasks.json) URL, saves it to localStorage + the URL
  // (?project=), and (unless silent) immediately re-polls the new source.
  applyProject(id, { silent = false } = {}) {
    this.project = id;
    localStorage.setItem("tm.project", id);
    this.dom.src.value = `data/${id}/tasks.json`;
    UrlState.setSrc(this.dom.src.value);
    this.syncURL();
    if (!silent) { this.resetSource(); this.poll(); }
  }

  // ---- Header's live clock (decorative, matches the mockup's ticking clock) ----
  tickClock() { this.dom.clock.textContent = new Date().toLocaleTimeString(I18n.locale()); }

  // ---- Language toggle (EN default, HU alternative) ----
  toggleLang() {
    I18n.setLang(I18n.lang === "hu" ? "en" : "hu");
    this.applyStaticI18n();
    this.tickClock();
    this.render();
    this.syncURL();
    if (this.openTaskId) this.openModal(this.openTaskId);
    if (this.dom.ctxOverlay.classList.contains("show")) this.contextPanel.renderBody(this.contextStore.context);
    if (this.dom.projectsOverlay.classList.contains("show")) this.openProjects();
  }

  // Applies the current language to static markup: elements with data-i18n get their
  // textContent set, data-i18n-placeholder their placeholder, data-i18n-title their title.
  applyStaticI18n() {
    document.documentElement.lang = I18n.lang;
    if (this.dom.langBtn) this.dom.langBtn.textContent = I18n.lang === "hu" ? "EN" : "HU";
    document.querySelectorAll("[data-i18n]").forEach(e => { e.textContent = I18n.t(e.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(e => { e.placeholder = I18n.t(e.dataset.i18nPlaceholder); });
    document.querySelectorAll("[data-i18n-title]").forEach(e => { e.title = I18n.t(e.dataset.i18nTitle); });
    this.dom.toggle.querySelector(".btxt").textContent = I18n.t(this.running ? "hd.pause" : "hd.resume");
  }

  render() {
    this.boardView.render(this.taskStore.currentTasks, {
      q: this.dom.q.value, agentFilter: this.agentFilter, moduleFilter: this.moduleFilter, quickFilter: this.quickFilter, sort: this.sort,
      view: this.view, compact: this.compact, collapsedCols: this.collapsedCols,
      changeInfo: this.taskStore.changeInfo,
    });
    this.syncActorList();
    this.syncModuleFilterOptions();
    this.tickRelTimes();
  }

  // #6 Live relative time: instead of a full re-render, only updates the .js-rel / .js-wait span text.
  tickRelTimes() {
    document.querySelectorAll(".js-rel[data-ts]").forEach(e => { e.textContent = Utils.relTime(e.dataset.ts); });
    document.querySelectorAll(".js-wait[data-ts]").forEach(e => {
      e.textContent = "⏳ " + Utils.relTime(e.dataset.ts);
      e.className = "badge await await-" + Utils.waitLevel(Utils.ageMs(e.dataset.ts)) + " js-wait";
    });
  }

  // Known agent names from the current tasks (for the actor- and assignment-datalist).
  agentsList() {
    const set = new Set();
    this.taskStore.currentTasks.forEach(t => { if (t.assignedAgentId) set.add(t.assignedAgentId); });
    return [...set].sort();
  }

  // Known module names from the current tasks (for the module filter + assignment-datalist).
  modulesList() {
    const set = new Set();
    this.taskStore.currentTasks.forEach(t => { if (t.module) set.add(t.module); });
    return [...set].sort();
  }

  // Populates the header's "As …" datalist with known agents (+ a couple of base roles).
  syncActorList() {
    if (!this.dom.actorList) return;
    const extra = ["reviewer", "main"];
    const all = [...new Set([...this.agentsList(), ...extra])];
    this.dom.actorList.innerHTML = all.map(a => `<option value="${Utils.esc(a)}"></option>`).join("");
  }

  // Populates the <select id="moduleFilter"> with known modules, preserving the current selection.
  syncModuleFilterOptions() {
    if (!this.dom.moduleFilter) return;
    const modules = this.modulesList();
    const cur = this.moduleFilter || "";
    this.dom.moduleFilter.innerHTML =
      `<option value="">${Utils.esc(I18n.t("ctrl.module.all"))}</option>` +
      modules.map(m => `<option value="${Utils.esc(m)}"${m === cur ? " selected" : ""}>${Utils.esc(m)}</option>`).join("");
    this.dom.moduleFilter.value = cur;
  }

  // ---- Modal ----
  openModal(id) {
    const t = this.taskStore.currentTasks.find(x => x.id === id); if (!t) return;
    this.openTaskId = id; this.syncURL();
    this.taskModal.render(t, this.boardView.teamIndex, this.taskStore.currentTasks, {
      writeEnabled: this.api.enabled, agents: this.agentsList(), modules: this.modulesList(),
    });
    this.taskModal.show();
  }
  closeModal() {
    this.taskModal.hide();
    this.openTaskId = null; this.syncURL();
  }
  openByTeam(n) {
    const t = this.boardView.teamIndex.get(n);
    if (t) this.openModal(t.id);
  }

  // ---- Writing through the api/index.php bridge (task.sh), then an immediate re-poll ----
  async runOps(ops, okMsg) {
    try {
      this.setStatus("", I18n.t("app.sending"));
      await this.api.run(ops);
      await this.poll();                       // for the canonical state (task.sh is the source of truth)
      if (this.openTaskId) this.openModal(this.openTaskId);  // modal re-renders with fresh data
      this.setStatus("ok", okMsg || I18n.t("app.done", { t: new Date().toLocaleTimeString(I18n.locale()) }));
      this.showBanner(null);
    } catch (e) {
      this.setStatus("err", I18n.t("app.writeError"));
      this.showBanner(I18n.t("app.writeFailed", { msg: Utils.esc(e.message) }));
    }
  }

  // Primary action button in the modal (review approve/changes/block, status, note).
  applyAction(act) {
    const id = this.openTaskId; if (!id) return;
    const noteEl = this.dom.mBody.querySelector("#actNote");
    const note = noteEl ? noteEl.value.trim() : "";
    switch (act) {
      case "approve": return this.runOps([{ cmd: "status", args: [id, "done"] }], I18n.t("app.approved"));
      case "done":    return this.runOps([{ cmd: "status", args: [id, "done"] }], I18n.t("app.toDone"));
      case "start":   return this.runOps([{ cmd: "status", args: [id, "in_progress"] }], I18n.t("app.toInProgress"));
      case "review":  return this.runOps([{ cmd: "status", args: [id, "review"] }], I18n.t("app.toReview"));
      case "reopen":  return this.runOps([{ cmd: "reopen", args: [id] }], I18n.t("app.reopened"));
      case "changes":
        if (!note) { this.showBanner(I18n.t("app.needFeedback")); return; }
        // note → in_progress: the feedback goes into the affected agent's inbox (events.jsonl).
        // (The current UI language is sent separately with every write — see ApiClient — and
        // surfaced to the agent when it next runs task.sh, not stored in the note text itself.)
        return this.runOps([
          { cmd: "note", args: [id, "REVIEW: " + note] },
          { cmd: "status", args: [id, "in_progress"] },
        ], I18n.t("app.changesRequested"));
      case "block":
        return this.runOps(
          note ? [{ cmd: "note", args: [id, "BLOCK: " + note] }, { cmd: "status", args: [id, "blocked"] }]
               : [{ cmd: "status", args: [id, "blocked"] }],
          I18n.t("app.toBlocked"));
      case "note":
        if (!note) { this.showBanner(I18n.t("app.needNoteText")); return; }
        return this.runOps([{ cmd: "note", args: [id, note] }], I18n.t("app.noteAdded"));
    }
  }

  // Inline field edit in the modal (priority / module / assignment).
  applyField(field, value) {
    const id = this.openTaskId; if (!id) return;
    const v = (value || "").trim();
    if (field === "priority") return this.runOps([{ cmd: "priority", args: [id, v] }], I18n.t("app.priority", { v }));
    if (field === "module") return this.runOps([{ cmd: "module", args: [id, v] }], I18n.t("app.module", { v: v || "—" }));
    if (field === "assign") {
      if (!v) return;
      return this.runOps([{ cmd: "assign", args: [id, v] }], I18n.t("app.assigned", { v }));
    }
  }

  // ---- Copy to clipboard (with feedback; file:// fallback) ----
  async copyToClipboard(text, btn) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text); ok = true;
      }
    } catch { /* fallback below */ }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = ok ? I18n.t("app.copied") : I18n.t("app.copyFailed");
      btn.classList.toggle("copied", ok);
      clearTimeout(btn._copyTimer);
      btn._copyTimer = setTimeout(() => {
        btn.textContent = orig; btn.classList.remove("copied");
      }, 1400);
    }
    return ok;
  }

  // ---- Projects modal (registered projects + wrapper task.sh copying) ----
  openProjects() {
    const projects = this.projectStore.projects;
    this.dom.projectsBody.innerHTML = projects.length
      ? projects.map(p => `
        <div class="proj-row">
          <div class="proj-row-main">
            <div class="proj-row-label">${Utils.esc(p.label)}</div>
            <div class="proj-row-id mut">${Utils.esc(p.id)} · ${Utils.esc(p.dataDir)}</div>
          </div>
          <button type="button" class="copy-wrapper" data-project="${Utils.esc(p.id)}">${Utils.esc(I18n.t("project.wrapperCopy"))}</button>
        </div>`).join("")
      : `<p class="mut">${I18n.t("project.none")}</p>`;
    this.dom.projectsOverlay.classList.add("show");
  }
  closeProjects() { this.dom.projectsOverlay.classList.remove("show"); }
  async copyWrapper(id, btn) {
    try {
      const res = await fetch(`wrappers/${id}.sh`, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      await this.copyToClipboard(text, btn);
    } catch (e) {
      this.showBanner(I18n.t("app.wrapperLoadFailed", { msg: Utils.esc(e.message) }));
    }
  }

  // ---- User context (session continuity) ----
  async pollContext() {
    const { changed } = await this.contextStore.poll();
    if (!changed) return;
    this.contextPanel.renderButton(this.contextStore.context);
    if (this.dom.ctxOverlay.classList.contains("show")) this.contextPanel.renderBody(this.contextStore.context);
  }
  openCtx() { this.contextPanel.renderBody(this.contextStore.context); this.contextPanel.show(); }
  closeCtx() { this.contextPanel.hide(); }

  // ---- #3 Browser notification + title badge ----
  async toggleNotify() {
    if (!this.notify) {
      if (!("Notification" in window)) { this.setStatus("err", "Notifications are not supported by this browser"); return; }
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") { this.setStatus("err", "Notifications are disabled in the browser"); return; }
      this.notify = true;
    } else {
      this.notify = false;
    }
    this.dom.notifyBtn.innerHTML = ICONS.bell;
    this.dom.notifyBtn.classList.toggle("on", this.notify);
  }
  handleNotifications(tasks) {
    if (!this.notify || !("Notification" in window) || Notification.permission !== "granted") return;
    const ci = this.taskStore.changeInfo;   // only has transitions from the 2nd poll on (empty on first load)
    tasks.forEach(t => {
      const c = ci.get(t.id);
      if (!c || !c.status) return;
      const to = String(c.status).split("→")[1];
      if (to !== "review" && to !== "done") return;
      new Notification(`Task ${to === "review" ? "awaiting review" : "done"}: ${t.title || t.id}`, {
        body: (t.assignedAgentId ? "👤 " + t.assignedAgentId + " · " : "") + c.status,
        tag: "tm-" + t.id,
      });
    });
  }
  updateTitle(tasks) {
    const review = tasks.filter(t => !t.isArchived && t.status === "review").length;
    document.title = (review ? I18n.t("app.title.review", { n: review }) + " " : "") + I18n.t("app.title");
  }

  // ---- Polling (conditional GET) ----
  async poll() {
    if (!this.project) return;
    this.pollContext();   // the user context is fetched independently, in parallel
    try {
      const result = await this.taskStore.poll();
      if (result.notModified) {
        this.setStatus("ok", I18n.t("app.noChange", { t: new Date().toLocaleTimeString(I18n.locale()) }));
        return;
      }
      this.showBanner(null);

      this.handleNotifications(result.tasks);   // #3 notification for new review/done transitions
      this.updateTitle(result.tasks);           // #3 title badge for tasks awaiting review
      if (result.shouldRender) { this.render(); this.taskStore.markRendered(); }
      if (this.pendingTask) { this.openModal(this.pendingTask); this.pendingTask = null; }

      const n = result.tasks.length;
      this.setStatus("ok", I18n.t("app.live", { n, s: n === 1 ? "" : "s", t: new Date().toLocaleTimeString(I18n.locale()) }) + (result.changeCount ? I18n.t("app.liveChanged", { n: result.changeCount }) : ""));
    } catch (err) {
      this.setStatus("err", "error: " + err.message);
      if (String(err.message).includes("Failed to fetch") || err instanceof TypeError)
        this.showBanner(I18n.t("app.fetchFailed"));
    }
  }

  schedule() {
    if (this.timer) clearInterval(this.timer);
    if (this.running && !document.hidden) this.timer = setInterval(() => this.poll(), parseInt(this.dom.interval.value, 10) || 2000);
  }
  resetSource() {
    this.taskStore.reset();
    this.contextStore.reset();
  }

  // ---- Events ----
  bindEvents() {
    const dom = this.dom;

    dom.toggle.addEventListener("click", () => {
      this.running = !this.running; dom.toggle.innerHTML = (this.running ? ICONS.pause : ICONS.play) + ` <span class="btxt">${I18n.t(this.running ? "hd.pause" : "hd.resume")}</span>`;
      if (this.running) { this.poll(); this.schedule(); } else { clearInterval(this.timer); this.timer = null; this.setStatus("idle", I18n.t("app.paused")); }
    });
    dom.refresh.addEventListener("click", () => this.poll());
    dom.q.addEventListener("input", () => { this.render(); this.syncURL(); });
    dom.srcProject.addEventListener("change", () => this.applyProject(dom.srcProject.value));
    dom.agentsHead.addEventListener("click", () => this.setAgentsOpen(!this.agentsOpen));
    dom.interval.addEventListener("change", () => { UrlState.setInterval(dom.interval.value); this.schedule(); });
    dom.sort.addEventListener("change", () => { this.sort = dom.sort.value; UrlState.setSort(this.sort); this.render(); this.syncURL(); });
    dom.viewBoard.addEventListener("click", () => { this.view = "board"; UrlState.setView(this.view); this.setViewButtons(); this.render(); this.syncURL(); });
    dom.viewSwim.addEventListener("click", () => { this.view = "swim"; UrlState.setView(this.view); this.setViewButtons(); this.render(); this.syncURL(); });
    dom.viewFeed.addEventListener("click", () => { this.view = "feed"; UrlState.setView(this.view); this.setViewButtons(); this.render(); this.syncURL(); });
    dom.compact.addEventListener("click", () => { this.compact = !this.compact; UrlState.setCompact(this.compact); dom.compact.classList.toggle("on", this.compact); this.render(); this.syncURL(); });
    dom.qfReview.addEventListener("click", () => this.toggleQuick("review"));
    dom.qfActive.addEventListener("click", () => this.toggleQuick("active"));
    dom.qfBlocked.addEventListener("click", () => this.toggleQuick("blocked"));
    dom.moduleFilter.addEventListener("change", () => { this.moduleFilter = dom.moduleFilter.value || null; this.render(); this.syncURL(); });
    dom.notifyBtn.addEventListener("click", () => this.toggleNotify());
    dom.projectsBtn.addEventListener("click", () => this.openProjects());
    dom.projectsClose.addEventListener("click", () => this.closeProjects());
    dom.projectsOverlay.addEventListener("click", e => { if (e.target === dom.projectsOverlay) this.closeProjects(); });
    dom.projectsBody.addEventListener("click", e => {
      const b = e.target.closest(".copy-wrapper"); if (!b) return;
      this.copyWrapper(b.dataset.project, b);
    });
    dom.langBtn.addEventListener("click", () => this.toggleLang());
    dom.agents.addEventListener("click", e => {
      const btn = e.target.closest(".agent-chip"); if (!btn) return;
      const a = btn.dataset.agent;
      const all = Object.keys(this.taskStore.currentTasks.filter(t => !t.isArchived).reduce((o, t) => (o[t.assignedAgentId || "—"] = 1, o), {}));
      if (a === "__all__") this.agentFilter = null;
      else if (this.agentFilter === null) { this.agentFilter = new Set(all); this.agentFilter.delete(a); }
      else { this.agentFilter.has(a) ? this.agentFilter.delete(a) : this.agentFilter.add(a); if (this.agentFilter.size === all.length) this.agentFilter = null; }
      this.render(); this.syncURL();
    });
    dom.board.addEventListener("click", e => {
      const dep = e.target.closest(".badge.dep-active, .badge.dep-done");
      if (dep && dep.dataset.team) { e.stopPropagation(); this.openByTeam(+dep.dataset.team); return; }
      // Clicking a column header does NOT collapse the column (per user request).
      if (e.target.closest(".col-head")) return;
      const fi = e.target.closest(".feed-item"); if (fi) { this.openModal(fi.dataset.id); return; }
      const c = e.target.closest(".card"); if (c) this.openModal(c.dataset.id);
    });
    dom.mBody.addEventListener("click", e => {
      const ab = e.target.closest(".act-btn");
      if (ab) { e.preventDefault(); this.applyAction(ab.dataset.act); return; }
      const cp = e.target.closest(".copy-id");
      if (cp) { this.copyToClipboard(cp.dataset.copy || "", cp); return; }
      const t = e.target.closest(".deplink"); if (!t) return;
      if (t.dataset.team) this.openByTeam(+t.dataset.team);
      else if (t.dataset.task) this.openModal(t.dataset.task);
    });
    // Inline field edit (priority/module select, assignment input) in the modal.
    dom.mBody.addEventListener("change", e => {
      const f = e.target.closest(".act-input"); if (!f) return;
      this.applyField(f.dataset.field, f.value);
    });
    // Persist the actor ("As …") across sessions.
    dom.actor.addEventListener("change", () => localStorage.setItem("tm.actor", dom.actor.value.trim()));
    dom.mClose.addEventListener("click", () => this.closeModal());
    dom.overlay.addEventListener("click", e => { if (e.target === dom.overlay) this.closeModal(); });
    dom.ctxBtn.addEventListener("click", () => this.openCtx());
    dom.ctxClose.addEventListener("click", () => this.closeCtx());
    dom.ctxOverlay.addEventListener("click", e => { if (e.target === dom.ctxOverlay) this.closeCtx(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { this.closeModal(); this.closeCtx(); this.closeProjects(); } });

    // Auto-pause in a background tab
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { clearInterval(this.timer); this.timer = null; if (this.running) this.setStatus("idle", I18n.t("app.background")); }
      else if (this.running) { this.poll(); this.schedule(); }
    });
  }

  async init() {
    // The URL's ?project= and ?lang= (if present) win over localStorage — this is what
    // makes the board's URL directly shareable/bookmarkable to a specific project/language,
    // and is also how a Claude Code agent can be pointed at the right project + language.
    const s0 = UrlState.read();
    if (s0.lang) I18n.setLang(s0.lang);
    if (s0.project) { this.project = s0.project; localStorage.setItem("tm.project", this.project); }
    this.applyStaticI18n();
    await this.projectStore.load();
    this.populateProjectSelect();
    this.readState();
    this.bindEvents();
    if (this.projectStore.projects.length) {
      this.poll();
      this.schedule();
    } else {
      this.setStatus("err", I18n.t("app.noProjectShort"));
      this.showBanner(I18n.t("app.noProjectRegistered"));
    }
    // #6 Refreshes relative times every 30s without a full re-render.
    this.relTimer = setInterval(() => this.tickRelTimes(), 30000);
    this.tickClock();
    this.clockTimer = setInterval(() => this.tickClock(), 1000);
  }
}

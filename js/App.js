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

const el = id => document.getElementById(id);

/**
 * Fő alkalmazás-vezérlő: állapot, események, polling-loop, és az egyes
 * view/store osztályok összekötése. Multi-project: a Forrás-választó a
 * data/projects.json regisztrált projektjei közt vált (lásd applyProject).
 */
export class App {
  constructor() {
    this.dom = {
      board: el("board"), stats: el("stats"), agents: el("agents"),
      src: el("src"), q: el("q"), interval: el("interval"),
      toggle: el("toggle"), refresh: el("refresh"), sort: el("sort"),
      viewBoard: el("viewBoard"), viewSwim: el("viewSwim"), viewFeed: el("viewFeed"), compact: el("compact"),
      qfReview: el("qfReview"), qfActive: el("qfActive"), qfBlocked: el("qfBlocked"), notifyBtn: el("notifyBtn"),
      dot: el("dot"), statusText: el("statusText"), clock: el("clock"), banner: el("banner"),
      overlay: el("overlay"), mTitle: el("mTitle"), mBody: el("mBody"), mClose: el("mClose"),
      ctxBtn: el("ctxBtn"), ctxOverlay: el("ctxOverlay"), ctxClose: el("ctxClose"), ctxBody: el("ctxBody"), ctxUpdated: el("ctxUpdated"),
      actor: el("actor"), actorList: el("actorList"),
      srcBtn: el("srcBtn"), srcPanel: el("srcPanel"), srcPathLabel: el("srcPathLabel"), srcProject: el("srcProject"), srcPanelPath: el("srcPanelPath"),
      agentsWrap: el("agentsWrap"), agentsHead: el("agentsHead"), agentsCount: el("agentsCount"),
      projectsBtn: el("projectsBtn"), projectsOverlay: el("projectsOverlay"), projectsClose: el("projectsClose"), projectsBody: el("projectsBody"),
    };

    // ---- Állapot ----
    this.timer = null;
    this.running = true;
    this.sort = "activity";
    this.view = "board";
    this.compact = false;
    this.agentFilter = null;        // null = mind; Set = megjelenítendő ágensek
    this.quickFilter = null;        // null | "review" | "active" | "blocked" (#5)
    this.collapsedCols = new Set();
    this.openTaskId = null;
    this.pendingTask = null;
    this.notify = false;            // #3 böngésző-értesítés státuszváltáskor
    this.relTimer = null;           // #6 élő relatív-idő ticker
    this.clockTimer = null;         // fejléc élő órája (a mockup "clock" pillje)
    this.agentsOpen = localStorage.getItem("tm.agentsOpen") !== "0";   // Ágens-terhelés sáv nyitva/csukva
    this.project = localStorage.getItem("tm.project") || "";          // jelenleg kiválasztott projekt id

    this.projectStore = new ProjectStore();
    this.taskStore = new TaskStore(() => this.dom.src.value.trim());
    this.contextStore = new ContextStore(() => this.dom.src.value);
    this.api = new ApiClient(() => this.dom.actor.value, () => this.project);   // írás-bridge (api/index.php)
    this.boardView = new BoardView({ board: this.dom.board, stats: this.dom.stats, agents: this.dom.agents, agentsCount: this.dom.agentsCount });
    this.taskModal = new TaskModal({ overlay: this.dom.overlay, mTitle: this.dom.mTitle, mBody: this.dom.mBody, mClose: this.dom.mClose });
    this.contextPanel = new ContextPanel({ ctxBtn: this.dom.ctxBtn, ctxOverlay: this.dom.ctxOverlay, ctxClose: this.dom.ctxClose, ctxBody: this.dom.ctxBody, ctxUpdated: this.dom.ctxUpdated });
  }

  // ---- URL / localStorage szinkron ----
  readState() {
    const s = UrlState.read();
    this.dom.q.value = s.q;
    this.sort = s.sort;
    this.view = s.view;
    this.compact = s.compact;
    this.agentFilter = s.agentFilter;
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
      q: this.dom.q.value, agentFilter: this.agentFilter, quickFilter: this.quickFilter, sort: this.sort,
      view: this.view, compact: this.compact, openTaskId: this.openTaskId,
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

  // ---- Ágens-terhelés sáv összecsukása/kinyitása (a mockup kollapszibilis fejsora) ----
  setAgentsOpen(open) {
    this.agentsOpen = open;
    this.dom.agentsWrap.classList.toggle("open", open);
    this.dom.agentsHead.setAttribute("aria-expanded", String(open));
    localStorage.setItem("tm.agentsOpen", open ? "1" : "0");
  }

  // ---- „Forrás" popover: valódi projekt-váltó a data/projects.json regisztrált
  // projektjei közt (lásd populateProjectSelect / applyProject). ----
  toggleSrcPanel() {
    const open = !this.dom.srcBtn.classList.contains("open");
    this.dom.srcBtn.classList.toggle("open", open);
    this.dom.srcBtn.setAttribute("aria-expanded", String(open));
    this.dom.srcPanel.classList.toggle("show", open);
  }
  closeSrcPanel() {
    this.dom.srcBtn.classList.remove("open");
    this.dom.srcBtn.setAttribute("aria-expanded", "false");
    this.dom.srcPanel.classList.remove("show");
  }

  // A <select id="srcProject"> feltöltése a betöltött projektekkel, és az induló
  // kiválasztás alkalmazása (localStorage tm.project, vagy az első elérhető).
  populateProjectSelect() {
    const projects = this.projectStore.projects;
    this.dom.srcProject.innerHTML = projects
      .map(p => `<option value="${Utils.esc(p.id)}">${Utils.esc(p.label)}</option>`)
      .join("");
    if (!projects.length) {
      this.dom.srcPathLabel.textContent = "nincs projekt";
      this.dom.srcPanelPath.textContent = "";
      return;
    }
    if (!projects.some(p => p.id === this.project)) this.project = projects[0].id;
    this.dom.srcProject.value = this.project;
    this.applyProject(this.project, { silent: true });
  }

  updateSrcPathLabel() {
    const p = this.projectStore.get(this.project);
    this.dom.srcPathLabel.textContent = p ? p.label : (this.project || "nincs projekt");
    this.dom.srcPanelPath.textContent = p ? p.dataDir : "";
  }

  // Projekt-váltás: beállítja a src (tasks.json) URL-t, elmenti localStorage-ba, és
  // (ha nem silent) azonnal újrapollozza az új forrást.
  applyProject(id, { silent = false } = {}) {
    this.project = id;
    localStorage.setItem("tm.project", id);
    this.dom.src.value = `data/${id}/tasks.json`;
    UrlState.setSrc(this.dom.src.value);
    this.updateSrcPathLabel();
    if (!silent) { this.resetSource(); this.poll(); }
  }

  // ---- Fejléc élő órája (dekoratív, a mockup ketyegő clockjának megfelelője) ----
  tickClock() { this.dom.clock.textContent = new Date().toLocaleTimeString("hu-HU"); }

  render() {
    this.boardView.render(this.taskStore.currentTasks, {
      q: this.dom.q.value, agentFilter: this.agentFilter, quickFilter: this.quickFilter, sort: this.sort,
      view: this.view, compact: this.compact, collapsedCols: this.collapsedCols,
      changeInfo: this.taskStore.changeInfo,
    });
    this.syncActorList();
    this.tickRelTimes();
  }

  // #6 Élő relatív-idő: a full re-render helyett csak a .js-rel / .js-wait spanek szövegét frissíti.
  tickRelTimes() {
    document.querySelectorAll(".js-rel[data-ts]").forEach(e => { e.textContent = Utils.relTime(e.dataset.ts); });
    document.querySelectorAll(".js-wait[data-ts]").forEach(e => {
      e.textContent = "⏳ " + Utils.relTime(e.dataset.ts);
      e.className = "badge await await-" + Utils.waitLevel(Utils.ageMs(e.dataset.ts)) + " js-wait";
    });
  }

  // Ismert agent-nevek a jelenlegi taszkokból (actor- és hozzárendelés-datalisthez).
  agentsList() {
    const set = new Set();
    this.taskStore.currentTasks.forEach(t => { if (t.assignedAgentId) set.add(t.assignedAgentId); });
    return [...set].sort();
  }

  // A fejléc „Mint …" datalistjének feltöltése az ismert agentekkel (+ néhány alap szerep).
  syncActorList() {
    if (!this.dom.actorList) return;
    const extra = ["reviewer", "main"];
    const all = [...new Set([...this.agentsList(), ...extra])];
    this.dom.actorList.innerHTML = all.map(a => `<option value="${Utils.esc(a)}"></option>`).join("");
  }

  // ---- Modal ----
  openModal(id) {
    const t = this.taskStore.currentTasks.find(x => x.id === id); if (!t) return;
    this.openTaskId = id; this.syncURL();
    this.taskModal.render(t, this.boardView.teamIndex, this.taskStore.currentTasks, {
      writeEnabled: this.api.enabled, agents: this.agentsList(),
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

  // ---- Írás az api/index.php bridge-en át (task.sh), majd azonnali re-poll ----
  async runOps(ops, okMsg) {
    try {
      this.setStatus("", "küldés…");
      await this.api.run(ops);
      await this.poll();                       // a kanonikus állapotért (task.sh a forrás)
      if (this.openTaskId) this.openModal(this.openTaskId);  // modal újrarajzol friss adattal
      this.setStatus("ok", okMsg || "kész · " + new Date().toLocaleTimeString("hu-HU"));
      this.showBanner(null);
    } catch (e) {
      this.setStatus("err", "írás hiba");
      this.showBanner("Írás sikertelen: <code>" + Utils.esc(e.message) + "</code>");
    }
  }

  // Elsődleges akció-gomb a modálban (review-jóváhagyás/változtatás/blokk, státusz, jegyzet).
  applyAction(act) {
    const id = this.openTaskId; if (!id) return;
    const noteEl = this.dom.mBody.querySelector("#actNote");
    const note = noteEl ? noteEl.value.trim() : "";
    switch (act) {
      case "approve": return this.runOps([{ cmd: "status", args: [id, "done"] }], "jóváhagyva → done");
      case "done":    return this.runOps([{ cmd: "status", args: [id, "done"] }], "→ done");
      case "start":   return this.runOps([{ cmd: "status", args: [id, "in_progress"] }], "→ in_progress");
      case "review":  return this.runOps([{ cmd: "status", args: [id, "review"] }], "→ review");
      case "reopen":  return this.runOps([{ cmd: "reopen", args: [id] }], "újranyitva");
      case "changes":
        if (!note) { this.showBanner("A változtatás kéréséhez írj visszajelzést a mezőbe."); return; }
        // note → in_progress: a visszajelzés az érintett agent inboxába kerül (events.jsonl).
        return this.runOps([
          { cmd: "note", args: [id, "REVIEW: " + note] },
          { cmd: "status", args: [id, "in_progress"] },
        ], "változtatás kérve (az agent inboxába küldve)");
      case "block":
        return this.runOps(
          note ? [{ cmd: "note", args: [id, "BLOKK: " + note] }, { cmd: "status", args: [id, "blocked"] }]
               : [{ cmd: "status", args: [id, "blocked"] }],
          "→ blocked");
      case "note":
        if (!note) { this.showBanner("Írj szöveget a jegyzethez."); return; }
        return this.runOps([{ cmd: "note", args: [id, note] }], "jegyzet hozzáfűzve");
    }
  }

  // Inline mező-módosítás a modálban (prioritás / hozzárendelés).
  applyField(field, value) {
    const id = this.openTaskId; if (!id) return;
    const v = (value || "").trim();
    if (field === "priority") return this.runOps([{ cmd: "priority", args: [id, v] }], "prioritás: " + v);
    if (field === "assign") {
      if (!v) return;
      return this.runOps([{ cmd: "assign", args: [id, v] }], "hozzárendelve: " + v);
    }
  }

  // ---- Vágólapra másolás (visszajelzéssel; file:// fallbackkel) ----
  async copyToClipboard(text, btn) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text); ok = true;
      }
    } catch { /* fallback lent */ }
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
      btn.textContent = ok ? "✓ Másolva" : "✗ Hiba";
      btn.classList.toggle("copied", ok);
      clearTimeout(btn._copyTimer);
      btn._copyTimer = setTimeout(() => {
        btn.textContent = orig; btn.classList.remove("copied");
      }, 1400);
    }
    return ok;
  }

  // ---- Projektek modal (regisztrált projektek + wrapper task.sh másolása) ----
  openProjects() {
    const projects = this.projectStore.projects;
    this.dom.projectsBody.innerHTML = projects.length
      ? projects.map(p => `
        <div class="proj-row">
          <div class="proj-row-main">
            <div class="proj-row-label">${Utils.esc(p.label)}</div>
            <div class="proj-row-id mut">${Utils.esc(p.id)} · ${Utils.esc(p.dataDir)}</div>
          </div>
          <button type="button" class="copy-wrapper" data-project="${Utils.esc(p.id)}">Wrapper másolása</button>
        </div>`).join("")
      : '<p class="mut">Nincs regisztrált projekt. Vedd fel a host gépen: <code>engine/projects.sh add &lt;id&gt; "&lt;label&gt;"</code>, majd frissítsd az oldalt.</p>';
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
      this.showBanner("Wrapper betöltése sikertelen: <code>" + Utils.esc(e.message) + "</code>");
    }
  }

  // ---- User context (session-folytonosság) ----
  async pollContext() {
    const { changed } = await this.contextStore.poll();
    if (!changed) return;
    this.contextPanel.renderButton(this.contextStore.context);
    if (this.dom.ctxOverlay.classList.contains("show")) this.contextPanel.renderBody(this.contextStore.context);
  }
  openCtx() { this.contextPanel.renderBody(this.contextStore.context); this.contextPanel.show(); }
  closeCtx() { this.contextPanel.hide(); }

  // ---- #3 Böngésző-értesítés + cím-badge ----
  async toggleNotify() {
    if (!this.notify) {
      if (!("Notification" in window)) { this.setStatus("err", "Az értesítést a böngésző nem támogatja"); return; }
      let perm = Notification.permission;
      if (perm === "default") perm = await Notification.requestPermission();
      if (perm !== "granted") { this.setStatus("err", "Értesítés letiltva a böngészőben"); return; }
      this.notify = true;
    } else {
      this.notify = false;
    }
    this.dom.notifyBtn.innerHTML = ICONS.bell;
    this.dom.notifyBtn.classList.toggle("on", this.notify);
  }
  handleNotifications(tasks) {
    if (!this.notify || !("Notification" in window) || Notification.permission !== "granted") return;
    const ci = this.taskStore.changeInfo;   // csak 2. polltól tartalmaz átmenetet (első betöltéskor üres)
    tasks.forEach(t => {
      const c = ci.get(t.id);
      if (!c || !c.status) return;
      const to = String(c.status).split("→")[1];
      if (to !== "review" && to !== "done") return;
      new Notification(`Task ${to === "review" ? "review-ra vár" : "kész"}: ${t.title || t.id}`, {
        body: (t.assignedAgentId ? "👤 " + t.assignedAgentId + " · " : "") + c.status,
        tag: "tm-" + t.id,
      });
    });
  }
  updateTitle(tasks) {
    const review = tasks.filter(t => !t.isArchived && t.status === "review").length;
    document.title = (review ? `(${review} review) ` : "") + "Claude Task Manager – Kanban board";
  }

  // ---- Polling (feltételes GET) ----
  async poll() {
    if (!this.project) return;
    this.pollContext();   // a user context független, párhuzamos lekérése
    try {
      const result = await this.taskStore.poll();
      if (result.notModified) {
        this.setStatus("ok", `nincs változás · ${new Date().toLocaleTimeString("hu-HU")}`);
        return;
      }
      this.showBanner(null);

      this.handleNotifications(result.tasks);   // #3 értesítés az új review/done átmenetekről
      this.updateTitle(result.tasks);           // #3 cím-badge a review-ra váró taszkokról
      if (result.shouldRender) { this.render(); this.taskStore.markRendered(); }
      if (this.pendingTask) { this.openModal(this.pendingTask); this.pendingTask = null; }

      const n = result.tasks.length;
      this.setStatus("ok", `él · ${n} taszk${result.changeCount ? " · " + result.changeCount + " változott" : ""} · ${new Date().toLocaleTimeString("hu-HU")}`);
    } catch (err) {
      this.setStatus("err", "hiba: " + err.message);
      if (String(err.message).includes("Failed to fetch") || err instanceof TypeError)
        this.showBanner("Nem sikerült beolvasni a fájlt. Ellenőrizd, hogy fut-e a szerver: <code>docker compose up</code>, majd <code>http://localhost:3333/</code>.");
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

  // ---- Események ----
  bindEvents() {
    const dom = this.dom;

    dom.toggle.addEventListener("click", () => {
      this.running = !this.running; dom.toggle.innerHTML = (this.running ? ICONS.pause : ICONS.play) + ` <span class="btxt">${this.running ? "Szünet" : "Folytatás"}</span>`;
      if (this.running) { this.poll(); this.schedule(); } else { clearInterval(this.timer); this.timer = null; this.setStatus("idle", "szüneteltetve"); }
    });
    dom.refresh.addEventListener("click", () => this.poll());
    dom.q.addEventListener("input", () => { this.render(); this.syncURL(); });
    dom.srcProject.addEventListener("change", () => this.applyProject(dom.srcProject.value));
    dom.srcBtn.addEventListener("click", e => { e.stopPropagation(); this.toggleSrcPanel(); });
    dom.srcPanel.addEventListener("click", e => e.stopPropagation());
    document.addEventListener("click", () => { if (this.dom.srcBtn.classList.contains("open")) this.closeSrcPanel(); });
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
    dom.notifyBtn.addEventListener("click", () => this.toggleNotify());
    dom.projectsBtn.addEventListener("click", () => this.openProjects());
    dom.projectsClose.addEventListener("click", () => this.closeProjects());
    dom.projectsOverlay.addEventListener("click", e => { if (e.target === dom.projectsOverlay) this.closeProjects(); });
    dom.projectsBody.addEventListener("click", e => {
      const b = e.target.closest(".copy-wrapper"); if (!b) return;
      this.copyWrapper(b.dataset.project, b);
    });
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
      // Oszlop-fejlécre kattintás NEM csukja össze az oszlopot (felhasználói kérés).
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
    // Inline mező-módosítás (prioritás select / hozzárendelés input) a modálban.
    dom.mBody.addEventListener("change", e => {
      const f = e.target.closest(".act-input"); if (!f) return;
      this.applyField(f.dataset.field, f.value);
    });
    // Actor („Mint …") megőrzése session-ök között.
    dom.actor.addEventListener("change", () => localStorage.setItem("tm.actor", dom.actor.value.trim()));
    dom.mClose.addEventListener("click", () => this.closeModal());
    dom.overlay.addEventListener("click", e => { if (e.target === dom.overlay) this.closeModal(); });
    dom.ctxBtn.addEventListener("click", () => this.openCtx());
    dom.ctxClose.addEventListener("click", () => this.closeCtx());
    dom.ctxOverlay.addEventListener("click", e => { if (e.target === dom.ctxOverlay) this.closeCtx(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { this.closeModal(); this.closeCtx(); this.closeSrcPanel(); this.closeProjects(); } });

    // Auto-pause háttérfülnél
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { clearInterval(this.timer); this.timer = null; if (this.running) this.setStatus("idle", "háttérben – szünet"); }
      else if (this.running) { this.poll(); this.schedule(); }
    });
  }

  async init() {
    await this.projectStore.load();
    this.populateProjectSelect();
    this.readState();
    this.bindEvents();
    if (this.projectStore.projects.length) {
      this.poll();
      this.schedule();
    } else {
      this.setStatus("err", "nincs regisztrált projekt");
      this.showBanner('Nincs regisztrált projekt. Vedd fel a host gépen: <code>engine/projects.sh add &lt;id&gt; "&lt;label&gt;"</code>, majd frissítsd az oldalt.');
    }
    // #6 30 mp-enként frissíti a relatív időket full re-render nélkül.
    this.relTimer = setInterval(() => this.tickRelTimes(), 30000);
    this.tickClock();
    this.clockTimer = setInterval(() => this.tickClock(), 1000);
  }
}

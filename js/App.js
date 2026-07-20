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
import { Motion } from "./Motion.js";
import { CommandPalette } from "./CommandPalette.js";

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
      src: el("src"), interval: el("interval"),
      toggle: el("toggle"), refresh: el("refresh"), sort: el("sort"),
      viewBoard: el("viewBoard"), viewSwim: el("viewSwim"), viewFeed: el("viewFeed"), viewArchive: el("viewArchive"), compact: el("compact"),
      agroupSeg: el("agroupSeg"), agroupDay: el("agroupDay"), agroupModule: el("agroupModule"),
      sortGroup: el("sortGroup"), notifyBtn: el("notifyBtn"),
      moduleMs: el("moduleMs"), moduleMsBtn: el("moduleMsBtn"), moduleMsLabel: el("moduleMsLabel"),
      moduleMsPop: el("moduleMsPop"), moduleMsSearch: el("moduleMsSearch"), moduleMsAll: el("moduleMsAll"), moduleMsList: el("moduleMsList"),
      dot: el("dot"), statusText: el("statusText"), clock: el("clock"), banner: el("banner"), logo: document.querySelector(".logo"), srLive: el("srLive"),
      overlay: el("overlay"), mTitle: el("mTitle"), mBody: el("mBody"), mClose: el("mClose"),
      ctxBtn: el("ctxBtn"), ctxOverlay: el("ctxOverlay"), ctxClose: el("ctxClose"), ctxBody: el("ctxBody"), ctxUpdated: el("ctxUpdated"),
      actor: el("actor"), actorList: el("actorList"),
      srcProject: el("srcProject"),
      agentsWrap: el("agentsWrap"), agentsHead: el("agentsHead"), agentsCount: el("agentsCount"),
      projectsBtn: el("projectsBtn"), projectsOverlay: el("projectsOverlay"), projectsClose: el("projectsClose"), projectsBody: el("projectsBody"),
      langBtn: el("langBtn"),
      palette: el("palette"), palInput: el("palInput"), palList: el("palList"), palOpenBtn: el("palOpenBtn"),
    };

    // ---- State ----
    this.timer = null;
    this.running = true;
    this.sort = "activity";
    this.view = "board";
    this.compact = false;
    this.agentFilter = null;        // null = all; Set = agents to show
    this.moduleFilter = null;       // null = all modules; Set = modules to show
    this.moduleSearch = "";         // module-filter popover search text
    this.moduleMsOpen = false;      // module-filter popover open state
    this.collapsedCols = new Set();
    this.agroup = "day";            // archive view grouping: "day" | "module"
    this.collapsedArchGroups = new Set(JSON.parse(localStorage.getItem("tm.archGroups") || "[]"));   // archive view: day/module group keys with a FLIPPED default open/collapsed state
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
    // Parancspaletta (⌘K — docs/REDESIGN-TERV.md #6.8): a jegy-katalógus a taskStore élő
    // (nem archivált) jegyeiből épül, a parancskatalógus meglévő App-műveletekre képződik le.
    this.commandPalette = new CommandPalette(
      { overlay: this.dom.palette, input: this.dom.palInput, list: this.dom.palList },
      {
        getTasks: () => this.taskStore.currentTasks.filter(t => !t.isArchived),
        getCommands: () => this.paletteCommands(),
        onOpenTask: t => this.openModal(t.id),
        onFocusTask: t => this.focusCardOnBoard(t),
      }
    );
  }

  // ⌘Enter a parancspalettában egy jegy-találaton: a boardra ugrik, és a kártyát megjelöli.
  focusCardOnBoard(t) {
    if (this.view !== "board") { this.view = "board"; UrlState.setView(this.view); this.setViewButtons(); this.renderAsViewSwitch(); this.syncURL(); }
    requestAnimationFrame(() => {
      const cardEl = this.dom.board.querySelector(`[data-id="${CSS.escape(t.id)}"]`);
      if (!cardEl) return;
      cardEl.scrollIntoView({ block: "center", behavior: this.commandPalette.reduced.matches ? "auto" : "smooth" });
      cardEl.style.setProperty("--flash-color", "var(--accent)");
      cardEl.classList.add("is-changed");
      setTimeout(() => cardEl.classList.remove("is-changed"), 1200);
    });
  }

  // A parancspaletta katalógusa: kizárólag meglévő App-műveletekre képződik le, új
  // funkciót nem igényel — csak új felfedezési útvonalat a meglévőkhöz.
  paletteCommands() {
    const cmds = [];
    const add = (id, label, run) => cmds.push({ id, label, run });
    add("view-board", I18n.t("pal.cmd.viewBoard"), () => this.dom.viewBoard.click());
    add("view-swim", I18n.t("pal.cmd.viewSwim"), () => this.dom.viewSwim.click());
    add("view-feed", I18n.t("pal.cmd.viewFeed"), () => this.dom.viewFeed.click());
    add("view-archive", I18n.t("pal.cmd.viewArchive"), () => this.dom.viewArchive.click());
    add("toggle-compact", I18n.t(this.compact ? "pal.cmd.compactOff" : "pal.cmd.compactOn"), () => this.dom.compact.click());
    add("agroup-day", I18n.t("pal.cmd.agroupDay"), () => { if (this.view !== "archive") this.dom.viewArchive.click(); this.dom.agroupDay.click(); });
    add("agroup-module", I18n.t("pal.cmd.agroupModule"), () => { if (this.view !== "archive") this.dom.viewArchive.click(); this.dom.agroupModule.click(); });
    add("toggle-lang", I18n.t(I18n.lang === "hu" ? "pal.cmd.langEn" : "pal.cmd.langHu"), () => this.toggleLang());
    add("toggle-poll", I18n.t(this.running ? "pal.cmd.pollPause" : "pal.cmd.pollResume"), () => this.dom.toggle.click());
    add("refresh-now", I18n.t("pal.cmd.refresh"), () => this.dom.refresh.click());
    add("open-context", I18n.t("pal.cmd.context"), () => this.openCtx());
    add("open-projects", I18n.t("pal.cmd.projects"), () => this.openProjects());
    this.projectStore.projects.forEach(p => add("project-" + p.id, I18n.t("pal.cmd.project", { label: p.label }), () => { this.dom.srcProject.value = p.id; this.applyProject(p.id); }));
    this.agentsList().forEach(a => add("agent-" + a, I18n.t("pal.cmd.agentFilter", { a }), () => { this.agentFilter = new Set([a]); this.render(); this.syncURL(); }));
    this.modulesList().forEach(m => add("module-" + m, I18n.t("pal.cmd.moduleFilter", { m }), () => this.setModuleSelection(new Set([m]))));
    return cmds;
  }

  // ---- URL / localStorage sync ----
  readState() {
    const s = UrlState.read();
    this.sort = s.sort;
    this.view = s.view;
    this.compact = s.compact;
    this.agentFilter = s.agentFilter;
    this.moduleFilter = s.moduleFilter;
    this.pendingTask = s.pendingTask;
    this.collapsedCols = s.collapsedCols;
    this.agroup = s.agroup;
    if (s.interval) this.dom.interval.value = s.interval;
    this.dom.actor.value = localStorage.getItem("tm.actor") || "human";   // defaults to human when empty
    this.dom.sort.value = this.sort;
    this.setViewButtons();
    this.setAgroupButtons();
    this.dom.compact.classList.toggle("on", this.compact);
    this.setAgentsOpen(this.agentsOpen);
  }

  syncURL() {
    UrlState.sync({
      agentFilter: this.agentFilter, moduleFilter: this.moduleFilter, sort: this.sort,
      view: this.view, compact: this.compact, openTaskId: this.openTaskId, project: this.project, lang: I18n.lang, agroup: this.agroup,
    });
  }

  setStatus(state, text) {
    this.dom.dot.className = "dot" + (state ? " " + state : "");
    this.dom.dot.classList.remove("pulse"); void this.dom.dot.offsetWidth; this.dom.dot.classList.add("pulse");
    this.dom.statusText.textContent = text;
    // Equalizer-logó élő állapotjelzővé (6.1): pollingkor hullámzik, hibánál vörösre vált.
    if (this.dom.logo) {
      this.dom.logo.classList.toggle("live", state === "ok");
      this.dom.logo.classList.toggle("err", state === "err");
    }
  }
  // The error message is shown in its own context: inside the modal (modal-banner) if
  // one is open, otherwise in the main-page banner. This way it's never covered by the
  // modal, and it doesn't disappear because of polling — the user dismisses it, or the
  // next successful action clears it. msg may also contain HTML (i18n template with escaped values).
  showBanner(msg) {
    if (msg) {
      const modalBanner = document.querySelector(".overlay.show .modal-banner");
      const html = `<span class="banner-text">${msg}</span><button type="button" class="banner-close" aria-label="${Utils.esc(I18n.t("app.dismiss"))}">✕</button>`;
      if (modalBanner) {
        modalBanner.innerHTML = html;
        modalBanner.classList.add("show");
        this.dom.banner.classList.remove("show");   // don't leave the main-page instance hidden behind it
      } else {
        this.dom.banner.innerHTML = html;
        this.dom.banner.classList.add("show");
      }
      return;
    }
    // Clearing: only the main-page banner. The modal-banner's lifecycle is handled
    // separately (modal open/close, dismiss, or after a successful write) — see clearModalBanner().
    this.dom.banner.classList.remove("show");
  }
  clearModalBanner() {
    document.querySelectorAll(".modal-banner").forEach(b => { b.classList.remove("show"); b.innerHTML = ""; });
  }

  // ---- Toast (5.5): semleges, nem-tolakodó frissülés-jelzés, ha a fül nincs fókuszban.
  // 5s auto-dismiss, egyszerre max egy (az új lecseréli a régit). ----
  showToast(text) {
    clearTimeout(this._toastTimer);
    let t = this._toastEl;
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      t.addEventListener("click", () => t.classList.remove("show"));
      document.body.appendChild(t);
      this._toastEl = t;
    }
    t.textContent = text;
    t.classList.add("show");
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 5000);
  }

  // ---- Skeleton (5.5): csak az ELSŐ betöltésre, 150ms késleltetéssel — gyors válasznál ki sem villan. ----
  showSkeletonIfSlow() {
    setTimeout(() => {
      if (!this.taskStore.renderedOnce) {
        this.dom.board.className = "board";
        this.dom.board.innerHTML = this.boardView.skeletonHTML();
      }
    }, 150);
  }
  // Szegmentált nézetváltó (6.3): az aktív gomb alá csúszó "pill" jelző pozicionálása —
  // a .seg-pill szélessége/eltolása az aktuális .on gomb geometriájához igazodik.
  positionSegPill(container) {
    if (!container) return;
    const pill = container.querySelector(".seg-pill");
    const active = container.querySelector("button.on");
    if (!pill || !active) return;
    pill.style.width = active.offsetWidth + "px";
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  setViewButtons() {
    const isArchive = this.view === "archive";
    this.dom.viewBoard.classList.toggle("on", this.view === "board");
    this.dom.viewSwim.classList.toggle("on", this.view === "swim");
    this.dom.viewFeed.classList.toggle("on", this.view === "feed");
    this.dom.viewArchive.classList.toggle("on", isArchive);
    // Archive-only grouping switch; sort (superseded by the archive's own day/closed-time
    // ordering) doesn't apply in this view — see BoardView.archiveHTML.
    this.dom.agroupSeg.hidden = !isArchive;
    this.dom.sortGroup.hidden = isArchive;
    this.positionSegPill(this.dom.viewBoard.closest(".segmented"));
    if (isArchive) this.positionSegPill(this.dom.agroupSeg);
  }
  setAgroupButtons() {
    this.dom.agroupDay.classList.toggle("on", this.agroup !== "module");
    this.dom.agroupModule.classList.toggle("on", this.agroup === "module");
    this.positionSegPill(this.dom.agroupSeg);
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
    // A poll indító/szüneteltető gomb ikon-only (nincs szöveges címke) — a title/aria-label
    // hordozza az akadálymentes nevet, és a fenti általános data-i18n-title-hurok UTÁN kell
    // futnia, mert az a statikus "hd.pause" alapértékre állítaná vissza a tényleges állapottól függetlenül.
    this.dom.toggle.title = I18n.t(this.running ? "hd.pause" : "hd.resume");
    this.dom.toggle.setAttribute("aria-label", this.dom.toggle.title);
  }

  // Motion.transition()/transitionView() csomagolja be a teljes-innerHTML-cserés render()-t
  // (docs/REDESIGN-TERV.md #5.1): poll-frissítésnél csak a ténylegesen változott kártyák
  // morfolnak a régi helyükről az újra (changeInfo-vezérelt), nézetváltásnál (Kanban→Feed stb.)
  // egy #board-ra korlátozott crossfade fut — ezt a this._viewSwitching jelzi a hívó oldalán.
  render() {
    const doRender = () => {
      this.boardView.render(this.taskStore.currentTasks, {
        agentFilter: this.agentFilter, moduleFilter: this.moduleFilter, sort: this.sort,
        view: this.view, compact: this.compact, collapsedCols: this.collapsedCols,
        changeInfo: this.taskStore.changeInfo, agroup: this.agroup, collapsedArchGroups: this.collapsedArchGroups,
      });
      this.syncActorList();
      this.renderModuleFilter();
      this.tickRelTimes();
    };
    if (this._viewSwitching) Motion.transitionView(doRender, this.dom.board);
    else Motion.transition(doRender, this.taskStore.changeInfo);
  }

  // View-szintű váltás (nézet/kompakt/csoportosítás gombok): a render()-t a #board-crossfade
  // úttal futtatja, nem az egyenkénti kártya-morffal (ld. render() fenti kommentje).
  renderAsViewSwitch() {
    this._viewSwitching = true;
    this.render();
    this._viewSwitching = false;
  }

  // ---- Kanban-oszlop összecsukása (jelenleg csak a "done" oszlopra elérhető gomb — a
  // sok kész kártya elrejtésére, csak a darabszám marad látható). ----
  toggleColCollapse(key) {
    this.collapsedCols.has(key) ? this.collapsedCols.delete(key) : this.collapsedCols.add(key);
    UrlState.setCollapsed(this.collapsedCols);
    this.render();
  }

  // ---- Archive view: day/module group collapse (localStorage tm.archGroups; see App
  // constructor's comment on the "flipped default" semantics BoardView.archiveHTML uses). ----
  toggleArchGroup(key) {
    this.collapsedArchGroups.has(key) ? this.collapsedArchGroups.delete(key) : this.collapsedArchGroups.add(key);
    localStorage.setItem("tm.archGroups", JSON.stringify([...this.collapsedArchGroups]));
    this.render();
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

  // ---- Module filter (expandable popover: search + checkboxes + "select all") ----
  // Internal representation: moduleFilter === null → everything is shown; Set → only the
  // modules it contains. The checkbox UI, however, shows the explicit "selected = shown"
  // model, so in the null state every checkbox is checked.

  // The concrete set of currently selected modules (null filter = all modules selected).
  effectiveModuleSet() {
    const all = this.modulesList();
    return this.moduleFilter ? new Set(all.filter(m => this.moduleFilter.has(m))) : new Set(all);
  }

  // Commit a new selection: if every module is checked, reset to null (= no filter).
  setModuleSelection(set) {
    const all = this.modulesList();
    this.moduleFilter = (all.length > 0 && all.every(m => set.has(m))) ? null : set;
    this.render();
    this.syncURL();
  }

  // Renders the button's label, the filtered module list, and the "all" checkbox state.
  renderModuleFilter() {
    const d = this.dom;
    if (!d.moduleMsList) return;
    const all = this.modulesList();
    const sel = this.effectiveModuleSet();

    // Button label + "active filter" indicator.
    d.moduleMsLabel.textContent =
      this.moduleFilter === null ? I18n.t("ctrl.module.all")
      : this.moduleFilter.size === 0 ? I18n.t("ctrl.module.none")
      : this.moduleFilter.size === 1 ? [...this.moduleFilter][0]
      : I18n.t("ctrl.module.n", { n: this.moduleFilter.size });
    d.moduleMs.classList.toggle("active", this.moduleFilter !== null);

    // List filtered by search.
    const qq = this.moduleSearch.trim().toLowerCase();
    const visible = all.filter(m => m.toLowerCase().includes(qq));
    d.moduleMsList.innerHTML = visible.length
      ? visible.map(m => `<label class="ms-opt"><input type="checkbox" data-module="${Utils.esc(m)}"${sel.has(m) ? " checked" : ""}><span>${Utils.esc(m)}</span></label>`).join("")
      : `<div class="ms-empty">${Utils.esc(all.length ? I18n.t("ctrl.module.noMatch") : I18n.t("ctrl.module.empty"))}</div>`;

    // "Select all" applies to the currently VISIBLE (filtered) modules.
    const visSelected = visible.filter(m => sel.has(m)).length;
    d.moduleMsAll.checked = visible.length > 0 && visSelected === visible.length;
    d.moduleMsAll.indeterminate = visSelected > 0 && visSelected < visible.length;
    d.moduleMsAll.disabled = visible.length === 0;
  }

  toggleModulePop() { this.moduleMsOpen ? this.closeModulePop() : this.openModulePop(); }

  openModulePop() {
    this.moduleMsOpen = true;
    this.moduleSearch = "";
    this.dom.moduleMsSearch.value = "";
    this.dom.moduleMsPop.hidden = false;
    this.dom.moduleMsBtn.setAttribute("aria-expanded", "true");
    this.dom.moduleMs.classList.add("open");
    this.renderModuleFilter();
    this.dom.moduleMsSearch.focus();
  }

  closeModulePop() {
    this.moduleMsOpen = false;
    this.dom.moduleMsPop.hidden = true;
    this.dom.moduleMsBtn.setAttribute("aria-expanded", "false");
    this.dom.moduleMs.classList.remove("open");
  }

  // ---- Modal ----
  openModal(id) {
    const t = this.taskStore.currentTasks.find(x => x.id === id); if (!t) return;
    this.clearModalBanner();   // fresh task → don't leave a stale error in the modal
    this.openTaskId = id; this.syncURL();
    this.taskModal.render(t, this.boardView.teamIndex, this.taskStore.currentTasks, {
      writeEnabled: this.api.enabled, agents: this.agentsList(), modules: this.modulesList(), project: this.project, archived: !!t.isArchived,
    });
    this.taskModal.show();
  }
  closeModal() {
    this.taskModal.hide();
    this.clearModalBanner();
    this.openTaskId = null; this.syncURL();
  }
  openByTeam(n) {
    const t = this.boardView.teamIndex.get(n);
    if (t) this.openModal(t.id);
  }

  // ---- Writing through the api/index.php bridge (task.sh), then an immediate re-poll ----
  // preserveChecklistInput: openModal() below rebuilds the whole mBody from scratch, which
  // would otherwise wipe out a not-yet-submitted "new checklist item" (e.g. toggling one item
  // while mid-typing another) — callers OTHER than the checklist-add submission itself pass
  // true here so that text survives the rebuild. checklist-add does NOT set it: after a
  // successful add, the input should go back to empty (it just did its job), not repopulate
  // with the text that was just submitted. This is a narrow, local fix; the same re-render
  // also collapses open note <details> and clears #actNote, which is a pre-existing, more
  // general limitation of this full-rebuild render — not addressed here.
  async runOps(ops, okMsg, { preserveChecklistInput = false } = {}) {
    const pendingChecklistText = preserveChecklistInput ? (this.dom.mBody.querySelector("#checkAddInput")?.value || "") : "";
    try {
      this.setStatus("", I18n.t("app.sending"));
      await this.api.run(ops);
      await this.poll();                       // for the canonical state (task.sh is the source of truth)
      if (this.openTaskId) {
        this.openModal(this.openTaskId);  // modal re-renders with fresh data
        if (pendingChecklistText) {
          const inputEl = this.dom.mBody.querySelector("#checkAddInput");
          if (inputEl) inputEl.value = pendingChecklistText;
        }
      }
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
      case "todo":    return this.runOps([{ cmd: "status", args: [id, "todo"] }], I18n.t("app.toTodo"));
      case "start":   return this.runOps([{ cmd: "status", args: [id, "in_progress"] }], I18n.t("app.toInProgress"));
      case "review":  return this.runOps([{ cmd: "status", args: [id, "review"] }], I18n.t("app.toReview"));
      case "reopen":  return this.runOps([{ cmd: "reopen", args: [id] }], I18n.t("app.reopened"));
      case "unarchive": return this.runOps([{ cmd: "unarchive", args: [id] }], I18n.t("app.unarchived"));
      case "archive": return this.runOps([{ cmd: "archive", args: [id] }], I18n.t("app.archived"));
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
      case "checklist-add": {
        const inputEl = this.dom.mBody.querySelector("#checkAddInput");
        const text = inputEl ? inputEl.value.trim() : "";
        if (!text) return;
        return this.runOps([{ cmd: "checklist", args: [id, "add", text] }], I18n.t("app.checklistAdded"));
      }
    }
  }

  // Checklist item toggle (done/undo) in the modal.
  applyChecklistToggle(itemId, checked) {
    const id = this.openTaskId; if (!id || !itemId) return;
    return this.runOps([{ cmd: "checklist", args: [id, checked ? "done" : "undo", itemId] }], I18n.t(checked ? "app.checklistDone" : "app.checklistUndone"), { preserveChecklistInput: true });
  }

  // Checklist item removal in the modal.
  applyChecklistRemove(itemId) {
    const id = this.openTaskId; if (!id || !itemId) return;
    return this.runOps([{ cmd: "checklist", args: [id, "rm", itemId] }], I18n.t("app.checklistRemoved"), { preserveChecklistInput: true });
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
    const hint = `<div class="proj-hint">${I18n.t("project.copyHint")}</div>`;
    this.dom.projectsBody.innerHTML = hint + (projects.length
      ? projects.map(p => `
        <div class="proj-row">
          <div class="proj-row-main">
            <div class="proj-row-label">${Utils.esc(p.label)}</div>
            <div class="proj-row-id mut">${Utils.esc(p.id)} · ${Utils.esc(p.dataDir)}</div>
          </div>
          <button type="button" class="copy-wrapper" data-project="${Utils.esc(p.id)}">${Utils.esc(I18n.t("project.wrapperCopy"))}</button>
        </div>`).join("")
      : `<p class="mut">${I18n.t("project.none")}</p>`);
    this.dom.projectsOverlay.classList.add("show");
  }
  closeProjects() { this.dom.projectsOverlay.classList.remove("show"); this.clearModalBanner(); }
  async copyWrapper(id, btn) {
    try {
      const res = await fetch(`wrappers/${id}.sh`, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const script = await res.text();
      // We put a single VALID bash script on the clipboard: the shebang stays the first
      // line, and right after it we insert the instruction for the Claude Code agent AS A
      // COMMENT (save it as ctm-<id>.sh, make it executable). This way "save this whole
      // content" is unambiguous, the file is immediately runnable, and the comment is
      // harmless when the script executes.
      const proj = this.projectStore.get(id);
      const label = (proj && proj.label) || id;
      const file = `ctm-${id}.sh`;
      const comment = I18n.t("project.wrapperInstruction", { file, label })
        .split("\n").map(l => "# " + l).join("\n");
      const nl = script.indexOf("\n");
      const payload = nl >= 0
        ? script.slice(0, nl + 1) + comment + "\n" + script.slice(nl + 1)   // shebang + instruction comment + the rest of the script
        : comment + "\n" + script;
      await this.copyToClipboard(payload, btn);
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
  closeCtx() { this.contextPanel.hide(); this.clearModalBanner(); }

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
      const wasRendered = this.taskStore.renderedOnce;
      if (result.shouldRender) { this.render(); this.taskStore.markRendered(); }
      // Toast (5.5): csak ha MÁR volt render (nem az első betöltés) és az ablak nincs fókuszban —
      // ilyenkor a felhasználó máshol van, a kártya-flash nem elég, de a böngésző-notification
      // (App#notify) külön opt-in, azt nem helyettesíti.
      if (wasRendered && !document.hasFocus() && result.changeCount) this.showToast(I18n.t("toast.updated", { n: result.changeCount }));
      // A11y (8. fejezet): vizuálisan rejtett aria-live régió pollonként összegzi a változást —
      // a toast akadálymentes párja, mozgás nélkül is minden állapotváltás észlelhető.
      if (this.dom.srLive && result.changeCount) this.dom.srLive.textContent = I18n.t("a11y.updated", { n: result.changeCount });
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
      this.running = !this.running;
      dom.toggle.innerHTML = this.running ? ICONS.pause : ICONS.play;
      dom.toggle.title = I18n.t(this.running ? "hd.pause" : "hd.resume");
      dom.toggle.setAttribute("aria-label", dom.toggle.title);
      if (this.running) { this.poll(); this.schedule(); } else { clearInterval(this.timer); this.timer = null; this.setStatus("idle", I18n.t("app.paused")); }
    });
    dom.refresh.addEventListener("click", () => {
      dom.refresh.classList.add("spinning");
      Promise.resolve(this.poll()).finally(() => dom.refresh.classList.remove("spinning"));
    });
    dom.srcProject.addEventListener("change", () => this.applyProject(dom.srcProject.value));
    dom.agentsHead.addEventListener("click", () => this.setAgentsOpen(!this.agentsOpen));
    dom.interval.addEventListener("change", () => { UrlState.setInterval(dom.interval.value); this.schedule(); });
    dom.sort.addEventListener("change", () => { this.sort = dom.sort.value; UrlState.setSort(this.sort); this.render(); this.syncURL(); });
    dom.viewBoard.addEventListener("click", () => { this.view = "board"; UrlState.setView(this.view); this.setViewButtons(); this.renderAsViewSwitch(); this.syncURL(); });
    dom.viewSwim.addEventListener("click", () => { this.view = "swim"; UrlState.setView(this.view); this.setViewButtons(); this.renderAsViewSwitch(); this.syncURL(); });
    dom.viewFeed.addEventListener("click", () => { this.view = "feed"; UrlState.setView(this.view); this.setViewButtons(); this.renderAsViewSwitch(); this.syncURL(); });
    dom.viewArchive.addEventListener("click", () => { this.view = "archive"; UrlState.setView(this.view); this.setViewButtons(); this.renderAsViewSwitch(); this.syncURL(); });
    dom.agroupDay.addEventListener("click", () => { this.agroup = "day"; UrlState.setAgroup(this.agroup); this.setAgroupButtons(); this.renderAsViewSwitch(); this.syncURL(); });
    dom.agroupModule.addEventListener("click", () => { this.agroup = "module"; UrlState.setAgroup(this.agroup); this.setAgroupButtons(); this.renderAsViewSwitch(); this.syncURL(); });
    dom.compact.addEventListener("click", () => { this.compact = !this.compact; UrlState.setCompact(this.compact); dom.compact.classList.toggle("on", this.compact); this.renderAsViewSwitch(); this.syncURL(); });
    // Module filter popover: button, search, "all", individual checkboxes + outside-click/Escape.
    dom.moduleMsBtn.addEventListener("click", () => this.toggleModulePop());
    dom.moduleMsSearch.addEventListener("input", () => { this.moduleSearch = dom.moduleMsSearch.value; this.renderModuleFilter(); });
    dom.moduleMsAll.addEventListener("change", () => {
      const qq = this.moduleSearch.trim().toLowerCase();
      const visible = this.modulesList().filter(m => m.toLowerCase().includes(qq));
      const sel = this.effectiveModuleSet();
      visible.forEach(m => dom.moduleMsAll.checked ? sel.add(m) : sel.delete(m));
      this.setModuleSelection(sel);
    });
    dom.moduleMsList.addEventListener("change", e => {
      const cb = e.target.closest("input[type=checkbox][data-module]"); if (!cb) return;
      const sel = this.effectiveModuleSet();
      cb.checked ? sel.add(cb.dataset.module) : sel.delete(cb.dataset.module);
      this.setModuleSelection(sel);
    });
    document.addEventListener("click", e => { if (this.moduleMsOpen && !e.target.closest("#moduleMs")) this.closeModulePop(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && this.moduleMsOpen) { this.closeModulePop(); dom.moduleMsBtn.focus(); } });
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
      // Structured relationship badge (dependsOn/blocks) → open the related task.
      const rel = e.target.closest(".badge.rel");
      if (rel && rel.dataset.task) { e.stopPropagation(); this.openModal(rel.dataset.task); return; }
      // A col-head egésze nem csuk össze (per korábbi felhasználói kérés) — csak a dedikált
      // .col-collapse-btn nyíl teszi, hogy ne csukódjon véletlenül oszlop kártyára kattintáskor.
      const colToggle = e.target.closest(".col-collapse-btn");
      if (colToggle && colToggle.dataset.colToggle) { e.stopPropagation(); this.toggleColCollapse(colToggle.dataset.colToggle); return; }
      if (e.target.closest(".col-head")) return;
      const ag = e.target.closest(".arch-group-head");
      if (ag && ag.dataset.group) { this.toggleArchGroup(ag.dataset.group); return; }
      const fi = e.target.closest(".feed-item"); if (fi) { this.openModal(fi.dataset.id); return; }
      const ar = e.target.closest(".arch-row"); if (ar) { this.openModal(ar.dataset.id); return; }
      const c = e.target.closest(".card"); if (c) this.openModal(c.dataset.id);
    });
    dom.mBody.addEventListener("click", e => {
      const ab = e.target.closest(".act-btn");
      if (ab) { e.preventDefault(); this.applyAction(ab.dataset.act); return; }
      const cp = e.target.closest(".copy-id");
      if (cp) { this.copyToClipboard(cp.dataset.copy || "", cp); return; }
      const cr = e.target.closest(".check-rm");
      if (cr) { this.applyChecklistRemove(cr.dataset.item); return; }
      const t = e.target.closest(".deplink"); if (!t) return;
      if (t.dataset.team) this.openByTeam(+t.dataset.team);
      else if (t.dataset.task) this.openModal(t.dataset.task);
    });
    // Inline field edit (priority/module select, assignment input) / checklist checkbox
    // toggle in the modal.
    dom.mBody.addEventListener("change", e => {
      const f = e.target.closest(".act-input");
      if (f) { this.applyField(f.dataset.field, f.value); return; }
      const ct = e.target.closest(".check-toggle");
      if (ct) { this.applyChecklistToggle(ct.dataset.item, ct.checked); return; }
    });
    // Persist the actor ("As …") across sessions.
    dom.actor.addEventListener("change", () => localStorage.setItem("tm.actor", dom.actor.value.trim()));
    // Dismiss the error message (both the main-page banner and the modal-banner).
    document.addEventListener("click", e => {
      if (!e.target.closest(".banner-close")) return;
      const host = e.target.closest(".banner, .modal-banner");
      if (host) { host.classList.remove("show"); host.innerHTML = ""; }
    });
    dom.mClose.addEventListener("click", () => this.closeModal());
    dom.overlay.addEventListener("click", e => { if (e.target === dom.overlay) this.closeModal(); });
    dom.ctxBtn.addEventListener("click", () => this.openCtx());
    dom.ctxClose.addEventListener("click", () => this.closeCtx());
    dom.ctxOverlay.addEventListener("click", e => { if (e.target === dom.ctxOverlay) this.closeCtx(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") { this.closeModal(); this.closeCtx(); this.closeProjects(); this.commandPalette.close(); } });

    // Parancspaletta (6.8): ⌘K/Ctrl+K elsődleges trigger (a ⌘+Space-t a macOS a Spotlightnak
    // foglalja, böngészőbe el sem jut), "/" másodlagos — csak ha a fókusz nem beviteli mezőben áll.
    dom.palOpenBtn.addEventListener("click", () => this.commandPalette.open());
    document.addEventListener("keydown", e => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) { e.preventDefault(); this.commandPalette.toggle(); return; }
      if (e.key === "/" && !this.commandPalette.isOpen) {
        const ae = document.activeElement;
        const inField = ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable);
        if (!inField) { e.preventDefault(); this.commandPalette.open(); }
      }
    });

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
      this.showSkeletonIfSlow();
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

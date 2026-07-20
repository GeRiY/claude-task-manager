import { Utils, COLOR } from "./Utils.js";
import { I18n } from "./i18n.js";

const RECENT_KEY = "tm.palRecent";
const RECENT_MAX = 5;
const RESULT_MAX = 60;

/**
 * Parancspaletta (docs/REDESIGN-TERV.md #6.8) — macOS Spotlight-mintájú, egyetlen mezőből
 * mindent elérő lebegő panel: jegykeresés (fuzzy) + parancskatalógus, kevert találatokkal.
 * ⌘K/Ctrl+K (elsődleges, mert a ⌘+Space-t a rendszer a Spotlightnak foglalja) vagy `/`
 * (másodlagos) nyitja — a bekötés App.js-ben van.
 */
export class CommandPalette {
  /**
   * @param dom - { overlay, panel, input, list }
   * @param hooks - { getTasks, getCommands, onOpenTask, onFocusTask }
   *   getTasks(): task[] (a jelenleg élő, nem archivált jegyek)
   *   getCommands(): { id, label, run(), keywords? }[]
   *   onOpenTask(task): Enter egy jegy-találaton
   *   onFocusTask(task): ⌘Enter/Ctrl+Enter egy jegy-találaton (a boardon a kártyához görget)
   */
  constructor(dom, hooks) {
    this.dom = dom;
    this.hooks = hooks;
    this.isOpen = false;
    this.query = "";
    this.results = [];      // { type: "task"|"command", item, group, matches }
    this.activeIndex = 0;
    this._returnFocus = null;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
    this.bind();
  }

  bind() {
    this.dom.input.addEventListener("input", () => { this.query = this.dom.input.value; this.search(); });
    this.dom.input.addEventListener("keydown", e => this.onKeydown(e));
    this.dom.overlay.addEventListener("click", e => { if (e.target === this.dom.overlay) this.close(); });
    this.dom.list.addEventListener("click", e => {
      const row = e.target.closest(".pal-row"); if (!row) return;
      this.activate(+row.dataset.idx, e.metaKey || e.ctrlKey);
    });
    this.dom.list.addEventListener("mousemove", e => {
      const row = e.target.closest(".pal-row"); if (!row) return;
      const idx = +row.dataset.idx;
      if (idx !== this.activeIndex) { this.activeIndex = idx; this.highlightActive(); }
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._returnFocus = document.activeElement;
    this.query = "";
    this.dom.input.value = "";
    this.dom.overlay.classList.add("show");
    this.search();
    // A fókuszcsapda leegyszerűsítve: a mező marad a fókuszban gépelés közben; Escape zár és
    // visszaadja a fókuszt a hívó elemnek (5.5 / #8 akadálymentesség).
    requestAnimationFrame(() => this.dom.input.focus());
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dom.overlay.classList.remove("show");
    if (this._returnFocus && typeof this._returnFocus.focus === "function") this._returnFocus.focus();
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  // ---- Legutóbb megnyitott elemek (localStorage) ----
  recents() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
  }
  pushRecent(type, id) {
    const list = this.recents().filter(r => !(r.type === type && r.id === id));
    list.unshift({ type, id });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  }

  // ---- Keresés: jegyek (fuzzy) + parancsok, kevert, pontszám szerint rendezve ----
  search() {
    const raw = this.query.trim();
    const cmdOnly = raw.startsWith(">");
    const q = cmdOnly ? raw.slice(1).trim() : raw;
    let out = [];

    if (!raw) {
      const tasks = this.hooks.getTasks();
      const commands = this.hooks.getCommands();
      this.recents().forEach(r => {
        if (r.type === "task") { const t = tasks.find(x => x.id === r.id); if (t) out.push({ type: "task", item: t, group: "recent" }); }
        else { const c = commands.find(x => x.id === r.id); if (c) out.push({ type: "command", item: c, group: "recent" }); }
      });
    } else {
      // Jegyek és parancsok KÜLÖN csoportban jelennek meg (nem pontszám szerint egymásba
      // keverve) — így a kategória-fejléc (Jegyek/Parancsok) egyszer, összefüggően jelenik meg.
      const taskResults = [], cmdResults = [];
      if (!cmdOnly) {
        this.hooks.getTasks().forEach(t => {
          const titleM = Utils.fuzzyScore(q, t.title || t.id || "");
          const hay = [t.id, t.assignedAgentId, t.module, ...Utils.norm(t.notes)].filter(Boolean).join(" ");
          const hayM = titleM || Utils.fuzzyScore(q, hay);
          if (hayM) taskResults.push({ type: "task", item: t, group: "task", score: (titleM ? titleM.score + 5 : hayM.score), matches: titleM ? titleM.matches : [] });
        });
      }
      this.hooks.getCommands().forEach(c => {
        const m = Utils.fuzzyScore(q, c.label + " " + (c.keywords || ""));
        if (m) cmdResults.push({ type: "command", item: c, group: "command", score: m.score, matches: m.matches.filter(i => i < c.label.length) });
      });
      taskResults.sort((a, b) => b.score - a.score);
      cmdResults.sort((a, b) => b.score - a.score);
      out = cmdOnly ? cmdResults.slice(0, RESULT_MAX) : [...taskResults, ...cmdResults].slice(0, RESULT_MAX);
    }

    this.results = out;
    this.activeIndex = 0;
    this.render();
  }

  labelHTML(label, matches) {
    if (!matches || !matches.length) return Utils.esc(label);
    const set = new Set(matches);
    let html = "";
    for (let i = 0; i < label.length; i++) {
      const ch = Utils.esc(label[i]);
      html += set.has(i) ? `<mark>${ch}</mark>` : ch;
    }
    return html;
  }

  render() {
    const groupLabel = g => I18n.t(g === "task" ? "pal.group.tasks" : g === "command" ? "pal.group.commands" : "pal.group.recent");
    if (!this.results.length) {
      this.dom.list.innerHTML = `<div class="pal-empty">${Utils.esc(I18n.t(this.query.trim() ? "pal.noResults" : "pal.empty"))}</div>`;
      this.dom.input.removeAttribute("aria-activedescendant");
      return;
    }
    let html = "", lastGroup = null;
    this.results.forEach((r, i) => {
      if (r.group !== lastGroup) { html += `<div class="pal-group-label">${Utils.esc(groupLabel(r.group))}</div>`; lastGroup = r.group; }
      if (r.type === "task") {
        const t = r.item;
        const dot = `<span class="dot" style="background:${COLOR[t.status] || "var(--muted)"}"></span>`;
        const meta = [t.assignedAgentId, t.module].filter(Boolean).join(" · ");
        html += `<div class="pal-row" id="pal-opt-${i}" role="option" data-idx="${i}">
          <span class="pal-row-icon">${dot}</span>
          <span class="pal-row-label">${this.labelHTML(t.title || t.id || "(untitled)", r.matches)}</span>
          ${meta ? `<span class="pal-row-meta">${Utils.esc(meta)}</span>` : ""}
        </div>`;
      } else {
        const c = r.item;
        html += `<div class="pal-row" id="pal-opt-${i}" role="option" data-idx="${i}">
          <span class="pal-row-icon">›</span>
          <span class="pal-row-label">${this.labelHTML(c.label, r.matches)}</span>
        </div>`;
      }
    });
    this.dom.list.innerHTML = html;
    this.highlightActive();
  }

  highlightActive() {
    this.dom.list.querySelectorAll(".pal-row").forEach(el => el.classList.remove("active"));
    const active = this.dom.list.querySelector(`.pal-row[data-idx="${this.activeIndex}"]`);
    if (active) {
      active.classList.add("active");
      this.dom.input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }
  }

  move(delta) {
    if (!this.results.length) return;
    this.activeIndex = (this.activeIndex + delta + this.results.length) % this.results.length;
    this.highlightActive();
  }

  activate(idx, jump) {
    const r = this.results[idx]; if (!r) return;
    if (r.type === "task") {
      this.pushRecent("task", r.item.id);
      this.close();
      if (jump && this.hooks.onFocusTask) this.hooks.onFocusTask(r.item);
      else this.hooks.onOpenTask(r.item);
    } else {
      this.pushRecent("command", r.item.id);
      this.close();
      r.item.run();
    }
  }

  onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); this.close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); this.move(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); this.move(-1); return; }
    if (e.key === "Enter") { e.preventDefault(); this.activate(this.activeIndex, e.metaKey || e.ctrlKey); }
  }
}

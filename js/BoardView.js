import { Utils, COLUMNS, COLOR, ICONS, KIND_COLOR } from "./Utils.js";
import { I18n } from "./i18n.js";
import { Motion } from "./Motion.js";

/**
 * Renders the board: stats bar, agent chips (load bar), and the Kanban/Swimlane columns
 * with cards. Writes into the #board, #stats, #agents elements.
 */
export class BoardView {
  constructor(dom) {
    this.dom = dom; // { board, stats, agents, agentsCount }
    this.teamIndex = new Map(); // teamNo -> task (from the CURRENTLY loaded full task list, before filtering)
  }

  // Shared q/agent/module predicate (view-agnostic — visibleTasks and archivedTasks both use it).
  matchesFilters(t, { q, agentFilter, moduleFilter }) {
    if (agentFilter && !agentFilter.has(Utils.agentKey(t))) return false;
    if (moduleFilter && !moduleFilter.has(t.module || "")) return false;
    const qq = (q || "").trim().toLowerCase();
    if (!qq) return true;
    return [t.title, t.description, t.id, t.assignedAgentId, t.module, ...Utils.norm(t.notes)].join(" ").toLowerCase().includes(qq);
  }

  visibleTasks(allTasks, state) {
    return allTasks.filter(t => !t.isArchived).filter(t => this.matchesFilters(t, state));
  }

  // Archive view: the inverse of visibleTasks' isArchived filter. Quick filters (Awaiting
  // you / Active / Blocked) don't apply here — they're about live work, not the archive.
  archivedTasks(allTasks, state) {
    return allTasks.filter(t => t.isArchived).filter(t => this.matchesFilters(t, state));
  }

  /** Activity feed: every visible task's note+history entries, in reverse chronological order. */
  feedHTML(tasks) {
    const items = Utils.activityFeed(tasks);
    if (!items.length) return `<div class="empty">— ${Utils.esc(I18n.t("board.noActivity"))} —</div>`;
    return items.slice(0, 300).map(it => {
      const when = `<span class="fi-when js-rel" data-ts="${Utils.esc(it.at)}" title="${Utils.esc(Utils.absTime(it.at))}">${Utils.esc(Utils.relTime(it.at))}</span>`;
      let head, fiColor;
      if (it.kindType === "history") {
        const from = it.from ? `<span class="pill${Utils.pillClass(it.from)}" style="background:${COLOR[it.from] || "var(--muted)"}">${Utils.esc(it.from)}</span>` : "";
        const to = it.to ? `<span class="pill${Utils.pillClass(it.to)}" style="background:${COLOR[it.to] || "var(--muted)"}">${Utils.esc(it.to)}</span>` : "";
        head = `<span class="fi-type">${Utils.esc(it.type || "event")}</span> ${from}${(from && to) ? ` ${ICONS.arrow} ` : ""}${to}`;
        fiColor = COLOR[it.to] || COLOR[it.from] || "var(--border-strong)";
      } else {
        head = it.kind ? `<span class="n-kind ${it.kind.cls}">${Utils.esc(it.kind.label)}</span>` : `<span class="n-kind k-other">note</span>`;
        fiColor = it.kind ? (KIND_COLOR[it.kind.cls] || "var(--border-strong)") : "var(--border-strong)";
      }
      // Bal szélen típusszínű csík (6.6) — a most szinte azonos szürke sorok szétválasztására.
      return `<div class="feed-item" data-id="${Utils.esc(it.taskId)}" style="--fi-color:${fiColor}">
        <div class="fi-top">${head}<span class="fi-task">${Utils.esc(it.taskTitle)}</span>${when}</div>
        ${it.text ? `<div class="fi-text">${Utils.esc(it.text)}</div>` : ""}
      </div>`;
    }).join("");
  }

  /** Csak az ELSŐ betöltésre (5.5): oszlop-vázlat + kártya-placeholderek halvány shimmerrel. */
  skeletonHTML() {
    return COLUMNS.map(c => `<section class="col skeleton-col">
      <div class="col-head"><span class="swatch" style="background:${c.color}"></span><span class="col-title">${c.label}</span></div>
      <div class="col-body">${"<div class=\"skeleton-card\"></div>".repeat(3)}</div>
    </section>`).join("");
  }

  sorter(sort) {
    const dt = x => new Date(x || 0);
    if (sort === "created") return (a, b) => dt(b.createdAt) - dt(a.createdAt);
    if (sort === "title") return (a, b) => (a.title || "").localeCompare(b.title || "");
    if (sort === "team") return (a, b) => (Utils.parseTeam(a) ?? 999) - (Utils.parseTeam(b) ?? 999);
    return (a, b) => dt(b.lastActivityAt || b.updatedAt) - dt(a.lastActivityAt || a.updatedAt);
  }

  card(t, changeInfo) {
    const ci = changeInfo.get(t.id);
    const team = Utils.parseTeam(t);
    const deps = Utils.parseDeps(t);
    // "changed" jelzés (docs/REDESIGN-TERV.md #5.3): NEM badge (megnyomná a kártyát — kicsúszás),
    // hanem egy abszolút pozicionált sarok-pötty (geometria-semleges) + egy ::after-flash (CSS,
    // csak background-color). Az "updated" (egyéb) diff csak pöttyöt kap, flash-t nem (5.2 mátrix).
    let changeDot = "", flashStyle = "", isChangedClass = "";
    if (ci) {
      const parts = [
        ci.isNew ? I18n.t("badge.new") : "",
        ci.status ? "⇄ " + ci.status : "",
        ci.notes ? I18n.t("badge.notes") : "",
        ci.history ? I18n.t("badge.history") : "",
        (ci.updated && !ci.status && !ci.notes && !ci.history && !ci.isNew) ? I18n.t("badge.updated") : "",
      ].filter(Boolean);
      const flashWorthy = ci.isNew || ci.status || ci.notes || ci.history;
      const flashColor = ci.status ? (COLOR[String(ci.status).split("→")[1]] || "var(--accent)") : "var(--accent)";
      isChangedClass = flashWorthy ? " is-changed" : "";
      // *→done: a done-pipa stroke-draw animációval rajzolódik ki (5.2 mátrix) — kis, arányos
      // "sikerpillanat", NEM konfetti.
      if (ci.status && String(ci.status).endsWith("→done")) isChangedClass += " just-done";
      flashStyle = `--flash-color:${flashColor};`;
      changeDot = `<span class="change-dot" title="${Utils.esc(parts.join(" · "))}"></span>`;
    }
    const depBadges = deps.blockedBy.map(n => {
      const blk = this.teamIndex.get(n);
      const cls = deps.active ? "dep-active" : "dep-done";
      return `<span class="badge ${cls}" data-team="${n}" title="${blk ? Utils.esc(blk.title) : "?"}">${deps.active ? "⛔" : "✅"} #${n}</span>`;
    }).join("");
    // Structured relationships (dependsOn): ONE summary badge on the card, with the
    // count of related tickets. The full list is shown in the modal (on card click).
    const dependsOn = Array.isArray(t.dependsOn) ? t.dependsOn : [];
    const blocks = this.blocksIndex ? (this.blocksIndex.get(t.id) || []) : [];
    const relCount = dependsOn.length + blocks.length;
    const relTitle = [
      ...dependsOn.map(id => { const d = this.idIndex ? this.idIndex.get(id) : null; return "⬇ " + (d ? (d.title || d.id) : id); }),
      ...blocks.map(b => "⬆ " + (b.title || b.id)),
    ].join(" · ");
    const relBadges = relCount
      ? `<span class="badge rel rel-sum" title="${Utils.esc(I18n.t("rel.related"))}: ${Utils.esc(relTitle)}">🔗 ${relCount}</span>`
      : "";
    // #1 "Awaiting you" age badge on a review-status card (escalating emphasis).
    let waitBadge = "";
    if (t.status === "review") {
      const since = Utils.statusSince(t);
      const lvl = Utils.waitLevel(Utils.ageMs(since));
      waitBadge = `<span class="badge await await-${lvl} js-wait" data-ts="${Utils.esc(since || "")}" title="${Utils.esc(I18n.t("board.waitingSince"))}">⏳ ${Utils.esc(Utils.relTime(since))}</span>`;
    }
    // #4 Latest-note phase badge (RESEARCH/PLAN/DECISION/IMPLEMENTATION), if recognized.
    let kindBadge = "";
    const lastNote = Utils.normDetailed(t.notes).slice(-1)[0];
    const lk = lastNote ? Utils.noteKind(lastNote.text) : null;
    if (lk) kindBadge = `<span class="kind-badge ${lk.cls}" title="latest note's phase">${Utils.esc(lk.label)}</span>`;
    const moduleColor = t.module ? Utils.agentColor(t.module) : null;
    const moduleBadge = t.module ? `<span class="badge module" style="border-color:${Utils.hexA(moduleColor, .4)};color:${moduleColor}">${Utils.esc(t.module)}</span>` : "";
    const badges = (team ? `<span class="badge team">Team #${team}</span>` : "") + moduleBadge + waitBadge + kindBadge + depBadges + relBadges;
    const upd = t.lastActivityAt || t.updatedAt;
    const who = t.assignedAgentId || null;
    const whoColor = Utils.agentColor(who);
    const whoAvatar = `<span class="who-av" style="background:${Utils.hexA(whoColor, .16)};color:${whoColor}">${Utils.esc(Utils.agentShort(who))}</span>`;

    // Done tasks: per the mockup, a slim row with a checkmark avatar — no description/badges, just the essentials.
    if (t.status === "done") {
      return `<div class="card card-done${isChangedClass}" data-id="${Utils.esc(t.id)}" style="${flashStyle}">
        ${changeDot}
        <span class="done-check">${ICONS.check}</span>
        <div class="card-done-main">
          <div class="card-done-title">${badges ? `<span class="badges-inline">${badges}</span>` : ""}<span class="title-txt">${Utils.esc(t.title || t.id || "(untitled)")}</span></div>
          <div class="card-done-meta">${whoAvatar}<span class="who-name">${Utils.esc(who || I18n.t("board.noOwner"))}</span>${upd ? `<span class="dot-sep"></span><span class="js-rel" data-ts="${Utils.esc(upd)}" title="${Utils.esc(Utils.absTime(upd))}">${Utils.esc(Utils.relTime(upd))}</span>` : ""}</div>
        </div>
      </div>`;
    }

    return `<div class="card${isChangedClass}" data-id="${Utils.esc(t.id)}" style="--status-color:${COLOR[t.status] || "var(--border)"};${flashStyle}">
      ${changeDot}
      ${badges ? `<div class="badges">${badges}</div>` : ""}
      <h3>${Utils.esc(t.title || t.id || "(untitled)")}</h3>
      ${t.description ? `<p class="desc">${Utils.esc(t.description)}</p>` : ""}
      <div class="meta">
        ${who ? `<span class="tag agent">${whoAvatar}${Utils.esc(who)}</span>` : ""}
        ${upd ? `<span class="tag" title="${Utils.esc(Utils.absTime(upd))}">${ICONS.clock} <span class="js-rel" data-ts="${Utils.esc(upd)}">${Utils.esc(Utils.relTime(upd))}</span></span>` : ""}
      </div>
      ${(t.status === "blocked" && Utils.norm(t.notes).length) ? `<div class="note">${ICONS.block} ${Utils.esc(Utils.norm(t.notes).slice(-1)[0])}</div>` : ""}
    </div>`;
  }

  columnsHTML(tasks, { sort, collapsedCols, changeInfo, wipLimit }) {
    const byStatus = {}; COLUMNS.forEach(c => byStatus[c.key] = []); const unknown = [];
    tasks.forEach(t => (byStatus[t.status] || unknown).push(t));
    const sf = this.sorter(sort);
    let html = COLUMNS.map(c => {
      const items = (byStatus[c.key] || []).sort(sf);
      const col = collapsedCols.has(c.key);
      // WIP-jelzés (csak vizuális, 6.4): ha az in_progress oszlopban több elem van, mint az
      // aktív agentek száma ×2, a count-pill borostyán tintet kap.
      const isWip = c.key === "in_progress" && wipLimit != null && items.length > wipLimit;
      return `<section class="col${col ? " collapsed" : ""}" data-col="${c.key}" style="border-top-color:${c.color}">
        <div class="col-head" data-col="${c.key}">
          <span class="swatch" style="background:${c.color}"></span>
          <span class="status-ico" style="color:${c.color}">${ICONS[c.icon] || ""}</span>
          <span class="col-title">${c.label}</span>
          <span class="count${isWip ? " wip" : ""}"${isWip ? ` title="${Utils.esc(I18n.t("board.wipHigh"))}"` : ""}>${items.length}</span>
          ${c.key === "done" ? `<button type="button" class="col-collapse-btn" data-col-toggle="${c.key}" aria-expanded="${col ? "false" : "true"}" title="${Utils.esc(I18n.t(col ? "board.expandCol" : "board.collapseCol"))}">${ICONS.chevron}</button>` : ""}
        </div>
        <div class="col-body">${items.length ? items.map(t => this.card(t, changeInfo)).join("") : `<div class="empty">— ${Utils.esc(I18n.t("board.empty"))} —</div>`}</div>
      </section>`;
    }).join("");
    if (unknown.length) html += `<section class="col"><div class="col-head"><span class="swatch" style="background:var(--border)"></span><span class="col-title">${Utils.esc(I18n.t("board.unknown"))}</span><span class="count">${unknown.length}</span></div><div class="col-body">${unknown.map(t => this.card(t, changeInfo)).join("")}</div></section>`;
    return html;
  }

  // ---- Archive view (view === "archive"): closed/archived tasks, grouped by day or module ----

  /** One compact archive-list row: status (done-check or a status pill for non-done
   *  archive), title, owner avatar, lead-time badge, and when it was closed. */
  archRow(t) {
    const closed = Utils.closedAt(t);
    const c = Utils.cycle(t);
    const who = t.assignedAgentId || null;
    const whoColor = Utils.agentColor(who);
    const whoAvatar = `<span class="who-av" style="background:${Utils.hexA(whoColor, .16)};color:${whoColor}">${Utils.esc(Utils.agentShort(who))}</span>`;
    const statusMark = t.status === "done"
      ? `<span class="done-check">${ICONS.check}</span>`
      : `<span class="pill${Utils.pillClass(t.status)}" style="background:${COLOR[t.status] || "var(--muted)"}">${Utils.esc(t.status)}</span>`;
    const leadBadge = c.leadMs != null ? `<span class="badge arch-lead" title="${Utils.esc(I18n.t("modal.metric.lead"))}">${ICONS.clock} ${Utils.esc(Utils.dur(c.leadMs))}</span>` : "";
    return `<div class="arch-row" data-id="${Utils.esc(t.id)}">
      <span class="arch-row-status">${statusMark}</span>
      <span class="arch-row-title">${Utils.esc(t.title || t.id || "(untitled)")}</span>
      <span class="arch-row-meta">${whoAvatar}<span class="who-name">${Utils.esc(who || I18n.t("board.noOwner"))}</span>${leadBadge}${closed ? `<span class="js-rel" data-ts="${Utils.esc(closed)}" title="${Utils.esc(Utils.absTime(closed))}">${Utils.esc(Utils.relTime(closed))}</span>` : ""}</span>
    </div>`;
  }

  moduleLabel(m) {
    if (!m) return `<span class="mut">${Utils.esc(I18n.t("arch.noModule"))}</span>`;
    const c = Utils.agentColor(m);
    return `<span class="badge module" style="border-color:${Utils.hexA(c, .4)};color:${c}">${Utils.esc(m)}</span>`;
  }

  /** Rows for a day/module group's tasks, sub-grouped by module when more than one is present. */
  archGroupBodyHTML(items) {
    const byModule = new Map();
    items.forEach(t => { const m = t.module || ""; if (!byModule.has(m)) byModule.set(m, []); byModule.get(m).push(t); });
    if (byModule.size <= 1) return items.map(t => this.archRow(t)).join("");
    return [...byModule.entries()].sort((a, b) => b[1].length - a[1].length).map(([m, its]) =>
      `<div class="arch-subgroup-head">${this.moduleLabel(m)}<span class="count">${its.length}</span></div>${its.map(t => this.archRow(t)).join("")}`
    ).join("");
  }

  archiveHTML(tasks, { agroup, collapsedArchGroups }) {
    if (!tasks.length) return `<div class="empty">— ${Utils.esc(I18n.t("arch.empty"))} —</div>`;
    const collapsed = collapsedArchGroups || new Set();
    const byClosedDesc = (a, b) => new Date(Utils.closedAt(b) || 0) - new Date(Utils.closedAt(a) || 0);
    const chev = `<svg class="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>`;

    if (agroup === "module") {
      const byModule = new Map();
      tasks.forEach(t => { const m = t.module || ""; if (!byModule.has(m)) byModule.set(m, []); byModule.get(m).push(t); });
      const groups = [...byModule.entries()].sort((a, b) => b[1].length - a[1].length);
      return groups.map(([m, items]) => {
        items.sort(byClosedDesc);
        const key = "m:" + (m || "—");
        const col = collapsed.has(key);
        const dates = items.map(Utils.closedAt).filter(Boolean).sort();
        const range = dates.length ? I18n.t("arch.moduleRange", { from: Utils.dayKey(dates[0]), to: Utils.dayKey(dates[dates.length - 1]) }) : "";
        return `<section class="arch-group${col ? " collapsed" : ""}">
          <div class="arch-group-head" data-group="${Utils.esc(key)}">${chev}${this.moduleLabel(m)}
            <span class="count">${Utils.esc(I18n.t("arch.moduleCount", { n: items.length }))}</span>
            <span class="mut arch-group-range">${Utils.esc(range)}</span>
          </div>
          <div class="arch-group-body">${this.archGroupBodyHTML(items)}</div>
        </section>`;
      }).join("");
    }

    // Day grouping (default): newest day first, the 3 most recent days open by default —
    // collapsedArchGroups holds EXCEPTIONS to that default (toggling flips membership), so
    // the default doesn't need to be persisted for every day key up front.
    const byDay = new Map();
    tasks.forEach(t => { const d = Utils.dayKey(Utils.closedAt(t)) || "—"; if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(t); });
    const days = [...byDay.keys()].sort().reverse();
    const maxCount = Math.max(1, ...days.map(d => byDay.get(d).length));
    return days.map((day, i) => {
      const items = byDay.get(day).slice().sort(byClosedDesc);
      const key = "d:" + day;
      const defaultCollapsed = i >= 3;
      const col = collapsed.has(key) ? !defaultCollapsed : defaultCollapsed;
      return `<section class="arch-group${col ? " collapsed" : ""}">
        <div class="arch-group-head" data-group="${Utils.esc(key)}">${chev}
          <span class="arch-day-date">${Utils.esc(day)}</span>
          <span class="count">${Utils.esc(I18n.t("arch.dayCount", { n: items.length }))}</span>
          <span class="arch-day-bar"><i style="width:${Math.round(items.length / maxCount * 100)}%"></i></span>
        </div>
        <div class="arch-group-body">${this.archGroupBodyHTML(items)}</div>
      </section>`;
    }).join("");
  }

  renderArchiveStats(tasks) {
    const total = tasks.length;
    const dayCount = new Set(tasks.map(t => Utils.dayKey(Utils.closedAt(t))).filter(Boolean)).size;
    const perDay = dayCount ? total / dayCount : null;
    const cyc = tasks.map(Utils.cycle);
    const leads = cyc.filter(c => c.leadMs != null).map(c => c.leadMs);
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const notDone = tasks.filter(t => t.status !== "done").length;
    // Célzott frissítés (5.4): a #stats csak első rendernél / nyelvváltásnál épül újra —
    // utána a meglévő <b> elemek tweenelnek, hogy a szám ne "ugráljon" 2 mp-enként.
    const kind = "arch:" + I18n.lang;
    if (this.dom.stats.dataset.kind !== kind) {
      this.dom.stats.dataset.kind = kind;
      this.dom.stats.innerHTML =
        `<span class="stat">${I18n.t("arch.total", { n: `<b data-stat="total">${total}</b>` })}</span>` +
        `<span class="stat">${ICONS.activity} ${Utils.esc(I18n.t("arch.perDayAvg"))}: <b data-stat-text="perDay">${perDay != null ? perDay.toFixed(1) : "–"}</b></span>` +
        `<span class="stat">${ICONS.clock} ${Utils.esc(I18n.t("arch.leadAvg"))}: <b data-stat-text="lead">${Utils.dur(avg(leads))}</b></span>` +
        `<span class="stat" data-stat-row="notDone" style="${notDone ? "" : "display:none"}">${Utils.esc(I18n.t("arch.stillOpen", { n: notDone }))}</span>`;
      return;
    }
    Motion.tweenNumber(this.dom.stats.querySelector('[data-stat="total"]'), total);
    const perDayEl = this.dom.stats.querySelector('[data-stat-text="perDay"]'); if (perDayEl) perDayEl.textContent = perDay != null ? perDay.toFixed(1) : "–";
    const leadEl = this.dom.stats.querySelector('[data-stat-text="lead"]'); if (leadEl) leadEl.textContent = Utils.dur(avg(leads));
    const notDoneEl = this.dom.stats.querySelector('[data-stat-row="notDone"]');
    if (notDoneEl) { notDoneEl.style.display = notDone ? "" : "none"; notDoneEl.textContent = notDone ? I18n.t("arch.stillOpen", { n: notDone }) : ""; }
  }

  /**
   * @param allTasks - the full (unfiltered) task list from the last poll
   * @param state - { q, agentFilter, moduleFilter, sort, view, compact, collapsedCols, changeInfo, agroup, collapsedArchGroups }
   */
  render(allTasks, state) {
    const { sort, view, compact, collapsedCols, changeInfo } = state;
    const isArchive = view === "archive";
    const tasks = isArchive ? this.archivedTasks(allTasks, state) : this.visibleTasks(allTasks, state);

    this.teamIndex = new Map();
    // Structured relationships (task.sh dependsOn): id → task, and the reverse edge (who depends on it).
    this.idIndex = new Map();
    this.blocksIndex = new Map();   // id → [tasks whose dependsOn contains it]
    allTasks.forEach(t => { const n = Utils.parseTeam(t); if (n != null) this.teamIndex.set(n, t); this.idIndex.set(t.id, t); });
    allTasks.forEach(t => (Array.isArray(t.dependsOn) ? t.dependsOn : []).forEach(d => {
      if (!this.blocksIndex.has(d)) this.blocksIndex.set(d, []);
      this.blocksIndex.get(d).push(t);
    }));

    // Stats + cycle time
    if (isArchive) {
      this.renderArchiveStats(tasks);
    } else {
      const counts = Object.fromEntries(COLUMNS.map(c => [c.key, 0]));
      tasks.forEach(t => { if (counts[t.status] != null) counts[t.status]++; });
      const total = tasks.length, done = counts.done || 0, pct = total ? Math.round(done / total * 100) : 0;
      const cyc = tasks.map(Utils.cycle);
      const leads = cyc.filter(c => c.leadMs != null).map(c => c.leadMs);
      const ips = cyc.filter(c => c.inProgressMs > 0).map(c => c.inProgressMs);
      const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      // Distribution bar: every status as its own colored segment, proportionally (the mockup's
      // "dist" bar) instead of a plain "% done" bar — the whole status distribution is visible
      // at a glance.
      // Szegmensek width%+left%-tal (nem flex-grow-val): a sáv teljes szélessége fix, csak a
      // belső arányok animálnak width/left transitionnel — CLS-hatás nélkül (5.4).
      const distSegs = COLUMNS.filter(c => counts[c.key] > 0);
      const distTotal = distSegs.reduce((s, c) => s + counts[c.key], 0) || 1;
      const distKeys = distSegs.map(c => c.key).join(",");
      const buildDistHTML = () => {
        let cum = 0;
        return distSegs.map((c, i) => {
          const pct = counts[c.key] / distTotal * 100;
          const isFirst = i === 0, isLast = i === distSegs.length - 1;
          const r = isFirst && isLast ? "4px" : isFirst ? "4px 0 0 4px" : isLast ? "0 4px 4px 0" : "0";
          const html = `<i style="left:${cum}%;width:${pct}%;background:${c.color};border-radius:${r};${isLast ? "" : "border-right:2px solid var(--surface-1);"}"></i>`;
          cum += pct;
          return html;
        }).join("");
      };
      // Célzott frissítés (5.4): a #stats csak első rendernél / nyelvváltásnál épül újra —
      // utána a meglévő <b data-stat> elemek tweenelnek (Motion.tweenNumber), a sáv-szegmensek
      // pedig CSS width/left-transitionnel úsznak át (ugyanazok az <i> node-ok maradnak). Így
      // pollingnál a stats-DOM stabil marad, nincs szám-ugrálás / layout-ugrás.
      const kind = "board:" + I18n.lang;
      if (this.dom.stats.dataset.kind !== kind) {
        this.dom.stats.dataset.kind = kind;
        this.dom.stats.innerHTML =
          `<span class="stat">${I18n.t("board.tasks", { n: `<b data-stat="total">${total}</b>` })}</span>` +
          COLUMNS.map(c => `<span class="stat"><span class="swatch" style="background:${c.color}"></span>${c.label}: <b data-stat="${c.key}">${counts[c.key]}</b></span>`).join("") +
          `<span class="sep"></span>` +
          `<span class="stat">${ICONS.clock} ${Utils.esc(I18n.t("board.leadAvg"))}: <b data-stat-text="lead">${Utils.dur(avg(leads))}</b></span>` +
          `<span class="stat">${ICONS.activity} ${Utils.esc(I18n.t("board.inProgressAvg"))}: <b data-stat-text="ip">${Utils.dur(avg(ips))}</b></span>` +
          `<div class="progress" data-seg-keys="${distKeys}" title="${done}/${total}">${buildDistHTML()}</div><span class="progress-label" data-stat-text="pct">${Utils.esc(I18n.t("board.percentDone", { p: pct }))}</span>`;
      } else {
        Motion.tweenNumber(this.dom.stats.querySelector('[data-stat="total"]'), total);
        COLUMNS.forEach(c => Motion.tweenNumber(this.dom.stats.querySelector(`[data-stat="${c.key}"]`), counts[c.key]));
        const leadEl = this.dom.stats.querySelector('[data-stat-text="lead"]'); if (leadEl) leadEl.textContent = Utils.dur(avg(leads));
        const ipEl = this.dom.stats.querySelector('[data-stat-text="ip"]'); if (ipEl) ipEl.textContent = Utils.dur(avg(ips));
        const pctEl = this.dom.stats.querySelector('[data-stat-text="pct"]'); if (pctEl) pctEl.textContent = I18n.t("board.percentDone", { p: pct });
        const progEl = this.dom.stats.querySelector(".progress");
        if (progEl) {
          progEl.title = `${done}/${total}`;
          if (progEl.dataset.segKeys !== distKeys) { progEl.dataset.segKeys = distKeys; progEl.innerHTML = buildDistHTML(); }
          else { let cum = 0; distSegs.forEach((c, i) => { const pct = counts[c.key] / distTotal * 100; const seg = progEl.children[i]; if (seg) { seg.style.left = cum + "%"; seg.style.width = pct + "%"; } cum += pct; }); }
        }
      }
    }

    // Agent chips + load bar (stable, per-agent color + avatar abbreviation, per the mockup)
    const totalBy = {}, activeBy = {};
    allTasks.filter(t => !t.isArchived).forEach(t => { const a = Utils.agentKey(t); totalBy[a] = (totalBy[a] || 0) + 1; if (t.status !== "done") activeBy[a] = (activeBy[a] || 0) + 1; });
    const agents = Object.keys(totalBy).sort();
    const maxA = Math.max(1, ...agents.map(a => activeBy[a] || 0));
    const activeAgentCount = agents.filter(a => activeBy[a] > 0).length;
    if (this.dom.agentsCount) this.dom.agentsCount.textContent = I18n.t("agents.active", { n: activeAgentCount });
    state.wipLimit = activeAgentCount * 2;
    this.dom.agents.innerHTML = agents.map(a => {
      const on = !state.agentFilter || state.agentFilter.has(a); const act = activeBy[a] || 0;
      const c = Utils.agentColor(a);
      const borderA = on ? (act ? .4 : .15) : .07;
      return `<button class="agent-chip${on ? " on" : ""}" data-agent="${Utils.esc(a)}" style="border-color:${Utils.hexA(c, borderA)}">
        <span class="ac-avatar" style="background:${Utils.hexA(c, .16)};color:${c}">${Utils.esc(Utils.agentShort(a))}</span>
        <span class="ac-info">
          <span class="ac-top">${Utils.esc(a)}<span class="ac-count">${act}/${totalBy[a]}</span></span>
          <span class="ac-bar"><i style="width:${Math.round(act / maxA * 100)}%;background:${c}"></i></span>
        </span>
      </button>`;
    }).join("") + (state.agentFilter ? `<button class="agent-chip" data-agent="__all__"><span class="ac-avatar">•</span><span class="ac-info"><span class="ac-top">${Utils.esc(I18n.t("agents.all"))}</span></span></button>` : "");

    // Board / Swimlane / Feed / Archive
    if (isArchive) {
      this.dom.board.className = "board archive" + (compact ? " compact" : "");
      this.dom.board.innerHTML = this.archiveHTML(tasks, state);
    } else if (view === "feed") {
      this.dom.board.className = "board feed";
      this.dom.board.innerHTML = this.feedHTML(tasks);
    } else if (view === "swim") {
      this.dom.board.className = "board swim" + (compact ? " compact" : "");
      const laneAgents = [...new Set(tasks.map(Utils.agentKey))].sort();
      this.dom.board.innerHTML = laneAgents.map(a => {
        const lt = tasks.filter(t => Utils.agentKey(t) === a);
        const act = lt.filter(t => t.status !== "done").length;
        const c = Utils.agentColor(a === "—" ? null : a);
        const avatar = `<span class="who-av" style="background:${Utils.hexA(c, .16)};color:${c}">${Utils.esc(Utils.agentShort(a === "—" ? null : a))}</span>`;
        return `<div class="lane"><div class="lane-head">${avatar} ${Utils.esc(a)} <span class="mut">· ${Utils.esc(I18n.t("board.tasks", { n: lt.length }))} · ${act} ${Utils.esc(I18n.t("ctrl.quick.active")).toLowerCase()}</span></div><div class="lane-cols">${this.columnsHTML(lt, state)}</div></div>`;
      }).join("") || `<div class="empty">— ${Utils.esc(I18n.t("board.noTasks"))} —</div>`;
    } else {
      this.dom.board.className = "board" + (compact ? " compact" : "");
      this.dom.board.innerHTML = this.columnsHTML(tasks, state);
    }
  }
}

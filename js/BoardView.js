import { Utils, COLUMNS, COLOR, ICONS } from "./Utils.js";
import { I18n } from "./i18n.js";

/**
 * Renders the board: stats bar, agent chips (load bar), and the Kanban/Swimlane columns
 * with cards. Writes into the #board, #stats, #agents elements.
 */
export class BoardView {
  constructor(dom) {
    this.dom = dom; // { board, stats, agents, agentsCount }
    this.teamIndex = new Map(); // teamNo -> task (from the CURRENTLY loaded full task list, before filtering)
  }

  visibleTasks(allTasks, { q, agentFilter, quickFilter, moduleFilter }) {
    const qq = (q || "").trim().toLowerCase();
    const passQuick = t => !quickFilter || (quickFilter === "active" ? t.status !== "done" : t.status === quickFilter);
    return allTasks.filter(t => !t.isArchived).filter(passQuick).filter(t => {
      if (agentFilter && !agentFilter.has(Utils.agentKey(t))) return false;
      if (moduleFilter && (t.module || "") !== moduleFilter) return false;
      if (!qq) return true;
      return [t.title, t.description, t.id, t.assignedAgentId, t.module, ...Utils.norm(t.notes)].join(" ").toLowerCase().includes(qq);
    });
  }

  /** Activity feed: every visible task's note+history entries, in reverse chronological order. */
  feedHTML(tasks) {
    const items = Utils.activityFeed(tasks);
    if (!items.length) return `<div class="empty">— ${Utils.esc(I18n.t("board.noActivity"))} —</div>`;
    return items.slice(0, 300).map(it => {
      const when = `<span class="fi-when js-rel" data-ts="${Utils.esc(it.at)}" title="${Utils.esc(Utils.absTime(it.at))}">${Utils.esc(Utils.relTime(it.at))}</span>`;
      let head;
      if (it.kindType === "history") {
        const from = it.from ? `<span class="pill${Utils.pillClass(it.from)}" style="background:${COLOR[it.from] || "var(--muted)"}">${Utils.esc(it.from)}</span>` : "";
        const to = it.to ? `<span class="pill${Utils.pillClass(it.to)}" style="background:${COLOR[it.to] || "var(--muted)"}">${Utils.esc(it.to)}</span>` : "";
        head = `<span class="fi-type">${Utils.esc(it.type || "event")}</span> ${from}${(from && to) ? ` ${ICONS.arrow} ` : ""}${to}`;
      } else {
        head = it.kind ? `<span class="n-kind ${it.kind.cls}">${Utils.esc(it.kind.label)}</span>` : `<span class="n-kind k-other">note</span>`;
      }
      return `<div class="feed-item" data-id="${Utils.esc(it.taskId)}">
        <div class="fi-top">${head}<span class="fi-task">${Utils.esc(it.taskTitle)}</span>${when}</div>
        ${it.text ? `<div class="fi-text">${Utils.esc(it.text)}</div>` : ""}
      </div>`;
    }).join("");
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
    const chBadges = ci ? [
      ci.isNew ? `<span class="badge ch">${Utils.esc(I18n.t("badge.new"))}</span>` : "",
      ci.status ? `<span class="badge ch">⇄ ${Utils.esc(ci.status)}</span>` : "",
      ci.notes ? `<span class="badge ch">${Utils.esc(I18n.t("badge.notes"))}</span>` : "",
      ci.history ? `<span class="badge ch">${Utils.esc(I18n.t("badge.history"))}</span>` : "",
      (ci.updated && !ci.status && !ci.notes && !ci.history) ? `<span class="badge ch">${Utils.esc(I18n.t("badge.updated"))}</span>` : "",
    ].join("") : "";
    const depBadges = deps.blockedBy.map(n => {
      const blk = this.teamIndex.get(n);
      const cls = deps.active ? "dep-active" : "dep-done";
      return `<span class="badge ${cls}" data-team="${n}" title="${blk ? Utils.esc(blk.title) : "?"}">${deps.active ? "⛔" : "✅"} #${n}</span>`;
    }).join("");
    // Strukturált kapcsolatok (dependsOn): a kártyán EGY összesítő badge, a kapcsolódó
    // jegyek darabszámával. A teljes lista a modalban látszik (kártyára kattintva).
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
    const badges = (team ? `<span class="badge team">Team #${team}</span>` : "") + moduleBadge + waitBadge + kindBadge + chBadges + depBadges + relBadges;
    const upd = t.lastActivityAt || t.updatedAt;
    const who = t.assignedAgentId || null;
    const whoColor = Utils.agentColor(who);
    const whoAvatar = `<span class="who-av" style="background:${Utils.hexA(whoColor, .16)};color:${whoColor}">${Utils.esc(Utils.agentShort(who))}</span>`;

    // Done tasks: per the mockup, a slim row with a checkmark avatar — no description/badges, just the essentials.
    if (t.status === "done") {
      return `<div class="card card-done${ci ? " changed" : ""}" data-id="${Utils.esc(t.id)}">
        <span class="done-check">${ICONS.check}</span>
        <div class="card-done-main">
          <div class="card-done-title">${badges ? `<span class="badges-inline">${badges}</span>` : ""}<span class="title-txt">${Utils.esc(t.title || t.id || "(untitled)")}</span></div>
          <div class="card-done-meta">${whoAvatar}<span class="who-name">${Utils.esc(who || I18n.t("board.noOwner"))}</span>${upd ? `<span class="dot-sep"></span><span class="js-rel" data-ts="${Utils.esc(upd)}" title="${Utils.esc(Utils.absTime(upd))}">${Utils.esc(Utils.relTime(upd))}</span>` : ""}</div>
        </div>
      </div>`;
    }

    return `<div class="card${ci ? " changed" : ""}" data-id="${Utils.esc(t.id)}" style="border-left-color:${COLOR[t.status] || "var(--border)"}">
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

  columnsHTML(tasks, { sort, collapsedCols, changeInfo }) {
    const byStatus = {}; COLUMNS.forEach(c => byStatus[c.key] = []); const unknown = [];
    tasks.forEach(t => (byStatus[t.status] || unknown).push(t));
    const sf = this.sorter(sort);
    let html = COLUMNS.map(c => {
      const items = (byStatus[c.key] || []).sort(sf);
      const col = collapsedCols.has(c.key);
      return `<section class="col${col ? " collapsed" : ""}">
        <div class="col-head" data-col="${c.key}">
          <span class="swatch" style="background:${c.color}"></span>
          <span class="col-title">${c.label}</span>
          <span class="count">${items.length}</span>
        </div>
        <div class="col-body">${items.length ? items.map(t => this.card(t, changeInfo)).join("") : `<div class="empty">— ${Utils.esc(I18n.t("board.empty"))} —</div>`}</div>
      </section>`;
    }).join("");
    if (unknown.length) html += `<section class="col"><div class="col-head"><span class="swatch" style="background:var(--border)"></span><span class="col-title">${Utils.esc(I18n.t("board.unknown"))}</span><span class="count">${unknown.length}</span></div><div class="col-body">${unknown.map(t => this.card(t, changeInfo)).join("")}</div></section>`;
    return html;
  }

  /**
   * @param allTasks - the full (unfiltered) task list from the last poll
   * @param state - { q, agentFilter, moduleFilter, sort, view, compact, collapsedCols, changeInfo }
   */
  render(allTasks, state) {
    const { sort, view, compact, collapsedCols, changeInfo } = state;
    const tasks = this.visibleTasks(allTasks, state);

    this.teamIndex = new Map();
    // Strukturált kapcsolatok (task.sh dependsOn): id → taszk, és a fordított él (ki függ tőle).
    this.idIndex = new Map();
    this.blocksIndex = new Map();   // id → [taszkok, amelyek dependsOn-ja tartalmazza]
    allTasks.forEach(t => { const n = Utils.parseTeam(t); if (n != null) this.teamIndex.set(n, t); this.idIndex.set(t.id, t); });
    allTasks.forEach(t => (Array.isArray(t.dependsOn) ? t.dependsOn : []).forEach(d => {
      if (!this.blocksIndex.has(d)) this.blocksIndex.set(d, []);
      this.blocksIndex.get(d).push(t);
    }));

    // Stats + cycle time
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
    const distSegs = COLUMNS.filter(c => counts[c.key] > 0);
    const distHTML = distSegs.map((c, i) => {
      const isFirst = i === 0, isLast = i === distSegs.length - 1;
      const r = isFirst && isLast ? "4px" : isFirst ? "4px 0 0 4px" : isLast ? "0 4px 4px 0" : "0";
      return `<i style="flex:${counts[c.key]} 1 0;background:${c.color};border-radius:${r}"></i>`;
    }).join("");
    this.dom.stats.innerHTML =
      `<span class="stat">${I18n.t("board.tasks", { n: `<b>${total}</b>` })}</span>` +
      COLUMNS.map(c => `<span class="stat"><span class="swatch" style="background:${c.color}"></span>${c.label}: <b>${counts[c.key]}</b></span>`).join("") +
      `<span class="sep"></span>` +
      `<span class="stat">${ICONS.clock} ${Utils.esc(I18n.t("board.leadAvg"))}: <b>${Utils.dur(avg(leads))}</b></span>` +
      `<span class="stat">${ICONS.activity} ${Utils.esc(I18n.t("board.inProgressAvg"))}: <b>${Utils.dur(avg(ips))}</b></span>` +
      `<div class="progress" title="${done}/${total}">${distHTML}</div><span class="progress-label">${Utils.esc(I18n.t("board.percentDone", { p: pct }))}</span>`;

    // Agent chips + load bar (stable, per-agent color + avatar abbreviation, per the mockup)
    const totalBy = {}, activeBy = {};
    allTasks.filter(t => !t.isArchived).forEach(t => { const a = Utils.agentKey(t); totalBy[a] = (totalBy[a] || 0) + 1; if (t.status !== "done") activeBy[a] = (activeBy[a] || 0) + 1; });
    const agents = Object.keys(totalBy).sort();
    const maxA = Math.max(1, ...agents.map(a => activeBy[a] || 0));
    if (this.dom.agentsCount) this.dom.agentsCount.textContent = I18n.t("agents.active", { n: agents.filter(a => activeBy[a] > 0).length });
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

    // Board / Swimlane / Feed
    if (view === "feed") {
      this.dom.board.className = "board feed";
      this.dom.board.innerHTML = this.feedHTML(tasks);
    } else if (view === "swim") {
      this.dom.board.className = "board swim" + (compact ? " compact" : "");
      const laneAgents = [...new Set(tasks.map(Utils.agentKey))].sort();
      this.dom.board.innerHTML = laneAgents.map(a => {
        const lt = tasks.filter(t => Utils.agentKey(t) === a);
        const act = lt.filter(t => t.status !== "done").length;
        return `<div class="lane"><div class="lane-head">${ICONS.user} ${Utils.esc(a)} <span class="mut">· ${Utils.esc(I18n.t("board.tasks", { n: lt.length }))} · ${act} ${Utils.esc(I18n.t("ctrl.quick.active")).toLowerCase()}</span></div><div class="lane-cols">${this.columnsHTML(lt, state)}</div></div>`;
      }).join("") || `<div class="empty">— ${Utils.esc(I18n.t("board.noTasks"))} —</div>`;
    } else {
      this.dom.board.className = "board" + (compact ? " compact" : "");
      this.dom.board.innerHTML = this.columnsHTML(tasks, state);
    }
  }
}

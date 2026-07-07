import { Utils, COLOR } from "./Utils.js";

/**
 * Task-részlet modal: leírás, ciklusidő-metrikák, függőségek (mindkét irányban),
 * adatok (kv-lista), jegyzetek, és a history idővonal.
 */
export class TaskModal {
  constructor(dom) {
    this.dom = dom; // { overlay, mTitle, mBody, mClose }
  }

  /**
   * Interaktív akció-sáv: a taszk státuszához illő elsődleges műveletek (review-nál
   * Jóváhagyva / Változtatás kell / Blokk), gyors státusz-gombok, prioritás/hozzárendelés,
   * és egy visszajelzés-mező. Csak data-attribútumos markup — a kattintást az App kezeli,
   * és a router.php-n át a task.sh írja a JSON-t (a böngésző sosem közvetlenül).
   */
  actionsHTML(t, opts) {
    if (!opts || !opts.writeEnabled) return "";
    const s = t.status;
    const btn = (act, label, cls = "") => `<button type="button" class="act-btn ${cls}" data-act="${act}">${label}</button>`;
    let primary = "";
    if (s === "review") {
      primary =
        btn("approve", "✓ Jóváhagyva", "act-approve") +
        btn("changes", "↺ Változtatás kell", "act-changes") +
        btn("block", "⛔ Blokk", "act-block");
    } else if (s === "done") {
      primary = btn("reopen", "↩ Újranyit", "act-reopen");
    } else {
      primary =
        (s !== "in_progress" ? btn("start", "▶ Indítom") : "") +
        btn("review", "🔍 Review-ra") +
        btn("done", "✓ Kész", "act-approve") +
        btn("block", "⛔ Blokk", "act-block");
    }
    const prios = ["low", "normal", "high", "urgent"];
    const cur = t.priority || "normal";
    const agents = (opts.agents || []).filter(a => a && a !== "—");
    const agentOpts = agents.map(a => `<option value="${Utils.esc(a)}"></option>`).join("");
    return `<div class="actions" data-id="${Utils.esc(t.id)}">
      <div class="act-row act-primary">${primary}</div>
      <textarea class="act-note" id="actNote" rows="2" placeholder="Visszajelzés / jegyzet — a Változtatás kell, a Blokk és a ＋ Jegyzet ezt használja (az érintett agent inboxába kerül)"></textarea>
      <div class="act-row act-fields">
        <button type="button" class="act-btn act-note-add" data-act="note">＋ Jegyzet</button>
        <label class="act-field">Prio
          <select class="act-input" data-field="priority">${prios.map(p => `<option value="${p}"${p === cur ? " selected" : ""}>${p}</option>`).join("")}</select>
        </label>
        <label class="act-field">Agent
          <input class="act-input" data-field="assign" list="modalAgentList" value="${Utils.esc(t.assignedAgentId || "")}" placeholder="hozzárendelés" spellcheck="false" autocomplete="off">
          <datalist id="modalAgentList">${agentOpts}</datalist>
        </label>
      </div>
    </div>`;
  }

  /**
   * @param t - a megjelenítendő taszk
   * @param teamIndex - Map<teamNo, task> (BoardView.teamIndex) a dep-linkekhez
   * @param allTasks - a teljes taszklista (a "ezt blokkolja" reláció kereséséhez)
   * @param opts - { writeEnabled, agents } : az interaktív akció-sávhoz
   */
  render(t, teamIndex, allTasks, opts = {}) {
    this.dom.mTitle.innerHTML = `${Utils.esc(t.title || t.id)} <span class="pill${Utils.pillClass(t.status)}" style="background:${COLOR[t.status] || "var(--muted)"}">${Utils.esc(t.status)}</span>`;
    const notes = Utils.normDetailed(t.notes), c = Utils.cycle(t), team = Utils.parseTeam(t), deps = Utils.parseDeps(t);
    const blocks = []; allTasks.forEach(x => { const d = Utils.parseDeps(x); if (team != null && d.blockedBy.includes(team)) blocks.push(x); });
    const kv = [
      ["ID", t.id], ["Team", team != null ? "#" + team : null], ["Ágens", t.assignedAgentId], ["Csatorna", t.channel],
      ["Forrás", t.source], ["Thread", t.externalThreadId],
      ["Létrehozva", t.createdAt ? `${Utils.absTime(t.createdAt)} (${Utils.relTime(t.createdAt)})` : null],
      ["Frissítve", t.updatedAt ? `${Utils.absTime(t.updatedAt)} (${Utils.relTime(t.updatedAt)})` : null],
      ["Utolsó akt.", t.lastActivityAt ? `${Utils.absTime(t.lastActivityAt)} (${Utils.relTime(t.lastActivityAt)})` : null],
    ].filter(r => r[1] != null && r[1] !== "");
    const depLink = n => { const b = teamIndex.get(n); return `<span class="badge dep-active deplink" data-team="${n}">#${n}${b ? " " + Utils.esc((b.title || "").slice(0, 28)) : ""}</span>`; };
    const history = Array.isArray(t.history) ? t.history.slice().sort((a, b) => new Date(a.at) - new Date(b.at)) : [];

    this.dom.mBody.innerHTML =
      this.actionsHTML(t, opts) +
      (t.description ? `<p class="desc-full">${Utils.esc(t.description)}</p>` : "") +
      `<div class="metrics">
        <div class="metric">⏱ átfutás<b>${Utils.dur(c.leadMs)}</b></div>
        <div class="metric">🔧 in_progress<b>${Utils.dur(c.inProgressMs || null)}</b></div>
        <div class="metric">📌 státusz<b>${Utils.esc(t.status)}</b></div>
      </div>` +
      ((deps.blockedBy.length || blocks.length) ? `<h4>Függőségek</h4>` : "") +
      (deps.blockedBy.length ? `<div class="row"><span class="lbl">${deps.active ? "⛔ Blokkolják:" : "✅ Volt blokkolva:"}</span> <span class="deplinks">${deps.blockedBy.map(depLink).join("")}</span></div>` : "") +
      (blocks.length ? `<div class="row"><span class="lbl">🔒 Ezt blokkolja:</span> <span class="deplinks">${blocks.map(b => `<span class="badge dep-active deplink" data-task="${Utils.esc(b.id)}">${Utils.esc(b.title.slice(0, 32))}</span>`).join("")}</span></div>` : "") +
      `<h4>Adatok</h4><dl class="kv">${kv.map(([k, v]) => `<dt>${Utils.esc(k)}</dt><dd>${Utils.esc(v)}${k === "ID" ? ` <button type="button" class="copy-id" data-copy="${Utils.esc(v)}" title="ID másolása a vágólapra">⧉ Copy</button>` : ""}</dd>`).join("")}</dl>` +
      (notes.length ? `<h4>Jegyzetek (${notes.length})</h4><ul class="notes">${notes.map(n => {
        const k = Utils.noteKind(n.text);
        const top = (k || n.at) ? `<div class="n-top">${k ? `<span class="n-kind ${k.cls}">${Utils.esc(k.label)}</span>` : ""}${n.at ? `<span class="n-when" title="${Utils.esc(Utils.absTime(n.at))}">${Utils.esc(Utils.relTime(n.at))}</span>` : ""}</div>` : "";
        return `<li class="note-item">${top}<div class="n-text">${Utils.esc(n.text)}</div></li>`;
      }).join("")}</ul>` : "") +
      (history.length ? `<h4>Előzmények (${history.length})</h4><ul class="timeline">${history.map(h => {
        const from = h.fromStatus ? `<span class="pill${Utils.pillClass(h.fromStatus)}" style="background:${COLOR[h.fromStatus] || "var(--muted)"}">${Utils.esc(h.fromStatus)}</span> → ` : "";
        const to = h.toStatus ? `<span class="pill${Utils.pillClass(h.toStatus)}" style="background:${COLOR[h.toStatus] || "var(--muted)"}">${Utils.esc(h.toStatus)}</span>` : "";
        return `<li><div class="when">${Utils.esc(Utils.absTime(h.at))} · ${Utils.esc(Utils.relTime(h.at))}</div><div class="trans">${Utils.esc(h.type || "")} ${from}${to}</div>${h.note ? `<div class="note2">${Utils.esc(h.note)}</div>` : ""}</li>`;
      }).join("")}</ul>` : "");
  }

  show() { this.dom.overlay.classList.add("show"); }
  hide() { this.dom.overlay.classList.remove("show"); }
}

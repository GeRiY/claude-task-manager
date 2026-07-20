import { Utils, COLOR } from "./Utils.js";
import { I18n } from "./i18n.js";

/**
 * Task detail modal: description, cycle-time metrics, dependencies (both directions),
 * data (kv list), notes, and the history timeline.
 */
export class TaskModal {
  constructor(dom) {
    this.dom = dom; // { overlay, mTitle, mBody, mClose }
  }

  /**
   * Interactive action bar: primary actions matching the task's status (on review:
   * Approved / Changes needed / Block), quick status buttons, priority/module/assignment,
   * and a feedback field. Markup only carries data attributes — clicks are handled by App,
   * and task.sh writes the JSON via api/index.php (the browser never writes directly).
   */
  actionsHTML(t, opts) {
    if (!opts || !opts.writeEnabled) return "";
    const s = t.status;
    const btn = (act, label, cls = "") => `<button type="button" class="act-btn ${cls}" data-act="${act}">${label}</button>`;
    // Archived tasks are read-only history: no status/priority/module/assignment changes,
    // just the one way back in — task.sh reopen clears isArchived and reopens the task.
    if (opts.archived) {
      // Reopen: todo-ra állítja + valódi átmenet (history-bejegyzés). Unarchive: csak az
      // isArchived flaget törli, a jelenlegi státuszt (pl. done) NEM változtatja meg.
      return `<div class="actions" data-id="${Utils.esc(t.id)}"><div class="act-row act-primary">${btn("unarchive", I18n.t("modal.unarchive"))}${btn("reopen", I18n.t("modal.reopen"), "act-reopen")}</div></div>`;
    }
    let primary = "";
    if (s === "review") {
      primary =
        btn("approve", I18n.t("modal.approve"), "act-approve") +
        btn("changes", I18n.t("modal.changes"), "act-changes") +
        btn("block", I18n.t("modal.block"), "act-block") +
        btn("todo", I18n.t("modal.toTodo")) +
        btn("archive", I18n.t("modal.archive"));
    } else if (s === "done") {
      primary = btn("reopen", I18n.t("modal.reopen"), "act-reopen") + btn("todo", I18n.t("modal.toTodo")) + btn("archive", I18n.t("modal.archive"));
    } else {
      primary =
        (s !== "todo" ? btn("todo", I18n.t("modal.toTodo")) : "") +
        (s !== "in_progress" ? btn("start", I18n.t("modal.start")) : "") +
        btn("review", I18n.t("modal.toReview")) +
        btn("done", I18n.t("modal.done"), "act-approve") +
        btn("block", I18n.t("modal.block"), "act-block") +
        btn("archive", I18n.t("modal.archive"));
    }
    const prios = ["low", "normal", "high", "urgent"];
    const cur = t.priority || "normal";
    const agents = (opts.agents || []).filter(a => a && a !== "—");
    const agentOpts = agents.map(a => `<option value="${Utils.esc(a)}"></option>`).join("");
    const modules = (opts.modules || []).filter(Boolean);
    const moduleOpts = modules.map(m => `<option value="${Utils.esc(m)}"></option>`).join("");
    return `<div class="actions" data-id="${Utils.esc(t.id)}">
      <div class="act-row act-primary">${primary}</div>
      <textarea class="act-note" id="actNote" rows="2" placeholder="${Utils.esc(I18n.t("modal.notePlaceholder"))}"></textarea>
      <div class="act-row act-fields">
        <button type="button" class="act-btn act-note-add" data-act="note">${Utils.esc(I18n.t("modal.addNote"))}</button>
        <label class="act-field">${Utils.esc(I18n.t("modal.priority"))}
          <select class="act-input" data-field="priority">${prios.map(p => `<option value="${p}"${p === cur ? " selected" : ""}>${p}</option>`).join("")}</select>
        </label>
        <label class="act-field">${Utils.esc(I18n.t("modal.module"))}
          <input class="act-input" data-field="module" list="modalModuleList" value="${Utils.esc(t.module || "")}" placeholder="${Utils.esc(I18n.t("modal.modulePlaceholder"))}" spellcheck="false" autocomplete="off">
          <datalist id="modalModuleList">${moduleOpts}</datalist>
        </label>
        <label class="act-field">${Utils.esc(I18n.t("modal.agent"))}
          <input class="act-input" data-field="assign" list="modalAgentList" value="${Utils.esc(t.assignedAgentId || "")}" placeholder="${Utils.esc(I18n.t("modal.agentPlaceholder"))}" spellcheck="false" autocomplete="off">
          <datalist id="modalAgentList">${agentOpts}</datalist>
        </label>
      </div>
    </div>`;
  }

  /**
   * @param t - the task to display
   * @param teamIndex - Map<teamNo, task> (BoardView.teamIndex) for dep links
   * @param allTasks - the full task list (to look up the "blocks this" relation)
   * @param opts - { writeEnabled, agents, modules } : for the interactive action bar
   */
  render(t, teamIndex, allTasks, opts = {}) {
    this.dom.mTitle.innerHTML = `${Utils.esc(t.title || t.id)} <span class="pill${Utils.pillClass(t.status)}" style="background:${COLOR[t.status] || "var(--muted)"}">${Utils.esc(t.status)}</span>`;
    // Modal-fejléc: vékony, a jegy státuszszínével futó felső csík (6.7).
    const modalEl = this.dom.overlay.querySelector(".modal");
    if (modalEl) modalEl.style.setProperty("--status-color", COLOR[t.status] || "var(--border)");
    const notes = Utils.normDetailed(t.notes), c = Utils.cycle(t), team = Utils.parseTeam(t), deps = Utils.parseDeps(t);
    const blocks = []; allTasks.forEach(x => { const d = Utils.parseDeps(x); if (team != null && d.blockedBy.includes(team)) blocks.push(x); });
    const kv = [
      [I18n.t("modal.kv.id"), t.id], [I18n.t("modal.kv.team"), team != null ? "#" + team : null],
      [I18n.t("modal.kv.agent"), t.assignedAgentId], [I18n.t("modal.kv.module"), t.module],
      [I18n.t("modal.kv.channel"), t.channel],
      [I18n.t("modal.kv.source"), t.source], [I18n.t("modal.kv.thread"), t.externalThreadId],
      [I18n.t("modal.kv.created"), t.createdAt ? `${Utils.absTime(t.createdAt)} (${Utils.relTime(t.createdAt)})` : null],
      [I18n.t("modal.kv.updated"), t.updatedAt ? `${Utils.absTime(t.updatedAt)} (${Utils.relTime(t.updatedAt)})` : null],
      [I18n.t("modal.kv.lastActivity"), t.lastActivityAt ? `${Utils.absTime(t.lastActivityAt)} (${Utils.relTime(t.lastActivityAt)})` : null],
    ].filter(r => r[1] != null && r[1] !== "");
    const depLink = n => { const b = teamIndex.get(n); return `<span class="badge dep-active deplink" data-team="${n}">#${n}${b ? " " + Utils.esc((b.title || "").slice(0, 28)) : ""}</span>`; };
    // Structured relationships (task.sh dependsOn): what this task waits on, and which tasks wait on it.
    const idIndex = new Map(allTasks.map(x => [x.id, x]));
    const dependsOn = Array.isArray(t.dependsOn) ? t.dependsOn : [];
    const blockRel = allTasks.filter(x => Array.isArray(x.dependsOn) && x.dependsOn.includes(t.id));
    const relLink = id => {
      const r = idIndex.get(id), label = r ? (r.title || r.id) : id, st = r ? r.status : null;
      const pill = st ? `<span class="pill${Utils.pillClass(st)}" style="background:${COLOR[st] || "var(--muted)"}">${Utils.esc(st)}</span> ` : "";
      return `<span class="badge dep-active deplink" data-task="${Utils.esc(id)}" title="${Utils.esc(String(label))}">${pill}${Utils.esc(String(label).slice(0, 44))}</span>`;
    };
    const history = Array.isArray(t.history) ? t.history.slice().sort((a, b) => new Date(a.at) - new Date(b.at)) : [];
    // Checklist (task.sh checklist feature): small steps under a task that don't deserve
    // their own task (see engine/task.sh's `checklist` help for the dependsOn/handoff
    // boundary). Progress ({done}/{total}) is computed here, NOT stored — the task.sh side
    // deliberately keeps it derived (same reasoning as the dropped durationMs field).
    const checklist = Array.isArray(t.checklist) ? t.checklist.filter(Boolean) : [];
    const checklistDone = checklist.filter(c => c.done).length;
    const checklistItemHTML = c => `<li class="check-item${c.done ? " done" : ""}">
        <label class="check-label">
          <input type="checkbox" class="check-toggle" data-item="${Utils.esc(c.id)}"${c.done ? " checked" : ""}${opts.writeEnabled ? "" : " disabled"}>
          <span class="check-text">${Utils.esc(c.text)}</span>
        </label>
        ${opts.writeEnabled ? `<button type="button" class="check-rm" data-item="${Utils.esc(c.id)}" title="${Utils.esc(I18n.t("modal.checklist.rmTitle"))}">✕</button>` : ""}
      </li>`;
    // The "add item" row is its own thing (not an .act-input, since it needs its own text
    // value, not a fixed field) — but the button IS a plain .act-btn, so App's existing
    // .act-btn click-delegation picks it up for free (data-act="checklist-add").
    const checklistAddRowHTML = opts.writeEnabled
      ? `<div class="check-add-row">
          <input type="text" class="check-add-input" id="checkAddInput" placeholder="${Utils.esc(I18n.t("modal.checklist.addPlaceholder"))}">
          <button type="button" class="act-btn check-add-btn" data-act="checklist-add">${Utils.esc(I18n.t("modal.checklist.addBtn"))}</button>
        </div>`
      : "";
    // Backward compat / the empty+writable-vs-empty+read-only distinction: an empty checklist
    // renders NOTHING when read-only (matches every pre-existing task in data/ — no field at
    // all), but shows just the add row when writable (otherwise a checklist could never be
    // STARTED from the UI). A non-empty checklist always gets its full heading + list.
    const checklistHTML = checklist.length
      ? `<h4>${Utils.esc(I18n.t("modal.checklist", { done: checklistDone, total: checklist.length }))}</h4><ul class="checklist">${checklist.map(checklistItemHTML).join("")}</ul>${checklistAddRowHTML}`
      : checklistAddRowHTML;
    // Affected files (task.sh files field, absolute paths): for display, we strip
    // everything before the project root — the project id (opts.project, the id field
    // in data/projects.json) matches the source repo's folder name, so we look for the
    // first path segment with that name (the project root), and show the path relative
    // to it, with a leading /. A later segment with the same name is inside the project
    // itself (e.g. a vendor folder of the same name), so it stays part of the path.
    // The full path (title attribute + data-copy → clipboard) is always unchanged;
    // if the id doesn't appear as a standalone segment in the path at all, there's no shortening.
    const files = Array.isArray(t.files) ? t.files.filter(Boolean) : [];
    const projectId = opts.project || "";
    const fileLabel = f => {
      if (!projectId) return f;
      const segs = f.split("/");
      const idx = segs.indexOf(projectId);
      return idx >= 0 ? "/" + segs.slice(idx + 1).join("/") : f;
    };
    // File-list rendering (copy-id button + shortened label + full path in the title/clipboard)
    // is SHARED between the task-level "Files" section and the note-/history-level (task.sh
    // by/files feature) 'files' display — don't duplicate the markup.
    const filesListHTML = arr => `<ul class="files">${arr.map(f => `<li><button type="button" class="copy-id file-path" data-copy="${Utils.esc(f)}" title="${Utils.esc(f)}">${Utils.esc(fileLabel(f))}</button></li>`).join("")}</ul>`;
    // Subordinate (note/history-level) files block: only renders when the array is actually
    // non-empty — for old entries (without by/files) it stays silent, so the modal looks
    // exactly as it did before.
    const subFilesHTML = raw => {
      const arr = Array.isArray(raw) ? raw.filter(Boolean) : [];
      return arr.length ? `<div class="sub-files"><span class="lbl">${Utils.esc(I18n.t("modal.files", { n: arr.length }))}</span>${filesListHTML(arr)}</div>` : "";
    };

    this.dom.mBody.innerHTML =
      this.actionsHTML(t, opts) +
      (t.description ? `<p class="desc-full">${Utils.esc(t.description)}</p>` : "") +
      `<div class="metrics">
        <div class="metric">⏱ ${Utils.esc(I18n.t("modal.metric.lead"))}<b>${Utils.dur(c.leadMs)}</b></div>
        <div class="metric">🔧 ${Utils.esc(I18n.t("modal.metric.inProgress"))}<b>${Utils.dur(c.inProgressMs || null)}</b></div>
        <div class="metric">📌 ${Utils.esc(I18n.t("modal.metric.status"))}<b>${Utils.esc(t.status)}</b></div>
      </div>` +
      ((deps.blockedBy.length || blocks.length) ? `<h4>${Utils.esc(I18n.t("modal.dependencies"))}</h4>` : "") +
      (deps.blockedBy.length ? `<div class="row"><span class="lbl">${Utils.esc(deps.active ? I18n.t("modal.blockedBy") : I18n.t("modal.wasBlockedBy"))}</span> <span class="deplinks">${deps.blockedBy.map(depLink).join("")}</span></div>` : "") +
      (blocks.length ? `<div class="row"><span class="lbl">${Utils.esc(I18n.t("modal.blocks"))}</span> <span class="deplinks">${blocks.map(b => `<span class="badge dep-active deplink" data-task="${Utils.esc(b.id)}">${Utils.esc(b.title.slice(0, 32))}</span>`).join("")}</span></div>` : "") +
      ((dependsOn.length || blockRel.length) ? `<h4>${Utils.esc(I18n.t("modal.relations"))}</h4>` : "") +
      (dependsOn.length ? `<div class="row"><span class="lbl">${Utils.esc(I18n.t("rel.dependsOn"))}</span> <span class="deplinks">${dependsOn.map(relLink).join("")}</span></div>` : "") +
      (blockRel.length ? `<div class="row"><span class="lbl">${Utils.esc(I18n.t("rel.blocks"))}</span> <span class="deplinks">${blockRel.map(x => relLink(x.id)).join("")}</span></div>` : "") +
      checklistHTML +
      (files.length ? `<h4>${Utils.esc(I18n.t("modal.files", { n: files.length }))}</h4>${filesListHTML(files)}` : "") +
      `<h4>${Utils.esc(I18n.t("modal.data"))}</h4><dl class="kv">${kv.map(([k, v]) => `<dt>${Utils.esc(k)}</dt><dd>${Utils.esc(v)}${k === I18n.t("modal.kv.id") ? ` <button type="button" class="copy-id" data-copy="${Utils.esc(v)}" title="${Utils.esc(I18n.t("modal.copyIdTitle"))}">${Utils.esc(I18n.t("modal.copyId"))}</button>` : ""}</dd>`).join("")}</dl>` +
      (notes.length ? `<h4>${Utils.esc(I18n.t("modal.notes", { n: notes.length }))}</h4><ul class="notes">${notes.map(n => {
        // <details>/<summary>: collapsed by default (a note's text can run to several
        // thousand characters), the summary is informative even collapsed (kind-badge +
        // one-line preview + relative time). The preview is clipped with CSS ellipsis (not
        // truncated in JS), so once opened the n-text shows the full, untruncated text.
        const k = Utils.noteKind(n.text);
        const when = n.at ? `<span class="n-when" title="${Utils.esc(Utils.absTime(n.at))}">${Utils.esc(Utils.relTime(n.at))}</span>` : "";
        // 'by' (task.sh by/files feature): only when there IS a value — old notes have no by
        // field, and there this span simply drops out (not "undefined", not an empty badge).
        const by = n.by ? `<span class="tag agent n-by">${Utils.esc(n.by)}</span>` : "";
        return `<li><details class="note-item">
          <summary><span class="n-top">${k ? `<span class="n-kind ${k.cls}">${Utils.esc(k.label)}</span>` : ""}<span class="n-preview">${Utils.esc(n.text)}</span><span class="n-meta">${by}${when}</span></span></summary>
          <div class="n-text">${Utils.esc(n.text)}</div>
          ${subFilesHTML(n.files)}
        </details></li>`;
      }).join("")}</ul>` : "") +
      (history.length ? `<h4>${Utils.esc(I18n.t("modal.history", { n: history.length }))}</h4><ul class="timeline">${history.map(h => {
        const from = h.fromStatus ? `<span class="pill${Utils.pillClass(h.fromStatus)}" style="background:${COLOR[h.fromStatus] || "var(--muted)"}">${Utils.esc(h.fromStatus)}</span> → ` : "";
        const to = h.toStatus ? `<span class="pill${Utils.pillClass(h.toStatus)}" style="background:${COLOR[h.toStatus] || "var(--muted)"}">${Utils.esc(h.toStatus)}</span>` : "";
        // 'by' (task.sh by/files feature): only when there IS a value — old history entries
        // have no by field, and there the " · name" part simply drops out.
        const by = h.by ? ` · ${Utils.esc(h.by)}` : "";
        // Timeline-pötty: a lezajlott átmenet cél-státuszának színe (eddig mind accent-kék volt) — 6.7.
        const dotColor = COLOR[h.toStatus] || COLOR[h.fromStatus] || "var(--accent)";
        return `<li style="--status-color:${dotColor}"><div class="when">${Utils.esc(Utils.absTime(h.at))} · ${Utils.esc(Utils.relTime(h.at))}${by}</div><div class="trans">${Utils.esc(h.type || "")} ${from}${to}</div>${h.note ? `<div class="note2">${Utils.esc(h.note)}</div>` : ""}${subFilesHTML(h.files)}</li>`;
      }).join("")}</ul>` : "");
  }

  show() { this.dom.overlay.classList.add("show"); }
  hide() { this.dom.overlay.classList.remove("show"); }
}

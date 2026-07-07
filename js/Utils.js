import { I18n } from "./i18n.js";

// Column definitions and their CSS custom-property colors.
// The JS uses these inline as style="background:var(--todo)" on cards/pills (see
// BoardView.js, TaskModal.js) — the --todo/--in_progress/... tokens are defined in
// style.css's :root.
export const COLUMNS = [
  { key: "todo", label: "To do", color: "var(--todo)" },
  { key: "in_progress", label: "In progress", color: "var(--in_progress)" },
  { key: "blocked", label: "Blocked", color: "var(--blocked)" },
  { key: "review", label: "Review", color: "var(--review)" },
  { key: "done", label: "Done", color: "var(--done)" },
];
export const COLOR = Object.fromEntries(COLUMNS.map(c => [c.key, c.color]));

// Inline SVG icons (from the "Redesign a dark mode" mockup). Inherit currentColor, so they
// take on the parent's text color. The static header icons live in index.html; these are
// for JS-generated markup (stats bar, cards, feed, lanes).
export const ICONS = {
  clock: '<svg class="ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 7.5V12l3 2"></path></svg>',
  activity: '<svg class="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l2.5-6 4 12 2.5-6H21"></path></svg>',
  user: '<svg class="ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.5 20a6.5 6.5 0 0 1 13 0"></path></svg>',
  arrow: '<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>',
  block: '<svg class="ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M6 6l12 12"></path></svg>',
  hourglass: '<svg class="ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4h10M7 20h10M8 4v3l4 5 4-5V4M8 20v-3l4-5 4 5v3"></path></svg>',
  pause: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>',
  play: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path></svg>',
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.4 4.4L19 7.2"></path></svg>',
  chevron: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>',
};

// Which status pill needs dark (not white) text for contrast.
const DARK_PILL_STATUSES = new Set(["review", "done"]);

// Agent-avatar palette (from the "Redesign a dark mode" mockup's agent colors) — stable,
// hash-based assignment, so every agent id always gets the same color. Reused for module
// badges too (any string hashes to a stable color, not just agent ids).
const AGENT_PALETTE = ["#5b8def", "#46c07f", "#d99a3f", "#b57cf6", "#45b5c4", "#e2739b", "#e0894e", "#2dd4bf", "#8b8ff0"];

/** General helper functions (as static class methods). */
export class Utils {
  static esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  static norm(notes) {
    return !notes ? [] : (Array.isArray(notes) ? notes.map(n => typeof n === "string" ? n : (n && (n.text || n.note)) || "").filter(Boolean) : [String(notes)]);
  }

  /** Like norm(), but keeps the timestamp: [{ at, text }, ...] (empty text dropped). */
  static normDetailed(notes) {
    if (!Array.isArray(notes)) return Utils.norm(notes).map(text => ({ at: null, text }));
    return notes
      .map(n => typeof n === "string" ? { at: null, text: n } : { at: (n && n.at) || null, text: (n && (n.text || n.note)) || "" })
      .filter(x => x.text);
  }

  /**
   * Note "kind" from the prefix convention (RESEARCH/PLAN/DECISION/IMPLEMENTATION…): reads
   * the ALL-CAPS word(s) at the start of the text, before a `:` or `.` (optionally followed
   * by a `(...)` aside). Returns { label, cls } or null if there's no such prefix.
   */
  static noteKind(text) {
    const m = /^\s*([A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ ]{1,24}?)(?:\s*\([^)]*\))?\s*[:.]/.exec(text || "");
    if (!m) return null;
    const label = m[1].trim();
    const w = label.split(/\s+/)[0].toLowerCase();
    let cls = "k-other";
    if (w.startsWith("kutat") || w.startsWith("research")) cls = "k-research";
    else if (w.startsWith("terv") || w.startsWith("plan")) cls = "k-plan";
    else if (w.startsWith("dönt") || w.startsWith("dont") || w.startsWith("decision")) cls = "k-decision";
    else if (w.startsWith("impl") || w.startsWith("javít") || w.startsWith("javit") || w.startsWith("fix")) cls = "k-impl";
    return { label, cls };
  }

  static agentKey(t) {
    return t.assignedAgentId || "—";
  }

  /** Stable (hash-based) avatar color for an agent id (or any string, e.g. a module name);
   *  "—" (no owner) is always gray. */
  static agentColor(id) {
    if (!id || id === "—") return "#7f8794";
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return AGENT_PALETTE[h % AGENT_PALETTE.length];
  }

  /** 2-character abbreviation for the agent avatar (e.g. "dev-organizer-fe" → "of"). */
  static agentShort(id) {
    if (!id || id === "—") return "—";
    const parts = id.split(/[-_ ]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toLowerCase();
    return id.slice(0, 2).toLowerCase();
  }

  /** #rrggbb → rgba(...) with the given alpha (the mockup's hexA helper). */
  static hexA(hex, a) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  static absTime(iso) {
    const d = new Date(iso);
    return isNaN(d) ? (iso || "–") : d.toLocaleString(I18n.locale(), { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  static relTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return "";
    let s = Math.round((Date.now() - d.getTime()) / 1000); const fut = s < 0; s = Math.abs(s);
    if (s < 60) return I18n.t(fut ? "time.soon" : "time.now");
    for (const [sec, key] of [[31557600, "time.years"], [2629800, "time.months"], [604800, "time.weeks"], [86400, "time.days"], [3600, "time.hours"], [60, "time.minutes"]])
      if (s >= sec) return (fut ? "~" : "") + Math.floor(s / sec) + " " + I18n.t(key);
    return I18n.t("time.now");
  }

  static dur(ms) {
    if (ms == null) return I18n.t("dur.none");
    const s = Math.round(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    if (d) return I18n.t("dur.days", { d, h });
    if (h) return I18n.t("dur.hours", { h, m });
    if (m) return I18n.t("dur.minutes", { m });
    return I18n.t("dur.seconds", { s });
  }

  static parseTeam(t) {
    const m = /Team Task #(\d+)/i.exec(t.title || "");
    return m ? +m[1] : null;
  }

  // Dependency parsing from notes: "Blocked ... #N ... until closed", "resolved"/"feloldva".
  static parseDeps(t) {
    const notes = Utils.norm(t.notes); const blockedBy = new Set(); let resolved = false;
    for (const n of notes) {
      if (/feloldva|resolved/i.test(n)) resolved = true;
      const i = n.search(/blokkolva|blocked/i);
      if (i >= 0) { const seg = n.slice(i); let m; const re = /#(\d+)/g; while ((m = re.exec(seg))) blockedBy.add(+m[1]); }
    }
    const active = blockedBy.size > 0 && !resolved && (t.status === "todo" || t.status === "blocked");
    return { blockedBy: [...blockedBy], resolved, active };
  }

  // Lead time from the history.
  static cycle(t) {
    const h = (t.history || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
    let inProg = 0, start = null, done = null;
    const created = t.createdAt ? new Date(t.createdAt) : (h[0] ? new Date(h[0].at) : null);
    for (const e of h) {
      const at = new Date(e.at);
      if (e.toStatus === "in_progress") start = at;
      else if (e.fromStatus === "in_progress" && start) { inProg += at - start; start = null; }
      if (e.toStatus === "done") done = at;
    }
    if (start && !done) inProg += Date.now() - start;   // still in progress
    return { inProgressMs: inProg, leadMs: (created && done) ? (done - created) : null, done: !!done };
  }

  /** CSS class suffix for .pill elements, for WCAG contrast (empty or " pill-dark"). */
  static pillClass(status) {
    return DARK_PILL_STATUSES.has(status) ? " pill-dark" : "";
  }

  /** Elapsed time in ms since an ISO timestamp (null if invalid). */
  static ageMs(iso) {
    const d = new Date(iso);
    return isNaN(d) ? null : (Date.now() - d.getTime());
  }

  /** When the task entered its CURRENT status (from the last matching history entry, else createdAt). */
  static statusSince(t) {
    const h = Array.isArray(t.history) ? t.history.slice().sort((a, b) => new Date(a.at) - new Date(b.at)) : [];
    let since = t.createdAt || (h[0] && h[0].at) || null;
    for (const e of h) if (e.toStatus === t.status) since = e.at;
    return since;
  }

  /** Wait-level (for the review "awaiting you" age badge escalation): fresh <1h, warn 1–4h, stale >4h. */
  static waitLevel(ms) {
    if (ms == null) return "fresh";
    const h = ms / 3600000;
    return h < 1 ? "fresh" : (h < 4 ? "warn" : "stale");
  }

  /**
   * Merged activity feed from every task's notes + history, in reverse chronological order.
   * Item: { at, taskId, taskTitle, kind, text, from, to, type }.
   */
  static activityFeed(tasks) {
    const items = [];
    for (const t of tasks) {
      for (const n of Utils.normDetailed(t.notes)) {
        if (!n.at) continue;
        items.push({ at: n.at, taskId: t.id, taskTitle: t.title || t.id, kind: Utils.noteKind(n.text), text: n.text, kindType: "note" });
      }
      for (const h of (Array.isArray(t.history) ? t.history : [])) {
        if (!h.at) continue;
        items.push({ at: h.at, taskId: t.id, taskTitle: t.title || t.id, from: h.fromStatus, to: h.toStatus, text: h.note || "", type: h.type, kindType: "history" });
      }
    }
    return items.sort((a, b) => new Date(b.at) - new Date(a.at));
  }
}

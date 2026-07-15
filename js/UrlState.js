/**
 * Reads/writes URL query-string + localStorage state.
 * Deep-link parameters: ?project=&lang=&task=<id>&agent=&module=&q=&sort=&view=&compact=1
 * project/lang make the board's URL directly shareable/bookmarkable to a specific project
 * in a specific language — the initial state is read from the URL first, falling back to
 * localStorage. localStorage keys preserve the view across sessions (tm.src, tm.project,
 * tm.lang, tm.interval, tm.sort, tm.view, tm.compact, tm.collapsed).
 */
export class UrlState {
  /** Reads the initial state from the URL + localStorage. */
  static read() {
    const p = new URL(location.href).searchParams;
    return {
      project: p.get("project") || null,
      lang: p.get("lang") || null,
      q: p.get("q") || "",
      sort: p.get("sort") || localStorage.getItem("tm.sort") || "activity",
      view: p.get("view") || localStorage.getItem("tm.view") || "board",
      compact: p.get("compact") === "1" || (!p.has("compact") && localStorage.getItem("tm.compact") === "1"),
      agentFilter: p.has("agent") ? new Set(p.get("agent").split(",").filter(Boolean)) : null,
      moduleFilter: p.has("module") ? new Set(p.get("module").split(",").filter(Boolean)) : null,
      quickFilter: p.get("quick") || null,
      pendingTask: p.get("task") || null,
      collapsedCols: new Set(JSON.parse(localStorage.getItem("tm.collapsed") || "[]")),
      src: localStorage.getItem("tm.src"),
      interval: localStorage.getItem("tm.interval"),
    };
  }

  /** Writes the current filter/view state back into the URL (history.replaceState). */
  static sync({ q, agentFilter, moduleFilter, quickFilter, sort, view, compact, openTaskId, project, lang }) {
    const p = new URLSearchParams();
    if (project) p.set("project", project);
    if (lang && lang !== "en") p.set("lang", lang);
    if (q && q.trim()) p.set("q", q.trim());
    if (agentFilter) p.set("agent", [...agentFilter].join(","));
    if (moduleFilter && moduleFilter.size) p.set("module", [...moduleFilter].join(","));
    if (quickFilter) p.set("quick", quickFilter);
    if (sort !== "activity") p.set("sort", sort);
    if (view !== "board") p.set("view", view);
    if (compact) p.set("compact", "1");
    if (openTaskId) p.set("task", openTaskId);
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  static setSrc(v) { localStorage.setItem("tm.src", v); }
  static setInterval(v) { localStorage.setItem("tm.interval", v); }
  static setSort(v) { localStorage.setItem("tm.sort", v); }
  static setView(v) { localStorage.setItem("tm.view", v); }
  static setCompact(v) { localStorage.setItem("tm.compact", v ? "1" : "0"); }
  static setCollapsed(set) { localStorage.setItem("tm.collapsed", JSON.stringify([...set])); }
}

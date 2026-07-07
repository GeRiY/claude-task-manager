/**
 * URL query-string + localStorage állapot olvasása/írása.
 * Deep-link paraméterek: ?task=<id>&agent=&q=&sort=&view=&compact=1
 * A localStorage kulcsok megőrzik a nézetet session-ök között (tm.src, tm.interval,
 * tm.sort, tm.view, tm.compact, tm.collapsed).
 */
export class UrlState {
  /** Beolvassa az induló állapotot az URL-ből + localStorage-ból. */
  static read() {
    const p = new URL(location.href).searchParams;
    return {
      q: p.get("q") || "",
      sort: p.get("sort") || localStorage.getItem("tm.sort") || "activity",
      view: p.get("view") || localStorage.getItem("tm.view") || "board",
      compact: p.get("compact") === "1" || (!p.has("compact") && localStorage.getItem("tm.compact") === "1"),
      agentFilter: p.has("agent") ? new Set(p.get("agent").split(",").filter(Boolean)) : null,
      quickFilter: p.get("quick") || null,
      pendingTask: p.get("task") || null,
      collapsedCols: new Set(JSON.parse(localStorage.getItem("tm.collapsed") || "[]")),
      src: localStorage.getItem("tm.src"),
      interval: localStorage.getItem("tm.interval"),
    };
  }

  /** Visszaírja a jelenlegi szűrő/nézet állapotot az URL-be (history.replaceState). */
  static sync({ q, agentFilter, quickFilter, sort, view, compact, openTaskId }) {
    const p = new URLSearchParams();
    if (q && q.trim()) p.set("q", q.trim());
    if (agentFilter) p.set("agent", [...agentFilter].join(","));
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

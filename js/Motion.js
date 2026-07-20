/**
 * Motion.js — a render körül futó mozgás-réteg (docs/REDESIGN-TERV.md #5).
 *
 * BoardView.render() minden pollnál teljes innerHTML-cserét csinál: a kártyák DOM-node-jai
 * pollonként megsemmisülnek, ezért sima CSS transition nem tudna mozgást animálni két render
 * között. A View Transitions API pontosan erre a mintára való: becsomagolja a DOM-mutációt, és
 * a view-transition-name-mel megjelölt elemeket a böngésző maga morfolja a régi helyükről az
 * újra — compositor-szálon, layout-ugrás nélkül.
 *
 * Csak a TÉNYLEGESEN VÁLTOZOTT kártyák (changeInfo kulcsai) kapnak nevet — a VT
 * snapshot-költsége elemszám-arányos, ez tartja a frissítést nagy boardnál is gyorsnak.
 */
export const Motion = {
  reduced: matchMedia("(prefers-reduced-motion: reduce)"),
  _named: [],

  /** A poll-vezérelt render becsomagolása: csak a changeInfo-ban szereplő kártyák morfolnak. */
  transition(renderFn, changeInfo) {
    if (this.reduced.matches || !document.startViewTransition || !changeInfo || !changeInfo.size) {
      renderFn();
      return;
    }
    this._named = [];
    this.nameChangedCards(changeInfo);
    const vt = document.startViewTransition(() => {
      renderFn();
      this.nameChangedCards(changeInfo);
    });
    vt.finished.finally(() => this.clearNames()).catch(() => {});
  },

  /** Nézetváltásnál (Kanban→Feed stb.): egy 200ms-os, a #board-ra korlátozott crossfade —
   *  nem elemenkénti morf, mert a kártyák/sorok geometriája nézetenként eltérő. */
  transitionView(renderFn, boardEl) {
    if (this.reduced.matches || !document.startViewTransition) {
      renderFn();
      return;
    }
    if (boardEl) boardEl.style.viewTransitionName = "board";
    const vt = document.startViewTransition(() => renderFn());
    vt.finished.finally(() => { if (boardEl) boardEl.style.viewTransitionName = ""; }).catch(() => {});
  },

  nameChangedCards(changeInfo) {
    for (const id of changeInfo.keys()) {
      const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!el) continue;
      el.style.viewTransitionName = "t-" + id.replace(/[^a-zA-Z0-9_-]/g, "_");
      this._named.push(el);
    }
  },

  clearNames() {
    this._named.forEach(el => { el.style.viewTransitionName = ""; });
    this._named = [];
  },

  /** rAF-tween egy szám-elem textContentjén 300ms alatt (stat-számok, ac-count — 5.4).
   *  tabular-nums mellett a szélesség nem változik, csak a szám. */
  tweenNumber(el, to) {
    if (!el) return;
    const from = parseInt(el.textContent, 10);
    to = Number(to) || 0;
    if (!Number.isFinite(from) || from === to || this.reduced.matches) { el.textContent = String(to); return; }
    const dur = 300;
    const start = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const step = now => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
};

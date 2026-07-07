import { Utils } from "./Utils.js";

/**
 * User context panel ("📌 Kontextus"): a context.json tartalmát jeleníti meg
 * (cél, fókusz, init prompt, megkötések, döntések idővonala, nyitott kérdések, jegyzetek),
 * és a nyitó gombon badge-eli a döntések számát.
 */
export class ContextPanel {
  constructor(dom) {
    this.dom = dom; // { ctxBtn, ctxOverlay, ctxClose, ctxBody, ctxUpdated }
  }

  renderButton(context) {
    const n = context && Array.isArray(context.decisions) ? context.decisions.length : 0;
    this.dom.ctxBtn.classList.toggle("has", n > 0);
    if (n > 0) this.dom.ctxBtn.dataset.n = n; else delete this.dom.ctxBtn.dataset.n;
  }

  renderBody(context) {
    const c = context;
    if (!c) {
      this.dom.ctxUpdated.textContent = "";
      this.dom.ctxBody.innerHTML = `<p class="mut">Nincs <code>context.json</code> a forrás mellett. Az agent a session során hozza létre (init prompt + döntések), hogy új session-ben is folytatható legyen a munka.</p>`;
      return;
    }
    this.dom.ctxUpdated.textContent = c.updatedAt ? "· frissítve " + Utils.relTime(c.updatedAt) : "";
    const decisions = (Array.isArray(c.decisions) ? c.decisions : []).slice().sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    const list = (arr, empty) => (Array.isArray(arr) && arr.length) ? `<ul class="ctx-list">${arr.map(x => `<li>${Utils.esc(x)}</li>`).join("")}</ul>` : `<p class="mut">${empty}</p>`;
    this.dom.ctxBody.innerHTML =
      (c.goal ? `<h4>Cél</h4><p>${Utils.esc(c.goal)}</p>` : "") +
      (c.currentFocus ? `<h4>Jelenlegi fókusz</h4><p>${Utils.esc(c.currentFocus)}</p>` : "") +
      `<h4>Init prompt</h4>` + (c.initPrompt ? `<div class="ctx-quote">${Utils.esc(c.initPrompt)}</div>` : `<p class="mut">—</p>`) +
      `<h4>Megkötések</h4>` + list(c.constraints, "Nincs rögzített megkötés.") +
      `<h4>Döntések (${decisions.length})</h4>` +
      (decisions.length ? decisions.map(d => `<div class="decision">
        <div class="d-top"><span class="d-topic">${Utils.esc(d.topic || "döntés")}</span><span class="d-when" title="${Utils.esc(Utils.absTime(d.at))}">${Utils.esc(Utils.relTime(d.at))}</span></div>
        <div>${Utils.esc(d.decision || "")}</div>
        ${d.rationale ? `<div class="d-rat">↳ ${Utils.esc(d.rationale)}</div>` : ""}
      </div>`).join("") : `<p class="mut">Még nincs rögzített döntés.</p>`) +
      `<h4>Nyitott kérdések</h4>` + list(c.openQuestions, "Nincs nyitott kérdés.") +
      (c.notes ? `<h4>Megjegyzések</h4><p>${Utils.esc(c.notes)}</p>` : "");
  }

  show() { this.dom.ctxOverlay.classList.add("show"); }
  hide() { this.dom.ctxOverlay.classList.remove("show"); }
}

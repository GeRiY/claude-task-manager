import { Utils } from "./Utils.js";
import { I18n } from "./i18n.js";

/**
 * User context panel ("📌 Context"): renders context.json's contents (goal, focus, init
 * prompt, constraints, decision timeline, open questions, notes), and badges the opening
 * button with the decision count.
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
      this.dom.ctxBody.innerHTML = `<p class="mut">${I18n.t("ctx.none")}</p>`;
      return;
    }
    this.dom.ctxUpdated.textContent = c.updatedAt ? I18n.t("ctx.updated", { t: Utils.relTime(c.updatedAt) }) : "";
    const decisions = (Array.isArray(c.decisions) ? c.decisions : []).slice().sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    const list = (arr, empty) => (Array.isArray(arr) && arr.length) ? `<ul class="ctx-list">${arr.map(x => `<li>${Utils.esc(x)}</li>`).join("")}</ul>` : `<p class="mut">${empty}</p>`;
    this.dom.ctxBody.innerHTML =
      (c.goal ? `<h4>${Utils.esc(I18n.t("ctx.goal"))}</h4><p>${Utils.esc(c.goal)}</p>` : "") +
      (c.currentFocus ? `<h4>${Utils.esc(I18n.t("ctx.currentFocus"))}</h4><p>${Utils.esc(c.currentFocus)}</p>` : "") +
      `<h4>${Utils.esc(I18n.t("ctx.initPrompt"))}</h4>` + (c.initPrompt ? `<div class="ctx-quote">${Utils.esc(c.initPrompt)}</div>` : `<p class="mut">—</p>`) +
      `<h4>${Utils.esc(I18n.t("ctx.constraints"))}</h4>` + list(c.constraints, I18n.t("ctx.noConstraints")) +
      `<h4>${Utils.esc(I18n.t("ctx.decisions", { n: decisions.length }))}</h4>` +
      (decisions.length ? decisions.map(d => `<div class="decision">
        <div class="d-top"><span class="d-topic">${Utils.esc(d.topic || "decision")}</span><span class="d-when" title="${Utils.esc(Utils.absTime(d.at))}">${Utils.esc(Utils.relTime(d.at))}</span></div>
        <div>${Utils.esc(d.decision || "")}</div>
        ${d.rationale ? `<div class="d-rat">↳ ${Utils.esc(d.rationale)}</div>` : ""}
      </div>`).join("") : `<p class="mut">${Utils.esc(I18n.t("ctx.noDecisions"))}</p>`) +
      `<h4>${Utils.esc(I18n.t("ctx.openQuestions"))}</h4>` + list(c.openQuestions, I18n.t("ctx.noOpenQuestions")) +
      (c.notes ? `<h4>${Utils.esc(I18n.t("ctx.notes"))}</h4><p>${Utils.esc(c.notes)}</p>` : "");
  }

  show() { this.dom.ctxOverlay.classList.add("show"); }
  hide() { this.dom.ctxOverlay.classList.remove("show"); }
}

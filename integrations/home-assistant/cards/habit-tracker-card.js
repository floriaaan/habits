/* Connected Lovelace card. Only HA states/services: no API credentials here. */
class HabitTrackerCard extends HTMLElement {
  constructor() { super(); this.attachShadow({mode: "open"}); this._pending = false; }
  setConfig(config) {
    const modes = ["rings", "habits", "nutrition", "sport", "weekly", "heatmap"];
    if (!config.entity || !modes.includes(config.mode)) throw new Error("Habit Tracker : entity et mode (rings/habits/nutrition/sport/weekly/heatmap) requis");
    if (config.category && !["sport", "mind", "daily", "nutrition"].includes(config.category)) throw new Error("Catégorie inconnue");
    this._config = {...config}; this._state = null; this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const state = hass.states[this._config?.entity];
    if (state === this._state) return;
    this._state = state; this._render();
  }
  getCardSize() { return this._config?.mode === "rings" ? 5 : 4; }
  getGridOptions() { return {columns: "full", rows: "auto"}; }
  _escape(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c])); }
  _number(value, precision = 0) { return Number(value).toLocaleString("fr-FR", {maximumFractionDigits: precision}); }
  _percent(value) { return value === null || value === undefined ? "—" : `${this._number(value)} %`; }
  _color(item, fallback) { return /^#[0-9a-f]{6}$/i.test(item?.presentation?.color) ? item.presentation.color : fallback; }
  _label(category) { return {sport:"Sport", mind:"Esprit", daily:"Quotidien", nutrition:"Alimentation"}[category]; }
  _amount(item, value) {
    const unit = item.habit.unit;
    return unit === "meters" ? `${this._number(value / 1000, 2)} km` : unit === "milliliters" ? `${this._number(value / 1000, 2)} L` : unit === "seconds" ? `${this._number(value / 60, 1)} min` : this._number(value, 1);
  }
  _rings(groups) {
    const colors = ["#6e9cc7", "#a996c8", "#cfaa70", "#cf8898"];
    const arcs = groups.map((g, index) => {
      const radius = 98 - index * 16, circumference = 2 * Math.PI * radius;
      const items = g.habits.filter(h => h.eligible), totalWeight = items.reduce((sum, h) => sum + h.presentation.weight, 0);
      let start = 0;
      const segments = items.map(h => {
        const length = (h.percent / 100) * h.presentation.weight / totalWeight;
        const segment = `<circle cx="110" cy="110" r="${radius}" fill="none" stroke="${this._color(h, colors[index])}" stroke-width="13" stroke-dasharray="${Math.min(length * circumference, circumference - .002)} ${circumference}" stroke-dashoffset="${-start * circumference}" transform="rotate(-90 110 110)"/>`;
        start += length; return segment;
      }).join("");
      return `<circle cx="110" cy="110" r="${radius}" fill="none" stroke="currentColor" opacity=".1" stroke-width="13"/>${segments}`;
    }).join("");
    return `<div class="overview"><svg viewBox="0 0 220 220" role="img" aria-label="Progression globale ${this._escape(this._state.state)} pour cent">${arcs}<text x="110" y="108" text-anchor="middle">${this._percent(this._state.state === "unknown" ? null : Number(this._state.state))}</text><text class="caption" x="110" y="125" text-anchor="middle">GLOBAL</text></svg><div class="legend">${groups.map((g, i) => `<section><div class="line"><strong style="--habit-accent:${colors[i]}"><span class="dot"></span>${this._label(g.category)}</strong><b>${this._percent(g.percent)}</b></div><div class="details">${g.habits.map(h => `${this._escape(h.habit.name)} ${h.eligible ? (h.habit.kind === "boolean" ? (h.completed ? "réalisé" : "à faire") : `${this._amount(h,h.progress)} / ${this._amount(h,h.target)}`) : "repos"}`).join(" · ") || "Aucune habitude"}</div></section>`).join("")}</div></div>`;
  }
  _controls(item) {
    const id = this._escape(item.habit.id), name = this._escape(item.habit.name);
    const disabled = this._pending ? "disabled" : "";
    if (item.habit.kind === "boolean") return `<button class="check" data-id="${id}" data-action="${item.completed ? "uncomplete" : "complete"}" aria-label="${item.completed ? "Annuler" : "Valider"} ${name}" aria-pressed="${item.completed}" ${disabled || (!item.actionable && !item.completed ? "disabled" : "")}><ha-icon icon="${item.completed ? "mdi:checkbox-marked" : "mdi:checkbox-blank-outline"}"></ha-icon></button>`;
    return `<div class="buttons"><button data-id="${id}" data-action="decrement" aria-label="Retirer ${this._escape(this._amount(item,item.presentation.step))} de ${name}" ${disabled || (item.progress <= 0 ? "disabled" : "")}><ha-icon icon="mdi:minus"></ha-icon></button><small>Pas : ${this._amount(item,item.presentation.step)}</small><button data-id="${id}" data-action="increment" aria-label="Ajouter ${this._escape(this._amount(item,item.presentation.step))} à ${name}" ${disabled || (!item.actionable ? "disabled" : "")}><ha-icon icon="mdi:plus"></ha-icon></button></div>`;
  }
  _habit(item) {
    const name = this._escape(item.habit.name), icon = this._escape(item.presentation.icon || "mdi:check-circle-outline");
    let illustration = "";
    if (item.presentation.illustration !== "plain") {
      const count = Math.min(32, Math.ceil(item.target / item.presentation.step));
      const filled = item.progress / item.presentation.step;
      illustration = `<div class="portions" style="--portion-count:${Math.min(count,8)}" aria-label="${name} : ${this._amount(item,item.progress)} sur ${this._amount(item,item.target)}">${Array.from({length:count}, (_,i) => `<span class="portion ${item.presentation.illustration === "water" ? "water" : "produce"}" style="--fill:${Math.max(0,Math.min(1,filled-i))*100}%" aria-hidden="true">${item.presentation.illustration === "portions" ? '<ha-icon icon="mdi:food-apple-outline"></ha-icon>' : ""}</span>`).join("")}</div>`;
    }
    return `<section style="--habit-accent:${this._color(item, "var(--primary-color, #75b7ad)")}"><div class="line"><strong><ha-icon icon="${icon}"></ha-icon>${name}</strong><b>${this._percent(item.percent)}</b>${item.habit.kind === "boolean" ? this._controls(item) : ""}</div><div class="details">${!item.eligible ? "Repos · exclu des objectifs" : item.habit.kind === "boolean" ? (item.completed ? "Terminé" : "À faire") : `${this._amount(item,item.progress)} / ${this._amount(item,item.target)}`}${item.eligible && !item.actionable ? " · fenêtre de saisie fermée" : ""}</div>${illustration}${item.habit.kind !== "boolean" ? this._controls(item) : ""}</section>`;
  }
  _habits(groups) {
    const colors = {sport:"#6e9cc7", mind:"#a996c8", daily:"#cfaa70", nutrition:"#cf8898"};
    const selected = groups.filter(g => !this._config.category || g.category === this._config.category);
    return selected.map(g => `<div class="group" style="--habit-accent:${this._color(g.habits[0],colors[g.category])}"><div class="line"><h2>${this._label(g.category)}</h2><span>${g.completed} / ${g.eligible}</span></div><progress max="100" value="${g.percent ?? 0}" aria-label="Progression ${this._label(g.category)}"></progress>${g.habits.map(h => this._habit(h)).join("") || '<p>Aucune habitude dans cette catégorie.</p>'}</div>`).join("");
  }
  _weekly(weekly) {
    return `<h2>Régularité sur 7 jours</h2><p class="details">Progression des objectifs · semaine actuelle et précédente</p><div class="chart">${weekly.current.map((day,i) => `<div><div class="pair"><span class="bar previous" style="height:${weekly.previous[i].percent ?? 0}%" title="${weekly.previous[i].date} : ${this._percent(weekly.previous[i].percent)}"></span><span class="bar" style="height:${day.percent ?? 0}%" title="${day.date} : ${this._percent(day.percent)}"></span></div><small>${["L","M","M","J","V","S","D"][i]}</small></div>`).join("")}</div><div class="details">Précédente : ${this._percent(weekly.previous_percent)} · Actuelle : ${this._percent(weekly.current_percent)}</div><p>Objectifs réalisés : ${this._percent(weekly.current_success_percent)} · Série : ${this._state.attributes.streak_91_days?.current ?? 0} jours <small>(historique de 91 jours)</small></p>`;
  }
  _heatmap(days) {
    return `<h2>Historique</h2><p class="details">13 semaines · dates locales · repos et absence de données exclus</p><div class="heatmap">${days.map(day => `<span class="cell ${day.percent == null ? "empty" : ""}" style="--intensity:${(day.percent ?? 0)/100}" title="${day.date} : ${this._percent(day.percent)} · ${day.completed}/${day.eligible}"></span>`).join("")}</div>`;
  }
  _render() {
    if (!this._config) return;
    const focused = this.shadowRoot.activeElement?.dataset;
    const state = this._state;
    let body;
    if (!state || state.state === "unavailable" || state.state === "unknown" && !state.attributes?.groups) body = '<p role="status">Dashboard indisponible. Vérifiez l’intégration Habit Tracker et sa connexion.</p>';
    else {
      const data = state.attributes, mode = this._config.mode;
      if (!data.groups?.length) body = '<p>Aucune habitude. Créez vos objectifs dans l’API Habit Tracker.</p>';
      else if (mode === "rings") body = this._rings(data.groups);
      else if (mode === "weekly") body = this._weekly(data.weekly);
      else if (mode === "heatmap") body = this._heatmap(data.heatmap);
      else if (["nutrition", "sport"].includes(mode)) {
        const group = data.groups.find(g => g.category === mode);
        body = `<h2>${this._label(mode)}</h2>${group?.habits.map(h => this._habit(h)).join("") || '<p>Aucune habitude dans cette catégorie.</p>'}`;
      } else body = this._habits(data.groups);
    }
    this.shadowRoot.innerHTML = `<style>${HabitTrackerCard.css}</style><ha-card aria-busy="${this._pending}">${body}<p class="error" role="alert">${this._escape(this._error || "")}</p></ha-card>`;
    this.shadowRoot.querySelectorAll("button[data-action]").forEach(button => button.addEventListener("click", async () => {
      if (this._pending) return;
      this._pending = true; this._error = null; this._render();
      try { await this._hass.callService("habit_tracker", "perform_action", {entity_id:this._config.entity, habit_id:button.dataset.id, action:button.dataset.action}); }
      catch (_) { this._error = "Action refusée ou connexion interrompue. Vérifiez le résultat avant de réessayer."; }
      finally { this._pending = false; this._render(); }
    }));
    if (focused?.id && focused?.action) this.shadowRoot.querySelector(`button[data-id="${CSS.escape(focused.id)}"][data-action="${CSS.escape(focused.action)}"]`)?.focus({preventScroll:true});
  }
}
HabitTrackerCard.css = `
:host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--primary-font-family,inherit)}
*{box-sizing:border-box} ha-card{display:block;width:100%;padding:24px;border-radius:24px;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);box-shadow:none}
h2{font-size:18px;line-height:1.4;margin:0 0 12px}p{line-height:1.6;margin:8px 0}button,progress{accent-color:var(--habit-accent,var(--primary-color))}
.overview{display:grid;grid-template-columns:minmax(180px,230px) minmax(0,1fr);gap:28px;align-items:center}.overview svg{width:100%;height:auto}.overview text{fill:currentColor;font-size:25px;font-weight:700}.overview .caption{font-size:10px;font-weight:500}
.line{display:flex;align-items:center;gap:12px}.line strong{display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow-wrap:anywhere}.line b,.line>span{font-variant-numeric:tabular-nums;white-space:nowrap}.line h2{flex:1;margin:0}
section{padding:14px 0}section+section{border-top:1px solid var(--divider-color)}.details,small{color:var(--secondary-text-color);font-size:12px;line-height:1.6}.details{margin-top:6px;overflow-wrap:anywhere}.dot{width:8px;height:8px;background:var(--habit-accent);border-radius:50%}ha-icon{color:var(--habit-accent);--mdc-icon-size:22px;flex-shrink:0}
.group+.group{margin-top:28px}progress{width:100%;height:6px;margin:14px 0 0;border:0;border-radius:4px}progress::-webkit-progress-bar{background:var(--divider-color);border-radius:4px}progress::-webkit-progress-value{background:var(--habit-accent,var(--primary-color));border-radius:4px}
button{width:44px;height:44px;border:0;border-radius:50%;background:var(--secondary-background-color);color:var(--primary-text-color);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}button:hover:not(:disabled){background:var(--divider-color)}button:disabled{opacity:.4;cursor:default}button:focus-visible{outline:3px solid var(--primary-color);outline-offset:3px}.buttons{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:12px}.check{background:transparent}.check[aria-pressed=true] ha-icon{color:var(--habit-accent,var(--primary-color))}
.portions{display:grid;grid-template-columns:repeat(var(--portion-count),minmax(0,1fr));gap:6px;margin:18px 0}.portion{width:100%;max-width:48px;justify-self:center;height:48px;border-radius:5px;background:linear-gradient(to top,var(--habit-accent) var(--fill),var(--divider-color) var(--fill));display:flex;align-items:center;justify-content:center}.water{clip-path:polygon(0 0,100% 0,85% 100%,15% 100%)}.produce{width:100%;height:44px}.produce ha-icon{color:var(--primary-text-color)}
.chart{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px;margin:22px 0}.chart>div{text-align:center}.pair{height:120px;display:flex;align-items:end;justify-content:center;gap:5px}.bar{width:16px;max-width:40%;border-radius:5px 5px 0 0;background:var(--primary-color,#70a36b)}.previous{background:var(--divider-color)}
.heatmap{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);grid-template-columns:repeat(13,minmax(0,1fr));gap:4px;margin-top:22px}.cell{display:block;aspect-ratio:1;border-radius:3px;background:color-mix(in srgb,var(--primary-color,#70a36b) calc(15% + var(--intensity)*85%),var(--ha-card-background,var(--card-background-color)))}.empty{background:var(--divider-color);opacity:.45}.error{color:var(--error-color);font-size:13px}.error:empty{display:none}::selection{background:var(--primary-color);color:var(--text-primary-color)}
@container(max-width:600px){ha-card{padding:20px}.overview{grid-template-columns:1fr;gap:14px}.overview svg{max-width:220px;justify-self:center}.chart{gap:8px}.heatmap{gap:3px}.line{gap:8px}.line strong{font-size:14px}.line b{font-size:14px}}
`;
if (!customElements.get("habit-tracker-card")) customElements.define("habit-tracker-card", HabitTrackerCard);
window.customCards = window.customCards || [];
window.customCards.push({type:"habit-tracker-card",name:"Habit Tracker",description:"Dashboard connecté, objectifs, actions et historique réels"});

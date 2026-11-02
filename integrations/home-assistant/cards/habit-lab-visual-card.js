
class HabitLabVisualCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: "open"});
    this._signature = null;
  }
  setConfig(config) {
    if (!["rings", "weekly", "heatmap"].includes(config.mode)) {
      throw new Error("Habit Lab: mode attendu (rings, weekly ou heatmap)");
    }
    this._config = {...config};
    this._signature = null;
    this._render();
  }
  set hass(value) {
    this._hass = value;
    this._render();
  }
  getCardSize() { return this._config?.mode === "rings" ? 5 : 4; }
  getGridOptions() { return {columns: "full", rows: "auto"}; }
  _state(entityId) {
    return this._hass?.states?.[entityId]?.state ?? "unknown";
  }
  _number(entityId) {
    const value = Number(this._state(entityId));
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  _done(entityId) {
    return this._state(entityId) === "on";
  }
  _format(number, precision = 0) {
    return number.toLocaleString("fr-FR", {maximumFractionDigits: precision});
  }
  _clamp(value) { return Math.max(0, Math.min(1, value)); }
  _svgArc(radius, progress, color, start = 0, rounded = true) {
    const circumference = 2 * Math.PI * radius;
    const length = this._clamp(progress) * circumference;
    const id = color.match(/--habit-([a-z]+)/)?.[1] || "unknown";
    // Les arcs à zéro restent dans le DOM : leur disparition doit aussi s'animer.
    return '<circle data-habit-arc="' + id + '" cx="110" cy="110" r="' + radius +
      '" fill="none" stroke="' + color + '" stroke-width="14" stroke-linecap="' +
      (rounded ? "round" : "butt") + '" stroke-dasharray="' +
      Math.min(length, circumference - 0.002) + ' ' + circumference +
      '" stroke-dashoffset="' + (-start * circumference) +
      '" transform="rotate(-90 110 110)" />';
  }
  _track(radius) {
    return '<circle cx="110" cy="110" r="' + radius +
      '" fill="none" stroke="var(--primary-text-color)" stroke-opacity=".10" stroke-width="14"/>';
  }

  _rings() {
    const lecture = this._done("input_boolean.labo_habits_lecture");
    const meditation = this._done("input_boolean.labo_habits_meditation");
    const rangement = this._done("input_boolean.labo_habits_rangement");
    const run = this._number("input_number.labo_habits_running_km");
    const swim = this._number("input_number.labo_habits_natation_m");
    const water = this._number("input_number.labo_habits_eau_consommee");
    const produce = this._number("input_number.labo_habits_fruits_et_legumes");
    const runningRatio = this._clamp(run / 25);
    const swimmingRatio = this._clamp(swim / 3000);
    const waterRatio = this._clamp(water / 2000);
    const produceRatio = this._clamp(produce / 5);
    const sport = (runningRatio + swimmingRatio) / 2;
    const esprit = (Number(lecture) + Number(meditation)) / 2;
    const quotidien = Number(rangement);
    const alimentation = (waterRatio + produceRatio) / 2;
    const global = Math.round((sport + esprit + quotidien + alimentation) / 4 * 100);
    const sportPercent = Math.round(sport * 100);
    const espritPercent = Math.round(esprit * 100);
    const quotidienPercent = Math.round(quotidien * 100);
    const alimentationPercent = Math.round(alimentation * 100);
    const svg = '<svg viewBox="0 0 220 220" role="img" aria-label="Progression globale ' + global +
      ' pour cent ; sport ' + sportPercent + ' pour cent ; esprit ' +
      espritPercent + ' pour cent ; quotidien ' + quotidienPercent +
      ' pour cent ; alimentation ' + alimentationPercent + ' pour cent">' +
      this._track(98) + this._track(82) + this._track(66) + this._track(50) +
      this._svgArc(98, runningRatio / 2, "var(--habit-run)", 0, false) +
      this._svgArc(98, swimmingRatio / 2, "var(--habit-swim)", runningRatio / 2, false) +
      this._svgArc(82, esprit, "var(--habit-mind)") +
      this._svgArc(66, quotidien, "var(--habit-daily)") +
      this._svgArc(50, waterRatio / 2, "var(--habit-water)", 0, false) +
      this._svgArc(50, produceRatio / 2, "var(--habit-produce)", waterRatio / 2, false) +
      '<text x="110" y="108" text-anchor="middle" fill="var(--primary-text-color)" font-size="23" font-weight="700">' + global + '%</text>' +
      '<text x="110" y="124" text-anchor="middle" fill="var(--secondary-text-color)" font-size="9">GLOBAL</text></svg>';
    return '<div class="hero">' +
      '<div class="top"><div><div class="eyebrow">VOTRE RYTHME</div><div class="headline">Quatre piliers, un équilibre</div></div>' +
      '<span class="top-note">Objectifs en cours</span></div>' +
      '<div class="hero-layout"><div class="rings">' + svg + '</div>' +
      '<div class="legend">' +
      '<div class="legend-item"><div class="legend-head"><div class="legend-title"><span class="double-dot"><i class="dot" style="background:var(--habit-run)"></i><i class="dot" style="background:var(--habit-swim)"></i></span>Sport</div><strong>' + sportPercent + ' %</strong></div>' +
      '<div class="legend-detail"><span class="legend-part"><i class="dot" style="background:var(--habit-run)"></i>Course <b>' + this._format(run, 1) + ' / 25 km</b></span><span class="legend-part"><i class="dot" style="background:var(--habit-swim)"></i>Natation <b>' + this._format(swim) + ' / 3 000 m</b></span></div></div>' +
      '<div class="legend-item"><div class="legend-head"><div class="legend-title"><i class="dot" style="background:var(--habit-mind)"></i>Esprit</div><strong>' + espritPercent + ' %</strong></div>' +
      '<div class="legend-detail">' + (lecture ? 'Lecture réalisée' : 'Lecture à faire') + ' <span class="sep">·</span> ' + (meditation ? 'Méditation réalisée' : 'Méditation à faire') + '</div></div>' +
      '<div class="legend-item"><div class="legend-head"><div class="legend-title"><i class="dot" style="background:var(--habit-daily)"></i>Quotidien</div><strong>' + quotidienPercent + ' %</strong></div>' +
      '<div class="legend-detail">' + (rangement ? 'Rangement effectué' : 'Rangement à faire') + '</div></div>' +
      '<div class="legend-item"><div class="legend-head"><div class="legend-title"><span class="double-dot"><i class="dot" style="background:var(--habit-water)"></i><i class="dot" style="background:var(--habit-produce)"></i></span>Alimentation</div><strong>' + alimentationPercent + ' %</strong></div>' +
      '<div class="legend-detail"><span class="legend-part"><i class="dot" style="background:var(--habit-water)"></i>Eau <b>' + this._format(water) + ' / 2 000 mL</b></span><span class="legend-part"><i class="dot" style="background:var(--habit-produce)"></i>Fruits et légumes <b>' + this._format(produce) + ' / 5 portions</b></span></div></div>' +
      '</div></div>' +
      '<div class="foot">Sport et alimentation : deux objectifs de même poids par catégorie. Les valeurs sont des données de laboratoire.</div></div>';
  }
  _weekly() {
    const current = [0.70, 1, 0.65, 0.85, 0.95, 0.45, 0.8];
    const previous = [0.55, 0.7, 0.8, 0.6, 0.8, 0.7, 0.6];
    const labels = ["L", "M", "M", "J", "V", "S", "D"];
    const bars = current.map((rate, i) => '<div class="bar-group">' +
      '<div class="bar-pair"><span class="bar bar-prev" style="height:' + (previous[i] * 100) + '%"></span>' +
      '<span class="bar bar-now" style="height:' + (rate * 100) + '%"></span></div>' +
      '<div class="bar-label">' + labels[i] + '</div></div>').join("");
    return '<div class="content"><div class="card-title">Régularité sur 7 jours</div>' +
      '<div class="sub">Semaine actuelle vs précédente · simulation</div>' +
      '<div class="bar-chart">' + bars + '</div>' +
      '<div class="keys"><span><i class="dot" style="background:var(--divider-color)"></i>Précédente</span>' +
      '<span><i class="dot" style="background:var(--habit-daily)"></i>Actuelle</span></div>' +
      '<div class="summary"><div><strong>79 %</strong><small>Réussite</small></div><div><strong>12 jours</strong><small>Série fictive</small></div></div></div>';
  }
  _heatmap() {
    const shades = [
      "var(--habit-neutral)",
      "color-mix(in srgb, var(--habit-green) 28%, var(--ha-card-background,var(--card-background-color)))",
      "color-mix(in srgb, var(--habit-green) 59%, var(--ha-card-background,var(--card-background-color)))",
      "var(--habit-green)"
    ];
    let weeks = "";
    for (let w = 0; w < 13; w++) {
      let cells = "";
      for (let d = 0; d < 7; d++) {
        const i = w * 7 + d;
        const level = (i * 17 + Math.floor(i / 7) * 11) % 13;
        const shade = shades[level < 2 ? 0 : level < 5 ? 1 : level < 9 ? 2 : 3];
        cells += '<span class="heat-cell" title="Donnée fictive · semaine ' + (w + 1) + ' · jour ' + (d + 1) + '" style="background:' + shade + '"></span>';
      }
      weeks += '<div class="week">' + cells + '</div>';
    }
    return '<div class="content"><div class="heat-head"><div><div class="card-title">Historique</div>' +
      '<div class="sub">13 dernières semaines · simulation</div></div><strong class="heat-value">84 %</strong></div>' +
      '<div class="heatmap">' + weeks + '</div><div class="keys heat-key"><span>Moins</span>' +
      shades.map(s => '<i class="heat-step" style="background:' + s + '"></i>').join("") +
      '<span>Plus</span></div><div class="sub heat-note">Aucun historique réel enregistré.</div></div>';
  }
  _render() {
    if (!this._config) return;
    const mode = this._config.mode;
    const signature = mode === "rings"
      ? ["input_boolean.labo_habits_lecture", "input_boolean.labo_habits_meditation", "input_boolean.labo_habits_rangement",
         "input_number.labo_habits_running_km", "input_number.labo_habits_natation_m",
         "input_number.labo_habits_eau_consommee", "input_number.labo_habits_fruits_et_legumes"].map(id => this._state(id)).join("|")
      : mode;
    if (this._signature === signature) return;

    // Sauvegarde de la progression *visuelle* au moment du changement
    // afin que les validations rapides ne relancent pas l'animation à zéro.
    const previous = {};
    if (mode === "rings") {
      this.shadowRoot.querySelectorAll('circle[data-habit-arc]').forEach(circle => {
        const style = getComputedStyle(circle);
        previous[circle.dataset.habitArc] = {
          dash: style.strokeDasharray,
          offset: style.strokeDashoffset
        };
      });
    }

    this._signature = signature;
    const body = mode === "rings" ? this._rings() : mode === "weekly" ? this._weekly() : this._heatmap();
    this.shadowRoot.innerHTML = '<style>' + HabitLabVisualCard.css + '</style><ha-card>' + body + '</ha-card>';

    if (mode !== "rings" || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Transitions progressives des quatre segments, dans les deux sens.
    // Le décalage du segment "swim" est animé avec son remplissage.
    this.shadowRoot.querySelectorAll('circle[data-habit-arc]').forEach(circle => {
      const finalDash = circle.getAttribute("stroke-dasharray");
      const finalOffset = circle.getAttribute("stroke-dashoffset");
      const old = previous[circle.dataset.habitArc];
      const radius = Number(circle.getAttribute("r"));
      const circumference = 2 * Math.PI * radius;
      const initialDash = old?.dash || ('0 ' + circumference);
      const initialOffset = old?.offset || (circle.dataset.habitArc === "swim" ? "0" : finalOffset);
      if (initialDash === finalDash && initialOffset === finalOffset) return;

      circle.style.transition = "none";
      circle.style.strokeDasharray = initialDash;
      circle.style.strokeDashoffset = initialOffset;
      circle.getBoundingClientRect(); // Valide l'état initial avant transition.
      circle.style.transition = "stroke-dasharray 800ms cubic-bezier(.22,1,.36,1), stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)";

      requestAnimationFrame(() => {
        if (!circle.isConnected) return;
        circle.style.strokeDasharray = finalDash;
        circle.style.strokeDashoffset = finalOffset;
      });
    });
  }
}
HabitLabVisualCard.css = `
:host {
  display: block !important;
  width: 100% !important;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  container-type: inline-size;
  --habit-run: #6e9cc7;
  --habit-swim: #75b7ad;
  --habit-mind: #a996c8;
  --habit-daily: #cfaa70;
  --habit-water: #cf8898;
  --habit-produce: #91ae85;
  --habit-green: #70a36b;
  --habit-neutral: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
}
*, *::before, *::after { box-sizing: border-box; }
ha-card {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border-radius: 26px;
  overflow: hidden;
  background: var(--ha-card-background, var(--card-background-color));
  box-shadow: none !important;
  color: var(--primary-text-color);
  font-family: var(--primary-font-family, inherit);
}
.hero { padding: 24px 28px 19px; }
.top { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.eyebrow { font-size: 10px; letter-spacing: 1.1px; font-weight: 750; color: var(--secondary-text-color); }
.headline { margin-top: 5px; font-size: 22px; font-weight: 650; letter-spacing: -.25px; }
.top-note { white-space: nowrap; font-size: 11px; color: var(--secondary-text-color); }
.hero-layout {
  margin-top: 13px;
  display: grid;
  grid-template-columns: minmax(190px, 235px) minmax(0, 1fr);
  align-items: center;
  column-gap: clamp(16px, 3%, 42px);
}
.rings { width: 100%; max-width: 235px; min-width: 0; justify-self: center; }
.rings svg { display: block; width: 100%; height: auto; overflow: visible; }
.legend { min-width: 0; }
.legend-item { padding: 10px 0 12px; }
.legend-item + .legend-item { border-top: 1px solid var(--divider-color); }
.legend-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.legend-title { font-size: 15px; font-weight: 650; display: flex; align-items: center; gap: 9px; }
.legend-head strong { font-size: 17px; font-variant-numeric: tabular-nums; }
.legend-detail { font-size: 12px; color: var(--secondary-text-color); padding-left: 17px; margin-top: 6px; line-height: 1.5; display: flex; flex-wrap: wrap; gap: 4px 13px; }
.legend-detail b { font-weight: 500; color: var(--primary-text-color); }
.legend-part { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.legend-part .dot { width: 6px; height: 6px; }
.double-dot { display: inline-flex; align-items: center; gap: 2px; }
.sep { opacity: .6; }
.foot { border-top: 1px solid var(--divider-color); padding-top: 12px; margin-top: 15px; font-size: 11px; line-height: 1.45; color: var(--secondary-text-color); }
.content { padding: 23px 25px; }
.card-title { font-size: 18px; font-weight: 650; }
.sub { color: var(--secondary-text-color); font-size: 11px; line-height: 1.5; margin-top: 4px; }
.bar-chart { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); gap: 10px; margin-top: 22px; }
.bar-group { min-width: 0; }
.bar-pair { height: 118px; display: flex; align-items: end; justify-content: center; gap: 5px; }
.bar { display: block; width: min(34%,18px); min-width: 6px; border-radius: 6px 6px 2px 2px; }
.bar-prev { background: var(--divider-color); }
.bar-now { background: var(--habit-green); }
.bar-label { text-align: center; color: var(--secondary-text-color); font-size: 10px; margin-top: 9px; }
.keys { display: flex; align-items: center; gap: 15px; margin-top: 17px; font-size: 11px; color: var(--secondary-text-color); }
.keys span { display: inline-flex; align-items: center; gap: 6px; }
.summary { display: flex; gap: 30px; padding-top: 16px; margin-top: 18px; border-top: 1px solid var(--divider-color); }
.summary > div { display: flex; flex-direction: column; gap: 3px; }
.summary strong { font-size: 22px; font-weight: 700; }
.summary small { font-size: 11px; color: var(--secondary-text-color); }
.heat-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; }
.heat-value { font-size: 22px; font-variant-numeric: tabular-nums; }
.heatmap { display: grid; grid-template-columns: repeat(13,minmax(0,1fr)); gap: 4px; width: 100%; margin-top: 22px; }
.week { min-width: 0; display: grid; grid-template-rows: repeat(7,minmax(0,1fr)); gap: 4px; }
.heat-cell { display: block; width: 100%; min-width: 0; aspect-ratio: 1; border-radius: 4px; }
.heat-key { justify-content: end; gap: 5px; }
.heat-key span { margin: 0 5px; }
.heat-step { width: 11px; height: 11px; border-radius: 3px; }
.heat-note { margin-top: 15px; }
@container (max-width: 650px) {
  .hero { padding: 21px 20px 18px; }
  .hero-layout { grid-template-columns: 1fr; row-gap: 3px; margin-top: 7px; }
  .rings { max-width: 210px; }
  .legend-item { padding: 10px 0; }
  .legend-detail { padding-left: 17px; }
  .headline { font-size: 20px; }
  .top-note { display: none; }
  .content { padding: 19px 18px; }
  .bar-chart { gap: 6px; }
  .bar-pair { height: 100px; gap: 4px; }
  .heatmap, .week { gap: 3px; }
  .heat-cell { border-radius: 3px; }
}
`;
customElements.define("habit-lab-visual-card", HabitLabVisualCard);
window.customCards = window.customCards || [];
window.customCards.push({type: "habit-lab-visual-card", name:"Habit Lab Visual", description:"Anneaux et statistiques de démonstration"});

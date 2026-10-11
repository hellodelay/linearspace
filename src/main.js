// App shell: deployment, battle playback controls, HUD. Owns no game rules.
import { BattleView } from './present/view.js';
import { Playback, SPEEDS } from './present/playback.js';
import { CRITICAL_TYPES, buildTimeline, validateTimeline } from './present/timeline.js';
import { simulate } from './sim/simulate.js';
import { DEFAULT_SCENARIO, buildBattleSetup, validateDeployment } from './sim/battle.js';
import { ROLE_LABELS, UNIT_DEFS } from './sim/data.js';
import { SIM_CONFIG, attackIntervalTU, moveTUPerHex } from './sim/config.js';
import { axialToOffset, hexDisk, hexKey, offsetToAxial } from './sim/hex.js';
import { formatEvent, unitNames } from './sim/format.js';

const SECONDS_PER_TU = 0.8;
const LOG_LINES = 120;
const COLORS = { zone: 0x0b2433, range: 0x14485e, self: 0x2a7f9e, enemyRange: 0x3d1020, aoe: 0x47101c };

const scenario = DEFAULT_SCENARIO;
const $ = (id) => document.getElementById(id);
const el = {
  stage: $('stage'),
  canvas: $('view'),
  fx: $('fx'),
  tu: $('tu-readout'),
  mode: $('mode-label'),
  banner: $('banner'),
  toast: $('toast'),
  inspect: $('inspect'),
  log: $('log'),
  roster: $('roster'),
  deployMsg: $('deploy-msg'),
  seed: $('seed'),
  commit: $('btn-commit'),
  play: $('btn-play'),
  scrub: $('scrub'),
  speeds: $('speeds'),
};

const view = new BattleView(el.canvas, el.fx);
view.setGrid(scenario.grid.width, scenario.grid.height);

const app = {
  mode: 'deploy',
  deployment: scenario.defaultDeployment.map((d) => ({ ...d })),
  selectedDef: null,
  inspectId: null,
  playback: null,
  timeline: null,
  result: null,
  names: {},
  shownTU: -1,
  scrubbing: false,
  deployClock: 0,
};
window.linearSpace = { app, view };

// ---- Layout ----

new ResizeObserver(() => view.resize(el.stage.clientWidth, el.stage.clientHeight)).observe(el.stage);
view.resize(el.stage.clientWidth, el.stage.clientHeight);

// ---- Deployment ----

const seed = () => Number(el.seed.value) >>> 0;
const draftSetup = () => buildBattleSetup({ scenario, deployment: app.deployment, seed: seed() });
const inZone = (off) => scenario.deployRows.includes(off.row) && off.col >= 0 && off.col < scenario.grid.width;
const deployIndex = (defId) => app.deployment.findIndex((d) => d.defId === defId);

function enterDeploy() {
  app.mode = 'deploy';
  app.playback = null;
  app.timeline = null;
  app.inspectId = null;
  document.body.dataset.mode = 'deploy';
  el.mode.textContent = 'DEPLOY';
  el.tu.textContent = `Seed ${seed()}`;
  hideBanner();
  el.log.innerHTML = '';
  view.clearEffects();
  refreshDeploy();
}

function refreshDeploy() {
  const setup = draftSetup();
  view.loadSetup(setup);
  const colors = new Map();
  for (const row of scenario.deployRows) {
    for (let col = 0; col < scenario.grid.width; col++) colors.set(hexKey(offsetToAxial(col, row)), COLORS.zone);
  }
  const shown = app.inspectId ?? (deployIndex(app.selectedDef) >= 0 ? `p${deployIndex(app.selectedDef) + 1}` : null);
  if (shown) paintRange(colors, setup, shown);
  view.setHighlights(colors);
  view.setSelected(shown);
  renderRoster();
  renderInspect(shown, setup);
  const errors = validateDeployment(scenario, app.deployment);
  el.commit.disabled = errors.length > 0;
  el.deployMsg.textContent = errors[0] ?? `${app.deployment.length}/${scenario.deployCap} deployed. Tap a card, then a blue hex.`;
}

function paintRange(colors, setup, unitId) {
  const spec = setup.units.find((u) => u.id === unitId);
  if (!spec) return;
  const def = setup.defs[spec.defId];
  const enemy = spec.side === 'enemy';
  for (const h of hexDisk(spec.pos, def.stats.range)) {
    if (view.grid.has(h)) colors.set(hexKey(h), enemy ? COLORS.enemyRange : COLORS.range);
  }
  colors.set(hexKey(spec.pos), enemy ? COLORS.aoe : COLORS.self);
}

function renderRoster() {
  el.roster.innerHTML = '';
  for (const defId of scenario.roster) {
    const def = UNIT_DEFS[defId];
    const placed = deployIndex(defId) >= 0;
    const card = document.createElement('button');
    card.className = `card${app.selectedDef === defId ? ' selected' : ''}${placed ? ' placed' : ''}`;
    card.style.setProperty('--unit-color', `#${def.visual.color.toString(16).padStart(6, '0')}`);
    card.innerHTML = `
      <span class="card-name">${def.name}</span>
      <span class="card-role">${ROLE_LABELS[def.role]}</span>
      <span class="card-stats">HP ${def.stats.hp} / RNG ${def.stats.range}</span>
      <span class="card-state">${placed ? (app.selectedDef === defId ? 'tap to bench' : 'deployed') : 'bench'}</span>`;
    card.addEventListener('click', () => onCard(defId));
    el.roster.appendChild(card);
  }
}

function onCard(defId) {
  app.inspectId = null;
  const idx = deployIndex(defId);
  if (app.selectedDef === defId && idx >= 0) {
    app.deployment.splice(idx, 1);
    app.selectedDef = null;
  } else {
    app.selectedDef = defId;
  }
  refreshDeploy();
}

function onDeployTap(hex) {
  if (!hex) {
    app.selectedDef = null;
    app.inspectId = null;
    return refreshDeploy();
  }
  const occupant = view.unitAt(hex);
  if (occupant?.startsWith('e')) {
    app.inspectId = app.inspectId === occupant ? null : occupant;
    return refreshDeploy();
  }
  app.inspectId = null;
  if (occupant) {
    app.selectedDef = app.deployment[Number(occupant.slice(1)) - 1].defId;
    return refreshDeploy();
  }
  const off = axialToOffset(hex);
  if (!app.selectedDef || !inZone(off)) return refreshDeploy();
  const idx = deployIndex(app.selectedDef);
  if (idx < 0 && app.deployment.length >= scenario.deployCap) {
    showToast(`Deployment cap is ${scenario.deployCap}`);
    return;
  }
  const entry = { defId: app.selectedDef, col: off.col, row: off.row };
  if (idx >= 0) app.deployment[idx] = entry;
  else app.deployment.push(entry);
  refreshDeploy();
}

// ---- Battle ----

const sink = {
  reset(timeline) {
    view.reset(timeline);
    hideBanner();
  },
  onCue(cue, silent) {
    view.onCue(cue, silent);
    if (cue.ev.type === 'battle_end') showBanner(cue.ev.winner);
    else if (cue.ev.type === 'timeout_begin' && !silent) showToast('OVERTIME - all units take damage each TU');
  },
};

function commit() {
  const errors = validateDeployment(scenario, app.deployment);
  if (errors.length) return showToast(errors[0]);
  const setup = draftSetup();
  const t0 = performance.now();
  const result = simulate(setup);
  const simMs = performance.now() - t0;
  const timeline = buildTimeline(result.log);
  const problems = validateTimeline(timeline);
  if (problems.length) console.warn('Timeline contract violations', problems);

  app.mode = 'battle';
  app.result = result;
  app.timeline = timeline;
  app.names = unitNames(result.log);
  app.inspectId = null;
  app.shownTU = -1;
  app.playback = new Playback(timeline, sink, { secondsPerTU: SECONDS_PER_TU });
  app.playback.speed = Number(el.speeds.querySelector('.active')?.dataset.speed ?? 1);
  document.body.dataset.mode = 'battle';
  el.mode.textContent = 'BATTLE';
  el.scrub.max = String(timeline.duration);
  view.setHighlights(null);
  view.setSelected(null);
  renderInspect(null);
  console.info(`Simulated ${result.endTU + 1} TU, ${result.log.length} events in ${simMs.toFixed(1)} ms; winner ${result.winner}`);
}

function onBattleTap(hex) {
  const id = hex ? view.unitAt(hex) : null;
  app.inspectId = id && id !== app.inspectId ? id : null;
  view.setSelected(app.inspectId);
  renderInspect(app.inspectId, app.timeline.setup);
}

function seekBy(deltaTU) {
  if (!app.playback) return;
  app.playback.seek(app.playback.pt + deltaTU);
  view.snap();
  app.shownTU = -1;
}

// ---- HUD ----

function renderInspect(unitId, setup = app.timeline?.setup) {
  if (!unitId || !setup) {
    el.inspect.hidden = true;
    return;
  }
  const spec = setup.units.find((u) => u.id === unitId);
  const def = setup.defs[spec.defId];
  const s = view.board?.units.get(unitId);
  const st = def.stats;
  const a = def.attack;
  const config = { ...SIM_CONFIG, ...setup.config };
  const shape = a?.shape?.type === 'line' ? `line ${a.shape.length}` : a?.shape?.type === 'circle' ? `circle r${a.shape.radius}` : 'single';
  const attack = a ? `${a.kind}${a.projectiles ? ` x${a.projectiles}` : ''}, ${shape}` : 'none';
  const tgt = def.targeting.mode === 'weakest' ? `weakest within ${def.targeting.range}` : def.targeting.mode.replaceAll('_', ' ');
  const target = s?.targetId ? app.names[s.targetId] ?? s.targetId : '-';
  el.inspect.hidden = false;
  el.inspect.innerHTML = `
    <div class="ins-head"><b>${def.name}</b> <span class="side-${spec.side}">${spec.side}</span></div>
    <div class="ins-role">${ROLE_LABELS[def.role]}</div>
    <table>
      <tr><td>HP</td><td>${s ? `${s.hp} / ${s.maxHp}` : st.hp}</td><td>ARM</td><td>${st.armor}</td></tr>
      <tr><td>DMG</td><td>${st.damage}</td><td>RNG</td><td>${st.range}</td></tr>
      <tr><td>MOVE</td><td>${moveTUPerHex(st.moveSpeed, config)} TU/hex</td><td>ATK</td><td>every ${attackIntervalTU(st.attackSpeed, config)} TU</td></tr>
    </table>
    <div class="ins-line">Attack: ${attack}</div>
    <div class="ins-line">Targeting: ${tgt}</div>
    ${app.mode === 'battle' ? `<div class="ins-line">Target: ${target}</div>` : ''}`;
}

function renderLog(tu) {
  const log = app.result.log;
  let end = 0;
  while (end < log.length && log[end].tu <= tu) end++;
  const recent = [];
  for (let i = end - 1; i >= 0 && recent.length < LOG_LINES; i--) {
    const text = formatEvent(log[i], app.names);
    if (text != null) recent.push({ ev: log[i], text });
  }
  recent.reverse();
  // Critical events are bright; cosmetic ones are dimmed.
  const lines = [];
  let lastTU = -1;
  for (const { ev, text } of recent) {
    if (ev.tu !== lastTU) lines.push(`<div class="tu">TU ${(lastTU = ev.tu)}</div>`);
    lines.push(`<div class="${CRITICAL_TYPES.has(ev.type) ? 'crit' : 'cos'}">${text}</div>`);
  }
  el.log.innerHTML = lines.join('');
  el.log.scrollTop = el.log.scrollHeight;
}

function showBanner(winner) {
  el.banner.hidden = false;
  el.banner.dataset.result = winner;
  el.banner.textContent = winner === 'player' ? 'VICTORY' : winner === 'enemy' ? 'DEFEAT' : 'DRAW';
}

function hideBanner() {
  el.banner.hidden = true;
}

let toastTimer = 0;
function showToast(text) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 2200);
}

function updateHud() {
  const pb = app.playback;
  const tu = Math.min(app.timeline.endTU, Math.floor(pb.pt));
  el.tu.textContent = `TU ${tu} / ${app.timeline.endTU}  x${pb.speed}`;
  el.play.textContent = pb.paused || pb.finished ? 'Play' : 'Pause';
  if (!app.scrubbing) el.scrub.value = String(pb.pt);
  if (tu !== app.shownTU) {
    app.shownTU = tu;
    renderLog(tu);
    if (app.inspectId) renderInspect(app.inspectId);
  }
}

// ---- Input ----

let down = null;
el.canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
el.canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
  down = null;
  const hex = view.pickHex(e.clientX, e.clientY);
  if (app.mode === 'deploy') onDeployTap(hex);
  else onBattleTap(hex);
});

el.commit.addEventListener('click', commit);
$('btn-reset-formation').addEventListener('click', () => {
  app.deployment = scenario.defaultDeployment.map((d) => ({ ...d }));
  app.selectedDef = null;
  refreshDeploy();
});
$('btn-new-seed').addEventListener('click', () => {
  el.seed.value = String(Math.floor(Math.random() * 1e6));
  el.tu.textContent = `Seed ${seed()}`;
});
el.seed.addEventListener('change', () => (el.tu.textContent = `Seed ${seed()}`));

el.play.addEventListener('click', () => {
  const pb = app.playback;
  if (pb.finished) {
    pb.seek(0);
    pb.paused = false;
  } else pb.paused = !pb.paused;
});
$('btn-restart').addEventListener('click', () => {
  app.playback.seek(0);
  app.playback.paused = false;
  app.shownTU = -1;
});
$('btn-step').addEventListener('click', () => {
  app.playback.stepTU();
  view.snap();
});
$('btn-back').addEventListener('click', () => {
  app.playback.paused = true;
  seekBy(-1);
});
$('btn-redeploy').addEventListener('click', enterDeploy);
$('btn-log').addEventListener('click', () => el.log.classList.toggle('open'));
$('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ setup: app.timeline.setup, winner: app.result.winner, log: app.result.log }, null, 1)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `battle-${app.timeline.setup.seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('btn-bloom').addEventListener('click', (e) => {
  view.setBloom(!view.bloomEnabled);
  e.currentTarget.classList.toggle('active', view.bloomEnabled);
});
$('btn-targets').addEventListener('click', (e) => {
  view.showTargets = !view.showTargets;
  e.currentTarget.classList.toggle('active', view.showTargets);
});

for (const s of SPEEDS) {
  const b = document.createElement('button');
  b.textContent = `${s}x`;
  b.dataset.speed = String(s);
  if (s === 1) b.classList.add('active');
  b.addEventListener('click', () => setSpeed(s));
  el.speeds.appendChild(b);
}

function setSpeed(s) {
  for (const b of el.speeds.children) b.classList.toggle('active', Number(b.dataset.speed) === s);
  if (app.playback) app.playback.speed = s;
}

el.scrub.addEventListener('pointerdown', () => (app.scrubbing = true));
el.scrub.addEventListener('pointerup', () => (app.scrubbing = false));
el.scrub.addEventListener('input', () => {
  app.playback?.seek(Number(el.scrub.value));
  view.snap();
});

window.addEventListener('keydown', (e) => {
  if (app.mode !== 'battle' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    el.play.click();
  } else if (e.code === 'ArrowRight') $('btn-step').click();
  else if (e.code === 'ArrowLeft') $('btn-back').click();
  else if (/^Digit[1-5]$/.test(e.code)) setSpeed(SPEEDS[Number(e.code.slice(5)) - 1]);
});

// ---- Frame loop ----

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (app.playback) {
    const dtTU = app.playback.update(dt);
    view.render(app.playback.pt, dtTU);
    updateHud();
  } else {
    app.deployClock += dt / SECONDS_PER_TU;
    view.render(app.deployClock, dt / SECONDS_PER_TU);
  }
  requestAnimationFrame(frame);
}

enterDeploy();
requestAnimationFrame(frame);

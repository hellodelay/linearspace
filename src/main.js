// App shell: deployment, battle playback controls, HUD, chatter. Owns no game rules.
import { BattleView } from './present/view.js';
import { Playback, SPEEDS } from './present/playback.js';
import { CRITICAL_TYPES, buildTimeline, validateTimeline } from './present/timeline.js';
import { DIALOGUE_CONFIG, activeLine, buildDialogue } from './present/dialogue.js';
import { CAST } from './present/cast.js';
import { portraitUrl } from './present/portraits.js';
import { equippedStats, simulate } from './sim/simulate.js';
import { EQUIPMENT_DEFS } from './sim/equipment.js';
import { DEFAULT_SCENARIO, buildBattleSetup, validateDeployment } from './sim/battle.js';
import { ROLE_LABELS, UNIT_DEFS } from './sim/data.js';
import { SIM_CONFIG, attackIntervalTU, moveTUPerHex } from './sim/config.js';
import { axialToOffset, hexDisk, hexKey, offsetToAxial } from './sim/hex.js';
import { formatEvent, unitNames } from './sim/format.js';

const SECONDS_PER_TU = 0.8;
const LOG_LINES = 120;
const DRAG_THRESHOLD_PX = 6;
const COLORS = {
  zone: 0x0b2433,
  range: 0x14485e,
  self: 0x2a7f9e,
  enemyRange: 0x3d1020,
  aoe: 0x47101c,
  dropOk: 0x1f7a4a,
  dropBad: 0x6a1424,
};

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
  ghost: $('drag-ghost'),
  itemGhost: $('drag-item'),
  armory: $('armory'),
  tabUnits: $('tab-units'),
  tabArmory: $('tab-armory'),
  dialogue: $('dialogue'),
  dlgPortrait: $('dlg-portrait'),
  dlgCallsign: $('dlg-callsign'),
  dlgName: $('dlg-name'),
  dlgText: $('dlg-text'),
};

const view = new BattleView(el.canvas, el.fx);
view.setGrid(scenario.grid);

const app = {
  mode: 'deploy',
  deployment: scenario.defaultDeployment.map((d) => ({ ...d })),
  // Equipment per roster unit ({ defId: [equipmentId] }); kept when a unit is benched.
  loadout: structuredClone(scenario.defaultLoadout ?? {}),
  trayTab: 'units',
  // Deployment inspection: { defId, unitId } of the unit whose stats and range are shown, or { itemId }.
  focus: null,
  inspectId: null,
  playback: null,
  timeline: null,
  result: null,
  dialogue: [],
  shownLine: null,
  shownChars: -1,
  chatter: true,
  names: {},
  shownTU: -1,
  scrubbing: false,
  deployClock: 0,
};
window.linearSpace = { app, view };

const hex6 = (n) => `#${n.toString(16).padStart(6, '0')}`;
const portraitOf = (defId, mood = 'neutral') => (CAST[defId] ? portraitUrl(CAST[defId].portrait, mood) : '');

// ---- Layout ----

new ResizeObserver(() => view.resize(el.stage.clientWidth, el.stage.clientHeight)).observe(el.stage);
view.resize(el.stage.clientWidth, el.stage.clientHeight);

// ---- Deployment ----

const seed = () => Number(el.seed.value) >>> 0;
const draftSetup = () => buildBattleSetup({ scenario, deployment: app.deployment, seed: seed(), loadout: app.loadout });
const item6 = (id) => hex6(EQUIPMENT_DEFS[id]?.color ?? 0xffffff);
const inZone = (off) => scenario.deployRows.includes(off.row) && off.col >= 0 && off.col < scenario.grid.width;
const deployIndex = (defId) => app.deployment.findIndex((d) => d.defId === defId);
const unitIdOf = (defId) => (deployIndex(defId) >= 0 ? `p${deployIndex(defId) + 1}` : null);

function enterDeploy() {
  app.mode = 'deploy';
  app.playback = null;
  app.timeline = null;
  app.inspectId = null;
  app.focus = null;
  document.body.dataset.mode = 'deploy';
  el.mode.textContent = 'DEPLOY';
  el.tu.textContent = `Seed ${seed()}`;
  hideBanner();
  showLine(null);
  el.log.innerHTML = '';
  view.clearEffects();
  refreshDeploy();
}

function zoneColors() {
  const colors = new Map();
  for (const row of scenario.deployRows) {
    for (let col = 0; col < scenario.grid.width; col++) colors.set(hexKey(offsetToAxial(col, row)), COLORS.zone);
  }
  return colors;
}

function paintRange(colors, center, range, enemy) {
  for (const h of hexDisk(center, range)) {
    if (view.grid.has(h)) colors.set(hexKey(h), enemy ? COLORS.enemyRange : COLORS.range);
  }
  colors.set(hexKey(center), enemy ? COLORS.aoe : COLORS.self);
}

function refreshDeploy() {
  const setup = draftSetup();
  view.loadSetup(setup);
  const colors = zoneColors();
  const focusId = app.focus?.unitId ?? null;
  const spec = focusId && setup.units.find((u) => u.id === focusId);
  if (spec) paintRange(colors, spec.pos, setup.defs[spec.defId].stats.range, spec.side === 'enemy');
  view.setHighlights(colors);
  view.setSelected(focusId);
  renderRoster();
  renderArmory();
  if (app.focus?.itemId) renderItemInspect(app.focus.itemId);
  else if (app.focus) renderInspect(app.focus.defId, spec?.side ?? 'player', focusId);
  else renderInspect(null);
  const errors = validateDeployment(scenario, app.deployment, app.loadout);
  el.commit.disabled = errors.length > 0;
  el.deployMsg.textContent =
    errors[0] ??
    (app.trayTab === 'armory'
      ? 'Drag gear onto a deployed unit. Tap a slot in the unit panel to remove it.'
      : `${app.deployment.length}/${scenario.deployCap} deployed. Drag units onto blue hexes; drag back to the tray to bench.`);
}

function setTrayTab(tab) {
  app.trayTab = tab;
  el.roster.hidden = tab !== 'units';
  el.armory.hidden = tab !== 'armory';
  el.tabUnits.classList.toggle('active', tab === 'units');
  el.tabArmory.classList.toggle('active', tab === 'armory');
  refreshDeploy();
}

// Free equipment pool while there is no shop; each item can go on any number of units.
function renderArmory() {
  el.armory.innerHTML = '';
  for (const [itemId, item] of Object.entries(EQUIPMENT_DEFS)) {
    const card = document.createElement('div');
    card.className = `card item${app.focus?.itemId === itemId ? ' selected' : ''}`;
    card.style.setProperty('--unit-color', hex6(item.color));
    card.innerHTML = `
      <span class="item-badge">${item.short}</span>
      <span class="card-text">
        <span class="card-name">${item.name}</span>
        <span class="card-role">${item.desc}</span>
      </span>`;
    card.addEventListener('pointerdown', (e) => beginPress(e, { itemId, source: 'armory' }));
    el.armory.appendChild(card);
  }
}

function equip(defId, itemId) {
  const items = (app.loadout[defId] ??= []);
  const item = EQUIPMENT_DEFS[itemId];
  if (SIM_CONFIG.uniqueEquipmentPerUnit && items.includes(itemId)) return showToast(`${UNIT_DEFS[defId].name} already has ${item.name}`);
  if (items.length >= SIM_CONFIG.equipmentSlots) return showToast(`${UNIT_DEFS[defId].name}: all ${SIM_CONFIG.equipmentSlots} slots are full`);
  items.push(itemId);
  showToast(`${item.name} -> ${UNIT_DEFS[defId].name}`);
}

function slotPips(defId) {
  const items = app.loadout[defId] ?? [];
  let html = '';
  for (let i = 0; i < SIM_CONFIG.equipmentSlots; i++) {
    html += items[i] ? `<i style="background:${item6(items[i])}" title="${EQUIPMENT_DEFS[items[i]].name}"></i>` : '<i></i>';
  }
  return `<span class="card-slots">${html}</span>`;
}

function renderRoster() {
  el.roster.innerHTML = '';
  for (const defId of scenario.roster) {
    const def = UNIT_DEFS[defId];
    const placed = deployIndex(defId) >= 0;
    const card = document.createElement('div');
    card.className = `card${app.focus?.defId === defId ? ' selected' : ''}${placed ? ' placed' : ''}`;
    card.style.setProperty('--unit-color', hex6(def.visual.color));
    card.innerHTML = `
      <img class="card-portrait" src="${portraitOf(defId)}" alt="" draggable="false" />
      <span class="card-text">
        <span class="card-name">${def.name}</span>
        <span class="card-pilot">${CAST[defId]?.pilot ?? ''}</span>
        <span class="card-role">${ROLE_LABELS[def.role]}</span>
        <span class="card-state">${placed ? 'deployed' : 'bench'} ${slotPips(defId)}</span>
      </span>`;
    card.addEventListener('pointerdown', (e) => beginPress(e, { defId, unitId: unitIdOf(defId), source: 'card' }));
    el.roster.appendChild(card);
  }
}

// Drop rules: a hex in the zone takes the unit; another player unit there swaps (or is benched,
// when the dragged unit came from the tray). Dropping on the tray benches a deployed unit.
function drop(defId, hex, onTray) {
  const idx = deployIndex(defId);
  if (onTray) {
    if (idx >= 0) app.deployment.splice(idx, 1);
    return true;
  }
  if (!hex) return false;
  const off = axialToOffset(hex);
  if (!inZone(off)) return false;
  const occupant = view.unitAt(hex);
  if (occupant?.startsWith('e')) return false;
  const otherIdx = occupant ? Number(occupant.slice(1)) - 1 : -1;
  if (otherIdx === idx && idx >= 0) return true;
  const entry = { defId, col: off.col, row: off.row };
  if (otherIdx >= 0) {
    if (idx >= 0) {
      const mine = app.deployment[idx];
      app.deployment[otherIdx] = { ...app.deployment[otherIdx], col: mine.col, row: mine.row };
      app.deployment[idx] = entry;
    } else {
      app.deployment[otherIdx] = entry;
    }
    return true;
  }
  if (idx >= 0) {
    app.deployment[idx] = entry;
    return true;
  }
  if (app.deployment.length >= scenario.deployCap) {
    showToast(`Deployment cap is ${scenario.deployCap}`);
    return false;
  }
  app.deployment.push(entry);
  return true;
}

function dropPreview(defId, hex, onTray) {
  const colors = zoneColors();
  if (onTray || !hex) return colors;
  const off = axialToOffset(hex);
  const occupant = view.unitAt(hex);
  const ok = inZone(off) && !occupant?.startsWith('e');
  if (ok) paintRange(colors, hex, UNIT_DEFS[defId].stats.range, false);
  colors.set(hexKey(hex), ok ? COLORS.dropOk : COLORS.dropBad);
  return colors;
}

// ---- Pointer: tap vs drag ----

let press = null;

function beginPress(e, target) {
  if (app.mode !== 'deploy' || e.button > 0) return;
  press = { ...target, pointerId: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
}

function overTray(x, y) {
  const r = (app.trayTab === 'armory' ? el.armory : el.roster).getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function overCanvas(x, y) {
  const r = el.canvas.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function moveGhost(x, y) {
  el.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
}

window.addEventListener('pointermove', (e) => {
  if (!press || press.battle || e.pointerId !== press.pointerId) return;
  if (press.itemId) return dragItem(e);
  if (!press.dragging) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
    press.dragging = true;
    el.ghost.src = portraitOf(press.defId);
    el.ghost.style.setProperty('--unit-color', hex6(UNIT_DEFS[press.defId].visual.color));
    el.ghost.hidden = false;
    view.setGhost(press.unitId);
    view.setSelected(null);
    renderInspect(null);
  }
  moveGhost(e.clientX, e.clientY);
  const hex = overCanvas(e.clientX, e.clientY) ? view.pickHex(e.clientX, e.clientY) : null;
  view.setHighlights(dropPreview(press.defId, hex, overTray(e.clientX, e.clientY)));
});

// Equipment drag: the selection ring marks the deployed player unit the item would land on.
function dragItem(e) {
  if (!press.dragging) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
    press.dragging = true;
    const item = EQUIPMENT_DEFS[press.itemId];
    el.itemGhost.textContent = item.short;
    el.itemGhost.style.setProperty('--unit-color', hex6(item.color));
    el.itemGhost.hidden = false;
    renderInspect(null);
  }
  el.itemGhost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
  const target = overCanvas(e.clientX, e.clientY) ? view.unitAtPointer(e.clientX, e.clientY) : null;
  view.setSelected(target?.startsWith('p') ? target : null);
}

function endPress(e, cancelled) {
  if (!press || press.battle || e.pointerId !== press.pointerId) return;
  const p = press;
  press = null;
  el.ghost.hidden = true;
  el.itemGhost.hidden = true;
  view.setGhost(null);
  if (p.itemId) {
    if (cancelled) return refreshDeploy();
    if (!p.dragging) {
      app.focus = app.focus?.itemId === p.itemId ? null : { itemId: p.itemId };
      return refreshDeploy();
    }
    const target = overCanvas(e.clientX, e.clientY) ? view.unitAtPointer(e.clientX, e.clientY) : null;
    if (target?.startsWith('p')) {
      const defId = app.deployment[Number(target.slice(1)) - 1].defId;
      equip(defId, p.itemId);
      app.focus = { defId, unitId: target };
    }
    return refreshDeploy();
  }
  if (p.dragging) {
    if (!cancelled) {
      const hex = overCanvas(e.clientX, e.clientY) ? view.pickHex(e.clientX, e.clientY) : null;
      if (drop(p.defId, hex, overTray(e.clientX, e.clientY))) app.focus = { defId: p.defId, unitId: unitIdOf(p.defId) };
    }
  } else if (!cancelled) {
    const same = app.focus?.defId === p.defId && app.focus?.unitId === p.unitId;
    app.focus = same ? null : { defId: p.defId, unitId: p.unitId };
  }
  refreshDeploy();
}

window.addEventListener('pointerup', (e) => endPress(e, false));
window.addEventListener('pointercancel', (e) => endPress(e, true));

el.canvas.addEventListener('pointerdown', (e) => {
  if (app.mode === 'battle') {
    press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, battle: true };
    return;
  }
  const occupant = view.unitAtPointer(e.clientX, e.clientY);
  if (occupant?.startsWith('p')) {
    const defId = app.deployment[Number(occupant.slice(1)) - 1].defId;
    beginPress(e, { defId, unitId: occupant, source: 'board' });
  } else if (occupant) {
    const spec = draftSetup().units.find((u) => u.id === occupant);
    app.focus = app.focus?.unitId === occupant ? null : { defId: spec.defId, unitId: occupant };
    refreshDeploy();
  } else {
    app.focus = null;
    refreshDeploy();
  }
});

el.canvas.addEventListener('pointerup', (e) => {
  if (!press?.battle || e.pointerId !== press.pointerId) return;
  const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10;
  press = null;
  if (!moved) onBattleTap(view.unitAtPointer(e.clientX, e.clientY));
});

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
  const errors = validateDeployment(scenario, app.deployment, app.loadout);
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
  app.dialogue = buildDialogue(timeline, CAST);
  app.names = unitNames(result.log);
  app.inspectId = null;
  app.focus = null;
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

function onBattleTap(id) {
  app.inspectId = id && id !== app.inspectId ? id : null;
  view.setSelected(app.inspectId);
  renderBattleInspect();
}

function renderBattleInspect() {
  if (!app.inspectId) return renderInspect(null);
  const spec = app.timeline.setup.units.find((u) => u.id === app.inspectId);
  renderInspect(spec.defId, spec.side, spec.id);
}

function seekBy(deltaTU) {
  if (!app.playback) return;
  app.playback.seek(app.playback.pt + deltaTU);
  view.snap();
  app.shownTU = -1;
}

// ---- HUD ----

function renderInspect(defId, side = 'player', unitId = null) {
  if (!defId) {
    el.inspect.hidden = true;
    return;
  }
  const def = app.timeline?.setup.defs[defId] ?? UNIT_DEFS[defId];
  const s = unitId ? view.board?.units.get(unitId) : null;
  const items = equipmentFor(defId, side, unitId);
  const st = { ...equippedStats(def, items, EQUIPMENT_DEFS).stats, range: def.stats.range };
  const fmt = (key) => {
    const v = Math.round(st[key] * 10) / 10;
    return v !== def.stats[key] ? `<span class="mod">${v}</span>` : `${v}`;
  };
  // Slots are removable only while deploying a player unit.
  const editable = app.mode === 'deploy' && side === 'player';
  let slots = '';
  for (let i = 0; i < SIM_CONFIG.equipmentSlots; i++) {
    const id = items[i];
    const item = id && EQUIPMENT_DEFS[id];
    slots += item
      ? `<button class="slot" style="--unit-color:${hex6(item.color)}" title="${item.name}: ${item.desc}" ${editable ? `data-unequip="${i}"` : 'disabled'}>${item.short}</button>`
      : '<span class="slot empty">-</span>';
  }
  const a = def.attack;
  const config = { ...SIM_CONFIG, ...app.timeline?.setup.config };
  const shape = a?.shape?.type === 'line' ? `line ${a.shape.length}` : a?.shape?.type === 'circle' ? `circle r${a.shape.radius}` : 'single';
  const attack = a ? `${a.kind}${a.projectiles ? ` x${a.projectiles}` : ''}, ${shape}` : 'none';
  const tgt = def.targeting.mode === 'weakest' ? `weakest within ${def.targeting.range}` : def.targeting.mode.replaceAll('_', ' ');
  const target = s?.targetId ? app.names[s.targetId] ?? s.targetId : '-';
  const cast = CAST[defId];
  el.inspect.hidden = false;
  el.inspect.innerHTML = `
    <div class="ins-top">
      ${cast ? `<img class="ins-portrait" src="${portraitOf(defId, s && s.hp / s.maxHp <= 0.35 ? 'hurt' : 'neutral')}" alt="" />` : ''}
      <div>
        <div class="ins-head"><b>${def.name}</b> <span class="side-${side}">${side}</span></div>
        ${cast ? `<div class="ins-pilot">${cast.pilot} "${cast.callsign}"</div>` : ''}
        <div class="ins-role">${ROLE_LABELS[def.role]}</div>
      </div>
    </div>
    <table>
      <tr><td>HP</td><td>${s ? `${s.hp} / ${s.maxHp}` : fmt('hp')}</td><td>ARM</td><td>${fmt('armor')}</td></tr>
      <tr><td>DMG</td><td>${fmt('damage')}</td><td>RNG</td><td>${st.range}</td></tr>
      <tr><td>MOVE</td><td>${moveTUPerHex(st.moveSpeed, config)} TU/hex</td><td>ATK</td><td>every ${attackIntervalTU(st.attackSpeed, config)} TU</td></tr>
    </table>
    <div class="slots">${slots}</div>
    <div class="ins-line">Attack: ${attack}</div>
    <div class="ins-line">Targeting: ${tgt}</div>
    ${app.mode === 'battle' ? `<div class="ins-line">Target: ${target}</div>` : ''}`;
}

// Equipment shown for a unit: the battle setup's during playback, the loadout while deploying.
function equipmentFor(defId, side, unitId) {
  if (app.mode === 'battle') return app.timeline.setup.units.find((u) => u.id === unitId)?.equipment ?? [];
  if (side === 'player') return app.loadout[defId] ?? [];
  return draftSetup().units.find((u) => u.id === unitId)?.equipment ?? [];
}

function renderItemInspect(itemId) {
  const item = EQUIPMENT_DEFS[itemId];
  el.inspect.hidden = false;
  el.inspect.innerHTML = `
    <div class="ins-top">
      <span class="item-badge big" style="--unit-color:${hex6(item.color)}">${item.short}</span>
      <div>
        <div class="ins-head"><b>${item.name}</b></div>
        <div class="ins-role">Equipment</div>
      </div>
    </div>
    <div class="ins-line">${item.desc}</div>
    <div class="ins-line">Drag onto a deployed unit to equip.</div>`;
}

el.inspect.addEventListener('click', (e) => {
  const slot = e.target.closest('[data-unequip]');
  if (!slot || app.mode !== 'deploy' || !app.focus?.defId) return;
  app.loadout[app.focus.defId]?.splice(Number(slot.dataset.unequip), 1);
  refreshDeploy();
});

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

// Shows the chatter line active at pt with a typewriter reveal on the TU clock.
function updateDialogue(pt) {
  const line = app.chatter ? activeLine(app.dialogue, pt) : null;
  if (line !== app.shownLine) showLine(line);
  if (!line) return;
  const chars = Math.ceil(line.text.length * Math.min(1, (pt - line.t) / DIALOGUE_CONFIG.revealTU));
  if (chars !== app.shownChars) {
    app.shownChars = chars;
    el.dlgText.textContent = line.text.slice(0, chars);
  }
}

function showLine(line) {
  app.shownLine = line;
  app.shownChars = -1;
  view.setSpeaking(line?.unitId ?? null);
  el.dialogue.hidden = !line;
  if (!line) return;
  el.dialogue.dataset.side = line.side;
  el.dialogue.style.setProperty('--unit-color', hex6(UNIT_DEFS[line.defId]?.visual.color ?? 0xffffff));
  el.dlgPortrait.src = portraitOf(line.defId, line.mood);
  el.dlgCallsign.textContent = line.callsign;
  el.dlgName.textContent = line.name;
  el.dlgText.textContent = '';
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
  updateDialogue(pb.pt);
  if (tu !== app.shownTU) {
    app.shownTU = tu;
    renderLog(tu);
    if (app.inspectId) renderBattleInspect();
  }
}

// ---- Controls ----

el.commit.addEventListener('click', commit);
el.tabUnits.addEventListener('click', () => setTrayTab('units'));
el.tabArmory.addEventListener('click', () => setTrayTab('armory'));
$('btn-reset-formation').addEventListener('click', () => {
  app.deployment = scenario.defaultDeployment.map((d) => ({ ...d }));
  app.focus = null;
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
$('btn-chatter').addEventListener('click', (e) => {
  app.chatter = !app.chatter;
  e.currentTarget.classList.toggle('active', app.chatter);
});
// Camera view cycles top -> tilt -> iso; the choice is remembered per browser.
const CAMERA_ORDER = ['top', 'tilt', 'iso'];
const CAMERA_LABELS = { top: 'View: Top', tilt: 'View: Tilt', iso: 'View: Iso' };
function setCameraMode(mode, animate) {
  view.setCameraMode(mode, animate);
  $('btn-camera').textContent = CAMERA_LABELS[mode];
  try {
    localStorage.setItem('linearspace.camera.v2', mode);
  } catch {}
}
$('btn-camera').addEventListener('click', () => {
  setCameraMode(CAMERA_ORDER[(CAMERA_ORDER.indexOf(view.cameraMode) + 1) % CAMERA_ORDER.length], true);
});
let savedCamera = null;
try {
  savedCamera = localStorage.getItem('linearspace.camera.v2');
} catch {}
setCameraMode(CAMERA_ORDER.includes(savedCamera) ? savedCamera : 'iso', false);

$('btn-portraits').addEventListener('click', (e) => {
  view.setPortraits(!view.usePortraits);
  e.currentTarget.classList.toggle('active', view.usePortraits);
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

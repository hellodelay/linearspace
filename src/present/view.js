// Three.js battlefield. Consumes timeline cues; never feeds anything back into the simulation.
// Everything except particles is evaluated from the presentation clock `pt`, so pause, speed
// changes and seeking all stay consistent. Particles integrate by the clock delta and are skipped
// for cues replayed silently during a seek.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGrid } from '../sim/grid.js';
import { hexKey } from '../sim/hex.js';
import { createRng } from '../sim/rng.js';
import { hexCorners, hexToWorld, worldToHex } from './layout.js';
import { applyCue, createBoardState } from './boardState.js';

// Effect lifetimes, in TU of presentation time.
const FX = { beam: 0.45, slash: 0.25, ring: 0.7, number: 1.7, flash: 0.25, death: 0.4, lunge: 0.3, shake: 0.9 };
const RO = { stars: 0, fill: 1, grid: 2, telegraph: 3, target: 4, unitFill: 5, unit: 6, hp: 7, beam: 8, flight: 9, ring: 10, particle: 11 };
const SIDE_COLOR = { player: 0x2ad4ff, enemy: 0xff3366 };
const HP_COLOR = { player: 0x3cffb0, enemy: 0xff3d6e };
const HEAL_COLOR = 0x7dffd8;
const GRID_COLOR = new THREE.Color(0x1d4a5e);
const OVERTIME_COLOR = new THREE.Color(0x8a1530);
const FILL_COLOR = new THREE.Color(0x08111c);
const WHITE = new THREE.Color(0xffffff);
const SQRT3_2 = Math.sqrt(3) / 2;

const additive = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.min(1, Math.max(0, u));

export class BattleView {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor(0x03050a, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    this.camera.position.set(0, 0, 50);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.45, 0.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bloomEnabled = true;
    this.showTargets = true;

    this.boardGroup = new THREE.Group();
    this.unitGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.scene.add(this.boardGroup, this.unitGroup, this.fxGroup);

    this.units = new Map();
    this.board = null;
    this.pt = 0;
    this.overtime = false;
    this.selectedId = null;
    this.size = { w: 1, h: 1 };
    this.fxRng = createRng(0xc0ffee);
    this.records = { beams: [], flights: [], rings: [], numbers: [], telegraphs: [], shakes: [], lunges: [] };

    this.particleTexture = makeGlowTexture();
    this.particles = new Particles(2400, this.particleTexture);
    this.particles.points.renderOrder = RO.particle;
    this.fxGroup.add(this.particles.points);

    this.beamPool = new Pool(() => makeBeam(), this.fxGroup);
    this.flightPool = new Pool(() => makeFlight(), this.fxGroup);
    this.ringPool = new Pool(() => makeRing(), this.fxGroup);
    this.telegraphPool = new Pool(() => makeHexRing(0.74, 0.9, 0xff3344, RO.telegraph), this.fxGroup);
    this.numberPool = new DomPool(overlay);

    this.targetLines = makeTargetLines(64);
    this.fxGroup.add(this.targetLines);

    this.selectRing = makeHexRing(0.9, 1.0, 0xffffff, RO.unit);
    this.selectRing.visible = false;
    this.fxGroup.add(this.selectRing);
  }

  // ---- Board ----

  setGrid(width, height) {
    this.boardGroup.clear();
    this.grid = createGrid(width, height);
    const cells = this.grid.cells;
    this.cellIndex = new Map(cells.map((c, i) => [hexKey(c), i]));

    const linePos = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of cells) {
      const w = hexToWorld(c);
      const corners = hexCorners(w.x, w.y, 1);
      for (let i = 0; i < 6; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 6];
        linePos.push(a.x, a.y, 0, b.x, b.y, 0);
      }
      minX = Math.min(minX, w.x - SQRT3_2);
      maxX = Math.max(maxX, w.x + SQRT3_2);
      minY = Math.min(minY, w.y - 1);
      maxY = Math.max(maxY, w.y + 1);
    }
    this.bounds = { minX, maxX, minY, maxY };

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    this.gridMat = new THREE.LineBasicMaterial({ color: GRID_COLOR.clone(), transparent: true, opacity: 0.85, depthTest: false });
    const lines = new THREE.LineSegments(lineGeo, this.gridMat);
    lines.renderOrder = RO.grid;

    const fillGeo = new THREE.CircleGeometry(0.94, 6);
    fillGeo.rotateZ(Math.PI / 6);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
    this.fills = new THREE.InstancedMesh(fillGeo, fillMat, cells.length);
    this.fills.renderOrder = RO.fill;
    const m = new THREE.Matrix4();
    cells.forEach((c, i) => {
      const w = hexToWorld(c);
      this.fills.setMatrixAt(i, m.makeTranslation(w.x, w.y, 0));
      this.fills.setColorAt(i, FILL_COLOR);
    });
    this.fills.instanceMatrix.needsUpdate = true;

    this.boardGroup.add(makeStars(this.bounds), this.fills, lines);
    this.fitCamera();
  }

  // colors: Map hexKey -> 0xRRGGBB. Cells not listed revert to the base fill.
  setHighlights(colors) {
    if (!this.fills) return;
    const c = new THREE.Color();
    for (const [k, i] of this.cellIndex) {
      const hex = colors?.get(k);
      this.fills.setColorAt(i, hex != null ? c.set(hex) : FILL_COLOR);
    }
    this.fills.instanceColor.needsUpdate = true;
  }

  resize(w, h) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.composer.setSize(this.size.w, this.size.h);
    this.fitCamera();
  }

  fitCamera() {
    if (!this.bounds) return;
    const { minX, maxX, minY, maxY } = this.bounds;
    const margin = 0.6;
    const bw = maxX - minX + margin * 2;
    const bh = maxY - minY + margin * 2;
    const aspect = this.size.w / this.size.h;
    let halfW;
    let halfH;
    if (bw / bh > aspect) {
      halfW = bw / 2;
      halfH = halfW / aspect;
    } else {
      halfH = bh / 2;
      halfW = halfH * aspect;
    }
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    this.camera.position.set(this.camCenter.x, this.camCenter.y, 50);
    this.camera.updateProjectionMatrix();
  }

  setBloom(enabled) {
    this.bloomEnabled = enabled;
  }

  // ---- Units ----

  // Shows a setup's units at their start positions with full HP.
  loadSetup(setup) {
    for (const v of this.units.values()) disposeUnit(v);
    this.units.clear();
    this.unitGroup.clear();
    this.defs = setup.defs;
    this.board = createBoardState(setup);
    for (const spec of setup.units) {
      const v = makeUnit(spec, setup.defs[spec.defId]);
      this.units.set(spec.id, v);
      this.unitGroup.add(v.group);
    }
  }

  // Playback sink: start of a battle or a backwards seek.
  reset(timeline) {
    this.loadSetup(timeline.setup);
    this.clearEffects();
    this.pt = 0;
  }

  clearEffects() {
    for (const list of Object.values(this.records)) list.length = 0;
    this.particles.clear();
    this.overtime = false;
  }

  // Snaps HP lag bars after a seek so they do not drain visibly.
  snap() {
    for (const v of this.units.values()) {
      const s = this.board.units.get(v.id);
      v.lag = s.hp / s.maxHp;
    }
  }

  setSelected(id) {
    this.selectedId = id;
  }

  unitAt(hex) {
    if (!this.board) return null;
    for (const s of this.board.units.values()) if (s.alive && s.q === hex.q && s.r === hex.r) return s.id;
    return null;
  }

  pickHex(clientX, clientY) {
    if (!this.grid) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector3(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0);
    ndc.unproject(this.camera);
    const h = worldToHex(ndc.x, ndc.y);
    return this.grid.has(h) ? h : null;
  }

  unitPosition(v, t) {
    const s = this.board.units.get(v.id);
    const at = hexToWorld(s);
    let x = at.x;
    let y = at.y;
    const mv = v.move;
    if (mv && t < mv.t1) {
      const u = smooth(clamp01((t - mv.t0) / (mv.t1 - mv.t0)));
      x = mv.from.x + (mv.to.x - mv.from.x) * u;
      y = mv.from.y + (mv.to.y - mv.from.y) * u;
    }
    const lg = v.lunge;
    if (lg && t >= lg.t0 && t < lg.t0 + FX.lunge) {
      const k = Math.sin(Math.PI * ((t - lg.t0) / FX.lunge)) * 0.3;
      x += lg.dx * k;
      y += lg.dy * k;
    }
    return { x, y };
  }

  posOf(id, t) {
    const v = this.units.get(id);
    return v ? this.unitPosition(v, t) : { x: 0, y: 0 };
  }

  // ---- Cue sink ----

  onCue(cue, silent) {
    applyCue(this.board, cue);
    const ev = cue.ev;
    switch (ev.type) {
      case 'move_start': {
        const v = this.units.get(ev.unit);
        v.move = { t0: cue.t, t1: cue.t1, from: hexToWorld(ev.from), to: hexToWorld(ev.to) };
        break;
      }
      case 'attack':
        if (!ev.projectiles.length) this.fire(cue, silent);
        break;
      case 'projectile_launch':
        this.launch(cue, silent);
        break;
      case 'projectile_impact':
        this.impact(cue, silent);
        break;
      case 'damage':
        this.hit(cue, silent, false);
        break;
      case 'heal':
        this.hit(cue, silent, true);
        break;
      case 'death':
        this.died(cue, silent);
        break;
      case 'timeout_begin':
        this.overtime = true;
        break;
      default:
        break;
    }
  }

  fire(cue, silent) {
    const ev = cue.ev;
    const t = cue.t;
    const v = this.units.get(ev.unit);
    const from = this.unitPosition(v, t);
    const to = this.board.units.get(ev.target)?.alive ? this.posOf(ev.target, t) : hexToWorld(ev.targetHex);
    if (ev.kind === 'melee') {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      v.lunge = { t0: t, dx: dx / len, dy: dy / len };
      // Slash drawn across the target, perpendicular to the attack direction.
      const px = (-dy / len) * 0.45;
      const py = (dx / len) * 0.45;
      this.records.beams.push({
        t0: cue.t1 ?? t,
        t1: (cue.t1 ?? t) + FX.slash,
        from: { x: to.x - px, y: to.y - py },
        to: { x: to.x + px, y: to.y + py },
        color: 0xffffff,
        width: 0.12,
      });
      return;
    }
    const isLine = ev.hexes.length > 1;
    const end = isLine ? hexToWorld(ev.hexes[ev.hexes.length - 1]) : to;
    const color = ev.kind === 'heal' ? HEAL_COLOR : v.color;
    this.records.beams.push({ t0: t, t1: t + FX.beam, from, to: end, color, width: isLine ? 0.42 : ev.kind === 'heal' ? 0.12 : 0.2 });
    if (!silent) this.particles.burst(from.x, from.y, color, 6, 1.5, 0.35);
  }

  launch(cue, silent) {
    const ev = cue.ev;
    if (!cue.impact || cue.t1 <= cue.t) return;
    const v = this.units.get(ev.unit);
    const shell = v.def.attack?.kind === 'shell';
    const from = this.unitPosition(v, cue.t);
    this.records.flights.push({
      t0: cue.t,
      t1: cue.t1,
      from,
      impact: hexToWorld(cue.impact.hex),
      homingId: ev.homing ? ev.target : null,
      fan: ev.index - (ev.count - 1) / 2 + (ev.count === 1 ? (Number(ev.projectileId.slice(1)) % 2 ? 0.5 : -0.5) : 0),
      shell,
      color: v.color,
    });
    if (shell) {
      for (const h of cue.impact.hexes) this.records.telegraphs.push({ t0: cue.t, t1: cue.t1, at: hexToWorld(h) });
    }
    if (!silent) this.particles.burst(from.x, from.y, v.color, shell ? 10 : 5, 2, 0.3);
  }

  impact(cue, silent) {
    const ev = cue.ev;
    const at = hexToWorld(ev.hex);
    const area = ev.hexes.length > 1;
    const color = this.units.get(ev.unit)?.color ?? 0xffffff;
    this.records.rings.push({ t0: cue.t, t1: cue.t + FX.ring, at, r0: 0.2, r1: area ? 2.1 : 0.8, color });
    if (silent) return;
    this.particles.burst(at.x, at.y, color, area ? 40 : 14, area ? 5 : 3, 0.6);
    this.particles.burst(at.x, at.y, 0xffffff, area ? 14 : 5, area ? 3 : 2, 0.35);
    if (area) this.records.shakes.push({ t0: cue.t, amp: 0.12 });
  }

  hit(cue, silent, heal) {
    const ev = cue.ev;
    const v = this.units.get(ev.unit);
    const at = this.unitPosition(v, cue.t);
    if (!heal) v.flashT = cue.t;
    const jitter = ((ev.seq * 0.618) % 1) - 0.5;
    this.records.numbers.push({
      t0: cue.t,
      x: at.x + jitter * 0.6,
      y: at.y + 0.3,
      text: heal ? `+${ev.amount}` : `${ev.amount}`,
      cls: heal ? 'num heal' : ev.source.timeout ? 'num timeout' : v.side === 'player' ? 'num hurt' : 'num dmg',
    });
    if (silent) return;
    if (heal) this.particles.burst(at.x, at.y, HEAL_COLOR, 8, 1.2, 0.6, 1.5);
    else this.particles.burst(at.x, at.y, v.color, 8, 2.5, 0.4);
  }

  died(cue, silent) {
    const v = this.units.get(cue.ev.unit);
    const at = this.unitPosition(v, cue.t);
    v.deathT = cue.t;
    this.records.rings.push({ t0: cue.t, t1: cue.t + FX.ring * 1.4, at, r0: 0.3, r1: 2.6, color: v.color });
    if (this.selectedId === v.id) this.selectedId = null;
    if (silent) return;
    this.particles.burst(at.x, at.y, v.color, 70, 6, 0.9);
    this.particles.burst(at.x, at.y, 0xffffff, 24, 3.5, 0.5);
    this.records.shakes.push({ t0: cue.t, amp: 0.22 });
  }

  // ---- Frame ----

  render(pt, dtTU) {
    this.pt = pt;
    if (this.board) {
      this.renderUnits(pt, dtTU);
      this.renderTargets(pt);
    }
    this.renderBeams(pt);
    this.renderFlights(pt);
    this.renderRings(pt);
    this.renderTelegraphs(pt);
    this.renderNumbers(pt);
    this.particles.update(dtTU);
    this.renderShake(pt);
    if (this.gridMat) {
      const pulse = this.overtime ? 0.5 + 0.5 * Math.sin(pt * 4) : 0;
      this.gridMat.color.copy(GRID_COLOR).lerp(OVERTIME_COLOR, pulse);
    }
    if (this.bloomEnabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  renderUnits(pt, dtTU) {
    for (const v of this.units.values()) {
      const s = this.board.units.get(v.id);
      const p = this.unitPosition(v, pt);
      v.group.position.set(p.x, p.y, 0);
      let opacity = 1;
      let scale = 1;
      if (!s.alive) {
        const u = v.deathT == null ? 1 : (pt - v.deathT) / FX.death;
        if (u >= 1) {
          v.group.visible = false;
          continue;
        }
        opacity = 1 - u;
        scale = 1 + 0.6 * u;
      }
      v.group.visible = true;
      v.body.scale.setScalar(scale);
      const flash = clamp01(1 - (pt - v.flashT) / FX.flash);
      v.outlineMat.color.copy(v.baseColor).lerp(WHITE, flash);
      v.outlineMat.opacity = opacity;
      v.fillMat.opacity = 0.2 * opacity + 0.3 * flash;
      v.sideMat.opacity = 0.45 * opacity;

      const ratio = s.hp / s.maxHp;
      if (ratio > v.lag) v.lag = ratio;
      else v.lag = Math.max(ratio, v.lag - dtTU * 0.6);
      v.hpFg.scale.x = Math.max(1e-4, ratio * HP_W);
      v.hpLag.scale.x = Math.max(1e-4, v.lag * HP_W);
      v.hpGroup.visible = s.alive;
    }
    const sel = this.selectedId && this.units.get(this.selectedId);
    this.selectRing.visible = !!sel && sel.group.visible;
    if (this.selectRing.visible) {
      this.selectRing.position.copy(sel.group.position);
      this.selectRing.rotation.z = pt * 0.8;
      this.selectRing.material.opacity = 0.5 + 0.3 * Math.sin(pt * 6);
    }
  }

  renderTargets(pt) {
    const geo = this.targetLines.geometry;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    let n = 0;
    if (this.showTargets) {
      const c = new THREE.Color();
      for (const s of this.board.units.values()) {
        if (!s.alive || !s.targetId || n >= pos.length / 6) continue;
        const t = this.board.units.get(s.targetId);
        if (!t?.alive) continue;
        const v = this.units.get(s.id);
        const a = this.unitPosition(v, pt);
        const b = this.posOf(t.id, pt);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1.2) continue;
        const ux = dx / len;
        const uy = dy / len;
        pos.set([a.x + ux * 0.55, a.y + uy * 0.55, 0, b.x - ux * 0.55, b.y - uy * 0.55, 0], n * 6);
        c.set(t.side === s.side ? HEAL_COLOR : SIDE_COLOR[v.side]).multiplyScalar(0.4);
        col.set([c.r, c.g, c.b, c.r * 0.2, c.g * 0.2, c.b * 0.2], n * 6);
        n++;
      }
    }
    geo.setDrawRange(0, n * 2);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  renderBeams(pt) {
    this.records.beams = this.records.beams.filter((b) => pt < b.t1);
    this.beamPool.begin();
    for (const b of this.records.beams) {
      if (pt < b.t0) continue;
      const u = (pt - b.t0) / (b.t1 - b.t0);
      const item = this.beamPool.next();
      const dx = b.to.x - b.from.x;
      const dy = b.to.y - b.from.y;
      const len = Math.hypot(dx, dy);
      const w = b.width * Math.pow(1 - u, 0.6) * (0.85 + 0.15 * Math.sin(pt * 90));
      item.position.set((b.from.x + b.to.x) / 2, (b.from.y + b.to.y) / 2, 0);
      item.rotation.z = Math.atan2(dy, dx);
      item.glow.scale.set(len, Math.max(1e-3, w), 1);
      item.core.scale.set(len, Math.max(1e-3, w * 0.35), 1);
      item.glow.material.color.set(b.color);
      item.glow.material.opacity = 1 - u;
      item.core.material.opacity = 1 - u;
    }
    this.beamPool.end();
  }

  flightPoint(f, u) {
    const end = f.homingId && this.board.units.get(f.homingId)?.alive ? this.posOf(f.homingId, this.pt) : f.impact;
    const mx = (f.from.x + end.x) / 2;
    const my = (f.from.y + end.y) / 2;
    const dx = end.x - f.from.x;
    const dy = end.y - f.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = f.shell ? 0.4 : 1.6;
    const cx = mx + (-dy / len) * f.fan * bend;
    const cy = my + (dx / len) * f.fan * bend;
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    return { x: a * f.from.x + b * cx + c * end.x, y: a * f.from.y + b * cy + c * end.y };
  }

  renderFlights(pt) {
    this.records.flights = this.records.flights.filter((f) => pt < f.t1);
    this.flightPool.begin();
    const color = new THREE.Color();
    for (const f of this.records.flights) {
      if (pt < f.t0) continue;
      const raw = (pt - f.t0) / (f.t1 - f.t0);
      const ease = (u) => (f.shell ? u : Math.pow(u, 1.25));
      const u = ease(raw);
      const p = this.flightPoint(f, u);
      const q = this.flightPoint(f, Math.min(1, u + 0.02));
      const item = this.flightPool.next();
      item.head.position.set(p.x, p.y, 0);
      item.head.rotation.z = Math.atan2(q.y - p.y, q.x - p.x);
      item.head.scale.setScalar(f.shell ? 1.6 + 1.2 * Math.sin(Math.PI * raw) : 1);
      item.head.material.color.set(f.color);
      const pos = item.trail.geometry.attributes.position.array;
      const col = item.trail.geometry.attributes.color.array;
      color.set(f.color);
      for (let k = 0; k < TRAIL_POINTS; k++) {
        const tp = this.flightPoint(f, ease(Math.max(0, raw - k * 0.035)));
        const fade = 1 - k / (TRAIL_POINTS - 1);
        pos[k * 3] = tp.x;
        pos[k * 3 + 1] = tp.y;
        col[k * 3] = color.r * fade;
        col[k * 3 + 1] = color.g * fade;
        col[k * 3 + 2] = color.b * fade;
      }
      item.trail.geometry.attributes.position.needsUpdate = true;
      item.trail.geometry.attributes.color.needsUpdate = true;
    }
    this.flightPool.end();
  }

  renderRings(pt) {
    this.records.rings = this.records.rings.filter((r) => pt < r.t1);
    this.ringPool.begin();
    for (const r of this.records.rings) {
      if (pt < r.t0) continue;
      const u = (pt - r.t0) / (r.t1 - r.t0);
      const item = this.ringPool.next();
      const radius = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - u, 3));
      item.position.set(r.at.x, r.at.y, 0);
      item.scale.setScalar(radius);
      item.material.color.set(r.color);
      item.material.opacity = 1 - u;
    }
    this.ringPool.end();
  }

  renderTelegraphs(pt) {
    this.records.telegraphs = this.records.telegraphs.filter((g) => pt < g.t1);
    this.telegraphPool.begin();
    for (const g of this.records.telegraphs) {
      const u = (pt - g.t0) / (g.t1 - g.t0);
      const item = this.telegraphPool.next();
      item.position.set(g.at.x, g.at.y, 0);
      item.material.opacity = (0.25 + 0.5 * u) * (0.75 + 0.25 * Math.sin(pt * 14));
    }
    this.telegraphPool.end();
  }

  renderNumbers(pt) {
    this.records.numbers = this.records.numbers.filter((n) => pt < n.t0 + FX.number);
    this.numberPool.begin();
    const v3 = new THREE.Vector3();
    const { w, h } = this.size;
    for (const n of this.records.numbers) {
      const u = (pt - n.t0) / FX.number;
      v3.set(n.x, n.y + 0.2 + u * 1.1, 0).project(this.camera);
      const el = this.numberPool.next(n.cls, n.text);
      const pop = u < 0.12 ? 1.5 - (u / 0.12) * 0.5 : 1;
      el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, -50%) scale(${pop})`;
      el.style.opacity = String(u < 0.65 ? 1 : (1 - u) / 0.35);
    }
    this.numberPool.end();
  }

  renderShake(pt) {
    this.records.shakes = this.records.shakes.filter((s) => pt - s.t0 < FX.shake);
    let ox = 0;
    let oy = 0;
    for (const s of this.records.shakes) {
      const k = pt - s.t0;
      const a = s.amp * Math.exp(-k * 6);
      ox += a * Math.sin(k * 70);
      oy += a * Math.cos(k * 53);
    }
    if (this.camCenter) this.camera.position.set(this.camCenter.x + ox, this.camCenter.y + oy, 50);
  }
}

// ---- Unit construction ----

const HP_W = 0.9;
const TRAIL_POINTS = 10;

function regular(n, radius, rotation) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rotation + (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return pts;
}

function shapePoints(shape, size, side) {
  const facing = side === 'player' ? Math.PI / 2 : -Math.PI / 2;
  switch (shape) {
    case 'hexagon':
      return regular(6, size, 0);
    case 'triangle':
      return regular(3, size, facing);
    case 'diamond':
      return regular(4, size, Math.PI / 2).map((p) => new THREE.Vector2(p.x * 0.7, p.y));
    case 'square':
      return regular(4, size, Math.PI / 4);
    case 'pentagon':
      return regular(5, size, facing);
    case 'star':
      return regular(10, size, facing).map((p, i) => (i % 2 ? p.multiplyScalar(0.45) : p));
    case 'circle':
    default:
      return regular(24, size, 0);
  }
}

function makeUnit(spec, def) {
  const visual = def.visual ?? { shape: 'circle', color: 0xffffff, size: 0.6 };
  const pts = shapePoints(visual.shape, visual.size, spec.side);
  const outline = new THREE.Shape(pts);
  outline.holes.push(new THREE.Path(pts.map((p) => p.clone().multiplyScalar(0.72))));
  const outlineMat = new THREE.MeshBasicMaterial({ color: visual.color, transparent: true, depthTest: false });
  const fillMat = new THREE.MeshBasicMaterial({ color: visual.color, transparent: true, opacity: 0.2, depthTest: false });
  const outlineMesh = new THREE.Mesh(new THREE.ShapeGeometry(outline), outlineMat);
  const fillMesh = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), fillMat);
  outlineMesh.renderOrder = RO.unit;
  fillMesh.renderOrder = RO.unitFill;
  const body = new THREE.Group();
  body.add(fillMesh, outlineMesh);

  const sideRing = makeHexRing(0.8, 0.86, SIDE_COLOR[spec.side], RO.unitFill);
  const sideMat = sideRing.material;

  const hpGroup = new THREE.Group();
  hpGroup.position.set(-HP_W / 2, -0.78, 0);
  const bar = (color, order, opacity = 1) => {
    const g = new THREE.PlaneGeometry(1, 0.1);
    g.translate(0.5, 0, 0);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
    mesh.renderOrder = order;
    return mesh;
  };
  const hpBg = bar(0x101820, RO.hp, 0.9);
  hpBg.scale.x = HP_W;
  const hpLag = bar(0xffffff, RO.hp, 0.8);
  const hpFg = bar(HP_COLOR[spec.side], RO.hp);
  hpLag.position.z = 0.001;
  hpFg.position.z = 0.002;
  hpGroup.add(hpBg, hpLag, hpFg);

  const group = new THREE.Group();
  group.add(sideRing, body, hpGroup);
  const pos = hexToWorld(spec.pos);
  group.position.set(pos.x, pos.y, 0);

  return {
    id: spec.id,
    side: spec.side,
    def,
    color: visual.color,
    baseColor: new THREE.Color(visual.color),
    group,
    body,
    outlineMat,
    fillMat,
    sideMat,
    hpGroup,
    hpFg,
    hpLag,
    lag: 1,
    move: null,
    lunge: null,
    flashT: -1e9,
    deathT: null,
  };
}

function disposeUnit(v) {
  v.group.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}

// ---- FX construction ----

function makeHexRing(inner, outer, color, order) {
  const geo = new THREE.RingGeometry(inner, outer, 6);
  geo.rotateZ(Math.PI / 6);
  const mesh = new THREE.Mesh(geo, additive(color, 0.6));
  mesh.renderOrder = order;
  return mesh;
}

const unitPlane = new THREE.PlaneGeometry(1, 1);

function makeBeam() {
  const group = new THREE.Group();
  const glow = new THREE.Mesh(unitPlane, additive(0xffffff));
  const core = new THREE.Mesh(unitPlane, additive(0xffffff));
  glow.renderOrder = RO.beam;
  core.renderOrder = RO.beam + 0.5;
  group.add(glow, core);
  group.glow = glow;
  group.core = core;
  return group;
}

const missileGeo = new THREE.ShapeGeometry(
  new THREE.Shape([new THREE.Vector2(0.2, 0), new THREE.Vector2(0, 0.07), new THREE.Vector2(-0.12, 0), new THREE.Vector2(0, -0.07)]),
);

function makeFlight() {
  const group = new THREE.Group();
  const head = new THREE.Mesh(missileGeo, additive(0xffffff));
  head.renderOrder = RO.flight;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
  const trail = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false }),
  );
  trail.frustumCulled = false;
  trail.renderOrder = RO.flight;
  group.add(trail, head);
  group.head = head;
  group.trail = trail;
  return group;
}

const ringGeo = new THREE.RingGeometry(0.86, 1, 40);

function makeRing() {
  const mesh = new THREE.Mesh(ringGeo, additive(0xffffff));
  mesh.renderOrder = RO.ring;
  return mesh;
}

function makeTargetLines(max) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false }),
  );
  lines.frustumCulled = false;
  lines.renderOrder = RO.target;
  return lines;
}

function makeStars(bounds) {
  const rng = createRng(7);
  const n = 260;
  const pos = new Float32Array(n * 3);
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = bounds.minX - w + rng.next() * w * 3;
    pos[i * 3 + 1] = bounds.minY - h + rng.next() * h * 3;
    pos[i * 3 + 2] = 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0x3a5a7a, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, depthTest: false }),
  );
  stars.renderOrder = RO.stars;
  return stars;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Reuses scene objects frame to frame: begin(), next() per active record, end() hides the rest.
class Pool {
  constructor(factory, parent) {
    this.factory = factory;
    this.parent = parent;
    this.items = [];
    this.used = 0;
  }
  begin() {
    this.used = 0;
  }
  next() {
    if (this.used === this.items.length) {
      const item = this.factory();
      this.items.push(item);
      this.parent.add(item);
    }
    const item = this.items[this.used++];
    item.visible = true;
    return item;
  }
  end() {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }
}

class DomPool {
  constructor(parent) {
    this.parent = parent;
    this.items = [];
    this.used = 0;
  }
  begin() {
    this.used = 0;
  }
  next(cls, text) {
    if (this.used === this.items.length) {
      const el = document.createElement('div');
      this.parent.appendChild(el);
      this.items.push(el);
    }
    const el = this.items[this.used++];
    if (el.className !== cls) el.className = cls;
    if (el.textContent !== text) el.textContent = text;
    el.style.display = '';
    return el;
  }
  end() {
    for (let i = this.used; i < this.items.length; i++) this.items[i].style.display = 'none';
  }
}

// Ring-buffer particle system. Velocities are in world units per TU; drag is per TU.
class Particles {
  constructor(max, texture) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 2);
    this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.lift = new Float32Array(max);
    this.rng = createRng(99);
    this.tmp = new THREE.Color();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 7,
        map: texture,
        vertexColors: true,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: false,
      }),
    );
    this.points.frustumCulled = false;
  }

  burst(x, y, color, count, speed, life, lift = 0) {
    this.tmp.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = this.rng.next() * Math.PI * 2;
      const s = speed * (0.3 + 0.7 * this.rng.next());
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.vel[i * 2] = Math.cos(a) * s;
      this.vel[i * 2 + 1] = Math.sin(a) * s;
      this.base[i * 3] = this.tmp.r;
      this.base[i * 3 + 1] = this.tmp.g;
      this.base[i * 3 + 2] = this.tmp.b;
      const l = life * (0.5 + 0.5 * this.rng.next());
      this.life[i] = l;
      this.maxLife[i] = l;
      this.lift[i] = lift;
    }
  }

  update(dt) {
    if (dt > 0) {
      const drag = Math.pow(0.04, dt);
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) continue;
        this.life[i] -= dt;
        this.vel[i * 2] *= drag;
        this.vel[i * 2 + 1] = this.vel[i * 2 + 1] * drag + this.lift[i] * dt;
        this.pos[i * 3] += this.vel[i * 2] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 2 + 1] * dt;
        const k = Math.max(0, this.life[i] / this.maxLife[i]);
        this.col[i * 3] = this.base[i * 3] * k;
        this.col[i * 3 + 1] = this.base[i * 3 + 1] * k;
        this.col[i * 3 + 2] = this.base[i * 3 + 2] * k;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.col.fill(0);
  }
}

// Three.js battlefield. Consumes timeline cues; never feeds anything back into the simulation.
// Everything except particles is evaluated from the presentation clock `pt`, so pause, speed
// changes and seeking all stay consistent. Particles integrate by the clock delta and are skipped
// for cues replayed silently during a seek.
// Pilot portraits render in a second, unbloomed pass over the glowing scene so faces stay crisp.
// Camera modes (top, tilt, iso) only change the view: in angled modes units hover above the board
// and their tokens, shapes and HP bars billboard toward the camera.
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
import { missileProgress, moveProgress } from './motion.js';
import { paintSpaceBackground } from './spaceBackground.js';
import { CAST } from './cast.js';
import { portraitCanvas } from './portraits.js';
import { unitIconCanvas } from './unitIcons.js';
import { SIM_CONFIG } from '../sim/config.js';

// Effect lifetimes, in TU of presentation time.
const FX = { beam: 0.45, slash: 0.25, ring: 0.7, number: 1.7, flash: 0.25, death: 0.4, shake: 0.9, muzzle: 0.3 };
// Card jolt when a unit takes damage: amplitude in world units, scaled by damage / max HP.
const HIT_SHAKE = { min: 0.04, max: 0.2, fullAt: 0.25, life: 0.35, decay: 9 };
// Laser sword swing, angles in radians across the attack direction and times in TU. The blade
// ignites and slowly draws back from -arc * prepFrom to -arc * cocked, then slashes through the
// target in the last `slash` TU before the hit, follows through to +arc and fades.
const SWORD = {
  arc: 1.25,
  prepFrom: 0.6,
  cocked: 1.15,
  tremble: 0.035,
  slash: 0.07,
  slashWidth: 1.35,
  ignite: 0.12,
  follow: 0.1,
  fade: 0.1,
  ghosts: 9,
  ghostStep: 0.01,
  hilt: 0.35,
  width: 0.16,
};
const CHARGE_SPARKS = 8;
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

const clamp01 = (u) => Math.min(1, Math.max(0, u));

// yaw/pitch in degrees; elev is how high unit cards hover above the board, in hex radii, kept low so a
// card reads as sitting over its hex. lift (0..1) scales true 3D heights such as missile arcs; top-down has none.
export const CAMERA_MODES = Object.freeze({
  top: { yaw: 0, pitch: 90, elev: 0, lift: 0 },
  tilt: { yaw: 0, pitch: 55, elev: 0.15, lift: 1 },
  // Lower than true isometric (35.26 deg) so the board reads flatter.
  // Negative yaw views from the south-west, so board rows run upward from left to right.
  iso: { yaw: -45, pitch: 28, elev: 0.15, lift: 1 },
});
const CAMERA_TWEEN_MS = 600;
const CAMERA_DISTANCE = 60;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// Hex tiles are prisms whose top face is the board plane.
const TILE_DEPTH = 0.28;
const TILE_SHADE = { top: 1, side: 0.42, bottom: 0.2 };
// Missile swarm look: each sim missile is drawn as MISSILE_SWARM missiles that burst upward in a
// cone, peak around MISSILE_APEX (hex radii, at the default hover height) and dive onto the target.
const MISSILE_SWARM = 4;
const MISSILE_APEX = 5;
// Path handle heights as multiples of the apex: a tall launch handle and a low dive handle put the
// peak about a third of the way to the target. `spread` sizes the sideways splay at launch.
const MISSILE_SHAPE = { rise: 1.6, dive: 0.6, spread: 1.3 };
const MISSILE_LAUNCH_STAGGER = 0.035;
// Deterministic 0..1 noise so each swarm missile keeps its path across seeks and replays.
const noise = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export class BattleView {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor(0x03050a, 1);
    this.scene = new THREE.Scene();
    this.background = new THREE.CanvasTexture(paintSpaceBackground());
    this.background.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.background;
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.camera.position.set(0, 0, CAMERA_DISTANCE);
    this.camModeName = 'top';
    this.camView = { ...CAMERA_MODES.top };
    this.camTween = null;
    this.elev = 0;
    this.lift = 0;
    this.shakeOffset = { x: 0, y: 0 };
    this.raycaster = new THREE.Raycaster();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();
    this.tmpD = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
    this.tmpM = new THREE.Matrix4();

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
    this.tokenScene = new THREE.Scene();
    // Drawn after the cards, without bloom, so melee blades and slash marks sit over the card they hit.
    this.overlayScene = new THREE.Scene();
    this.usePortraits = true;
    this.speakingId = null;
    this.ghostId = null;

    this.units = new Map();
    this.board = null;
    this.pt = 0;
    this.overtime = false;
    this.selectedId = null;
    this.size = { w: 1, h: 1 };
    this.fxRng = createRng(0xc0ffee);
    this.records = { beams: [], charges: [], swings: [], flights: [], rings: [], numbers: [], telegraphs: [], shakes: [], buffs: [] };
    this.equipDefs = {};

    this.particleTexture = makeGlowTexture();
    this.particles = new Particles(2400, this.particleTexture);
    this.particles.points.renderOrder = RO.particle;
    this.fxGroup.add(this.particles.points);

    this.beamPool = new Pool(() => makeBeam(), this.fxGroup);
    this.chargePool = new Pool(() => makeCharge(), this.fxGroup);
    this.bladePool = new Pool(() => makeBeam(), this.fxGroup);
    this.bladeOverPool = new Pool(() => makeBeam(), this.overlayScene);
    this.beamOverPool = new Pool(() => makeBeam(), this.overlayScene);
    this.buffPool = new Pool(() => makeHexRing(0.64, 0.72, 0xffffff, RO.unitFill), this.fxGroup);
    this.aimPool = new Pool(() => makeAimLine(), this.fxGroup);
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

    const fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    this.fills = new THREE.InstancedMesh(makeTileGeometry(), fillMat, cells.length);
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
    // Cover-fit the square backdrop to the viewport without stretching.
    const aspect = this.size.w / this.size.h;
    if (aspect > 1) {
      this.background.repeat.set(1, 1 / aspect);
      this.background.offset.set(0, (1 - 1 / aspect) / 2);
    } else {
      this.background.repeat.set(aspect, 1);
      this.background.offset.set((1 - aspect) / 2, 0);
    }
    this.fitCamera();
  }

  fitCamera() {
    this.applyCamera();
  }

  get cameraMode() {
    return this.camModeName;
  }

  setCameraMode(name, animate = true) {
    const target = CAMERA_MODES[name];
    if (!target) return;
    this.camModeName = name;
    this.camTween = animate ? { from: { ...this.camView }, to: target, t0: performance.now() } : null;
    if (!animate) Object.assign(this.camView, target);
    this.applyCamera();
  }

  updateCameraTween() {
    const tw = this.camTween;
    if (!tw) return;
    const u = clamp01((performance.now() - tw.t0) / CAMERA_TWEEN_MS);
    const k = u * u * (3 - 2 * u);
    for (const key of ['yaw', 'pitch', 'elev', 'lift']) this.camView[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * k;
    if (u >= 1) this.camTween = null;
  }

  // Orbits the board center at camView yaw/pitch and fits the board (plus hovering units) on screen.
  applyCamera() {
    if (!this.bounds) return;
    const { minX, maxX, minY, maxY } = this.bounds;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const yaw = THREE.MathUtils.degToRad(this.camView.yaw);
    const pitch = THREE.MathUtils.degToRad(this.camView.pitch);
    this.elev = this.camView.elev;
    this.lift = this.camView.lift;
    const sy = Math.sin(yaw);
    const cyaw = Math.cos(yaw);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(sy * cp, -cyaw * cp, sp);
    // d(dir)/d(pitch): perpendicular to the view and toward the board's far edge, even looking straight down.
    const up = new THREE.Vector3(-sy * sp, cyaw * sp, cp);
    const cam = this.camera;
    cam.up.copy(up);
    cam.position.set(cx, cy, 0).addScaledVector(dir, CAMERA_DISTANCE);
    cam.lookAt(cx, cy, 0);
    cam.updateMatrixWorld();

    const margin = 0.6;
    const top = this.elev + 0.8;
    const v = new THREE.Vector3();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const x of [minX - margin, maxX + margin]) {
      for (const y of [minY - margin, maxY + margin]) {
        for (const z of [0, top]) {
          v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
          x0 = Math.min(x0, v.x);
          x1 = Math.max(x1, v.x);
          y0 = Math.min(y0, v.y);
          y1 = Math.max(y1, v.y);
        }
      }
    }
    const aspect = this.size.w / this.size.h;
    let halfW = (x1 - x0) / 2;
    let halfH = (y1 - y0) / 2;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    // Shake slides the frustum in view space, so the framing math above stays unshaken.
    const mx = (x0 + x1) / 2 - this.shakeOffset.x;
    const my = (y0 + y1) / 2 - this.shakeOffset.y;
    Object.assign(cam, { left: mx - halfW, right: mx + halfW, top: my + halfH, bottom: my - halfH });
    cam.updateProjectionMatrix();
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
    this.tokenScene.clear();
    this.defs = setup.defs;
    this.equipDefs = setup.equipment ?? {};
    this.attackTimes = null;
    this.board = createBoardState(setup);
    for (const spec of setup.units) {
      const v = makeUnit(spec, setup.defs[spec.defId], this.equipDefs);
      this.units.set(spec.id, v);
      this.unitGroup.add(v.group);
      this.tokenScene.add(v.token);
    }
  }

  // Playback sink: start of a battle or a backwards seek.
  reset(timeline) {
    this.loadSetup(timeline.setup);
    this.clearEffects();
    this.pt = 0;
    // Fire times per unit drive the resource bar.
    this.attackTimes = new Map();
    for (const c of timeline.cues) {
      if (c.ev.type !== 'attack' || c.phase === 'charge') continue;
      if (!this.attackTimes.has(c.ev.unit)) this.attackTimes.set(c.ev.unit, []);
      this.attackTimes.get(c.ev.unit).push(c.t);
    }
  }

  // Placeholder resource until the sim has one: attack charge, filling between shots and emptying
  // when the unit fires. Full while deploying.
  resourceRatio(id, pt) {
    if (!this.attackTimes) return 1;
    const times = this.attackTimes.get(id) ?? [];
    let i = 0;
    while (i < times.length && times[i] <= pt) i++;
    const last = i > 0 ? times[i - 1] : 0;
    if (i < times.length) return clamp01((pt - last) / Math.max(1e-6, times[i] - last));
    const interval = i > 1 ? times[i - 1] - times[i - 2] : 4;
    return clamp01((pt - last) / interval);
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

  setPortraits(enabled) {
    this.usePortraits = enabled;
  }

  // Unit whose pilot is talking; its token pulses.
  setSpeaking(id) {
    this.speakingId = id;
  }

  // Unit being dragged during deployment; drawn faded at its old hex.
  setGhost(id) {
    this.ghostId = id;
  }

  unitAt(hex) {
    if (!this.board) return null;
    for (const s of this.board.units.values()) if (s.alive && s.q === hex.q && s.r === hex.r) return s.id;
    return null;
  }

  // Board hex under a screen point (ray against the ground plane).
  pickHex(clientX, clientY) {
    if (!this.grid) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(GROUND, new THREE.Vector3());
    if (!hit) return null;
    const h = worldToHex(hit.x, hit.y);
    return this.grid.has(h) ? h : null;
  }

  // Unit drawn under a screen point. Hovering units sit above their hex on screen, so test their
  // projected tokens first, then fall back to the hex under the pointer.
  unitAtPointer(clientX, clientY) {
    if (!this.board) return null;
    const rect = this.canvas.getBoundingClientRect();
    const pxPerUnit = rect.width / (this.camera.right - this.camera.left);
    const v = new THREE.Vector3();
    let best = null;
    let bestDist = 0.7 * pxPerUnit;
    for (const unit of this.units.values()) {
      if (!this.board.units.get(unit.id).alive) continue;
      const p = this.unitPosition(unit, this.pt);
      v.set(p.x, p.y, this.elev).project(this.camera);
      const d = Math.hypot(rect.left + ((v.x + 1) / 2) * rect.width - clientX, rect.top + ((1 - v.y) / 2) * rect.height - clientY);
      if (d < bestDist) {
        best = unit.id;
        bestDist = d;
      }
    }
    if (best) return best;
    const hex = this.pickHex(clientX, clientY);
    return hex ? this.unitAt(hex) : null;
  }

  unitPosition(v, t) {
    const s = this.board.units.get(v.id);
    const at = hexToWorld(s);
    let x = at.x;
    let y = at.y;
    const mv = v.move;
    if (mv && t < mv.t1) {
      const u = moveProgress(clamp01((t - mv.t0) / (mv.t1 - mv.t0)), mv.chainIn, mv.chainOut);
      x = mv.from.x + (mv.to.x - mv.from.x) * u;
      y = mv.from.y + (mv.to.y - mv.from.y) * u;
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
        v.move = { t0: cue.t, t1: cue.t1, chainIn: cue.chainIn, chainOut: cue.chainOut, from: hexToWorld(ev.from), to: hexToWorld(ev.to) };
        break;
      }
      case 'attack':
        if (cue.phase === 'charge') this.records.charges.push({ t0: cue.t, t1: cue.t1, unitId: ev.unit, targetId: ev.target, targetHex: ev.targetHex });
        else if (cue.phase === 'windup') this.records.swings.push({ t0: cue.t, tHit: cue.t1, unitId: ev.unit, targetId: ev.target, targetHex: ev.targetHex });
        else if (!ev.projectiles.length) this.fire(cue, silent);
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
      case 'equip_trigger':
        this.proc(cue, silent);
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
      // Slash mark flashed across the target at the hit; the sword itself comes from the wind-up cue.
      const px = (-dy / len) * 0.45;
      const py = (dx / len) * 0.45;
      this.records.beams.push({
        t0: cue.t1 ?? t,
        t1: (cue.t1 ?? t) + FX.slash,
        from: { x: to.x - px, y: to.y - py },
        to: { x: to.x + px, y: to.y + py },
        color: 0xffffff,
        width: 0.12,
        overlay: true,
      });
      return;
    }
    const isLine = ev.hexes.length > 1;
    const end = isLine ? hexToWorld(ev.hexes[ev.hexes.length - 1]) : to;
    const color = ev.kind === 'heal' ? HEAL_COLOR : v.color;
    this.records.beams.push({ t0: t, t1: t + FX.beam, from, to: end, color, width: isLine ? 0.42 : ev.kind === 'heal' ? 0.12 : 0.2 });
    if (ev.kind === 'beam') {
      // Release flash where the charge orb was.
      const m = muzzle(from, end);
      this.records.rings.push({ t0: t, t1: t + FX.muzzle, at: m, z: this.elev, r0: 0.25, r1: 1.0, color: 0xffffff });
      if (!silent) this.particles.burst(m.x, m.y, color, 16, 3, 0.35);
    } else if (!silent) {
      this.particles.burst(from.x, from.y, color, 6, 1.5, 0.35);
    }
  }

  launch(cue, silent) {
    const ev = cue.ev;
    if (!cue.impact || cue.t1 <= cue.t) return;
    const v = this.units.get(ev.unit);
    const shell = v.def.attack?.kind === 'shell';
    const from = this.unitPosition(v, cue.t);
    const base = {
      t1: cue.t1,
      from,
      impact: hexToWorld(cue.impact.hex),
      homingId: ev.homing ? ev.target : null,
      fan: ev.index - (ev.count - 1) / 2 + (ev.count === 1 ? (Number(ev.projectileId.slice(1)) % 2 ? 0.5 : -0.5) : 0),
      shell,
      color: v.color,
    };
    if (shell) {
      this.records.flights.push({ ...base, t0: cue.t });
    } else {
      // Cosmetic swarm: extra missiles launch a beat apart but all land on the sim's impact time.
      const id = Number(ev.projectileId.slice(1));
      const total = ev.count * MISSILE_SWARM;
      for (let k = 0; k < MISSILE_SWARM; k++) {
        const slot = ev.index * MISSILE_SWARM + k;
        const n = id * 31 + k * 7;
        this.records.flights.push({
          ...base,
          t0: Math.min(cue.t + k * MISSILE_LAUNCH_STAGGER, cue.t1 - 0.05),
          // Launch azimuths are spread evenly around the salvo, then jittered.
          azimuth: (Math.PI * 2 * (slot + 0.5 * noise(n))) / total + 0.7 * ev.index,
          cone: 0.22 + 0.4 * noise(n + 1),
          apexScale: 0.8 + 0.45 * noise(n + 2),
          dive: { x: noise(n + 3) - 0.5, y: noise(n + 4) - 0.5 },
        });
      }
    }
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
    if (!heal) {
      v.flashT = cue.t;
      // Keep the stronger of a new hit and what is left of the current jolt.
      const s = this.board.units.get(v.id);
      const amp = HIT_SHAKE.min + (HIT_SHAKE.max - HIT_SHAKE.min) * clamp01(ev.amount / s.maxHp / HIT_SHAKE.fullAt);
      const left = cue.t - v.shake.t0 < HIT_SHAKE.life ? v.shake.amp * Math.exp(-HIT_SHAKE.decay * (cue.t - v.shake.t0)) : 0;
      if (amp >= left) v.shake = { t0: cue.t, amp, phase: ev.seq * 2.39 };
    }
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

  // Equipment trigger: a name callout, a ground aura while a buff lasts, and a blast for OnDeath charges.
  proc(cue, silent) {
    const ev = cue.ev;
    const v = this.units.get(ev.unit);
    const item = this.equipDefs[ev.item];
    const color = item?.color ?? 0xffffff;
    const at = this.unitPosition(v, cue.t);
    v.slotFlash.set(ev.item, cue.t);
    this.records.numbers.push({ t0: cue.t, x: at.x, y: at.y, text: (item?.name ?? ev.item).toUpperCase(), cls: 'num proc', lift: 22 });
    if (ev.effect === 'buff') {
      this.records.buffs = this.records.buffs.filter((b) => !(b.unitId === ev.unit && b.item === ev.item));
      this.records.buffs.push({ unitId: ev.unit, item: ev.item, color, t0: cue.t, t1: ev.expiresTU });
    }
    if (ev.effect === 'blast') {
      this.records.rings.push({ t0: cue.t, t1: cue.t + FX.ring * 1.3, at, r0: 0.4, r1: 2.6, color });
      if (silent) return;
      this.particles.burst(at.x, at.y, color, 50, 6, 0.8);
      this.particles.burst(at.x, at.y, 0xffffff, 16, 3, 0.4);
      this.records.shakes.push({ t0: cue.t, amp: 0.2 });
    } else if (!silent) {
      this.particles.burst(at.x, at.y, color, 10, 1.2, 0.6, 1.4);
    }
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
    this.updateCameraTween();
    this.renderShake(pt);
    this.particles.points.position.z = this.elev;
    if (this.board) {
      this.renderUnits(pt, dtTU);
      this.renderTargets(pt);
    }
    this.renderCharges(pt);
    this.renderSwings(pt);
    this.renderBeams(pt);
    this.renderFlights(pt);
    this.renderRings(pt);
    this.renderTelegraphs(pt);
    this.renderBuffs(pt);
    this.renderNumbers(pt);
    this.particles.update(dtTU);
    if (this.gridMat) {
      const pulse = this.overtime ? 0.5 + 0.5 * Math.sin(pt * 4) : 0;
      this.gridMat.color.copy(GRID_COLOR).lerp(OVERTIME_COLOR, pulse);
    }
    if (this.bloomEnabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = false;
    this.renderer.render(this.tokenScene, this.camera);
    this.renderer.render(this.overlayScene, this.camera);
    this.renderer.autoClear = true;
  }

  // Screen-plane offset of a unit's card from its damage jolt.
  hitShake(v, pt) {
    const k = pt - v.shake.t0;
    if (k < 0 || k >= HIT_SHAKE.life) return null;
    const a = v.shake.amp * Math.exp(-HIT_SHAKE.decay * k);
    return { x: a * Math.sin(k * 95 + v.shake.phase), y: 0.5 * a * Math.cos(k * 71 + v.shake.phase) };
  }

  renderUnits(pt, dtTU) {
    const right = this.tmpA.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = this.tmpB.setFromMatrixColumn(this.camera.matrixWorld, 1);
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
          v.token.visible = false;
          continue;
        }
        opacity = 1 - u;
        scale = 1 + 0.6 * u;
      }
      v.group.visible = true;
      const jolt = this.hitShake(v, pt);
      const ox = jolt ? right.x * jolt.x + up.x * jolt.y : 0;
      const oy = jolt ? right.y * jolt.x + up.y * jolt.y : 0;
      const oz = jolt ? right.z * jolt.x + up.z * jolt.y : 0;
      v.upright.position.set(ox, oy, this.elev + oz);
      v.upright.quaternion.copy(this.camera.quaternion);
      v.stem.visible = this.elev > 0.05;
      v.stem.scale.z = Math.max(this.elev, 1e-3);
      const portraits = this.usePortraits && !!v.card;
      const ghost = v.id === this.ghostId ? 0.3 : 1;
      v.body.visible = !portraits;
      v.token.visible = portraits;
      if (v.frame) v.frame.visible = portraits;
      v.body.scale.setScalar(scale);
      const flash = clamp01(1 - (pt - v.flashT) / FX.flash);
      v.outlineMat.color.copy(v.baseColor).lerp(WHITE, flash);
      v.outlineMat.opacity = opacity * ghost;
      v.fillMat.opacity = (0.2 * opacity + 0.3 * flash) * ghost;
      v.sideMat.opacity = 0.45 * opacity * ghost;
      v.stem.material.opacity = 0.4 * opacity * ghost;

      const ratio = s.hp / s.maxHp;
      if (ratio > v.lag) v.lag = ratio;
      else v.lag = Math.max(ratio, v.lag - dtTU * 0.6);
      if (portraits) {
        const c = v.card;
        const speaking = v.id === this.speakingId;
        const pulse = speaking ? 1 + 0.06 * Math.sin(pt * 14) : 1;
        v.token.position.set(p.x + ox, p.y + oy, this.elev + oz);
        v.token.quaternion.copy(this.camera.quaternion);
        v.token.scale.setScalar(CARD_SCALE * scale * pulse);
        v.frame.scale.setScalar(CARD_SCALE * scale * pulse);
        for (const m of c.mats) m.opacity = m.userData.base * CARD_OPACITY * opacity * ghost;
        c.pilotMat.map = s.alive && ratio <= HURT_RATIO ? v.faces.hurt : v.faces.neutral;
        c.flashMat.opacity = 0.55 * flash * opacity;
        setBarFill(c.hpFill, c.hpX, ratio);
        setBarFill(c.hpLag, c.hpX, v.lag);
        setBarFill(c.resFill, c.resX, this.resourceRatio(v.id, pt));
        // Slots flash when their item triggers and shimmer while its buff is active.
        for (const slot of c.slots) {
          if (!slot.itemId) continue;
          const tf = v.slotFlash.get(slot.itemId);
          const f = tf == null ? 0 : clamp01(1 - (pt - tf) / 0.5);
          const buffed = this.records.buffs.some((b) => b.unitId === v.id && b.item === slot.itemId && pt >= b.t0);
          slot.mesh.material.color.copy(slot.color).lerp(WHITE, Math.max(f, buffed ? 0.25 + 0.15 * Math.sin(pt * 8) : 0));
        }
        v.frame.material.color.copy(v.baseColor).lerp(WHITE, Math.max(flash, speaking ? 0.4 : 0));
        v.frame.material.opacity = opacity * ghost;
      }
      v.hpFg.scale.x = Math.max(1e-4, ratio * HP_W);
      v.hpLag.scale.x = Math.max(1e-4, v.lag * HP_W);
      v.hpGroup.visible = s.alive && !portraits;
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
        const z = this.elev;
        pos.set([a.x + ux * 0.55, a.y + uy * 0.55, z, b.x - ux * 0.55, b.y - uy * 0.55, z], n * 6);
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
    this.beamOverPool.begin();
    for (const b of this.records.beams) {
      if (pt < b.t0) continue;
      const u = (pt - b.t0) / (b.t1 - b.t0);
      // Burst starts wider than its base width, then thins out.
      const burst = u < 0.15 ? 1.6 - (u / 0.15) * 0.6 : 1;
      const w = b.width * burst * Math.pow(1 - u, 0.6) * (0.85 + 0.15 * Math.sin(pt * 90));
      // Overlay beams also draw over the cards; the main-scene copy keeps the bloom halo.
      for (const item of b.overlay ? [this.beamPool.next(), this.beamOverPool.next()] : [this.beamPool.next()]) {
        const len = this.orientAlong(item, b.from, b.to);
        item.glow.scale.set(len, Math.max(1e-3, w), 1);
        item.core.scale.set(len, Math.max(1e-3, w * 0.35), 1);
        item.glow.material.color.set(b.color);
        item.glow.material.opacity = 1 - u;
        item.core.material.opacity = 1 - u;
      }
    }
    this.beamPool.end();
    this.beamOverPool.end();
  }

  // Places a unit-length plane between two board points at hover height, spun around its own axis
  // to face the camera so it keeps full width at any view angle. Returns the length.
  orientAlong(obj, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    obj.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, this.elev);
    const axis = this.tmpA.set(dx, dy, 0).normalize();
    const viewDir = this.camera.getWorldDirection(this.tmpB);
    const across = this.tmpC.crossVectors(axis, viewDir).normalize();
    const normal = this.tmpD.crossVectors(axis, across);
    obj.quaternion.setFromRotationMatrix(this.tmpM.makeBasis(axis, across, normal));
    return Math.hypot(dx, dy);
  }

  // Beam charge-up: a growing orb at the muzzle, a contracting ring, sparks spiralling inward and a
  // thin aim line to the target. Follows the attacker and target while either moves.
  renderCharges(pt) {
    this.records.charges = this.records.charges.filter((c) => pt < c.t1);
    this.chargePool.begin();
    this.aimPool.begin();
    for (const c of this.records.charges) {
      const v = this.units.get(c.unitId);
      if (pt < c.t0 || !v || !this.board.units.get(c.unitId).alive) continue;
      const u = clamp01((pt - c.t0) / (c.t1 - c.t0));
      const from = this.unitPosition(v, pt);
      const to = this.board.units.get(c.targetId)?.alive ? this.posOf(c.targetId, pt) : hexToWorld(c.targetHex);
      const m = muzzle(from, to);
      const flicker = 0.85 + 0.15 * Math.sin(pt * 70 + c.t0 * 13);
      const grow = u * u;

      const item = this.chargePool.next();
      item.position.set(m.x, m.y, this.elev);
      item.quaternion.copy(this.camera.quaternion);
      item.orb.scale.setScalar((0.1 + 0.4 * grow) * flicker);
      item.orb.material.color.set(v.color);
      item.orb.material.opacity = 0.45 + 0.55 * u;
      item.core.scale.setScalar((0.04 + 0.2 * grow) * flicker);
      item.ring.scale.setScalar(1.4 - 1.05 * u);
      item.ring.material.color.set(v.color);
      item.ring.material.opacity = 0.15 + 0.65 * u;
      item.sparks.forEach((s, i) => {
        const a = (i / CHARGE_SPARKS) * Math.PI * 2 + u * 3 + c.t0 * 5;
        const r = 0.15 + 1.4 * Math.pow(1 - u, 1.3);
        s.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        s.rotation.z = a + Math.PI;
        s.scale.setScalar(0.5 + 0.7 * u);
        s.material.color.set(i % 2 ? 0xffffff : v.color);
        s.material.opacity = i % 2 ? 0.7 : 1;
      });

      const aim = this.aimPool.next();
      const len = this.orientAlong(aim, m, to);
      aim.scale.set(len, 0.035 * flicker, 1);
      aim.material.color.set(v.color);
      aim.material.opacity = (0.12 + 0.5 * u) * (0.6 + 0.4 * Math.sin(pt * 40 + c.t0));
    }
    this.chargePool.end();
    this.aimPool.end();
  }

  // Laser sword swings: the blade ignites from the attacker, sweeps across the attack direction
  // accelerating into the hit, follows through and fades, trailing fading afterimages.
  renderSwings(pt) {
    this.records.swings = this.records.swings.filter((s) => pt < s.tHit + SWORD.follow + SWORD.fade);
    this.bladePool.begin();
    this.bladeOverPool.begin();
    for (const s of this.records.swings) {
      const v = this.units.get(s.unitId);
      if (pt < s.t0 || !v || !this.board.units.get(s.unitId).alive) continue;
      const from = this.unitPosition(v, pt);
      const to = this.board.units.get(s.targetId)?.alive ? this.posOf(s.targetId, pt) : hexToWorld(s.targetHex);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      const base = Math.atan2(dy, dx);
      // The blade reaches just past the target's center.
      const reach = Math.max(0.4, dist * 1.05 - SWORD.hilt);
      const hilt = { x: from.x + (dx / dist) * SWORD.hilt, y: from.y + (dy / dist) * SWORD.hilt };
      const slashStart = Math.max(s.t0, s.tHit - SWORD.slash);
      const angleAt = (t) => {
        if (t < slashStart) {
          // Prep: draw back to the cocked angle, trembling more as the charge builds.
          const k = clamp01((t - s.t0) / Math.max(1e-6, slashStart - s.t0));
          const draw = SWORD.prepFrom + (SWORD.cocked - SWORD.prepFrom) * k * k * (3 - 2 * k);
          return -SWORD.arc * draw + SWORD.tremble * k * Math.sin(t * 90);
        }
        if (t < s.tHit) {
          const k = clamp01((t - slashStart) / Math.max(1e-6, s.tHit - slashStart));
          return -SWORD.arc * SWORD.cocked * (1 - Math.pow(k, 1.5));
        }
        const k = clamp01((t - s.tHit) / SWORD.follow);
        return SWORD.arc * (1 - (1 - k) * (1 - k));
      };
      const slashing = pt >= slashStart && pt < s.tHit + SWORD.follow;
      const charge = pt < slashStart ? 0.85 + 0.15 * Math.sin(pt * 30) : 1;
      const fade = 1 - clamp01((pt - s.tHit - SWORD.follow) / SWORD.fade);
      for (let g = 0; g < SWORD.ghosts; g++) {
        const tg = pt - g * SWORD.ghostStep;
        if (tg < s.t0) break;
        const ignite = clamp01((tg - s.t0) / SWORD.ignite);
        const a = base + angleAt(tg);
        const tip = { x: hilt.x + Math.cos(a) * reach * ignite, y: hilt.y + Math.sin(a) * reach * ignite };
        const w = SWORD.width * charge * (slashing ? SWORD.slashWidth : 1) * (g === 0 ? 1 : 0.75);
        const alpha = fade * (g === 0 ? 1 : 0.45 * (1 - g / SWORD.ghosts));
        // Bloomed copy for the glow, plus an overlay copy drawn over the cards.
        for (const item of [this.bladePool.next(), this.bladeOverPool.next()]) {
          const len = Math.max(1e-3, this.orientAlong(item, hilt, tip));
          item.glow.scale.set(len, w, 1);
          item.core.scale.set(len, w * 0.35, 1);
          item.glow.material.color.set(v.color);
          item.glow.material.opacity = alpha;
          item.core.material.opacity = alpha;
        }
      }
    }
    this.bladePool.end();
    this.bladeOverPool.end();
  }

  // Point on a projectile path at curve parameter u. Shells lob in a sine arc. Missiles climb
  // almost vertically, cross at altitude and dive onto the target; top-down has no height, so
  // the fan spread carries the shape instead.
  flightPoint(f, u) {
    const end = f.homingId && this.board.units.get(f.homingId)?.alive ? this.posOf(f.homingId, this.pt) : f.impact;
    const e = this.elev;
    const dx = end.x - f.from.x;
    const dy = end.y - f.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    if (f.shell) {
      const bend = 0.4 * f.fan;
      const cx = (f.from.x + end.x) / 2 + px * bend;
      const cy = (f.from.y + end.y) / 2 + py * bend;
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      const arc = 2 * this.lift;
      return { x: a * f.from.x + b * cx + c * end.x, y: a * f.from.y + b * cy + c * end.y, z: e + arc * Math.sin(Math.PI * u) };
    }
    // Cubic: the first handle points up a tilted cone so the missile launches near-vertical and
    // splays out; the second sits lower above the target so it peaks early and finishes in a steep dive.
    const apex = MISSILE_APEX * this.lift * f.apexScale;
    const reach = apex > 0 ? apex * MISSILE_SHAPE.rise : 1.8;
    const lateral = apex > 0 ? Math.sin(f.cone) * apex * MISSILE_SHAPE.spread : reach;
    const p1x = f.from.x + Math.cos(f.azimuth) * lateral;
    const p1y = f.from.y + Math.sin(f.azimuth) * lateral;
    const p1z = e + Math.cos(f.cone) * (apex > 0 ? reach : 0);
    const p2x = end.x + f.dive.x * 0.8;
    const p2y = end.y + f.dive.y * 0.8;
    const p2z = e + apex * MISSILE_SHAPE.dive;
    const v = 1 - u;
    const a = v * v * v;
    const b = 3 * v * v * u;
    const c = 3 * v * u * u;
    const d = u * u * u;
    return {
      x: a * f.from.x + b * p1x + c * p2x + d * end.x,
      y: a * f.from.y + b * p1y + c * p2y + d * end.y,
      z: a * e + b * p1z + c * p2z + d * e,
    };
  }

  renderFlights(pt) {
    this.records.flights = this.records.flights.filter((f) => pt < f.t1);
    this.flightPool.begin();
    const color = new THREE.Color();
    for (const f of this.records.flights) {
      if (pt < f.t0) continue;
      const raw = (pt - f.t0) / (f.t1 - f.t0);
      const ease = (r) => (f.shell ? r : missileProgress(r));
      const u = ease(raw);
      const p = this.flightPoint(f, u);
      const q = this.flightPoint(f, Math.min(1, u + 0.02));
      const item = this.flightPool.next();
      item.head.position.set(p.x, p.y, p.z);
      // The head is a camera-facing sprite rotated to its on-screen direction of travel.
      const sa = this.tmpA.set(p.x, p.y, p.z).project(this.camera);
      const sb = this.tmpB.set(q.x, q.y, q.z).project(this.camera);
      const angle = Math.atan2((sb.y - sa.y) * this.size.h, (sb.x - sa.x) * this.size.w);
      item.head.quaternion.copy(this.camera.quaternion).multiply(this.tmpQ.setFromAxisAngle(Z_AXIS, angle));
      // Top-down cannot show a shell's height, so it fakes the lob by scaling.
      const fakeLob = f.shell && this.lift === 0;
      item.head.scale.setScalar(f.shell ? (fakeLob ? 1.6 + 1.2 * Math.sin(Math.PI * raw) : 1.8) : 0.8);
      item.head.material.color.set(f.color);
      const pos = item.trail.geometry.attributes.position.array;
      const col = item.trail.geometry.attributes.color.array;
      color.set(f.color);
      for (let k = 0; k < TRAIL_POINTS; k++) {
        const tp = this.flightPoint(f, ease(Math.max(0, raw - k * 0.035)));
        const fade = 1 - k / (TRAIL_POINTS - 1);
        pos[k * 3] = tp.x;
        pos[k * 3 + 1] = tp.y;
        pos[k * 3 + 2] = tp.z;
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
      item.position.set(r.at.x, r.at.y, r.z ?? 0);
      if (r.z != null) item.quaternion.copy(this.camera.quaternion);
      else item.quaternion.identity();
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

  // Active equipment buffs: a spinning, pulsing hex ring on the board under the unit, one per buff.
  renderBuffs(pt) {
    this.records.buffs = this.records.buffs.filter((b) => pt < b.t1);
    this.buffPool.begin();
    const stacked = new Map();
    for (const b of this.records.buffs) {
      const v = this.units.get(b.unitId);
      if (pt < b.t0 || !v || !this.board.units.get(b.unitId).alive) continue;
      const n = stacked.get(b.unitId) ?? 0;
      stacked.set(b.unitId, n + 1);
      const p = this.unitPosition(v, pt);
      const item = this.buffPool.next();
      item.position.set(p.x, p.y, 0.01);
      item.rotation.z = (n % 2 ? -1 : 1) * pt * 1.5;
      item.scale.setScalar(1 + 0.12 * n + 0.04 * Math.sin(pt * 8));
      item.material.color.set(b.color);
      // Fades out over the last TU of the buff.
      item.material.opacity = 0.75 * Math.min(1, b.t1 - pt);
    }
    this.buffPool.end();
  }

  renderNumbers(pt) {
    this.records.numbers = this.records.numbers.filter((n) => pt < n.t0 + FX.number);
    this.numberPool.begin();
    const v3 = new THREE.Vector3();
    const { w, h } = this.size;
    for (const n of this.records.numbers) {
      const u = (pt - n.t0) / FX.number;
      v3.set(n.x, n.y, this.elev).project(this.camera);
      const el = this.numberPool.next(n.cls, n.text);
      const pop = u < 0.12 ? 1.5 - (u / 0.12) * 0.5 : 1;
      const rise = 14 + (n.lift ?? 0) + u * 48;
      el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h - rise}px) translate(-50%, -50%) scale(${pop})`;
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
    this.shakeOffset.x = ox;
    this.shakeOffset.y = oy;
    this.applyCamera();
  }
}

// ---- Unit construction ----

const HP_W = 0.9;
const TRAIL_POINTS = 10;
const HURT_RATIO = 0.35;
const stemGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]);
const portraitTextures = new Map();

const unitIconTextures = new Map();

function unitIconTexture(defId, visual, side) {
  const key = `${defId}|${side}`;
  if (!unitIconTextures.has(key)) {
    const tex = new THREE.CanvasTexture(unitIconCanvas(defId, visual, side));
    tex.colorSpace = THREE.SRGBColorSpace;
    unitIconTextures.set(key, tex);
  }
  return unitIconTextures.get(key);
}

// ---- Card token ----
// A slanted card split into vertical slices: HP bar | resource bar | unit badge | pilot portrait,
// with an equipment strip below it, sliced per slot. Sizes are world units before billboarding.
// The equipment strip is 20% of the main card's height; skew keeps the edge slant constant as height changes.
const CARD = { w: 1.1, h: 0.825, eq: 0.165, gap: 0.045, skew: 0.10125, sliceGap: 0.02, border: 0.012 };
// Overall card size multiplier, applied to the card, its depth slab and its outline together.
const CARD_SCALE = 0.8;
// Whole-card opacity (25% transparent).
const CARD_OPACITY = 0.75;
const CARD_SLICES = { hp: [0, 0.05], res: [0.05, 0.1], unit: [0.1, 0.7], pilot: [0.7, 1] };
const CARD_T = CARD.h + CARD.gap + CARD.eq;
const CARD_K = CARD.skew / CARD_T;
const CARD_MAIN = [-CARD_T / 2 + CARD.eq + CARD.gap, CARD_T / 2];
const CARD_EQ = [-CARD_T / 2, -CARD_T / 2 + CARD.eq];
const CARD_COLORS = { plate: 0x05080f, hpBg: 0x3a0a10, hp: 0xff3344, hpLag: 0xffd0d0, resBg: 0x0a1a3a, res: 0x3c8cff, emptySlot: 0x1a2230, border: 0xcfe8f5 };

function sliceX(f0, f1) {
  const x0 = -CARD.w / 2 + f0 * CARD.w + (f0 > 0 ? CARD.sliceGap / 2 : 0);
  const x1 = -CARD.w / 2 + f1 * CARD.w - (f1 < 1 ? CARD.sliceGap / 2 : 0);
  return [x0, x1];
}

// Rewrites a quad's corners as the slice x0..x1 by y0..y1, sheared like the card.
function setSlantQuad(geo, x0, x1, y0, y1) {
  const p = geo.attributes.position.array;
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], i) => p.set([x + CARD_K * y, y, 0], i * 3));
  geo.attributes.position.needsUpdate = true;
}

// Sheared quad whose uvs cover-fit a square texture, so art is cropped by the slant, not skewed.
function slantQuad(x0, x1, y0, y1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  setSlantQuad(geo, x0, x1, y0, y1);
  const p = geo.attributes.position.array;
  const xs = [p[0], p[3], p[6], p[9]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const cx = (minX + maxX) / 2;
  const cy = (y0 + y1) / 2;
  const size = Math.max(maxX - minX, y1 - y0);
  const uv = new Float32Array(8);
  for (let i = 0; i < 4; i++) {
    uv[i * 2] = 0.5 + (p[i * 3] - cx) / size;
    uv[i * 2 + 1] = 0.5 + (p[i * 3 + 1] - cy) / size;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Bars fill from the bottom; the fill quad keeps the card's slant at every height.
function setBarFill(mesh, xr, ratio) {
  const [y0, y1] = CARD_MAIN;
  setSlantQuad(mesh.geometry, xr[0], xr[1], y0, y0 + (y1 - y0) * clamp01(ratio));
}

function makeCard(spec, visual, pilotTexture, equipment, equipDefs) {
  const group = new THREE.Group();
  const mats = [];
  // Layers stack by local z; the card faces the camera, so higher z draws on top.
  const layer = (geo, params, z, base = 1) => {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, ...params, opacity: base });
    mat.userData.base = base;
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = z;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const [y0, y1] = CARD_MAIN;
  const hpX = sliceX(...CARD_SLICES.hp);
  const resX = sliceX(...CARD_SLICES.res);
  const pad = 0.03;
  const depthColor = new THREE.Color(visual.color).multiplyScalar(0.55);
  layer(makeCardDepth(-CARD.w / 2 - pad, CARD.w / 2 + pad, CARD_EQ[0] - pad, y1 + pad), { color: depthColor, vertexColors: true, side: THREE.DoubleSide }, -0.001);
  layer(slantQuad(-CARD.w / 2 - pad, CARD.w / 2 + pad, CARD_EQ[0] - pad, y1 + pad), { color: CARD_COLORS.plate }, 0, 0.85);
  layer(slantQuad(...hpX, y0, y1), { color: CARD_COLORS.hpBg }, 0.001);
  const hpLag = layer(slantQuad(...hpX, y0, y1), { color: CARD_COLORS.hpLag }, 0.002);
  const hpFill = layer(slantQuad(...hpX, y0, y1), { color: CARD_COLORS.hp }, 0.003);
  layer(slantQuad(...resX, y0, y1), { color: CARD_COLORS.resBg }, 0.001);
  const resFill = layer(slantQuad(...resX, y0, y1), { color: CARD_COLORS.res }, 0.003);
  // Thin borders: slightly larger quads behind the unit and pilot portraits.
  const b = CARD.border;
  for (const [x0, x1] of [sliceX(...CARD_SLICES.unit), sliceX(...CARD_SLICES.pilot)]) {
    layer(slantQuad(x0 - b, x1 + b, y0 - b, y1 + b), { color: CARD_COLORS.border }, 0.0005, 0.9);
  }
  layer(slantQuad(...sliceX(...CARD_SLICES.unit), y0, y1), { map: unitIconTexture(spec.defId, visual, spec.side) }, 0.001);
  const pilot = layer(slantQuad(...sliceX(...CARD_SLICES.pilot), y0, y1), { map: pilotTexture }, 0.001);

  const slots = [];
  const count = SIM_CONFIG.equipmentSlots;
  for (let i = 0; i < count; i++) {
    const itemId = equipment[i] ?? null;
    const color = new THREE.Color(itemId && equipDefs[itemId] ? equipDefs[itemId].color : CARD_COLORS.emptySlot);
    const mesh = layer(slantQuad(...sliceX(i / count, (i + 1) / count), ...CARD_EQ), { color }, 0.001, itemId ? 0.85 : 0.6);
    slots.push({ mesh, itemId, color });
  }

  const flash = layer(slantQuad(-CARD.w / 2, CARD.w / 2, y0, y1), { color: 0xffffff }, 0.004, 0);
  return { group, mats, hpFill, hpLag, resFill, hpX, resX, pilotMat: pilot.material, flashMat: flash.material, slots };
}

// Faux thickness behind the card: the outline shifted down-right plus side faces joining each edge to
// its shifted copy. The visible right faces are lit more than the bottom faces.
const CARD_DEPTH = { dx: 0.0525, dy: -0.0525, back: 0.35, bottom: 0.45, right: 0.8 };

function makeCardDepth(x0, x1, y0, y1) {
  const front = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [x + CARD_K * y, y]);
  const back = front.map(([x, y]) => [x + CARD_DEPTH.dx, y + CARD_DEPTH.dy]);
  const pos = [];
  const col = [];
  const tri = (a, b, c, shade) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], 0);
      col.push(shade, shade, shade);
    }
  };
  tri(back[0], back[1], back[2], CARD_DEPTH.back);
  tri(back[0], back[2], back[3], CARD_DEPTH.back);
  for (let i = 0; i < 4; i++) {
    const a = front[i];
    const b = front[(i + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Corners run counter-clockwise, so (ey, -ex) is the edge's outward normal.
    const nx = (b[1] - a[1]) / len;
    const shade = CARD_DEPTH.bottom + (CARD_DEPTH.right - CARD_DEPTH.bottom) * Math.max(0, nx);
    tri(a, b, back[(i + 1) % 4], shade);
    tri(a, back[(i + 1) % 4], back[i], shade);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// Glowing outline of the card and its equipment strip, drawn in the bloom scene.
function makeCardFrame(color) {
  const corners = (x0, x1, ya, yb) => [[x0, ya], [x1, ya], [x1, yb], [x0, yb]].map(([x, y]) => [x + CARD_K * y, y]);
  const pts = [];
  for (const quad of [corners(-CARD.w / 2, CARD.w / 2, ...CARD_MAIN), corners(-CARD.w / 2, CARD.w / 2, ...CARD_EQ)]) {
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = quad[i];
      const [bx, by] = quad[(i + 1) % 4];
      pts.push(ax, ay, 0, bx, by, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const frame = new THREE.LineSegments(geo, additive(color, 1));
  frame.renderOrder = RO.unit;
  frame.frustumCulled = false;
  return frame;
}

function portraitTexture(spec, mood) {
  const key = `${spec.id}|${mood}`;
  if (!portraitTextures.has(key)) {
    const tex = new THREE.CanvasTexture(portraitCanvas(spec, mood, 128));
    tex.colorSpace = THREE.SRGBColorSpace;
    portraitTextures.set(key, tex);
  }
  return portraitTextures.get(key);
}

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

function makeUnit(spec, def, equipDefs = {}) {
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

  // Card token, rendered in the unbloomed token scene; its glowing outline sits in the bloom scene.
  // Units without a cast entry keep their shape.
  const portrait = CAST[spec.defId]?.portrait;
  let token = new THREE.Group();
  let card = null;
  let frame = null;
  let faces = null;
  if (portrait) {
    faces = { neutral: portraitTexture(portrait, 'neutral'), hurt: portraitTexture(portrait, 'hurt') };
    card = makeCard(spec, visual, faces.neutral, spec.equipment ?? [], equipDefs);
    token = card.group;
    frame = makeCardFrame(visual.color);
  }

  // Upright parts billboard toward the camera and hover at the view's elevation; the side ring stays on the board.
  const upright = new THREE.Group();
  upright.add(body, hpGroup);
  if (frame) upright.add(frame);
  const stem = new THREE.Line(stemGeo, additive(SIDE_COLOR[spec.side], 0.4));
  stem.renderOrder = RO.unitFill;

  const group = new THREE.Group();
  group.add(sideRing, stem, upright);
  const pos = hexToWorld(spec.pos);
  group.position.set(pos.x, pos.y, 0);
  token.position.copy(group.position);

  return {
    id: spec.id,
    side: spec.side,
    def,
    color: visual.color,
    baseColor: new THREE.Color(visual.color),
    group,
    upright,
    stem,
    body,
    token,
    card,
    frame,
    faces,
    slotFlash: new Map(),
    outlineMat,
    fillMat,
    sideMat,
    hpGroup,
    hpFg,
    hpLag,
    lag: 1,
    move: null,
    flashT: -1e9,
    shake: { t0: -1e9, amp: 0, phase: 0 },
    deathT: null,
  };
}

// Shared geometries and portrait textures are kept; per-unit geometry and materials are freed.
function disposeUnit(v) {
  for (const root of [v.group, v.token]) {
    root.traverse((o) => {
      if (!o.isMesh && !o.isLine) return;
      if (o.geometry !== stemGeo) o.geometry.dispose();
      o.material.dispose();
    });
  }
}

// ---- FX construction ----

// Pointy-top hex prism, top face at z = 0. Vertex colors darken the sides so tiles read as raised.
function makeTileGeometry() {
  // Tipped onto the board plane, a 6-sided cylinder already has pointy-top corners (-30, 30, 90 deg...).
  const geo = new THREE.CylinderGeometry(0.94, 0.94, TILE_DEPTH, 6);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -TILE_DEPTH / 2);
  const normals = geo.attributes.normal;
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const nz = normals.getZ(i);
    const shade = nz > 0.5 ? TILE_SHADE.top : nz < -0.5 ? TILE_SHADE.bottom : TILE_SHADE.side;
    colors.fill(shade, i * 3, i * 3 + 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

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

// Point just in front of a unit toward its target, where beams charge and leave.
function muzzle(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * 0.55, y: from.y + (dy / len) * 0.55 };
}

const orbGeo = new THREE.CircleGeometry(1, 24);

function makeCharge() {
  const group = new THREE.Group();
  const orb = new THREE.Mesh(orbGeo, additive(0xffffff, 0.8));
  const core = new THREE.Mesh(orbGeo, additive(0xffffff));
  const ring = new THREE.Mesh(ringGeo, additive(0xffffff, 0.5));
  orb.renderOrder = RO.beam;
  core.renderOrder = RO.beam + 0.5;
  ring.renderOrder = RO.beam;
  group.add(ring, orb, core);
  group.sparks = [];
  for (let i = 0; i < CHARGE_SPARKS; i++) {
    const s = new THREE.Mesh(missileGeo, additive(0xffffff));
    s.renderOrder = RO.beam;
    group.add(s);
    group.sparks.push(s);
  }
  Object.assign(group, { orb, core, ring });
  return group;
}

function makeAimLine() {
  const mesh = new THREE.Mesh(unitPlane, additive(0xffffff, 0.3));
  mesh.renderOrder = RO.target;
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
    pos[i * 3] = bounds.minX - 2 * w + rng.next() * w * 5;
    pos[i * 3 + 1] = bounds.minY - 2 * h + rng.next() * h * 5;
    pos[i * 3 + 2] = -8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0x5a7aa0, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0.9 }),
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

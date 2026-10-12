// Deterministic hex-grid battle simulator. No rendering, timing, or platform dependencies.
//
// ASSUMPTION (GDD 15, TBD) - per-TU phase order:
//   1. Buff expiry       equipment buffs whose duration ended are removed
//   2. Move completion   units whose hex crossing ends this TU become idle
//   3. Projectile impact  projectiles due this TU land; their damage is queued
//   4. Targeting          invalid targets are dropped, idle units acquire new ones
//   5. Actions            in action order: attack if in range and ready, else step toward target
//   6. Timeout damage     queued for every living unit once timeoutTU is reached
//   7. Damage / healing   queue resolved in order; simultaneous, so units killed this TU still acted
//   8. Death              units at 0 HP are removed and free their hex
//      Equipment triggered by deaths (OnKill, OnDeath) queues more effects; 7-8 repeat until settled.
//   9. Victory check
// Action order: setup order within each side, interleaved player/enemy. Earlier units win hex contests.
// A moving unit occupies its destination hex as soon as it starts the crossing.
// Equipment triggers fire in equipment-slot order. Buffs apply immediately, so a buff gained from one
// hit already counts for later hits in the same TU.

import { createRng } from './rng.js';
import { DIRECTIONS, hexDisk, hexDistance, hexKey } from './hex.js';
import { gridFromSpec } from './grid.js';
import { attackHexes } from './geometry.js';
import { SIM_CONFIG, attackIntervalTU, moveTUPerHex } from './config.js';
import { applyMods } from './equipment.js';

const STAT_KEYS = ['hp', 'damage', 'armor', 'moveSpeed', 'attackSpeed'];

export function simulate(setup, options = {}) {
  const config = { ...SIM_CONFIG, ...setup.config };
  const ctx = createContext(setup, config);
  const snapshots = options.recordSnapshots ? [] : null;

  ctx.emit('battle_start', { seed: setup.seed, setup: structuredClone(setup) });
  while (!ctx.result) {
    step(ctx);
    if (snapshots) snapshots.push(snapshotUnits(ctx));
    ctx.tu++;
  }
  return {
    log: ctx.log,
    winner: ctx.result.winner,
    endTU: ctx.result.tu,
    finalState: snapshotUnits(ctx),
    snapshots,
  };
}

// Base stats with static equipment mods applied, plus the unit's equipment triggers in slot order.
export function equippedStats(def, equipmentIds = [], equipmentDefs = {}) {
  const items = equipmentIds.map((id) => {
    const item = equipmentDefs[id];
    if (!item) throw new Error(`Unknown equipment: ${id}`);
    return { id, ...item };
  });
  const stats = {};
  for (const key of STAT_KEYS) {
    stats[key] = applyMods(
      def.stats[key],
      items.flatMap((it) => (it.mods ?? []).filter((m) => m.stat === key)),
    );
  }
  stats.hp = Math.round(stats.hp);
  const triggers = items.flatMap((it) => (it.triggers ?? []).map((t) => ({ itemId: it.id, ...t })));
  return { stats, triggers };
}

function createContext(setup, config) {
  const grid = gridFromSpec(setup.grid);
  const sideIndex = { player: 0, enemy: 0 };
  const units = setup.units.map((spec) => {
    const def = setup.defs[spec.defId];
    if (!def) throw new Error(`Unknown unit def: ${spec.defId}`);
    const { stats, triggers } = equippedStats(def, spec.equipment, setup.equipment);
    return {
      id: spec.id,
      defId: spec.defId,
      side: spec.side,
      sideOrder: sideIndex[spec.side]++,
      q: spec.pos.q,
      r: spec.pos.r,
      hp: stats.hp,
      maxHp: stats.hp,
      stats,
      triggers,
      buffs: [],
      range: def.stats.range,
      attack: def.attack ?? null,
      targeting: def.targeting ?? { mode: 'closest' },
      targetId: null,
      moving: null,
      nextAttackTU: 0,
      lastHitBy: null,
      alive: true,
    };
  });
  const order = [...units].sort(
    (a, b) => a.sideOrder - b.sideOrder || (a.side === 'player' ? 0 : 1) - (b.side === 'player' ? 0 : 1),
  );

  const occupancy = new Map();
  for (const u of order) {
    const k = hexKey(u);
    if (!grid.has(u)) throw new Error(`Unit ${u.id} placed off the board at ${k}`);
    if (occupancy.has(k)) throw new Error(`Units ${occupancy.get(k)} and ${u.id} share hex ${k}`);
    occupancy.set(k, u.id);
  }

  const ctx = {
    config,
    grid,
    order,
    byId: new Map(order.map((u) => [u.id, u])),
    occupancy,
    rng: createRng(setup.seed),
    projectiles: [],
    queue: [],
    nextAttackId: 1,
    nextProjectileId: 1,
    nextTriggerId: 1,
    tu: 0,
    log: [],
    result: null,
    // Returns the new event's seq so effects can point back at their cause.
    emit(type, data) {
      const seq = ctx.log.length;
      ctx.log.push({ seq, tu: ctx.tu, type, ...data });
      return seq;
    },
  };
  return ctx;
}

// Current stat value including active buffs.
function stat(ctx, u, key) {
  const mods = [];
  for (const b of u.buffs) for (const m of b.mods) if (m.stat === key) mods.push(m);
  return mods.length ? applyMods(u.stats[key], mods) : u.stats[key];
}

function step(ctx) {
  const { tu, config } = ctx;

  for (const u of ctx.order) {
    if (!u.alive || !u.buffs.length) continue;
    for (const b of u.buffs) if (b.expiresTU <= tu) ctx.emit('buff_end', { unit: u.id, item: b.item });
    u.buffs = u.buffs.filter((b) => b.expiresTU > tu);
  }

  for (const u of ctx.order) {
    if (u.alive && u.moving && u.moving.arriveTU === tu) {
      u.moving = null;
      ctx.emit('move_end', { unit: u.id, at: pos(u) });
    }
  }

  resolveImpacts(ctx);

  for (const u of ctx.order) if (u.alive) updateTarget(ctx, u);

  for (const u of ctx.order) if (u.alive) act(ctx, u);

  if (tu === config.timeoutTU) ctx.emit('timeout_begin', {});
  if (tu >= config.timeoutTU) {
    const raw = config.timeoutDamageBase + config.timeoutDamageGrowth * (tu - config.timeoutTU);
    for (const u of ctx.order) {
      if (u.alive) ctx.queue.push({ kind: 'damage', targetId: u.id, raw, source: { timeout: true }, ignoreArmor: true });
    }
  }

  // Death triggers can queue more damage or healing; settle until nothing is pending.
  do {
    resolveQueue(ctx);
    resolveDeaths(ctx);
  } while (ctx.queue.length);
  checkVictory(ctx);
}

// ---- Equipment triggers ----

function fireTriggers(ctx, u, on, causeSeq) {
  for (const t of u.triggers) {
    if (t.on !== on) continue;
    const e = t.effect;
    const triggerId = `q${ctx.nextTriggerId++}`;
    const base = { triggerId, unit: u.id, item: t.itemId, on, effect: e.type, causeSeq };
    const source = { unit: u.id, triggerId };
    if (e.type === 'buff') {
      const expiresTU = ctx.tu + e.durationTU;
      const existing = u.buffs.find((b) => b.item === t.itemId);
      if (existing) existing.expiresTU = expiresTU;
      else u.buffs.push({ item: t.itemId, mods: e.mods, expiresTU });
      ctx.emit('equip_trigger', { ...base, expiresTU });
    } else if (e.type === 'heal') {
      ctx.emit('equip_trigger', base);
      ctx.queue.push({ kind: 'heal', targetId: u.id, raw: e.amount, source });
    } else if (e.type === 'blast') {
      const hexes = hexDisk(pos(u), e.radius).filter((h) => ctx.grid.has(h));
      ctx.emit('equip_trigger', { ...base, hexes });
      for (const victim of victimsOn(ctx, hexes, u.side)) {
        ctx.queue.push({ kind: 'damage', targetId: victim.id, raw: e.damage, source });
      }
    } else {
      throw new Error(`Unknown equipment effect: ${e.type}`);
    }
  }
}

// ---- Targeting ----

function updateTarget(ctx, u) {
  if (u.targetId) {
    const t = ctx.byId.get(u.targetId);
    if (isValidTarget(u, t)) return;
    ctx.emit('target', { unit: u.id, target: null, prev: u.targetId, reason: 'invalid' });
    u.targetId = null;
  }
  const next = selectTarget(ctx, u);
  if (next) {
    u.targetId = next.id;
    ctx.emit('target', { unit: u.id, target: next.id, prev: null, reason: 'acquire' });
  }
}

function isValidTarget(u, t) {
  if (!t || !t.alive) return false;
  if (u.targeting.mode === 'ally_lowest_hp') return t.side === u.side && t.hp < t.maxHp;
  return t.side !== u.side;
}

// Lexicographic comparison of numeric/string keys; ids break any remaining tie.
function minBy(list, keyFn) {
  let best = null;
  let bestKey = null;
  for (const item of list) {
    const k = keyFn(item);
    if (!best || compareKeys(k, bestKey) < 0) {
      best = item;
      bestKey = k;
    }
  }
  return best;
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

// ASSUMPTION (GDD 11, TBD) tie-breaks: closest -> lowest HP -> id; weakest -> lowest HP -> closest -> id.
function selectTarget(ctx, u) {
  const mode = u.targeting.mode;
  if (mode === 'ally_lowest_hp') {
    const injured = ctx.order.filter((o) => o.alive && o !== u && o.side === u.side && o.hp < o.maxHp);
    return minBy(injured, (o) => [o.hp / o.maxHp, hexDistance(u, o), o.id]);
  }
  const enemies = ctx.order.filter((o) => o.alive && o.side !== u.side);
  if (mode === 'weakest') {
    const near = enemies.filter((o) => hexDistance(u, o) <= u.targeting.range);
    if (near.length) return minBy(near, (o) => [o.hp, hexDistance(u, o), o.id]);
  }
  return minBy(enemies, (o) => [hexDistance(u, o), o.hp, o.id]);
}

// ---- Actions ----

function act(ctx, u) {
  if (u.moving && !ctx.config.canAttackWhileMoving) return;
  if (!u.attack) return;

  const target = u.targetId ? ctx.byId.get(u.targetId) : null;
  if (!target) {
    if (u.targeting.mode === 'ally_lowest_hp') follow(ctx, u);
    return;
  }

  if (hexDistance(u, target) <= u.range) {
    if (ctx.tu >= u.nextAttackTU) performAttack(ctx, u, target);
  } else if (!u.moving) {
    tryMove(ctx, u, target, u.range);
  }
}

function follow(ctx, u) {
  if (u.moving) return;
  const allies = ctx.order.filter((o) => o.alive && o !== u && o.side === u.side);
  const ally = minBy(allies, (o) => [hexDistance(u, o), o.id]);
  if (ally && hexDistance(u, ally) > ctx.config.supportFollowRange) tryMove(ctx, u, ally, ctx.config.supportFollowRange);
}

function tryMove(ctx, u, goal, range) {
  const moveTU = moveTUPerHex(stat(ctx, u, 'moveSpeed'), ctx.config);
  if (moveTU === Infinity) return;
  const next = findStep(ctx, u, goal, range);
  if (!next) return;
  const from = pos(u);
  ctx.occupancy.delete(hexKey(from));
  ctx.occupancy.set(hexKey(next), u.id);
  u.q = next.q;
  u.r = next.r;
  const arriveTU = ctx.tu + moveTU;
  u.moving = { arriveTU };
  ctx.emit('move_start', { unit: u.id, from, to: pos(u), arriveTU });
}

// BFS over free hexes for the nearest hex within `range` of goal; returns the first step.
// Unreachable goals fall back to the reachable hex closest to goal, if it is closer than the start.
// ASSUMPTION (GDD 10, TBD): ties resolve by BFS discovery order, which follows DIRECTIONS.
export function findStep(ctx, u, goal, range) {
  const start = pos(u);
  const startKey = hexKey(start);
  const parents = new Map([[startKey, null]]);
  const frontier = [start];
  let best = null;
  let bestDist = hexDistance(start, goal);
  for (let i = 0; i < frontier.length; i++) {
    const cur = frontier[i];
    for (const d of DIRECTIONS) {
      const n = { q: cur.q + d.q, r: cur.r + d.r };
      const k = hexKey(n);
      if (parents.has(k) || !ctx.grid.has(n) || ctx.occupancy.has(k)) continue;
      parents.set(k, cur);
      const dist = hexDistance(n, goal);
      if (dist <= range) return firstStep(parents, n, startKey);
      if (dist < bestDist) {
        best = n;
        bestDist = dist;
      }
      frontier.push(n);
    }
  }
  return best ? firstStep(parents, best, startKey) : null;
}

function firstStep(parents, end, startKey) {
  let cur = end;
  for (;;) {
    const parent = parents.get(hexKey(cur));
    if (hexKey(parent) === startKey) return cur;
    cur = parent;
  }
}

function performAttack(ctx, u, target) {
  const a = u.attack;
  const attackId = `a${ctx.nextAttackId++}`;
  const targetHex = pos(target);
  const damage = stat(ctx, u, 'damage');
  u.nextAttackTU = ctx.tu + attackIntervalTU(stat(ctx, u, 'attackSpeed'), ctx.config);
  const source = { unit: u.id, attackId };

  if (a.kind === 'heal') {
    const seq = ctx.emit('attack', { attackId, unit: u.id, target: target.id, kind: a.kind, targetHex, hexes: [targetHex], projectiles: [] });
    ctx.queue.push({ kind: 'heal', targetId: target.id, raw: damage, source });
    fireTriggers(ctx, u, 'attack', seq);
    return;
  }

  if (a.projectiles) {
    const ids = [];
    for (let i = 0; i < a.projectiles; i++) ids.push(`m${ctx.nextProjectileId++}`);
    const seq = ctx.emit('attack', { attackId, unit: u.id, target: target.id, kind: a.kind, targetHex, hexes: [], projectiles: ids });
    ids.forEach((projectileId, index) => {
      const p = {
        id: projectileId,
        attackId,
        sourceId: u.id,
        side: u.side,
        origin: pos(u),
        targetId: target.id,
        targetHex,
        homing: !!a.homing,
        shape: a.shape,
        damage,
        impactTU: ctx.tu + Math.max(1, a.travelTU ?? 1),
      };
      ctx.projectiles.push(p);
      ctx.emit('projectile_launch', {
        projectileId,
        attackId,
        unit: u.id,
        index,
        count: ids.length,
        from: p.origin,
        target: target.id,
        targetHex,
        homing: p.homing,
        impactTU: p.impactTU,
      });
    });
    fireTriggers(ctx, u, 'attack', seq);
    return;
  }

  const hexes = attackHexes(a.shape, u, targetHex).filter((h) => ctx.grid.has(h));
  const seq = ctx.emit('attack', { attackId, unit: u.id, target: target.id, kind: a.kind, targetHex, hexes, projectiles: [] });
  for (const victim of victimsOn(ctx, hexes, u.side)) {
    ctx.queue.push({ kind: 'damage', targetId: victim.id, raw: damage, source });
  }
  fireTriggers(ctx, u, 'attack', seq);
}

function victimsOn(ctx, hexes, attackerSide) {
  const out = [];
  for (const h of hexes) {
    const id = ctx.occupancy.get(hexKey(h));
    if (!id) continue;
    const v = ctx.byId.get(id);
    if (v.alive && (v.side !== attackerSide || ctx.config.aoeFriendlyFire)) out.push(v);
  }
  return out;
}

function resolveImpacts(ctx) {
  const due = ctx.projectiles.filter((p) => p.impactTU === ctx.tu);
  if (!due.length) return;
  ctx.projectiles = ctx.projectiles.filter((p) => p.impactTU !== ctx.tu);
  for (const p of due) {
    const target = ctx.byId.get(p.targetId);
    if (p.homing && target.alive) p.targetHex = pos(target);
    const hexes = attackHexes(p.shape, p.origin, p.targetHex).filter((h) => ctx.grid.has(h));
    ctx.emit('projectile_impact', { projectileId: p.id, attackId: p.attackId, unit: p.sourceId, hex: p.targetHex, hexes });
    for (const victim of victimsOn(ctx, hexes, p.side)) {
      ctx.queue.push({
        kind: 'damage',
        targetId: victim.id,
        raw: p.damage,
        source: { unit: p.sourceId, attackId: p.attackId, projectileId: p.id },
      });
    }
  }
}

// ---- Resolution ----

// Triggers fired while resolving append to the queue; for-of picks them up in the same pass.
function resolveQueue(ctx) {
  const { config, rng } = ctx;
  for (const q of ctx.queue) {
    const t = ctx.byId.get(q.targetId);
    if (!t.alive || t.hp <= 0) continue;
    const hpBefore = t.hp;
    if (q.kind === 'heal') {
      const amount = Math.min(Math.round(q.raw), t.maxHp - t.hp);
      if (amount <= 0) continue;
      t.hp += amount;
      ctx.emit('heal', { unit: t.id, amount, hpBefore, hpAfter: t.hp, source: q.source });
      continue;
    }
    const roll = config.damageVariance ? 1 + config.damageVariance * (2 * rng.next() - 1) : 1;
    const armor = q.ignoreArmor ? 0 : stat(ctx, t, 'armor');
    const amount = Math.max(config.minDamage, Math.round(q.raw * roll - armor));
    t.hp = Math.max(0, t.hp - amount);
    if (q.source.unit) t.lastHitBy = q.source.unit;
    const seq = ctx.emit('damage', { unit: t.id, amount, hpBefore, hpAfter: t.hp, source: q.source });
    if (t.hp > 0) fireTriggers(ctx, t, 'damaged', seq);
  }
  ctx.queue = [];
}

function resolveDeaths(ctx) {
  for (const u of ctx.order) {
    if (!u.alive || u.hp > 0) continue;
    u.alive = false;
    u.moving = null;
    u.buffs = [];
    ctx.occupancy.delete(hexKey(u));
    const seq = ctx.emit('death', { unit: u.id, at: pos(u), killer: u.lastHitBy });
    fireTriggers(ctx, u, 'death', seq);
    const killer = u.lastHitBy ? ctx.byId.get(u.lastHitBy) : null;
    if (killer?.alive && killer.hp > 0) fireTriggers(ctx, killer, 'kill', seq);
  }
}

function checkVictory(ctx) {
  let player = 0;
  let enemy = 0;
  for (const u of ctx.order) {
    if (!u.alive) continue;
    if (u.side === 'player') player++;
    else enemy++;
  }
  let winner = null;
  let reason = 'elimination';
  if (!player && !enemy) winner = 'draw';
  else if (!enemy) winner = 'player';
  else if (!player) winner = 'enemy';
  else if (ctx.tu >= ctx.config.maxTU) {
    winner = 'draw';
    reason = 'max_tu';
  }
  if (winner) {
    ctx.emit('battle_end', { winner, reason });
    ctx.result = { winner, tu: ctx.tu };
  }
}

// ---- Helpers ----

function pos(u) {
  return { q: u.q, r: u.r };
}

function snapshotUnits(ctx) {
  const out = {};
  for (const u of ctx.order) out[u.id] = { q: u.q, r: u.r, hp: u.hp, alive: u.alive, targetId: u.targetId };
  return out;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/sim/simulate.js';
import { DEFAULT_SCENARIO, buildBattleSetup, validateDeployment } from '../src/sim/battle.js';
import { hexDistance, hexKey, offsetToAxial } from '../src/sim/hex.js';
import { eventsOf, makeSetup } from './helpers.js';

const defaultSetup = (seed) =>
  buildBattleSetup({ scenario: DEFAULT_SCENARIO, deployment: DEFAULT_SCENARIO.defaultDeployment, seed });

test('default deployment is valid', () => {
  assert.deepEqual(validateDeployment(DEFAULT_SCENARIO, DEFAULT_SCENARIO.defaultDeployment), []);
});

test('determinism: 100 runs produce identical logs, final states and winners', () => {
  const reference = JSON.stringify(simulate(defaultSetup(481927)));
  for (let i = 0; i < 100; i++) assert.equal(JSON.stringify(simulate(defaultSetup(481927))), reference);
});

test('the seed changes the outcome log', () => {
  const a = JSON.stringify(simulate(defaultSetup(1)).log);
  const b = JSON.stringify(simulate(defaultSetup(2)).log);
  assert.notEqual(a, b);
});

test('the simulator does not mutate its setup', () => {
  const setup = defaultSetup(7);
  const before = JSON.stringify(setup);
  simulate(setup);
  assert.equal(JSON.stringify(setup), before);
});

test('battles end with a result', () => {
  for (let seed = 0; seed < 20; seed++) {
    const r = simulate(defaultSetup(seed));
    assert.ok(['player', 'enemy', 'draw'].includes(r.winner));
    assert.equal(r.log.at(-1).type, 'battle_end');
  }
});

test('occupancy: no two living units ever share a hex', () => {
  for (let seed = 0; seed < 30; seed++) {
    const r = simulate(defaultSetup(seed), { recordSnapshots: true });
    r.snapshots.forEach((snap, tu) => {
      const seen = new Map();
      for (const [id, u] of Object.entries(snap)) {
        if (!u.alive) continue;
        const k = hexKey(u);
        assert.ok(!seen.has(k), `seed ${seed} TU ${tu}: ${id} and ${seen.get(k)} share ${k}`);
        seen.set(k, id);
      }
    });
  }
});

test('occupancy: two units contesting one hex resolve by action order', () => {
  // One-row board: A(0) _ B(2). Both want hex 1 on TU 0; A acts first.
  const setup = makeSetup({
    width: 3,
    height: 1,
    units: [
      ['A', 'brawler', 'player', 0, 0],
      ['B', 'brawler', 'enemy', 2, 0],
    ],
  });
  const { log } = simulate(setup);
  const firstMoves = eventsOf(log, 'move_start', (e) => e.tu === 0);
  assert.equal(firstMoves.length, 1);
  assert.equal(firstMoves[0].unit, 'A');
  assert.equal(hexKey(firstMoves[0].to), '1,0');
});

test('target persistence: a unit keeps its target when another enemy becomes closer', () => {
  const setup = makeSetup({
    units: [
      ['A', 'turret', 'player', 3, 8],
      ['B', 'sturdy', 'enemy', 3, 5],
      ['C', 'runner', 'enemy', 7, 2],
    ],
  });
  const r = simulate(setup, { recordSnapshots: true });
  const deathB = eventsOf(r.log, 'death', (e) => e.unit === 'B')[0];
  assert.ok(deathB, 'B should die');

  const closerTU = r.snapshots.findIndex((s) => hexDistance(s.A, s.C) < hexDistance(s.A, s.B));
  assert.ok(closerTU >= 0 && closerTU < deathB.tu, 'C must become closer than B before B dies');

  const before = eventsOf(r.log, 'target', (e) => e.unit === 'A' && e.tu <= deathB.tu);
  assert.deepEqual(before.map((e) => e.target), ['B']);
});

test('target re-selection: a new target is chosen deterministically when the old one dies', () => {
  const setup = makeSetup({
    units: [
      ['A', 'turret', 'player', 3, 8],
      ['B', 'sturdy', 'enemy', 3, 5],
      ['C', 'runner', 'enemy', 7, 2],
      ['D', 'inert', 'enemy', 0, 0],
    ],
  });
  const runs = [simulate(setup), simulate(setup)];
  for (const { log } of runs) {
    const deathB = eventsOf(log, 'death', (e) => e.unit === 'B')[0];
    const next = eventsOf(log, 'target', (e) => e.unit === 'A' && e.tu > deathB.tu && e.target)[0];
    // C has run up next to A, so it is the closest remaining enemy.
    assert.equal(next.target, 'C');
  }
  assert.equal(JSON.stringify(runs[0].log), JSON.stringify(runs[1].log));
});

test('movement: units route around blockers', () => {
  // Wall of immobile allies across row 3 with gaps at cols 0 and 6.
  const wall = [1, 2, 3, 4, 5].map((c) => [`W${c}`, 'inert', 'player', c, 3]);
  const setup = makeSetup({
    width: 7,
    height: 7,
    units: [['A', 'brawler', 'player', 3, 6], ...wall, ['T', 'inert', 'enemy', 3, 0]],
  });
  const r = simulate(setup);
  assert.equal(r.winner, 'player');
  const moves = eventsOf(r.log, 'move_start', (e) => e.unit === 'A');
  const wallKeys = new Set(wall.map(([, , , c, row]) => hexKey(offsetToAxial(c, row))));
  for (const m of moves) assert.ok(!wallKeys.has(hexKey(m.to)), `A stepped into wall at ${hexKey(m.to)}`);
  // The unobstructed route needs 5 steps; going around takes more.
  assert.ok(moves.length > 5, `expected a detour, got ${moves.length} steps`);
  assert.equal(JSON.stringify(simulate(setup).log), JSON.stringify(r.log));
});

test('range: a unit approaches until in range, then stops and attacks', () => {
  const setup = makeSetup({
    units: [
      ['A', 'ranger', 'player', 3, 9],
      ['T', 'sturdy', 'enemy', 3, 0],
    ],
  });
  const r = simulate(setup, { recordSnapshots: true });
  const moves = eventsOf(r.log, 'move_start', (e) => e.unit === 'A');
  const attacks = eventsOf(r.log, 'attack', (e) => e.unit === 'A');
  assert.ok(moves.length > 0 && attacks.length > 0);
  const target = offsetToAxial(3, 0);
  assert.equal(hexDistance(moves.at(-1).to, target), 3, 'stops at exactly max range');
  assert.ok(moves.every((m) => m.tu < attacks[0].tu), 'no movement after attacking begins');
  for (const m of moves.slice(0, -1)) assert.ok(hexDistance(m.to, target) > 3);
});

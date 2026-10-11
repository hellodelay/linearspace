import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equippedStats, simulate } from '../src/sim/simulate.js';
import { EQUIPMENT_DEFS } from '../src/sim/equipment.js';
import { DEFAULT_SCENARIO, buildBattleSetup, validateDeployment } from '../src/sim/battle.js';
import { buildTimeline, validateTimeline } from '../src/present/timeline.js';
import { Playback } from '../src/present/playback.js';
import { applyCue, createBoardState } from '../src/present/boardState.js';
import { TEST_DEFS, eventsOf, makeSetup } from './helpers.js';

const NO_VARIANCE = { damageVariance: 0, maxTU: 40 };
const damageTo = (log, unit) => eventsOf(log, 'damage', (e) => e.unit === unit).map((e) => e.amount);

const LOADOUT = {
  bulwark: ['reactive', 'plating', 'hull'],
  lancer: ['stim', 'salvage', 'servos'],
  arc: ['capacitor', 'loader', 'scuttle'],
  salvo: ['siphon', 'capacitor'],
  mender: ['hull', 'scuttle'],
};
const equippedBattle = (seed) =>
  buildBattleSetup({ scenario: DEFAULT_SCENARIO, deployment: DEFAULT_SCENARIO.defaultDeployment, seed, loadout: LOADOUT });

test('static mods: flat adds first, then percents that add together', () => {
  const { stats } = equippedStats(TEST_DEFS.brawler, ['hull', 'capacitor', 'plating'], EQUIPMENT_DEFS);
  assert.equal(stats.hp, 260);
  assert.equal(stats.damage, 11.5);
  assert.equal(stats.armor, 4);
  assert.throws(() => equippedStats(TEST_DEFS.brawler, ['nope'], EQUIPMENT_DEFS));
});

test('armor from equipment reduces incoming damage', () => {
  const run = (equipment) =>
    simulate(makeSetup({ config: NO_VARIANCE, units: [['A', 'turret', 'player', 3, 8], ['B', 'wall', 'enemy', 3, 4, equipment]] })).log;
  assert.ok(damageTo(run([]), 'B').every((d) => d === 6));
  assert.ok(damageTo(run(['plating']), 'B').every((d) => d === 2));
});

test('attack speed from equipment shortens the attack interval', () => {
  const attacks = (equipment) =>
    eventsOf(
      simulate(makeSetup({ config: NO_VARIANCE, units: [['A', 'slowgun', 'player', 3, 8, equipment], ['B', 'wall', 'enemy', 3, 4]] })).log,
      'attack',
      (e) => e.unit === 'A' && e.tu < 30,
    ).map((e) => e.tu);
  assert.deepEqual(attacks([]), [0, 6, 12, 18, 24]);
  assert.deepEqual(attacks(['loader']), [0, 5, 10, 15, 20, 25]);
});

test('OnDamage buff applies to later hits and is refreshed, not stacked', () => {
  const { log } = simulate(makeSetup({ config: NO_VARIANCE, units: [['A', 'turret', 'player', 3, 8], ['B', 'wall', 'enemy', 3, 4, ['reactive']]] }));
  const hits = damageTo(log, 'B');
  assert.equal(hits[0], 6);
  assert.ok(hits.slice(1).every((d) => d === 2), `armor buff should hold: ${hits.slice(0, 6)}`);
  const triggers = eventsOf(log, 'equip_trigger', (e) => e.unit === 'B');
  assert.ok(triggers.every((e) => e.item === 'reactive' && e.expiresTU === e.tu + 4));
  assert.equal(eventsOf(log, 'buff_end').length, 0, 'continuous hits keep refreshing the buff');
});

test('OnDamage buffs expire on the TU clock', () => {
  const { log } = simulate(makeSetup({ config: NO_VARIANCE, units: [['A', 'slowgun', 'player', 3, 8], ['B', 'wall', 'enemy', 3, 4, ['reactive']]] }));
  assert.ok(damageTo(log, 'B').every((d) => d === 6), 'buff wears off before each 6 TU hit');
  assert.deepEqual(eventsOf(log, 'buff_end', (e) => e.tu < 20).map((e) => e.tu), [4, 10, 16]);
});

test('OnAttack repair heals the attacker', () => {
  const { log } = simulate(
    makeSetup({ config: NO_VARIANCE, units: [['A', 'turret', 'player', 3, 8, ['siphon']], ['B', 'turret', 'enemy', 3, 4]] }),
  );
  const heals = eventsOf(log, 'heal', (e) => e.unit === 'A' && e.source.triggerId);
  assert.ok(heals.length > 0);
  assert.ok(heals.every((e) => e.amount <= 4));
});

test('OnDeath blast damages nearby enemies only; OnKill fires for the killer', () => {
  const { log } = simulate(
    makeSetup({
      config: NO_VARIANCE,
      units: [
        ['A', 'turret', 'player', 3, 6, ['salvage']],
        ['P', 'wall', 'player', 4, 3],
        ['X', 'inert', 'enemy', 3, 3, ['scuttle']],
        ['E', 'wall', 'enemy', 2, 3],
      ],
    }),
  );
  const death = eventsOf(log, 'death', (e) => e.unit === 'X')[0];
  assert.ok(death, 'X should die');
  const blast = eventsOf(log, 'equip_trigger', (e) => e.unit === 'X' && e.on === 'death')[0];
  assert.ok(blast && blast.causeSeq === death.seq);
  const blastHits = eventsOf(log, 'damage', (e) => e.source.triggerId === blast.triggerId);
  assert.deepEqual(blastHits.map((e) => [e.unit, e.amount]), [['P', 30]]);
  assert.ok(eventsOf(log, 'equip_trigger', (e) => e.unit === 'A' && e.on === 'kill' && e.causeSeq === death.seq).length === 1);
});

test('deployment validation checks slots, duplicates and unknown items', () => {
  const dep = DEFAULT_SCENARIO.defaultDeployment;
  assert.deepEqual(validateDeployment(DEFAULT_SCENARIO, dep, LOADOUT), []);
  assert.ok(validateDeployment(DEFAULT_SCENARIO, dep, { bulwark: ['plating', 'hull', 'loader', 'servos'] }).length);
  assert.ok(validateDeployment(DEFAULT_SCENARIO, dep, { bulwark: ['plating', 'plating'] }).length);
  assert.ok(validateDeployment(DEFAULT_SCENARIO, dep, { bulwark: ['nope'] }).length);
});

test('equipped battles are deterministic and keep the presentation timing contract', () => {
  for (let seed = 0; seed < 12; seed++) {
    const r = simulate(equippedBattle(seed), { recordSnapshots: true });
    assert.equal(JSON.stringify(simulate(equippedBattle(seed)).log), JSON.stringify(r.log));
    const timeline = buildTimeline(r.log);
    assert.deepEqual(validateTimeline(timeline), [], `seed ${seed}`);

    // Trigger cues play after the cue that caused them.
    const cueTime = new Map(timeline.cues.map((c) => [c.ev.seq, c.t]));
    for (const c of timeline.cues.filter((x) => x.ev.type === 'equip_trigger')) {
      assert.ok(c.t >= cueTime.get(c.ev.causeSeq), `trigger ${c.ev.triggerId} before its cause`);
    }

    // Board at every TU boundary still matches the sim.
    const sink = { board: null, reset: (tl) => (sink.board = createBoardState(tl.setup)), onCue: (cue) => applyCue(sink.board, cue) };
    const playback = new Playback(timeline, sink);
    r.snapshots.forEach((snap, tu) => {
      playback.advanceTo(tu + 1 - 1e-6, true);
      for (const [id, s] of Object.entries(snap)) {
        const u = sink.board.units.get(id);
        assert.equal(u.hp, s.hp, `seed ${seed} TU ${tu} ${id} hp`);
        assert.equal(u.alive, s.alive, `seed ${seed} TU ${tu} ${id} alive`);
      }
    });
  }
  const triggered = new Set(simulate(equippedBattle(1)).log.filter((e) => e.type === 'equip_trigger').map((e) => e.on));
  assert.ok(triggered.size >= 3, `expected several trigger kinds, got ${[...triggered]}`);
});

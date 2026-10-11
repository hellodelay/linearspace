import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSILE_TIMING, missileProgress, moveProgress } from '../src/present/motion.js';
import { simulate } from '../src/sim/simulate.js';
import { DEFAULT_SCENARIO, buildBattleSetup } from '../src/sim/battle.js';
import { buildTimeline } from '../src/present/timeline.js';

const speed = (u, a, b) => (moveProgress(u + 1e-5, a, b) - moveProgress(u - 1e-5, a, b)) / 2e-5;
const FLAGS = [
  [false, false],
  [false, true],
  [true, true],
  [true, false],
];

test('every step curve runs 0 -> 1 without moving backwards', () => {
  for (const [a, b] of FLAGS) {
    assert.equal(moveProgress(0, a, b), 0);
    assert.equal(moveProgress(1, a, b), 1);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const p = moveProgress(i / 100, a, b);
      assert.ok(p >= prev - 1e-12, `flags ${a},${b} reverse at ${i / 100}`);
      prev = p;
    }
  }
});

test('chained steps join at constant speed; run ends start and stop at rest', () => {
  // Speed at a join must equal the constant mid-run speed of 1 hex per step.
  assert.ok(Math.abs(speed(1 - 1e-4, false, true) - 1) < 1e-3, 'ease-in step leaves at run speed');
  assert.ok(Math.abs(speed(1e-4, true, false) - 1) < 1e-3, 'ease-out step enters at run speed');
  assert.ok(Math.abs(speed(0.5, true, true) - 1) < 1e-9, 'mid-run steps are linear');
  assert.ok(speed(1e-4, false, true) < 1e-3, 'run starts from rest');
  assert.ok(speed(1 - 1e-4, true, false) < 1e-3, 'run ends at rest');
});

test('timeline marks back-to-back steps as chained', () => {
  const r = simulate(buildBattleSetup({ scenario: DEFAULT_SCENARIO, deployment: DEFAULT_SCENARIO.defaultDeployment, seed: 1 }));
  const moves = buildTimeline(r.log).cues.filter((c) => c.ev.type === 'move_start');
  const byUnit = new Map();
  for (const c of moves) byUnit.set(c.ev.unit, [...(byUnit.get(c.ev.unit) ?? []), c]);
  let chained = 0;
  for (const list of byUnit.values()) {
    for (let i = 0; i < list.length; i++) {
      const next = list[i + 1];
      const contiguous = !!next && next.ev.tu === list[i].ev.arriveTU;
      assert.equal(list[i].chainOut, contiguous);
      if (next) assert.equal(next.chainIn, contiguous);
      if (contiguous) chained++;
    }
    assert.equal(list[0].chainIn, false);
  }
  assert.ok(chained > 0, 'expected at least one multi-hex run');
});

test('missiles climb at medium speed, hang at the apex, then dive much faster', () => {
  const rate = (t) => (missileProgress(t + 1e-5) - missileProgress(t - 1e-5)) / 2e-5;
  const { climbTime, apexProgress } = MISSILE_TIMING;
  assert.equal(missileProgress(0), 0);
  assert.equal(missileProgress(1), 1);
  assert.ok(Math.abs(missileProgress(climbTime) - apexProgress) < 1e-12);
  let prev = 0;
  for (let i = 1; i <= 200; i++) {
    const p = missileProgress(i / 200);
    assert.ok(p >= prev, `progress reverses at ${i / 200}`);
    prev = p;
  }
  const climbAvg = apexProgress / climbTime;
  const diveAvg = (1 - apexProgress) / (1 - climbTime);
  assert.ok(diveAvg > climbAvg * 1.4, 'dive is faster on average');
  assert.ok(rate(1 - 1e-4) > climbAvg * 2.5, 'impact is much faster than the climb');
  assert.ok(rate(climbTime) < 0.05, 'brief hang at the apex');
});

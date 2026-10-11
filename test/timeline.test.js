import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/sim/simulate.js';
import { DEFAULT_SCENARIO, buildBattleSetup } from '../src/sim/battle.js';
import { buildTimeline, validateTimeline } from '../src/present/timeline.js';
import { Playback } from '../src/present/playback.js';
import { applyCue, createBoardState } from '../src/present/boardState.js';

const run = (seed) =>
  simulate(buildBattleSetup({ scenario: DEFAULT_SCENARIO, deployment: DEFAULT_SCENARIO.defaultDeployment, seed }), {
    recordSnapshots: true,
  });

function boardPlayer(timeline) {
  const sink = {
    board: null,
    reset(tl) {
      sink.board = createBoardState(tl.setup);
    },
    onCue(cue) {
      applyCue(sink.board, cue);
    },
  };
  return { sink, playback: new Playback(timeline, sink) };
}

const boardKey = (board) =>
  JSON.stringify([...board.units.values()].map((u) => [u.id, u.q, u.r, u.hp, u.alive, u.alive ? u.targetId : null]));

test('critical cues stay inside their TU window and deaths follow their hits', () => {
  for (let seed = 0; seed < 25; seed++) {
    assert.deepEqual(validateTimeline(buildTimeline(run(seed).log)), [], `seed ${seed}`);
  }
});

test('presentation board at each TU boundary matches the simulation snapshot', () => {
  for (let seed = 0; seed < 10; seed++) {
    const r = run(seed);
    const timeline = buildTimeline(r.log);
    const { sink, playback } = boardPlayer(timeline);
    r.snapshots.forEach((snap, tu) => {
      playback.advanceTo(tu + 1 - 1e-6, true);
      for (const [id, s] of Object.entries(snap)) {
        const u = sink.board.units.get(id);
        const ctx = `seed ${seed} TU ${tu} unit ${id}`;
        assert.equal(u.alive, s.alive, ctx);
        assert.equal(u.hp, s.hp, ctx);
        assert.deepEqual([u.q, u.r], [s.q, s.r], ctx);
        if (s.alive) assert.equal(u.targetId, s.targetId, ctx);
      }
    });
  }
});

test('seeking backwards and forwards yields the same board as linear playback', () => {
  const timeline = buildTimeline(run(3).log);
  const linear = boardPlayer(timeline);
  const seeker = boardPlayer(timeline);
  for (const t of [40.5, 12.25, 30, 2, 55.75, 0, timeline.duration]) {
    seeker.playback.seek(t);
    const fresh = boardPlayer(timeline);
    fresh.playback.advanceTo(t, true);
    assert.equal(boardKey(seeker.sink.board), boardKey(fresh.sink.board), `t=${t}`);
  }
  linear.playback.advanceTo(timeline.duration, true);
  assert.equal(boardKey(seeker.sink.board), boardKey(linear.sink.board));
});

test('salvo launches spread across the TU window and keep their flight time', () => {
  const r = run(481927);
  const timeline = buildTimeline(r.log);
  const salvo = r.log.find((e) => e.type === 'attack' && e.projectiles.length === 3);
  assert.ok(salvo, 'expected a 3-missile salvo');
  const launches = timeline.cues.filter((c) => c.ev.type === 'projectile_launch' && c.ev.attackId === salvo.attackId);
  assert.equal(launches.length, 3);
  const times = launches.map((c) => c.t);
  for (const t of times) assert.ok(t >= salvo.tu && t < salvo.tu + 1);
  assert.ok(Math.max(...times) - Math.min(...times) >= 0.5, `launches bunched: ${times}`);
  assert.equal(new Set(times).size, 3);
  for (const c of launches) {
    if (!c.impact) continue;
    assert.ok(c.t1 >= c.impact.tu && c.t1 < c.impact.tu + 1, 'impact lands in its sim TU');
    assert.ok(Math.abs(c.t1 - c.t - (c.impact.tu - c.ev.tu)) < 1e-9, 'flight time equals sim travel time');
  }
});

test('playback speed scales clock advance only', () => {
  const timeline = buildTimeline(run(1).log);
  const a = boardPlayer(timeline);
  const b = boardPlayer(timeline);
  b.playback.speed = 4;
  a.playback.update(2.0);
  b.playback.update(0.5);
  assert.ok(Math.abs(a.playback.pt - b.playback.pt) < 1e-9);
  assert.equal(boardKey(a.sink.board), boardKey(b.sink.board));
});

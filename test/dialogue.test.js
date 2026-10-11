import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/sim/simulate.js';
import { DEFAULT_SCENARIO, buildBattleSetup } from '../src/sim/battle.js';
import { UNIT_DEFS } from '../src/sim/data.js';
import { buildTimeline } from '../src/present/timeline.js';
import { activeLine, buildDialogue } from '../src/present/dialogue.js';
import { CAST } from '../src/present/cast.js';

const battle = (seed, deployment = DEFAULT_SCENARIO.defaultDeployment) => {
  const result = simulate(buildBattleSetup({ scenario: DEFAULT_SCENARIO, deployment, seed }));
  const timeline = buildTimeline(result.log);
  return { result, timeline, lines: buildDialogue(timeline, CAST) };
};

test('every unit def has a cast entry with a portrait', () => {
  for (const id of Object.keys(UNIT_DEFS)) {
    assert.ok(CAST[id]?.portrait?.id, `missing cast for ${id}`);
    for (const [trigger, options] of Object.entries(CAST[id].lines)) {
      for (const text of options) assert.match(text, /^[\x20-\x7e]+$/, `${id}.${trigger} must be plain ASCII`);
    }
  }
});

test('dialogue is deterministic for the same log', () => {
  const a = battle(481927);
  const b = battle(481927);
  assert.equal(JSON.stringify(a.lines), JSON.stringify(b.lines));
});

test('lines never overlap and speakers are alive when they speak', () => {
  for (let seed = 0; seed < 25; seed++) {
    const { result, lines } = battle(seed);
    const deathTU = new Map(result.log.filter((e) => e.type === 'death').map((e) => [e.unit, e.tu]));
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      assert.ok(l.t1 > l.t, `seed ${seed}: empty line`);
      if (i > 0) assert.ok(lines[i - 1].t1 <= l.t + 1e-9, `seed ${seed}: line ${i} overlaps the previous one`);
      const died = deathTU.get(l.unitId);
      if (l.trigger !== 'death' && died != null) assert.ok(l.t < died + 1, `seed ${seed}: ${l.unitId} speaks after dying`);
    }
  }
});

test('battles open with a player line and close with the winner speaking', () => {
  for (let seed = 0; seed < 10; seed++) {
    const { result, lines } = battle(seed);
    assert.equal(lines[0].side, 'player');
    assert.equal(lines[0].trigger, 'start');
    if (result.winner !== 'draw') {
      const last = lines.at(-1);
      assert.equal(last.trigger, 'victory');
      assert.equal(last.side, result.winner);
    }
  }
});

test('player deaths get last words', () => {
  let deaths = 0;
  for (let seed = 0; seed < 10; seed++) {
    deaths += battle(seed).lines.filter((l) => l.trigger === 'death' && l.side === 'player').length;
  }
  assert.ok(deaths > 0);
});

test('activeLine returns the line covering pt', () => {
  const { lines } = battle(1);
  const l = lines[1];
  assert.equal(activeLine(lines, l.t), l);
  assert.equal(activeLine(lines, (l.t + l.t1) / 2), l);
  assert.equal(activeLine(lines, -1), null);
});

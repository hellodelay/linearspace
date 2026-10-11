import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackHexes } from '../src/sim/geometry.js';
import { hexDistance, hexKey } from '../src/sim/hex.js';

const keys = (hexes) => hexes.map(hexKey);

test('single-hex attack affects only the target hex', () => {
  assert.deepEqual(keys(attackHexes({ type: 'single' }, { q: 0, r: 0 }, { q: 2, r: 1 })), ['2,1']);
});

test('circle radius 1 affects the target and its 6 neighbors', () => {
  const hexes = attackHexes({ type: 'circle', radius: 1 }, { q: 0, r: 0 }, { q: 3, r: 3 });
  assert.equal(hexes.length, 7);
  assert.equal(new Set(keys(hexes)).size, 7);
  for (const h of hexes) assert.ok(hexDistance(h, { q: 3, r: 3 }) <= 1);
});

test('circle radius 2 affects exactly 19 hexes', () => {
  assert.equal(attackHexes({ type: 'circle', radius: 2 }, { q: 0, r: 0 }, { q: 0, r: 0 }).length, 19);
});

test('line along an axis covers exactly the expected hexes', () => {
  const hexes = attackHexes({ type: 'line', length: 4 }, { q: 0, r: 0 }, { q: 2, r: 0 });
  assert.deepEqual(keys(hexes), ['1,0', '2,0', '3,0', '4,0']);
});

test('off-axis line is contiguous, has the requested length and passes through the target', () => {
  const origin = { q: 0, r: 0 };
  for (const target of [{ q: 2, r: 1 }, { q: -1, r: 3 }, { q: 1, r: -3 }, { q: 3, r: -1 }]) {
    const hexes = attackHexes({ type: 'line', length: 5 }, origin, target);
    assert.equal(hexes.length, 5);
    assert.ok(keys(hexes).includes(hexKey(target)), `line misses target ${hexKey(target)}`);
    let prev = origin;
    for (const h of hexes) {
      assert.equal(hexDistance(prev, h), 1);
      prev = h;
    }
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawPortrait } from '../src/present/portraits.js';
import { CAST } from '../src/present/cast.js';

// 2D context stub: every method is a no-op, gradients accept color stops, and any color
// assigned to a style property must be a real string.
function stubContext() {
  const gradient = { addColorStop: (_, c) => assert.equal(typeof c, 'string') };
  const target = {};
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return () => {};
    },
    set(t, key, value) {
      if (/Style$|Color$/.test(key)) assert.ok(typeof value === 'string' || value === gradient, `${String(key)} = ${value}`);
      t[key] = value;
      return true;
    },
  });
}

test('every cast portrait draws in every mood', () => {
  for (const [id, cast] of Object.entries(CAST)) {
    for (const mood of ['neutral', 'happy', 'angry', 'hurt', 'shout']) {
      assert.doesNotThrow(() => drawPortrait(stubContext(), cast.portrait, mood), `${id} / ${mood}`);
    }
  }
});

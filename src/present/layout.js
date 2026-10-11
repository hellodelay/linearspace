import { cubeRound } from '../sim/hex.js';

// World layout for pointy-top hexes of circumradius 1. Row 0 is at the top of the screen.
const SQRT3 = Math.sqrt(3);

export function hexToWorld(h) {
  return { x: SQRT3 * (h.q + h.r / 2), y: -1.5 * h.r };
}

export function worldToHex(x, y) {
  const r = -y / 1.5;
  const q = x / SQRT3 - r / 2;
  return cubeRound(q, r);
}

export function hexCorners(cx, cy, radius = 1) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    out.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return out;
}

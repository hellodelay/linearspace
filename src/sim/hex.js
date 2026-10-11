// Axial hex coordinates, pointy-top. Offset (col,row) layout is "odd-r": odd rows shift right half a hex.

// Fixed neighbor order; pathfinding and tie-breaks depend on it.
export const DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

export const hexKey = (h) => `${h.q},${h.r}`;
export const hexEquals = (a, b) => a.q === b.q && a.r === b.r;

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function offsetToAxial(col, row) {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(h) {
  return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
}

export function cubeRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  // Normalize -0 so keys and equality stay stable.
  return { q: q + 0, r: r + 0 };
}

// Hexes on the straight line from a to b inclusive. The epsilon nudge breaks edge ties consistently.
export function hexLine(a, b) {
  const n = hexDistance(a, b);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    out.push(cubeRound(a.q + 1e-6 + (b.q - a.q) * t, a.r + 2e-6 + (b.r - a.r) * t));
  }
  return out;
}

// All hexes within radius of center, in a fixed order.
export function hexDisk(center, radius) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) out.push({ q: center.q + dq, r: center.r + dr });
  }
  return out;
}

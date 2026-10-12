import { DIRECTIONS, axialToOffset, offsetToAxial } from './hex.js';

// Rectangular odd-r board of width x height cells. Options:
//   removed:     [col, row] cells to leave out
//   trimCorners: also leave out the sharp corners, i.e. cells with 2 or fewer neighbors on the full board
export function createGrid(width, height, { removed = [], trimCorners = false } = {}) {
  const inRect = (h) => {
    if (h.r < 0 || h.r >= height) return false;
    const { col } = axialToOffset(h);
    return col >= 0 && col < width;
  };
  const holes = new Set(removed.map(([col, row]) => `${col},${row}`));
  if (trimCorners) {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const h = offsetToAxial(col, row);
        const neighbors = DIRECTIONS.filter((d) => inRect({ q: h.q + d.q, r: h.r + d.r })).length;
        if (neighbors <= 2) holes.add(`${col},${row}`);
      }
    }
  }
  const cells = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) if (!holes.has(`${col},${row}`)) cells.push(offsetToAxial(col, row));
  }
  return {
    width,
    height,
    cells,
    has(h) {
      if (!inRect(h)) return false;
      const { col, row } = axialToOffset(h);
      return !holes.has(`${col},${row}`);
    },
  };
}

// Grid described by a scenario or battle setup's `grid` field.
export const gridFromSpec = (spec) => createGrid(spec.width, spec.height, spec);

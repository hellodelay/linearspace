import { axialToOffset, offsetToAxial } from './hex.js';

// Rectangular odd-r board of width x height cells.
export function createGrid(width, height) {
  const cells = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) cells.push(offsetToAxial(col, row));
  }
  return {
    width,
    height,
    cells,
    has(h) {
      if (h.r < 0 || h.r >= height) return false;
      const { col } = axialToOffset(h);
      return col >= 0 && col < width;
    },
  };
}

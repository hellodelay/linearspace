import { hexDisk, hexDistance, hexLine } from './hex.js';

// Hexes affected by an attack shape fired from origin at target. Not clipped to the board.
export function attackHexes(shape, origin, target) {
  const type = shape?.type ?? 'single';
  switch (type) {
    case 'single':
      return [{ q: target.q, r: target.r }];
    case 'circle':
      return hexDisk(target, shape.radius);
    case 'line':
      return rayHexes(origin, target, shape.length);
    default:
      throw new Error(`Unknown attack shape: ${type}`);
  }
}

// `length` hexes starting next to origin, passing through target and continuing past it.
export function rayHexes(origin, target, length) {
  const d = hexDistance(origin, target);
  if (d === 0) return [{ q: target.q, r: target.r }];
  // Extending by an integer multiple keeps the far point on an exact hex, so the line hits target.
  const m = Math.ceil(length / d);
  const far = { q: origin.q + (target.q - origin.q) * m, r: origin.r + (target.r - origin.r) * m };
  return hexLine(origin, far).slice(1, 1 + length);
}

// Progress along one hex step, 0..1. Steps chained into a multi-hex run keep constant speed;
// a run eases in on its first step and out on its last, with matching speed at the joins.
export function moveProgress(u, chainIn, chainOut) {
  if (chainIn && chainOut) return u;
  if (chainOut) return u * u * (2 - u);
  if (chainIn) {
    const v = 1 - u;
    return 1 - v * v * (2 - v);
  }
  return u * u * (3 - 2 * u);
}

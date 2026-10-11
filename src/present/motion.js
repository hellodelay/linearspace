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

// Missile flight timing: maps flight time 0..1 to path progress 0..1. The climb covers the first
// half of the path, launching fast and slowing to a brief hang at the apex; the dive covers the
// rest in less time, accelerating into impact.
// apexProgress matches where the view's missile path peaks, so the hang happens at the top.
export const MISSILE_TIMING = Object.freeze({ climbTime: 0.6, apexProgress: 0.4 });

export function missileProgress(t, cfg = MISSILE_TIMING) {
  const { climbTime, apexProgress } = cfg;
  if (t <= climbTime) {
    const x = t / climbTime;
    return apexProgress * x * (2 - x);
  }
  const s = (t - climbTime) / (1 - climbTime);
  return apexProgress + (1 - apexProgress) * s * s;
}

// Simulation tunables. Every rule the GDD leaves TBD is isolated here and tagged ASSUMPTION
// with the GDD section it stands in for. Change values here, not in simulate.js.

export const SIM_CONFIG = Object.freeze({
  // ASSUMPTION (GDD 9, TBD): TU to cross one hex = ceil(moveTUConstant / moveSpeed). moveSpeed <= 0 is immobile.
  moveTUConstant: 12,
  // ASSUMPTION (GDD 12, TBD): TU between attacks = ceil(attackTUConstant / attackSpeed).
  attackTUConstant: 12,
  // ASSUMPTION (GDD 12, TBD): damage = max(minDamage, round(raw * variance) - armor).
  minDamage: 1,
  // ASSUMPTION: seeded +/- damage roll, the only RNG consumer so far. 0 disables it.
  damageVariance: 0.1,
  // ASSUMPTION (GDD 8.1, TBD): from timeoutTU every unit takes base + growth * (tu - timeoutTU) per TU, ignoring armor.
  timeoutTU: 120,
  timeoutDamageBase: 3,
  timeoutDamageGrowth: 1,
  // Hard stop; a battle still running here is a draw.
  maxTU: 400,
  // ASSUMPTION (GDD 13, TBD): area attacks only hit enemies.
  aoeFriendlyFire: false,
  // ASSUMPTION (GDD 15, TBD): a unit cannot start an attack while crossing a hex.
  canAttackWhileMoving: false,
  // ASSUMPTION (GDD 17.4): supports with nobody to heal stay within this many hexes of the closest ally.
  supportFollowRange: 2,
});

export function moveTUPerHex(moveSpeed, config = SIM_CONFIG) {
  return moveSpeed > 0 ? Math.max(1, Math.ceil(config.moveTUConstant / moveSpeed)) : Infinity;
}

export function attackIntervalTU(attackSpeed, config = SIM_CONFIG) {
  return Math.max(1, Math.ceil(config.attackTUConstant / attackSpeed));
}

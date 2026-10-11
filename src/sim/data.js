// Placeholder unit roster (GDD 45: "Unit roster and exact stats" is TBD). Values are for feel-testing only.
//
// attack.kind:   melee | beam | missile | shell | heal
// attack.shape:  { type: 'single' } | { type: 'line', length } | { type: 'circle', radius }
// attack.projectiles / travelTU: projectile weapons spawn N projectiles that land travelTU later.
// attack.homing: projectile follows its target unit; otherwise it lands on the hex aimed at launch.
// targeting.mode: closest | weakest (lowest HP within range, else closest) | ally_lowest_hp (heal)
// visual: read only by the presentation layer.

export const UNIT_DEFS = Object.freeze({
  // ---- Player ----
  bulwark: {
    name: 'Bulwark',
    role: 'vanguard',
    stats: { hp: 320, damage: 16, armor: 6, moveSpeed: 4, attackSpeed: 3, range: 1 },
    attack: { kind: 'melee', shape: { type: 'single' } },
    targeting: { mode: 'closest' },
    tech: ['armor', 'propulsion'],
    visual: { shape: 'hexagon', color: 0x3cf0ff, size: 0.72 },
  },
  lancer: {
    name: 'Lancer',
    role: 'duelist',
    stats: { hp: 130, damage: 15, armor: 2, moveSpeed: 12, attackSpeed: 6, range: 1 },
    attack: { kind: 'melee', shape: { type: 'single' } },
    targeting: { mode: 'weakest', range: 5 },
    tech: ['propulsion', 'targeting'],
    visual: { shape: 'triangle', color: 0xfff04a, size: 0.62 },
  },
  arc: {
    name: 'Arc Caster',
    role: 'mage',
    stats: { hp: 110, damage: 22, armor: 1, moveSpeed: 4, attackSpeed: 2, range: 3 },
    attack: { kind: 'beam', shape: { type: 'line', length: 4 } },
    targeting: { mode: 'closest' },
    tech: ['beam', 'reactor'],
    visual: { shape: 'diamond', color: 0xb46bff, size: 0.66 },
  },
  salvo: {
    name: 'Salvo',
    role: 'mage',
    stats: { hp: 120, damage: 9, armor: 2, moveSpeed: 4, attackSpeed: 2, range: 4 },
    attack: { kind: 'missile', shape: { type: 'single' }, projectiles: 3, travelTU: 2, homing: true },
    targeting: { mode: 'closest' },
    tech: ['missile', 'targeting'],
    visual: { shape: 'square', color: 0x52ff8a, size: 0.6 },
  },
  mender: {
    name: 'Mender',
    role: 'support',
    stats: { hp: 140, damage: 18, armor: 2, moveSpeed: 6, attackSpeed: 2, range: 3 },
    attack: { kind: 'heal', shape: { type: 'single' } },
    targeting: { mode: 'ally_lowest_hp' },
    tech: ['reactor', 'armor'],
    visual: { shape: 'circle', color: 0x7dffd8, size: 0.56 },
  },

  // ---- Enemy faction (placeholder) ----
  drone: {
    name: 'Drone',
    role: 'duelist',
    stats: { hp: 90, damage: 12, armor: 0, moveSpeed: 12, attackSpeed: 6, range: 1 },
    attack: { kind: 'melee', shape: { type: 'single' } },
    targeting: { mode: 'closest' },
    visual: { shape: 'triangle', color: 0xff4fa3, size: 0.5 },
  },
  brute: {
    name: 'Brute',
    role: 'vanguard',
    stats: { hp: 340, damage: 24, armor: 5, moveSpeed: 3, attackSpeed: 2, range: 1 },
    attack: { kind: 'melee', shape: { type: 'single' } },
    targeting: { mode: 'closest' },
    visual: { shape: 'square', color: 0xff5a3c, size: 0.74 },
  },
  gunship: {
    name: 'Gunship',
    role: 'duelist',
    stats: { hp: 130, damage: 16, armor: 1, moveSpeed: 6, attackSpeed: 3, range: 3 },
    attack: { kind: 'beam', shape: { type: 'single' } },
    targeting: { mode: 'closest' },
    visual: { shape: 'pentagon', color: 0xff8a2a, size: 0.6 },
  },
  bomber: {
    name: 'Bomber',
    role: 'mage',
    stats: { hp: 100, damage: 20, armor: 1, moveSpeed: 4, attackSpeed: 2, range: 4 },
    attack: { kind: 'shell', shape: { type: 'circle', radius: 1 }, projectiles: 1, travelTU: 3, homing: false },
    targeting: { mode: 'closest' },
    visual: { shape: 'star', color: 0xff3b5c, size: 0.64 },
  },
});

export const ROLE_LABELS = Object.freeze({
  vanguard: 'Vanguard & Tank',
  duelist: 'Duelist & Assassin',
  mage: 'Mage & Mystic',
  support: 'Support',
});

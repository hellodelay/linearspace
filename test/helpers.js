import { offsetToAxial } from '../src/sim/hex.js';

export const TEST_DEFS = {
  inert: {
    name: 'Inert',
    role: 'vanguard',
    stats: { hp: 30, damage: 0, armor: 0, moveSpeed: 0, attackSpeed: 1, range: 1 },
    attack: null,
    targeting: { mode: 'closest' },
  },
  sturdy: {
    name: 'Sturdy',
    role: 'vanguard',
    stats: { hp: 90, damage: 0, armor: 0, moveSpeed: 0, attackSpeed: 1, range: 1 },
    attack: null,
    targeting: { mode: 'closest' },
  },
  turret: {
    name: 'Turret',
    role: 'mage',
    stats: { hp: 1000, damage: 6, armor: 0, moveSpeed: 0, attackSpeed: 12, range: 10 },
    attack: { kind: 'beam', shape: { type: 'single' } },
    targeting: { mode: 'closest' },
  },
  runner: {
    name: 'Runner',
    role: 'duelist',
    stats: { hp: 500, damage: 1, armor: 0, moveSpeed: 12, attackSpeed: 1, range: 1 },
    attack: { kind: 'melee', shape: { type: 'single' } },
    targeting: { mode: 'closest' },
  },
  brawler: {
    name: 'Brawler',
    role: 'vanguard',
    stats: { hp: 200, damage: 10, armor: 0, moveSpeed: 6, attackSpeed: 6, range: 1 },
    attack: { kind: 'melee', shape: { type: 'single' } },
    targeting: { mode: 'closest' },
  },
  ranger: {
    name: 'Ranger',
    role: 'mage',
    stats: { hp: 200, damage: 10, armor: 0, moveSpeed: 6, attackSpeed: 6, range: 3 },
    attack: { kind: 'beam', shape: { type: 'single' } },
    targeting: { mode: 'closest' },
  },
};

// units: [id, defId, side, col, row]
export function makeSetup({ width = 8, height = 10, seed = 1, units, config }) {
  return {
    seed,
    grid: { width, height },
    units: units.map(([id, defId, side, col, row]) => ({ id, defId, side, pos: offsetToAxial(col, row) })),
    defs: TEST_DEFS,
    config,
  };
}

export const eventsOf = (log, type, pred = () => true) => log.filter((e) => e.type === type && pred(e));

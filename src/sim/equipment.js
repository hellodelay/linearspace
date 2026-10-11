// Placeholder Equipment pool (GDD 20; "Equipment pool structure" is TBD). Values are for feel-testing only.
// Equipment modifies stats or reacts to combat events; it never changes unit behavior.
//
// mods:     [{ stat, add } | { stat, mult }]   stat: hp | damage | armor | moveSpeed | attackSpeed
// triggers: [{ on, effect }]                   on: damaged | attack | kill | death
// effect:   { type: 'buff', mods, durationTU } | { type: 'heal', amount } | { type: 'blast', damage, radius }
// short/color/desc are display data for the presentation layer.

export const EQUIPMENT_DEFS = Object.freeze({
  plating: {
    name: 'Reinforced Plating',
    short: 'PLT',
    color: 0x8fb8d8,
    desc: '+4 Armor',
    mods: [{ stat: 'armor', add: 4 }],
  },
  hull: {
    name: 'Hull Extension',
    short: 'HUL',
    color: 0x5fd08a,
    desc: '+60 max HP',
    mods: [{ stat: 'hp', add: 60 }],
  },
  capacitor: {
    name: 'Overclocked Capacitor',
    short: 'CAP',
    color: 0xffb03c,
    desc: '+15% Damage',
    mods: [{ stat: 'damage', mult: 0.15 }],
  },
  loader: {
    name: 'Rapid Loader',
    short: 'RLD',
    color: 0xffe14a,
    desc: '+25% Attack Speed',
    mods: [{ stat: 'attackSpeed', mult: 0.25 }],
  },
  servos: {
    name: 'Servo Actuators',
    short: 'SRV',
    color: 0x4ad8ff,
    desc: '+50% Move Speed',
    mods: [{ stat: 'moveSpeed', mult: 0.5 }],
  },
  reactive: {
    name: 'Reactive Armor',
    short: 'RCT',
    color: 0x9fb4ff,
    desc: 'OnDamage: +4 Armor for 4 TU',
    triggers: [{ on: 'damaged', effect: { type: 'buff', mods: [{ stat: 'armor', add: 4 }], durationTU: 4 } }],
  },
  stim: {
    name: 'Combat Stim',
    short: 'STM',
    color: 0xff6a9a,
    desc: 'OnDamage: +30% Attack Speed for 6 TU',
    triggers: [{ on: 'damaged', effect: { type: 'buff', mods: [{ stat: 'attackSpeed', mult: 0.3 }], durationTU: 6 } }],
  },
  siphon: {
    name: 'Siphon Coil',
    short: 'SPH',
    color: 0x7dffd8,
    desc: 'OnAttack: repair 4 HP',
    triggers: [{ on: 'attack', effect: { type: 'heal', amount: 4 } }],
  },
  salvage: {
    name: 'Salvage Rig',
    short: 'SLV',
    color: 0xb4ff6a,
    desc: 'OnKill: repair 30 HP',
    triggers: [{ on: 'kill', effect: { type: 'heal', amount: 30 } }],
  },
  scuttle: {
    name: 'Scuttle Charge',
    short: 'SCT',
    color: 0xff5a3c,
    desc: 'OnDeath: 30 damage to enemies within 1 hex',
    triggers: [{ on: 'death', effect: { type: 'blast', damage: 30, radius: 1 } }],
  },
});

// ASSUMPTION (GDD 20, TBD): flat adds apply before percent mods, and percent mods add together.
export function applyMods(base, mods) {
  let add = 0;
  let mult = 0;
  for (const m of mods) {
    add += m.add ?? 0;
    mult += m.mult ?? 0;
  }
  return (base + add) * (1 + mult);
}

import { UNIT_DEFS } from './data.js';
import { EQUIPMENT_DEFS } from './equipment.js';
import { SIM_CONFIG } from './config.js';
import { offsetToAxial } from './hex.js';

// Placeholder encounter. Offsets are (col, row); row 0 is the enemy edge.
export const DEFAULT_SCENARIO = Object.freeze({
  id: 'proto-skirmish',
  grid: { width: 7, height: 8 },
  // ASSUMPTION (GDD 8.3, TBD): prototype deployment cap.
  deployCap: 5,
  deployRows: [4, 5, 6, 7],
  roster: ['bulwark', 'lancer', 'arc', 'salvo', 'mender'],
  // Placeholder enemy gear, mainly so their cards show filled equipment slots.
  enemies: [
    { defId: 'brute', col: 3, row: 2, equipment: ['plating', 'reactive'] },
    { defId: 'drone', col: 1, row: 2 },
    { defId: 'drone', col: 6, row: 2, equipment: ['scuttle'] },
    { defId: 'gunship', col: 5, row: 1, equipment: ['loader'] },
    { defId: 'gunship', col: 2, row: 1 },
    { defId: 'bomber', col: 4, row: 0, equipment: ['capacitor', 'hull', 'siphon'] },
  ],
  defaultDeployment: [
    { defId: 'bulwark', col: 3, row: 5 },
    { defId: 'lancer', col: 5, row: 5 },
    { defId: 'arc', col: 2, row: 6 },
    { defId: 'mender', col: 4, row: 6 },
    { defId: 'salvo', col: 4, row: 7 },
  ],
  // Placeholder starting gear with 0-3 items per unit, so every slot state shows on the cards.
  defaultLoadout: {
    bulwark: ['plating', 'reactive', 'hull'],
    lancer: ['stim', 'salvage'],
    arc: ['capacitor'],
    salvo: ['loader', 'siphon', 'scuttle'],
  },
});

// Problems with a player deployment and its loadout ({ defId: [equipmentId] }); empty when valid.
export function validateDeployment(scenario, deployment, loadout = {}, equipmentDefs = EQUIPMENT_DEFS) {
  const errors = [];
  if (deployment.length === 0) errors.push('Deploy at least one unit.');
  if (deployment.length > scenario.deployCap) errors.push(`At most ${scenario.deployCap} units may deploy.`);
  const used = new Set(scenario.enemies.map((e) => `${e.col},${e.row}`));
  const seenDefs = new Set();
  for (const d of deployment) {
    const k = `${d.col},${d.row}`;
    if (!scenario.roster.includes(d.defId)) errors.push(`${d.defId} is not in the roster.`);
    if (seenDefs.has(d.defId)) errors.push(`${d.defId} is deployed twice.`);
    if (!scenario.deployRows.includes(d.row) || d.col < 0 || d.col >= scenario.grid.width) {
      errors.push(`${d.defId} is outside the deployment zone.`);
    }
    if (used.has(k)) errors.push(`Hex ${k} is occupied twice.`);
    used.add(k);
    seenDefs.add(d.defId);
    const items = loadout[d.defId] ?? [];
    if (items.length > SIM_CONFIG.equipmentSlots) errors.push(`${d.defId} has more than ${SIM_CONFIG.equipmentSlots} equipment.`);
    if (SIM_CONFIG.uniqueEquipmentPerUnit && new Set(items).size !== items.length) errors.push(`${d.defId} has duplicate equipment.`);
    for (const id of items) if (!equipmentDefs[id]) errors.push(`Unknown equipment ${id}.`);
  }
  return errors;
}

// Self-contained simulation input: replaying needs nothing but this object.
export function buildBattleSetup({ scenario, deployment, seed, loadout = {}, defs = UNIT_DEFS, equipmentDefs = EQUIPMENT_DEFS }) {
  const units = [
    ...deployment.map((d, i) => ({
      id: `p${i + 1}`,
      defId: d.defId,
      side: 'player',
      pos: offsetToAxial(d.col, d.row),
      equipment: [...(loadout[d.defId] ?? [])],
    })),
    ...scenario.enemies.map((e, i) => ({
      id: `e${i + 1}`,
      defId: e.defId,
      side: 'enemy',
      pos: offsetToAxial(e.col, e.row),
      equipment: [...(e.equipment ?? [])],
    })),
  ];
  const usedDefs = {};
  const usedEquipment = {};
  for (const u of units) {
    usedDefs[u.defId] = structuredClone(defs[u.defId]);
    for (const id of u.equipment) usedEquipment[id] = structuredClone(equipmentDefs[id]);
  }
  return { seed: seed >>> 0, scenarioId: scenario.id, grid: { ...scenario.grid }, units, defs: usedDefs, equipment: usedEquipment };
}

import { axialToOffset } from './hex.js';

// Human-readable battle log lines. `names` maps unit id -> display name.
export function unitNames(log) {
  const setup = log[0].setup;
  const names = {};
  for (const u of setup.units) names[u.id] = `${u.id} ${setup.defs[u.defId].name}`;
  return names;
}

const hexStr = (h) => {
  const o = axialToOffset(h);
  return `(${o.col},${o.row})`;
};

export function formatEvent(ev, names) {
  const n = (id) => names[id] ?? id;
  switch (ev.type) {
    case 'battle_start':
      return `Battle start, seed ${ev.seed}`;
    case 'target':
      return ev.target ? `${n(ev.unit)} targets ${n(ev.target)}` : `${n(ev.unit)} drops target ${n(ev.prev)}`;
    case 'move_start':
      return `${n(ev.unit)} moves ${hexStr(ev.from)} -> ${hexStr(ev.to)} (arrives TU ${ev.arriveTU})`;
    case 'move_end':
      return `${n(ev.unit)} arrives ${hexStr(ev.at)}`;
    case 'attack':
      if (ev.projectiles.length) return `${n(ev.unit)} launches ${ev.projectiles.length} ${ev.kind} at ${n(ev.target)}`;
      return `${n(ev.unit)} ${ev.kind === 'heal' ? 'heals' : `${ev.kind} attacks`} ${n(ev.target)}`;
    case 'projectile_launch':
      return null;
    case 'projectile_impact':
      return `${ev.projectileId} lands ${hexStr(ev.hex)}${ev.hexes.length > 1 ? ` (${ev.hexes.length} hexes)` : ''}`;
    case 'damage':
      return `${n(ev.unit)} takes ${ev.amount}${ev.source.timeout ? ' timeout' : ''} damage, HP ${ev.hpBefore} -> ${ev.hpAfter}`;
    case 'heal':
      return `${n(ev.unit)} healed ${ev.amount}, HP ${ev.hpBefore} -> ${ev.hpAfter}`;
    case 'death':
      return `${n(ev.unit)} destroyed${ev.killer ? ` by ${n(ev.killer)}` : ''}`;
    case 'timeout_begin':
      return 'Timeout: all units now take damage every TU';
    case 'battle_end':
      return `Battle end: ${ev.winner} (${ev.reason})`;
    default:
      return `${ev.type}`;
  }
}

export function formatLog(log) {
  const names = unitNames(log);
  const lines = [];
  let tu = -1;
  for (const ev of log) {
    const text = formatEvent(ev, names);
    if (text == null) continue;
    if (ev.tu !== tu) {
      tu = ev.tu;
      lines.push(`TU ${tu}`);
    }
    lines.push(`  ${text}`);
  }
  return lines.join('\n');
}

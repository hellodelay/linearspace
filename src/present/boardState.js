// Board state driven only by critical cues. The view renders from it; tests compare it to sim snapshots.
export function createBoardState(setup) {
  const units = new Map();
  for (const u of setup.units) {
    const hp = setup.defs[u.defId].stats.hp;
    units.set(u.id, { id: u.id, q: u.pos.q, r: u.pos.r, hp, maxHp: hp, alive: true, targetId: null });
  }
  return { units, winner: null, overtime: false };
}

export function applyCue(board, cue) {
  const ev = cue.ev;
  const u = ev.unit ? board.units.get(ev.unit) : null;
  switch (ev.type) {
    case 'move_start':
      u.q = ev.to.q;
      u.r = ev.to.r;
      break;
    case 'damage':
    case 'heal':
      u.hp = ev.hpAfter;
      break;
    case 'death':
      u.alive = false;
      u.targetId = null;
      break;
    case 'target':
      u.targetId = ev.target;
      break;
    case 'timeout_begin':
      board.overtime = true;
      break;
    case 'battle_end':
      board.winner = ev.winner;
      break;
    default:
      break;
  }
}

// Combat chatter director. Derives dialogue lines from a presentation timeline.
// Dialogue is cosmetic: it reacts to critical events but never affects them. Line choice is a
// hash of the triggering event, so the same log always produces the same chatter, and lines are
// placed on the TU clock so seeking and speed changes stay consistent.

import { equippedStats } from '../sim/simulate.js';

export const DIALOGUE_CONFIG = Object.freeze({
  leadTU: 0.1,
  durationTU: 3.2,
  // Typewriter reveal time.
  revealTU: 0.9,
  // Quiet time after a line ends before a low-priority line may start.
  quietTU: 0.8,
  speakerCooldownTU: 9,
  lowHpRatio: 0.35,
  // Reactions wait for the line they respond to (a death, the opening call) to finish.
  replyTU: 3.5,
});

const PRIORITY = { victory: 6, overtime: 5, death: 5, kill: 4, lowHp: 3, allyDown: 3, start: 2, signature: 1, healed: 1 };
const MOOD = {
  start: 'angry',
  signature: 'angry',
  kill: 'happy',
  death: 'shout',
  lowHp: 'hurt',
  healed: 'happy',
  allyDown: 'shout',
  overtime: 'shout',
  victory: 'happy',
};

export function buildDialogue(timeline, cast, cfg = DIALOGUE_CONFIG) {
  const setup = timeline.setup;
  const units = new Map();
  const perDef = new Map();
  for (const u of setup.units) {
    const n = (perDef.get(u.defId) ?? 0) + 1;
    perDef.set(u.defId, n);
    const hp = equippedStats(setup.defs[u.defId], u.equipment, setup.equipment).stats.hp;
    units.set(u.id, { ...u, n, hp, maxHp: hp, alive: true, lowHp: false, healed: false, attacked: false });
  }
  const speakerName = (u) => {
    const c = cast[u.defId];
    return perDef.get(u.defId) > 1 ? `${c.pilot} ${u.n}` : c.pilot;
  };
  const firstAlive = (side) => [...units.values()].find((u) => u.alive && u.side === side);

  const deathT = new Map();
  const candidates = [];
  const add = (t, unitId, trigger, seq) => {
    const u = units.get(unitId);
    if (!u || !cast[u.defId]?.lines[trigger]?.length) return;
    let priority = PRIORITY[trigger];
    if (trigger === 'death' && u.side === 'enemy') priority = 2;
    candidates.push({ t, unitId, trigger, seq, priority });
  };

  const opener = setup.units.find((u) => u.side === 'player');
  const taunter = setup.units.find((u) => u.side === 'enemy');
  // The opening call goes out at TU 0, ahead of any first-attack lines.
  if (opener) add(0, opener.id, 'start', -2);
  if (taunter) add(cfg.replyTU, taunter.id, 'start', -1);

  for (const cue of timeline.cues) {
    const ev = cue.ev;
    const u = ev.unit ? units.get(ev.unit) : null;
    switch (ev.type) {
      case 'attack':
        if (!u.attacked) {
          u.attacked = true;
          add(cue.t, u.id, 'signature', ev.seq);
        }
        break;
      case 'damage':
        u.hp = ev.hpAfter;
        if (!u.lowHp && u.hp > 0 && u.hp / u.maxHp <= cfg.lowHpRatio) {
          u.lowHp = true;
          add(cue.t, u.id, 'lowHp', ev.seq);
        }
        break;
      case 'heal':
        u.hp = ev.hpAfter;
        if (!u.healed) {
          u.healed = true;
          add(cue.t, u.id, 'healed', ev.seq);
        }
        break;
      case 'death': {
        u.alive = false;
        deathT.set(u.id, cue.t);
        add(cue.t, u.id, 'death', ev.seq);
        if (ev.killer) add(cue.t, ev.killer, 'kill', ev.seq);
        const ally = firstAlive(u.side);
        if (ally) add(cue.t + cfg.replyTU, ally.id, 'allyDown', ev.seq);
        break;
      }
      case 'timeout_begin': {
        const speaker = firstAlive('player');
        if (speaker) add(cue.t, speaker.id, 'overtime', ev.seq);
        break;
      }
      case 'battle_end': {
        const speaker = ev.winner === 'draw' ? null : firstAlive(ev.winner);
        if (speaker) add(cue.t, speaker.id, 'victory', ev.seq);
        break;
      }
      default:
        break;
    }
  }

  // Greedy pass in time order: one line at a time, higher priority preempts, cooldowns thin the rest.
  candidates.sort((a, b) => a.t - b.t || b.priority - a.priority || a.seq - b.seq);
  const lines = [];
  const lastSpoke = new Map();
  let current = null;
  for (const c of candidates) {
    const died = deathT.get(c.unitId);
    if (c.trigger !== 'death' && died != null && died <= c.t) continue;
    const busy = current && c.t + cfg.leadTU < current.t1;
    if (busy && c.priority <= current.priority) continue;
    if (!busy && current && c.priority < 3 && c.t < current.t1 + cfg.quietTU) continue;
    if (c.priority < 5 && c.t < (lastSpoke.get(c.unitId) ?? -Infinity) + cfg.speakerCooldownTU) continue;

    const u = units.get(c.unitId);
    const options = cast[u.defId].lines[c.trigger];
    const t = c.t + cfg.leadTU;
    if (busy) current.t1 = t;
    current = {
      t,
      t1: t + cfg.durationTU,
      unitId: u.id,
      defId: u.defId,
      side: u.side,
      name: speakerName(u),
      callsign: cast[u.defId].callsign,
      trigger: c.trigger,
      mood: MOOD[c.trigger],
      priority: c.priority,
      text: options[hash(c.seq, u.id) % options.length],
    };
    lines.push(current);
    lastSpoke.set(u.id, c.t);
  }
  return lines;
}

// The line on screen at presentation time pt, or null.
export function activeLine(lines, pt) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].t <= pt) return pt < lines[i].t1 ? lines[i] : null;
  }
  return null;
}

function hash(seq, id) {
  let h = (seq + 7) * 2654435761;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

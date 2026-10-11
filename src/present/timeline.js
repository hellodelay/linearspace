// Turns a simulation log into presentation cues on a continuous clock measured in TU.
//
// TU t owns the presentation window [t, t+1).
// Critical cues change board state (position, HP, death, impacts) and always land inside their TU's
// window, after every cue they depend on, so the board at time t+1 equals the sim state after TU t.
// Cosmetic cues (targeting, weapon fire, launches) are scheduled freely around the critical ones,
// e.g. a 3-missile salvo is spread across its window instead of firing in one burst.
// Nothing here reads wall-clock time; playback speed only scales how fast the clock advances.

export const CRITICAL_TYPES = new Set(['move_start', 'move_end', 'projectile_impact', 'damage', 'heal', 'death', 'battle_end']);

export const TIMELINE_CONFIG = Object.freeze({
  // Instant attacks within one TU are staggered across [start, start + span).
  instant: { start: 0.06, span: 0.5 },
  // Gap between an instant weapon firing and its hit (beam travel / melee swing).
  instantHitDelay: 0.06,
  // Projectiles from one attack launch across [start, start + span); each keeps its offset on impact.
  salvo: { start: 0.04, span: 0.8 },
  timeoutHitPhase: 0.35,
  deathLag: 0.06,
  // Latest phase a critical cue may use inside its window.
  maxPhase: 0.97,
  endPhase: 0.99,
  // Presentation keeps running this long after the final TU so death effects can finish.
  tailTU: 3,
});

export function buildTimeline(log, cfg = TIMELINE_CONFIG) {
  const start = log[0];
  if (start?.type !== 'battle_start') throw new Error('Log must begin with battle_start');
  const end = log[log.length - 1];

  // Pre-pass: attacks per TU (for staggering) and impact data per projectile (for flight paths).
  const attacksPerTU = new Map();
  const impacts = new Map();
  for (const ev of log) {
    if (ev.type === 'attack') attacksPerTU.set(ev.tu, (attacksPerTU.get(ev.tu) ?? 0) + 1);
    else if (ev.type === 'projectile_impact') impacts.set(ev.projectileId, ev);
  }

  const cues = [];
  const attackRank = new Map();
  const rankCounter = new Map();
  const hitTime = new Map();
  const lastHit = new Map();
  const clampPhase = (tu, t) => Math.min(tu + cfg.maxPhase, Math.max(tu, t));
  const push = (t, ev, extra = {}) => cues.push({ t, critical: CRITICAL_TYPES.has(ev.type), ev, ...extra });
  // HP cues carry absolute values, so one unit's hits must keep sim order; a hit never lands before an earlier one.
  const scheduleHit = (unit, tu, desired) => {
    const k = `${unit}@${tu}`;
    const t = clampPhase(tu, Math.max(desired, lastHit.get(k) ?? tu));
    lastHit.set(k, t);
    return t;
  };

  for (const ev of log) {
    const tu = ev.tu;
    switch (ev.type) {
      case 'battle_start':
        break;
      case 'target':
      case 'timeout_begin':
      case 'move_end':
        push(tu, ev);
        break;
      case 'move_start':
        push(tu, ev, { t1: ev.arriveTU });
        break;
      case 'attack': {
        const rank = rankCounter.get(tu) ?? 0;
        rankCounter.set(tu, rank + 1);
        const count = attacksPerTU.get(tu);
        attackRank.set(ev.attackId, rank);
        if (ev.projectiles.length) {
          // Launch cues carry the visuals; the attack cue only marks the decision.
          push(tu + cfg.salvo.start, ev);
        } else {
          const fire = tu + cfg.instant.start + (count > 1 ? (cfg.instant.span * rank) / (count - 1) : 0);
          const hit = clampPhase(tu, fire + cfg.instantHitDelay);
          hitTime.set(ev.attackId, hit);
          push(fire, ev, { t1: hit });
        }
        break;
      }
      case 'projectile_launch': {
        // Golden-ratio jitter interleaves salvos from different attackers launched in the same TU.
        const jitter = ((attackRank.get(ev.attackId) ?? 0) * 0.618) % 1;
        const phase = cfg.salvo.start + (cfg.salvo.span * (ev.index + jitter)) / ev.count;
        const launch = tu + phase;
        const impact = impacts.get(ev.projectileId);
        const land = impact ? clampPhase(impact.tu, impact.tu + phase) : null;
        if (land != null) hitTime.set(ev.projectileId, land);
        push(launch, ev, { t1: land ?? launch, impact: impact ?? null });
        break;
      }
      case 'projectile_impact':
        push(hitTime.get(ev.projectileId) ?? tu, ev);
        break;
      case 'damage':
      case 'heal': {
        const src = ev.source;
        const desired = src.timeout
          ? tu + cfg.timeoutHitPhase
          : (hitTime.get(src.projectileId ?? src.attackId) ?? tu + cfg.timeoutHitPhase);
        push(scheduleHit(ev.unit, tu, desired), ev);
        break;
      }
      case 'death':
        push(clampPhase(tu, (lastHit.get(`${ev.unit}@${tu}`) ?? tu) + cfg.deathLag), ev);
        break;
      case 'battle_end':
        push(tu + cfg.endPhase, ev);
        break;
      default:
        push(tu, ev);
    }
  }

  // Stable by time, then by log order.
  cues.sort((a, b) => a.t - b.t || a.ev.seq - b.ev.seq);
  return {
    setup: start.setup,
    cues,
    endTU: end.tu,
    duration: end.tu + 1 + cfg.tailTU,
  };
}

// Checks the critical-timing contract. Returns a list of violation messages (empty when valid).
export function validateTimeline(timeline) {
  const errors = [];
  const hitsByUnitTU = new Map();
  const lastHpSeq = new Map();
  for (const c of timeline.cues) {
    if (!c.critical) continue;
    const { tu, type, seq } = c.ev;
    if (!(c.t >= tu && c.t < tu + 1)) errors.push(`${type} #${seq} at ${c.t} is outside TU ${tu}`);
    if (type === 'move_start' && c.t1 !== c.ev.arriveTU) errors.push(`move #${seq} arrives ${c.t1}, sim says ${c.ev.arriveTU}`);
    if (type === 'damage' || type === 'heal') {
      const k = `${c.ev.unit}@${tu}`;
      hitsByUnitTU.set(k, Math.max(hitsByUnitTU.get(k) ?? -Infinity, c.t));
      // Cues are in presentation order here, so sim order per unit must be increasing.
      if ((lastHpSeq.get(c.ev.unit) ?? -1) > seq) errors.push(`${type} #${seq} on ${c.ev.unit} plays out of sim order`);
      lastHpSeq.set(c.ev.unit, seq);
    }
  }
  for (const c of timeline.cues) {
    if (c.ev.type !== 'death') continue;
    const lastHit = hitsByUnitTU.get(`${c.ev.unit}@${c.ev.tu}`);
    if (lastHit != null && c.t < lastHit) errors.push(`death of ${c.ev.unit} at ${c.t} precedes its last hit at ${lastHit}`);
  }
  return errors;
}

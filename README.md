# Linear Space - tactical combat prototype

Deterministic hex-grid autobattler simulation with a Three.js presentation layer.
Design docs: [docs/linearspace_design.md](docs/linearspace_design.md), [docs/linearspace_prototype.md](docs/linearspace_prototype.md).

No dependencies to install. Three.js r169 loads from jsDelivr via an import map.

```
npm test                        # simulation + presentation-contract tests (Node 20+)
npm run battle -- --seed 42     # print a battle log headless
npm run serve                   # http://localhost:8080/
```

## Architecture

```
src/sim/        pure, deterministic, no DOM / Three.js / wall-clock
  simulate.js   setup -> { log, winner, finalState, snapshots? }
  config.js     every TBD rule as a tunable, tagged ASSUMPTION
  data.js       placeholder unit roster
  battle.js     scenario, deployment validation, self-contained setup builder
src/present/    consumes the log only
  timeline.js   log -> presentation cues (the critical/cosmetic scheduler)
  playback.js   TU-based clock, speed, pause, step, seek
  boardState.js board state driven by critical cues
  view.js       Three.js renderer
src/main.js     deployment UI, HUD, controls
```

### Simulation

`simulate(setup)` runs the whole battle immediately and returns a structured event log. The log's
`battle_start` event embeds the full setup (seed, grid, units, unit defs), so a log is enough to replay
or debug a battle. The only randomness is the seeded damage roll.

### Presentation timing contract

Presentation time is a continuous clock measured in TU. TU `t` owns the window `[t, t+1)`, and playback
speed only changes how fast real time advances that clock.

- **Critical cues** change board state: `move_start`, `move_end`, `projectile_impact`, `damage`, `heal`,
  `death`, `battle_end`. Each lands inside its own TU window, deaths come after the hits that caused
  them, and HP changes on one unit keep sim order. So the board at time `t+1` always equals the sim
  state after TU `t`.
- **Cosmetic cues** (`target`, `attack`, `projectile_launch`, `timeout_begin`) are scheduled around the
  critical ones. Instant attacks in the same TU are staggered across the window. A salvo's projectiles
  launch spread across the window, and each one lands at the same offset inside its impact TU, so every
  projectile's flight time equals its sim travel time.

`validateTimeline()` checks the contract. The tests check it across many seeds and also confirm that
the cue-driven board matches the sim snapshot at every TU boundary, including after seeking.

## Assumptions standing in for TBD design (GDD section 45)

All of these live in [src/sim/config.js](src/sim/config.js), [src/sim/data.js](src/sim/data.js) or
[src/sim/battle.js](src/sim/battle.js) and can change without touching simulation code.

- TU phase order: move completion, projectile impacts, targeting, actions, timeout damage, damage/heal
  resolution, deaths, victory check. Damage is simultaneous within a TU.
- Action order: setup order within each side, interleaved player/enemy. Earlier units win hex contests.
- Move Speed: `ceil(12 / moveSpeed)` TU per hex. A moving unit occupies its destination hex immediately
  and cannot attack until it arrives.
- Attack Speed: `ceil(12 / attackSpeed)` TU between attacks.
- Damage: `max(1, round(raw * (1 +/- 10% seeded)) - armor)`.
- Projectiles take simulated travel time (`travelTU`). Homing projectiles track their target; shells
  land on the hex they were aimed at.
- Targeting tie-breaks: closest, then lowest HP, then id. `weakest`: lowest HP within range, then
  closest, then id, falling back to closest. Healers target the lowest HP-ratio injured ally.
- Pathfinding: BFS in a fixed neighbor order. If no hex in range is reachable, the unit steps toward the
  closest reachable hex.
- AoE has no friendly fire.
- Timeout: from TU 120, every unit takes `3 + (tu - 120)` armor-ignoring damage per TU. Draw at TU 400.
- Deployment cap 5, deployment zone is the bottom 3 rows.
- Unit roster, stats and enemy faction are placeholders.

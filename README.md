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

### Pilots, portraits and chatter

- [cast.js](src/present/cast.js) gives each unit type a placeholder pilot: name, callsign, portrait
  spec and combat lines. Pilot assignment, affinities and abilities (GDD 22-25) are not implemented,
  so pilots are presentation-only for now.
- [portraits.js](src/present/portraits.js) draws procedural anime-style placeholder portraits on a
  canvas, with mood variants (neutral, happy, angry, hurt, shout).
- By default, units render as slanted cards (the header toggle switches back to geometric shapes). This
  departs from GDD 36, which keeps units geometric and puts portraits next to pilot chatter.
  - The card has two slices, the unit badge and the pilot portrait.
  - Damage taken is a translucent red fill rising over the unit badge; there's no overlay at full HP.
  - The resource is a blue border around the equipment strip. It fills from the middle of the left
    end, across the top and bottom at once, and meets in the middle of the right end when full.
  - An equipment strip below the card is split into one slice per slot.
  - The resource is a placeholder: it shows attack charge, filling between shots, until the sim has a
    resource.
  - [unitIcons.js](src/present/unitIcons.js) draws placeholder unit badges from each unit's shape.
- [dialogue.js](src/present/dialogue.js) derives chatter from the timeline: opening calls, first
  attack, kills, low HP, heals, deaths, ally down, overtime and victory. One line at a time; higher
  priority preempts, cooldowns thin the rest. Choice is hashed from the triggering event, so chatter is
  deterministic and seek-safe.

### Equipment

Each unit has 3 Equipment slots (GDD 20). [equipment.js](src/sim/equipment.js) holds a placeholder pool
of 10 items:

- **Stat mods:** flat or percent changes to HP, Damage, Armor, Move Speed or Attack Speed.
- **Triggers:** OnDamage, OnAttack, OnKill or OnDeath. A trigger can grant a timed buff, repair the
  unit, or set off a blast.

Triggers resolve inside the simulation and are logged as `equip_trigger` events, with the seq of the
event that caused them. Buff expiry is logged as `buff_end`. The presentation plays each trigger just
after its cause.

There is no shop yet, so the deployment screen has a free **Armory** tab. Drag an item onto a deployed
unit to equip it, and tap a filled slot in the unit panel to remove it. A unit keeps its equipment when
benched.

Assumptions (GDD 20 TBD, see [config.js](src/sim/config.js)):

- flat mods apply before percent mods, and percent mods add together
- one copy of each item per unit
- re-triggering a buff refreshes its duration instead of stacking
- death-triggered effects resolve in the same TU

### Deployment

Drag a roster card onto a blue hex to deploy, drag a deployed unit to move it, drop it on another
player unit to swap, or drag it back to the tray to bench it. Tap a unit for stats and range.

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

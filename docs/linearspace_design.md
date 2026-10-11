# Linear Space
## Game Design Document + Prototype Specification
### Version 0.1 — Prototype Foundation

> Working design. This document captures the current canonical design direction.
> Items explicitly marked TBD must not be invented by an implementation AI
> without approval.

---

# 1. Product Definition

Linear Space is a mobile-browser space combat roguelike.

The core experience combines:

- Guild Run / TFT-style deterministic autobattler combat.
- Helldivers 2-style shared Galactic War and planetary influence.
- XCOM-style named pilots, injuries, persistence, and permadeath.
- A collectible/build-focused unit and pilot system.
- Geometry Wars-inspired geometric battlefield presentation.
- Anime/sci-fi presentation with energetic combat effects.

The current prototype should focus on:

- Units
- Pilots
- Deterministic hex-grid combat
- Temporary Operation builds
- The Operation roguelike loop

The player's large ship is temporarily OUT OF SCOPE.

---

# 2. Prototype Philosophy

The game should be built in stages.

The first implementation should prove that:

1. Hex-grid autobattler combat is fun to configure and watch.
2. Combat is completely deterministic and reproducible from a log.
3. Pilots make units feel meaningfully different.
4. Temporary Tech and Equipment create interesting run-specific builds.
5. The short Operation loop is compelling.

Do not implement the entire eventual game before validating the core loop.

---

# 3. Core Game Loop

At the strategic level:

GALACTIC MAP
    ↓
Choose planet
    ↓
Choose Operation
    ↓
Operation
    ├─ Combat Round
    ├─ Shop
    ├─ Decision
    └─ Next Round
    ↓
Operation Victory / Defeat
    ↓
Resolve persistent consequences
    ↓
Receive AC / Influence
    ↓
Return to Galactic Map

Within an Operation:

Combat
  ↓
Earn Credits
  ↓
Shop
  ↓
Configure temporary build
  ↓
Decision
  ↓
Next Combat Round

Operations are roguelike runs.

Temporary Operation state is discarded when the Operation ends.

# 4. Galactic Map

The Galactic Map represents an ongoing shared war.

Players can travel directly to any available planet.

There is no required node-to-node travel path.

---

## 4.1 Sectors

Planets belong to sectors.

A sector establishes a broad encounter identity, including:

- Enemy types/factions
- Encounter characteristics
- Visual/environmental theme
- Available Operations
- Potential rewards

Exact sectors and enemy factions are TBD.

---

## 4.2 Planet Selection

Players choose their next planet based on:

- Open Contracts
- Alliance Orders
- Galactic War status
- Available Operations
- Operation difficulty
- Operation rewards
- Sector enemy composition
- Their roster/build needs

---

# 5. Galactic Influence

Completing an Operation awards Influence Points.

Influence is contributed to the shared war at the planet where the Operation was completed.

### Prototype model

- Operation victory awards Influence.
- Amount is primarily determined by Operation difficulty.
- Failed Operations award no Influence.
- Players collectively contribute toward the same planetary Influence total.
- Each planet has a fixed Influence target.
- Reaching the target changes the planet from Contested to Secured.
- Enemy Influence/decay is NOT implemented for the prototype.
- Consequences of securing a planet are TBD.

Example placeholder values:

- Low Operation: +10 Influence
- Medium Operation: +25 Influence
- High Operation: +50 Influence

These numbers are placeholders.

---

# 6. Operations

An Operation is a self-contained roguelike combat run selected at a Galactic Map location.

Operations are primarily combat-focused.

---

## 6.1 Operation Length

Operations may have different lengths.

- Shorter Operations generally have lower difficulty and lower rewards.
- Longer Operations generally have higher difficulty and higher rewards.
- The standard/full Operation currently has up to 8 combat rounds.
- Exact difficulty/reward scaling is TBD.

Example:

| Operation | Rounds | Difficulty |
|---|---:|---|
| Skirmish | 3 | Low |
| Assault | 5 | Medium |
| Major Operation | 8 | High |

Names are placeholders.

---

## 6.2 Boss Rounds

For an 8-round Operation:

- Round 3: Boss
- Round 6: Boss
- Round 8: Final Boss

Boss placement for shorter Operations is TBD.

---

## 6.3 Operation Completion

The player must complete all rounds of the selected Operation to receive the full Operation rewards.

Failed Operations currently award no Influence.

Exact failure/persistent reward structure is TBD.

---

# 7. Operation Economy

## Credits

Credits are temporary, run-specific currency.

- Start at 0 when an Operation begins.
- Persist from round to round.
- Primarily earned by successfully completing combat rounds.
- May also be earned through objectives, decisions, events, or other Operation-specific rewards.
- Are spent during the Operation.
- Disappear at the end of the Operation.
- Do not carry over between Operations.

Credits may purchase:

- Equipment
- Tech Power-Ups
- Temporary units
- Shop rerolls

Exact prices and income are TBD.

# 8. Combat

Combat is a deterministic hex-grid autobattler.

The player configures units and positions before combat, then commits and cannot influence the board during the round.

---

## 8.1 Combat Flow

Enemy deployment is preplaced
        ↓
Player deploys units
        ↓
Player configures Equipment
        ↓
Player commits
        ↓
Autonomous deterministic combat
        ↓
One side is eliminated
        ↓
Round ends

After a certain amount of time has elapsed, all units begin taking damage to force a round conclusion.

Exact timeout and forced-damage rules are TBD.

---

## 8.2 Hex Grid

- Combat uses a hexagonal grid.
- Only one unit may occupy a hex at a time.
- Units must path around other units unless they have an ability that permits passing through them.
- Enemy positions are predetermined.
- Player chooses deployment positions before committing.

---

## 8.3 Deployment

The ship's Launch Bay mechanic is removed from the current scope.

For the prototype, maximum deployable units must be defined independently.

TBD: prototype deployment cap.

---

# 9. Time Units (TU)

Combat time is measured in Time Units, abbreviated TU.

One TU is one simulation tick.

TU is used to:

- Determine operation order.
- Resolve movement.
- Prevent double occupancy.
- Calculate cooldowns.
- Resolve attacks and effects.
- Process other time-dependent mechanics.

Higher Move Speed is better/faster.

A higher Move Speed means a unit requires fewer TUs to move a single hex.

Exact Move Speed → movement-frequency conversion is TBD.

---

# 10. Unit Movement

Units move automatically according to their behavior and target.

A unit will stop moving if it is already in range of its ability/attack.

Units cannot move through other units unless an ability explicitly permits it.

Pathfinding must be deterministic.

Exact tie-breaking/path-selection rules are TBD but must be deterministic.

---

# 11. Unit Targeting

Default targeting behavior:

> Target the closest valid enemy within attack range.

Once a unit has a target:

> It keeps that target until the target is no longer valid.

Only then does it select a new target.

A target becomes invalid according to combat rules still to be formalized.

Unit abilities may modify targeting behavior.

Example:

> Target the weakest valid unit within a specified range instead of the closest.

Targeting tie-breakers are TBD.

---

# 12. Unit Combat Stats

Current base stats:

- HP
- Damage
- Armor
- Move Speed
- Attack Speed
- Attack Range

Higher Move Speed = faster.

Other stat directionality is conventional unless otherwise specified.

Exact formulas are TBD.

---

# 13. Attacks and Attack Geometry

An attack may target:

- A single hex
- A geometric area centered on a targeted hex

Examples:

- Single hex
- Line
- Circle

Only one unit can occupy each hex.

Exact attack-shape definitions and friendly-fire rules are TBD.

Unit abilities may modify attack geometry.

# 14. Combat Determinism

Combat must be 100% reproducible from a log.

The simulation must not rely on nondeterministic randomness.

Conceptually:

Battle Seed
+
Initial Battle State
+
Player Deployment
+
Unit/Pilot/Tech/Equipment State
=
Deterministic Battle Result

Every random event must use a seeded deterministic RNG.

Do not use unseeded Math.random() for simulation outcomes.

---

## 14.1 Battle Log

The combat simulator should generate a structured event log.

Example:

Battle Start
Seed: 481927

TU 0
  Unit A selects Unit X
  Unit B moves 4,5 → 4,6

TU 1
  Unit A fires
  Damage: 42
  Unit X HP: 58 → 16

TU 2
  Unit X fires
  Damage: 18
  Unit A HP: 100 → 82

The same initial state + seed must reproduce the same event sequence and final state.

This is a core technical requirement.

---

# 15. Combat Resolution Order

The exact TU phase order is TBD.

The implementation specification must eventually define an authoritative ordering for:

1. Start-of-TU effects
2. Movement decisions
3. Movement resolution
4. Attack eligibility
5. Attacks
6. Damage
7. Death/destruction
8. Event triggers
9. Cooldown updates
10. End-of-TU effects

This order must be deterministic.

---

# 16. Units

Units are the fundamental persistent combat objects.

A unit has:

- Base combat stats
- A combat role
- A defined Tech configuration
- Generic Equipment slots
- Optional pilot assignment
- Abilities that can modify normal combat behavior

A unit does NOT require a pilot to deploy.

A unit can have at most one pilot.

A pilot may use different units between Operations.

Pilot assignment happens before an Operation begins and commits the pilot to that unit for the entire Operation.

Pilots are represented entirely by the unit they are piloting during combat.

---

# 17. Unit Roles

Use the Guild Run role taxonomy as the current starting point.

---

## 17.1 Vanguard & Tank

Frontline holders designed to absorb damage and hold positions.

Typical characteristics:

- High HP / Armor
- Survivability
- Frontline positioning
- Damage mitigation
- Threat/control
- Potential damage-over-time effects

Guild Run references include Rowan, Pimenta, and Niklas.

---

## 17.2 Duelist & Assassin

Fast, aggressive damage dealers focused on eliminating individual targets.

Typical characteristics:

- High Damage
- High Attack Speed
- High Move Speed
- Strong single-target attacks
- Critical-hit mechanics
- Rewards for killing or damaging weakened enemies

Guild Run references include Tilly, Nyx, and Rip.

---

## 17.3 Mage & Mystic

Specialized offensive units focused on powerful attacks and battlefield effects.

Typical characteristics:

- AoE
- Attack geometry
- Elemental/status effects
- Burn/frost-style effects
- Scaling mechanics
- Less emphasis on raw durability

Guild Run references include Funke, Aria, and Ratna.

---

## 17.4 Support

Units focused on improving the effectiveness and survivability of other units.

Typical characteristics:

- Healing
- Buffs
- Defensive effects
- Revive/recovery mechanics
- Team utility

Guild Run reference includes Grace.

These are role identities, not rigid unit classes.

# 18. Unit Tech

Each unit has up to 3 Tech slots.

Tech slots represent specific technological systems, such as:

- Beam Weapon
- Targeting Computer
- Propulsion
- Armor
- Missile System
- Reactor

A unit's available Tech categories are determined by its design.

---

## 18.1 Tech Tiers

Each Tech has 3 tiers:

Tier 1 → Tier 2 → Tier 3

Power-Ups are category-specific.

- Tier 1 → Tier 2 requires 1 Power-Up.
- Tier 2 → Tier 3 requires 2 Power-Ups.
- Fully progressing a Tech from Tier 1 to Tier 3 requires 3 Power-Ups.

---

## 18.2 Tech Philosophy

### Tier 1 — Enhancement

Improves the unit's existing capability.

Examples:

- Damage
- Attack Speed
- HP
- Range
- Efficiency

### Tier 2 — Specialization

Pushes the unit toward a particular role or build.

Examples:

- Stronger beam attacks
- Long-range specialization
- Survivability
- AoE effectiveness
- Mobility

### Tier 3 — Maximum Potential

A major transformation.

Tier 3 may:

- Unlock a powerful ability.
- Dramatically alter an attack.
- Introduce a unique combat mechanic.
- Create pilot/unit interactions.
- Combine existing capabilities.
- Change behavior.

Tier 3 should generally feel like the unit reaching its intended Maximum Potential, not merely receiving a larger number.

Some units may have a specific victory/build condition associated with reaching Maximum Potential.

---

## 18.3 Tech Slots

Tech slots are generally fixed.

Rare Operation effects may grant a temporary additional Tech slot through:

- Operation decisions
- Rare shop purchases
- Other rare Operation effects

Temporary slots disappear at Operation end.

Maximum normal Tech slots: 3.

---

# 19. Power-Ups

A Power-Up is a run-specific resource associated with a specific Tech category.

Example:

Beam Weapon Power-Up

It can be used to advance a compatible unit's Beam Weapon Tech.

Power-Ups:

- Are purchased with Credits.
- Are temporary to the Operation.
- Are offered in the Shop.
- Do not directly change unit behavior except through the Tech they advance.
- Can be used on permanent units or temporary shop units if compatible.

The current shop offers 2 Power-Up choices.

Exact compatibility rules and Power-Up rarity are TBD.

---

# 20. Equipment

Units have 3 generic Equipment slots by default.

The number of Equipment slots can increase temporarily during an Operation.

Equipment slots are separate from Tech slots.

Equipment:

- Is temporary for the Operation.
- Is removed at Operation end.
- Modifies stats or performs effects based on defined events.
- Does not change fundamental unit behavior.

Examples of event triggers:

- OnDamage
- OnAttack
- OnDeath
- OnKill

Behavior changes belong to Tech/Power-Ups or unit/pilot abilities rather than Equipment.

The Shop currently offers 3 Equipment choices.

Exact Equipment pools and inventory rules are TBD.

---

# 21. Shop

The shop appears after every combat round.

The shop completely refreshes after every round.

Unsold offerings disappear.

### Equipment

3 Equipment choices.

### Power-Ups

2 Power-Up choices.

### Temporary Units

The shop may offer units for purchase.

Temporary shop units:

- Exist only for the current Operation.
- Are removed at Operation end.
- Cannot accept pilots.
- Can receive Equipment.
- Can receive compatible Tech Power-Ups.

### Reroll

The player can reroll the current shop for a small Credit fee.

Exact cost/scaling is TBD.

A reroll refreshes the current shop immediately.

# 22. Pilots

Pilots are named persistent characters.

Their purpose is to sharpen or alter a unit's role identity rather than simply provide generic stat bonuses.

A pilot provides:

- Role Affinity
- Mech Affinity
- Pilot ability/identity
- Persistent two-level/four-branch upgrade tree
- One Relic slot
- Personality/flavor dialogue
- Risk of incapacitation, injury, and permanent death

A pilot does not need to be assigned for a unit to deploy.

Maximum pilots per unit: 1.

Pilot assignment is made pre-Operation and is locked for that Operation.

A pilot can be assigned to different units in different Operations.

---

# 23. Pilot Role Affinity

Pilots have a graded Role Affinity.

The current role taxonomy is:

- Vanguard & Tank
- Duelist & Assassin
- Mage & Mystic
- Support

Role Affinity determines how strongly the pilot synergizes with a unit's combat role.

Affinity is not a hard requirement.

A pilot can be used outside their ideal role.

Higher affinity creates stronger synergy.

Exact grade scale and mechanical multipliers are TBD.

---

# 24. Pilot Mech Affinity

Pilots also have a graded Mech Affinity.

Mech Affinity determines how strongly a pilot synergizes with a particular unit/mech type.

Again, affinity is not a hard requirement.

The same pilot can be flexible across multiple units, while a strong affinity pairing represents a signature combination.

---

## 24.1 Combined Affinity

A pilot's effective synergy is influenced by both:

- Role Affinity
- Mech Affinity

Conceptual examples:

★★★★ Duelist
★★★★ Interceptor
= Strong signature pairing

★★★★ Duelist
★★ Interceptor
= Strong role fit, weaker mech fit

★★ Duelist
★★★★ Interceptor
= Strong mech fit, weaker role fit

★ Support
★ Interceptor
= Off-meta / experimental pairing

Exact numerical effects are TBD.

---

# 25. Pilot Upgrade Tree

Each pilot has a two-level, two-fork progression structure resulting in four possible end branches.

             Pilot
               |
          +----+----+
          |         |
          A         B
        /   \     /   \
       A1   A2   B1   B2

The player ultimately develops the pilot into one of four specialization endpoints.

The tree should sharpen or alter unit role identity, not simply provide generic numerical power.

Exact upgrade choices/effects for individual pilots are TBD.

---

# 26. Pilot Relics

Each pilot can equip 1 Relic.

A Relic:

- Adds a benefit to the pilot.
- Is separate from the pilot's upgrade tree.
- Can reinforce, complement, or occasionally counter the pilot's normal specialization.
- Is attached to the pilot rather than the unit.

Exact acquisition, permanence, and effect pool are TBD.

---

# 27. Pilot Incapacitation

When a unit with a pilot is destroyed during a combat round:

- The pilot gains 1 Incapacitation Point (IP).
- The earlier unit-overkill injury mechanic is removed.

A pilot has an incapacitation threshold of 5 IP.

When IP reaches 5, the pilot is removed from their unit for the remainder of the Operation.

The intended design is that a pilot can survive 3 of 8 rounds without being forced out.

---

# 28. Pilot Injuries

Pilots are NOT injured during the Operation.

At the end of the Operation:

- Accumulated IP increases the deterministic chance of injury.
- The injury roll is deterministic.
- A pilot can receive a maximum of 2 injuries from the Operation.
- Exact probability curve is TBD.

Injuries persist after the Operation.

Permanent death can eventually remove a pilot permanently.

The exact permanent-death threshold is TBD.

---

# 29. Pilot Fatigue

Pilots accumulate Fatigue Points based on:

- Number of actions performed
- Damage dealt

A pilot entering combat beyond a certain fatigue threshold receives debuffs.

Pilots recover Fatigue by not participating in missions.

Exact fatigue formulas, thresholds, and debuffs are TBD.

---

# 30. Pilot Recovery

Pilots recover from:

- Fatigue
- Injuries

by not participating in missions.

Post-round shops or decisions may provide opportunities to heal injuries during the Operation.

---

# 31. Pilot Dialogue

Pilots have full-color anime-style portraits.

During combat, pilots can produce combat flavor dialogue displayed alongside their portrait.

The presentation is inspired by the feel of Star Fox 64 combat chatter.

Dialogue should:

- Reinforce personality.
- React to combat events.
- Make named pilots feel alive.
- Remain readable without interrupting combat.

Exact dialogue trigger rules are TBD.

# 32. Persistent Progression

## AC

AC is the current name for the persistent meta-progression currency.

AC:

- Persists between Operations.
- Is NOT spent in the Operation Shop.
- Is NOT reset at Operation end.
- Is used for long-term progression.

AC currently purchases:

1. Pilot upgrades
2. Permanent unit acquisition/progression
3. Unlocking new content pools

Potential content unlocks include:

- New pilots
- New units
- New Equipment pools
- New Tech/Power-Up pools
- Other content that expands build possibilities

Ship progression is out of scope.

---

# 33. Upgrade Artifacts

For now, Upgrade Artifacts have a flat AC cost.

An Artifact:

- Costs a fixed amount of AC.
- Produces an upgrade result through the existing random upgrade system.
- Can result in an upgrade point for a pilot or unit.
- Artifact upgrading / variable costs are deferred.

Exact probability and targeting rules are TBD.

---

# 34. Operation Decisions

The Shop/Decision portion of an Operation can contain choices that affect either the current Operation or persistent/meta progression.

A decision may offer:

- Temporary buffs
- Temporary debuffs
- Equipment
- Other current-run benefits
- Sacrifices for meta rewards
- Persistent item acquisition
- Pilot removal for a meta reward
- NPC encounters
- Multi-Operation Contracts
- Other narrative/strategic opportunities

The important design principle is that some decisions deliberately trade current Operation performance for future value.

---

## Example: Persistent Item

Spend Credits to obtain an item that is retained after the Operation and delivered/used on another Operation.

---

## Example: Pilot Sacrifice

Leave a pilot at a decision point.

- Pilot becomes inaccessible for the remainder of the Operation.
- Player receives a persistent/meta reward after the Operation.

---

## Example: NPC Contract

Instead of using the normal shop opportunity, meet an NPC and receive a Contract Job.

The Contract may require objectives across multiple future Operations.

Example:

Meet NPC
  ↓
Receive Contract
  ↓
Operation 1 — Deliver cargo
  ↓
Operation 2 — Defeat specified enemies
  ↓
Operation 3 — Visit specified sector
  ↓
Complete Contract
  ↓
Persistent reward

Decision event content and exact presentation are TBD.

---

# 35. Persistent vs Temporary State

## Persistent

- Pilots
- Permanent units
- Pilot progression
- Pilot Relics, if confirmed persistent
- AC
- Unlocked content
- Contracts
- Galactic War state
- Other permanent/meta rewards

## Temporary / Operation-only

- Credits
- Equipment
- Tech Power-Ups
- Temporary Tech slots
- Temporary shop units
- Operation buffs/debuffs
- Operation-specific decisions/effects

This distinction should be explicit in the code/data model.

---

# 36. Visual Direction

The battlefield uses simple geometric representations inspired by Geometry Wars.

Units should be:

- Simple 2D geometric forms.
- Highly readable at mobile scale.
- Visually differentiated by silhouette/form.
- Enhanced heavily by particles and combat effects.

Units also have full-color icon badges.

Pilots have full-color anime-style portraits.

Major collectible objects can use a skeuomorphic trading-card visual language, including:

- Units
- Pilots
- Resources
- Potentially Equipment and Relics

The card presentation should make collecting, upgrading, and browsing the roster feel fun.

---

# 37. Combat Presentation

Although the underlying unit representation is simple geometry, combat should feel highly energetic.

Visual goals:

- Large beam weapons
- Missile salvos
- Missile trails
- Explosions
- Particle effects
- Impact effects
- Strong hit feedback
- Pilot portrait chatter
- Gundam/anime-inspired intensity

The visual style should make simple shapes feel powerful rather than attempting to model detailed 3D spacecraft/mecha.

# 38. Open Contracts

Players may have open Contracts given by NPCs.

Contracts contain specific objectives, such as:

- Complete a mission at a particular location
- Perform an objective in a specific sector
- Deliver something
- Defeat specified enemies
- Complete objectives across multiple Operations

Contracts are persistent/meta-level objectives.

Exact contract UI and progression rules are TBD.

---

# 39. Alliance Orders

Alliance Orders are shared objectives similar to Helldivers 2.

Example:

> Gain X Influence Points in a particular sector.

All players contribute to the same Alliance Order.

When an Alliance Order is completed:

- All players receive the associated bonus.

Exact reward structure and order cadence are TBD.

---

# 40. Deferred Ship System

The player's large ship is temporarily removed from the game design scope.

Do not implement:

- Ship progression
- Ship customization
- Ship abilities
- Ship inventory
- Launch Bay mechanics
- Ship management UI

The ship may remain as a future narrative/presentation concept.

Any previous ship-related rules are deferred, not deleted.

---

# 41. Technical Architecture

The implementation should separate the deterministic game simulation from rendering/UI.

Conceptual architecture:

                 GAME STATE
                     |
              DETERMINISTIC SIM
                     |
          +----------+----------+
          |                     |
      BATTLE LOG            FINAL STATE
          |
          ↓
     THREE.JS VIEW

The combat simulator should be able to run without Three.js.

This allows:

- Automated testing
- Replay
- Debugging
- Balance simulation
- Deterministic reproduction
- Future server validation if desired

Three.js should visualize state and events, not determine game logic.

---

# 42. Recommended Data Model

Exact schema is TBD, but these concepts should exist as separate data types.

## Unit

- id
- name
- role
- baseStats
- abilities
- techSlots[]
- equipmentSlots
- visualDefinition

## Pilot

- id
- name
- roleAffinity
- mechAffinity
- abilities
- upgradeState
- relic
- fatigue
- injuryState

## Tech

- category
- tier
- effects
- maximumPotential

## Equipment

- id
- name
- cost
- effects
- eventTriggers
- compatibility

## Power-Up

- id
- techCategory
- cost
- compatibility

## Battle State

- seed
- TU
- grid
- units
- effects
- eventLog

The simulator should operate on explicit state rather than hidden renderer state.

---

# 43. Recommended Development Stages

## Phase 1 — Deterministic Combat Simulator

Implement:

- Hex grid
- Unit state
- Movement
- Pathfinding
- Targeting
- Attacks
- Damage
- Armor
- HP
- Attack speed
- Move speed
- Range
- TU
- Death
- Battle timeout
- Seeded RNG
- Structured battle log

No Three.js dependency.

### Success criterion

Given the same initial state and seed, the simulator always produces exactly the same result/log.

---

## Phase 2 — Combat Visualization

Add Three.js:

- Hex grid
- Geometric units
- Movement animation
- Attack effects
- Beam effects
- Missiles
- Trails
- Explosions
- Damage numbers
- Basic camera
- Basic HUD

### Success criterion

The player can watch a deterministic battle and understand what is happening.

---

## Phase 3 — Deployment

Add:

- Preplaced enemies
- Player deployment
- Valid placement
- Unit inspection
- Range visualization
- Commit button

### Success criterion

The player can make a meaningful pre-combat positioning decision.

---

## Phase 4 — Pilots

Add:

- Named pilots
- Portraits
- Role affinities
- Mech affinities
- Pilot abilities
- Pilot/unit synergy
- Combat dialogue
- Incapacitation

### Success criterion

Changing the pilot materially changes how a unit plays.

---

## Phase 5 — Operation

Add:

- Multiple combat rounds
- Credits
- Shop
- Equipment
- Tech
- Power-Ups
- Temporary units
- Decisions
- Boss rounds
- Operation victory/defeat

### Success criterion

A complete Operation is playable and enjoyable in roughly 10 minutes or less.

---

## Phase 6 — Persistent Progression

Add:

- AC
- Upgrade Artifacts
- Pilot upgrade trees
- Permanent units
- Relics
- Content unlocks
- End-of-Operation injury resolution
- Pilot permadeath
- Fatigue/recovery

### Success criterion

Completing Operations creates meaningful long-term progression.

---

## Phase 7 — Galactic Layer

Add:

- Multiple planets
- Sectors
- Galactic Influence
- Alliance Orders
- Contracts
- Shared war state
- Multiple Operation choices

### Success criterion

The player has a compelling reason to choose where to go next.

---

# 44. Prototype Test Requirements

The AI implementation should include automated tests for deterministic combat.

## Determinism

Same:

Seed
+
Initial state
+
Deployment

must produce identical:

- Event log
- Final state
- Winner

## Target Persistence

Verify a unit keeps its target until the target becomes invalid.

## Target Re-selection

Verify a new target is selected deterministically when the previous target becomes invalid.

## Occupancy

Verify two units can never occupy the same hex.

## Movement

Verify pathfinding is deterministic and units route around blockers unless permitted to pass through them.

## Range

Verify units stop moving when their target is within valid ability range.

## Attack Geometry

Verify single-hex and shape-based attacks affect exactly the intended hexes.

## Pilot Incapacitation

Verify unit destruction adds exactly 1 IP to its pilot.

## Pilot Removal

Verify reaching the incapacitation threshold removes the pilot from the unit for the remainder of the Operation.

## Injury

Verify the end-of-Operation injury result is deterministic and never exceeds 2 injuries from the Operation.

## Temporary State

Verify Credits, Equipment, Tech progression, temporary units, and temporary slots are discarded at Operation end.

---

# 45. Explicitly Deferred / TBD

The following should remain open unless specifically resolved:

- Exact TU resolution order
- Move Speed formula
- Attack Speed formula
- Damage/Armor formula
- Minimum damage
- Attack cooldown implementation
- Target validity definition
- Targeting tie-breakers
- Pathfinding tie-breakers
- AoE friendly-fire rules
- Crit system
- Status-effect system
- Exact forced-round timeout damage
- Prototype deployment cap
- Unit roster and exact stats
- Exact pilot abilities
- Exact pilot affinity grade scale
- Affinity numerical multipliers
- Exact pilot upgrade choices
- Relic acquisition/effects
- Exact Tech categories/effects
- Exact Maximum Potential conditions
- Equipment pool structure
- Equipment pricing
- Power-Up pricing
- Temporary unit pricing
- Reroll pricing/scaling
- Shop generation/duplicate rules
- Decision event catalog
- Operation reward formulas
- Failure reward formulas
- Persistent AC income
- Artifact probability/targeting rules
- Contract details
- Alliance Order details
- Sector list
- Enemy faction list
- Planet securing consequences
- Boss designs
- Narrative
- Final UI
- Final art
- Final networking
- Ship

---

# 46. Rules for the Coding AI

When implementing Linear Space:

1. Do not silently invent unresolved game mechanics.
2. Mark assumptions clearly and isolate them in configuration/data.
3. Keep the deterministic simulation independent of rendering.
4. Never use nondeterministic randomness for combat outcomes.
5. Prefer data-driven definitions for units, pilots, Tech, Equipment, and effects.
6. Make balance values easy to edit without changing simulation code.
7. Keep temporary Operation state separate from persistent state.
8. Build automated deterministic replay tests early.
9. Build in stages rather than implementing the entire GDD at once.
10. When a design conflict is discovered, stop and flag it rather than silently choosing a rule.
11. Use placeholder visual assets when production art is unavailable.
12. Optimize for mobile-browser performance.
13. Do not implement the deferred ship system.
14. Do not add multiplayer synchronization; the Galactic War is asynchronous for the current design.
15. Preserve a structured battle log suitable for replay/debugging.

---

# 47. Current Core Design Statement

Linear Space is a mobile-browser, single-player roguelike autobattler where players travel across a shared galactic war, choose Operations, configure a squad of geometric spacecraft and mecha, assign named pilots with meaningful identities, and watch deterministic battles unfold.

During an Operation, players improvise builds through Equipment, Tech Power-Ups, temporary units, and difficult decisions.

Between Operations, they use persistent AC to develop pilots, units, and unlock new possibilities.

Pilots can become incapacitated, injured, or permanently die, creating emotional attachment and long-term consequences.

The shared Galactic War gives the player's individual Operations strategic meaning beyond their own progression.

The immediate development target is the deterministic combat simulator, followed by its Three.js visualization.
# LinearSpace — Prototype Proposal

## Prototype Goal

Build a small, playable vertical slice of LinearSpace that proves the core combat and progression loop before the full game is implemented.

The prototype should answer one question:

> Is deterministic, hex-grid, autonomous combat combined with meaningful unit/pilot builds fun enough to justify building the larger roguelike and Galactic War systems?

The prototype should prioritize:

1. Deterministic combat
2. Unit behavior
3. Hex-grid movement
4. Pilot/unit identity
5. Temporary Tech and Equipment builds
6. A small Operation loop
7. Clear combat presentation

The prototype should NOT attempt to implement the entire game.

---

# 1. Prototype Scope

The prototype consists of:

- One planet
- One Operation type
- Three combat rounds
- One enemy faction
- A small player unit roster
- A small pilot roster
- A small Tech pool
- A small Equipment pool
- A basic Shop
- Basic Operation decisions
- Deterministic combat
- Basic Operation-end resolution

The Galactic War exists only as a lightweight wrapper around the Operation.

The prototype does NOT need:

- Full Galactic War simulation
- Multiple sectors
- Multiple planets
- Contracts
- Alliance Orders
- Ship systems
- Full meta progression
- Large content libraries
- Multiplayer
- Production-quality art

---

# 2. Prototype Success Criteria

The prototype is successful if a player can:

1. Select an Operation.
2. Select and deploy units.
3. Assign pilots before the Operation.
4. Configure Equipment.
5. Start a deterministic battle.
6. Watch units move and fight autonomously.
7. Understand why units are targeting particular enemies.
8. Complete the battle.
9. Earn Credits.
10. Visit the Shop.
11. Purchase Equipment or Tech Power-Ups.
12. Improve units during the Operation.
13. Make a meaningful Operation decision.
14. Fight subsequent rounds.
15. Experience pilot incapacitation when appropriate.
16. Complete or fail the Operation.
17. See the resulting pilot/unit state.

The entire sequence should be playable without developer intervention.

# 3. Combat Prototype

Combat is the highest-priority system.

The prototype should use a deterministic simulation independent from the renderer.

---

## 3.1 Simulation

Implement:

- Hex grid
- Unit positions
- Unit occupancy
- HP
- Damage
- Armor
- Move Speed
- Attack Speed
- Attack Range
- Movement
- Pathfinding
- Target selection
- Target persistence
- Attacks
- Attack cooldowns
- Death
- Basic attack shapes
- TU simulation
- Deterministic RNG
- Combat event log

---

## 3.2 Time Units

Combat advances in Time Units (TU).

One TU represents one combat simulation tick.

TU is responsible for:

- Movement timing
- Attack timing
- Cooldowns
- Ordering operations
- Preventing double occupancy
- Resolving simultaneous events

Higher Move Speed means faster movement.

Higher Attack Speed means more frequent attacks.

The exact mathematical formulas should be implemented as configurable constants so they can be tuned without rewriting the simulation.

---

## 3.3 Movement

Units autonomously move toward their target.

A unit stops moving when its target is within the appropriate attack/ability range.

Units cannot move through other units unless they possess an ability that explicitly permits it.

Only one unit may occupy a hex.

Pathfinding must be deterministic.

---

## 3.4 Targeting

Default behavior:

> Target the closest valid enemy within attack range.

A unit keeps its current target until that target is no longer valid.

When the target becomes invalid, the unit selects a new target.

Target selection must have deterministic tie-breaking.

The prototype should support at least one alternate targeting behavior to prove that unit abilities can modify targeting.

Example:

> Target the weakest valid enemy within a specified range.

---

## 3.5 Attacks

The prototype should support:

### Single-target attack

A single hex is targeted.

### Line attack

A target hex is selected and a line of hexes is affected.

### Circle/AoE attack

A target hex is selected and all hexes within the defined radius are affected.

Attack geometry should be data-driven.

---

## 3.6 Combat Log

Every meaningful simulation event should be recorded.

Example:

TU 12
- Unit A begins movement
- Unit A moves from (3,4) to (4,4)

TU 13
- Unit A enters attack range
- Unit A attacks Unit X
- Damage = 18
- Unit X HP = 42 → 24

TU 14
- Unit X attacks Unit A
- Damage = 9
- Unit A HP = 100 → 91

The battle log must be sufficient to reproduce and debug the battle.

# 4. Determinism Requirement

This is a hard requirement.

Given:

- Battle seed
- Initial battle state
- Unit definitions
- Pilot definitions
- Tech
- Equipment
- Deployment positions

the simulator must always produce:

- The same sequence of events
- The same final state
- The same winner

No combat result may depend on:

- System time
- Frame rate
- Rendering order
- Network timing
- Unseeded randomness
- JavaScript object iteration order
- Other nondeterministic behavior

The renderer must consume simulation results rather than influence them.

---

# 5. Deterministic Replay

The prototype should support:

Initial State
+
Seed
+
Battle Configuration
↓
Simulation
↓
Battle Log
↓
Final State

A replay test should be able to run the same battle multiple times and assert that the output is identical.

This should be implemented early, not added later.

---

# 6. Prototype Units

Start with approximately 4–6 player unit types.

The roster should represent distinct roles rather than minor stat variations.

Recommended initial roles:

- Vanguard/Tank
- Duelist/Assassin
- Mage/Mystic
- Support

Some roles may have multiple units.

Each unit should have:

- Name
- Role
- Base stats
- Attack type
- Attack geometry
- Abilities
- Compatible Tech categories
- Visual identity

---

# 7. Prototype Enemy Roster

Use one enemy faction.

Create enough enemy units to test:

- Melee threats
- Ranged threats
- Fast units
- Durable units
- AoE threats

Approximately 4–6 enemy unit types are sufficient.

Enemy behavior should use the same deterministic simulation framework as player units.

# 8. Pilots

Implement approximately 6–10 pilots.

Pilots should have:

- Name
- Portrait placeholder
- Role Affinity
- Mech Affinity
- Pilot ability
- Two-level/two-fork upgrade tree
- Relic slot
- Incapacitation state

Pilot assignment happens before the Operation.

A unit does not require a pilot.

A unit can have at most one pilot.

A pilot is committed to their assigned unit for the entire Operation.

---

# 9. Pilot Affinity

Use graded affinities.

Each pilot has:

- Role Affinity
- Mech Affinity

Role Affinity should correspond to:

- Vanguard/Tank
- Duelist/Assassin
- Mage/Mystic
- Support

The prototype does not need the final affinity system.

It only needs to demonstrate that affinity meaningfully changes the effectiveness or behavior of a pilot/unit pairing.

---

# 10. Pilot Identity

The most important pilot design principle:

> A pilot should sharpen or alter a unit's role identity.

Avoid making pilots feel like generic stat sticks.

Examples:

A Tank pilot might:

- Become better at holding the frontline.
- Encourage enemies to attack the unit.
- Improve survivability when surrounded.

A Duelist pilot might:

- Improve target selection.
- Reward attacking isolated enemies.
- Improve finishing weakened targets.

A Mage pilot might:

- Improve AoE geometry.
- Increase status effects.
- Alter attack patterns.

A Support pilot might:

- Improve healing.
- Improve buffs.
- Create defensive reactions.

The prototype should contain enough examples to prove this design philosophy.

---

# 11. Pilot Upgrade Tree

Each prototype pilot has a two-level/two-fork tree.

Example:

                Pilot
                  |
          +-------+-------+
          |               |
       Branch A        Branch B
        /    \          /    \
      A1      A2      B1      B2

The four endpoints should represent meaningfully different versions of the pilot.

The prototype does not need a large number of upgrades.

It needs enough to prove that the system can create distinct pilot builds.

---

# 12. Pilot Incapacitation

When a unit with a pilot is destroyed:

- Pilot gains 1 Incapacitation Point.
- Incapacitation Threshold = 5.

When the pilot reaches 5 IP:

- Pilot is removed from the unit.
- Pilot cannot return to combat during the remainder of the Operation.

Pilots are not injured during individual rounds.

At Operation end:

- IP is used to determine injury risk.
- The injury calculation is deterministic.
- Maximum injuries from one Operation = 2.

The prototype should include at least one test scenario that demonstrates this system.

# 13. Tech

Each unit has up to 3 Tech slots.

Prototype units should have 2–3 compatible Tech categories.

Example categories:

- Beam Weapon
- Targeting Computer
- Armor
- Propulsion

Each Tech has:

Tier 1
→ Tier 2
→ Tier 3

Tier 2 requires 1 Power-Up from Tier 1.

Tier 3 requires 2 Power-Ups from Tier 2.

Tech should be capable of changing unit behavior at higher tiers.

---

# 14. Equipment

Units begin with 3 generic Equipment slots.

Equipment:

- Modifies stats
- Or reacts to combat events
- Does not fundamentally change behavior

Example:

+10 Armor

OnDamage:
Gain +5% Attack Speed for 2 TU

Equipment is temporary and disappears at Operation end.

The prototype should contain approximately 6–10 Equipment items.

---

# 15. Power-Ups

Power-Ups are associated with a specific Tech category.

Example:

Beam Weapon Power-Up

A Beam Weapon Power-Up can only advance compatible Beam Weapon Tech.

Power-Ups are purchased using temporary Operation Credits.

They disappear at Operation end.

---

# 16. Shop

The Shop refreshes after every round.

Each Shop contains:

- 3 Equipment choices
- 2 Power-Up choices
- Temporary unit opportunities
- Reroll option

Rerolling costs a small amount of Credits.

Shop offerings should be generated deterministically from the Operation seed.

This is important for replay/debugging.

---

# 17. Temporary Units

The Shop may sell temporary units.

Purchased temporary units:

- Can participate in the current Operation.
- Can receive compatible Equipment.
- Can receive compatible Power-Ups.
- Cannot receive pilots.
- Disappear at Operation end.

Temporary units exist partly to allow the player to experiment with Tech categories that their starting roster cannot normally use.

# 18. Prototype Operation

The prototype Operation contains 3 combat rounds.

Recommended structure:

Round 1
↓
Shop
↓
Decision
↓
Round 2
↓
Shop
↓
Decision
↓
Round 3 / Boss
↓
Operation Resolution

The exact placement of Shop and Decision screens can be tuned during development.

---

# 19. Operation Credits

Credits are temporary.

At Operation start:

Credits = 0

Credits are earned from combat and potentially decisions.

Credits can be spent on:

- Equipment
- Tech Power-Ups
- Temporary units
- Shop rerolls

Credits disappear when the Operation ends.

---

# 20. Decisions

The prototype should contain a small pool of decisions.

Decisions should demonstrate the central tradeoff:

> Sacrifice some current Operation strength for future value.

Example:

### Persistent Item

Spend Credits to obtain an item that survives the Operation.

### Pilot Sacrifice

Leave a pilot behind.

The pilot becomes unavailable for the remainder of the Operation.

In exchange, the player receives a persistent/meta reward after the Operation.

### NPC Contract

Meet an NPC instead of using a normal opportunity.

Receive a Contract requiring objectives across future Operations.

The prototype can simplify the persistent reward implementation.

The purpose is to prove the decision structure, not build the complete meta system.

---

# 21. Operation Rewards

The prototype should have simple rewards.

On victory:

- Receive AC
- Receive Influence
- Resolve pilot injuries
- Save appropriate persistent progression

On defeat:

- Operation ends
- Temporary state is discarded
- Persistent consequences are resolved according to prototype rules

Exact reward amounts are placeholders.

---

# 22. Persistent Progression

Full meta progression is deferred.

The prototype only needs enough persistence to prove that Operations matter beyond the current run.

Implement:

- AC
- Basic pilot progression
- Basic permanent unlock
- Basic persistent reward

Do not implement the complete eventual progression system yet.

# 23. Recommended Build Order

The AI should build the prototype in the following order.

---

## Stage 1 — Simulation Core

Build the deterministic simulation without graphics.

Implement:

- Hex grid
- Unit state
- Movement
- Occupancy
- Pathfinding
- Targeting
- Target persistence
- Attacks
- Damage
- HP
- Armor
- TU
- Attack Speed
- Move Speed
- Attack Range
- Death
- Seeded RNG
- Battle log

Create automated tests before adding presentation.

---

## Stage 2 — Minimal Combat UI

Add a basic visual battlefield.

Use placeholder geometric graphics.

Display:

- Hex grid
- Units
- HP
- Target
- Movement
- Attacks
- Damage
- TU
- Battle result

The UI does not need to look polished.

It needs to make the simulation understandable.

---

## Stage 3 — Deployment

Implement:

- Player deployment
- Enemy deployment
- Valid placement
- One-unit-per-hex validation
- Deployment preview
- Commit button

The player must be able to reposition units before committing.

---

## Stage 4 — Unit Abilities

Add:

- Alternate targeting
- Attack shapes
- Movement exceptions
- Several behavior-changing abilities

This validates that the simulation architecture supports units with substantially different behavior.

---

## Stage 5 — Pilots

Add:

- Pilot roster
- Role Affinity
- Mech Affinity
- Pilot abilities
- Pilot upgrade trees
- Pilot assignment
- Incapacitation

Test that pilots genuinely change unit behavior.

---

## Stage 6 — Tech & Equipment

Add:

- Tech slots
- Tech tiers
- Power-Ups
- Equipment
- Equipment slots
- Temporary build state

Verify that temporary state can be cleanly reset.

---

## Stage 7 — Operation

Add:

- 3 rounds
- Credits
- Shop
- Rerolls
- Temporary units
- Decisions
- Boss
- Operation completion

At this point the prototype should be playable from beginning to end.

---

## Stage 8 — Persistence

Add:

- AC
- Pilot persistence
- Injuries
- Basic progression
- Basic persistent rewards

---

# 24. Acceptance Tests

## Determinism

Run the same battle 100 times.

Expected:

100 identical event logs
100 identical final states
100 identical winners

---

## Target Persistence

Create a battle where:

- Unit A targets Unit B.
- Unit C becomes closer.

Expected:

Unit A continues targeting Unit B until Unit B becomes invalid.

---

## Target Re-selection

Destroy Unit B.

Expected:

Unit A deterministically selects the next valid target.

---

## Movement

Place an obstacle between a unit and its target.

Expected:

The unit navigates around the obstacle.

---

## Occupancy

Create two units attempting to enter the same hex during the same TU.

Expected:

Only one unit occupies the hex after resolution.

The winner must be determined by the deterministic resolution rules.

---

## Range

Place a unit outside attack range.

Expected:

It approaches its target.

Once the target enters valid attack range:

Expected:

The unit stops moving and attacks.

# 25. Acceptance Tests Continued

## Attack Geometry

Test:

- Single hex
- Line
- Circle

Expected:

Exactly the correct hexes are affected.

---

## Pilot Incapacitation

Destroy a piloted unit.

Expected:

Pilot IP += 1

Destroy enough piloted units to reach:

IP = 5

Expected:

Pilot is removed from combat for the remainder of the Operation.

---

## Pilot Injury

End an Operation with a pilot who has IP.

Expected:

The injury result is deterministic.

Run the same Operation again.

Expected:

The same injury result occurs.

Never produce more than 2 injuries from one Operation.

---

## Temporary State

Purchase:

- Equipment
- Power-Ups
- Temporary unit
- Temporary Tech slot

Complete the Operation.

Expected:

All temporary state is discarded.

Persistent state remains.

---

## Shop Determinism

Given the same Operation seed and same sequence of actions:

Expected:

The same Shop offerings appear.

---

# 26. Definition of Done

The prototype is ready for playtesting when:

- A complete 3-round Operation can be played.
- Combat is fully deterministic.
- Battles can be replayed from a seed/log.
- Units move and target autonomously.
- Different unit roles feel different.
- Pilots meaningfully alter units.
- Tech creates different builds.
- Equipment creates meaningful temporary modifications.
- Shop choices create decisions.
- At least one Operation decision creates a meaningful tradeoff.
- Pilot incapacitation works.
- Operation-end injury resolution works.
- Temporary and persistent state are correctly separated.
- The player can complete or fail an Operation without developer intervention.

---

# 27. Explicit Non-Goals

Do NOT build these during the initial prototype:

- Player ship
- Launch Bays
- Multiplayer
- Networking
- Full Galactic War
- Multiple sectors
- Multiple planets
- Alliance Orders
- Full Contracts
- Large-scale procedural content generation
- Production art
- Full narrative
- Voice acting
- Large pilot roster
- Large unit roster
- Full meta progression
- Monetization
- Account systems

The purpose of the prototype is to validate the combat and Operation loop.

---

# 28. Guiding Principle

Build the smallest version that can answer:

> "Is it fun to configure a small group of pilots and machines, commit them to a deterministic battle, watch their personalities and builds express themselves through autonomous combat, then make increasingly difficult decisions about how to improve the squad?"

If the answer is yes, expand the game.

If the answer is no, fix the core before adding more content.
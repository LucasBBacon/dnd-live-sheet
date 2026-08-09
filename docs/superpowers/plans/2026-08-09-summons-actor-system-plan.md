# Summons actor system implementation plan

## Goal

Implement summons as a first-class actor system so a summoned creature is treated as a player-controlled actor with its own runtime state, action availability, and UI presentation. The initial implementation should stay scoped to embedded actor instances owned by the current character, while keeping the design general enough to support future standalone actor sheets.

## Guiding principle

Treat summons as actors from the start. The current summon work already proves that the engine can create temporary effects and states; the missing piece is to make those effects resolve into live actor instances that the sheet and UI can reason about.

## Scope and architecture

### 1. Shared actor contract

Introduce a shared actor model that the engine, shared schemas, and UI can all consume.

#### Add shared schema concepts
- Actor blueprint
  - stable template id
  - display label
  - base states / conditions
  - authored actions
  - optional combat profile / stat block
  - controller rules
- Actor instance
  - owner character id
  - template id
  - controller
  - display label
  - current states
  - lifecycle state (active, dismissed, expired)
  - available actions

#### Why this matters
This creates one vocabulary for summonable creatures, player-controlled companions, and future actor types.

### 2. Static dictionary definitions for summons

Replace the current ad-hoc summon state handling with authored summon blueprints.

#### Deliverables
- Add a summon blueprint registry under the engine rule layer.
- Define initial blueprints for the existing examples such as:
  - clockwork toy
  - fire starter
  - music box
- Each blueprint should expose:
  - identity and label
  - default states
  - optional stats / combat profile
  - authored actions the actor can perform

#### Rule-layer changes
- The trait dictionary should remain the entry point that grants the summon action.
- The summon action should resolve to a blueprint-backed instantiation rather than only emitting entity-template states.

### 3. Runtime actor instantiation

When a summon action executes, create a live actor instance instead of only adding temporary states.

#### Runtime behavior
- Create an actor instance with:
  - owner reference
  - template id
  - controller = player
  - initial state from the blueprint
- Attach the instance to the owning character’s runtime context.
- Track lifecycle events:
  - created
  - active
  - dismissed
  - expired
  - cleaned up

#### Implementation seam
- Keep the current effect manager for transient effects, but add an actor collection or actor manager that owns these instances.
- The summon effect should become the creation trigger, while the actor instance carries the long-lived runtime state.

### 4. Actor-aware action resolution

The engine should be able to resolve actions for either the owner character or any active actor instance.

#### Requirements
- Provide an action-resolution path that accepts a context actor.
- Resolve that actor’s available actions from the same rule pipeline.
- Ensure the action system can distinguish:
  - owner character actions
  - actor actions

#### Player-control model
The actor runtime should explicitly mark whether an actor is controlled by the player. That allows the UI to request actions for that actor without special-casing summon types.

### 5. Live-sheet exposure of active actors

Expose the current actor roster on the live sheet so the UI can present it meaningfully.

#### Sheet output additions
Add a field such as:
- activeActors

Each actor entry should include:
- template id
- display label
- controller
- lifecycle / status summary
- available actions
- basic combat / state summary

#### Design note
Keep the current summon list as a lightweight view model if needed, but make it rich enough for the UI to render and select actors.

### 6. UI support for actor selection and actions

The web UI should let the player select an active actor and see that actor’s possible actions.

#### UI flow
1. Render an actor roster or summon panel in the sheet or combat view.
2. Let the player select one active actor.
3. Show the selected actor’s available actions in the action panel.
4. When the player executes an action from the selected actor, resolve it using the actor as the action context.

#### Interaction goals
- The user should be able to tell which summons are active.
- The user should be able to understand what each summon can do.
- The player should not need to think in terms of “special summon action”; they should simply choose an actor and its actions.

### 7. Persistence and server seam

For the first implementation, keep summons as session-runtime state owned by the current character.

#### Initial decision
- Do not make persistence a blocking requirement for the first meaningful implementation.
- Keep this as a future extension if the app later supports multi-actor state across reloads.

#### If action execution is server-driven
- Add actor-aware action events so the server can resolve actions for a selected actor.
- Keep the payload contract narrow and actor-specific.

### 8. Testing plan

Add tests around the full path from summon creation to UI-facing action availability.

#### Engine tests
- summon blueprint resolution
- actor instance creation
- lifecycle dismissal and expiration
- actor-specific action availability

#### Sheet tests
- live-sheet exposes active actors
- actor action list is included in the sheet payload

#### UI tests
- actor selection renders correctly
- chosen actor shows the right action list
- action execution uses the actor context

## Implementation order

1. Shared actor schema and types
2. Summon blueprint definitions in the rule layer
3. Runtime actor instantiation and lifecycle tracking
4. Live-sheet exposure of active actors
5. Action resolution for actor-specific contexts
6. UI actor roster and action selection
7. End-to-end verification and polish

## Files to touch

- [packages/shared/src/schemas/actions.ts](packages/shared/src/schemas/actions.ts)
- [packages/engine/src/calculators/effects.ts](packages/engine/src/calculators/effects.ts)
- [packages/engine/src/pipeline/actionResolver.ts](packages/engine/src/pipeline/actionResolver.ts)
- [packages/engine/src/pipeline/characterEngine.ts](packages/engine/src/pipeline/characterEngine.ts)
- [packages/engine/src/rules/traits/gnomeDictionary.ts](packages/engine/src/rules/traits/gnomeDictionary.ts)
- [apps/web/src](apps/web/src)

## Success criteria

The feature is meaningfully implemented when:
- a summon creates a live actor instance
- the sheet exposes that actor to the UI
- the UI can show the actor’s available actions
- the player can execute actions from that actor through the same action system used by the character

## Notes

The first version should not attempt full standalone creature sheets or a full combat subsystem. The goal is to establish a reusable actor runtime that can support summons well and make future expansion straightforward.

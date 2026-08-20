# Feral Instinct, and Modelling Surprise

Date: 2026-08-20
Status: Implemented (both slices)
Owner: Claude pair session

## Goal

Author the barbarian's Feral Instinct:

> By 7th level, your instincts are so honed that you have advantage on
> initiative rolls. Additionally, if you are surprised at the beginning of
> combat and aren't incapacitated, you can act normally on your first turn, but
> only if you enter your rage before doing anything else on that turn.

## The Critique That Shaped This

The first half was six lines: `derivedStats` already reads `type: "advantage"`
on `INITIATIVE`, so nothing in the engine had to change.

The second half was the real work, and the reason is worth stating plainly:

**Feral Instinct's surprise clause is not a buff. It is an exemption from a
penalty the engine never applied.** Nothing in this codebase modelled surprise -
`surprised` is not in `CONDITION_MAP` (correctly; it is not a condition in 5e),
nothing emitted it, and its one appearance in the repository was an invented
string in a `derivedStats` test fixture.

Implementing the exemption alone would therefore have produced a trait that
looked implemented and did exactly nothing, because a surprised barbarian was
never stopped from acting in the first place. That is the inverse of the
`maxDexCap` trap from Fast Movement: instead of quietly paying out, it quietly
pays nothing.

So there were only two coherent options - model surprise, or author the clause
as honest unenforced text. "Just the exemption" was never on the table.

## Why Surprise Fits

| RAW restriction | Engine |
| --- | --- |
| No action on your first turn | `economy.actionAvailable` - exists |
| No reaction until that turn ends | `economy.reactionAvailable` - exists |
| No movement | Not modelled for anyone. A uniform existing gap, not a new one |
| Bonus action - *not* restricted | Nothing to do |

That last row is the whole reason the trait functions: Rage is a `bonus_action`
in the pack, so a surprised barbarian can still rage, and raging is what unlocks
the turn. The rule is self-consistent with the machinery already present.

## Design

**Surprise lives on `CombatContext`, not in conditions.** It does not persist
and the player never clears it by hand - it expires when their first turn ends.
`surprised: boolean` on the schema, `setSurprised()` on the manager, retired by
player `endTurn` and by `endCombat`. That is literally "until that turn ends".

**The trait grants a state, not a special case.** `trait_feral_instinct` grants
`status_feral_instinct`, following the Reckless Attack precedent where the half
the engine cannot roll became a state the sheet surfaces. Nothing downstream
needs to know a trait id.

**A pure reporter**, `SurpriseEngine` in `calculators/surprise.ts`, alongside
`speed.ts` and `encumbrance.ts`. It takes the surprise flag and the active
states and returns one of four outcomes with the line to show:

| Situation | Outcome |
| --- | --- |
| Not surprised | `not_surprised` - silent |
| Surprised, no Feral Instinct | `restricted` |
| Surprised + `incapacitated` | `restricted`, trait withheld |
| Surprised + Feral Instinct, not raging | `release_available` |
| Surprised + Feral Instinct, raging | `released` |

**Reported, never enforced.** The economy runs a `"track"` policy and A6 was
closed as a warning rather than a block. Surprise follows: the banner says what
the rule costs, the turn buttons and economy pills stay exactly as live as they
were. A test pins that the buttons are never disabled while surprised.

**The initiative half is deliberately ungated on `incapacitated`.** RAW attaches
that condition to the surprise sentence only.

## Deliberately Not Automated

**"Before doing anything else on that turn" is a rider, not a rule.** Under
track-never-block the player is never stopped from acting first, so an ordering
violation is unobservable in practice; hooking every economy spend path to
timestamp it would build machinery that only ever agrees with itself. It is
stated in `implementation.summary` instead, the way Danger Sense carries
"against effects that you can see".

**Raging is read from `status_raging`, not from `spentBonusActionSourceId`.**
This keeps the calculator free of any knowledge of action ids and uses the same
vocabulary every other rage-gated rule already uses. The cost: a character who
was *already* raging when combat began reads as having entered it. Given the
ordering rider is unpoliced anyway, that is consistent rather than a new gap.

## The Defect Found While Verifying

The design claimed the server would need no change, because
`runtime.combatContext.getContext()` serialises the whole context. That much was
true. But checking it surfaced a real bug in the client:

`syncRemoteTurnResolution` replaced `combatContext` wholesale from the server
payload. Since `setSurprised` is local and the server is never told about
surprise, the server's copy is always `false` - so the first turn the player
took would wipe the declaration and the feature would never fire in real use.

The fix follows the precedent already documented three lines above it, where
conditions and base states are composed back in because "they are the player's,
not the server's". Surprise is the same category, so it is preserved across the
sync, and the client retires it in its own `endTurn`.

Two failing tests pin both halves.

## Result

| Suite | Before | After |
| --- | --- | --- |
| `@project/shared` | 187 passed | 187 passed |
| `@project/engine` | 690 passed | **702 passed** |
| `@project/database` | 89 passed | 89 passed |
| `@project/server` | 1 failed / 302 | 1 failed / 302 |
| `@project/web` | 3 failed / 264 | 3 failed / **277** |

Typecheck passes across all five packages, hygiene passes, eslint is clean. The
four remaining failures are the pre-existing ones awaiting the server and web
pack wiring; none are new.

## Follow-Ups

- **Surprise is client-only.** If a second client ever attaches to the same
  character, they will not see the declaration. Making it authoritative means a
  socket event and a gateway handler - deferred rather than smuggled into this
  slice, and worth folding into the gateway pass.
- **Movement is still unmodelled**, so the third of surprise's three
  restrictions stays the table's business.
- **`beginCombat` and `endCombat` have no UI caller.** Combat starts implicitly
  through `beginTurn` and the reaction window. The surprise toggle therefore
  sits in `TurnControlsWidget` beside the consequence rather than hanging off a
  combat-start flow that does not exist.

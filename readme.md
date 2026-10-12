Three Eight System - v2

How to invoke a roll
// Directly on an item
const skill = actor.items.getName("Firearms");
await skill.rollSkill({ tn: 12, difficulty: "Difficult" });

// Via the dialog (from a macro)
const skill = actor.items.getName("Firearms");
await game.threeEightV2.promptSkillRoll(skill);

// From a sheet's click handler
html.find("[data-action='roll-skill']").on("click", async (event) => {
  const itemId = event.currentTarget.dataset.itemId;
  const item = this.actor.items.get(itemId);
  if (item) await game.threeEightV2.promptSkillRoll(item);
});


| Actor                  | Primary                                | Secondary                      | Wounds                | Effort                       | Token bar 1 | Initiative        |
| ---------------------- | -------------------------------------- | ------------------------------ | --------------------- | ---------------------------- | ----------- | ----------------- |
| **PC**                 | Fitness, Agility, Intelligence, Morale | Experience, Reputation, Wealth | **Derived** = Fitness | **Derived** = avg↑(Fit, Mor) | `wounds`    | `2d8 + agilityDM` |
| **NPC**                | Fitness, Agility, Intelligence, Morale | —                              | **Derived** = Fitness | **Derived** = avg↑(Fit, Mor) | `wounds`    | `2d8 + agilityDM` |
| **Animal**             | Fitness, Agility, Intelligence, Morale | —                              | **Derived** = Fitness | **Derived** = avg↑(Fit, Mor) | `wounds`    | `2d8 + agilityDM` |
| **SmallVehicle**       | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |
| **LargeVehicle**       | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |
| **Drone**              | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |
| **Server**             | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |
| **Faction**            | Morale                                 | Experience, Reputation, Wealth | **Manual**            | **Manual**                   | `wounds`    | `2d8`             |
| **Base of Operations** | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |

When I build the sheet, the two buttons only need three calls:

// Enable / disable on render
const canSlow = game.threeEightV2.action.canDeclare(this.actor, "slow");
const canFast = game.threeEightV2.action.canDeclare(this.actor, "fast");

// Slow button click
try {
  await game.threeEightV2.action.declareAction(this.actor, "slow", {
    action: { name: "Aim", description: "<p>Steady your shot.</p>",
              requisite: "Ranged weapon", isAttack: false }
  });
} catch (err) {
  if (err instanceof game.threeEightV2.action.Error) ui.notifications.warn(err.message);
  else throw err;
}

// Fast button click — first action of the round, double-fast requested
await game.threeEightV2.action.declareAction(this.actor, "fast", {
  doubleFast: true,
  action: { name: "Snap Shot", description: "<p>Fire from the hip.</p>",
            requisite: "Loaded weapon", isAttack: true }
});

That last call consumes the first of two fast slots and posts a chat card. Because isAttack is true, it also fires Hooks.callAll("threeEightV2.declareAttack", actor, action, "fast"), which any future attack-resolution module can subscribe to.

---
Every isAttack: true action, regardless of economy, ends up here:
javascript

await game.threeEightV2.attack.request(actor, action, {
  economy: "slow" | "fast" | "reactive",
  weapon:  Item | null,
  target:  Token | null
});

Add this hook registration alongside the existing combatStart/combatRound handlers — conditions tick before the action economy resets, so the ordering matches end-of-round semantics:
javascript

/* ── End-of-round condition tick ────────────────────────
   Fires before the action economy reset on the same events
   so ongoing effects land first. Order matters: register
   this listener before the action-economy listener. */
Hooks.on("combatRound", (combat) => Conditions.onCombatRound(combat));

Applying a condition
javascript

// From the eventual sheet handler, a macro, or an end-of-turn effect
await game.threeEightV2.condition.apply(actor, "burning");

If burning isn't legal on the actor's type, an ConditionError is thrown with a localized message and nothing is stored. If it is legal and already present, its stacks increment by 1. Otherwise a fresh entry is created with stacks: 1.
Increasing / decreasing stacks
javascript

await game.threeEightV2.condition.increment(actor, "burning", 2); // +2 stacks
await game.threeEightV2.condition.decrement(actor, "burning", 1); // -1 stack
// decrementing past zero removes the condition entirely

Toggling
javascript

await game.threeEightV2.condition.toggle(actor, "burning");        // flip
await game.threeEightV2.condition.toggle(actor, "burning", false); // force off

A toggled-off condition keeps its stacks and remains visible on the sheet — it just stops contributing modifiers and is skipped during the tick.
Continuous modifier contribution

Every time prepareDerivedData runs on the actor, computeActorContributions walks:

    Modifier-Type items (multiplier ×1).

    Active conditions (multiplier × stacks).

So a Burning condition with 2 stacks carrying { target: "wounds", operator: "-", value: 2 } adds -4 to the wounds path in the contribution map. The derived wound total — and any characteristic DM that flows off it — reflects that immediately, with no other code changes.
End-of-round tick

On combatRound, every combatant's active conditions fire threeEightV2.conditionTick. A future damage module hooks in:
javascript

Hooks.on("threeEightV2.conditionTick", (actor, active) => {
  for (const entry of active) {
    if (entry.key === "burning") {
      // entry.stacks × the modifier value = damage to apply
    }
  }
});

Nothing mutates on tick today, which is what you asked for — the signal and the data are the two things the eventual condition list needs.
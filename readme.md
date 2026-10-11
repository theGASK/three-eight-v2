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
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
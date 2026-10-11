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
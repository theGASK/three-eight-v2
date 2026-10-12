export class ThreeEightActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["three-eight-v2", "sheet", "actor"],
      template: "systems/three-eight-v2/templates/actor-sheet.hbs",
      width: 600,
      height: 600
    });
  }
}
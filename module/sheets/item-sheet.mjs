// module/sheets/item-sheet.mjs
export class ThreeEightItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["three-eight-v2", "sheet", "item"],
      template: "systems/three-eight-v2/templates/item-sheet.hbs",
      width: 520,
      height: 480
    });
  }
}
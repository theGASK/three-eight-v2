const { StringField, NumberField, ArrayField } = foundry.data.fields;

/**
 * A single modifier instruction.
 *
 * Shared by Modifier-Type items (mod / power / quality / flaw /
 * ammunition / disease) and by Conditions. Targets are resolved
 * against the container document's `system` object, e.g.
 * "attributes.primary.fitness", "attributes.secondary.reputation",
 * "damage" (for a Weapon item). See `modifier.mjs` for validation
 * and application.
 */
export class ModifierRule extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      container: new StringField({
        required: true,
        choices: ["actor", "item"],
        initial: "actor"
      }),
      // Actor types or item types this rule applies to.
      // Empty array means "any type allowed by the container".
      appliesTo: new ArrayField(new StringField(), { initial: [] }),
      // Path within the container's `system` object.
      target: new StringField({ required: true, blank: false, initial: "" }),
      operator: new StringField({
        required: true,
        choices: ["+", "-"],
        initial: "+"
      }),
      value: new NumberField({ required: true, integer: true, initial: 0 })
    };
  }

  /** Plain-object snapshot. */
  toPlain() {
    return {
      container: this.container,
      appliesTo: Array.from(this.appliesTo ?? []),
      target:    this.target,
      operator:  this.operator,
      value:     this.value
    };
  }
}
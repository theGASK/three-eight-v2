/**
 * Catalog of Conditions.
 *
 * A Condition is a predefined state an Actor can carry. It has:
 *   key           — stable identifier used in `system.conditions`
 *   name          — fallback display name
 *   description   — fallback rich-text body
 *   legalTargets  — array of Actor types this condition may apply to
 *   modifiers     — ModifierRule entries, applied × stacks
 *
 * The catalog is intentionally empty for now. When conditions are
 * authored, add them here following the shape below; every function
 * in `conditions.mjs` reads from this list.
 *
 * Example entry (kept for reference, not active):
 *
 *   {
 *     key: "burning",
 *     name: "Burning",
 *     description: "<p>You are on fire.</p>",
 *     legalTargets: ["pc", "npc", "animal"],
 *     modifiers: [{
 *       container: "actor",
 *       appliesTo: ["pc", "npc", "animal"],
 *       target: "wounds",
 *       operator: "-",
 *       value: 2
 *     }]
 *   }
 */

/** @type {ReadonlyArray<object>} */
export const CONDITIONS = Object.freeze([
  // Empty for now — populated when the condition list is provided.
]);

/** Flat lookup: key → condition definition. */
export const CONDITIONS_BY_KEY = Object.freeze(
  Object.fromEntries(CONDITIONS.map(c => [c.key, c]))
);

/** @returns {object|undefined} */
export function getConditionDefinition(key) {
  return CONDITIONS_BY_KEY[key];
}

/** @returns {boolean} */
export function hasConditionDefinition(key) {
  return Object.prototype.hasOwnProperty.call(CONDITIONS_BY_KEY, key);
}

/**
 * Turn a catalog entry into a plain object suitable for storing on an
 * actor. Falls back to the entry's own `name` / `description` if no
 * i18n key is defined.
 *
 * @param {object} entry  A CONDITION entry.
 * @returns {{
 *   key: string,
 *   name: string,
 *   description: string,
 *   legalTargets: string[],
 *   modifiers: object[]
 * }}
 */
export function resolveConditionDefinition(entry) {
  const nameKey = `THREEEIGHT.Conditions.${entry.key}.name`;
  const descKey = `THREEEIGHT.Conditions.${entry.key}.description`;
  return {
    key:          entry.key,
    name:         game.i18n.has(nameKey) ? game.i18n.localize(nameKey) : entry.name,
    description:  game.i18n.has(descKey) ? game.i18n.localize(descKey) : (entry.description ?? ""),
    legalTargets: Array.from(entry.legalTargets ?? []),
    modifiers:    (entry.modifiers ?? []).map(m => ({
      container: m.container ?? "actor",
      appliesTo: Array.from(m.appliesTo ?? []),
      target:    m.target ?? "",
      operator:  m.operator ?? "+",
      value:     Number(m.value) || 0
    }))
  };
}
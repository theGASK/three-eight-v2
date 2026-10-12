// module/attacks/melee.mjs

/**
 * Melee attack rules.
 *
 * Every weapon can perform a melee attack. Damage and penetration
 * use the same effective-value getters as ranged — the ammunition
 * currently loaded into the weapon contributes to the melee profile,
 * per the system reference ("a weapon item's damage value is the sum
 * of the weapon item damage value and the ammunition item damage
 * value").
 */

import { SKILL_ROLL_FORMULA } from "../constants.mjs";

/** @returns {boolean} True if the weapon can perform a melee attack. */
export function isEligibleWeapon(weapon) {
  return !!weapon && weapon.type === "weapon";
}

/**
 * Build the roll formula for a melee attack.
 *
 * @param {Actor}  actor
 * @param {Item}   weapon
 * @param {object} [opts]
 * @param {number} [opts.modifier=0]
 * @returns {string}
 */
export function buildFormula(actor, weapon, { modifier = 0 } = {}) {
  const parts = [SKILL_ROLL_FORMULA];
  if (modifier) parts.push(`${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)}`);
  return parts.join(" ");
}

/**
 * Summary of the attack for the chat card.
 * @param {Item} weapon
 * @returns {{ damage: number, penetration: number }}
 */
export function damageSummary(weapon) {
  return {
    damage:      weapon.effectiveDamage,
    penetration: weapon.effectivePenetration
  };
}
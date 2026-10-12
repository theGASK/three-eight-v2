// module/attacks/ranged.mjs

/**
 * Ranged attack rules.
 *
 * A weapon is eligible for a ranged attack when:
 *   - it is a weapon item
 *   - its Range value is greater than 0
 *
 * A weapon can *fire* only when it also has Magazine.value > 0.
 * A weapon with Range > 0 and no ammo is still shown in the
 * selection dialog; the caller surfaces the out-of-ammo message.
 *
 * Damage and penetration are pulled from `Item#effectiveDamage` and
 * `Item#effectivePenetration`, which already fold in the loaded
 * ammunition.
 */

import { SKILL_ROLL_FORMULA } from "../constants.mjs";

/** @returns {boolean} True if the weapon can perform a ranged attack. */
export function isEligibleWeapon(weapon) {
  return !!weapon
      && weapon.type === "weapon"
      && (Number(weapon.system.range) || 0) > 0;
}

/** @returns {boolean} True if the weapon currently has ammo. */
export function hasAmmo(weapon) {
  return (Number(weapon?.system?.magazine?.value) || 0) > 0;
}

/**
 * Build the roll formula for a ranged attack.
 *
 * The placeholder modifier argument is reserved for the future
 * modifier-prompt output — currently a plain number, later possibly
 * a dice formula fragment.
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
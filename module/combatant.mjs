import { INITIATIVE_FORMULA } from "./constants.mjs";

/**
 * Custom Combatant that resolves the initiative formula per actor type.
 *
 * Initiative is rolled as:
 *     <INITIATIVE_FORMULA> + @initiativeDM + @initiativeBonus
 *
 * Both @initiativeDM and @initiativeBonus are derived on the actor
 * by ThreeEightActorData#prepareDerivedData, so all per-type logic
 * (Agility/Intelligence pick, Speed for vehicles, Morale for Faction,
 * Modifier-Type contributions) is already baked into those two values.
 *
 * @see module/data-model.mjs  → #deriveInitiative
 * @see module/constants.mjs   → INITIATIVE_CHARACTERISTICS
 */
export class ThreeEightCombatant extends Combatant {
  /** @override
   * @returns {string} The initiative formula to use for this combatant. */
  _getInitiativeFormula() {
    // If the combatant isn't linked to an actor (rare, but possible for
    // bare combatants), fall back to a flat roll.
    if (!this.actor) return INITIATIVE_FORMULA;

    return `${INITIATIVE_FORMULA} + @initiativeDM + @initiativeBonus`;
  }
}
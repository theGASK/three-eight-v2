// module/documents/combatant.mjs

/**
 * Custom Combatant that resolves the initiative formula
 * per actor type.
 *
 * Priority:
 *   1. Agility  (PC, NPC, Animal)
 *   2. Speed    (SmallVehicle, LargeVehicle, Drone, Server, BaseOfOperations)
 *   3. Fallback (Faction — Morale only)
 *
 * The fallback is 2d8 with no modifier, matching the
 * system's base dice formula.
 */
export class ThreeEightCombatant extends Combatant {
  /** @override
   * @returns {string} The initiative formula to use for this combatant. */
  _getInitiativeFormula() {
    const actor = this.actor;
    if (!actor) return "2d8";

    const primary = actor.system?.attributes?.primary;
    if (!primary) return "2d8";

    // Agility — PC, NPC, Animal
    if (primary.agility !== undefined) {
      return "2d8 + @attributes.primary.agilityDM";
    }

    // Speed — vehicles, drones, servers, bases of operations
    if (primary.speed !== undefined) {
      return "2d8 + @attributes.primary.speedDM";
    }

    // Fallback — Faction (Morale only)
    return "2d8";
  }
}
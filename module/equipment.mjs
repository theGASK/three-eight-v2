// module/equipment.mjs

/**
 * Equipment rules for Three-Eight v2.
 *
 * Currently enforces the single-equipped-armor rule:
 *   - at most one IndividualArmor item on an actor may carry
 *     `system.equipped === true`;
 *   - equipping one automatically unequips any other armor on
 *     the same actor.
 *
 * Implemented as a hook on `updateItem`. The equipping update
 * lands first, then the sibling unequip follows within the same
 * event loop, so an observer sees a single consistent state
 * after both promises settle. The actor's derived `rangedArmor`
 * and `meleeArmor` reflect the new state on the next render.
 */

const ARMOR_TYPE = "individualArmor";

/**
 * @param {Item} item  The item that was just updated.
 * @returns {boolean}  True if the update equipped this item.
 */
function wasEquipped(item, changes) {
    if (item.type !== ARMOR_TYPE) return false;
    return foundry.utils.getProperty(changes, "system.equipped") === true;
}

/**
 * Force every other armor item on the actor to be unequipped.
 * @param {Item}  item     The item that was just equipped.
 * @param {Actor} actor    The owning actor.
 */
async function unequipSiblings(item, actor) {
    const others = actor.items.filter(other =>
        other.id !== item.id
        && other.type === ARMOR_TYPE
        && other.system?.equipped === true
    );
    if (others.length === 0) return;

    const updates = others.map(other => ({
        _id: other.id,
        "system.equipped": false
    }));

    await actor.updateEmbeddedDocuments("Item", updates, {
        threeEightEquipment: true
    });
}

/* ── Hook registration ──────────────────────────────── */

export function registerEquipmentHooks() {
    Hooks.on("updateItem", async (item, changes, options, userId) => {
        // Guard against the unequip updates we ourselves emit;
        // those set equipped to false, so `wasEquipped` is already
        // false for them, but the marker makes the intent explicit
        // and prevents accidental recursion if the rule grows.
        if (options?.threeEightEquipment) return;

        if (!wasEquipped(item, changes)) return;

        const actor = item.actor;
        if (!actor) return;

        await unequipSiblings(item, actor);
    });
}
import {
  SKILL_GROUPS,
  lookupCharacteristic,
  characteristicDM,
  averageUp,
  INITIATIVE_CHARACTERISTICS,
  VEHICLE_ARMOR_TARGETS,
  SHIELD_TARGETS,
  MELEE_DEFENSE_BASE,
  MELEE_DEFENSE_CHARACTERISTICS
} from "./constants.mjs";

const {
    HTMLField,
    NumberField,
    StringField,
    BooleanField,
    SchemaField,
    ArrayField,
    EmbeddedDataField
} = foundry.data.fields;

import {
    computeActorContributions,
    sumContributions
} from "./modifier.mjs";

import { ActionsData } from "./action-economy.mjs";
import { ModifierRule } from "./modifier-rule.mjs";
import { ConditionsData } from "./conditions.mjs";


/* ── Base Classes ───────────────────────────────────── */

class ThreeEightActorData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ required: false, blank: true, initial: "" }),

            // Current wounds — persistent and mutable. Reduced by combat
            // damage (may go negative), restored by the wounds API.
            // Never overwritten by derivation.
            wounds: new NumberField({ required: true, integer: true, initial: 0 }),

            // Maximum wounds. Derived from Fitness for PC / NPC / Animal;
            // stored and manually editable for every other actor type.
            woundsMax: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

            effort: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            actions: new EmbeddedDataField(ActionsData),
            conditions: new EmbeddedDataField(ConditionsData)
        };
    }

    /** @override */
    prepareDerivedData() {
        const contributions = computeActorContributions(this.parent);

        const primary   = this.attributes?.primary;
        const secondary = this.attributes?.secondary;

        if (primary)   this.#derivePrimary(primary, contributions);
        this.#deriveWounds(primary, contributions);
        this.#deriveEffort(primary, contributions);
        this.#deriveInitiative(primary, contributions);
        this.#deriveCombatBonus(contributions);
        this.#deriveArmor();
        this.#deriveMeleeDefense(primary);
        if (secondary) this.#deriveSecondary(primary, secondary, contributions);
    }

    #derivePrimary(primary, contributions) {
        for (const key of ["fitness", "agility", "intelligence", "morale",
                           "class", "integrity", "speed", "capacity"]) {
            if (primary[key] === undefined) continue;
            const path       = `attributes.primary.${key}`;
            const modifier   = sumContributions(contributions, path);
            const base       = Number(primary[key]) || 0;
            const effective  = base + modifier;

            primary[`${key}Effective`] = effective;
            primary[`${key}Modifier`]  = modifier;
            primary[`${key}DM`]        = characteristicDM(effective);
        }
    }

    #deriveWounds(primary, contributions) {
        // woundsMax: derived from Fitness when Fitness exists,
        // otherwise kept as whatever was stored (manual value).
        if (primary?.fitnessEffective !== undefined) {
            this.woundsMax = lookupCharacteristic(primary.fitnessEffective).wounds;
        }

        // wounds: the current value — never overwritten here.
        // It is modified by combat logic and by the wounds API.

        const modifier  = sumContributions(contributions, "wounds");
        const effective = (Number(this.wounds) || 0) + modifier;

        this.woundsEffective = effective;
        this.woundsModifier  = modifier;
        this.woundsDM        = characteristicDM(effective);
    }

    #deriveEffort(primary, contributions) {
        if (primary?.fitnessEffective !== undefined &&
            primary?.moraleEffective  !== undefined) {
            this.effort = averageUp(primary.fitnessEffective, primary.moraleEffective);
        }

        const modifier  = sumContributions(contributions, "effort");
        const effective = (Number(this.effort) || 0) + modifier;

        this.effortEffective = effective;
        this.effortModifier  = modifier;
        this.effortDM        = characteristicDM(effective);
    }
    /**
     * Derives the initiative DM and the initiative bonus.
     *
     * initiativeDM    — the highest DM among the actor's initiative
     *                   characteristics (per INITIATIVE_CHARACTERISTICS).
     *                   Types with a single characteristic get that one.
     *                   Types with no listed characteristics get 0.
     * initiativeBonus — sum of Modifier-Type contributions whose
     *                   target is the synthetic "initiative" path.
     *
     * These are exposed to roll formulas as @initiativeDM and
     * @initiativeBonus, and are what Combatant#_getInitiativeFormula
     * references.
     */
    #deriveInitiative(primary, contributions) {
        const actorType = this.parent?.type;
        const chars = INITIATIVE_CHARACTERISTICS[actorType] ?? [];

        let dm = 0;
        for (const key of chars) {
            const value = primary?.[`${key}DM`];
            if (Number.isFinite(value)) dm = Math.max(dm, value);
        }

        this.initiativeDM    = Number.isFinite(dm) ? dm : 0;
        this.initiativeBonus = sumContributions(contributions, "initiative");
    }
        /**
     * Sum of Modifier-Type contributions targeting the synthetic
     * "combat.bonus" path on the actor container.
     *
     * Exposed as `actor.system.combatBonus`. Consumed by the attack
     * modules when computing the attack roll — currently stored and
     * available, not yet folded into the formula.
     */
    #deriveCombatBonus(contributions) {
        this.combatBonus = sumContributions(contributions, "combat.bonus");
    }

    /**
     * Derives the actor's armor values from the single equipped
     * armor item of each type.
     *
     *   IndividualArmor → rangedArmor / meleeArmor
     *   VehicleArmor    → protection / soak  (vehicle actor types only)
     *
     * At most one armor item of a given type may carry
     * `equipped: true`; the enforcement lives in
     * `module/equipment.mjs`. When no armor of a type is equipped,
     * the corresponding derived values are 0 — or absent entirely
     * for VehicleArmor on non-vehicle actors.
     */
        /**
     * Derives the actor's armor values from the equipped armor items.
     *
     *   IndividualArmor → rangedArmor / meleeArmor  (all actor types)
     *   Shield          → added to the above        (PC, NPC, Animal only)
     *   VehicleArmor    → protection / soak         (vehicle actor types only)
     *
     * Individual Armor and Shield occupy independent equipment slots,
     * so both may be equipped at once and their values sum. At most
     * one item per armor type may carry `equipped: true`; the
     * enforcement lives in `module/equipment.mjs`. When no armor of
     * a type is equipped, the corresponding derived values are 0 —
     * or absent entirely for VehicleArmor on non-vehicle actors.
     */
    #deriveArmor() {
        const items = this.parent?.items?.contents ?? [];
        const actorType = this.parent?.type;

        // ── Individual Armor (all actor types) ────────
        const individual = items.find(
            i => i.type === "individualArmor" && i.system?.equipped === true
        );
        const individualRanged = individual
            ? Number(individual.system.rangedProtection?.value) || 0
            : 0;
        const individualMelee = individual
            ? Number(individual.system.meleeProtection?.value) || 0
            : 0;

        // ── Shield (PC, NPC, Animal only) ─────────────
        let shieldRanged = 0;
        let shieldMelee = 0;
        if (SHIELD_TARGETS.includes(actorType)) {
            const shield = items.find(
                i => i.type === "shield" && i.system?.equipped === true
            );
            shieldRanged = shield
                ? Number(shield.system.rangedProtection?.value) || 0
                : 0;
            shieldMelee = shield
                ? Number(shield.system.meleeProtection?.value) || 0
                : 0;
        }

        this.rangedArmor = individualRanged + shieldRanged;
        this.meleeArmor  = individualMelee + shieldMelee;

        // ── Vehicle Armor (vehicle targets only) ──────
        if (!VEHICLE_ARMOR_TARGETS.includes(actorType)) return;
        const vehicle = items.find(
            i => i.type === "vehicleArmor" && i.system?.equipped === true
        );
        this.protection = vehicle
            ? Number(vehicle.system.protection?.value) || 0
            : 0;
        this.soak = vehicle
            ? Number(vehicle.system.soak?.value) || 0
            : 0;
    }

    /**
     * Derives the actor's Melee Defense.
     *
     *   [base] + [characteristic DM] + [combatBonus] + [meleeWoundsDM]
     *
     * meleeWoundsDM is a modifier derived from current wounds relative
     * to the maximum:
     *
     *   wounds > 0   →  wounds − woundsMax    (0 at full health,
     *                                          grows negative as wounds drop)
     *   wounds ≤ 0   →  0 − woundsMax         (penalty capped at −woundsMax)
     *
     * The result may be negative.
     */
    #deriveMeleeDefense(primary) {
        const actorType = this.parent?.type;
        const base = MELEE_DEFENSE_BASE[actorType] ?? 0;
        const chars = MELEE_DEFENSE_CHARACTERISTICS[actorType] ?? [];

        let charDM = 0;
        for (const key of chars) {
            const value = primary?.[`${key}DM`];
            if (Number.isFinite(value)) charDM = Math.max(charDM, value);
        }

        const combatBonus = Number(this.combatBonus) || 0;
        const wounds      = Number(this.wounds) || 0;
        const woundsMax   = Number(this.woundsMax) || 0;

        // Wounds-derived melee defense modifier.
        // At full health this is 0; as wounds fall it grows negative,
        // bottoming out at -woundsMax once wounds reach 0 or below.
        const meleeWoundsDM = wounds > 0
            ? wounds - woundsMax
            : 0 - woundsMax;

        this.meleeWoundsDM = meleeWoundsDM;
        this.meleeDefense  = base + charDM + combatBonus + meleeWoundsDM;
    }

    #deriveSecondary(primary, secondary, contributions) {
        // Stress derives from Morale (effective).
        if (primary?.moraleEffective !== undefined) {
            secondary.stress    = primary.moraleEffective;
            secondary.stressMax = lookupCharacteristic(primary.moraleEffective).stress;
        }
        const stressModifier  = sumContributions(contributions, "attributes.secondary.stress");
        const stressEffective = (Number(secondary.stress) || 0) + stressModifier;
        secondary.stressEffective = stressEffective;
        secondary.stressModifier  = stressModifier;
        secondary.stressDM        = characteristicDM(stressEffective);

        // Reputation.
        if (secondary.reputation !== undefined) {
            const mod       = sumContributions(contributions, "attributes.secondary.reputation");
            const effective = (Number(secondary.reputation) || 0) + mod;
            secondary.reputationEffective = effective;
            secondary.reputationModifier  = mod;
            secondary.reputationLabel     = game.i18n.localize(
                lookupCharacteristic(effective).reputation
            );
            secondary.reputationDM        = characteristicDM(effective);
        }

        // Wealth.
        if (secondary.wealth !== undefined) {
            const mod       = sumContributions(contributions, "attributes.secondary.wealth");
            const effective = (Number(secondary.wealth) || 0) + mod;
            secondary.wealthEffective = effective;
            secondary.wealthModifier  = mod;
            secondary.wealthLabel     = game.i18n.localize(
                lookupCharacteristic(effective).wealth
            );
            secondary.wealthDM        = characteristicDM(effective);
        }
    }
}

class ThreeEightItemData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ required: false, blank: true, initial: "" }),

            // Universal item fields — present on every item type.
            cost:  new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            legal: new BooleanField({ required: true, initial: true }),
            equipped: new BooleanField({ required: true, initial: false })
        };
    }
}

/* ── Characteristic DataModels ──────────────────────── */

/** Full primary set: PC, NPC, Animal. */
class PrimaryCharacteristics extends foundry.abstract.DataModel {
    static defineSchema() {
        return {
            fitness:      new NumberField({ required: true, integer: true, initial: 0 }),
            agility:      new NumberField({ required: true, integer: true, initial: 0 }),
            intelligence: new NumberField({ required: true, integer: true, initial: 0 }),
            morale:       new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

/** Reduced primary set for Faction: Morale only. */
class MoraleOnlyPrimary extends foundry.abstract.DataModel {
    static defineSchema() {
        return {
            morale: new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

/** Secondary set used by PC and Faction (experience / reputation / wealth). */
class SecondaryCharacteristics extends foundry.abstract.DataModel {
    static defineSchema() {
        return {
            experience: new NumberField({ required: true, integer: true, initial: 0 }),
            reputation: new NumberField({ required: true, integer: true, initial: 0 }),
            wealth:     new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

/** Extended primary set: SmallVehicle, LargeVehicle, Drone, Server, Base of Operations. */
class ExtendedPrimaryCharacteristics extends foundry.abstract.DataModel {
    static defineSchema() {
        return {
            class:     new NumberField({ required: true, integer: true, initial: 0 }),
            integrity: new NumberField({ required: true, integer: true, initial: 0 }),
            speed:     new NumberField({ required: true, integer: true, initial: 0 }),
            capacity:  new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

/* ── Actors ─────────────────────────────────────────── */

/* PC — all primaries + all secondaries. Wounds and Effort derived. */
export class PcData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary:   new EmbeddedDataField(PrimaryCharacteristics),
                secondary: new EmbeddedDataField(SecondaryCharacteristics)
            })
        };
    }
}

/* NPC — primaries only. Wounds and Effort derived. */
export class NpcData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary: new EmbeddedDataField(PrimaryCharacteristics)
            })
        };
    }
}

/* Animal — primaries only. Wounds and Effort derived. */
export class AnimalData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary: new EmbeddedDataField(PrimaryCharacteristics)
            })
        };
    }
}

/* SmallVehicle — extended primaries only.
   Wounds and Effort are manual. */
export class SmallVehicleData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary: new EmbeddedDataField(ExtendedPrimaryCharacteristics)
            })
        };
    }
}

/* LargeVehicle — extended primaries only.
   Wounds and Effort are manual. */
export class LargeVehicleData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary: new EmbeddedDataField(ExtendedPrimaryCharacteristics)
            })
        };
    }
}

/* Drone — extended primaries only.
   Wounds and Effort are manual. */
export class DroneData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary: new EmbeddedDataField(ExtendedPrimaryCharacteristics)
            })
        };
    }
}

/* Server — extended primaries only.
   Wounds and Effort are manual. */
export class ServerData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary: new EmbeddedDataField(ExtendedPrimaryCharacteristics)
            })
        };
    }
}

/* Faction — Morale (primary) + secondary set.
   Wounds is manual (no Fitness).
   Effort is manual (no Fitness, so avg↑ can't be computed). */
export class FactionData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary:   new EmbeddedDataField(MoraleOnlyPrimary),
                secondary: new EmbeddedDataField(SecondaryCharacteristics)
            })
        };
    }
}

/* Base of Operations — extended primaries only.
   Wounds and Effort are manual. */
export class BaseOfOperationsData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary: new EmbeddedDataField(ExtendedPrimaryCharacteristics)
            })
        };
    }
}

/* ── Core Items ─────────────────────────────────────── */

export class GeneralObjectData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            encumbrance: new NumberField({ required: true, min: 0, initial: 0 })
        };
    }
}

export class WeaponData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),

            type:        new StringField({ required: false, blank: true, initial: "" }),
            caliber:     new StringField({ required: false, blank: true, initial: "" }),
            rof:         new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
            reliability: new NumberField({ required: true, integer: true, initial: 0 }),
            damage:      new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            critical:    new StringField({ required: false, blank: true, initial: "" }),
            blast:       new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            range:       new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            penetration: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            loadedAmmoId: new StringField({ required: false, blank: true, initial: "" }),
            magazine: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),
        };
    }
}

export class ContainerData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            capacity: new SchemaField({
                value: new NumberField({ required: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, min: 0, initial: 0 })
            })
        };
    }
}

/* ── Armor Items ────────────────────────────────────── */

/**
 * Individual Armor — worn or carried protection for a person.
 * Two independent protection tracks, each with its own current
 * and maximum value. Degradation, repair and coverage are not
 * modelled here; the sheet stores and displays the numbers.
 */
export class IndividualArmorData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),

            rangedProtection: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),

            meleeProtection: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            })
        };
    }
}

/**
 * Shield — a handheld protective item. Uses the same two
 * protection tracks as Individual Armor. A Shield and an
 * Individual Armor can be equipped simultaneously; the actor's
 * derived Ranged Armor and Melee Armor are the sum of both.
 * Legal targets: PC, NPC, Animal.
 */
export class ShieldData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),

            rangedProtection: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),

            meleeProtection: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            })
        };
    }
}

/**
 * Vehicle Armor — plating or shielding mounted on a vehicle.
 * Protection is the general armor value; Soak is the amount the
 * vehicle absorbs before its structure is affected. Both tracks
 * carry a current and a maximum value.
 */

export class VehicleArmorData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),

            protection: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),

            soak: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            })
        };
    }
}

export class SpellData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            level:  new NumberField({ required: true, integer: true, initial: 1 }),
            castingcost:  new NumberField({ required: true, integer: true, initial: 0 }),
            school: new StringField({ initial: "" })
        };
    }
}

/* ── Modifier Rule ──────────────────────────────────── */

/**
 * A single modifier instruction. Carried by Modifier-Type items
 * (mod / power / quality / flaw / ammunition) inside their
 * `system.modifiers` array.
 *
 * Targets are resolved against the container document's `system`
 * object, e.g. "attributes.primary.fitness", "attributes.secondary.reputation",
 * "damage" (for a Weapon item). See `modifier.mjs` for validation
 * and application.
 */
class ModifierRule extends foundry.abstract.DataModel {
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
}

/* ── Modifier-Type Items ───────────────────────────── */

class ModifierItemData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            modifier:   new NumberField({ required: true, integer: true, initial: 0 }),
            appliesTo:  new StringField({ initial: "" }),
            targetType: new StringField({ initial: "actor" })
        };
    }
}

export class ModData     extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }
export class PowerData   extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }
export class QualityData extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }
export class FlawData    extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }
export class DiseaseData   extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }

export class AmmunitionData extends ModifierItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            quantity:    new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            penetration: new NumberField({ required: true, integer: true, initial: 0 }),
            damageBonus: new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

/* ── Skill & Specialty ─────────────────────────────── */

export class SkillData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            group: new StringField({
                required: false,
                blank: true,
                initial: "",
                choices: ["", ...Object.keys(SKILL_GROUPS)]
            })
        };
    }

    get specialties() {
        const items = this.parent?.items?.contents ?? [];
        return items.filter(i => i.type === "specialty");
    }

    get skillValue() {
        const specs = this.specialties;
        let base = 0;
        if (specs.length > 0) {
            const sum = specs.reduce((acc, s) => acc + (Number(s.system.score) || 0), 0);
            base = Math.ceil(sum / specs.length);
        }

        const actor = this.parent?.actor;
        if (actor) {
            const contributions = computeActorContributions(actor);
            base += sumContributions(contributions, "skills.roll");
        }

        return base;
    }

        get skillValue() {
        const specs = this.specialties;
        let base = 0;
        if (specs.length > 0) {
            const sum = specs.reduce((acc, s) => acc + (Number(s.system.score) || 0), 0);
            base = Math.ceil(sum / specs.length);
        }

        const actor = this.parent?.actor;
        if (actor) {
            const contributions = computeActorContributions(actor);
            base += sumContributions(contributions, "skills.roll");
        }

        return base;
    }

    /**
     * Dice modifier derived from the skill's current value via the
     * characteristic table. Consumed by the attack modules when the
     * user selects a skill for an attack roll.
     */
    get skillDM() {
        return characteristicDM(this.skillValue);
    }
}

export class SpecialtyData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            score: new NumberField({
                required: true,
                integer: true,
                min: -1,
                max: 5,
                initial: 0
            })
        };
    }
}
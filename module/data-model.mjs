import {
  SKILL_GROUPS,
  lookupCharacteristic,
  characteristicDM,
  averageUp
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


/* ── Base Classes ───────────────────────────────────── */

class ThreeEightActorData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ required: false, blank: true, initial: "" }),
            wounds: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            effort: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
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
        // Step 1: base value.
        if (primary?.fitnessEffective !== undefined) {
            this.wounds    = primary.fitnessEffective;
            this.woundsMax = lookupCharacteristic(primary.fitnessEffective).wounds;
        }

        // Step 2: apply wounds-targeting modifiers on top of the base.
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
            legal: new BooleanField({ required: true, initial: true })
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
            damage:      new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            critical:    new StringField({ required: false, blank: true, initial: "" }),
            blast:       new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            range:       new NumberField({ required: true, integer: true, min: 0, initial: 0 }),

            magazine: new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max:   new NumberField({ required: true, integer: true, min: 0, initial: 0 })
            }),

            penetration: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
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

export class AmmunitionData extends ModifierItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            quantity: new NumberField({ required: true, integer: true, initial: 0 })
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
import {
  SKILL_GROUPS,
  lookupCharacteristic,
  characteristicDM,
  averageUp
} from "./constants.mjs";

const { HTMLField, NumberField, StringField, EmbeddedDataField } = foundry.data.fields;

/* ── Base Classes ───────────────────────────────────── */

class ThreeEightActorData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ required: false, blank: true, initial: "" }),

            // Universal characteristics — present on every actor type.
            //
            // wounds:
            //   Auto-assigned from Fitness when Fitness exists
            //   (PC, NPC, Animal). Otherwise it is a manual field —
            //   no derivation logic writes to it for vehicles, drones,
            //   servers, faction, or base of operations.
            //
            // effort:
            //   Auto-assigned from avg↑(Fitness, Morale) when both exist.
            //   Otherwise manual.
            wounds: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            effort: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        };
    }

    /** @override
     * Derives primary DMs, then conditionally overwrites wounds and
     * effort from the primary scores when the inputs are present.
     * Actors missing the required inputs keep whatever was stored. */
    prepareDerivedData() {
        const primary   = this.attributes?.primary;
        const secondary = this.attributes?.secondary;

        if (primary) this.#derivePrimaryDMs(primary);
        this.#deriveWounds(primary);
        this.#deriveEffort(primary);
        if (secondary) this.#deriveSecondary(primary, secondary);
    }

    #derivePrimaryDMs(primary) {
        for (const key of ["fitness", "agility", "intelligence", "morale"]) {
            if (primary[key] !== undefined) {
                primary[`${key}DM`] = characteristicDM(primary[key]);
            }
        }
        for (const key of ["class", "integrity", "speed", "capacity"]) {
            if (primary[key] !== undefined) {
                primary[`${key}DM`] = characteristicDM(primary[key]);
            }
        }
    }

    #deriveWounds(primary) {
        // Only auto-assign when Fitness is present.
        if (primary?.fitness !== undefined) {
            this.wounds    = primary.fitness;
            this.woundsMax = lookupCharacteristic(primary.fitness).wounds;
        }
        // DM is always computed from whatever wounds currently holds,
        // so manually-entered values still resolve against the table.
        this.woundsDM = characteristicDM(this.wounds);
    }

    #deriveEffort(primary) {
        // Only auto-assign when both inputs are present.
        if (primary?.fitness !== undefined && primary?.morale !== undefined) {
            this.effort = averageUp(primary.fitness, primary.morale);
        }
        this.effortDM = characteristicDM(this.effort);
    }

    #deriveSecondary(primary, secondary) {
        if (primary?.morale !== undefined) {
            secondary.stress    = primary.morale;
            secondary.stressMax = lookupCharacteristic(primary.morale).stress;
            secondary.stressDM  = characteristicDM(primary.morale);
        }
        if (secondary.reputation !== undefined) {
            secondary.reputationLabel = game.i18n.localize(
                lookupCharacteristic(secondary.reputation).reputation
            );
            secondary.reputationDM = characteristicDM(secondary.reputation);
        }
        if (secondary.wealth !== undefined) {
            secondary.wealthLabel = game.i18n.localize(
                lookupCharacteristic(secondary.wealth).wealth
            );
            secondary.wealthDM = characteristicDM(secondary.wealth);
        }
    }
}

class ThreeEightItemData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ required: false, blank: true, initial: "" })
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
        return { ...super.defineSchema() };
    }
}

export class WeaponData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            damage:     new StringField({ initial: "" }),
            range:      new NumberField({ required: true, integer: true, initial: 0 }),
            rateOfFire: new NumberField({ required: true, integer: true, initial: 1 })
        };
    }
}

export class ContainerData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            capacity: new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

export class SpellData extends ThreeEightItemData {
    static defineSchema() {
        return {
            ...super.defineSchema(),
            level:  new NumberField({ required: true, integer: true, initial: 1 }),
            cost:   new NumberField({ required: true, integer: true, initial: 0 }),
            school: new StringField({ initial: "" })
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
        if (specs.length === 0) return 0;
        const sum = specs.reduce((acc, s) => acc + (Number(s.system.score) || 0), 0);
        return Math.ceil(sum / specs.length);
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
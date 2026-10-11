// module/data-model.mjs
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
            description: new HTMLField({ required: false, blank: true, initial: "" })
        };
    }

    /** @override
     * Derives DMs on primary characteristics, and secondary values
     * (Wounds, Stress, Effort, Reputation label, Wealth label) from the
     * primary scores via CHARACTERISTIC_TABLE. */
    prepareDerivedData() {
        const primary   = this.attributes?.primary;
        const secondary = this.attributes?.secondary;

        if (primary)   this.#derivePrimary(primary);
        if (secondary) this.#deriveSecondary(primary, secondary);
    }

    #derivePrimary(primary) {
        for (const key of ["fitness", "agility", "intelligence", "morale"]) {
            if (primary[key] !== undefined) {
                primary[`${key}DM`] = characteristicDM(primary[key]);
            }
        }
        if (primary.fitness !== undefined && primary.morale !== undefined) {
            primary.effort   = averageUp(primary.fitness, primary.morale);
            primary.effortDM = characteristicDM(primary.effort);
        }
    }

    #deriveSecondary(primary, secondary) {
        if (primary?.fitness !== undefined) {
            secondary.wounds    = primary.fitness;
            secondary.woundsMax = lookupCharacteristic(primary.fitness).wounds;
            secondary.woundsDM  = characteristicDM(primary.fitness);
        }
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

class SecondaryCharacteristics extends foundry.abstract.DataModel {
    static defineSchema() {
        return {
            experience: new NumberField({ required: true, integer: true, initial: 0 }),
            reputation: new NumberField({ required: true, integer: true, initial: 0 }),
            wealth:     new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

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

export class NpcData extends ThreeEightActorData {
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

export class SmallVehicleData extends ThreeEightActorData {
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

export class LargeVehicleData extends ThreeEightActorData {
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

export class DroneData extends ThreeEightActorData {
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

export class ServerData extends ThreeEightActorData {
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

export class FactionData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                secondary: new EmbeddedDataField(SecondaryCharacteristics)
            })
        };
    }
}

export class BaseOfOperationsData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                secondary: new EmbeddedDataField(SecondaryCharacteristics)
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
        const { NumberField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            damage:      new StringField({ initial: "" }),
            range:       new NumberField({ required: true, integer: true, initial: 0 }),
            rateOfFire:  new NumberField({ required: true, integer: true, initial: 1 })
        };
    }
}

export class ContainerData extends ThreeEightItemData {
    static defineSchema() {
        const { NumberField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            capacity: new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

export class SpellData extends ThreeEightItemData {
    static defineSchema() {
        const { NumberField } = foundry.data.fields;
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
        const { NumberField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            modifier:   new NumberField({ required: true, integer: true, initial: 0 }),
            appliesTo:  new StringField({ initial: "" }),
            targetType: new StringField({ initial: "actor" })
        };
    }
}

export class ModData       extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }
export class PowerData     extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }
export class QualityData   extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }
export class FlawData      extends ModifierItemData { static defineSchema() { return { ...super.defineSchema() }; } }

export class AmmunitionData extends ModifierItemData {
    static defineSchema() {
        const { NumberField } = foundry.data.fields;
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
        const { NumberField } = foundry.data.fields;
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
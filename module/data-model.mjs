import {
    PcData, NpcData, AnimalData,
    SmallVehicleData, LargeVehicleData, DroneData,
    ServerData, FactionData, BaseOfOperationsData,
    GeneralObjectData, WeaponData, ContainerData,
    SkillData, SpellData, ModData, SpecialtyData,
    SpecialtyData as _SD, PowerData, QualityData,
    FlawData, AmmunitionData
} from "./module/data-models.mjs";

import { ThreeEightActor, ThreeEightItem } from "./module/documents.mjs";
import { promptSkillRoll } from "./module/dice.mjs";
import { SKILL_GROUPS } from "./constants.mjs";


Hooks.once("init", () => {
    // ── Document classes ────────────────────────────────
    CONFIG.Actor.documentClass = ThreeEightActor;
    CONFIG.Item.documentClass = ThreeEightItem;
    
    // ── Actor Data Models ──────────────────────────────
    CONFIG.Actor.dataModels.pc = PcData;
    CONFIG.Actor.dataModels.npc = NpcData;
    CONFIG.Actor.dataModels.animal = AnimalData;
    CONFIG.Actor.dataModels.smallVehicle = SmallVehicleData;
    CONFIG.Actor.dataModels.largeVehicle = LargeVehicleData;
    CONFIG.Actor.dataModels.drone = DroneData;
    CONFIG.Actor.dataModels.server = ServerData;
    CONFIG.Actor.dataModels.faction = FactionData;
    CONFIG.Actor.dataModels.baseOfOperations = BaseOfOperationsData;

    // ── Item Data Models ───────────────────────────────
    CONFIG.Item.dataModels.generalObject = GeneralObjectData;
    CONFIG.Item.dataModels.weapon = WeaponData;
    CONFIG.Item.dataModels.container = ContainerData;
    CONFIG.Item.dataModels.skill = SkillData;
    CONFIG.Item.dataModels.spell = SpellData;
    CONFIG.Item.dataModels.specialty = SpecialtyData;
    CONFIG.Item.dataModels.mod = ModData;
    CONFIG.Item.dataModels.power = PowerData;
    CONFIG.Item.dataModels.quality = QualityData;
    CONFIG.Item.dataModels.flaw = FlawData;
    CONFIG.Item.dataModels.ammunition = AmmunitionData;

    CONFIG.Actor.documentClass = ThreeEightActor;
    CONFIG.Item.documentClass = ThreeEightItem;

    // ── Public API ─────────────────────────────────────
    game.threeEightV2 = Object.freeze({
        promptSkillRoll
    });
});

const { HTMLField, StringField } = foundry.data.fields;


class ThreeEightActorData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ required: false, blank: true, initial: "" })
        };
    }
}

class ThreeEightItemData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        return {
            description: new HTMLField({ required: false, blank: true, initial: "" })
        };
    }
}

/* ── Primary Characteristics ───────────────────────── */
class PrimaryCharacteristics extends foundry.abstract.DataModel {
    static defineSchema() {
        const { NumberField } = foundry.data.fields;
        return {
            fitness: new NumberField({ required: true, integer: true, initial: 0 }),
            agility: new NumberField({ required: true, integer: true, initial: 0 }),
            intelligence: new NumberField({ required: true, integer: true, initial: 0 }),
            morale: new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

/* ── Secondary Characteristics ─────────────────────── */
class SecondaryCharacteristics extends foundry.abstract.DataModel {
    static defineSchema() {
        const { NumberField, SchemaField } = foundry.data.fields;
        return {
            wounds: new NumberField({ required: true, integer: true, initial: 0 }),
            stress: new NumberField({ required: true, integer: true, initial: 0 }),
            experience: new NumberField({ required: true, integer: true, initial: 0 }),
            reputation: new NumberField({ required: true, integer: true, initial: 0 }),
            wealth: new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

/* ── Extended Primary Characteristics ─────────────────
   Declared for use by non-PC/NPC actors (Animal, Vehicles,
   Drone, Server, Faction, Base of Operations, etc.).
   Not yet assigned to any actor type — declaration only. */
class ExtendedPrimaryCharacteristics extends foundry.abstract.DataModel {
    static defineSchema() {
        const { NumberField } = foundry.data.fields;
        return {
            class: new NumberField({ required: true, integer: true, initial: 0 }),
            integrity: new NumberField({ required: true, integer: true, initial: 0 }),
            speed: new NumberField({ required: true, integer: true, initial: 0 }),
            capacity: new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}

export class PcData extends ThreeEightActorData {
    static defineSchema() {
        const { SchemaField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            attributes: new SchemaField({
                primary: new SchemaField(new PrimaryCharacteristics()),
                secondary: new SchemaField(new SecondaryCharacteristics())
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
                primary: new SchemaField(new PrimaryCharacteristics()),
                secondary: new SchemaField(new SecondaryCharacteristics())
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
                primary: new SchemaField(new PrimaryCharacteristics())
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
                primary: new SchemaField(new PrimaryCharacteristics()),
                secondary: new SchemaField(new SecondaryCharacteristics())
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
                primary: new SchemaField(new PrimaryCharacteristics()),
                secondary: new SchemaField(new SecondaryCharacteristics())
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
                primary: new SchemaField(new PrimaryCharacteristics())
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
                primary: new SchemaField(new PrimaryCharacteristics())
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
                secondary: new SchemaField(new SecondaryCharacteristics())
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
                secondary: new SchemaField(new SecondaryCharacteristics())
            })
        };
    }
}

/* ── Core Items ────────────────────────────────────── */

export class GeneralObjectData extends ThreeEightItemData {
    static defineSchema() {
        return { ...super.defineSchema() };
    }
}

export class WeaponData extends ThreeEightItemData {
    static defineSchema() {
        const { NumberField, StringField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            damage: new StringField({ initial: "" }),
            range: new NumberField({ required: true, integer: true, initial: 0 }),
            rateOfFire: new NumberField({ required: true, integer: true, initial: 1 })
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
        const { NumberField, StringField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            level: new NumberField({ required: true, integer: true, initial: 1 }),
            cost: new NumberField({ required: true, integer: true, initial: 0 }),
            school: new StringField({ initial: "" })
        };
    }
}

/* ── Modifier-Type Items ──────────────────────────────
   These share a common shape: they have a `modifier` value and an
   `appliesTo` target. This makes it easy to build a generic modifier
   application system later. */

class ModifierItemData extends ThreeEightItemData {
    static defineSchema() {
        const { NumberField, StringField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            modifier: new NumberField({ required: true, integer: true, initial: 0 }),
            appliesTo: new StringField({ initial: "" }),
            targetType: new StringField({ initial: "actor" }) // "actor" or "item"
        };
    }
}

export class ModData extends ModifierItemData {
    static defineSchema() {
        return { ...super.defineSchema() };
    }
}

export class PowerData extends ModifierItemData {
    static defineSchema() {
        return { ...super.defineSchema() };
    }
}

export class QualityData extends ModifierItemData {
    static defineSchema() {
        return { ...super.defineSchema() };
    }
}

export class FlawData extends ModifierItemData {
    static defineSchema() {
        return { ...super.defineSchema() };
    }
}

export class AmmunitionData extends ModifierItemData {
    static defineSchema() {
        const { NumberField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            quantity: new NumberField({ required: true, integer: true, initial: 0 })
        };
    }
}


/* ── Skill Item ─────────────────────────────────────── */

export class SkillData extends ThreeEightItemData {
    static defineSchema() {
        const { StringField } = foundry.data.fields;
        return {
            ...super.defineSchema(),
            group: new StringField({
                required: false,
                blank: true,
                initial: "",
                // "" is allowed as the "unassigned" state.
                choices: ["", ...Object.keys(SKILL_GROUPS)]
            })
        };
    }

    /** All Specialty items currently embedded in this Skill. */
    get specialties() {
        const items = this.parent?.items?.contents ?? [];
        return items.filter(i => i.type === "specialty");
    }

    /** Skill Value = ceiling(mean of specialty scores). 0 if no specialties. */
    get skillValue() {
        const specs = this.specialties;
        if (specs.length === 0) return 0;
        const sum = specs.reduce((acc, s) => acc + (Number(s.system.score) || 0), 0);
        return Math.ceil(sum / specs.length);
    }
}

/* ── Specialty Item ─────────────────────────────────────
   Specialties are designed to be embedded inside a Skill,
   but can also exist as standalone world Items. */
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
};

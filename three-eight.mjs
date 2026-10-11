// three-eight.mjs — system entry point
import {
  PcData, NpcData, AnimalData,
  SmallVehicleData, LargeVehicleData, DroneData,
  ServerData, FactionData, BaseOfOperationsData,
  GeneralObjectData, WeaponData, ContainerData,
  SkillData, SpellData, ModData, SpecialtyData,
  PowerData, QualityData, FlawData, AmmunitionData
} from "./module/data-model.mjs";

import { ThreeEightActor, ThreeEightItem } from "./module/documents.mjs";
import { promptSkillRoll } from "./module/dice.mjs";

Hooks.once("init", () => {
  // ── Document classes ────────────────────────────────
  CONFIG.Actor.documentClass = ThreeEightActor;
  CONFIG.Item.documentClass  = ThreeEightItem;

  // ── Actor Data Models ───────────────────────────────
  CONFIG.Actor.dataModels.pc              = PcData;
  CONFIG.Actor.dataModels.npc             = NpcData;
  CONFIG.Actor.dataModels.animal          = AnimalData;
  CONFIG.Actor.dataModels.smallVehicle    = SmallVehicleData;
  CONFIG.Actor.dataModels.largeVehicle    = LargeVehicleData;
  CONFIG.Actor.dataModels.drone           = DroneData;
  CONFIG.Actor.dataModels.server          = ServerData;
  CONFIG.Actor.dataModels.faction         = FactionData;
  CONFIG.Actor.dataModels.baseOfOperations = BaseOfOperationsData;

  // ── Item Data Models ────────────────────────────────
  CONFIG.Item.dataModels.generalObject = GeneralObjectData;
  CONFIG.Item.dataModels.weapon        = WeaponData;
  CONFIG.Item.dataModels.container     = ContainerData;
  CONFIG.Item.dataModels.skill         = SkillData;
  CONFIG.Item.dataModels.spell         = SpellData;
  CONFIG.Item.dataModels.specialty     = SpecialtyData;
  CONFIG.Item.dataModels.mod           = ModData;
  CONFIG.Item.dataModels.power         = PowerData;
  CONFIG.Item.dataModels.quality       = QualityData;
  CONFIG.Item.dataModels.flaw          = FlawData;
  CONFIG.Item.dataModels.ammunition    = AmmunitionData;

  // ── Public API ──────────────────────────────────────
  game.threeEightV2 = Object.freeze({ promptSkillRoll });
});
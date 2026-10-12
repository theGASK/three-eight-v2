import {
  PcData, NpcData, AnimalData,
  SmallVehicleData, LargeVehicleData, DroneData,
  ServerData, FactionData, BaseOfOperationsData,
  GeneralObjectData, WeaponData, ContainerData,
  SkillData, SpellData, ModData, SpecialtyData,
  PowerData, QualityData, FlawData, AmmunitionData,
  DiseaseData, IndividualArmorData, VehicleArmorData
} from "./module/data-model.mjs";

import { ThreeEightActor, ThreeEightItem } from "./module/documents.mjs";
import { ThreeEightCombatant } from "./module/combatant.mjs";
import { promptSkillRoll, parseModifierFormula } from "./module/dice.mjs";
import * as Modifier from "./module/modifier.mjs";
import * as ActionsCatalog from "./module/actions-catalog.mjs";
import * as Attack from "./module/attack.mjs";
import * as Conditions from "./module/conditions.mjs";
import * as Attack from "./module/attack.mjs";

Hooks.once("init", () => {
  // ── Document classes ────────────────────────────────
  CONFIG.Actor.documentClass = ThreeEightActor;
  CONFIG.Item.documentClass = ThreeEightItem;
  CONFIG.Combatant.documentClass = ThreeEightCombatant;

  // ── Actor Data Models ───────────────────────────────
  CONFIG.Actor.dataModels.pc = PcData;
  CONFIG.Actor.dataModels.npc = NpcData;
  CONFIG.Actor.dataModels.animal = AnimalData;
  CONFIG.Actor.dataModels.smallVehicle = SmallVehicleData;
  CONFIG.Actor.dataModels.largeVehicle = LargeVehicleData;
  CONFIG.Actor.dataModels.drone = DroneData;
  CONFIG.Actor.dataModels.server = ServerData;
  CONFIG.Actor.dataModels.faction = FactionData;
  CONFIG.Actor.dataModels.baseOfOperations = BaseOfOperationsData;

  // ── Item Data Models ────────────────────────────────
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
  CONFIG.Item.dataModels.disease = DiseaseData;
  CONFIG.Item.dataModels.individualArmor = IndividualArmorData;
  CONFIG.Item.dataModels.vehicleArmor = VehicleArmorData;

  /* ── Action Economy reset ───────────────────────────────
   Reset every combatant's slow/fast slots at the start of a
   new round. `combatStart` fires when combat begins;
   `combatRound` fires when the round number advances. Both
   call the same idempotent reset. */
  Hooks.on("combatStart", (combat) => onCombatRound(combat));
  Hooks.on("combatRound", (combat) => onCombatRound(combat));

  // ── Public API ──────────────────────────────────────
  game.threeEightV2 = Object.freeze({
    promptSkillRoll,
    parseModifierFormula,
    modifier: {
      Error: Modifier.ModifierError,
      MODIFIER_ITEM_TYPES: Modifier.MODIFIER_ITEM_TYPES,
      isModifierItem: Modifier.isModifierItem,
      validateRule: Modifier.validateRule,
      validateItemForDrop: Modifier.validateItemForDrop,
      computeActorContributions: Modifier.computeActorContributions,
      computeItemContributions: Modifier.computeItemContributions,
      sumContributions: Modifier.sumContributions,
      listContributors: Modifier.listContributors,
      getModifierState: Modifier.getModifierState
    },
    action: {
      Error: ActionEconomyError,
      ActionEconomy,
      ActionDefinition,
      ActionsData,
      canDeclare,
      declareAction,
      reset: resetActionEconomy,
      addKnownAction,
      // Catalog API
      catalog: ActionsCatalog.ACTIONS_BY_ECONOMY,
      get: ActionsCatalog.getAction,
      getAttacks: ActionsCatalog.getAttackActions,
      resolve: ActionsCatalog.resolveAction,
      resolved: ActionsCatalog.resolvedCatalog
    },
    attack: {
      Error:              Attack.AttackError,
      request:            Attack.request,
      listWeapons:        Attack.listWeapons,
      listEligible:       Attack.listEligibleWeapons,
      promptRanged:       Attack.promptRangedAttack,
      promptMelee:        Attack.promptMeleeAttack,
      promptFromWeapon:   Attack.promptFromWeapon
    },
    condition: {
      Error: Conditions.ConditionError,
      ConditionEntry: Conditions.ConditionEntry,
      ConditionsData: Conditions.ConditionsData,
      isLegalTarget: Conditions.isLegalTarget,
      apply: Conditions.applyCondition,
      remove: Conditions.removeCondition,
      increment: Conditions.incrementCondition,
      decrement: Conditions.decrementCondition,
      setStacks: Conditions.setStacks,
      toggle: Conditions.toggleCondition,
      get: Conditions.getCondition,
      has: Conditions.hasCondition,
      list: Conditions.listConditions,
      listActive: Conditions.listActiveConditions,
      tick: Conditions.tickConditions
    }
  });
});
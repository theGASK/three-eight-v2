import {
  PcData, NpcData, AnimalData,
  SmallVehicleData, LargeVehicleData, DroneData,
  ServerData, FactionData, BaseOfOperationsData,
  GeneralObjectData, WeaponData, ContainerData,
  SkillData, SpellData, ModData, SpecialtyData,
  PowerData, QualityData, FlawData, AmmunitionData,
  DiseaseData, IndividualArmorData, VehicleArmorData,
  ShieldData
} from "./module/data-model.mjs";

import { ThreeEightActor, ThreeEightItem } from "./module/documents.mjs";
import { ThreeEightCombatant } from "./module/combatant.mjs";
import { promptSkillRoll, parseModifierFormula } from "./module/dice.mjs";
import * as Modifier from "./module/modifier.mjs";
import * as ActionsCatalog from "./module/action-catalog.mjs";
import * as Attack from "./module/attack.mjs";
import * as Conditions from "./module/conditions.mjs";
import { registerEquipmentHooks } from "./module/equipment.mjs";
import * as Ranged from "./module/attacks/ranged.mjs";
import * as Wounds from "./module/wounds.mjs";

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
  CONFIG.Item.dataModels.shield = ShieldData;

  // ── Equipment rules ─────────────────────────────────
  registerEquipmentHooks();

  /* ── Ranged attack chat card actions ────────────────────
     Wires the GM confirmation buttons on ranged attack
     cards. Buttons are hidden for non-GM users. */
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const data = message.flags?.["three-eight-v2"]?.ranged;
    if (!data) return;
    if (!game.user.isGM) return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    root.querySelectorAll("[data-action='apply-armor']").forEach(btn => {
      if (data.armorApplied) { btn.disabled = true; return; }
      btn.addEventListener("click", async () => {
        await Ranged.applyRangedArmor(message);
        ui.notifications.info(game.i18n.localize("THREEEIGHT.Ranged.ArmorApplied"));
      });
    });

    root.querySelectorAll("[data-action='apply-wounds']").forEach(btn => {
      if (data.woundsApplied) { btn.disabled = true; return; }
      btn.addEventListener("click", async () => {
        await Ranged.applyRangedWounds(message);
        ui.notifications.info(game.i18n.localize("THREEEIGHT.Ranged.WoundsApplied"));
      });
    });
  });

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
    wounds: {
      Error:    Wounds.WoundsError,
      modify:   Wounds.modifyWounds,
      set:      Wounds.setWounds,
      restore:  Wounds.restoreWounds,
      prompt:   Wounds.promptWoundsModification
    },
    attack: {
      Error: Attack.AttackError,
      request: Attack.request,
      listWeapons: Attack.listWeapons,
      listEligible: Attack.listEligibleWeapons,
      promptRanged: Attack.promptRangedAttack,
      promptMelee: Attack.promptMeleeAttack,
      promptFromWeapon: Attack.promptFromWeapon,
      // ── Ranged Combat ──────────────────────────────
      ranged: {
        FIRE_MODES: Ranged.RANGED_FIRE_MODES,
        getAvailableFireModes: Ranged.getAvailableFireModes,
        getRangedAttackDM: Ranged.getRangedAttackDM,
        computeDamage: Ranged.computeDamage,
        buildFormulaParts: Ranged.buildFormulaParts,
        formulaFromParts: Ranged.formulaFromParts,
        resolveAmmoSpent: Ranged.resolveAmmoSpent,
        getTargetProtection: Ranged.getTargetRangedProtection,
        planArmorReduction: Ranged.planArmorReduction,
        resolve: Ranged.resolveRangedAttack,
        prompt: Ranged.promptRangedAttack,
        applyArmor: Ranged.applyRangedArmor,
        applyWounds: Ranged.applyRangedWounds,
        Dialog: Ranged.RangedAttackDialog
      }
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
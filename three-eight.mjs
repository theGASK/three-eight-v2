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

import {
  ActionEconomyError,
  ActionEconomy,
  ActionDefinition,
  ActionsData,
  canDeclare,
  declareAction,
  resetActionEconomy,
  addKnownAction,
  onCombatRound
} from "./module/action-economy.mjs";

import { ThreeEightActor, ThreeEightItem } from "./module/documents.mjs";
import { ThreeEightCombatant } from "./module/combatant.mjs";
import { promptSkillRoll, parseModifierFormula } from "./module/dice.mjs";
import * as Modifier from "./module/modifier.mjs";
import * as ActionsCatalog from "./module/action-catalog.mjs";
import * as Attack from "./module/attack.mjs";
import * as Conditions from "./module/conditions.mjs";
import { registerEquipmentHooks } from "./module/equipment.mjs";
import * as Ranged from "./module/attacks/ranged.mjs";
import * as Melee from "./module/attacks/melee.mjs";
import * as Wounds from "./module/wounds.mjs";
import * as Effort from "./module/effort.mjs";
import * as SkillDialog from "./module/skill-dialog.mjs";

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

  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    /* ── Action card buttons ────────────────────────────
       Available to any user (the buttons open attack /
       skill dialogs owned by the actor who declared the
       action). The actor is recovered from the message
       speaker. */
    const actionButtons = root.querySelectorAll(
      "[data-action='roll-attack'], [data-action='roll-skill']"
    );
    if (actionButtons.length > 0) {
      const speaker = message.speaker;
      const actor = speaker?.actor ? game.actors.get(speaker.actor) : null;

      actionButtons.forEach(btn => {
        if (btn.dataset.threeEightBound) return;
        btn.dataset.threeEightBound = "true";

        btn.addEventListener("click", async () => {
          if (!actor) {
            ui.notifications.warn(
              game.i18n.localize("THREEEIGHT.Action.Err.NoActorForCard")
            );
            return;
          }
          const kind = btn.dataset.action;
          try {
            if (kind === "roll-attack") {
              const attackType = btn.dataset.attackType || "";
              if (attackType === "ranged") {
                await Attack.promptRangedAttack(actor);
              } else if (attackType === "melee") {
                await Attack.promptMeleeAttack(actor);
              } else {
                // Blank attack type — fall back to melee.
                await Attack.promptMeleeAttack(actor);
              }
            } else if (kind === "roll-skill") {
              await SkillDialog.promptSkillCheck(actor);
            }
          } catch (err) {
            console.error(`three-eight-v2 | Action card button failed: ${err.message}`);
            ui.notifications.error(err.message);
          }
        });
      });
    }

    /* ── GM confirmation buttons (ranged / melee cards) ──
       …existing ranged and melee blocks stay here unchanged… */
    if (!game.user.isGM) return;

    // ── Ranged ──────────────────────────────────────
    const ranged = message.flags?.["three-eight-v2"]?.ranged;
    if (ranged) {
      root.querySelectorAll("[data-action='apply-armor']").forEach(btn => {
        if (ranged.armorApplied) { btn.disabled = true; return; }
        btn.addEventListener("click", async () => {
          await Ranged.applyRangedArmor(message);
          ui.notifications.info(game.i18n.localize("THREEEIGHT.Ranged.ArmorApplied"));
        });
      });
      root.querySelectorAll("[data-action='apply-wounds']").forEach(btn => {
        if (ranged.woundsApplied) { btn.disabled = true; return; }
        btn.addEventListener("click", async () => {
          await Ranged.applyRangedWounds(message);
          ui.notifications.info(game.i18n.localize("THREEEIGHT.Ranged.WoundsApplied"));
        });
      });
    }

    // ── Melee ───────────────────────────────────────
    const melee = message.flags?.["three-eight-v2"]?.melee;
    if (melee) {
      root.querySelectorAll("[data-action='apply-effort']").forEach(btn => {
        if (melee.effortApplied) { btn.disabled = true; return; }
        btn.addEventListener("click", async () => {
          await Melee.applyMeleeEffort(message);
          ui.notifications.info(game.i18n.localize("THREEEIGHT.Melee.EffortApplied"));
        });
      });
      root.querySelectorAll("[data-action='apply-armor']").forEach(btn => {
        if (melee.armorApplied) { btn.disabled = true; return; }
        btn.addEventListener("click", async () => {
          await Melee.applyMeleeArmor(message);
          ui.notifications.info(game.i18n.localize("THREEEIGHT.Ranged.ArmorApplied"));
        });
      });
      root.querySelectorAll("[data-action='apply-wounds']").forEach(btn => {
        if (melee.woundsApplied) { btn.disabled = true; return; }
        btn.addEventListener("click", async () => {
          await Melee.applyMeleeWounds(message);
          ui.notifications.info(game.i18n.localize("THREEEIGHT.Ranged.WoundsApplied"));
        });
      });
    }

    // ── Skill checks ────────────────────────────────
    const skillFlags = message.flags?.["three-eight-v2"]?.skill;
    if (skillFlags) {
      root.querySelectorAll("[data-action='spend-effort']").forEach(btn => {
        btn.addEventListener("click", async () => {
          try {
            await SkillDialog.spendEffort(message);
          } catch (err) {
            console.error(`three-eight-v2 | Spend Effort failed: ${err.message}`);
            ui.notifications.error(err.message);
          }
        });
      });
    }
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
    skill: {
      prompt: SkillDialog.promptSkillCheck,
      resolve: SkillDialog.resolveSkill,
      spendEffort: SkillDialog.spendEffort,
      buildFormulaParts: SkillDialog.buildFormulaParts,
      formulaFromParts: SkillDialog.formulaFromParts,
      getCharacteristicDM: SkillDialog.getCharacteristicDM,
      sumAlterationDM: SkillDialog.sumAlterationDM,
      resolveTN: SkillDialog.resolveTN,
      Dialog: SkillDialog.SkillDialog
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
      Error: Wounds.WoundsError,
      modify: Wounds.modifyWounds,
      set: Wounds.setWounds,
      restore: Wounds.restoreWounds,
      prompt: Wounds.promptWoundsModification
    },
    effort: {
      Error: Effort.EffortError,
      modify: Effort.modifyEffort,
      set: Effort.setEffort,
      restore: Effort.restoreEffort,
      prompt: Effort.promptEffortModification
    },
    attack: {
      Error: Attack.AttackError,
      request: Attack.request,
      listWeapons: Attack.listWeapons,
      listEligible: Attack.listEligibleWeapons,
      promptRanged: Attack.promptRangedAttack,
      promptMelee: Attack.promptMeleeAttack,
      promptFromWeapon: Attack.promptFromWeapon,
      ranged: { /* unchanged */ },
      melee: {
        MODES: Melee.MELEE_MODES,
        getAvailableModes: Melee.getAvailableMeleeModes,
        getMeleeAttackDM: Melee.getMeleeAttackDM,
        computeDamage: Melee.computeDamage,
        buildFormulaParts: Melee.buildFormulaParts,
        formulaFromParts: Melee.formulaFromParts,
        resolveEffortCost: Melee.resolveEffortCost,
        resolveAmmoSpent: Melee.resolveAmmoSpent,
        getTargetDefense: Melee.getTargetMeleeDefense,
        resolve: Melee.resolveMeleeAttack,
        prompt: Melee.promptMeleeAttack,
        applyArmor: Melee.applyMeleeArmor,
        applyWounds: Melee.applyMeleeWounds,
        applyEffort: Melee.applyMeleeEffort,
        Dialog: Melee.MeleeAttackDialog
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
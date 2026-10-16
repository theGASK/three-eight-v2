/* Skill Groups — a fixed list. Stored as a string on the Skill item.
   `null` / empty string means "unassigned". */
export const SKILL_GROUPS = Object.freeze({
  awareness: "THREEEIGHT.SkillGroup.awareness",
  behaviour: "THREEEIGHT.SkillGroup.behaviour",
  combat: "THREEEIGHT.SkillGroup.combat",
  control: "THREEEIGHT.SkillGroup.control",
  knowledge: "THREEEIGHT.SkillGroup.knowledge",
  performance: "THREEEIGHT.SkillGroup.performance",
  physical: "THREEEIGHT.SkillGroup.physical",
  technology: "THREEEIGHT.SkillGroup.technology"
});

/* Difficulty → Target Number table. */
export const DIFFICULTIES = Object.freeze({
  trivial: { tn: 2, label: "THREEEIGHT.Difficulty.trivial" },
  routine: { tn: 5, label: "THREEEIGHT.Difficulty.routine" },
  average: { tn: 10, label: "THREEEIGHT.Difficulty.average" },
  difficult: { tn: 12, label: "THREEEIGHT.Difficulty.difficult" },
  heroic: { tn: 14, label: "THREEEIGHT.Difficulty.heroic" },
  formidable: { tn: 16, label: "THREEEIGHT.Difficulty.formidable" },
  impossible: { tn: 20, label: "THREEEIGHT.Difficulty.impossible" }
});

/* Base dice formula for a skill roll. Change here if the system
   ever moves to 2d10, 3d6, dice pools, etc. */
export const SKILL_ROLL_FORMULA = "2d8";

/* ── Characteristic Score Table ─────────────────────────
   Maps any characteristic score to the derived values shown
   in the system reference. Score is the input; the columns
   are outputs.

   Every characteristic in the system (primary or secondary)
   resolves its score through this table. */
export const CHARACTERISTIC_TABLE = Object.freeze([
  {
    min: 0, max: 0, dm: -3, effort: 0, wounds: 1, stress: 1,
    reputation: "THREEEIGHT.Reputation.enemyOfState",
    wealth: "THREEEIGHT.Wealth.destitute"
  },
  {
    min: 1, max: 3, dm: -2, effort: 0, wounds: 3, stress: 3,
    reputation: "THREEEIGHT.Reputation.undesirable",
    wealth: "THREEEIGHT.Wealth.personalOnly"
  },
  {
    min: 4, max: 6, dm: -1, effort: 0, wounds: 6, stress: 5,
    reputation: "THREEEIGHT.Reputation.secondClass",
    wealth: "THREEEIGHT.Wealth.modest"
  },
  {
    min: 7, max: 9, dm: 0, effort: 1, wounds: 7, stress: 7,
    reputation: "THREEEIGHT.Reputation.normalCitizen",
    wealth: "THREEEIGHT.Wealth.comfortable"
  },
  {
    min: 10, max: 13, dm: 1, effort: 2, wounds: 9, stress: 9,
    reputation: "THREEEIGHT.Reputation.locallyRenown",
    wealth: "THREEEIGHT.Wealth.affluent"
  },
  {
    min: 14, max: 16, dm: 2, effort: 3, wounds: 12, stress: 11,
    reputation: "THREEEIGHT.Reputation.globallyRenown",
    wealth: "THREEEIGHT.Wealth.extravagant"
  },
  {
    min: 17, max: Infinity, dm: 3, effort: 4, wounds: 15, stress: 13,
    reputation: "THREEEIGHT.Reputation.historicalFigure",
    wealth: "THREEEIGHT.Wealth.oligarchy"
  }
]);

/** Return the whole row for a given score. */
export function lookupCharacteristic(score) {
  const s = Math.max(0, Math.floor(Number(score) || 0));
  return CHARACTERISTIC_TABLE.find(r => s >= r.min && s <= r.max)
    ?? CHARACTERISTIC_TABLE[0];
}

/** Dice modifier for a given score. */
export function characteristicDM(score) {
  return lookupCharacteristic(score).dm;
}

/** Average-up of two scores (used for Effort = avg↑(Fitness, Morale)). */
export function averageUp(a, b) {
  return Math.ceil((Number(a) + Number(b)) / 2);
}

/* ── Effect ─────────────────────────────────────────────
   Effect = (roll total + DMs) − EFFECT_BASELINE.

   The roll total already contains the Skill Value and any
   extra DMs the caller supplied, so the arithmetic here is
   simply `total − EFFECT_BASELINE`.

   Rows below are ordered from most negative to most positive.
   `aidingDM` and `chainDM` are prepared for later use; nothing
   currently consumes them. */
export const EFFECT_BASELINE = 10;

export const EFFECT_TABLE = Object.freeze([
  {
    min: -Infinity, max: -8,
    key: "exceptionalFailure",
    label: "THREEEIGHT.Effect.exceptionalFailure",
    aidingDM: -3, chainDM: -3
  },
  {
    min: -7, max: -2,
    key: "averageFailure",
    label: "THREEEIGHT.Effect.averageFailure",
    aidingDM: -2, chainDM: -2
  },
  {
    min: -1, max: -1,
    key: "marginalFailure",
    label: "THREEEIGHT.Effect.marginalFailure",
    aidingDM: -1, chainDM: -1
  },
  {
    min: 0, max: 0,
    key: "marginalSuccess",
    label: "THREEEIGHT.Effect.marginalSuccess",
    aidingDM: 0, chainDM: 1
  },
  {
    min: 1, max: 7,
    key: "averageSuccess",
    label: "THREEEIGHT.Effect.averageSuccess",
    aidingDM: 1, chainDM: 2
  },
  {
    min: 8, max: Infinity,
    key: "exceptionalSuccess",
    label: "THREEEIGHT.Effect.exceptionalSuccess",
    aidingDM: 2, chainDM: 3
  }
]);

/** Return the EFFECT_TABLE row that contains a given Effect value. */
export function effectRow(effect) {
  const e = Math.floor(Number(effect) || 0);
  return EFFECT_TABLE.find(r => e >= r.min && e <= r.max) ?? EFFECT_TABLE[0];
}

/* ── Modifier System ───────────────────────────────────
   Synthetic targets are valid modifier targets that do not
   correspond to a schema field. They are recognised by the
   modifier system in addition to schema paths. */

export const SYNTHETIC_TARGETS = Object.freeze({
  "skills.roll": {
    label: "THREEEIGHT.Modifier.Target.skillRoll",
    scope: "actor"
  },
  "initiative": {
    label: "THREEEIGHT.Modifier.Target.initiative",
    scope: "actor"
  },
  "combat.bonus": {
    label: "THREEEIGHT.Modifier.Target.combatBonus",
    scope: "any"
  }
});

/* Human-facing labels for modifier containers and operators. */
export const MODIFIER_CONTAINERS = Object.freeze({
  actor: "THREEEIGHT.Modifier.Container.actor",
  item:  "THREEEIGHT.Modifier.Container.item"
});

export const MODIFIER_OPERATORS = Object.freeze({
  "+": "THREEEIGHT.Modifier.Operator.add",
  "-": "THREEEIGHT.Modifier.Operator.subtract"
});

/* ── Roll Modifier Presets ──────────────────────────────
   The dropdown on the skill-roll prompt. The `formula` string
   is concatenated with whatever the user typed into the free-
   text modifier field, then parsed as a single expression.

   "normal" is the default and contributes nothing. Add more
   entries here as your system defines them; each label is a
   localization key. */
/* ── Roll Modifier Presets ──────────────────────────────
   The dropdown on the skill-roll prompt. The `formula` string
   is concatenated with whatever the user typed into the free-
   text modifier field, then parsed as a single expression.

   "normal" is the default and contributes nothing.
   Each visibility entry carries a self-describing [Label]
   so the chat card shows why the modifier was applied. */
export const MODIFIER_PRESETS = Object.freeze({
  normal:      { label: "THREEEIGHT.Visibility.normal",      formula: "" },
  heavyRain:   { label: "THREEEIGHT.Visibility.heavyRain",   formula: "-1[Heavy Rain]" },
  denseFog:    { label: "THREEEIGHT.Visibility.denseFog",    formula: "-1[Dense Fog]" },
  dusk:        { label: "THREEEIGHT.Visibility.dusk",        formula: "-1[Dusk]" },
  moonlight:   { label: "THREEEIGHT.Visibility.moonlight",   formula: "-2[Moonlight]" },
  starlight:   { label: "THREEEIGHT.Visibility.starlight",   formula: "-2[Starlight]" },
  cloudyNight: { label: "THREEEIGHT.Visibility.cloudyNight", formula: "-2[Cloudy Night]" },
  indoor:      { label: "THREEEIGHT.Visibility.indoor",      formula: "-3[Indoor]" }
});

/* ── Initiative ─────────────────────────────────────────
   Base initiative dice. Initiative is rolled as:
     <INITIATIVE_FORMULA> + initiativeDM + initiativeBonus

   initiativeDM    — derived in data-model.mjs from the actor's
                     initiative characteristic(s). For types with
                     two listed characteristics the higher DM wins.
   initiativeBonus — sum of Modifier-Type contributions targeting
                     the synthetic "initiative" path. */
export const INITIATIVE_FORMULA = "1d20";

/* Characteristic(s) that drive initiative, keyed by actor type.
   Arrays with more than one entry mean "use the best DM".
   Types not listed fall back to a +0 initiative DM. */
export const INITIATIVE_CHARACTERISTICS = Object.freeze({
  pc:               ["agility", "intelligence"],
  npc:              ["agility", "intelligence"],
  animal:           ["agility", "intelligence"],
  smallVehicle:     ["speed"],
  largeVehicle:     ["speed"],
  drone:            ["speed"],
  server:           ["speed"],
  faction:          ["morale"],
  baseOfOperations: ["speed"]
});

/* ── Vehicle Armor Targets ──────────────────────────────
   Actor types that can carry Vehicle Armor. The derived
   Protection and Soak values only appear on these types. */
export const VEHICLE_ARMOR_TARGETS = Object.freeze([
  "smallVehicle",
  "largeVehicle",
  "drone",
  "server",
  "baseOfOperations"
]);

/* ── Shield Targets ─────────────────────────────────────
   Actor types that can equip a Shield. Ranged Protection and
   Melee Protection from an equipped Shield are summed with the
   values from an equipped Individual Armor on the same actor. */
export const SHIELD_TARGETS = Object.freeze([
  "pc",
  "npc",
  "animal"
]);

/* ══════════════════════════════════════════════════════════
   RANGED COMBAT
   Tables driving the Ranged Attack dialog and resolution.
   ══════════════════════════════════════════════════════════ */

/**
 * Fire Mode table.
 *
 * `ammo` is one of:
 *   - a number            → that many rounds
 *   - "ROF"               → the weapon's full Rate of Fire
 *   - "1d8"               → a rolled 1d8, capped at the weapon's ROF
 *
 * `damageBonus` is one of:
 *   - null                → no bonus
 *   - "halfROF"           → floor(ROF / 2)
 *
 * `onlyDrone` restricts the mode to actors of type "drone".
 */
export const RANGED_FIRE_MODES = Object.freeze([
  { key: "normal",        label: "THREEEIGHT.Ranged.FireMode.normal",
    dice: "2d8", dm: 0,  ammo: "1d8",  initial: true,  damageBonus: null,      onlyDrone: false },
  { key: "single",        label: "THREEEIGHT.Ranged.FireMode.single",
    dice: "2d8", dm: -1, ammo: 1,      initial: false, damageBonus: null,      onlyDrone: false },
  { key: "fullAuto",      label: "THREEEIGHT.Ranged.FireMode.fullAuto",
    dice: "3d8", dm: 1,  ammo: "ROF",  initial: false, damageBonus: "halfROF", onlyDrone: false },
  { key: "droneSingle",   label: "THREEEIGHT.Ranged.FireMode.droneSingle",
    dice: "3d8", dm: 3,  ammo: 1,      initial: false, damageBonus: null,      onlyDrone: true  },
  { key: "droneNormal",   label: "THREEEIGHT.Ranged.FireMode.droneNormal",
    dice: "3d8", dm: 3,  ammo: "1d8",  initial: false, damageBonus: null,      onlyDrone: true  },
  { key: "droneFullAuto", label: "THREEEIGHT.Ranged.FireMode.droneFullAuto",
    dice: "4d8", dm: 3,  ammo: "ROF",  initial: false, damageBonus: "halfROF", onlyDrone: true  }
]);

/** Target Type table. The chosen TN is the attack's Target Number. */
export const RANGED_TARGET_TYPES = Object.freeze([
  { key: "drone",    label: "THREEEIGHT.Ranged.TargetType.drone",    tn: 14, initial: false },
  { key: "humanoid", label: "THREEEIGHT.Ranged.TargetType.humanoid", tn: 12, initial: true  },
  { key: "vehicle",  label: "THREEEIGHT.Ranged.TargetType.vehicle",  tn: 10, initial: false },
  { key: "building", label: "THREEEIGHT.Ranged.TargetType.building", tn: 5,  initial: false }
]);

/** Dialog group headers for the alteration menus, in display order. */
export const RANGED_ALTERATION_GROUPS = Object.freeze([
  { key: "special",          label: "THREEEIGHT.Ranged.AlterationGroup.special"          },
  { key: "aim",              label: "THREEEIGHT.Ranged.AlterationGroup.aim"              },
  { key: "range",            label: "THREEEIGHT.Ranged.AlterationGroup.range"            },
  { key: "targetShape",      label: "THREEEIGHT.Ranged.AlterationGroup.targetShape"      },
  { key: "targetTerrain",    label: "THREEEIGHT.Ranged.AlterationGroup.targetTerrain"    },
  { key: "lightConditions",  label: "THREEEIGHT.Ranged.AlterationGroup.lightConditions"  },
  { key: "attackerStance",   label: "THREEEIGHT.Ranged.AlterationGroup.attackerStance"   }
]);

/**
 * Ranged Attack Alteration table.
 *
 * `group: null` entries are rendered as standalone tickboxes.
 * `multiple: true` groups render as a multi-select and their
 * selected DMs are summed.
 */
export const RANGED_ALTERATIONS = Object.freeze([
  // ── Special (multiple) ─────────────────────────────
  { key: "none",              label: "THREEEIGHT.Ranged.Alteration.none",              group: "special",         dm:  0, multiple: true,  initial: true  },
  { key: "calledShot",        label: "THREEEIGHT.Ranged.Alteration.calledShot",        group: "special",         dm: -2, multiple: true,  initial: false },
  { key: "oneHandedShort",    label: "THREEEIGHT.Ranged.Alteration.oneHandedShort",    group: "special",         dm: -2, multiple: true,  initial: false },
  { key: "oneHandedLong",     label: "THREEEIGHT.Ranged.Alteration.oneHandedLong",     group: "special",         dm: -3, multiple: true,  initial: false },
  // ── Aim ────────────────────────────────────────────
  { key: "fastAim",           label: "THREEEIGHT.Ranged.Alteration.fastAim",           group: "aim",             dm:  0, multiple: false, initial: true  },
  { key: "slowAim",           label: "THREEEIGHT.Ranged.Alteration.slowAim",           group: "aim",             dm:  1, multiple: false, initial: false },
  { key: "quickshotShort",    label: "THREEEIGHT.Ranged.Alteration.quickshotShort",    group: "aim",             dm: -1, multiple: false, initial: false },
  { key: "quickshotLong",     label: "THREEEIGHT.Ranged.Alteration.quickshotLong",     group: "aim",             dm: -2, multiple: false, initial: false },
  { key: "bracedSlowAim",     label: "THREEEIGHT.Ranged.Alteration.bracedSlowAim",     group: "aim",             dm:  2, multiple: false, initial: false },
  // ── Range ──────────────────────────────────────────
  { key: "shortRange",        label: "THREEEIGHT.Ranged.Alteration.shortRange",        group: "range",           dm:  0, multiple: false, initial: true  },
  { key: "mediumRange",       label: "THREEEIGHT.Ranged.Alteration.mediumRange",       group: "range",           dm: -1, multiple: false, initial: false },
  { key: "longRange",         label: "THREEEIGHT.Ranged.Alteration.longRange",         group: "range",           dm: -2, multiple: false, initial: false },
  { key: "extremeRange",      label: "THREEEIGHT.Ranged.Alteration.extremeRange",      group: "range",           dm: -3, multiple: false, initial: false },
  { key: "closeCombatShort",  label: "THREEEIGHT.Ranged.Alteration.closeCombatShort",  group: "range",           dm: -1, multiple: false, initial: false },
  { key: "closeCombatLong",   label: "THREEEIGHT.Ranged.Alteration.closeCombatLong",   group: "range",           dm: -2, multiple: false, initial: false },
  // ── Target Shape ───────────────────────────────────
  { key: "standingPartial",   label: "THREEEIGHT.Ranged.Alteration.standingPartial",   group: "targetShape",     dm:  0, multiple: false, initial: true  },
  { key: "proneMoving",       label: "THREEEIGHT.Ranged.Alteration.proneMoving",       group: "targetShape",     dm: -1, multiple: false, initial: false },
  { key: "fullCover",         label: "THREEEIGHT.Ranged.Alteration.fullCover",         group: "targetShape",     dm: -3, multiple: false, initial: false },
  { key: "defenseless",       label: "THREEEIGHT.Ranged.Alteration.defenseless",       group: "targetShape",     dm:  3, multiple: false, initial: false },
  { key: "smallTarget",       label: "THREEEIGHT.Ranged.Alteration.smallTarget",       group: "targetShape",     dm: -2, multiple: false, initial: false },
  { key: "largeTarget",       label: "THREEEIGHT.Ranged.Alteration.largeTarget",       group: "targetShape",     dm:  2, multiple: false, initial: false },
  // ── Target Terrain ─────────────────────────────────
  { key: "openTerrain",       label: "THREEEIGHT.Ranged.Alteration.openTerrain",       group: "targetTerrain",   dm:  0, multiple: false, initial: true  },
  { key: "shrubland",         label: "THREEEIGHT.Ranged.Alteration.shrubland",         group: "targetTerrain",   dm: -1, multiple: false, initial: false },
  { key: "thickFoliage",      label: "THREEEIGHT.Ranged.Alteration.thickFoliage",      group: "targetTerrain",   dm: -2, multiple: false, initial: false },
  // ── Light Conditions ───────────────────────────────
  { key: "lightNormal",       label: "THREEEIGHT.Ranged.Alteration.lightNormal",       group: "lightConditions", dm:  0, multiple: false, initial: true  },
  { key: "limited",           label: "THREEEIGHT.Ranged.Alteration.limited",           group: "lightConditions", dm: -1, multiple: false, initial: false },
  { key: "darkness",          label: "THREEEIGHT.Ranged.Alteration.darkness",          group: "lightConditions", dm: -2, multiple: false, initial: false },
  { key: "denseSmoke",        label: "THREEEIGHT.Ranged.Alteration.denseSmoke",        group: "lightConditions", dm: -3, multiple: false, initial: false },
  // ── Attacker Stance (multiple) ─────────────────────
  { key: "proneFiring",       label: "THREEEIGHT.Ranged.Alteration.proneFiring",       group: "attackerStance",  dm:  0, multiple: true,  initial: true  },
  { key: "runningFiring",     label: "THREEEIGHT.Ranged.Alteration.runningFiring",     group: "attackerStance",  dm: -1, multiple: true,  initial: false },
  { key: "travellingFiring",  label: "THREEEIGHT.Ranged.Alteration.travellingFiring",  group: "attackerStance",  dm: -2, multiple: true,  initial: false },
  { key: "climbingFiring",    label: "THREEEIGHT.Ranged.Alteration.climbingFiring",    group: "attackerStance",  dm: -3, multiple: true,  initial: false },
  // ── Ungrouped (tickboxes) ──────────────────────────
  { key: "standingHeavy",     label: "THREEEIGHT.Ranged.Alteration.standingHeavy",     group: null,              dm: -3, multiple: false, initial: false },
  { key: "fullAutoFire",      label: "THREEEIGHT.Ranged.Alteration.fullAutoFire",      group: null,              dm:  1, multiple: false, initial: false },
  { key: "elevatedPosition",  label: "THREEEIGHT.Ranged.Alteration.elevatedPosition",  group: null,              dm:  1, multiple: false, initial: false },
  { key: "spendEffort",       label: "THREEEIGHT.Ranged.Alteration.spendEffort",       group: null,              dm:  1, multiple: false, initial: false }
]);

/** Characteristic whose derived DM drives the ranged attack roll, by actor type. */
export const RANGED_ATTACK_CHARACTERISTIC = Object.freeze({
  pc:               "agility",
  npc:              "agility",
  animal:           "agility",
  smallVehicle:     "speed",
  drone:            "speed",
  largeVehicle:     "speed",
  server:           "speed",
  baseOfOperations: "speed",
  faction:          "morale"
});

/* ── Ranged lookup helpers ─────────────────────────── */

export function getFireMode(key) {
  return RANGED_FIRE_MODES.find(m => m.key === key) ?? null;
}
export function getTargetType(key) {
  return RANGED_TARGET_TYPES.find(t => t.key === key) ?? null;
}
export function getAlteration(key) {
  return RANGED_ALTERATIONS.find(a => a.key === key) ?? null;
}

/* ── Melee Defense ──────────────────────────────────────
   Derived defensive value used when an actor is the target
   of a melee attack.

   Formula:
     [base] + [characteristic DM] + [combatBonus] − [current Wounds]

   For PC / NPC / Animal the characteristic term is the highest
   DM among the listed characteristics. For every other type the
   list contains a single characteristic, so the "highest" is
   simply that value.

   The result may be negative. */
export const MELEE_DEFENSE_BASE = Object.freeze({
  pc:               12,
  npc:              12,
  animal:           12,
  drone:            14,
  smallVehicle:     10,
  largeVehicle:     10,
  server:           10,
  baseOfOperations: 10,
  faction:          8
});

export const MELEE_DEFENSE_CHARACTERISTICS = Object.freeze({
  pc:               ["fitness", "agility", "intelligence"],
  npc:              ["fitness", "agility", "intelligence"],
  animal:           ["fitness", "agility", "intelligence"],
  drone:            ["integrity"],
  smallVehicle:     ["integrity"],
  largeVehicle:     ["integrity"],
  server:           ["integrity"],
  baseOfOperations: ["integrity"],
  faction:          ["morale"]
});
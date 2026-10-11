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
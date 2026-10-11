/* Skill Groups — a fixed list. Stored as a string on the Skill item.
   `null` / empty string means "unassigned". */
export const SKILL_GROUPS = Object.freeze({
  awareness:   "THREEEIGHT.SkillGroup.awareness",
  behaviour:   "THREEEIGHT.SkillGroup.behaviour",
  combat:      "THREEEIGHT.SkillGroup.combat",
  control:     "THREEEIGHT.SkillGroup.control",
  knowledge:   "THREEEIGHT.SkillGroup.knowledge",
  performance: "THREEEIGHT.SkillGroup.performance",
  physical:    "THREEEIGHT.SkillGroup.physical",
  technology:  "THREEEIGHT.SkillGroup.technology"
});

/* Difficulty → Target Number table. */
export const DIFFICULTIES = Object.freeze({
  trivial:    { tn:  2, label: "THREEEIGHT.Difficulty.trivial"    },
  routine:    { tn:  5, label: "THREEEIGHT.Difficulty.routine"    },
  average:    { tn: 10, label: "THREEEIGHT.Difficulty.average"    },
  difficult:  { tn: 12, label: "THREEEIGHT.Difficulty.difficult"  },
  heroic:     { tn: 14, label: "THREEEIGHT.Difficulty.heroic"     },
  formidable: { tn: 16, label: "THREEEIGHT.Difficulty.formidable" },
  impossible: { tn: 20, label: "THREEEIGHT.Difficulty.impossible" }
});

/* Base dice formula for a skill roll. Change here if the system
   ever moves to 2d10, 3d6, dice pools, etc. */
export const SKILL_ROLL_FORMULA = "2d8";
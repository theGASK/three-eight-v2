import {
  DIFFICULTIES,
  SKILL_ROLL_FORMULA,
  EFFECT_BASELINE,
  effectRow
} from "./constants.mjs";

import { validateItemForDrop } from "./modifier.mjs";
import { parseModifierFormula } from "./dice.mjs";

export class ThreeEightActor extends Actor { }

export class ThreeEightItem extends Item {
  static get embedded() {
    return {
      ...super.embedded,
      Item: ["specialty"]
    };
  }

  get specialties() {
    return this.items.filter(i => i.type === "specialty");
  }

    /**
   * Roll this Skill against a Target Number.
   * @param {object}      opts
   * @param {number}      opts.tn          Target Number (required).
   * @param {string}     [opts.difficulty] Human-readable label (e.g. "Average").
   * @param {number}     [opts.dm]         Extra dice modifier added on top of
   *                                       the Skill Value. Defaults to 0.
   * @param {string}     [opts.modifier]   User-entered modifier string.
   *                                       Accepts numbers, dice formulas, and
   *                                       optional [labels]. Example:
   *                                       "2+1d8+1[Lucky]-10[Darkness]".
   * @returns {Promise<object|null>}        Roll info, or null if aborted.
   */
  async rollSkill({ tn, difficulty = "", dm = 0, modifier = "" } = {}) {
    if (this.type !== "skill") {
      ui.notifications.warn(game.i18n.localize("THREEEIGHT.Warn.NotASkill"));
      return null;
    }
    if (!Number.isFinite(tn) || tn <= 0) {
      ui.notifications.warn(game.i18n.localize("THREEEIGHT.Warn.InvalidTN"));
      return null;
    }

    const skillValue = this.system.skillValue ?? 0;
    const dmValue = Number(dm) || 0;

    // Parse the user-provided modifier string.
    const parsed = parseModifierFormula(modifier);
    if (parsed.error) {
      ui.notifications.warn(parsed.error);
      return null;
    }

    // Assemble the roll formula.
    let formula = `${SKILL_ROLL_FORMULA} + @skill`;
    if (dmValue !== 0) formula += " + @dm";
    if (parsed.formula) formula += " " + parsed.formula;

    const roll = new Roll(formula, { skill: skillValue, dm: dmValue });
    await roll.evaluate();

    const success = roll.total >= tn;

    // ── Effect ──────────────────────────────────────────
    const effect = roll.total - EFFECT_BASELINE;
    const effectData = effectRow(effect);

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/three-eight-v2/templates/chat/skill-roll.hbs",
      {
        skillName: this.name,
        skillValue,
        dm: dmValue,
        modifier: String(modifier ?? "").trim(),
        tn,
        difficulty,
        formula: roll.formula,
        total: roll.total,
        success,

        effect,
        effectKey: effectData.key,
        effectLabel: game.i18n.localize(effectData.label),
        aidingDM: effectData.aidingDM,
        chainDM: effectData.chainDM
      }
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    });

    return {
      roll,
      total: roll.total,
      tn,
      skillValue,
      dm: dmValue,
      modifier: String(modifier ?? "").trim(),
      success,
      effect,
      effectKey: effectData.key,
      effectLabel: game.i18n.localize(effectData.label),
      aidingDM: effectData.aidingDM,
      chainDM: effectData.chainDM
    };
  }
}
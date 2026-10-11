import {
  DIFFICULTIES,
  SKILL_ROLL_FORMULA,
  EFFECT_BASELINE,
  effectRow
} from "./constants.mjs";

import { validateItemForDrop } from "./modifier.mjs";

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
   * @returns {Promise<object|null>}        Roll info, or null if aborted.
   */
  async rollSkill({ tn, difficulty = "", dm = 0 } = {}) {
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

    // Build the formula. The DM term is only included when non-zero so
    // the chat card formula stays clean for plain skill rolls.
    const terms = [`${SKILL_ROLL_FORMULA}`, "@skill"];
    if (dmValue !== 0) terms.push("@dm");
    const formula = terms.join(" + ");

    const roll = new Roll(formula, { skill: skillValue, dm: dmValue });
    await roll.evaluate();

    const success = roll.total >= tn;

    // ── Effect ──────────────────────────────────────────
    // "Subtract 10 from the total of the dice roll plus Dice Modifiers."
    // The roll total already includes skill and dm, so the arithmetic
    // is a single subtraction.
    const effect = roll.total - EFFECT_BASELINE;
    const effectData = effectRow(effect);

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/three-eight-v2/templates/chat/skill-roll.hbs",
      {
        skillName: this.name,
        skillValue,
        dm: dmValue,
        tn,
        difficulty,
        formula: roll.formula,
        total: roll.total,
        success,

        // Effect context — ready for the template to publish.
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
      success,
      effect,
      effectKey: effectData.key,
      effectLabel: game.i18n.localize(effectData.label),
      aidingDM: effectData.aidingDM,
      chainDM: effectData.chainDM
    };
  }
  /**
 * Validate this item's modifier rules against a target document.
 * Intended to be called from a sheet's drop handler before embedding.
 * @param {Actor|Item} target
 * @throws {ModifierError} if any rule is illegal for the target.
 */
  validateModifiers(target) {
    return validateItemForDrop(target, this.toObject());
  }
}
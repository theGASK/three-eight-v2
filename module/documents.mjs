// module/documents.mjs — ready for future use
import { DIFFICULTIES, SKILL_ROLL_FORMULA } from "./constants.mjs";

export class ThreeEightActor extends Actor {}

export class ThreeEightItem extends Item {
  /** @override
   * Allow Specialty items to be embedded in other Items. */
  static get embedded() {
    return {
      ...super.embedded,
      Item: ["specialty"]
    };
  }

  /** Convenience: the specialties embedded in this Skill. */
  get specialties() {
    return this.items.filter(i => i.type === "specialty");
  }

  /**
   * Roll this Skill against a Target Number.
   * @param {object}      opts
   * @param {number}      opts.tn          Target Number (required).
   * @param {string}     [opts.difficulty] Human-readable label (e.g. "Average").
   * @returns {Promise<object|null>}        Roll info, or null if aborted.
   */
  async rollSkill({ tn, difficulty = "" } = {}) {
    if (this.type !== "skill") {
      ui.notifications.warn(game.i18n.localize("THREEEIGHT.Warn.NotASkill"));
      return null;
    }
    if (!Number.isFinite(tn) || tn <= 0) {
      ui.notifications.warn(game.i18n.localize("THREEEIGHT.Warn.InvalidTN"));
      return null;
    }

    const skillValue = this.system.skillValue ?? 0;
    const roll = new Roll(`${SKILL_ROLL_FORMULA} + @skill`, { skill: skillValue });
    await roll.evaluate();

    const success = roll.total >= tn;

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/three-eight-v2/templates/chat/skill-roll.hbs",
      {
        skillName: this.name,
        skillValue,
        tn,
        difficulty,
        formula: roll.formula,
        total: roll.total,
        success
      }
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    });

    return { roll, total: roll.total, tn, skillValue, success };
  }
}
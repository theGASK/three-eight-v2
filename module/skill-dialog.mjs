// module/skill-dialog.mjs

/**
 * Skill Dialog for Three-Eight v2.
 *
 * Formula (spec §formula):
 *   [2d8]
 *   + [characteristic DM]
 *   + [skill DM]
 *   + [sum of Skill Alteration DMs]
 *   + [extra modifier]
 *   + [task chain modifier]
 *
 * The roll is tested against a Target Number (from the difficulty
 * table or a custom override). Effect is computed as
 * `total − EFFECT_BASELINE` and mapped to a tier via the existing
 * EFFECT_TABLE.
 *
 * The chat card offers a "Spend Effort" button. Each press rolls
 * 1d8, adds it to the total, recomputes TN difference and effect,
 * and decrements the actor's `effectiveEffort` by 1 — allowing
 * the value to go negative, in which case a "Critical Effort!"
 * warning is displayed.
 */

import {
  DIFFICULTIES,
  EFFECT_BASELINE,
  effectRow,
  SKILL_ALTERATIONS,
  SKILL_ALTERATION_GROUPS,
  SKILL_CHARACTERISTIC_OPTIONS,
  getSkillAlteration
} from "./constants.mjs";

import { getAvailableSkills, getSkillDM } from "./attacks/ranged.mjs";
import { setEffort } from "./effort.mjs";

const { DialogV2 } = foundry.applications.api;

/* ── Formula assembly ───────────────────────────────── */

/** Characteristic DM for the actor + key, or 0. */
export function getCharacteristicDM(actor, key) {
  if (!key) return 0;
  const value = actor?.system?.attributes?.primary?.[`${key}DM`];
  return Number.isFinite(value) ? value : 0;
}

/** Sum of the selected alteration DMs. */
export function sumAlterationDM(keys = []) {
  return keys.reduce((total, key) => {
    const alt = getSkillAlteration(key);
    return total + (alt ? alt.dm : 0);
  }, 0);
}

/**
 * Assemble the roll's component parts.
 * @returns {{ characteristicDM, skillDM, alterationDM, extraModifier, taskChainDM }}
 */
export function buildFormulaParts(actor, {
  characteristicKey = null,
  skillId = null,
  alterationKeys = [],
  extraModifier = 0,
  taskChainDM = 0
} = {}) {
  return {
    characteristicDM: getCharacteristicDM(actor, characteristicKey),
    skillDM:          getSkillDM(actor, skillId),
    alterationDM:     sumAlterationDM(alterationKeys),
    extraModifier:    Number(extraModifier) || 0,
    taskChainDM:      Number(taskChainDM) || 0
  };
}

export function formulaFromParts(parts) {
  const terms = ["2d8"];
  const add = (v) => { if (v) terms.push(`${v > 0 ? "+" : "-"} ${Math.abs(v)}`); };
  add(parts.characteristicDM);
  add(parts.skillDM);
  add(parts.alterationDM);
  add(parts.extraModifier);
  add(parts.taskChainDM);
  return terms.join(" ");
}

/* ── TN resolution ──────────────────────────────────── */

/** @returns {number} The chosen TN, honoring the custom override. */
export function resolveTN(state) {
  const custom = Number(state.customTN);
  if (Number.isFinite(custom) && custom > 0) return custom;
  const preset = DIFFICULTIES[state.presetTN];
  return preset ? preset.tn : 10;
}

/** @returns {string} Localized label for the TN source. */
export function resolveTNLabel(state) {
  const custom = Number(state.customTN);
  if (Number.isFinite(custom) && custom > 0) {
    return game.i18n.localize("THREEEIGHT.Dialog.Custom");
  }
  const preset = DIFFICULTIES[state.presetTN];
  return preset ? game.i18n.localize(preset.label) : "";
}

/* ── Resolution ─────────────────────────────────────── */

/**
 * Roll a skill check and post its chat card.
 *
 * @param {Actor}  actor
 * @param {object} state   { skillId, characteristicKey, presetTN, customTN,
 *                           alterationKeys, extraModifier, taskChainDM }
 * @returns {Promise<object>}  The resolution record.
 */
export async function resolveSkill(actor, state) {
  const parts = buildFormulaParts(actor, state);
  const formula = formulaFromParts(parts);

  const roll = new Roll(formula);
  await roll.evaluate();

  const tn = resolveTN(state);
  const tnLabel = resolveTNLabel(state);
  const difference = roll.total - tn;
  const success = difference >= 0;
  const effect = roll.total - EFFECT_BASELINE;
  const effectData = effectRow(effect);

  const skill = state.skillId ? actor.items.get(state.skillId) : null;

  const resolution = {
    actor,
    skill,
    skillId:          state.skillId ?? null,
    skillName:        skill?.name ?? "",
    characteristicKey: state.characteristicKey ?? null,
    alterationKeys:   Array.from(state.alterationKeys ?? []),
    parts,
    formula,
    roll,
    rollTotal:        roll.total,
    tn,
    tnLabel,
    difference,
    success,
    effect,
    effectKey:        effectData.key,
    effortSpent:      0,
    effortBonusTotal: 0,
    criticalEffort:   false,
    createdAt:        Date.now()
  };

  await postSkillCard(resolution);
  Hooks.callAll("threeEightV2.resolveSkill", resolution);
  return resolution;
}

/* ── Chat output ────────────────────────────────────── */

async function postSkillCard(resolution) {
  const content = await renderSkillCard(resolution);

  const flags = {
    actorUuid:        resolution.actor.uuid,
    skillId:          resolution.skillId,
    characteristicKey: resolution.characteristicKey,
    alterationKeys:   resolution.alterationKeys,
    baseFormula:      resolution.formula,
    baseParts:        resolution.parts,
    tn:               resolution.tn,
    tnLabel:          resolution.tnLabel,
    rollTotal:        resolution.rollTotal,
    effortSpent:      resolution.effortSpent,
    effortBonusTotal: resolution.effortBonusTotal,
    criticalEffort:   resolution.criticalEffort
  };

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: resolution.actor }),
    content,
    rolls:   [resolution.roll],
    sound:   CONFIG.sounds.dice,
    flags:   { "three-eight-v2": { skill: flags } }
  });
}

async function renderSkillCard(data) {
  const total      = data.rollTotal + (data.effortBonusTotal ?? 0);
  const difference = total - data.tn;
  const success    = difference >= 0;
  const effect     = total - EFFECT_BASELINE;
  const effectRowData = effectRow(effect);

  return foundry.applications.handlebars.renderTemplate(
    "systems/three-eight-v2/templates/chat/skill-check.hbs",
    {
      actorName:        data.actor?.name ?? "",
      skillName:        data.skillName ?? "",
      characteristicKey: data.characteristicKey,
      baseFormula:      data.baseFormula,
      rollTotal:        data.rollTotal,
      effortSpent:      data.effortSpent,
      effortBonusTotal: data.effortBonusTotal,
      total,
      tn:               data.tn,
      tnLabel:          data.tnLabel,
      difference,
      differenceSigned: difference >= 0 ? `+${difference}` : `${difference}`,
      success,
      effect,
      effectLabel:      game.i18n.localize(effectRowData.label),
      effectKey:        effectRowData.key,
      criticalEffort:   !!data.criticalEffort
    }
  );
}

/* ── Spend Effort ───────────────────────────────────── */

/**
 * Spend 1 Effort: roll 1d8, add it to the total, decrement the
 * actor's effectiveEffort by 1, and re-render the chat card.
 *
 * The effort value may go negative; when it does, the card shows
 * a "Critical Effort!" warning.
 *
 * @param {ChatMessage} message
 */
export async function spendEffort(message) {
  const flags = message.flags?.["three-eight-v2"]?.skill;
  if (!flags) return;

  // Resolve the actor from the stored uuid.
  const actor = flags.actorUuid ? await fromUuid(flags.actorUuid) : null;
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("THREEEIGHT.Skill.Err.NoActor"));
    return;
  }

  // Roll the bonus die.
  const bonus = new Roll("1d8");
  await bonus.evaluate();

  // Persist the effort decrement. A decrease is always permitted,
  // even when it drives the value below zero — hence enforceCap false.
  const currentEffort = Number(actor.system?.effectiveEffort) || 0;
  const nextEffort = currentEffort - 1;
  await setEffort(actor, nextEffort, { enforceCap: false });

  const effortSpent = (Number(flags.effortSpent) || 0) + 1;
  const effortBonusTotal = (Number(flags.effortBonusTotal) || 0) + bonus.total;
  const criticalEffort = nextEffort < 0;

  // Persist the updated flags.
  await message.update({
    flags: {
      "three-eight-v2": {
        skill: {
          ...flags,
          effortSpent,
          effortBonusTotal,
          criticalEffort
        }
      }
    }
  });

  // Re-render the content from the updated flags.
  const actorName = actor.name;
  const content = await renderSkillCard({
    actor:       { name: actorName },
    skillName:   flags.skillId ? (actor.items.get(flags.skillId)?.name ?? "") : "",
    characteristicKey: flags.characteristicKey,
    baseFormula: flags.baseFormula,
    rollTotal:   flags.rollTotal,
    tn:          flags.tn,
    tnLabel:     flags.tnLabel,
    effortSpent,
    effortBonusTotal,
    criticalEffort
  });
  await message.update({ content });

  // Show the bonus die in the chat log for transparency.
  await bonus.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor:  game.i18n.localize("THREEEIGHT.Skill.EffortFlavor")
  });
}

/* ── Dialog ─────────────────────────────────────────── */

function signedDM(dm) {
  return dm >= 0 ? `+${dm}` : `${dm}`;
}

function buildDialogContent(actor, preselectedSkill, preselectedSpecialty) {
  // ── Skill options ─────────────────────────────────
  const skills = getAvailableSkills(actor);
  const skillOptions = [
    `<option value=""${preselectedSkill ? "" : " selected"}>${game.i18n.localize("THREEEIGHT.Ranged.SkillNone")} (${signedDM(-3)})</option>`,
    ...skills.map(s => {
      const sel = preselectedSkill?.id === s.id ? " selected" : "";
      return `<option value="${s.id}"${sel}>${s.name} (DM ${signedDM(s.system.skillDM)})</option>`;
    })
  ].join("");

  // ── Characteristic options ────────────────────────
  const charKeys = SKILL_CHARACTERISTIC_OPTIONS[actor?.type] ?? [];
  const charLabel = (key) => {
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    const i18nKey = `THREEEIGHT.Actor.Primary.${cap}`;
    return game.i18n.has(i18nKey) ? game.i18n.localize(i18nKey) : cap;
  };
  const characteristicOptions = charKeys.map((key, idx) => {
    const dm = getCharacteristicDM(actor, key);
    const sel = idx === 0 ? " selected" : "";
    return `<option value="${key}"${sel}>${charLabel(key)} (DM ${signedDM(dm)})</option>`;
  }).join("");

  // ── TN options ────────────────────────────────────
  const tnOptions = Object.entries(DIFFICULTIES).map(([key, { tn, label }]) => {
    const sel = key === "average" ? " selected" : "";
    return `<option value="${key}"${sel}>${game.i18n.localize(label)} (TN ${tn})</option>`;
  }).join("");

  // ── Alteration groups ─────────────────────────────
  const groupsHtml = SKILL_ALTERATION_GROUPS.map(g => {
    const opts = SKILL_ALTERATIONS.filter(a => a.group === g.key);
    const options = opts.map(a =>
      `<option value="${a.key}"${a.initial ? " selected" : ""}>${game.i18n.localize(a.label)} (${signedDM(a.dm)})</option>`
    ).join("");
    return `
      <div class="form-group">
        <label>${game.i18n.localize(g.label)}</label>
        <select name="alt-${g.key}">${options}</select>
      </div>`;
  }).join("");

  // ── Ungrouped tickboxes ───────────────────────────
  const ungrouped = SKILL_ALTERATIONS.filter(a => !a.group);
  const ungroupedHtml = ungrouped.map(a =>
    `<label class="checkbox"><input type="checkbox" name="alt-ungrouped-${a.key}" value="${a.key}"${a.initial ? " checked" : ""}> ` +
    `${game.i18n.localize(a.label)} (${signedDM(a.dm)})</label>`
  ).join("");

  return `
    <div class="three-eight-v2 skill-dialog-content">
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Skill.Name")}</label>
        <select name="skill">${skillOptions}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Skill.Characteristic")}</label>
        <select name="characteristic">${characteristicOptions}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Dialog.Difficulty")}</label>
        <select name="presetTN">${tnOptions}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Dialog.CustomTN")}</label>
        <input type="number" name="customTN" step="1" min="1"
               placeholder="${game.i18n.localize("THREEEIGHT.Dialog.CustomTNHint")}" />
      </div>
      ${groupsHtml}
      <fieldset class="ungrouped-alterations">
        <legend>${game.i18n.localize("THREEEIGHT.Skill.OtherAlterations")}</legend>
        ${ungroupedHtml}
      </fieldset>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Skill.ExtraModifier")}</label>
        <input type="number" name="extraModifier" value="0" step="1" />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Skill.TaskChainDM")}</label>
        <input type="number" name="taskChainDM" value="0" step="1" />
      </div>
      <div class="skill-preview">
        <div class="form-group">
          <label>${game.i18n.localize("THREEEIGHT.Skill.RollFormula")}</label>
          <span class="formula-display"></span>
        </div>
      </div>
      <p class="notes">
        <strong>${game.i18n.localize("THREEEIGHT.Skill.SelectedAlterations")}:</strong>
        <span class="alt-list"></span>
      </p>
    </div>`;
}

function readDialogState(root) {
  const skillId          = root.querySelector("[name='skill']")?.value || null;
  const characteristicKey = root.querySelector("[name='characteristic']")?.value || null;
  const presetTN         = root.querySelector("[name='presetTN']")?.value || "average";
  const customTN         = root.querySelector("[name='customTN']")?.value || "";
  const extraModifier    = Number(root.querySelector("[name='extraModifier']")?.value) || 0;
  const taskChainDM      = Number(root.querySelector("[name='taskChainDM']")?.value) || 0;

  const alterationKeys = [];
  for (const select of root.querySelectorAll("select[name^='alt-']")) {
    if (select.value) alterationKeys.push(select.value);
  }
  for (const cb of root.querySelectorAll("input[type='checkbox'][name^='alt-ungrouped-']")) {
    if (cb.checked) alterationKeys.push(cb.value);
  }

  return { skillId, characteristicKey, presetTN, customTN, alterationKeys, extraModifier, taskChainDM };
}

function alterationSummary(keys) {
  return keys
    .map(k => getSkillAlteration(k))
    .filter(Boolean)
    .map(a => `${game.i18n.localize(a.label)} (${signedDM(a.dm)})`)
    .join(", ");
}

/**
 * Dialog subclass that keeps the Roll Formula preview live.
 */
export class SkillDialog extends DialogV2 {
  constructor(actor, { preselectedSkill = null, resolve = () => {} } = {}) {
    super({
      window: { title: game.i18n.localize("THREEEIGHT.Skill.DialogTitle") },
      classes: ["three-eight-v2", "skill-dialog"],
      position: { width: 550, height: "auto" },
      content: buildDialogContent(actor, preselectedSkill),
      modal: true,
      // ...
      rejectClose: false,
      buttons: [
        {
          action: "roll",
          label: game.i18n.localize("THREEEIGHT.Skill.Roll"),
          default: true,
          callback: (event, button) => {
            const form = button.form ?? button.closest("form") ?? this.element;
            const state = readDialogState(form);
            resolve(state);
            return state;
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("THREEEIGHT.Skill.Cancel"),
          callback: () => { resolve(null); return null; }
        }
      ]
    });
    this.actor = actor;
    this.preselectedSkill = preselectedSkill;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!root) return;
    for (const input of root.querySelectorAll("select, input")) {
      input.addEventListener("change", () => this.#refreshPreview());
      input.addEventListener("input",  () => this.#refreshPreview());
    }
    this.#refreshPreview();
  }

  #refreshPreview() {
    const root = this.element;
    if (!root) return;
    const state = readDialogState(root);
    const parts = buildFormulaParts(this.actor, state);

    const formulaEl = root.querySelector(".formula-display");
    const listEl    = root.querySelector(".alt-list");
    if (formulaEl) formulaEl.textContent = formulaFromParts(parts);
    if (listEl)    listEl.textContent    = alterationSummary(state.alterationKeys) || "—";
  }
}

/* ── Public entry point ─────────────────────────────── */

/**
 * Open the Skill Dialog and resolve the check on confirmation.
 *
 * @param {Actor}  actor
 * @param {object} [opts]
 * @param {Item}   [opts.skill]  Preselected skill (from a sheet click).
 * @returns {Promise<object|null>}
 */
export async function promptSkillCheck(actor, { skill = null, specialty = null } = {}) {
    if (!actor) {
        ui.notifications.warn(game.i18n.localize("THREEEIGHT.Skill.Err.NoActor"));
        return null;
    }

    const state = await new Promise((resolve) => {
        const dialog = new SkillDialog(actor, { preselectedSkill: skill, preselectedSpecialty: specialty, resolve });
        dialog.render({ force: true });
    });
    if (!state) return null;

    return resolveSkill(actor, state);
}

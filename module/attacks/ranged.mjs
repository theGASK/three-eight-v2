// module/attacks/ranged.mjs

/**
 * Ranged attack rules and dialog.
 *
 * Attack formula (spec §1):
 *   [Fire Mode dice]
 *   + [Fire Mode DM]
 *   + [agilityDM (PC/NPC/Animal) | speedDM (SmallVehicle/Drone)]
 *   + [sum of Ranged Attack Alteration DMs]
 *   + [Combat Bonus DM]
 *
 * The TN comes from the Target Type table (spec §2).
 * Penetration, armour reduction and wound resolution follow
 * spec §11–§17.
 */

import {
  SKILL_ROLL_FORMULA,
  RANGED_FIRE_MODES,
  RANGED_TARGET_TYPES,
  RANGED_ALTERATIONS,
  RANGED_ALTERATION_GROUPS,
  RANGED_ATTACK_CHARACTERISTIC,
  getFireMode,
  getTargetType,
  getAlteration
} from "../constants.mjs";

import { setWounds } from "../wounds.mjs";

const { DialogV2 } = foundry.applications.api;

/* ── Eligibility ────────────────────────────────────── */

/** @returns {boolean} True if the weapon can perform a ranged attack. */
export function isEligibleWeapon(weapon) {
  return !!weapon
      && weapon.type === "weapon"
      && (Number(weapon.system.range) || 0) > 0;
}

/** @returns {boolean} True if the weapon currently has ammo. */
export function hasAmmo(weapon) {
  return (Number(weapon?.system?.magazine?.value) || 0) > 0;
}

/* ── Fire mode availability ─────────────────────────── */

/**
 * The fire modes available to a given actor + weapon combination.
 *
 *   - "Only Drone" modes are available to drone actors only.
 *   - When the weapon's ROF ≤ 1 or its magazine is ≤ 1, only
 *     Single and Drone - Single remain selectable.
 *
 * @returns {object[]}
 */
export function getAvailableFireModes(actor, weapon) {
  const rof = Number(weapon?.system?.rof) || 0;
  const mag = Number(weapon?.system?.magazine?.value) || 0;
  const isDrone = actor?.type === "drone";
  const limited = rof <= 1 || mag <= 1;

  return RANGED_FIRE_MODES.filter(mode => {
    if (mode.onlyDrone && !isDrone) return false;
    if (limited) return mode.key === "single" || mode.key === "droneSingle";
    return true;
  });
}

/* ── Attack DM ──────────────────────────────────────── */

/**
 * The derived DM of the characteristic that drives this actor's
 * ranged attacks, or 0 if the actor has none.
 * @returns {number}
 */
export function getRangedAttackDM(actor) {
  const charKey = RANGED_ATTACK_CHARACTERISTIC[actor?.type];
  if (!charKey) return 0;
  const value = actor?.system?.attributes?.primary?.[`${charKey}DM`];
  return Number.isFinite(value) ? value : 0;
}

/**
 * Every skill item on the actor, in alphabetical order. Used to
 * populate the skill selector in the ranged attack dialog.
 *
 * @param {Actor} actor
 * @returns {Item[]}
 */
export function getAvailableSkills(actor) {
  const skills = actor?.items?.filter(i => i.type === "skill") ?? [];
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Dice modifier for the selected skill.
 *
 *   - A valid skill selection returns that skill's value as its DM.
 *   - No selection (or an invalid one) returns a −3 penalty.
 *
 * @param {Actor}  actor
 * @param {string} skillId
 * @returns {number}
 */
export function getSkillDM(actor, skillId) {
  if (!skillId) return -3;
  const skill = actor?.items?.get(skillId);
  if (!skill || skill.type !== "skill") return -3;
  return Number(skill.system?.skillDM) || 0;
}

/* ── Formula assembly ───────────────────────────────── */

/** @returns {number} Sum of the DMs of the selected alteration keys. */
export function sumAlterationDM(keys = []) {
  return keys.reduce((total, key) => {
    const alt = getAlteration(key);
    return total + (alt ? alt.dm : 0);
  }, 0);
}

/**
 * Break the ranged formula into its component parts.
 * @returns {{ fireMode, fireModeDM, attackDM, skillDM, alterationDM, combatBonus }}
 */
export function buildFormulaParts(actor, weapon, {
  fireModeKey,
  skillId = null,
  alterationKeys = []
} = {}) {
  const available = getAvailableFireModes(actor, weapon);
  const fireMode = getFireMode(fireModeKey)
    ?? available.find(m => m.initial)
    ?? available[0]
    ?? RANGED_FIRE_MODES[0];

  return {
    fireMode,
    fireModeDM:    fireMode.dm,
    attackDM:      getRangedAttackDM(actor),
    skillDM:       getSkillDM(actor, skillId),
    alterationDM:  sumAlterationDM(alterationKeys),
    combatBonus:   Number(actor?.system?.combatBonus) || 0
  };
}

/** Turn the parts into a rollable formula string. */
export function formulaFromParts(parts) {
  const terms = [parts.fireMode.dice];
  const add = (v) => { if (v) terms.push(`${v > 0 ? "+" : "-"} ${Math.abs(v)}`); };
  add(parts.fireModeDM);
  add(parts.attackDM);
  add(parts.skillDM);
  add(parts.alterationDM);
  add(parts.combatBonus);
  return terms.join(" ");
}

/**
 * Legacy-compatible formula builder, kept so `attack.request()` can
 * still roll a bare ranged attack when called directly.
 */
export function buildFormula(actor, weapon, { modifier = 0 } = {}) {
  const parts = [SKILL_ROLL_FORMULA];
  if (modifier) parts.push(`${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)}`);
  return parts.join(" ");
}

/* ── Damage ─────────────────────────────────────────── */

/**
 * Total Damage = weapon effectiveDamage + Rate of Fire damage bonus.
 * @returns {{ base: number, rofBonus: number, total: number }}
 */
export function computeDamage(weapon, fireMode) {
  const base = Number(weapon?.effectiveDamage) || 0;
  let rofBonus = 0;
  if (fireMode?.damageBonus === "halfROF") {
    rofBonus = Math.floor((Number(weapon?.system?.rof) || 0) / 2);
  }
  return { base, rofBonus, total: base + rofBonus };
}

/* ── Ammunition ─────────────────────────────────────── */

/**
 * Rounds actually spent by a fire mode.
 *   "1d8" → rolled, capped at the weapon's ROF.
 *   "ROF" → the weapon's full ROF.
 *   a number → that count.
 * Always capped by the current magazine.
 *
 * @returns {Promise<number>}
 */
export async function resolveAmmoSpent(weapon, fireMode) {
  const rof = Number(weapon?.system?.rof) || 0;
  const mag = Number(weapon?.system?.magazine?.value) || 0;
  const spec = fireMode?.ammo;
  if (spec == null) return 0;

  let spent;
  if (spec === "ROF") {
    spent = rof;
  } else if (spec === "1d8") {
    const r = new Roll("1d8");
    await r.evaluate();
    spent = Math.min(r.total, rof);
  } else if (typeof spec === "number") {
    spent = spec;
  } else {
    spent = 0;
  }
  return Math.max(0, Math.min(spent, mag));
}

/* ── Target protection ──────────────────────────────── */

/**
 * The target's current ranged protection.
 * Vehicles use `system.protection`; everything else uses the
 * derived `system.rangedArmor`.
 * @returns {number}
 */
export function getTargetRangedProtection(actor) {
  if (!actor) return 0;
  const sys = actor.system ?? {};
  if (Number.isFinite(sys.protection) && sys.protection !== undefined) {
    const isVehicle = ["smallVehicle", "largeVehicle", "drone", "server", "baseOfOperations"]
      .includes(actor.type);
    if (isVehicle) return Number(sys.protection) || 0;
  }
  return Number(sys.rangedArmor) || 0;
}

/**
 * Build the armour-reduction update plan for a successful hit.
 * Shield first, then Individual Armor or Vehicle Armor, by the
 * weapon's derived damage (spec §12).
 *
 * @returns {{ updates: object[], remaining: number }}
 */
export function planArmorReduction(targetActor, amount) {
  const updates = [];
  let remaining = Math.max(0, Math.floor(amount));

  const equipped = (type) => targetActor.items.find(
    i => i.type === type && i.system?.equipped === true
  );

  // Shield first.
  const shield = equipped("shield");
  if (shield && remaining > 0) {
    const current = Number(shield.system.rangedProtection?.value) || 0;
    const absorbed = Math.min(current, remaining);
    if (absorbed > 0) {
      updates.push({
        _id: shield.id,
        "system.rangedProtection.value": Math.max(0, current - absorbed)
      });
      remaining -= absorbed;
    }
  }

  // Then Individual Armor or Vehicle Armor.
  if (remaining > 0) {
    const armor = equipped("individualArmor") ?? equipped("vehicleArmor");
    if (armor) {
      const isVehicleArmor = armor.type === "vehicleArmor";
      const path = isVehicleArmor
        ? "system.protection.value"
        : "system.rangedProtection.value";
      const current = isVehicleArmor
        ? Number(armor.system.protection?.value) || 0
        : Number(armor.system.rangedProtection?.value) || 0;
      const absorbed = Math.min(current, remaining);
      if (absorbed > 0) {
        updates.push({ _id: armor.id, [path]: Math.max(0, current - absorbed) });
        remaining -= absorbed;
      }
    }
  }

  return { updates, remaining };
}

/* ── Resolution ─────────────────────────────────────── */

/**
 * Roll a ranged attack and post its chat card.
 *
 * @param {Actor}  actor
 * @param {Item}   weapon
 * @param {object} state   { fireModeKey, targetTypeKey, alterationKeys }
 * @param {Token}  [target]
 * @returns {Promise<object>}  The full resolution record.
 */
export async function resolveRangedAttack(actor, weapon, state, target = null) {
  const parts  = buildFormulaParts(actor, weapon, state);
  const formula = formulaFromParts(parts);
  const roll = new Roll(formula);
  await roll.evaluate();

  const targetType = getTargetType(state.targetTypeKey) ?? RANGED_TARGET_TYPES[0];
  const tn = targetType.tn;
  const success = roll.total >= tn;
  const difference = roll.total - tn;

  const penetration = Number(weapon.effectivePenetration) || 0;
  const damage = computeDamage(weapon, parts.fireMode);
  const ammoSpent = await resolveAmmoSpent(weapon, parts.fireMode);
  const selectedSkill = state.skillId ? actor.items.get(state.skillId) : null;

  const resolution = {
    actor,
    weapon,
    fireMode:   parts.fireMode,
    targetType,
    alterationKeys: Array.from(state.alterationKeys ?? []),
    skillId:     state.skillId ?? null,
    skillName:   selectedSkill?.name ?? "",
    skillDM:     parts.skillDM,
    parts,
    formula,
    roll,
    rollTotal:  roll.total,
    tn,
    success,
    difference,
    penetration,
    damage,
    ammoSpent,
    targetToken: target,
    targetActor: target?.actor ?? null,
    targetName:  target?.name ?? "",
    createdAt:   Date.now()
  };

  // ── Target resolution (spec §11–§16) ──────────────
  if (success && resolution.targetActor) {
    const ta = resolution.targetActor;
    const protectionBefore = getTargetRangedProtection(ta);
    const penetrated = penetration > protectionBefore;
    const protectionApplied = penetrated ? 0 : protectionBefore;
    const woundDamage = Math.max(0, damage.total - protectionApplied);
    const currentWounds = Number(ta.system?.wounds) || 0;
    const critical = woundDamage > currentWounds;

    const armorPlan = planArmorReduction(ta, damage.base);

    Object.assign(resolution, {
      protectionBefore,
      penetrated,
      protectionApplied,
      woundDamage,
      woundNewValue: currentWounds - woundDamage,
      critical,
      armorPlan
    });
  }

  // Spend ammunition immediately — the fire mode determines how much.
  if (ammoSpent > 0) {
    const mag = Number(weapon.system.magazine?.value) || 0;
    if (mag > 0) {
      await weapon.update({ "system.magazine.value": Math.max(0, mag - ammoSpent) });
    }
  }

  await postRangedCard(resolution);
  Hooks.callAll("threeEightV2.resolveAttack", resolution);
  return resolution;
}

/* ── Chat output ────────────────────────────────────── */

async function postRangedCard(resolution) {
  const {
    actor, weapon, fireMode, targetType, formula, rollTotal, tn, difference,
    success, penetration, damage, ammoSpent, targetName,
    protectionBefore, protectionApplied, penetrated, woundDamage,
    woundNewValue, critical, armorPlan, targetActor,
    skillName, skillDM
  } = resolution;

  const flags = {
    targetActorUuid: targetActor?.uuid ?? null,
    armorUpdates:    armorPlan?.updates ?? [],
    woundPath:       "system.wounds",
    woundValue:      woundNewValue ?? null,
    critical:        !!critical,
    armorApplied:    false,
    woundsApplied:   false
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/three-eight-v2/templates/chat/ranged-attack.hbs",
    {
      actorName: actor.name,
      weaponName: weapon.name,
      fireModeLabel: game.i18n.localize(fireMode.label),
      targetTypeLabel: game.i18n.localize(targetType.label),
      targetName,
      hasTarget: !!targetActor,
      formula,
      rollTotal,
      tn,
      difference,
      differenceSigned: difference >= 0 ? `+${difference}` : `${difference}`,
      success,
      penetration,
      damageBase: damage.base,
      damageRofBonus: damage.rofBonus,
      damageTotal: damage.total,
      ammoSpent,
      protectionBefore: protectionBefore ?? 0,
      protectionApplied: protectionApplied ?? 0,
      penetrated: !!penetrated,
      woundDamage: woundDamage ?? 0,
      critical: !!critical,
      hasArmorUpdates: (armorPlan?.updates?.length ?? 0) > 0,
      skillName: selectedSkillName ?? "",
      skillDM: resolution.skillDM ?? 0,
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [resolution.roll],
    sound: CONFIG.sounds.dice,
    flags: { "three-eight-v2": { ranged: flags } }
  });
}

/* ── GM confirmation actions ────────────────────────── */

/**
 * Apply the pending armour reduction from a ranged attack card.
 * GM-only.
 * @param {ChatMessage} message
 */
export async function applyRangedArmor(message) {
  const data = message.flags?.["three-eight-v2"]?.ranged;
  if (!data || data.armorApplied) return;
  const actor = data.targetActorUuid ? await fromUuid(data.targetActorUuid) : null;
  if (!actor || !data.armorUpdates?.length) return;

  await actor.updateEmbeddedDocuments("Item", data.armorUpdates);
  await message.setFlag("three-eight-v2", "ranged.armorApplied", true);
}

/**
 * Apply the pending wound reduction from a ranged attack card.
 * GM-only.
 *
 * Uses `setWounds` with `enforceCap: false` — an attack may drive
 * wounds below zero. The value written is the one already shown on
 * the card; the Wounds API is used for a single consistent write
 * path, not to modify the calculation.
 *
 * @param {ChatMessage} message
 */
export async function applyRangedWounds(message) {
    const data = message.flags?.["three-eight-v2"]?.ranged;
    if (!data || data.woundsApplied) return;
    if (data.woundValue === null || data.woundValue === undefined) return;

    const actor = data.targetActorUuid ? await fromUuid(data.targetActorUuid) : null;
    if (!actor) return;

    await setWounds(actor, data.woundValue, { enforceCap: false });
    await message.setFlag("three-eight-v2", "ranged.woundsApplied", true);
}

/* ── Dialog ─────────────────────────────────────────── */

function signedDM(dm) {
  return dm >= 0 ? `+${dm}` : `${dm}`;
}

function buildDialogContent(actor, weapon, target) {
  const modes = getAvailableFireModes(actor, weapon);
  const initialMode = modes.find(m => m.initial) ?? modes[0];
  const modeOptions = modes.map(m =>
    `<option value="${m.key}"${m.key === initialMode.key ? " selected" : ""}>${game.i18n.localize(m.label)}</option>`
  ).join("");

  const initialTarget = RANGED_TARGET_TYPES.find(t => t.initial) ?? RANGED_TARGET_TYPES[0];
  const targetOptions = RANGED_TARGET_TYPES.map(t =>
    `<option value="${t.key}"${t.key === initialTarget.key ? " selected" : ""}>${game.i18n.localize(t.label)} (TN ${t.tn})</option>`
  ).join("");

  // ── Skill options ─────────────────────────────────
  const skills = getAvailableSkills(actor);
  const skillOptions = [
    `<option value="" selected>${game.i18n.localize("THREEEIGHT.Ranged.SkillNone")} (${signedDM(-3)})</option>`,
    ...skills.map(s =>
      `<option value="${s.id}">${s.name} (DM ${signedDM(s.system.skillDM)})</option>`
    )
  ].join("");

  const groupsHtml = RANGED_ALTERATION_GROUPS.map(g => {
    const opts = RANGED_ALTERATIONS.filter(a => a.group === g.key);
    const multiple = opts.some(a => a.multiple);
    const options = opts.map(a =>
      `<option value="${a.key}"${a.initial ? " selected" : ""}>${game.i18n.localize(a.label)} (${signedDM(a.dm)})</option>`
    ).join("");
    const selectAttrs = multiple ? `multiple size="4"` : "";
    return `
      <div class="form-group">
        <label>${game.i18n.localize(g.label)}</label>
        <select name="alt-${g.key}" ${selectAttrs}>${options}</select>
      </div>`;
  }).join("");

  const ungrouped = RANGED_ALTERATIONS.filter(a => !a.group);
  const ungroupedHtml = ungrouped.map(a =>
    `<label class="checkbox"><input type="checkbox" name="alt-ungrouped-${a.key}" value="${a.key}"${a.initial ? " checked" : ""}> ${game.i18n.localize(a.label)} (${signedDM(a.dm)})</label>`
  ).join("");

  return `
    <div class="three-eight-v2 ranged-attack-dialog-content">
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Ranged.FireMode")}</label>
        <select name="fireMode">${modeOptions}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Ranged.TargetType")}</label>
        <select name="targetType">${targetOptions}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Ranged.Skill")}</label>
        <select name="skill">${skillOptions}</select>
      </div>
      ${groupsHtml}
      <fieldset class="ungrouped-alterations">
        <legend>${game.i18n.localize("THREEEIGHT.Ranged.OtherAlterations")}</legend>
        ${ungroupedHtml}
      </fieldset>
      <div class="ranged-preview">
        <div class="form-group">
          <label>${game.i18n.localize("THREEEIGHT.Ranged.RollFormula")}</label>
          <span class="formula-display"></span>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("THREEEIGHT.Ranged.TotalDamage")}</label>
          <span class="damage-display"></span>
        </div>
      </div>
      <p class="notes">
        <strong>${game.i18n.localize("THREEEIGHT.Ranged.SelectedAlterations")}:</strong>
        <span class="alt-list"></span>
      </p>
    </div>`;
}

/** Read the dialog's form controls into a selection state. */
function readDialogState(root, actor, weapon) {
  const fireModeKey   = root.querySelector("[name='fireMode']")?.value ?? null;
  const targetTypeKey = root.querySelector("[name='targetType']")?.value ?? null;
  const skillId       = root.querySelector("[name='skill']")?.value || null;

  const alterationKeys = [];

  for (const select of root.querySelectorAll("select[name^='alt-']")) {
    if (select.multiple) {
      for (const opt of select.selectedOptions) alterationKeys.push(opt.value);
    } else if (select.value) {
      alterationKeys.push(select.value);
    }
  }

  for (const cb of root.querySelectorAll("input[type='checkbox'][name^='alt-ungrouped-']")) {
    if (cb.checked) alterationKeys.push(cb.value);
  }

  return { fireModeKey, targetTypeKey, skillId, alterationKeys };
}

/** Human-readable list of the selected alterations with their DMs. */
function alterationSummary(keys) {
  const parts = keys
    .map(k => getAlteration(k))
    .filter(Boolean)
    .map(a => `${game.i18n.localize(a.label)} (${signedDM(a.dm)})`);
  return parts.join(", ");
}

/**
 * Dialog subclass that keeps the Roll Formula and Total Damage
 * previews live as the user interacts with the controls.
 */
export class RangedAttackDialog extends DialogV2 {
  constructor(actor, weapon, { target = null, resolve = () => {} } = {}) {
    super({
      window: { title: game.i18n.format("THREEEIGHT.Ranged.DialogTitle", { weapon: weapon.name }) },
      classes: ["three-eight-v2", "ranged-attack-dialog"],
      content: buildDialogContent(actor, weapon, target),
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "roll",
          label: game.i18n.localize("THREEEIGHT.Ranged.Roll"),
          default: true,
          callback: (event, button) => {
            const form = button.form ?? button.closest("form") ?? this.element;
            const state = readDialogState(form, actor, weapon);
            resolve(state);
            return state;
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("THREEEIGHT.Ranged.Cancel"),
          callback: () => { resolve(null); return null; }
        }
      ]
    });
    this.actor = actor;
    this.weapon = weapon;
    this.target = target;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!root) return;

    for (const input of root.querySelectorAll("select, input[type='checkbox']")) {
      input.addEventListener("change", () => this.#refreshPreview());
    }
    this.#refreshPreview();
  }

  #refreshPreview() {
    const root = this.element;
    if (!root) return;
    const state = readDialogState(root, this.actor, this.weapon);
    const parts = buildFormulaParts(this.actor, this.weapon, state);
    const damage = computeDamage(this.weapon, parts.fireMode);

    const formulaEl = root.querySelector(".formula-display");
    const damageEl  = root.querySelector(".damage-display");
    const listEl    = root.querySelector(".alt-list");

    if (formulaEl) formulaEl.textContent = formulaFromParts(parts);
    if (damageEl) {
      const rofSuffix = damage.rofBonus
        ? ` (${damage.base} + ${damage.rofBonus})`
        : "";
      damageEl.textContent = `${damage.total}${rofSuffix}`;
    }
    if (listEl) listEl.textContent = alterationSummary(state.alterationKeys) || "—";
  }
}

/**
 * Open the ranged attack dialog and, on confirmation, resolve the
 * attack. Returns the resolution record, or null if cancelled.
 *
 * @param {Actor} actor
 * @param {Item}  weapon
 * @param {object} [opts]
 * @param {Token} [opts.target]
 * @returns {Promise<object|null>}
 */
export async function promptRangedAttack(actor, weapon, { target = null } = {}) {
  const state = await new Promise((resolve) => {
    const dialog = new RangedAttackDialog(actor, weapon, { target, resolve });
    dialog.render({ force: true });
  });
  if (!state) return null;
  return resolveRangedAttack(actor, weapon, state, target);
}
// module/attacks/melee.mjs

/**
 * Melee attack rules and dialog.
 *
 * Attack formula (spec §1):
 *   [Melee Mode dice]
 *   + [Melee Mode DM]
 *   + [fitnessDM | integrityDM | moraleDM]
 *   + [Skill DM]
 *   + [sum of Melee Alteration DMs]
 *   + [Combat Bonus DM]
 *
 * The roll is tested against the defender's `meleeDefense` — read
 * from the targeted token when one exists, or entered manually in
 * the dialog when it doesn't.
 *
 * Damage (spec §13):
 *   weapon.damage × mode.multiplier
 *   + Σ (weapon.damage × alteration.multiplier)
 *   + ammo.damageBonus (Gun Strike modes only)
 */

import {
  MELEE_MODES,
  MELEE_ALTERATIONS,
  MELEE_ALTERATION_GROUPS,
  MELEE_ATTACK_CHARACTERISTIC,
  getMeleeMode,
  getMeleeAlteration
} from "../constants.mjs";

import { getAvailableSkills, getSkillDM } from "./ranged.mjs";
import { setWounds } from "../wounds.mjs";
import { setEffort } from "../effort.mjs";

const { DialogV2 } = foundry.applications.api;

/* ── Eligibility ────────────────────────────────────── */

/** @returns {boolean} Every weapon can make a melee attack. */
export function isEligibleWeapon(weapon) {
  return !!weapon && weapon.type === "weapon";
}

/* ── Melee mode availability ────────────────────────── */

function modeRequiresEffort(mode) {
  return mode.effort !== 0 && mode.effort !== "0";
}

/**
 * The melee modes available to a given actor + weapon combination.
 *
 *   - "Only Drone" modes are available to drone actors only.
 *   - Modes requiring Effort need `effortAvailable > 0`.
 *   - Gun Strike modes need ROF > 1 or a magazine value > 0, and
 *     the weapon must currently have ammo.
 *
 * @returns {object[]}
 */
export function getAvailableMeleeModes(actor, weapon) {
  const isDrone = actor?.type === "drone";
  const rof = Number(weapon?.system?.rof) || 0;
  const mag = Number(weapon?.system?.magazine?.value) || 0;
  const hasAmmo = mag > 0;
  const effort = Number(actor?.system?.effectiveEffort) || 0;

  return MELEE_MODES.filter(mode => {
    if (mode.onlyDrone && !isDrone) return false;
    if (modeRequiresEffort(mode) && effort <= 0) return false;
    if (mode.usesAmmo) {
      const gunStrikeEligible = rof > 1 || mag > 0;
      if (!gunStrikeEligible || !hasAmmo) return false;
    }
    return true;
  });
}

/* ── Attack DM ──────────────────────────────────────── */

/**
 * The derived DM of the characteristic that drives this actor's
 * melee attacks, or 0 if the actor has none.
 * @returns {number}
 */
export function getMeleeAttackDM(actor) {
  const charKey = MELEE_ATTACK_CHARACTERISTIC[actor?.type];
  if (!charKey) return 0;
  const value = actor?.system?.attributes?.primary?.[`${charKey}DM`];
  return Number.isFinite(value) ? value : 0;
}

/* ── Formula assembly ───────────────────────────────── */

export function sumMeleeAlterationDM(keys = []) {
  return keys.reduce((total, key) => {
    const alt = getMeleeAlteration(key);
    return total + (alt ? alt.dm : 0);
  }, 0);
}

/**
 * @returns {{ mode, modeDM, attackDM, skillDM, alterationDM, combatBonus }}
 */
export function buildFormulaParts(actor, weapon, {
  modeKey,
  skillId = null,
  alterationKeys = []
} = {}) {
  const available = getAvailableMeleeModes(actor, weapon);
  const mode = getMeleeMode(modeKey)
    ?? available.find(m => m.initial)
    ?? available[0]
    ?? MELEE_MODES[0];

  return {
    mode,
    modeDM:       mode.dm,
    attackDM:     getMeleeAttackDM(actor),
    skillDM:      getSkillDM(actor, skillId),
    alterationDM: sumMeleeAlterationDM(alterationKeys),
    combatBonus:  Number(actor?.system?.combatBonus) || 0
  };
}

export function formulaFromParts(parts) {
  const terms = [parts.mode.dice];
  const add = (v) => { if (v) terms.push(`${v > 0 ? "+" : "-"} ${Math.abs(v)}`); };
  add(parts.modeDM);
  add(parts.attackDM);
  add(parts.skillDM);
  add(parts.alterationDM);
  add(parts.combatBonus);
  return terms.join(" ");
}

/* ── Damage ─────────────────────────────────────────── */

/**
 * Effective melee damage.
 *
 * The weapon's raw damage is multiplied once by the mode's own
 * multiplier and once by each selected alteration's multiplier;
 * the products are then summed. Ammunition damage is added only
 * for Gun Strike modes.
 *
 * @returns {{ base: number, totalMultiplier: number, ammoBonus: number, total: number }}
 */
export function computeDamage(weapon, mode, alterationKeys = []) {
  const weaponDamage = Number(weapon?.system?.damage) || 0;

  const modeMultiplier = Number(mode?.multiplier) || 0;
  const altMultiplier  = alterationKeys.reduce((sum, key) => {
    const alt = getMeleeAlteration(key);
    return sum + (alt ? Number(alt.multiplier) || 0 : 0);
  }, 0);

  const totalMultiplier = modeMultiplier + altMultiplier;
  const scaled = weaponDamage * totalMultiplier;

  let ammoBonus = 0;
  if (mode?.usesAmmo) {
    const ammo = weapon.loadedAmmoItem;
    ammoBonus = ammo ? Number(ammo.system.damageBonus) || 0 : 0;
  }

  return {
    base: weaponDamage,
    totalMultiplier,
    ammoBonus,
    total: Math.floor(scaled + ammoBonus)
  };
}

/* ── Effort ─────────────────────────────────────────── */

/**
 * Roll or read the Effort cost of a mode.
 * @returns {Promise<number>}  The cost, never above `cap`.
 */
export async function resolveEffortCost(mode, cap = Infinity) {
  const spec = mode?.effort ?? 0;
  if (spec === 0 || spec === "0") return 0;

  let cost;
  if (typeof spec === "number") {
    cost = spec;
  } else if (typeof spec === "string") {
    const r = new Roll(spec);
    await r.evaluate();
    cost = r.total;
  } else {
    cost = 0;
  }
  return Math.max(0, Math.min(cost, cap));
}

/* ── Ammunition ─────────────────────────────────────── */

/**
 * Rounds spent by a Gun Strike mode, capped at ROF and current magazine.
 * @returns {Promise<number>}
 */
export async function resolveAmmoSpent(weapon, mode) {
  if (!mode?.usesAmmo) return 0;
  const rof = Number(weapon?.system?.rof) || 0;
  const mag = Number(weapon?.system?.magazine?.value) || 0;
  const spec = mode.ammoDie;
  if (!spec) return 0;

  const r = new Roll(spec);
  await r.evaluate();
  return Math.max(0, Math.min(Math.min(r.total, rof), mag));
}

/* ── Target defence ─────────────────────────────────── */

/** @returns {number} The target actor's derived melee defense, or 0. */
export function getTargetMeleeDefense(targetActor) {
  if (!targetActor) return 0;
  return Number(targetActor.system?.meleeDefense) || 0;
}

/* ── Resolution ─────────────────────────────────────── */

/**
 * Roll a melee attack and post its chat card.
 *
 * @param {Actor}  actor
 * @param {Item}   weapon
 * @param {object} state   { modeKey, skillId, alterationKeys, defenderValue }
 * @param {Token}  [target]
 * @returns {Promise<object>}
 */
export async function resolveMeleeAttack(actor, weapon, state, target = null) {
  const parts  = buildFormulaParts(actor, weapon, state);
  const formula = formulaFromParts(parts);
  const roll = new Roll(formula);
  await roll.evaluate();

  const targetActor = target?.actor ?? null;
  // Defender value: derived from the target when one exists,
  // otherwise the manual entry from the dialog.
  const defenderValue = targetActor
    ? getTargetMeleeDefense(targetActor)
    : (Number(state.defenderValue) || 0);

  const success = roll.total >= defenderValue;
  const difference = roll.total - defenderValue;

  const penetration = Number(weapon.effectivePenetration) || 0;
  const damage = computeDamage(weapon, parts.mode, state.alterationKeys);

  const effortCap = Number(actor.system?.effectiveEffort) || 0;
  const effortCost = await resolveEffortCost(parts.mode, effortCap);

  const ammoSpent = await resolveAmmoSpent(weapon, parts.mode);

  const resolution = {
    actor,
    weapon,
    mode:        parts.mode,
    alterationKeys: Array.from(state.alterationKeys ?? []),
    parts,
    formula,
    roll,
    rollTotal:   roll.total,
    defenderValue,
    success,
    difference,
    penetration,
    damage,
    effortCost,
    ammoSpent,
    targetToken: target,
    targetActor,
    targetName:  target?.name ?? "",
    createdAt:   Date.now()
  };

  // ── Wound resolution (spec §16–§18) ────────────────
  if (success && targetActor) {
    const ta = targetActor;
    const protectionBefore = Number(ta.system?.rangedArmor) || 0;
    const penetrated = penetration > protectionBefore;
    const protectionApplied = penetrated ? 0 : protectionBefore;
    const woundDamage = Math.max(0, damage.total - protectionApplied);
    const currentWounds = Number(ta.system?.wounds) || 0;
    const critical = woundDamage > currentWounds;

    const armorPlan = planArmorReduction(ta, damage.total);

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

  // Ammunition is spent immediately.
  if (ammoSpent > 0) {
    const mag = Number(weapon.system.magazine?.value) || 0;
    if (mag > 0) {
      await weapon.update({ "system.magazine.value": Math.max(0, mag - ammoSpent) });
    }
  }

  await postMeleeCard(resolution);
  Hooks.callAll("threeEightV2.resolveAttack", resolution);
  return resolution;
}

/* ── Armour reduction ───────────────────────────────── */

/**
 * Build the armour-reduction plan. Mirrors the ranged logic:
 * shield first, then individual or vehicle armour.
 */
function planArmorReduction(targetActor, amount) {
  const updates = [];
  let remaining = Math.max(0, Math.floor(amount));

  const equipped = (type) => targetActor.items.find(
    i => i.type === type && i.system?.equipped === true
  );

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
      }
    }
  }

  return { updates };
}

/* ── Chat output ────────────────────────────────────── */

async function postMeleeCard(resolution) {
  const {
    actor, weapon, mode, formula, rollTotal, defenderValue, difference,
    success, penetration, damage, effortCost, ammoSpent, targetName,
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
    effortCost:      effortCost ?? 0,
    armorApplied:    false,
    woundsApplied:   false,
    effortApplied:   false
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/three-eight-v2/templates/chat/melee-attack.hbs",
    {
      actorName: actor.name,
      weaponName: weapon.name,
      modeLabel: game.i18n.localize(mode.label),
      targetName,
      hasTarget: !!targetActor,
      formula,
      rollTotal,
      defenderValue,
      difference,
      differenceSigned: difference >= 0 ? `+${difference}` : `${difference}`,
      success,
      penetration,
      damageBase: damage.base,
      damageMultiplier: damage.totalMultiplier,
      damageAmmoBonus: damage.ammoBonus,
      damageTotal: damage.total,
      ammoSpent,
      effortCost,
      protectionBefore: protectionBefore ?? 0,
      protectionApplied: protectionApplied ?? 0,
      penetrated: !!penetrated,
      woundDamage: woundDamage ?? 0,
      critical: !!critical,
      hasArmorUpdates: (armorPlan?.updates?.length ?? 0) > 0,
      skillName: skillName ?? "",
      skillDM: resolution.parts?.skillDM ?? 0
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [resolution.roll],
    sound: CONFIG.sounds.dice,
    flags: { "three-eight-v2": { melee: flags } }
  });
}

/* ── GM confirmation actions ────────────────────────── */

/**
 * Apply the pending armour reduction from a melee attack card.
 * GM-only.
 */
export async function applyMeleeArmor(message) {
  const data = message.flags?.["three-eight-v2"]?.melee;
  if (!data || data.armorApplied) return;
  const actor = data.targetActorUuid ? await fromUuid(data.targetActorUuid) : null;
  if (!actor || !data.armorUpdates?.length) return;

  await actor.updateEmbeddedDocuments("Item", data.armorUpdates);
  await message.setFlag("three-eight-v2", "melee.armorApplied", true);
}

/**
 * Apply the pending wound reduction from a melee attack card.
 * GM-only. Writes below zero are permitted (critical wounds).
 */
export async function applyMeleeWounds(message) {
  const data = message.flags?.["three-eight-v2"]?.melee;
  if (!data || data.woundsApplied) return;
  if (data.woundValue === null || data.woundValue === undefined) return;
  const actor = data.targetActorUuid ? await fromUuid(data.targetActorUuid) : null;
  if (!actor) return;

  await setWounds(actor, data.woundValue, { enforceCap: false });
  await message.setFlag("three-eight-v2", "melee.woundsApplied", true);
}

/**
 * Apply the pending Effort cost from a melee attack card.
 * GM-only. Effort is spent regardless of whether the attack hit.
 */
export async function applyMeleeEffort(message) {
  const data = message.flags?.["three-eight-v2"]?.melee;
  if (!data || data.effortApplied) return;
  if (!data.effortCost) {
    await message.setFlag("three-eight-v2", "melee.effortApplied", true);
    return;
  }
  const speaker = message.speaker;
  const actor = speaker?.actor ? game.actors.get(speaker.actor) : null;
  if (!actor) return;

  const current = Number(actor.system?.effectiveEffort) || 0;
  const next = Math.max(0, current - Number(data.effortCost));
  // enforceCap: false — a decrease never exceeds the maximum.
  await setEffort(actor, next, { enforceCap: false });
  await message.setFlag("three-eight-v2", "melee.effortApplied", true);
}

/* ── Dialog ─────────────────────────────────────────── */

function signedDM(dm) {
  return dm >= 0 ? `+${dm}` : `${dm}`;
}

function formatEffort(spec) {
  if (spec === 0 || spec === "0") return "0";
  return String(spec);
}

function buildDialogContent(actor, weapon, target) {
  const modes = getAvailableMeleeModes(actor, weapon);
  const initialMode = modes.find(m => m.initial) ?? modes[0];
  const modeOptions = modes.map(m =>
    `<option value="${m.key}"${m.key === initialMode.key ? " selected" : ""}>` +
    `${game.i18n.localize(m.label)} (${m.dice}, DM ${signedDM(m.dm)}, Effort ${formatEffort(m.effort)})` +
    `</option>`
  ).join("");

  const skills = getAvailableSkills(actor);
  const skillOptions = [
    `<option value="" selected>${game.i18n.localize("THREEEIGHT.Ranged.SkillNone")} (${signedDM(-3)})</option>`,
    ...skills.map(s =>
      `<option value="${s.id}">${s.name} (DM ${signedDM(s.system.skillDM)})</option>`
    )
  ].join("");

  const defenderDefault = target?.actor
    ? getTargetMeleeDefense(target.actor)
    : 10;

  const groupsHtml = `<div class="t8-dialog-grid">` + MELEE_ALTERATION_GROUPS.map(g => {
    const opts = MELEE_ALTERATIONS.filter(a => a.group === g.key);
    const options = opts.map(a =>
      `<option value="${a.key}"${a.initial ? " selected" : ""}>` +
      `${game.i18n.localize(a.label)} (${signedDM(a.dm)}${a.multiplier ? `, ×${a.multiplier}` : ""})` +
      `</option>`
    ).join("");
    return `
      <div class="form-group">
        <label>${game.i18n.localize(g.label)}</label>
        <select name="alt-${g.key}">${options}</select>
      </div>`;
  }).join("") + `</div>`;

  const ungrouped = MELEE_ALTERATIONS.filter(a => !a.group);
  const ungroupedHtml = `<div class="t8-dialog-grid t8-checkbox-grid">` + ungrouped.map(a =>
    `<label class="checkbox"><input type="checkbox" name="alt-ungrouped-${a.key}" value="${a.key}"${a.initial ? " checked" : ""}> ` +
    `${game.i18n.localize(a.label)} (${signedDM(a.dm)}${a.multiplier ? `, ×${a.multiplier}` : ""})</label>`
  ).join("") + `</div>`;

  return `
    <div class="three-eight-v2 melee-attack-dialog-content">
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Melee.ModeLabel")}</label>
        <select name="mode">${modeOptions}</select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Melee.DefenderValue")}</label>
        <input type="number" name="defenderValue" step="1" value="${defenderDefault}" />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Ranged.Skill")}</label>
        <select name="skill">${skillOptions}</select>
      </div>
      ${groupsHtml}
      <fieldset class="ungrouped-alterations">
        <legend>${game.i18n.localize("THREEEIGHT.Melee.OtherAlterations")}</legend>
        ${ungroupedHtml}
      </fieldset>
      <div class="melee-preview">
        <div class="form-group">
          <label>${game.i18n.localize("THREEEIGHT.Melee.RollFormula")}</label>
          <span class="formula-display"></span>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("THREEEIGHT.Melee.TotalDamage")}</label>
          <span class="damage-display"></span>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("THREEEIGHT.Melee.EffortCost")}</label>
          <span class="effort-display"></span>
        </div>
      </div>
      <p class="notes">
        <strong>${game.i18n.localize("THREEEIGHT.Melee.SelectedAlterations")}:</strong>
        <span class="alt-list"></span>
      </p>
    </div>`;
}

function readDialogState(root) {
  const modeKey       = root.querySelector("[name='mode']")?.value ?? null;
  const skillId       = root.querySelector("[name='skill']")?.value || null;
  const defenderValue = Number(root.querySelector("[name='defenderValue']")?.value) || 0;

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

  return { modeKey, skillId, defenderValue, alterationKeys };
}

function alterationSummary(keys) {
  return keys
    .map(k => getMeleeAlteration(k))
    .filter(Boolean)
    .map(a => `${game.i18n.localize(a.label)} (${signedDM(a.dm)})`)
    .join(", ");
}

/**
 * Dialog subclass that keeps the Roll Formula, Total Damage and
 * Effort previews live as the user interacts with the controls.
 */
export class MeleeAttackDialog extends DialogV2 {
  constructor(actor, weapon, { target = null, resolve = () => {} } = {}) {
    super({
      window: { title: game.i18n.format("THREEEIGHT.Melee.DialogTitle", { weapon: weapon.name }) },
      classes: ["three-eight-v2", "melee-attack-dialog"],
      position: { width: 620, height: "auto" },
      content: buildDialogContent(actor, weapon, target),
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: "roll",
          label: game.i18n.localize("THREEEIGHT.Melee.Roll"),
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
          label: game.i18n.localize("THREEEIGHT.Melee.Cancel"),
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
    for (const input of root.querySelectorAll("select, input")) {
      input.addEventListener("change", () => this.#refreshPreview());
      input.addEventListener("input", () => this.#refreshPreview());
    }
    this.#refreshPreview();
  }

  #refreshPreview() {
    const root = this.element;
    if (!root) return;
    const state = readDialogState(root);
    const parts = buildFormulaParts(this.actor, this.weapon, state);
    const damage = computeDamage(this.weapon, parts.mode, state.alterationKeys);

    const formulaEl = root.querySelector(".formula-display");
    const damageEl  = root.querySelector(".damage-display");
    const effortEl  = root.querySelector(".effort-display");
    const listEl    = root.querySelector(".alt-list");

    if (formulaEl) formulaEl.textContent = formulaFromParts(parts);
    if (damageEl) {
      const detail = damage.ammoBonus
        ? ` (${damage.base} × ${damage.totalMultiplier} + ${damage.ammoBonus})`
        : ` (${damage.base} × ${damage.totalMultiplier})`;
      damageEl.textContent = `${damage.total}${detail}`;
    }
    if (effortEl) effortEl.textContent = formatEffort(parts.mode.effort);
    if (listEl) listEl.textContent = alterationSummary(state.alterationKeys) || "—";
  }
}

/**
 * Open the melee attack dialog and, on confirmation, resolve the
 * attack. Returns the resolution record, or null if cancelled.
 */
export async function promptMeleeAttack(actor, weapon, { target = null } = {}) {
  const state = await new Promise((resolve) => {
    const dialog = new MeleeAttackDialog(actor, weapon, { target, resolve });
    dialog.render({ force: true });
  });
  if (!state) return null;
  return resolveMeleeAttack(actor, weapon, state, target);
}

/* ── Legacy-compatible formula builder ──────────────── */

export function buildFormula(actor, weapon, { modifier = 0 } = {}) {
  const parts = ["2d8"];
  if (modifier) parts.push(`${modifier >= 0 ? "+" : "-"} ${Math.abs(modifier)}`);
  return parts.join(" ");
}

export function damageSummary(weapon) {
  return {
    damage:      Number(weapon?.system?.damage) || 0,
    penetration: Number(weapon?.effectivePenetration) || 0
  };
}
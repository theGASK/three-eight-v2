// module/attack.mjs

/**
 * Attack orchestration for Three-Eight v2.
 *
 * All attack flows funnel through `request()`. It:
 *   1. dispatches to `attacks/ranged.mjs` or `attacks/melee.mjs`;
 *   2. rolls the dice with the module's formula;
 *   3. posts a chat card;
 *   4. fires `threeEightV2.resolveAttack` for downstream consumers.
 *
 * Higher-level prompt flows for sheet buttons:
 *   - promptRangedAttack(actor, opts)  →  weapon list → ranged attack
 *   - promptMeleeAttack(actor, opts)   →  weapon list → melee attack
 *   - promptFromWeapon(actor, weapon)  →  type picker → same pipeline
 *
 * The modifier prompt is intentionally empty for now, per design.
 */

import { getAction, resolveAction } from "./actions-catalog.mjs";
import * as Ranged from "./attacks/ranged.mjs";
import * as Melee from "./attacks/melee.mjs";

const { DialogV2 } = foundry.applications.api;

/* ── Errors ─────────────────────────────────────────── */

export class AttackError extends Error {
  constructor(message, { actor = null, weapon = null, attackType = null } = {}) {
    super(message);
    this.name = "AttackError";
    this.actor = actor;
    this.weapon = weapon;
    this.attackType = attackType;
  }
}

/* ── Attack type resolution ─────────────────────────── */

const MODULES = Object.freeze({
  ranged: Ranged,
  melee:  Melee
});

const ACTIONS = Object.freeze({
  ranged: "rangedAttack",
  melee:  "meleeAttack"
});

/** @returns {object} The attack module for a given type. */
function moduleFor(attackType) {
  const mod = MODULES[attackType];
  if (!mod) {
    throw new AttackError(
      game.i18n.format("THREEEIGHT.Attack.Err.UnknownType", { type: attackType }),
      { attackType }
    );
  }
  return mod;
}

/* ── Weapon access ──────────────────────────────────── */

/**
 * Every weapon item owned by an actor.
 * @returns {Item[]}
 */
export function listWeapons(actor) {
  return actor?.items?.filter(i => i.type === "weapon") ?? [];
}

/**
 * Weapons an actor can use for a given attack type. This is the
 * filter the sheet's selection dialog uses.
 *
 *   ranged — must have Range > 0
 *   melee  — every weapon qualifies
 *
 * @param {Actor}              actor
 * @param {"ranged"|"melee"}   attackType
 * @returns {Item[]}
 */
export function listEligibleWeapons(actor, attackType) {
  const filter = moduleFor(attackType).isEligibleWeapon;
  return listWeapons(actor).filter(filter);
}

/* ── Prompts ────────────────────────────────────────── */

/**
 * Weapon-selection dialog. Returns the chosen weapon item or throws
 * if the actor has no eligible weapon, or if the user cancels.
 *
 * @param {Actor}              actor
 * @param {"ranged"|"melee"}   attackType
 * @returns {Promise<Item>}
 */
async function promptWeaponSelection(actor, attackType) {
  const weapons = listEligibleWeapons(actor, attackType);
  if (weapons.length === 0) {
    throw new AttackError(
      game.i18n.localize(`THREEEIGHT.Attack.Err.NoWeapons.${attackType}`),
      { actor, attackType }
    );
  }

  const options = weapons.map(w => {
    const label = attackType === "ranged"
      ? `${w.name} — Rng ${w.system.range} / Mag ${w.system.magazine.value}`
      : w.name;
    return `<option value="${w.id}">${label}</option>`;
  }).join("");

  const weaponId = await DialogV2.prompt({
    window: { title: game.i18n.localize(`THREEEIGHT.Attack.SelectWeapon.${attackType}`) },
    content: `
      <div class="form-group">
        <label>${game.i18n.localize("THREEEIGHT.Attack.Weapon")}</label>
        <select name="weaponId">${options}</select>
      </div>
    `,
    modal: true,
    rejectClose: false,
    ok: {
      label: game.i18n.localize("THREEEIGHT.Attack.Select"),
      callback: (event, button) => {
        const form = button.form ?? button.closest("form");
        return new FormData(form).get("weaponId");
      }
    }
  });

  if (!weaponId) return null;
  return actor.items.get(weaponId) ?? null;
}

/**
 * Attack-type picker for the weapon item-click flow. Only shows
 * Ranged when the weapon is ranged-capable.
 *
 * @param {Item} weapon
 * @returns {Promise<"ranged"|"melee"|null>}
 */
async function promptAttackType(weapon) {
  const canRanged = Ranged.isEligibleWeapon(weapon);
  const canMelee  = Melee.isEligibleWeapon(weapon);

  if (!canRanged && !canMelee) return null;
  if (canRanged && !canMelee)  return "ranged";
  if (!canRanged && canMelee)  return "melee";

  const type = await DialogV2.prompt({
    window: { title: game.i18n.format("THREEEIGHT.Attack.ChooseType", { weapon: weapon.name }) },
    content: `
      <p class="notes">${game.i18n.localize("THREEEIGHT.Attack.ChooseTypePrompt")}</p>
    `,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "ranged",
        label: game.i18n.localize("THREEEIGHT.Attack.Type.ranged"),
        default: true,
        callback: () => "ranged"
      },
      {
        action: "melee",
        label: game.i18n.localize("THREEEIGHT.Attack.Type.melee"),
        callback: () => "melee"
      }
    ]
  });

  return type ?? null;
}

/**
 * Modifier prompt. Empty placeholder — will be populated with the
 * modifier system later. Returning `{ modifier: 0 }` on confirm.
 *
 * @returns {Promise<{ modifier: number }|null>}
 */
async function promptModifiers() {
  return DialogV2.prompt({
    window: { title: game.i18n.localize("THREEEIGHT.Attack.ModifierTitle") },
    content: `
      <p class="notes">${game.i18n.localize("THREEEIGHT.Attack.ModifierPlaceholder")}</p>
    `,
    modal: true,
    rejectClose: false,
    ok: {
      label: game.i18n.localize("THREEEIGHT.Attack.Confirm"),
      callback: () => ({ modifier: 0 })
    }
  });
}

/* ── Public prompt flows (for the sheet) ────────────── */

/**
 * Sheet flow — "Ranged Attack" button.
 * @param {Actor}  actor
 * @param {object} [opts]
 * @param {Token}  [opts.target]
 * @returns {Promise<object|null>}
 */
export async function promptRangedAttack(actor, { target = null } = {}) {
  return promptAndRequest(actor, "ranged", { target });
}

/**
 * Sheet flow — "Melee Attack" button.
 * @param {Actor}  actor
 * @param {object} [opts]
 * @param {Token}  [opts.target]
 * @returns {Promise<object|null>}
 */
export async function promptMeleeAttack(actor, { target = null } = {}) {
  return promptAndRequest(actor, "melee", { target });
}

/**
 * Item-click flow — the user clicked a weapon item.
 * @param {Actor}  actor
 * @param {Item}   weapon
 * @param {object} [opts]
 * @param {Token}  [opts.target]
 * @returns {Promise<object|null>}
 */
export async function promptFromWeapon(actor, weapon, { target = null } = {}) {
  if (!weapon || weapon.type !== "weapon") {
    throw new AttackError(
      game.i18n.localize("THREEEIGHT.Attack.Err.NotAWeapon"),
      { actor, weapon }
    );
  }

  const attackType = await promptAttackType(weapon);
  if (!attackType) return null;

  return runAttack(actor, attackType, { weapon, target });
}

/**
 * Shared internal flow used by all three public prompts.
 * Resolves the weapon (via dialog), checks ammo for ranged,
 * shows the modifier prompt, then rolls.
 */
async function promptAndRequest(actor, attackType, { target = null } = {}) {
  const weapon = await promptWeaponSelection(actor, attackType);
  if (!weapon) return null;
  return runAttack(actor, attackType, { weapon, target });
}

async function runAttack(actor, attackType, { weapon, target = null } = {}) {
  if (!weapon) return null;

  // Ranged attacks use their own dialog and resolution pipeline.
  if (attackType === "ranged") {
    if (!Ranged.hasAmmo(weapon)) {
      ui.notifications.warn(
        game.i18n.localize("THREEEIGHT.Attack.Err.OutOfAmmo")
      );
      return null;
    }
    return Ranged.promptRangedAttack(actor, weapon, { target });
  }

  // Melee keeps the original placeholder-modifier flow.
  const modifierResult = await promptModifiers();
  if (!modifierResult) return null;
  return request(actor, null, {
    attackType,
    weapon,
    target,
    modifier: modifierResult.modifier ?? 0
  });
}

/* ── Low-level request ──────────────────────────────── */

/**
 * Perform an attack.
 *
 * The `action` parameter is optional — when omitted, the module
 * resolves the canonical action from the catalog for the attack
 * type (`rangedAttack` or `meleeAttack`) so downstream consumers
 * still see a well-formed action object.
 *
 * @param {Actor}  actor
 * @param {object|null} action
 * @param {object} context
 * @param {"ranged"|"melee"} context.attackType
 * @param {Item}   [context.weapon]
 * @param {Token}  [context.target]
 * @param {number} [context.modifier=0]
 * @param {string} [context.economy]     "slow" | "fast" | "reactive"
 * @returns {Promise<object>}
 */
export async function request(actor, action = null, context = {}) {
  if (!actor) {
    throw new AttackError(game.i18n.localize("THREEEIGHT.Attack.Err.NoActor"));
  }

  const { attackType, weapon, target = null, modifier = 0, economy = null } = context;
  const mod = moduleFor(attackType);

  if (!weapon) {
    throw new AttackError(
      game.i18n.localize("THREEEIGHT.Attack.Err.NoWeapon"),
      { actor, attackType }
    );
  }
  if (!mod.isEligibleWeapon(weapon)) {
    throw new AttackError(
      game.i18n.localize(`THREEEIGHT.Attack.Err.IneligibleWeapon.${attackType}`),
      { actor, weapon, attackType }
    );
  }
  if (attackType === "ranged" && !Ranged.hasAmmo(weapon)) {
    throw new AttackError(
      game.i18n.localize("THREEEIGHT.Attack.Err.OutOfAmmo"),
      { actor, weapon, attackType }
    );
  }

  // Resolve the canonical action if none was supplied.
  const resolvedAction = action ?? resolveAction(getAction(ACTIONS[attackType]));

  // Roll.
  const formula = mod.buildFormula(actor, weapon, { modifier });
  const roll = new Roll(formula);
  await roll.evaluate();

  const damage = mod.damageSummary(weapon);

  const attackContext = {
    actor,
    action:      resolvedAction,
    attackType,
    weapon,
    target,
    economy,
    modifier,
    formula,
    roll,
    total:       roll.total,
    damage:      damage.damage,
    penetration: damage.penetration,
    createdAt:   Date.now()
  };

  // Chat card.
  await postAttackCard(attackContext);

  // Downstream hook.
  Hooks.callAll("threeEightV2.resolveAttack", attackContext);

  return attackContext;
}

/* ── Chat output ────────────────────────────────────── */

async function postAttackCard(context) {
  const {
    actor, attackType, weapon, target, economy,
    formula, total, damage, penetration
  } = context;

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/three-eight-v2/templates/chat/attack-result.hbs",
    {
      actorName:     actor.name,
      attackLabel:   game.i18n.localize(`THREEEIGHT.Attack.Type.${attackType}`),
      weaponName:    weapon.name,
      targetName:    target?.name ?? "",
      economyLabel:  economy
        ? game.i18n.localize(`THREEEIGHT.Action.Type.${economy}`)
        : "",
      formula,
      total,
      damage,
      penetration
    }
  );

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls:   [context.roll],
    sound:   CONFIG.sounds.dice
  });
}
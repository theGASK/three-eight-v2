// module/action-economy.mjs

/**
 * Action Economy for Three-Eight v2.
 *
 * Every Actor gets:
 *   - one Slow Action slot
 *   - one Fast Action slot
 *
 * ...or, if the actor declares Double-Fast Mode before acting,
 * two Fast Action slots and no Slow slot. Free actions never
 * consume a slot and are not modelled here.
 *
 * The state lives on the actor under `system.actions`:
 *   system.actions.known    — pre-defined actions the sheet offers
 *   system.actions.economy  — live slow/fast slot state for the round
 *
 * The helper functions at the bottom are the API that sheets, macros
 * and combat-tracker integrations call. Nothing here renders UI; the
 * buttons on the sheet will call `declareAction` and `canDeclare`.
 */

const {
  HTMLField,
  StringField,
  BooleanField,
  NumberField,
  ArrayField,
  EmbeddedDataField
} = foundry.data.fields;

import { request as requestAttack } from "./attack.mjs";

/* ── Action Definition ──────────────────────────────── */

/**
 * A declarable Action.
 *
 *   name         — display name
 *   description  — rich-text body
 *   requisite    — the resource, item or condition the action needs
 *   isAttack     — if true, declaring the action triggers an attack
 */
export class ActionDefinition extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      name:        new StringField({ required: true, blank: false, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      requisite:   new StringField({ required: false, blank: true, initial: "" }),
      isAttack:    new BooleanField({ required: true, initial: false })
    };
  }

  /** Convenience: read an action's data as a plain object. */
  toPlain() {
    return {
      name:        this.name,
      description: this.description,
      requisite:   this.requisite,
      isAttack:    this.isAttack
    };
  }
}

/* ── Action Economy State ───────────────────────────── */

/**
 * Per-actor slot tracking. Reset at the start of every combat round.
 *
 * Two modes:
 *   standard     1 Slow + 1 Fast
 *   double-fast  0 Slow + 2 Fast
 *
 * The mode is committed at declaration time. Once any action has been
 * taken, switching is no longer allowed, so the actor keeps whichever
 * mode they started the round in.
 */
export class ActionEconomy extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      slowUsed:       new NumberField({ required: true, integer: true, min: 0, max: 1, initial: 0 }),
      fastUsed:       new NumberField({ required: true, integer: true, min: 0, max: 2, initial: 0 }),
      doubleFastMode: new BooleanField({ required: true, initial: false })
    };
  }

  /** Slow slots remaining. 0 when double-fast mode is active. */
  get slowAvailable() {
    if (this.doubleFastMode) return 0;
    return 1 - this.slowUsed;
  }

  /** Fast slots remaining. 1 in standard mode, 2 in double-fast. */
  get fastAvailable() {
    const cap = this.doubleFastMode ? 2 : 1;
    return cap - this.fastUsed;
  }

  /** True if any slot remains. */
  get canAct() {
    return this.slowAvailable > 0 || this.fastAvailable > 0;
  }

  /** True if no action has been taken yet this round. */
  get isFresh() {
    return this.slowUsed === 0 && this.fastUsed === 0;
  }

  /** Plain snapshot, useful for sheet context. */
  get summary() {
    return {
      slowUsed:       this.slowUsed,
      slowAvailable:  this.slowAvailable,
      fastUsed:       this.fastUsed,
      fastAvailable:  this.fastAvailable,
      doubleFastMode: this.doubleFastMode,
      canAct:         this.canAct,
      isFresh:        this.isFresh
    };
  }
}

/* ── Bundle ─────────────────────────────────────────── */

/**
 * The full actions block embedded in every Actor.
 */
export class ActionsData extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      known: new ArrayField(
        new EmbeddedDataField(ActionDefinition),
        { required: true, initial: [] }
      ),
      economy: new EmbeddedDataField(ActionEconomy)
    };
  }
}

/* ── Errors ─────────────────────────────────────────── */

export class ActionEconomyError extends Error {
  constructor(message, { actor = null, actionType = null } = {}) {
    super(message);
    this.name = "ActionEconomyError";
    this.actor = actor;
    this.actionType = actionType;
  }
}

/* ── Internal helpers ───────────────────────────────── */

/** @returns {ActionsData|undefined} */
function getActionsBlock(actor) {
  return actor?.system?.actions;
}

/** @returns {ActionEconomy|undefined} */
function getEconomy(actor) {
  return getActionsBlock(actor)?.economy;
}

/* ── Public API ─────────────────────────────────────── */

/**
 * True if the actor can declare an action of the given type right now.
 *
 * This is the function the sheet's button-enablement logic should call.
 *
 * @param {Actor}          actor
 * @param {"slow"|"fast"}  type
 * @returns {boolean}
 */
export function canDeclare(actor, type) {
  const economy = getEconomy(actor);
  if (!economy) return false;
  if (type === "slow") return economy.slowAvailable > 0;
  if (type === "fast") return economy.fastAvailable > 0;
  return false;
}

/**
 * Declare an action for the current round.
 *
 * Consumes one slot of the requested type. On a fast declaration,
 * optionally switches to double-fast mode first (allowed only when
 * the actor is fresh, i.e. has taken no action yet this round).
 *
 * @param {Actor}          actor
 * @param {"slow"|"fast"}  type
 * @param {object}        [options]
 * @param {object}        [options.action]      Plain action data:
 *                                              { name, description, requisite, isAttack }.
 * @param {boolean}       [options.doubleFast]  Request double-fast mode on
 *                                              a fresh actor. Ignored for slow.
 * @param {boolean}       [options.postToChat]  Whether to post a chat card.
 *                                              Defaults to true when an action is given.
 * @returns {Promise<{ economy: ActionEconomy, action: object|null }>}
 * @throws {ActionEconomyError}
 */
export async function declareAction(actor, type, {
  action = null,
  doubleFast = false,
  postToChat = true
} = {}) {
  const economy = getEconomy(actor);
  if (!economy) {
    throw new ActionEconomyError(
      game.i18n.localize("THREEEIGHT.Action.Err.NoEconomy"),
      { actor, actionType: type }
    );
  }

  // ── 1. Double-fast switch (fast only, fresh actor only) ──
  if (
    type === "fast" &&
    doubleFast &&
    economy.isFresh &&
    !economy.doubleFastMode
  ) {
    await actor.update({ "system.actions.economy.doubleFastMode": true });
  }

  // ── 2. Validate slot availability ──
  if (!canDeclare(actor, type)) {
    throw new ActionEconomyError(
      game.i18n.format("THREEEIGHT.Action.Err.NoSlot", {
        type: game.i18n.localize(`THREEEIGHT.Action.Type.${type}`)
      }),
      { actor, actionType: type }
    );
  }

  // ── 3. Consume the slot ──
  const key = type === "slow" ? "slowUsed" : "fastUsed";
  await actor.update({
    [`system.actions.economy.${key}`]: economy[key] + 1
  });

  // ── 4. Post to chat ──
  if (action && postToChat) {
    await postActionToChat(actor, type, action);
  }

  // ── 5. Attack resolution ──
  // Attack actions route through the unified attack API. The module
  // is a stub today; it emits a hook any future attack system can
  // consume. Manual actions (isAttack: false) skip this entirely.
  if (action?.isAttack) {
    try {
      await requestAttack(actor, action, { economy: type });
    } catch (err) {
      console.error(`three-eight-v2 | Attack request failed: ${err.message}`);
    }
  }

  return { economy: getEconomy(actor), action };
}

/**
 * Reset the actor's Action Economy. Called at the start of every
 * combat round. Also safe to call manually.
 * @param {Actor} actor
 */
export async function resetActionEconomy(actor) {
  if (!getEconomy(actor)) return;
  await actor.update({
    "system.actions.economy.slowUsed":       0,
    "system.actions.economy.fastUsed":       0,
    "system.actions.economy.doubleFastMode": false
  });
}

/**
 * Reset every combatant's economy at the start of a round.
 * Hook handler — see the entry point for the hook registration.
 * @param {Combat} combat
 */
export async function onCombatRound(combat) {
  const active = combat ?? game.combat;
  if (!active) return;
  const updates = [];
  for (const combatant of active.combatants) {
    const actor = combatant.actor;
    if (!actor || !getEconomy(actor)) continue;
    updates.push(resetActionEconomy(actor));
  }
  await Promise.all(updates);
}

/**
 * Record an action in the actor's known list, if not already present.
 * Idempotent on name.
 * @param {Actor}  actor
 * @param {object} action
 */
export async function addKnownAction(actor, action) {
  const known = getActionsBlock(actor)?.known ?? [];
  const exists = known.some(a => a.name === action.name);
  if (exists) return false;
  const next = [...known.map(a => a.toPlain ? a.toPlain() : a), action];
  await actor.update({ "system.actions.known": next });
  return true;
}

/* ── Chat output ────────────────────────────────────── */

async function postActionToChat(actor, type, action) {
  const typeLabel = game.i18n.localize(`THREEEIGHT.Action.Type.${type}`);
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/three-eight-v2/templates/chat/action-declared.hbs",
    {
      actorName:          actor.name,
      typeLabel,
      actionName:         action.name,
      actionDescription:  action.description,
      actionRequisite:    action.requisite,
      actionIsAttack:     action.isAttack
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}
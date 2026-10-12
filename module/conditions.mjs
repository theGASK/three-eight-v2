/**
 * Condition system for Three-Eight v2.
 *
 * Conditions live on every Actor under `system.conditions.entries`.
 * Each entry carries its own copy of the condition's name,
 * description, legal targets, modifier rules and current stack
 * count, so an applied condition survives even if the catalog
 * changes later.
 *
 * Modifier contributions: an active condition with N stacks adds
 * its modifier values N times to the actor's derived data. The
 * multiplier is applied inside `modifier.mjs` when the actor's
 * contributions are collected, so persistent effects (reduced
 * characteristics, penalties to skill rolls, etc.) flow through
 * the existing derivation pipeline with no special-casing.
 *
 * End-of-round effects: `tickConditions` fires the
 * `threeEightV2.conditionTick` hook with the actor and its active
 * conditions. Downstream code (a future damage module, or the
 * eventual condition list) uses that hook to apply instantaneous
 * effects like ongoing damage. Nothing else runs on tick — the
 * system simply provides the signal and the data.
 */

import { ModifierRule } from "./modifier-rule.mjs";
import { getConditionDefinition, resolveConditionDefinition } from "./conditions-catalog.mjs";

const {
  HTMLField,
  StringField,
  BooleanField,
  NumberField,
  ArrayField,
  EmbeddedDataField
} = foundry.data.fields;

/* ── Data Models ────────────────────────────────────── */

/**
 * A single applied condition on an actor.
 *
 * `key`          — matches the catalog entry
 * `id`           — stable per-instance identifier
 * `stacks`       — 0+ ; 0 means the condition is spent
 * `isActive`     — the toggleable flag
 * `modifiers`    — cached copy of the catalog entry's rules
 */
export class ConditionEntry extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      id:           new StringField({ required: true, blank: false, initial: "" }),
      key:          new StringField({ required: true, blank: false, initial: "" }),
      name:         new StringField({ required: true, blank: false, initial: "" }),
      description:  new HTMLField({ required: false, blank: true, initial: "" }),
      legalTargets: new ArrayField(new StringField(), { initial: [] }),
      stacks:       new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      isActive:     new BooleanField({ required: true, initial: true }),
      modifiers:    new ArrayField(new EmbeddedDataField(ModifierRule), { initial: [] })
    };
  }

  /** True if this entry currently contributes modifiers. */
  get contributes() {
    return this.isActive && this.stacks > 0;
  }
}

/**
 * The full conditions block embedded in every Actor.
 */
export class ConditionsData extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      entries: new ArrayField(
        new EmbeddedDataField(ConditionEntry),
        { required: true, initial: [] }
      )
    };
  }

  /** Every entry that is active and has at least one stack. */
  get active() {
    return this.entries.filter(e => e.contributes);
  }

  /** @returns {ConditionEntry|null} */
  getByKey(key) {
    return this.entries.find(e => e.key === key) ?? null;
  }

  /** @returns {boolean} */
  has(key) {
    return this.entries.some(e => e.key === key);
  }
}

/* ── Errors ─────────────────────────────────────────── */

export class ConditionError extends Error {
  constructor(message, { actor = null, condition = null, key = null } = {}) {
    super(message);
    this.name = "ConditionError";
    this.actor = actor;
    this.condition = condition;
    this.key = key;
  }
}

/* ── Internal helpers ───────────────────────────────── */

function getBlock(actor) {
  return actor?.system?.conditions;
}

function plainEntry(entry) {
  return {
    id:           entry.id,
    key:          entry.key,
    name:         entry.name,
    description:  entry.description,
    legalTargets: Array.from(entry.legalTargets ?? []),
    stacks:       entry.stacks,
    isActive:     entry.isActive,
    modifiers:    (entry.modifiers ?? []).map(m =>
      m.toPlain ? m.toPlain() : m
    )
  };
}

async function writeEntries(actor, entries) {
  await actor.update({ "system.conditions.entries": entries });
}

/* ── Queries ────────────────────────────────────────── */

/** @returns {ConditionEntry|null} */
export function getCondition(actor, key) {
  return getBlock(actor)?.getByKey(key) ?? null;
}

/** @returns {boolean} */
export function hasCondition(actor, key) {
  return getBlock(actor)?.has(key) ?? false;
}

/** @returns {ConditionEntry[]} */
export function listConditions(actor) {
  return getBlock(actor)?.entries ?? [];
}

/** @returns {ConditionEntry[]} */
export function listActiveConditions(actor) {
  return getBlock(actor)?.active ?? [];
}

/* ── Legal-target check ─────────────────────────────── */

/**
 * True if `actorType` is a legal target for the given condition.
 * An empty `legalTargets` array means "any actor type".
 *
 * @param {{ legalTargets?: string[] }} condition
 * @param {string}                     actorType
 * @returns {boolean}
 */
export function isLegalTarget(condition, actorType) {
  const list = Array.from(condition?.legalTargets ?? []);
  if (list.length === 0) return true;
  return list.includes(actorType);
}

/* ── Mutations ──────────────────────────────────────── */

/**
 * Apply a condition to an actor.
 *
 * Accepts either a catalog key or a resolved condition object
 * (matching `resolveConditionDefinition`'s output). If the actor
 * already carries the condition, its stacks are incremented instead.
 *
 * @param {Actor}  actor
 * @param {string|object} condition  Catalog key or resolved condition.
 * @param {object} [options]
 * @param {number} [options.stacks=1]  Initial stacks when newly applied.
 * @returns {Promise<ConditionEntry>}
 * @throws {ConditionError} on missing actor, unknown condition,
 *                          or illegal target.
 */
export async function applyCondition(actor, condition, { stacks = 1 } = {}) {
  if (!actor) {
    throw new ConditionError(
      game.i18n.localize("THREEEIGHT.Condition.Err.NoActor"),
      { actor, condition }
    );
  }

  const resolved = typeof condition === "string"
    ? resolveByKey(condition)
    : condition;

  if (!resolved?.key) {
    throw new ConditionError(
      game.i18n.localize("THREEEIGHT.Condition.Err.NoCondition"),
      { actor, condition }
    );
  }

  if (!isLegalTarget(resolved, actor.type)) {
    throw new ConditionError(
      game.i18n.format("THREEEIGHT.Condition.Err.NotLegalTarget", {
        type: actor.type
      }),
      { actor, condition: resolved, key: resolved.key }
    );
  }

  const block = getBlock(actor);
  if (!block) {
    throw new ConditionError(
      game.i18n.localize("THREEEIGHT.Condition.Err.NoBlock"),
      { actor, condition: resolved }
    );
  }

  const existing = block.getByKey(resolved.key);
  if (existing) {
    return incrementCondition(actor, resolved.key, stacks);
  }

  const entry = {
    id:           foundry.utils.randomID(),
    key:          resolved.key,
    name:         resolved.name,
    description:  resolved.description ?? "",
    legalTargets: Array.from(resolved.legalTargets ?? []),
    stacks:       Math.max(1, Math.floor(Number(stacks) || 1)),
    isActive:     true,
    modifiers:    (resolved.modifiers ?? []).map(m => ({
      container: m.container ?? "actor",
      appliesTo: Array.from(m.appliesTo ?? []),
      target:    m.target ?? "",
      operator:  m.operator ?? "+",
      value:     Number(m.value) || 0
    }))
  };

  await writeEntries(actor, [...block.entries.map(plainEntry), entry]);
  return getCondition(actor, entry.key);
}

/**
 * Increase a condition's stacks. Creates the condition if it isn't
 * already present (with `stacks` as its initial value).
 *
 * @param {Actor}  actor
 * @param {string} key
 * @param {number} [by=1]
 * @returns {Promise<ConditionEntry|null>}
 */
export async function incrementCondition(actor, key, by = 1) {
  const block = getBlock(actor);
  if (!block) return null;

  const existing = block.getByKey(key);
  if (!existing) {
    // Create fresh at the requested stack count.
    const definition = getConditionDefinition(key);
    if (!definition) {
      throw new ConditionError(
        game.i18n.format("THREEEIGHT.Condition.Err.UnknownKey", { key }),
        { actor, key }
      );
    }
    return applyCondition(actor, resolveConditionDefinition(definition), { stacks: by });
  }

  const step = Math.max(1, Math.floor(Number(by) || 1));
  const entries = block.entries.map(entry => {
    if (entry.key !== key) return plainEntry(entry);
    return { ...plainEntry(entry), stacks: entry.stacks + step };
  });
  await writeEntries(actor, entries);
  return getCondition(actor, key);
}

/**
 * Decrease a condition's stacks. Removes the condition entirely
 * when stacks reach 0.
 *
 * @param {Actor}  actor
 * @param {string} key
 * @param {number} [by=1]
 * @returns {Promise<ConditionEntry|null>}  Null when the entry was removed.
 */
export async function decrementCondition(actor, key, by = 1) {
  const block = getBlock(actor);
  if (!block) return null;

  const existing = block.getByKey(key);
  if (!existing) {
    throw new ConditionError(
      game.i18n.format("THREEEIGHT.Condition.Err.NotFound", { key }),
      { actor, key }
    );
  }

  const step = Math.max(1, Math.floor(Number(by) || 1));
  const nextStacks = Math.max(0, existing.stacks - step);

  if (nextStacks === 0) {
    return removeCondition(actor, key);
  }

  const entries = block.entries.map(entry => {
    if (entry.key !== key) return plainEntry(entry);
    return { ...plainEntry(entry), stacks: nextStacks };
  });
  await writeEntries(actor, entries);
  return getCondition(actor, key);
}

/**
 * Remove a condition entirely.
 * @returns {Promise<null>}  Always null; present so callers can
 *                          chain off the same return type.
 */
export async function removeCondition(actor, key) {
  const block = getBlock(actor);
  if (!block) return null;
  const entries = block.entries
    .filter(entry => entry.key !== key)
    .map(plainEntry);
  await writeEntries(actor, entries);
  return null;
}

/**
 * Set a condition's stacks to an exact value. `stacks <= 0` removes
 * the condition.
 */
export async function setStacks(actor, key, stacks) {
  const n = Math.floor(Number(stacks) || 0);
  if (n <= 0) return removeCondition(actor, key);

  const block = getBlock(actor);
  if (!block) return null;
  const existing = block.getByKey(key);
  if (!existing) {
    const definition = getConditionDefinition(key);
    if (!definition) {
      throw new ConditionError(
        game.i18n.format("THREEEIGHT.Condition.Err.UnknownKey", { key }),
        { actor, key }
      );
    }
    return applyCondition(actor, resolveConditionDefinition(definition), { stacks: n });
  }

  const entries = block.entries.map(entry => {
    if (entry.key !== key) return plainEntry(entry);
    return { ...plainEntry(entry), stacks: n };
  });
  await writeEntries(actor, entries);
  return getCondition(actor, key);
}

/**
 * Toggle a condition's active flag on or off.
 * @param {Actor}   actor
 * @param {string}  key
 * @param {boolean} [isActive]  Explicit value; omit to flip.
 */
export async function toggleCondition(actor, key, isActive) {
  const block = getBlock(actor);
  if (!block) return null;
  const existing = block.getByKey(key);
  if (!existing) {
    throw new ConditionError(
      game.i18n.format("THREEEIGHT.Condition.Err.NotFound", { key }),
      { actor, key }
    );
  }
  const next = typeof isActive === "boolean" ? isActive : !existing.isActive;
  const entries = block.entries.map(entry => {
    if (entry.key !== key) return plainEntry(entry);
    return { ...plainEntry(entry), isActive: next };
  });
  await writeEntries(actor, entries);
  return getCondition(actor, key);
}

/* ── End-of-round tick ──────────────────────────────── */

/**
 * Fire end-of-round processing for an actor's conditions.
 *
 * Emits `threeEightV2.conditionTick` with `(actor, activeConditions)`.
 * Downstream code subscribes to that hook to apply instantaneous
 * effects such as ongoing damage. The system itself does not mutate
 * any resource here — the multiplier × stacks is already applied to
 * derived data continuously, and instantaneous effects need context
 * the system does not yet own.
 *
 * @param {Actor} actor
 * @returns {Promise<ConditionEntry[]>}  The entries that were ticked.
 */
export async function tickConditions(actor) {
  const active = listActiveConditions(actor);
  if (active.length === 0) return active;
  Hooks.callAll("threeEightV2.conditionTick", actor, active);
  return active;
}

/**
 * Fires on `combatRound` — fires as the round number advances, i.e.
 * at the boundary between the previous round ending and the new one
 * beginning. Ticks every combatant's conditions.
 *
 * @param {Combat} combat
 */
export async function onCombatRound(combat) {
  const active = combat ?? game.combat;
  if (!active) return;
  const tasks = [];
  for (const combatant of active.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    tasks.push(tickConditions(actor));
  }
  await Promise.all(tasks);
}

/* ── Utilities ──────────────────────────────────────── */

function resolveByKey(key) {
  const definition = getConditionDefinition(key);
  if (!definition) {
    throw new ConditionError(
      game.i18n.format("THREEEIGHT.Condition.Err.UnknownKey", { key }),
      { key }
    );
  }
  return resolveConditionDefinition(definition);
}
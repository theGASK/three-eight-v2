/**
 * Universal modifier system for Three-Eight v2.
 *
 * Modifier-Type items (mod / power / quality / flaw / ammunition)
 * carry an array of `ModifierRule` entries in `system.modifiers`.
 * Each rule describes a change to a target on a container document
 * (an Actor or an Item).
 *
 * This module:
 *   - validates rules against a document, throwing ModifierError
 *     when the rule is illegal for that document (wrong container,
 *     wrong type, or a target that doesn't exist);
 *   - collects all rules embedded on an Actor and computes the
 *     net contribution per target path;
 *   - exposes the results so Actor/Item data models can fold the
 *     contributions into their derived values.
 *
 * No rule mutates stored data. Contributions are applied only
 * during `prepareDerivedData`, so removing the Modifier-Type item
 * cleanly reverses the change.
 */

import { SYNTHETIC_TARGETS } from "./constants.mjs";

/* ── Errors ─────────────────────────────────────────── */

export class ModifierError extends Error {
  /**
   * @param {string} message  Localized message.
   * @param {object} [context]
   * @param {object} [context.rule]      The offending rule.
   * @param {object} [context.document]  The document the rule was applied to.
   */
  constructor(message, { rule = null, document = null } = {}) {
    super(message);
    this.name = "ModifierError";
    this.rule = rule;
    this.document = document;
  }
}

/* ── Modifier Item types ───────────────────────────── */

export const MODIFIER_ITEM_TYPES = Object.freeze([
  "mod", "power", "quality", "flaw", "ammunition", "disease"
]);

/** @returns {boolean} True if the item is a Modifier-Type item. */
export function isModifierItem(item) {
  return !!item && MODIFIER_ITEM_TYPES.includes(item.type);
}

/* ── Target resolution ─────────────────────────────── */

/** @returns {"actor"|"item"} The container this document represents. */
function containerOf(document) {
  return document?.documentName === "Actor" ? "actor" : "item";
}

/**
 * @returns {boolean} True if the path is a valid target for the document,
 *   either as a schema field (system.<path>) or as a registered synthetic.
 */
export function targetExists(document, path) {
  if (!path) return false;
  if (SYNTHETIC_TARGETS[path]) return true;
  return foundry.utils.hasProperty(document?.system ?? {}, path);
}

/* ── Rule validation ───────────────────────────────── */

/**
 * Validate a single rule against a document.
 * @throws {ModifierError} if the rule is illegal for the document.
 * @returns {true} on success.
 */
export function validateRule(document, rule) {
  if (!document) throw new ModifierError(game.i18n.localize("THREEEIGHT.Modifier.Err.NoDocument"));
  if (!rule)     throw new ModifierError(game.i18n.localize("THREEEIGHT.Modifier.Err.NoRule"));

  // 1. Container must match the document kind.
  const expected = containerOf(document);
  if (rule.container !== expected) {
    throw new ModifierError(
      game.i18n.format("THREEEIGHT.Modifier.Err.ContainerMismatch", {
        container: rule.container,
        expected,
        type: document.type
      }),
      { rule, document }
    );
  }

  // 2. The rule must allow this document type.
  const appliesTo = Array.from(rule.appliesTo ?? []);
  if (appliesTo.length > 0 && !appliesTo.includes(document.type)) {
    throw new ModifierError(
      game.i18n.format("THREEEIGHT.Modifier.Err.TypeNotAllowed", {
        type: document.type,
        allowed: appliesTo.join(", ")
      }),
      { rule, document }
    );
  }

  // 3. The target must exist on the document.
  if (!targetExists(document, rule.target)) {
    throw new ModifierError(
      game.i18n.format("THREEEIGHT.Modifier.Err.TargetMissing", {
        target: rule.target,
        type: document.type
      }),
      { rule, document }
    );
  }

  return true;
}

/**
 * Validate every rule on an item source against a document.
 * Used by drop handlers before the item is embedded.
 * @param {Actor|Item} document     The target document.
 * @param {object}     itemSource   The raw item data (e.g. item.toObject()).
 * @throws {ModifierError}
 * @returns {true} on success.
 */
export function validateItemForDrop(document, itemSource) {
  if (!isModifierItem(itemSource)) return true;
  const modifiers = itemSource.system?.modifiers ?? [];
  for (const rule of modifiers) validateRule(document, rule);
  return true;
}

/* ── Collection ────────────────────────────────────── */

/**
 * Collect all modifier rules from Modifier-Type items and from active
 * Conditions on the given Actor.
 *
 * Each result carries a `multiplier` — 1 for item-sourced rules,
 * the condition's stack count for condition-sourced rules. The
 * multiplier is applied when contributions are computed.
 *
 * @returns {Array<{ source: object, rule: object, multiplier: number }>}
 */
export function collectModifierRules(actor) {
  if (actor?.documentName !== "Actor") return [];
  const out = [];

  // Items
  for (const item of actor.items) {
    if (!isModifierItem(item)) continue;
    const list = item.system?.modifiers ?? [];
    for (const rule of list) out.push({ source: item, rule, multiplier: 1 });
  }

  // Conditions
  const conditions = actor.system?.conditions?.active ?? [];
  for (const condition of conditions) {
    const list = condition.modifiers ?? [];
    for (const rule of list) {
      out.push({
        source:     condition,
        rule,
        multiplier: condition.stacks
      });
    }
  }

  return out;
}

/**
 * Compute contributions from modifier rules targeting the Actor
 * itself (container === "actor").
 *
 * Rules that fail validation are skipped with a console warning —
 * this keeps a stale or misapplied rule from breaking every actor
 * that carries it. To refuse the drop in the first place, call
 * `validateItemForDrop` from the sheet's drop handler.
 *
 * @param {Actor} actor
 * @returns {Map<string, Array<{ sourceId, sourceName, value }>>}
 */
export function computeActorContributions(actor) {
  const map = new Map();
  if (!actor) return map;

  for (const { source, rule, multiplier } of collectModifierRules(actor)) {
    if (rule.container !== "actor") continue;

    try {
      validateRule(actor, rule);
    } catch (err) {
      console.warn(`three-eight-v2 | Invalid modifier on "${source.name}": ${err.message}`);
      continue;
    }

    const signed = rule.operator === "-" ? -Math.abs(rule.value) : Math.abs(rule.value);
    const scaled = signed * (Number(multiplier) || 1);

    if (!map.has(rule.target)) map.set(rule.target, []);
    map.get(rule.target).push({
      sourceId:   source.id ?? source.key ?? null,
      sourceName: source.name,
      value:      scaled
    });
  }

  return map;
}

/**
 * Compute contributions targeting Items of a given type on the Actor
 * (container === "item").
 *
 * @param {Actor}  actor
 * @param {string} itemType
 * @returns {Map<string, Array<{ sourceId, sourceName, value }>>}
 */
export function computeItemContributions(actor, itemType) {
  const map = new Map();
  if (!actor) return map;

  for (const { source, rule, multiplier } of collectModifierRules(actor)) {
    if (rule.container !== "item") continue;

    const appliesTo = Array.from(rule.appliesTo ?? []);
    if (appliesTo.length > 0 && !appliesTo.includes(itemType)) continue;

    const signed = rule.operator === "-" ? -Math.abs(rule.value) : Math.abs(rule.value);
    const scaled = signed * (Number(multiplier) || 1);

    if (!map.has(rule.target)) map.set(rule.target, []);
    map.get(rule.target).push({
      sourceId:   source.id ?? source.key ?? null,
      sourceName: source.name,
      value:      scaled
    });
  }

  return map;
}

/* ── Summation helpers ─────────────────────────────── */

/**
 * Sum every entry for a single path. Returns 0 if none exist.
 * @param {Map}    contributions  Result of computeActorContributions.
 * @param {string} path
 * @returns {number}
 */
export function sumContributions(contributions, path) {
  const list = contributions?.get?.(path);
  if (!list || list.length === 0) return 0;
  return list.reduce((total, entry) => total + (Number(entry.value) || 0), 0);
}

/**
 * List the modifier items contributing to a given path — useful for
 * tooltips and sheet badges.
 * @returns {Array<{ sourceId, sourceName, value }>}
 */
export function listContributors(contributions, path) {
  return contributions?.get?.(path) ?? [];
}

/**
 * Full public entry point. Call from any code that needs the actor's
 * modifier state without re-walking the item collection.
 * @returns {{
 *   contributions: Map,
 *   total: (path: string) => number,
 *   contributors: (path: string) => Array
 * }}
 */
export function getModifierState(actor) {
  const contributions = computeActorContributions(actor);
  return {
    contributions,
    total:        (path) => sumContributions(contributions, path),
    contributors: (path) => listContributors(contributions, path)
  };
}
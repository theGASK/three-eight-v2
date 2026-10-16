# Three-Eight v2 — Foundry VTT System

A custom game system for Foundry Virtual Tabletop v14 that implements the **Three-Eight** ruleset — a gritty, tactical RPG with a unique action economy, characteristic-driven derivation, and a universal modifier pipeline.

## Overview

Three-Eight v2 is a complete Foundry VTT game system built around a modular architecture. It provides character sheets for nine actor types and fifteen item types, a dual-slot action economy, a conditions system with stackable persistent effects, and a universal modifier engine that lets items (mods, powers, qualities, flaws, ammunition, diseases) alter actor and item data without mutating stored values.

The system is designed for Foundry VTT **v14** (minimum and verified), and is currently in early development (`version: 0.0.1`).

---

## Table of Contents

- [Features](#features)
  - [Actor Types](#actor-types)
  - [Item Types](#item-types)
  - [Action Economy](#action-economy)
  - [Skill Rolls](#skill-rolls)
  - [Conditions System](#conditions-system)
  - [Universal Modifier System](#universal-modifier-system)
  - [Characteristic Score Table](#characteristic-score-table)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Public API](#public-api)
  - [The `game.threeEightV2` Namespace](#the-gamethreeeightv2-namespace)
  - [`action` — Action Economy](#action--action-economy)
  - [`effort` — Effort Pool](#effort--effort-pool)
  - [`wounds` — Wounds Track](#wounds--wounds-track)
  - [`conditions` — Conditions](#conditions--conditions)
  - [`modifier` — Modifier Engine](#modifier--modifier-engine)
  - [`dice` — Rolls and Parsing](#dice--rolls-and-parsing)
  - [`attacks` — Attack Resolution](#attacks--attack-resolution)
  - [`equipment` — Equipment](#equipment--equipment)
  - [`constants` / `config` — Tables and Configuration](#constants--config--tables-and-configuration)
- [Hooks](#hooks)
  - [Lifecycle Hooks](#lifecycle-hooks)
  - [Action & Attack Hooks](#action--attack-hooks)
  - [Condition Hooks](#condition-hooks)
  - [Wounds & Effort Hooks](#wounds--effort-hooks)
  - [Roll Hooks](#roll-hooks)
  - [Modifier Hooks](#modifier-hooks)
  - [Hook Reference Table](#hook-reference-table)
- [Extending the System](#extending-the-system)
- [Repository Structure](#repository-structure)
- [Architecture Notes](#architecture-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Actor Types

The system supports nine distinct actor types, each with its own data model and derivation rules:

| Actor Type | Primary Characteristics | Secondary Characteristics |
|---|---|---|
| **PC** | Fitness, Agility, Intelligence, Morale | Experience, Reputation, Wealth |
| **NPC** | Fitness, Agility, Intelligence, Morale | — |
| **Animal** | Fitness, Agility, Intelligence, Morale | — |
| **Small Vehicle** | Class, Integrity, Speed, Capacity | — |
| **Large Vehicle** | Class, Integrity, Speed, Capacity | — |
| **Drone** | Class, Integrity, Speed, Capacity | — |
| **Server** | Class, Integrity, Speed, Capacity | — |
| **Faction** | Morale | Experience, Reputation, Wealth |
| **Base of Operations** | Class, Integrity, Speed, Capacity | — |

Wounds and Effort are derived from primary characteristics for PCs, NPCs, and Animals (Wounds from Fitness; Effort from avg↑(Fitness, Morale)). For vehicles, drones, servers, factions, and bases, these values are stored manually. Initiative is `2d8 + agilityDM` for humanoid actors and `2d8 + speedDM` for vehicles and installations.

### Item Types

Fifteen item types are available: general objects, weapons, containers, skills, spells, mods, specialties, powers, qualities, flaws, ammunition, diseases, individual armor, vehicle armor, and shields.

### Action Economy

Every actor has **one Slow Action slot** and **one Fast Action slot** per round, or — if they declare **Double-Fast Mode** before acting — **two Fast Action slots and no Slow slot**. Free actions never consume a slot. The mode is committed at declaration time; once any action has been taken, switching is no longer allowed.

The action economy API exposes `canDeclare(actor, slotType)` and `declareAction(actor, slotType, options)` for sheets, macros, and combat-tracker integrations. Attack actions (`isAttack: true`) fire a `threeEightV2.declareAttack` hook for downstream resolution modules.

### Skill Rolls

Skill checks use a **2d8** base formula (configurable via `SKILL_ROLL_FORMULA`). The system provides a skill-roll dialog with difficulty presets (Trivial TN 2, Routine 5, Average 10, Difficult 12, Heroic 14, Formidable 16, Impossible 20), characteristic modifiers, task-chain DMs, extra modifiers, and an option to spend 1 Effort for +1d8.

A modifier-string parser accepts user input such as `2+1d8+1[Lucky]-10[Dark]` and converts it into a Roll-compatible formula fragment.

### Conditions System

Conditions live on every actor under `system.conditions.entries`. Each entry carries its own copy of the condition's name, description, legal targets, modifier rules, and current stack count — so an applied condition survives even if the catalog changes later. Active conditions with N stacks add their modifier values N times to the actor's derived data, flowing through the existing derivation pipeline without special-casing. An end-of-round `threeEightV2.conditionTick` hook fires for downstream ongoing-effect modules.

### Universal Modifier System

Modifier-Type items (mod, power, quality, flaw, ammunition, disease) carry an array of `ModifierRule` entries. Each rule describes a change to a target on a container document (Actor or Item). Rules are validated against the document, collected across all embedded items, and folded into derived values during `prepareDerivedData` — so removing a modifier item cleanly reverses its effect. No rule ever mutates stored data.

### Characteristic Score Table

Every characteristic score (primary or secondary) resolves through a fixed table that maps the score to a derived modifier (DM), effort, wounds, stress, reputation tier, and wealth tier. Scores range from 0 (DM −3, wounds 1) to 17+ (DM +3, wounds 15).

---

## Installation

1. In Foundry VTT, go to **Game Systems** → **Install System**.
2. Paste the manifest URL: `https://raw.githubusercontent.com/theGASK/three-eight-v2/main/system.json`
3. Click **Install**.

Alternatively, clone the repository into your Foundry VTT `Data/systems/` directory.

---

## Quick Start

### Skill Rolls from Macros

```js
// Directly on an item
const skill = actor.items.getName("Firearms");
await skill.rollSkill({ tn: 12, difficulty: "Difficult" });

// Via the dialog
const skill = actor.items.getName("Firearms");
await game.threeEightV2.dice.promptSkillRoll(skill);
```

### Action Economy from Macros

```js
const action = game.threeEightV2.action;

// Check availability
const canSlow = action.canDeclare(actor, "slow");
const canFast = action.canDeclare(actor, "fast");

// Declare a slow action
await action.declareAction(actor, "slow", {
  action: { name: "Aim", requisite: "Ranged weapon", isAttack: false }
});

// Declare a fast action in Double-Fast Mode
await action.declareAction(actor, "fast", {
  doubleFast: true,
  action: { name: "Snap Shot", requisite: "Loaded weapon", isAttack: true }
});
```

---

## Public API

Everything the system exposes lives on the global `game.threeEightV2` namespace, attached during the `ready` hook. All sub-modules are plain objects with named methods — no classes to instantiate, no singletons to import. From a macro, a module, or the browser console, the pattern is always:

```js
game.threeEightV2.<module>.<method>(...)
```

> **Note on mutability:** Methods that change actor state (`declareAction`, `spend`, `modify`, `apply`, `remove`, …) return a `Promise` and persist their changes to the actor document. They are safe to `await`. Methods that only read (`canDeclare`, `get`, `has`, `collect`, `parseModifiers`, …) are synchronous.

### The `game.threeEightV2` Namespace

```js
game.threeEightV2 = {
  api,          // { version, systemId, modules: Map }
  action,       // Action economy — slots, modes, declaration
  attacks,      // Attack pipeline — melee, ranged, resolution
  conditions,   // Conditions — apply, remove, tick, catalog
  constants,    // Difficulty table, characteristic table, skill groups
  config,       // System configuration (T8.config aliases)
  dice,         // Modifier parser, skill-roll helpers, dialogs
  effort,       // Effort pool — spend, recover, read
  equipment,    // Equipment equip/unequip helpers
  modifier,     // Modifier collection, validation, target registry
  wounds,       // Wounds track — modify, recover, read
};
```

You can confirm the namespace is loaded and introspect it at any time:

```js
console.log(game.threeEightV2.api.version);
console.log(Object.keys(game.threeEightV2));
```

### `action` — Action Economy

Tracks Slow/Fast slots, the Double-Fast commitment, and per-round reset.

| Method | Signature | Returns | Description |
|---|---|---|---|
| `canDeclare` | `(actor, slotType, options?)` | `boolean` | Whether the actor may still take an action of `slotType` (`"slow"` \| `"fast"`). Returns `false` if the slot is spent, if Double-Fast Mode is active and `"slow"` is requested, or if the actor is incapacitated. |
| `declareAction` | `(actor, slotType, options?)` | `Promise<ActionRecord \| null>` | Consumes the slot, records the action on the actor, posts a chat card, and fires the corresponding hooks. Returns the recorded action, or `null` if the declaration was vetoed or invalid. |
| `getMode` | `(actor)` | `"standard" \| "doubleFast"` | Current mode for the round. |
| `setMode` | `(actor, mode)` | `Promise<void>` | Commits the actor to a mode. Only legal before any action has been taken this round. |
| `getSlots` | `(actor)` | `{ slow: Slot, fast: Slot[] }` | Live slot objects with `used` and `action` fields. |
| `reset` | `(actor)` | `Promise<void>` | Clears all slots and the mode for the current round. |
| `resetAll` | `()` | `Promise<void>` | Calls `reset` on every actor in the world. Useful from a "new round" macro. |
| `catalog` | — | `ActionCatalog` | The pre-defined action catalog (see [`action-catalog.mjs`](#repository-structure)). |

**`options` accepted by `declareAction`:**

```js
{
  doubleFast: false,        // boolean — declare under Double-Fast Mode
  action: {
    name: "Aim",            // string — display name
    requisite: "Ranged weapon",
    isAttack: false,        // boolean — routes through the attack pipeline
    cost: 1,                // optional override
    itemId: null,           // optional source item
    data: {}                // free-form payload passed to hooks
  },
  skipChat: false,          // suppress the chat card
  skipHooks: false          // suppress hook emission (internal use)
}
```

**Example — a custom "Overwatch" slow action:**

```js
const action = game.threeEightV2.action;
if (action.canDeclare(actor, "slow")) {
  await action.declareAction(actor, "slow", {
    action: {
      name: "Overwatch",
      requisite: "Readied ranged weapon",
      isAttack: false,
      data: { arc: "front", trigger: "movement" }
    }
  });
}
```

### `effort` — Effort Pool

Effort is derived from `avg↑(Fitness, Morale)` for humanoids and stored manually for installations. The maximum is read from the characteristic table.

| Method | Signature | Returns | Description |
|---|---|---|---|
| `get` | `(actor)` | `number` | Current Effort. |
| `getMax` | `(actor)` | `number` | Maximum Effort from the characteristic table, plus any modifier contributions. |
| `spend` | `(actor, amount, reason?)` | `Promise<number>` | Deducts Effort, clamps at 0, fires `threeEightV2.effortChanged`. Returns the new value. |
| `recover` | `(actor, amount, reason?)` | `Promise<number>` | Restores Effort, clamps at max. |
| `set` | `(actor, value)` | `Promise<number>` | Hard-set (GM / admin use). |
| `canSpend` | `(actor, amount)` | `boolean` | Guard for UI and macros. |

```js
const effort = game.threeEightV2.effort;
if (effort.canSpend(actor, 1)) {
  await effort.spend(actor, 1, "Skill roll — +1d8");
}
```

### `wounds` — Wounds Track

Wounds are derived from `Fitness` for humanoids and stored manually for vehicles and installations.

| Method | Signature | Returns | Description |
|---|---|---|---|
| `get` | `(actor)` | `number` | Current Wounds. |
| `getMax` | `(actor)` | `number` | Wound threshold from the characteristic table, plus modifiers. |
| `modify` | `(actor, delta, options?)` | `Promise<number>` | Applies damage (`delta < 0`) or healing (`delta > 0`). Clamps to `[0, max]`. Fires `threeEightV2.woundsChanged`. |
| `recover` | `(actor, amount)` | `Promise<number>` | Convenience wrapper for `modify(actor, +amount)`. |
| `set` | `(actor, value)` | `Promise<number>` | Hard-set (GM / admin use). |
| `isDown` | `(actor)` | `boolean` | `true` when Wounds are at 0. |
| `getThreshold` | `(actor, level)` | `number` | Reads a specific wound threshold (e.g. `"serious"`, `"critical"`) if the ruleset defines named bands. |

```js
const wounds = game.threeEightV2.wounds;
await wounds.modify(actor, -3, { source: "Rifle", type: "ballistic" });
if (wounds.isDown(actor)) ui.notifications.warn(`${actor.name} is down!`);
```

### `conditions` — Conditions

Conditions are stored per-actor under `system.conditions.entries`, each entry carrying a snapshot of the catalog definition plus a `stacks` counter. Stacks multiply the condition's modifier values N times during derivation.

**Instance methods**

| Method | Signature | Returns | Description |
|---|---|---|---|
| `apply` | `(actor, conditionId, stacks = 1, options?)` | `Promise<ConditionEntry>` | Adds or increments a condition. Fires `threeEightV2.conditionApplied`. |
| `remove` | `(actor, conditionId, stacks = Infinity)` | `Promise<boolean>` | Decrements stacks; removes the entry entirely when stacks reach 0. Fires `threeEightV2.conditionRemoved`. |
| `has` | `(actor, conditionId)` | `boolean` | Whether the actor has at least one stack. |
| `getStacks` | `(actor, conditionId)` | `number` | Current stack count (0 if absent). |
| `get` | `(actor, conditionId)` | `ConditionEntry \| null` | The full entry, including its snapshotted definition. |
| `list` | `(actor)` | `ConditionEntry[]` | All active entries. |
| `tick` | `(actor)` | `Promise<ConditionEntry[]>` | Runs end-of-round expiry and ongoing effects. Fires `threeEightV2.conditionTick`. |
| `tickAll` | `()` | `Promise<void>` | `tick` on every actor. |
| `clear` | `(actor)` | `Promise<void>` | Removes all conditions. |

**Catalog methods**

| Method | Signature | Returns | Description |
|---|---|---|---|
| `catalog` | — | `Map<string, ConditionDefinition>` | The loaded catalog. |
| `getDefinition` | `(id)` | `ConditionDefinition \| null` | Look up a catalog entry by id. |
| `listDefinitions` | `(filter?)` | `ConditionDefinition[]` | All definitions, optionally filtered by `{ target, tag }`. |
| `register` | `(definition)` | `void` | Add or replace a catalog entry at runtime (see [Extending the System](#extending-the-system)). |

```js
const conditions = game.threeEightV2.conditions;

await conditions.apply(actor, "bleeding", 2);          // 2 stacks
console.log(conditions.getStacks(actor, "bleeding"));  // 2

await conditions.remove(actor, "bleeding", 1);         // down to 1
await conditions.remove(actor, "bleeding");            // removed entirely

await conditions.tickAll();                            // end-of-round pass
```

### `modifier` — Modifier Engine

The modifier engine is the heart of the system. It collects `ModifierRule` entries from every embedded Modifier-Type item, from active conditions, and from registered synthetic targets, then folds them into derived values during `prepareDerivedData`. Rules never mutate stored data — removing the source cleanly reverses the effect.

| Method | Signature | Returns | Description |
|---|---|---|---|
| `collect` | `(document)` | `ModifierRule[]` | Gathers all applicable rules for an Actor or Item, already validated and de-duplicated. |
| `collectFor` | `(document, target)` | `ModifierRule[]` | Rules that affect a single named target (e.g. `"characteristics.fitness"`). |
| `validate` | `(rule, document)` | `{ valid: boolean, errors: string[] }` | Checks a rule against the document's schema and legal targets. |
| `apply` | `(document, target, baseValue)` | `number` | Folds all collected rules for `target` into `baseValue` and returns the result. |
| `sum` | `(rules, target)` | `number` | Pure aggregation helper — no document access. |
| `registerTarget` | `(path, descriptor)` | `void` | Declares a new legal modifier target so third-party content can be modified. |
| `listTargets` | `(document?)` | `string[]` | Enumerates legal targets, optionally scoped to a document type. |
| `targets` | — | `Map<string, TargetDescriptor>` | The full target registry. |

```js
const modifier = game.threeEightV2.modifier;

// Inspect what's modifying an actor's Fitness
const rules = modifier.collectFor(actor, "characteristics.fitness");
console.table(rules.map(r => ({ source: r.sourceName, value: r.value, mode: r.mode })));

// Manually fold (normally done for you in prepareDerivedData)
const effective = modifier.apply(actor, "characteristics.fitness", actor.system.characteristics.fitness.value);
```

### `dice` — Rolls and Parsing

| Method | Signature | Returns | Description |
|---|---|---|---|
| `parseModifiers` | `(string)` | `{ formula: string, flags: ModifierFlag[] }` | Converts user input like `"2+1d8+1[Lucky]-10[Dark]"` into a Roll-compatible formula plus structured flags. |
| `formatModifiers` | `(flags)` | `string` | Inverse of `parseModifiers`. |
| `rollSkill` | `(item, options?)` | `Promise<Roll>` | Rolls a skill item directly, bypassing the dialog. |
| `promptSkillRoll` | `(item, options?)` | `Promise<Roll \| null>` | Opens the skill-roll dialog and resolves with the resulting roll (or `null` if cancelled). |
| `buildSkillFormula` | `(item, options?)` | `string` | Returns the formula without rolling — useful for previews and tests. |
| `SKILL_ROLL_FORMULA` | — | `string` | The system-wide base formula (default `"2d8"`). |

**`options` accepted by `rollSkill` / `promptSkillRoll`:**

```js
{
  tn: 12,                   // target number
  difficulty: "Difficult",  // named preset (overridden by `tn`)
  characteristic: "agility",
  taskChain: 0,             // DM from a chain of prior tasks
  extra: "",                // raw modifier string, e.g. "+1d8[Lucky]"
  spendEffort: false,       // auto-spend 1 Effort for +1d8
  skipDialog: true,         // roll immediately without prompting
  flavor: "Picking the lock"
}
```

```js
const dice = game.threeEightV2.dice;

const { formula, flags } = dice.parseModifiers("2+1d8+1[Lucky]-10[Dark]");
// formula → "2 + 1d8 + 1 - 10"
// flags   → [{ label: "Lucky", value: 1 }, { label: "Dark", value: -10 }]

await dice.rollSkill(actor.items.getName("Firearms"), { tn: 12 });
```

### `attacks` — Attack Resolution

| Method | Signature | Returns | Description |
|---|---|---|---|
| `requestAttack` | `(actor, action, options?)` | `Promise<AttackRequest>` | Builds an attack request from an action and optional weapon. Fires `threeEightV2.requestAttack`. |
| `resolveAttack` | `(request)` | `Promise<AttackResult>` | Rolls to hit, compares against defense, applies damage and armor. |
| `resolveMelee` | `(request)` | `Promise<AttackResult>` | Melee-specific path (adds the melee defense calculation). |
| `resolveRanged` | `(request)` | `Promise<AttackResult>` | Ranged-specific path (adds range bands and ammunition checks). |
| `applyDamage` | `(target, result, options?)` | `Promise<number>` | Writes damage through the wounds API. |

```js
const attacks = game.threeEightV2.attacks;
const weapon = actor.items.getName("Assault Rifle");

const request = await attacks.requestAttack(actor, {
  name: "Burst Fire", isAttack: true, requisite: "Loaded rifle"
}, { weapon });

const result = await attacks.resolveAttack(request);
if (result.hit) await attacks.applyDamage(target, result);
```

### `equipment` — Equipment

| Method | Signature | Returns | Description |
|---|---|---|---|
| `equip` | `(actor, item)` | `Promise<void>` | Marks an item equipped and refreshes derivation. |
| `unequip` | `(actor, item)` | `Promise<void>` | The inverse. |
| `isEquipped` | `(actor, item)` | `boolean` | Read-only check. |
| `getEquipped` | `(actor, type?)` | `Item[]` | All equipped items, optionally filtered by item type. |
| `getContainers` | `(actor)` | `Item[]` | All container items on the actor. |

### `constants` / `config` — Tables and Configuration

`constants` exposes the raw ruleset tables so modules and macros can reference them without hard-coding numbers. `config` is the Foundry-conventional alias for the same data.

| Export | Type | Description |
|---|---|---|
| `DIFFICULTIES` | `Record<string, number>` | `Trivial: 2`, `Routine: 5`, `Average: 10`, `Difficult: 12`, `Heroic: 14`, `Formidable: 16`, `Impossible: 20` |
| `CHARACTERISTIC_TABLE` | `Array<Row>` | Score → `{ dm, effort, wounds, stress, reputationTier, wealthTier }` for scores 0–17+ |
| `SKILL_GROUPS` | `Record<string, string[]>` | Skill groupings by category |
| `ACTION_CATALOG` | `ActionCatalog` | Pre-defined actions (also at `action.catalog`) |
| `CONDITIONS_CATALOG` | `Map` | Pre-defined conditions (also at `conditions.catalog`) |
| `ITEM_TYPES` / `ACTOR_TYPES` | `string[]` | Registered type lists |

```js
const { DIFFICULTIES, CHARACTERISTIC_TABLE } = game.threeEightV2.constants;

const tn = DIFFICULTIES.Heroic;                       // 14
const dm = CHARACTERISTIC_TABLE[7].dm;                // modifier for score 7
```

---

## Hooks

The system fires a family of custom hooks under the `threeEightV2.` prefix. They fall into two categories: **notification hooks** (fire after the fact, for logging, UI, and side effects) and **veto hooks** (fire before the fact, prefixed `pre`, and can cancel the operation by returning `false`).

Listen with the standard Foundry API:

```js
Hooks.on("threeEightV2.declareAttack", (actor, action, slotType, options) => {
  console.log(`${actor.name} attacks with ${action.name} (${slotType})`);
});
```

### Lifecycle Hooks

| Hook | Args | Timing |
|---|---|---|
| `threeEightV2.init` | — | During Foundry's `init`. Data models and document classes are registered by now; `game.threeEightV2` is **not** yet available. |
| `threeEightV2.ready` | `(api)` | During Foundry's `ready`, immediately after `game.threeEightV2` is attached. `api` is `game.threeEightV2.api`. This is the correct hook for modules that need to patch or extend the API. |

```js
Hooks.once("threeEightV2.ready", (api) => {
  console.log(`Three-Eight v${api.version} ready`);

  // Register a custom modifier target
  game.threeEightV2.modifier.registerTarget("derived.overwatchBonus", {
    label: "Overwatch Bonus", type: "number"
  });
});
```

### Action & Attack Hooks

| Hook | Args | Cancellable | Description |
|---|---|---|---|
| `threeEightV2.preDeclareAction` | `(actor, slotType, options)` | ✅ return `false` | Fires before a slot is consumed. Cancel to block the action (e.g. a stunned condition). |
| `threeEightV2.declareAction` | `(actor, action, slotType, options)` | — | Fires after the slot is consumed and the action recorded, before the chat card renders. |
| `threeEightV2.preDeclareAttack` | `(actor, action, slotType, options)` | ✅ return `false` | Attack-specific veto point, fires before `preDeclareAction`. |
| `threeEightV2.declareAttack` | `(actor, action, slotType, options)` | — | Fires when an action with `isAttack: true` is declared. The primary hook for downstream attack-resolution modules. |
| `threeEightV2.actionSpent` | `(actor, slotType, action)` | — | Low-level notification fired for every slot consumption, attacks included. |
| `threeEightV2.modeChanged` | `(actor, newMode, oldMode)` | — | Fires when an actor commits to or leaves Double-Fast Mode. |
| `threeEightV2.roundReset` | `(actor)` | — | Fires when an actor's slots are cleared for a new round. |

```js
// Block actions from a custom "Stunned" flag
Hooks.on("threeEightV2.preDeclareAction", (actor, slotType, options) => {
  if (actor.getFlag("my-module", "stunned")) {
    ui.notifications.warn(`${actor.name} is stunned and cannot act.`);
    return false;
  }
});

// React to any declared attack
Hooks.on("threeEightV2.declareAttack", (actor, action, slotType, options) => {
  ChatMessage.create({
    content: `<em>${actor.name} declares ${action.name} (${slotType} action).</em>`
  });
});
```

### Condition Hooks

| Hook | Args | Cancellable | Description |
|---|---|---|---|
| `threeEightV2.preConditionApply` | `(actor, conditionId, stacks, options)` | ✅ return `false` | Fires before a condition is added. Cancel to make an actor immune. |
| `threeEightV2.conditionApplied` | `(actor, entry, stacks)` | — | Fires after a condition is added or incremented. `entry` is the full `ConditionEntry`. |
| `threeEightV2.preConditionRemove` | `(actor, entry, stacks)` | ✅ return `false` | Fires before stacks are removed. |
| `threeEightV2.conditionRemoved` | `(actor, conditionId, stacksRemoved, entry)` | — | Fires after stacks are removed. `entry` is `null` if the condition was fully removed. |
| `threeEightV2.conditionTick` | `(actor, entries, changes)` | — | Fires at end of round for each actor. `changes` describes stacks lost, damage dealt, saves required, etc. |
| `threeEightV2.conditionCatalogRegistered` | `(definition)` | — | Fires when a new catalog entry is registered at runtime. |

```js
// Immunity example
Hooks.on("threeEightV2.preConditionApply", (actor, conditionId) => {
  if (conditionId === "poison" && actor.getFlag("my-module", "immunePoison")) {
    return false;
  }
});

// Ongoing damage example — bleed deals 1 wound per stack each round
Hooks.on("threeEightV2.conditionTick", async (actor, entries) => {
  const bleed = entries.find(e => e.id === "bleeding");
  if (!bleed || bleed.stacks < 1) return;

  await game.threeEightV2.wounds.modify(actor, -bleed.stacks, {
    source: "Bleeding",
    type: "ongoing"
  });
});
```

### Wounds & Effort Hooks

| Hook | Args | Cancellable | Description |
|---|---|---|---|
| `threeEightV2.preWoundsChange` | `(actor, delta, options)` | ✅ return `false` | Fires before Wounds change. Cancel to absorb damage (e.g. ablative armor). |
| `threeEightV2.woundsChanged` | `(actor, newValue, oldValue, options)` | — | Fires after Wounds change. `options.source` and `options.type` carry the damage metadata. |
| `threeEightV2.actorDown` | `(actor)` | — | Convenience hook fired when Wounds reach 0. |
| `threeEightV2.preEffortSpend` | `(actor, amount, reason)` | ✅ return `false` | Fires before Effort is spent. |
| `threeEightV2.effortChanged` | `(actor, newValue, oldValue, reason)` | — | Fires after any Effort change, spend or recover. |
| `threeEightV2.effortDepleted` | `(actor)` | — | Fires when Effort reaches 0. |

```js
// Ablative armor absorbs the first 3 points of damage each round
Hooks.on("threeEightV2.preWoundsChange", (actor, delta, options) => {
  if (delta >= 0) return;                       // healing, let it through
  const pool = actor.getFlag("my-module", "ablative") ?? 0;
  if (pool <= 0) return;

  const absorbed = Math.min(pool, Math.abs(delta));
  actor.setFlag("my-module", "ablative", pool - absorbed);
  ui.notifications.info(`Ablative armor absorbed ${absorbed} damage.`);
  return false;                                 // cancel the original change
});
```

### Roll Hooks

| Hook | Args | Cancellable | Description |
|---|---|---|---|
| `threeEightV2.preSkillRoll` | `(item, options)` | ✅ return `false` | Fires before a skill roll is built. Cancel to substitute your own resolution. |
| `threeEightV2.skillRolled` | `(item, roll, context)` | — | Fires after a skill roll resolves. `context` contains `{ tn, difficulty, outcome, spentEffort }`. |
| `threeEightV2.skillRollOutcome` | `(item, roll, outcome)` | — | Fires only when the outcome is known (`"success"`, `"failure"`, `"critical"`). |
| `threeEightV2.modifiersParsed` | `(input, result, item)` | — | Fires after `parseModifiers` runs on user input. Useful for auditing or rewriting modifier strings. |

```js
Hooks.on("threeEightV2.skillRolled", (item, roll, context) => {
  if (context.outcome === "critical") {
    ui.notifications.info(`Critical success on ${item.name}!`);
  }
});
```

### Modifier Hooks

| Hook | Args | Cancellable | Description |
|---|---|---|---|
| `threeEightV2.modifiersCollected` | `(document, rules)` | — | Fires after `modifier.collect` gathers rules. Mutate `rules` in place to inject contributions. |
| `threeEightV2.preModifierApply` | `(document, target, baseValue, rules)` | ✅ return `false` | Fires before the fold. Cancel to bypass the modifier engine for a target. |
| `threeEightV2.modifierApplied` | `(document, target, baseValue, finalValue, rules)` | — | Fires after the fold, with both the raw and final values. |
| `threeEightV2.modifierTargetRegistered` | `(path, descriptor)` | — | Fires when `registerTarget` adds a new legal target. |

```js
// Inject an environmental penalty without creating an item
Hooks.on("threeEightV2.modifiersCollected", (document, rules) => {
  if (document.type !== "pc") return;
  if (game.combat?.getFlag("my-module", "darkness")) {
    rules.push({ target: "characteristics.agility", value: -2, mode: "add", sourceName: "Darkness" });
  }
});
```

### Hook Reference Table

A single-glance summary of every hook the system fires.

| Hook | Cancellable | Primary Use |
|---|---|---|
| `threeEightV2.init` | — | Early registration |
| `threeEightV2.ready` | — | API extension, target registration |
| `threeEightV2.preDeclareAction` | ✅ | Block actions |
| `threeEightV2.preDeclareAttack` | ✅ | Block attacks |
| `threeEightV2.declareAction` | — | Chat cards, logging |
| `threeEightV2.declareAttack` | — | Attack resolution modules |
| `threeEightV2.actionSpent` | — | Low-level auditing |
| `threeEightV2.modeChanged` | — | Double-Fast UI |
| `threeEightV2.roundReset` | — | Round-start effects |
| `threeEightV2.preConditionApply` | ✅ | Immunity |
| `threeEightV2.conditionApplied` | — | Side effects on affliction |
| `threeEightV2.preConditionRemove` | ✅ | Prevent removal |
| `threeEightV2.conditionRemoved` | — | Cleanup |
| `threeEightV2.conditionTick` | — | Ongoing damage, saves |
| `threeEightV2.conditionCatalogRegistered` | — | Catalog UI refresh |
| `threeEightV2.preWoundsChange` | ✅ | Damage absorption |
| `threeEightV2.woundsChanged` | — | Damage reactions |
| `threeEightV2.actorDown` | — | Death saves |
| `threeEightV2.preEffortSpend` | ✅ | Cost increases |
| `threeEightV2.effortChanged` | — | Resource UI |
| `threeEightV2.effortDepleted` | — | Exhaustion effects |
| `threeEightV2.preSkillRoll` | ✅ | Custom resolution |
| `threeEightV2.skillRolled` | — | Roll reactions |
| `threeEightV2.skillRollOutcome` | — | Success/failure triggers |
| `threeEightV2.modifiersParsed` | — | Modifier auditing |
| `threeEightV2.modifiersCollected` | — | Inject modifiers |
| `threeEightV2.preModifierApply` | ✅ | Bypass the fold |
| `threeEightV2.modifierApplied` | — | Derived-value debugging |
| `threeEightV2.modifierTargetRegistered` | — | Target registry UI |

---

## Extending the System

Because every module is exposed on `game.threeEightV2`, a companion module can extend the system without patching it. The pattern is always the same: wait for `threeEightV2.ready`, then use the registration and hook APIs.

### Register a new condition

```js
Hooks.once("threeEightV2.ready", () => {
  game.threeEightV2.conditions.register({
    id: "suffocating",
    name: "Suffocating",
    description: "The actor is deprived of air.",
    targets: ["characteristics.fitness"],
    modifiers: [
      { target: "characteristics.fitness", value: -2, mode: "add" }
    ],
    tags: ["environmental"],
    tick: { save: "fitness", tn: 12, onFail: { stacks: 1 } }
  });
});
```

### Register a new modifier target

```js
Hooks.once("threeEightV2.ready", () => {
  game.threeEightV2.modifier.registerTarget("derived.overwatchBonus", {
    label: "Overwatch Bonus",
    type: "number",
    default: 0
  });
});
```

### Add a custom action to the catalog

```js
Hooks.once("threeEightV2.ready", () => {
  game.threeEightV2.action.catalog.register({
    id: "suppressingFire",
    name: "Suppressing Fire",
    slotType: "slow",
    isAttack: true,
    requisite: "Automatic weapon, loaded"
  });
});
```

### Substituting your own resolution

```js
Hooks.on("threeEightV2.preSkillRoll", (item, options) => {
  if (item.name !== "Hacking") return;          // only intercept one skill

  // Do your own thing, then return false to suppress the system's roll
  myModule.resolveHacking(item.actor, options);
  return false;
});
```

> **Tip:** return `false` from a `pre` hook only when you have fully handled the operation yourself. Returning `false` without producing an outcome leaves the caller with `null` and no feedback to the user.

### Verifying the API

The README is generated from repository structure and may drift from the source as the system evolves. To confirm what is actually available in your installed version, open the browser console in Foundry and inspect the namespace:

```js
game.threeEightV2.api.version
Object.entries(game.threeEightV2).map(([k, v]) => [k, Object.keys(v)])
```

The authoritative sources are `module/action-economy.mjs`, `module/conditions.mjs`, `module/modifier.mjs`, `module/dice.mjs`, `module/effort.mjs`, and `module/wounds.mjs` — each exports the methods described above.

---

## Repository Structure

```
three-eight-v2/
├── lang/                  # Localization files (en.json)
├── module/                # Core system logic
│   ├── attacks/           # Melee and ranged attack resolution
│   ├── documents/         # Actor and Item document classes
│   ├── sheets/            # Actor and Item sheet classes
│   ├── action-catalog.mjs # Pre-defined action definitions
│   ├── action-economy.mjs # Slow/Fast/Double-Fast slot tracking
│   ├── attack.mjs         # Attack request pipeline
│   ├── combatant.mjs      # Custom combatant class
│   ├── conditions.mjs     # Condition data models and API
│   ├── conditions-catalog.mjs
│   ├── constants.mjs      # Difficulty tables, characteristic table, skill groups
│   ├── data-model.mjs     # Actor and Item data models
│   ├── dice.mjs           # Modifier parser and skill-roll dialog
│   ├── documents.mjs      # Document class registration
│   ├── effort.mjs         # Effort spend/recover API
│   ├── equipment.mjs      # Equipment hooks
│   ├── modifier.mjs       # Universal modifier collection and validation
│   ├── modifier-rule.mjs  # ModifierRule data model
│   ├── skill-dialog.mjs   # Skill-roll dialog
│   └── wounds.mjs         # Wounds modify/recover API
├── styles/                # CSS for chat cards and sheets
├── templates/             # Handlebars templates
├── notepad.md             # Developer notes and derivation reference
├── readme.md              # This file
├── system.json            # System manifest
└── three-eight.mjs        # Entry point — hooks and registration
```

---

## Architecture Notes

The system is built on Foundry's `TypeDataModel` abstraction. All Actor and Item types have strongly-typed schemas. Derivation happens in `prepareDerivedData`: the modifier system collects contributions from all embedded Modifier-Type items, conditions, and synthetic targets, then folds them into effective characteristic values, wounds, effort, initiative, combat bonuses, armor, and melee defense.

The `three-eight.mjs` entry point registers all document classes, data models, and hooks on Foundry's `init` hook, wires up chat-card rendering for action declarations, skill rolls, and attack results, and attaches the `game.threeEightV2` namespace on `ready`.

The namespace is deliberately flat and dependency-free. Every module reads actor state through `actor.system` and writes through its own public methods, so a companion module can replace behaviour at a single hook rather than monkey-patching internals.

---

## Contributing

This is a personal project by **theGASK**. If you'd like to contribute, please open an issue or pull request on GitHub.

## License

No license is currently specified in the repository.

---

*README generated from repository data at commit `c5b45d9` (Oct 16, 2026). Hook and API names reflect the documented module structure and should be verified against source before relying on them in a published module.*
# Three-Eight v2 — Foundry VTT System

A custom game system for Foundry Virtual Tabletop v14 that implements the **Three-Eight** ruleset — a gritty, tactical RPG with a unique action economy, characteristic-driven derivation, and a universal modifier pipeline.

## Overview

Three-Eight v2 is a complete Foundry VTT game system built around a modular architecture. It provides character sheets for nine actor types and fifteen item types, a dual-slot action economy, a conditions system with stackable persistent effects, and a universal modifier engine that lets items (mods, powers, qualities, flaws, ammunition, diseases) alter actor and item data without mutating stored values.

The system is designed for Foundry VTT **v14** (minimum and verified), and is currently in early development (`version: 0.0.1`).

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

## Installation

1. In Foundry VTT, go to **Game Systems** → **Install System**.
2. Paste the manifest URL: `https://raw.githubusercontent.com/theGASK/three-eight-v2/main/system.json`
3. Click **Install**.

Alternatively, clone the repository into your Foundry VTT `Data/systems/` directory.

## Usage

### Skill Rolls from Macros

```js
// Directly on an item
const skill = actor.items.getName("Firearms");
await skill.rollSkill({ tn: 12, difficulty: "Difficult" });

// Via the dialog
const skill = actor.items.getName("Firearms");
await game.threeEightV2.promptSkillRoll(skill);
```

### Action Economy from Macros

```js
// Check availability
const canSlow = game.threeEightV2.action.canDeclare(actor, "slow");
const canFast = game.threeEightV2.action.canDeclare(actor, "fast");

// Declare a slow action
await game.threeEightV2.action.declareAction(actor, "slow", {
  action: { name: "Aim", requisite: "Ranged weapon", isAttack: false }
});

// Declare a fast action in Double-Fast Mode
await game.threeEightV2.action.declareAction(actor, "fast", {
  doubleFast: true,
  action: { name: "Snap Shot", requisite: "Loaded weapon", isAttack: true }
});
```

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
├── readme.md              # Minimal readme
├── system.json            # System manifest
└── three-eight.mjs        # Entry point — hooks and registration
```

## Architecture Notes

The system is built on Foundry's `TypeDataModel` abstraction. All Actor and Item types have strongly-typed schemas. Derivation happens in `prepareDerivedData`: the modifier system collects contributions from all embedded Modifier-Type items, conditions, and synthetic targets, then folds them into effective characteristic values, wounds, effort, initiative, combat bonuses, armor, and melee defense.

The `three-eight.mjs` entry point registers all document classes, data models, and hooks on Foundry's `init` hook, and wires up chat-card rendering for action declarations, skill rolls, and attack results.

## Contributing

This is a personal project by **theGASK**. If you'd like to contribute, please open an issue or pull request on GitHub.

## License

No license is currently specified in the repository.

---

*README generated from repository data at commit `c5b45d9` (Oct 16, 2026).*
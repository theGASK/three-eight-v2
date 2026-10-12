Three Eight System - v2

How to invoke a roll
// Directly on an item
const skill = actor.items.getName("Firearms");
await skill.rollSkill({ tn: 12, difficulty: "Difficult" });

// Via the dialog (from a macro)
const skill = actor.items.getName("Firearms");
await game.threeEightV2.promptSkillRoll(skill);

// From a sheet's click handler
html.find("[data-action='roll-skill']").on("click", async (event) => {
  const itemId = event.currentTarget.dataset.itemId;
  const item = this.actor.items.get(itemId);
  if (item) await game.threeEightV2.promptSkillRoll(item);
});


| Actor                  | Primary                                | Secondary                      | Wounds                | Effort                       | Token bar 1 | Initiative        |
| ---------------------- | -------------------------------------- | ------------------------------ | --------------------- | ---------------------------- | ----------- | ----------------- |
| **PC**                 | Fitness, Agility, Intelligence, Morale | Experience, Reputation, Wealth | **Derived** = Fitness | **Derived** = avg↑(Fit, Mor) | `wounds`    | `2d8 + agilityDM` |
| **NPC**                | Fitness, Agility, Intelligence, Morale | —                              | **Derived** = Fitness | **Derived** = avg↑(Fit, Mor) | `wounds`    | `2d8 + agilityDM` |
| **Animal**             | Fitness, Agility, Intelligence, Morale | —                              | **Derived** = Fitness | **Derived** = avg↑(Fit, Mor) | `wounds`    | `2d8 + agilityDM` |
| **SmallVehicle**       | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |
| **LargeVehicle**       | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |
| **Drone**              | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |
| **Server**             | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |
| **Faction**            | Morale                                 | Experience, Reputation, Wealth | **Manual**            | **Manual**                   | `wounds`    | `2d8`             |
| **Base of Operations** | Class, Integrity, Speed, Capacity      | —                              | **Manual**            | **Manual**                   | `wounds`    | `2d8 + speedDM`   |

When I build the sheet, the two buttons only need three calls:

// Enable / disable on render
const canSlow = game.threeEightV2.action.canDeclare(this.actor, "slow");
const canFast = game.threeEightV2.action.canDeclare(this.actor, "fast");

// Slow button click
try {
  await game.threeEightV2.action.declareAction(this.actor, "slow", {
    action: { name: "Aim", description: "<p>Steady your shot.</p>",
              requisite: "Ranged weapon", isAttack: false }
  });
} catch (err) {
  if (err instanceof game.threeEightV2.action.Error) ui.notifications.warn(err.message);
  else throw err;
}

// Fast button click — first action of the round, double-fast requested
await game.threeEightV2.action.declareAction(this.actor, "fast", {
  doubleFast: true,
  action: { name: "Snap Shot", description: "<p>Fire from the hip.</p>",
            requisite: "Loaded weapon", isAttack: true }
});

That last call consumes the first of two fast slots and posts a chat card. Because isAttack is true, it also fires Hooks.callAll("threeEightV2.declareAttack", actor, action, "fast"), which any future attack-resolution module can subscribe to.

---
Every isAttack: true action, regardless of economy, ends up here:
javascript

await game.threeEightV2.attack.request(actor, action, {
  economy: "slow" | "fast" | "reactive",
  weapon:  Item | null,
  target:  Token | null
});

Add this hook registration alongside the existing combatStart/combatRound handlers — conditions tick before the action economy resets, so the ordering matches end-of-round semantics:
javascript

/* ── End-of-round condition tick ────────────────────────
   Fires before the action economy reset on the same events
   so ongoing effects land first. Order matters: register
   this listener before the action-economy listener. */
Hooks.on("combatRound", (combat) => Conditions.onCombatRound(combat));

Applying a condition
javascript

// From the eventual sheet handler, a macro, or an end-of-turn effect
await game.threeEightV2.condition.apply(actor, "burning");

If burning isn't legal on the actor's type, an ConditionError is thrown with a localized message and nothing is stored. If it is legal and already present, its stacks increment by 1. Otherwise a fresh entry is created with stacks: 1.
Increasing / decreasing stacks
javascript

await game.threeEightV2.condition.increment(actor, "burning", 2); // +2 stacks
await game.threeEightV2.condition.decrement(actor, "burning", 1); // -1 stack
// decrementing past zero removes the condition entirely

Toggling
javascript

await game.threeEightV2.condition.toggle(actor, "burning");        // flip
await game.threeEightV2.condition.toggle(actor, "burning", false); // force off

A toggled-off condition keeps its stacks and remains visible on the sheet — it just stops contributing modifiers and is skipped during the tick.
Continuous modifier contribution

Every time prepareDerivedData runs on the actor, computeActorContributions walks:

    Modifier-Type items (multiplier ×1).

    Active conditions (multiplier × stacks).

So a Burning condition with 2 stacks carrying { target: "wounds", operator: "-", value: 2 } adds -4 to the wounds path in the contribution map. The derived wound total — and any characteristic DM that flows off it — reflects that immediately, with no other code changes.
End-of-round tick

On combatRound, every combatant's active conditions fire threeEightV2.conditionTick. A future damage module hooks in:
javascript

Hooks.on("threeEightV2.conditionTick", (actor, active) => {
  for (const entry of active) {
    if (entry.key === "burning") {
      // entry.stacks × the modifier value = damage to apply
    }
  }
});

Nothing mutates on tick today, which is what you asked for — the signal and the data are the two things the eventual condition list needs.

/**
 * Catalog of all callable Actions in Three-Eight v2.
 *
 * Grouped by Action Economy type, then by category:
 *
 *   GENERAL_SLOW_ACTIONS     — declared via the Slow slot
 *   GENERAL_FAST_ACTIONS     — declared via a Fast slot
 *   GENERAL_FREE_ACTIONS     — declared during the actor's turn, no slot
 *   REACTIVE_ACTIONS         — declared in response to another action
 *
 * Each entry conforms to the ActionDefinition schema:
 *   { name, description, requisite, isAttack }
 *
 * Most actions are resolved manually. Actions with `isAttack: true`
 * additionally fire an attack request through
 * `game.threeEightV2.attack.request(actor, action, context)`, whose
 * implementation is a stub until the attack system is built.
 *
 * Names are stable identifiers — the i18n label is looked up from
 * `THREEEIGHT.Actions.<key>` so the catalog can be shared across
 * languages.
 */

/* ── Slow ────────────────────────────────────────────── */

export const GENERAL_SLOW_ACTIONS = Object.freeze([
  {
    key: "persuade",
    requisite: "Opponent can hear you",
    isAttack: false,
    fallbackName: "Persuade",
    fallbackDescription: "Verbally convince a listener who can hear you to adopt a certain belief or course of action."
  },
  {
    key: "coordinate",
    requisite: "Allies can hear you",
    isAttack: false,
    fallbackName: "Coordinate",
    fallbackDescription: "Direct allies who can hear you to act in a synchronized or tactical manner."
  },
  {
    key: "unarmedAttack",
    requisite: "Unarmed and enemy in same hex or adjacent square",
    isAttack: true,
    fallbackName: "Unarmed Attack",
    fallbackDescription: "Strike an enemy in the same hex or adjacent square using only your body while unarmed."
  },
  {
    key: "meleeAttack",
    requisite: "Melee weapon and enemy in same hex or adjacent square",
    isAttack: true,
    fallbackName: "Melee Attack",
    fallbackDescription: "Strike an enemy in the same hex or adjacent square with a handheld melee weapon."
  },
  {
    key: "rangedAttack",
    requisite: "Ranged weapon",
    isAttack: true,
    fallbackName: "Ranged Attack",
    fallbackDescription: "Fire a ranged weapon at a target."
  },
  {
    key: "sniperAim",
    requisite: "Optical sight",
    isAttack: false,
    fallbackName: "Sniper Aim",
    fallbackDescription: "Carefully aim a weapon equipped with an optical sight to make a precise, long-range shot."
  },
  {
    key: "grapple",
    requisite: "Unarmed and enemy in same hex or adjacent square",
    isAttack: true,
    fallbackName: "Grapple",
    fallbackDescription: "Attempt to seize and physically restrain an enemy in the same hex or adjacent square while unarmed."
  },
  {
    key: "breakFree",
    requisite: "You are grappled",
    isAttack: true,
    fallbackName: "Break Free",
    fallbackDescription: "Attempt to escape from a grapple while you are grappled."
  },
  {
    key: "standGuard",
    requisite: "Enemy in same hex or adjacent square",
    isAttack: false,
    fallbackName: "Stand Guard",
    fallbackDescription: "Hold a position and watch for enemy activity when an enemy is in the same hex or adjacent square."
  },
  {
    key: "clearJam",
    requisite: "Weapon",
    isAttack: false,
    fallbackName: "Clear Jam or Get Unstuck",
    fallbackDescription: "Spend time fixing a malfunctioning or stuck weapon."
  },
  {
    key: "shootBow",
    requisite: "Bow or crossbow",
    isAttack: true,
    fallbackName: "Shoot Bow",
    fallbackDescription: "Fire an arrow or bolt from a bow or crossbow."
  },
  {
    key: "throwWeapon",
    requisite: "Thrown weapon or hand grenade",
    isAttack: true,
    fallbackName: "Throw Weapon",
    fallbackDescription: "Hurl a thrown weapon or hand grenade at a target."
  },
  {
    key: "aimHeavyWeapon",
    requisite: "Heavy weapon",
    isAttack: false,
    fallbackName: "Aim Heavy Weapon",
    fallbackDescription: "Steady and aim a heavy weapon before firing."
  },
  {
    key: "fireHeavyWeapon",
    requisite: "Heavy weapon",
    isAttack: true,
    fallbackName: "Fire Heavy Weapon",
    fallbackDescription: "Discharge a heavy weapon at a target."
  },
  {
    key: "directIndirectFire",
    requisite: "Target in sight",
    isAttack: true,
    fallbackName: "Direct Indirect Fire",
    fallbackDescription: "Guide indirect fire onto a target you can see."
  },
  {
    key: "firstAid",
    requisite: "Victim incapacitated by wounds",
    isAttack: false,
    fallbackName: "First Aid",
    fallbackDescription: "Provide emergency medical treatment to a victim incapacitated by wounds."
  },
  {
    key: "rally",
    requisite: "Victim incapacitated by stress",
    isAttack: false,
    fallbackName: "Rally",
    fallbackDescription: "Attempt to restore composure to a victim incapacitated by stress."
  },
  {
    key: "enterOrExitVehicle",
    requisite: "Vehicle",
    isAttack: false,
    fallbackName: "Enter or Exit Vehicle",
    fallbackDescription: "Get into or out of a vehicle."
  },
  {
    key: "getItemFromBackpack",
    requisite: "Backpack",
    isAttack: false,
    fallbackName: "Get Item from Backpack",
    fallbackDescription: "Retrieve a stowed item from your backpack."
  },
  {
    key: "climb",
    requisite: "Climbable surface",
    isAttack: false,
    fallbackName: "Climb",
    fallbackDescription: "Scale a climbable surface."
  },
  {
    key: "hide",
    requisite: "Cover, concealment, or darkness",
    isAttack: false,
    fallbackName: "Hide",
    fallbackDescription: "Conceal yourself using cover, concealment, or darkness."
  },
  {
    key: "swim",
    requisite: "Water",
    isAttack: false,
    fallbackName: "Swim",
    fallbackDescription: "Move through water."
  }
]);

/* ── Fast ────────────────────────────────────────────── */

export const GENERAL_FAST_ACTIONS = Object.freeze([
  {
    key: "seekCover",
    requisite: "Terrain providing cover",
    isAttack: false,
    fallbackName: "Seek Cover (Full or Partial)",
    fallbackDescription: "Move to terrain providing cover to gain protection from enemy fire."
  },
  {
    key: "fullToPartialCover",
    requisite: "Full cover",
    isAttack: false,
    fallbackName: "Go from Full to Partial Cover",
    fallbackDescription: "Leave full protection to take a position of partial protection."
  },
  {
    key: "run",
    requisite: "No enemy in same hex or adjacent square",
    isAttack: false,
    fallbackName: "Run",
    fallbackDescription: "Sprint a short distance to reposition when no enemy is in the same hex or adjacent square."
  },
  {
    key: "crossLowBarrier",
    requisite: "",
    isAttack: false,
    fallbackName: "Cross Low Barrier",
    fallbackDescription: "Quickly move over a low obstacle."
  },
  {
    key: "moveThroughDoor",
    requisite: "Closed door",
    isAttack: false,
    fallbackName: "Move Through Door",
    fallbackDescription: "Open and pass through a closed door."
  },
  {
    key: "crawl",
    requisite: "Prone",
    isAttack: false,
    fallbackName: "Crawl",
    fallbackDescription: "Move a short distance while prone."
  },
  {
    key: "getUp",
    requisite: "Prone",
    isAttack: false,
    fallbackName: "Get Up",
    fallbackDescription: "Rise from a prone position to standing."
  },
  {
    key: "drawFromCombatGear",
    requisite: "Combat gear",
    isAttack: false,
    fallbackName: "Draw Item from Combat Gear",
    fallbackDescription: "Quickly retrieve a readily accessible item from your combat gear."
  },
  {
    key: "shove",
    requisite: "Enemy in same hex or adjacent square",
    isAttack: true,
    fallbackName: "Shove",
    fallbackDescription: "Push an enemy in the same hex or adjacent square to knock them off balance or move them."
  },
  {
    key: "disarm",
    requisite: "Target holds an item",
    isAttack: true,
    fallbackName: "Disarm",
    fallbackDescription: "Attempt to knock an item from the grasp of a target who holds one."
  },
  {
    key: "grappleAttack",
    requisite: "Opponent grappled",
    isAttack: true,
    fallbackName: "Grapple Attack",
    fallbackDescription: "Make a quick attack against an opponent you are already grappling."
  },
  {
    key: "retreat",
    requisite: "Enemy in same hex or adjacent square",
    isAttack: false,
    fallbackName: "Retreat",
    fallbackDescription: "Carefully back away from an enemy in the same hex or adjacent square."
  },
  {
    key: "aim",
    requisite: "Ranged weapon",
    isAttack: false,
    fallbackName: "Aim",
    fallbackDescription: "Quickly align a ranged weapon on a target."
  },
  {
    key: "prepareBow",
    requisite: "Bow",
    isAttack: false,
    fallbackName: "Prepare Bow",
    fallbackDescription: "Nock an arrow or load a bolt into a bow."
  },
  {
    key: "assumeOverwatch",
    requisite: "Ranged weapon",
    isAttack: false,
    fallbackName: "Assume Overwatch Position",
    fallbackDescription: "Ready a ranged weapon to fire at a target entering your field of fire."
  },
  {
    key: "reload",
    requisite: "Ranged weapon (slow if failed)",
    isAttack: false,
    fallbackName: "Reload",
    fallbackDescription: "Swap out a magazine or otherwise reload a ranged weapon, which becomes a slow action if failed."
  },
  {
    key: "activateExplosive",
    requisite: "Grenade or explosive",
    isAttack: true,
    fallbackName: "Activate Explosive",
    fallbackDescription: "Prime and trigger a grenade or explosive device."
  },
  {
    key: "getOnRide",
    requisite: "Motorcycle, bicycle or ride",
    isAttack: false,
    fallbackName: "Get on a Bike / Ride",
    fallbackDescription: "Mount a motorcycle, bicycle, or similar ride."
  },
  {
    key: "grabTheWheel",
    requisite: "Vehicle",
    isAttack: false,
    fallbackName: "Grab the Wheel",
    fallbackDescription: "Seize control of a vehicle's steering."
  },
  {
    key: "startEngine",
    requisite: "Vehicle",
    isAttack: false,
    fallbackName: "Start Engine",
    fallbackDescription: "Ignite a vehicle's engine."
  },
  {
    key: "drive",
    requisite: "Vehicle",
    isAttack: false,
    fallbackName: "Drive",
    fallbackDescription: "Operate a vehicle to move it."
  },
  {
    key: "useItem",
    requisite: "Varies",
    isAttack: false,
    fallbackName: "Use Item",
    fallbackDescription: "Activate or employ a miscellaneous item, with effects varying by item."
  },
  {
    key: "throwItem",
    requisite: "Varies",
    isAttack: false,
    fallbackName: "Throw Item",
    fallbackDescription: "Hurl a miscellaneous item at a target or location, with effects varying by item."
  },
  {
    key: "dropBackpack",
    requisite: "Backpack or bulky item",
    isAttack: false,
    fallbackName: "Drop Backpack or Bulky Item",
    fallbackDescription: "Shed a backpack or other bulky item to reduce encumbrance."
  },
  {
    key: "readyShield",
    requisite: "Enemy in same hex or adjacent square",
    isAttack: false,
    fallbackName: "Ready Shield",
    fallbackDescription: "Bring a shield to a defensive position when an enemy is in the same hex or adjacent square."
  }
]);

/* ── Free ────────────────────────────────────────────── */

export const GENERAL_FREE_ACTIONS = Object.freeze([
  {
    key: "dropToGround",
    requisite: "You're standing up",
    isAttack: false,
    fallbackName: "Drop to the Ground",
    fallbackDescription: "Immediately fall prone while standing up."
  },
  {
    key: "dropHeldItem",
    requisite: "Item in hand",
    isAttack: false,
    fallbackName: "Drop Held Item",
    fallbackDescription: "Release an item from your hand."
  },
  {
    key: "partialToFullCover",
    requisite: "Partial cover",
    isAttack: false,
    fallbackName: "Go from Partial to Full Cover",
    fallbackDescription: "Slip fully behind cover from a partially protected position."
  },
  {
    key: "shoutWords",
    requisite: "",
    isAttack: false,
    fallbackName: "Shout a Few Words",
    fallbackDescription: "Quickly communicate a short phrase to those who can hear you."
  },
  {
    key: "handSignals",
    requisite: "",
    isAttack: false,
    fallbackName: "Hand Signals",
    fallbackDescription: "Wordlessly communicate a simple message with gestures."
  },
  {
    key: "checkAmmo",
    requisite: "",
    isAttack: false,
    fallbackName: "Check Ammo or Gear",
    fallbackDescription: "Glance at your equipment to verify its status."
  }
]);

/* ── Reactive ────────────────────────────────────────── */

export const REACTIVE_ACTIONS = Object.freeze([
  {
    key: "blocking",
    requisite: "You have something to block",
    isAttack: false,
    fallbackName: "Blocking",
    fallbackDescription: "Interpose an object or limb to deflect an incoming attack when you have something available to block with."
  },
  {
    key: "overwatchFire",
    requisite: "You are in overwatch",
    isAttack: true,
    fallbackName: "Overwatch Fire",
    fallbackDescription: "Fire your readied ranged weapon at a target that enters your field of fire while you are in overwatch."
  }
]);

/* ── Aggregates ──────────────────────────────────────── */

export const ACTIONS_BY_ECONOMY = Object.freeze({
  slow:     GENERAL_SLOW_ACTIONS,
  fast:     GENERAL_FAST_ACTIONS,
  free:     GENERAL_FREE_ACTIONS,
  reactive: REACTIVE_ACTIONS
});

/** Flat lookup: key → action entry. Built once at module load. */
export const ACTIONS_BY_KEY = Object.freeze(
  Object.fromEntries(
    Object.values(ACTIONS_BY_ECONOMY)
      .flat()
      .map(action => [action.key, action])
  )
);

/** @returns {object|undefined} */
export function getAction(key) {
  return ACTIONS_BY_KEY[key];
}

/** @returns {object[]} Actions with isAttack === true. */
export function getAttackActions() {
  return Object.values(ACTIONS_BY_KEY).filter(a => a.isAttack);
}

/* ── Localization helpers ────────────────────────────── */

/**
 * Turn a catalog entry into a plain ActionDefinition-shaped object
 * with localized name and description.
 *
 * @param {object} entry   A catalog entry.
 * @returns {{ key: string, name: string, description: string, requisite: string, isAttack: boolean }}
 */
export function resolveAction(entry) {
  const nameKey = `THREEEIGHT.Actions.${entry.key}.name`;
  const descKey = `THREEEIGHT.Actions.${entry.key}.description`;
  return {
    key:         entry.key,
    name:        game.i18n.has(nameKey) ? game.i18n.localize(nameKey) : entry.fallbackName,
    description: game.i18n.has(descKey) ? game.i18n.localize(descKey) : entry.fallbackDescription,
    requisite:   entry.requisite,
    isAttack:    entry.isAttack
  };
}

/**
 * Every action in the catalog, resolved with localized text, keyed by
 * economy type.
 * @returns {{ slow: object[], fast: object[], free: object[], reactive: object[] }}
 */
export function resolvedCatalog() {
  const out = {};
  for (const [type, list] of Object.entries(ACTIONS_BY_ECONOMY)) {
    out[type] = list.map(resolveAction);
  }
  return out;
}
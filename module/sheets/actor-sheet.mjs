// module/sheets/actor-sheet.mjs

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Three-Eight v2 Actor Sheet.
 *
 * Layout is a CSS grid with three rows:
 *   partA   — identity, portrait, key derived values  (1 fr)
 *   ribbon  — tab navigation                          (auto)
 *   partB   — tab content panels                      (2 fr)
 *
 * Tab groups are declared in TABS; each tab renders its own
 * partial inside partB via the `tab` context object.
 */
export class ThreeEightActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["three-eight-v2", "sheet", "actor"],
    position: { width: 720, height: 780 },
    window: {
      resizable: true,
      controls: []
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      editImage:       ThreeEightActorSheet.#onEditImage,
      editName:        ThreeEightActorSheet.#onEditName,
      modifyWounds:    ThreeEightActorSheet.#onModifyWounds,
      modifyEffort:    ThreeEightActorSheet.#onModifyEffort,
      restoreWounds:   ThreeEightActorSheet.#onRestoreWounds,
      restoreEffort:   ThreeEightActorSheet.#onRestoreEffort,
      toggleCondition: ThreeEightActorSheet.#onToggleCondition,
      deleteItem:      ThreeEightActorSheet.#onDeleteItem,
      editItem:        ThreeEightActorSheet.#onEditItem,
      createItem:      ThreeEightActorSheet.#onCreateItem,
      rollSkill:       ThreeEightActorSheet.#onRollSkill,
      rollAttack:      ThreeEightActorSheet.#onRollAttack,
      rollSkillCheck:  ThreeEightActorSheet.#onRollSkillCheck
    }
  };

  static PARTS = {
    partA: {
      template: "systems/three-eight-v2/templates/actor/partA.hbs"
    },
    ribbon: {
      template: "systems/three-eight-v2/templates/actor/ribbon.hbs"
    },
    partB: {
      template: "systems/three-eight-v2/templates/actor/partB.hbs",
      scrollable: [".t8-tab-panel"]
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "description",     label: "THREEEIGHT.Tab.Description",     icon: "fas fa-book"        },
        { id: "characteristics", label: "THREEEIGHT.Tab.Characteristics", icon: "fas fa-dice-d20"    },
        { id: "actions",         label: "THREEEIGHT.Tab.Actions",         icon: "fas fa-bolt"        },
        { id: "conditions",      label: "THREEEIGHT.Tab.Conditions",      icon: "fas fa-heart-pulse" },
        { id: "items",           label: "THREEEIGHT.Tab.Items",           icon: "fas fa-briefcase"   }
      ],
      initial: "description"
    }
  };

  /* ── Context preparation ─────────────────────────── */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    context.actor = actor;
    context.system = system;
    context.isEditable = this.isEditable;
    context.tabs = this._getTabs();

    // Enriched description
    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    context.enrichedDescription = await enrich(system.description ?? "", {
      async: true,
      relativeTo: actor
    });

    // Type label
    context.typeLabel = game.i18n.localize(
      `TYPES.Actor.${actor.type}` in game.i18n.translations
        ? `TYPES.Actor.${actor.type}`
        : `TYPES.Actor.${actor.type}`
    );

    // Derived values
    context.wounds          = system.wounds ?? 0;
    context.woundsMax       = system.woundsMax ?? 0;
    context.effectiveEffort = system.effectiveEffort ?? 0;
    context.maxEffort       = system.maxEffort ?? 0;
    context.meleeDefense    = system.meleeDefense ?? 0;
    context.rangedArmor     = system.rangedArmor ?? 0;
    context.meleeArmor      = system.meleeArmor ?? 0;
    context.protection      = system.protection ?? 0;
    context.soak            = system.soak ?? 0;
    context.combatBonus     = system.combatBonus ?? 0;

    // Primary / secondary characteristic keys per actor type
    context.primaryKeys   = this.#primaryKeys();
    context.secondaryKeys = this.#secondaryKeys();

    // Items grouped by type
    context.itemsByType = this.#groupItems(actor);

    // Conditions
    context.conditions = system.conditions?.entries ?? [];

    // Action economy
    context.economy = system.actions?.economy?.summary ?? null;
    context.knownActions = system.actions?.known ?? [];

    return context;
  }

  /* ── Tab helpers ─────────────────────────────────── */

  _getTabs() {
    const tabs = {};
    for (const [groupId, config] of Object.entries(this.constructor.TABS)) {
      tabs[groupId] = config.tabs.map(t => ({
        ...t,
        active: false,
        cssClass: ""
      }));
      const activeId = this.tabGroups[groupId] ?? config.initial;
      const activeTab = tabs[groupId].find(t => t.id === activeId);
      if (activeTab) {
        activeTab.active = true;
        activeTab.cssClass = "active";
      }
    }
    return tabs;
  }

  /* ── Schema helpers ──────────────────────────────── */

  #primaryKeys() {
    const p = this.document.system.attributes?.primary;
    if (!p) return [];
    return ["fitness", "agility", "intelligence", "morale",
            "class", "integrity", "speed", "capacity"]
      .filter(k => p[k] !== undefined);
  }

  #secondaryKeys() {
    const s = this.document.system.attributes?.secondary;
    if (!s) return [];
    return ["experience", "reputation", "wealth"]
      .filter(k => s[k] !== undefined);
  }

  #groupItems(actor) {
    const groups = {};
    for (const item of actor.items) {
      (groups[item.type] ??= []).push(item);
    }
    return groups;
  }

  /* ── Actions ─────────────────────────────────────── */

  static async #onEditImage(event, target) {
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attr);
    const { FilePicker } = foundry.applications.apps;
    const picker = new FilePicker({
      type: "image",
      current,
      callback: (path) => this.document.update({ [attr]: path }),
      top: this.position.top + 40
    });
    return picker.browse();
  }

  static async #onEditName(event, target) {
    // Let the default inline edit handle it
  }

  static async #onModifyWounds() {
    const mod = game.threeEightV2?.wounds;
    if (!mod) return;
    await mod.prompt(this.document);
  }

  static async #onModifyEffort() {
    const mod = game.threeEightV2?.effort;
    if (!mod) return;
    await mod.prompt(this.document);
  }

  static async #onRestoreWounds() {
    const mod = game.threeEightV2?.wounds;
    if (!mod) return;
    await mod.restore(this.document);
    ui.notifications.info(game.i18n.localize("THREEEIGHT.Wounds.Restored"));
  }

  static async #onRestoreEffort() {
    const mod = game.threeEightV2?.effort;
    if (!mod) return;
    await mod.restore(this.document);
    ui.notifications.info(game.i18n.localize("THREEEIGHT.Effort.Restored"));
  }

  static async #onToggleCondition(event, target) {
    const key = target.dataset.conditionKey;
    const mod = game.threeEightV2?.condition;
    if (!mod || !key) return;
    await mod.toggle(this.document, key);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("THREEEIGHT.Sheet.DeleteItem") },
      content: `<p>${game.i18n.format("THREEEIGHT.Sheet.ConfirmDelete", { name: item.name })}</p>`
    });
    if (confirmed) await item.delete();
  }

  static async #onEditItem(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.itemType;
    if (!type) return;
    const [item] = await this.document.createEmbeddedDocuments("Item", [{
      name: game.i18n.format("THREEEIGHT.Sheet.NewItem", { type }),
      type
    }]);
    item?.sheet.render(true);
  }

  static async #onRollSkill(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.document.items.get(itemId);
    if (!item) return;
    await game.threeEightV2?.skill?.prompt(this.document, { skill: item });
  }

  static async #onRollAttack(event, target) {
    const attackType = target.dataset.attackType || "melee";
    const itemId = target.dataset.itemId;
    const weapon = itemId ? this.document.items.get(itemId) : null;
    if (attackType === "ranged") {
      await game.threeEightV2?.attack?.promptRanged(this.document);
    } else {
      await game.threeEightV2?.attack?.promptMelee(this.document);
    }
  }

  static async #onRollSkillCheck() {
    await game.threeEightV2?.skill?.prompt(this.document);
  }

  /* ── Drag & drop ─────────────────────────────────── */

  /** @override */
  async _onDropItem(event, data) {
    const item = await Item.fromDropData(data);
    if (!item) return;
    // Let the default handler manage the embed
    return super._onDropItem(event, data);
  }
}
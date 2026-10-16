const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/* Column definitions per item type — used by the Items tab table. */
const ITEM_COLUMNS = {
  weapon: [
    { key: "system.rof",          label: "THREEEIGHT.Weapon.ROF",         width: "60px" },
    { key: "system.damage",       label: "THREEEIGHT.Weapon.Damage",      width: "60px" },
    { key: "system.range",        label: "THREEEIGHT.Weapon.Range",       width: "60px" },
    { key: "system.penetration",  label: "THREEEIGHT.Weapon.Penetration", width: "60px" },
    { key: "system.magazine.value", label: "THREEEIGHT.Weapon.MagazineValue", width: "70px" }
  ],
  skill: [
    { key: "system.group",     label: "THREEEIGHT.Skill.Group", width: "110px" },
    { key: "system.skillValue", label: "THREEEIGHT.Skill.Value", width: "70px" }
  ],
  specialty: [
    { key: "system.score", label: "THREEEIGHT.Specialty.Score", width: "60px" }
  ],
  spell: [
    { key: "system.level",       label: "THREEEIGHT.Spell.Level",       width: "60px" },
    { key: "system.castingcost", label: "THREEEIGHT.Spell.CastingCost", width: "70px" }
  ],
  generalObject: [
    { key: "system.encumbrance", label: "THREEEIGHT.GeneralObject.Encumbrance", width: "80px" }
  ],
  container: [
    { key: "system.capacity.value", label: "THREEEIGHT.Container.CapacityValue", width: "70px" },
    { key: "system.capacity.max",   label: "THREEEIGHT.Container.CapacityMax",   width: "70px" }
  ],
  ammunition: [
    { key: "system.quantity",    label: "THREEEIGHT.Ammunition.Quantity", width: "60px" },
    { key: "system.damageBonus", label: "THREEEIGHT.Weapon.Damage",       width: "60px" },
    { key: "system.penetration", label: "THREEEIGHT.Weapon.Penetration",  width: "60px" }
  ],
  individualArmor: [
    { key: "system.rangedProtection.value", label: "THREEEIGHT.Item.IndividualArmor.RangedProtection", width: "80px" },
    { key: "system.meleeProtection.value",  label: "THREEEIGHT.Item.IndividualArmor.MeleeProtection",  width: "80px" }
  ],
  shield: [
    { key: "system.rangedProtection.value", label: "THREEEIGHT.Item.IndividualArmor.RangedProtection", width: "80px" },
    { key: "system.meleeProtection.value",  label: "THREEEIGHT.Item.IndividualArmor.MeleeProtection",  width: "80px" }
  ],
  vehicleArmor: [
    { key: "system.protection.value", label: "THREEEIGHT.Item.VehicleArmor.Protection", width: "80px" },
    { key: "system.soak.value",       label: "THREEEIGHT.Item.VehicleArmor.Soak",       width: "80px" }
  ],
  mod: [
    { key: "system.modifier", label: "THREEEIGHT.Modifier.Field.Value", width: "70px" }
  ]
};

/* Simple columns for types not explicitly enumerated. */
const DEFAULT_COLUMNS = [];

/**
 * Three-Eight v2 Actor Sheet.
 *
 * Layout: flex column with three children sized 1 : auto : 2.
 *   partA   — identity, portrait, vitals
 *   ribbon  — tab navigation
 *   partB   — active tab panel
 *
 * The tab panels are all inlined in partB.hbs; only one carries
 * the `active` class at a time. Tab state is tracked in
 * `this._activeTab` so it survives re-renders without relying on
 * the framework's built-in tab machinery.
 */
export class ThreeEightActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["three-eight-v2", "sheet", "actor"],
    position: { width: 760, height: 800 },
    window: { resizable: true, controls: [] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage:        ThreeEightActorSheet.#onEditImage,
      setTab:           ThreeEightActorSheet.#onSetTab,
      modifyWounds:     ThreeEightActorSheet.#onModifyWounds,
      modifyEffort:     ThreeEightActorSheet.#onModifyEffort,
      restoreWounds:    ThreeEightActorSheet.#onRestoreWounds,
      restoreEffort:    ThreeEightActorSheet.#onRestoreEffort,
      toggleCondition:  ThreeEightActorSheet.#onToggleCondition,
      setConditionStacks: ThreeEightActorSheet.#onSetConditionStacks,
      deleteItem:       ThreeEightActorSheet.#onDeleteItem,
      editItem:         ThreeEightActorSheet.#onEditItem,
      rollSkill:        ThreeEightActorSheet.#onRollSkill,
      declareAction:    ThreeEightActorSheet.#onDeclareAction
    }
  };

  static PARTS = {
    partA:  { template: "systems/three-eight-v2/templates/actor/partA.hbs"  },
    ribbon: { template: "systems/three-eight-v2/templates/actor/ribbon.hbs" },
    partB:  { template: "systems/three-eight-v2/templates/actor/partB.hbs",
              scrollable: [".t8-tab-panel"] }
  };

  static TABS = [
    { id: "description",     label: "THREEEIGHT.Tab.Description",     icon: "fas fa-book"                },
    { id: "characteristics", label: "THREEEIGHT.Tab.Characteristics", icon: "fas fa-dice-d20"            },
    { id: "actions",         label: "THREEEIGHT.Tab.Actions",         icon: "fas fa-bolt"                },
    { id: "conditions",      label: "THREEEIGHT.Tab.Conditions",      icon: "fas fa-heart-pulse"         },
    { id: "items",           label: "THREEEIGHT.Tab.Items",           icon: "fas fa-briefcase"           }
  ];

  constructor(options = {}) {
    super(options);
    this._activeTab = options.activeTab ?? "description";
  }

  /* ── Context ─────────────────────────────────────── */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    context.actor      = actor;
    context.system     = system;
    context.isEditable = this.isEditable;

    context.commonName = system.commonName ?? "";
    context.age        = system.age        ?? "";

    // Tab state
    context.tabs = this.constructor.TABS.map(t => ({
      ...t,
      active:   t.id === this._activeTab,
      cssClass: t.id === this._activeTab ? "active" : ""
    }));
    context.activeTab = this._activeTab;

    // Enriched description
    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    context.enrichedDescription = await enrich(system.description ?? "", {
      async: true,
      relativeTo: actor
    });

    // Type label
    context.typeLabel = game.i18n.localize(`TYPES.Actor.${actor.type}`);

    // Vitals
    context.wounds          = system.wounds ?? 0;
    context.woundsMax       = system.woundsMax ?? 0;
    context.effectiveEffort = system.effectiveEffort ?? 0;
    context.maxEffort       = system.maxEffort ?? 0;
    context.meleeDefense    = system.meleeDefense ?? 0;
    context.rangedArmor     = system.rangedArmor ?? 0;
    context.meleeArmor      = system.meleeArmor ?? 0;
    context.protection      = system.protection ?? 0;
    context.soak            = system.soak ?? 0;

    // Characteristics
    context.primaryCharacteristics   = this.#buildPrimaryList();
    context.secondaryCharacteristics = this.#buildSecondaryList();

    // Actions
    context.actionGroups = this.#buildActionGroups();

    // Conditions — provide all catalog entries plus current state
    context.conditionCatalog = this.#buildConditionList();

    // Items grouped by type, sorted by name
    context.itemGroups = this.#buildItemGroups(actor);

    return context;
  }

  /* ── Characteristic helpers ──────────────────────── */

  #buildPrimaryList() {
    const primary = this.document.system.attributes?.primary;
    if (!primary) return [];

    const keys = ["fitness", "agility", "intelligence", "morale",
                  "class", "integrity", "speed", "capacity"];

    return keys
      .filter(k => primary[k] !== undefined)
      .map(key => {
        const cap = key.charAt(0).toUpperCase() + key.slice(1);
        return {
          key,
          label:     game.i18n.localize(`THREEEIGHT.Actor.Primary.${cap}`),
          base:      Number(primary[key]) || 0,
          effective: Number(primary[`${key}Effective`] ?? primary[key]) || 0,
          modifier:  Number(primary[`${key}Modifier`]) || 0,
          dm:        Number(primary[`${key}DM`]) || 0,
          isTextDM:  false
        };
      });
  }

  #buildSecondaryList() {
    const secondary = this.document.system.attributes?.secondary;
    if (!secondary) return [];

    const keys = ["experience", "reputation", "wealth"];

    return keys
      .filter(k => secondary[k] !== undefined)
      .map(key => {
        const cap = key.charAt(0).toUpperCase() + key.slice(1);
        const isText = key === "reputation" || key === "wealth";
        return {
          key,
          label:     game.i18n.localize(`THREEEIGHT.Actor.Secondary.${cap}`),
          base:      Number(secondary[key]) || 0,
          effective: Number(secondary[`${key}Effective`] ?? secondary[key]) || 0,
          modifier:  Number(secondary[`${key}Modifier`]) || 0,
          dm:        isText ? "" : (Number(secondary[`${key}DM`]) || 0),
          textLabel: isText ? (secondary[`${key}Label`] ?? "") : "",
          isTextDM:  isText
        };
      });
  }

  /* ── Actions ─────────────────────────────────────── */

  #buildActionGroups() {
    const catalog = game.threeEightV2?.action?.catalog;
    if (!catalog) return [];

    const groupLabels = {
      slow:     "THREEEIGHT.Action.Type.slow",
      fast:     "THREEEIGHT.Action.Type.fast",
      free:     "THREEEIGHT.Action.Free",
      reactive: "THREEEIGHT.Action.Reactive"
    };

    return Object.entries(catalog).map(([economyKey, list]) => ({
      key:   economyKey,
      label: game.i18n.localize(groupLabels[economyKey] ?? economyKey),
      actions: list.map(entry => {
        const resolved = game.threeEightV2.action.resolve(entry);
        return {
          key:        resolved.key,
          name:       resolved.name,
          requisite:  resolved.requisite,
          isAttack:   resolved.isAttack,
          attackType: resolved.attackType ?? "",
          isSkill:    resolved.isSkill ?? false,
          economy:    economyKey
        };
      })
    }));
  }

  /* ── Conditions ──────────────────────────────────── */

  #buildConditionList() {
    // Placeholder catalog — replace with the real catalog when
    // authored. Each entry lists an id, label, and current state
    // drawn from the actor's conditions block.
    const placeholder = [
      { key: "fatigue", label: "Fatigue" }
    ];

    const block = this.document.system.conditions;
    return placeholder.map(def => {
      const entry = block?.getByKey?.(def.key) ?? null;
      return {
        key:      def.key,
        label:    def.label,
        stacks:   entry?.stacks ?? 0,
        isActive: entry?.isActive ?? false,
        exists:   !!entry
      };
    });
  }

  /* ── Items ───────────────────────────────────────── */

  #buildItemGroups(actor) {
    const groups = {};
    for (const item of actor.items) {
      (groups[item.type] ??= []).push(item);
    }

    return Object.entries(groups).map(([type, items]) => {
      const columns = ITEM_COLUMNS[type] ?? DEFAULT_COLUMNS;
      const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
      return {
        type,
        typeLabel: game.i18n.localize(`TYPES.Item.${type}`),
        columns,
        items: sorted.map(item => ({
          id:    item.id,
          name:  item.name,
          img:   item.img,
          cells: columns.map(col => ({
            label: col.label,
            value: this.#resolveCell(item, col.key)
          }))
        }))
      };
    });
  }

  #resolveCell(item, path) {
    const value = foundry.utils.getProperty(item, path);
    if (value === null || value === undefined) return "—";
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? "✓" : "—";
    if (typeof value === "string") {
      if (value === "") return "—";
      // Try to translate `group` keys via the skill group table
      if (path === "system.group" && game.threeEightV2?.action?.resolve) {
        const key = `THREEEIGHT.SkillGroup.${value}`;
        if (game.i18n.has(key)) return game.i18n.localize(key);
      }
      return value;
    }
    return String(value);
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

  static async #onSetTab(event, target) {
    const tab = target.dataset.tab;
    if (!tab || tab === this._activeTab) return;
    this._activeTab = tab;
    return this.render({ parts: ["ribbon", "partB"] });
  }

  static async #onModifyWounds() {
    await game.threeEightV2?.wounds?.prompt(this.document);
  }

  static async #onModifyEffort() {
    await game.threeEightV2?.effort?.prompt(this.document);
  }

  static async #onRestoreWounds() {
    await game.threeEightV2?.wounds?.restore(this.document);
    ui.notifications.info(game.i18n.localize("THREEEIGHT.Wounds.Restored"));
  }

  static async #onRestoreEffort() {
    await game.threeEightV2?.effort?.restore(this.document);
    ui.notifications.info(game.i18n.localize("THREEEIGHT.Effort.Restored"));
  }

  static async #onToggleCondition(event, target) {
    const key = target.dataset.conditionKey;
    if (!key) return;
    const has = game.threeEightV2?.condition?.has(this.document, key);
    try {
      if (has) {
        await game.threeEightV2.condition.toggle(this.document, key);
      } else {
        await game.threeEightV2.condition.apply(this.document, {
          key,
          name: game.i18n.localize("THREEEIGHT.Condition.Fatigue"),
          description: "",
          legalTargets: [],
          modifiers: []
        });
      }
    } catch (err) {
      ui.notifications.warn(err.message);
    }
  }

  static async #onSetConditionStacks(event, target) {
    const key = target.dataset.conditionKey;
    const stacks = Number(target.dataset.stacks);
    if (!key || !Number.isFinite(stacks)) return;
    try {
      const exists = game.threeEightV2?.condition?.has(this.document, key);
      if (!exists) {
        await game.threeEightV2.condition.apply(this.document, {
          key,
          name: game.i18n.localize("THREEEIGHT.Condition.Fatigue"),
          description: "",
          legalTargets: [],
          modifiers: []
        }, { stacks });
      }
      await game.threeEightV2.condition.setStacks(this.document, key, stacks);
    } catch (err) {
      ui.notifications.warn(err.message);
    }
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

  static async #onRollSkill(event, target) {
    const itemId = target.dataset.itemId;
    const item = itemId ? this.document.items.get(itemId) : null;
    await game.threeEightV2?.skill?.prompt(this.document, { skill: item });
  }

  static async #onDeclareAction(event, target) {
    const actionKey = target.dataset.actionKey;
    const economy   = target.dataset.economy;
    if (!actionKey || !economy) return;

    // Free and reactive actions have no slot to consume.
    if (economy === "free" || economy === "reactive") {
      const resolved = game.threeEightV2.action.resolve(
        game.threeEightV2.action.get(actionKey)
      );
      ui.notifications.info(
        game.i18n.format("THREEEIGHT.Action.InfoOnly", { name: resolved.name })
      );
      return;
    }

    const resolved = game.threeEightV2.action.resolve(
      game.threeEightV2.action.get(actionKey)
    );

    try {
      await game.threeEightV2.action.declareAction(this.document, economy, {
        action: resolved
      });
    } catch (err) {
      if (err instanceof game.threeEightV2.action.Error) {
        ui.notifications.warn(err.message);
      } else {
        throw err;
      }
    }
  }
}
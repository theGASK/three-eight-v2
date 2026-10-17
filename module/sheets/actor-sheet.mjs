const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/* Columns per item type for the Items tab. */
const ITEM_COLUMNS = {
  weapon: [
    { key: "system.rof",            label: "THREEEIGHT.Weapon.ROF",           width: "55px" },
    { key: "system.damage",         label: "THREEEIGHT.Weapon.Damage",        width: "55px" },
    { key: "system.range",          label: "THREEEIGHT.Weapon.Range",         width: "55px" },
    { key: "system.penetration",    label: "THREEEIGHT.Weapon.Penetration",   width: "55px" },
    { key: "system.magazine.value", label: "THREEEIGHT.Weapon.MagazineValue", width: "70px" }
  ],
  skill: [
    { key: "system.group",      label: "THREEEIGHT.Skill.Group", label: "110px" },
    { key: "system.skillValue", label: "THREEEIGHT.Skill.Value", label: "70px"  }
  ],
  specialty:     [{ key: "system.score",       label: "THREEEIGHT.Specialty.Score",       width: "60px" }],
  spell:         [
    { key: "system.level",       label: "THREEEIGHT.Spell.Level",       width: "60px" },
    { key: "system.castingcost", label: "THREEEIGHT.Spell.CastingCost", width: "70px" }
  ],
  generalObject: [{ key: "system.encumbrance", label: "THREEEIGHT.GeneralObject.Encumbrance", width: "80px" }],
  container:     [
    { key: "system.capacity.value", label: "THREEEIGHT.Container.CapacityValue", width: "70px" },
    { key: "system.capacity.max",   label: "THREEEIGHT.Container.CapacityMax",   width: "70px" }
  ],
  ammunition:    [
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
  mod:     [{ key: "system.modifier", label: "THREEEIGHT.Modifier.Field.Value", width: "70px" }],
  quality: [{ key: "system.modifier", label: "THREEEIGHT.Modifier.Field.Value", width: "70px" }],
  flaw:    [{ key: "system.modifier", label: "THREEEIGHT.Modifier.Field.Value", width: "70px" }],
  power:   [{ key: "system.modifier", label: "THREEEIGHT.Modifier.Field.Value", width: "70px" }],
  disease: [],
  default: []
};

const TAB_DEFINITIONS = [
  { id: "description",     icon: "fas fa-book",      label: "THREEEIGHT.Tab.Description"     },
  { id: "characteristics", icon: "fas fa-dice-d20",  label: "THREEEIGHT.Tab.Characteristics" },
  { id: "actions",         icon: "fas fa-bolt",      label: "THREEEIGHT.Tab.Actions"         },
  { id: "conditions",      icon: "fas fa-heart-pulse", label: "THREEEIGHT.Tab.Conditions"    },
  { id: "items",           icon: "fas fa-briefcase", label: "THREEEIGHT.Tab.Items"           }
];

/**
 * Three-Eight v2 Actor Sheet.
 *
 * Three parts only:
 *   partA — identity + vitals              (flex: 1)
 *   ribbon — tab navigation                (auto)
 *   partB — all tab panels, one visible    (flex: 2)
 *
 * Active tab is stored on the instance (`_activeTab`) and rendered
 * into `partB` — no dependency on the framework's tab machinery.
 */
export class ThreeEightActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["three-eight-v2", "sheet", "actor"],
    position: { width: 780, height: 820 },
    window: { resizable: true, controls: [] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage:          ThreeEightActorSheet.#onEditImage,
      changeTab:          ThreeEightActorSheet.#onChangeTab,
      modifyWounds:       ThreeEightActorSheet.#onModifyWounds,
      modifyEffort:       ThreeEightActorSheet.#onModifyEffort,
      restoreWounds:      ThreeEightActorSheet.#onRestoreWounds,
      restoreEffort:      ThreeEightActorSheet.#onRestoreEffort,
      toggleCondition:    ThreeEightActorSheet.#onToggleCondition,
      setConditionStacks: ThreeEightActorSheet.#onSetConditionStacks,
      deleteItem:         ThreeEightActorSheet.#onDeleteItem,
      editItem:           ThreeEightActorSheet.#onEditItem,
      declareAction:      ThreeEightActorSheet.#onDeclareAction,
      toggleActionMode:   ThreeEightActorSheet.#onToggleActionMode
    }
  };

  static PARTS = {
    partA:  { template: "systems/three-eight-v2/templates/actor/partA.hbs"  },
    ribbon: { template: "systems/three-eight-v2/templates/actor/ribbon.hbs" },
    partB:  { template: "systems/three-eight-v2/templates/actor/partB.hbs",
              scrollable: [".t8-tab-scroll"] }
  };

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
    context.typeLabel  = game.i18n.localize(`TYPES.Actor.${actor.type}`);

    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    context.enrichedDescription = await enrich(system.description ?? "", {
      async: true,
      relativeTo: actor
    });

    const num = (v, fallback = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };

    context.wounds          = num(system.wounds);
    context.woundsMax       = num(system.woundsMax, 1);
    context.effectiveEffort = num(system.effectiveEffort);
    context.maxEffort       = num(system.maxEffort, 1);
    context.meleeDefense    = num(system.meleeDefense);
    context.rangedArmor     = num(system.rangedArmor);
    context.meleeArmor      = num(system.meleeArmor);
    
    // Add Action Economy context for partA
    const economy = system.actions?.economy;
    if (economy) {
      context.economy = {
        slowAvailable:  economy.slowAvailable,
        fastAvailable:  economy.fastAvailable,
        doubleFastMode: economy.doubleFastMode,
        isFresh:        economy.isFresh
      };
    }

    // Tab navigation state — a simple array.
    context.tabs = TAB_DEFINITIONS.map(t => ({
      ...t,
      active:   t.id === this._activeTab,
      cssClass: t.id === this._activeTab ? "active" : ""
    }));
    context.activeTab = this._activeTab;

    context.primaryCharacteristics   = this.#buildPrimaryList();
    context.secondaryCharacteristics = this.#buildSecondaryList();
    context.actionGroups             = this.#buildActionGroups();
    context.conditionCatalog         = this.#buildConditionList();
    context.itemGroups               = this.#buildItemGroups(actor);

    return context;
  }

  /* ── Characteristics ────────────────────────────── */

  #buildPrimaryList() {
    const primary = this.document.system.attributes?.primary;
    if (!primary) return [];

    return ["fitness", "agility", "intelligence", "morale",
            "class", "integrity", "speed", "capacity"]
      .filter(k => primary[k] !== undefined)
      .map(key => {
        const cap = key.charAt(0).toUpperCase() + key.slice(1);
        const dm  = Number(primary[`${key}DM`]);
        const dmFmt = Number.isFinite(dm)
          ? (dm >= 0 ? `+${dm}` : `${dm}`)
          : "+0";
        return {
          key,
          label:     game.i18n.localize(`THREEEIGHT.Actor.Primary.${cap}`),
          base:      Number(primary[key]) || 0,
          effective: Number(primary[`${key}Effective`] ?? primary[key]) || 0,
          modifier:  Number(primary[`${key}Modifier`]) || 0,
          dmFmt,
          isTextDM:  false
        };
      });
  }

  #buildSecondaryList() {
    const secondary = this.document.system.attributes?.secondary;
    if (!secondary) return [];

    return ["experience", "reputation", "wealth"]
      .filter(k => secondary[k] !== undefined)
      .map(key => {
        const cap    = key.charAt(0).toUpperCase() + key.slice(1);
        const isText = key === "reputation" || key === "wealth";
        const dm     = Number(secondary[`${key}DM`]);
        const dmFmt  = isText ? "" :
          (Number.isFinite(dm) ? (dm >= 0 ? `+${dm}` : `${dm}`) : "+0");
        return {
          key,
          label:     game.i18n.localize(`THREEEIGHT.Actor.Secondary.${cap}`),
          base:      Number(secondary[key]) || 0,
          effective: Number(secondary[`${key}Effective`] ?? secondary[key]) || 0,
          modifier:  Number(secondary[`${key}Modifier`]) || 0,
          dmFmt,
          textLabel: isText ? (secondary[`${key}Label`] ?? "") : "",
          isTextDM:  isText
        };
      });
  }

  /* ── Actions ────────────────────────────────────── */

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
        const r = game.threeEightV2.action.resolve(entry);
        return {
          key:        r.key,
          name:       r.name,
          requisite:  r.requisite,
          isAttack:   r.isAttack,
          attackType: r.attackType ?? "",
          isSkill:    r.isSkill ?? false,
          economy:    economyKey
        };
      })
    }));
  }

  /* ── Conditions ─────────────────────────────────── */

  #buildConditionList() {
    const placeholder = [{ key: "fatigue", label: "THREEEIGHT.Condition.Fatigue" }];
    const block = this.document.system.conditions;

    return placeholder.map(def => {
      const entry = block?.getByKey?.(def.key) ?? null;
      return {
        key:      def.key,
        label:    game.i18n.localize(def.label),
        stacks:   entry?.stacks ?? 0,
        isActive: entry?.isActive ?? false
      };
    });
  }

  /* ── Items ──────────────────────────────────────── */

  #buildItemGroups(actor) {
    const groups = {};
    for (const item of actor.items) {
      (groups[item.type] ??= []).push(item);
    }

    return Object.entries(groups).map(([type, items]) => {
      const columns = ITEM_COLUMNS[type] ?? ITEM_COLUMNS.default;
      const sorted  = [...items].sort((a, b) => a.name.localeCompare(b.name));

      return {
        type,
        typeLabel: game.i18n.localize(`TYPES.Item.${type}`),
        columns,
        items: sorted.map(item => ({
          id:   item.id,
          name: item.name,
          img:  item.img,
          cells: columns.map(col => ({ value: this.#resolveCell(item, col.key) }))
        }))
      };
    });
  }

  #resolveCell(item, path) {
    const value = foundry.utils.getProperty(item, path);
    if (value === null || value === undefined) return "—";
    if (typeof value === "number")  return value;
    if (typeof value === "boolean") return value ? "✓" : "—";
    if (typeof value === "string") {
      if (value === "") return "—";
      if (path === "system.group") {
        const key = `THREEEIGHT.SkillGroup.${value}`;
        if (game.i18n.has(key)) return game.i18n.localize(key);
      }
      return value;
    }
    return String(value);
  }

  /* ── Handlers ───────────────────────────────────── */

  static #onChangeTab(event, target) {
    event.preventDefault();
    const tab = target.dataset.tab;
    if (!tab || tab === this._activeTab) return;
    this._activeTab = tab;
    return this.render();
  }

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

  static async #onModifyWounds() { await game.threeEightV2?.wounds?.prompt(this.document); }
  static async #onModifyEffort() { await game.threeEightV2?.effort?.prompt(this.document); }

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
    const mod = game.threeEightV2?.condition;
    if (!mod) return;
    try {
      if (mod.has(this.document, key)) {
        await mod.toggle(this.document, key);
      } else {
        await mod.apply(this.document, {
          key, name: game.i18n.localize("THREEEIGHT.Condition.Fatigue"),
          description: "", legalTargets: [], modifiers: []
        });
      }
    } catch (err) { ui.notifications.warn(err.message); }
  }

  static async #onToggleActionMode(event, target) {
    event.preventDefault();
    const economy = this.document.system.actions?.economy;
    if (!economy || !economy.isFresh) return;

    const newMode = !economy.doubleFastMode;
    await this.document.update({
      "system.actions.economy.doubleFastMode": newMode
    });
  }

  static async #onSetConditionStacks(event, target) {
    const key    = target.dataset.conditionKey;
    const stacks = Number(target.dataset.stacks);
    if (!key || !Number.isFinite(stacks)) return;
    const mod = game.threeEightV2?.condition;
    if (!mod) return;
    try {
      if (!mod.has(this.document, key)) {
        await mod.apply(this.document, {
          key, name: game.i18n.localize("THREEEIGHT.Condition.Fatigue"),
          description: "", legalTargets: [], modifiers: []
        }, { stacks });
      }
      await mod.setStacks(this.document, key, stacks);
    } catch (err) { ui.notifications.warn(err.message); }
  }

  static async #onDeleteItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("THREEEIGHT.Sheet.DeleteItem") },
      content: `<p>${game.i18n.format("THREEEIGHT.Sheet.ConfirmDelete", { name: item.name })}</p>`
    });
    if (confirmed) await item.delete();
  }

  static async #onEditItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  static async #onDeclareAction(event, target) {
    const { actionKey, economy } = target.dataset;
    if (!actionKey || !economy) return;

    if (economy === "free" || economy === "reactive") {
      const r = game.threeEightV2.action.resolve(game.threeEightV2.action.get(actionKey));
      ui.notifications.info(game.i18n.format("THREEEIGHT.Action.InfoOnly", { name: r.name }));
      return;
    }

    const resolved = game.threeEightV2.action.resolve(
      game.threeEightV2.action.get(actionKey)
    );

    try {
      await game.threeEightV2.action.declareAction(this.document, economy, { action: resolved });
    } catch (err) {
      if (err instanceof game.threeEightV2.action.Error) ui.notifications.warn(err.message);
      else throw err;
    }
  }
}
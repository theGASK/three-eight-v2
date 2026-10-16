// module/sheets/item-sheet.mjs

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * Three-Eight v2 Item Sheet.
 *
 * Same grid layout as the actor sheet, scaled down. Tabs:
 *   description, details, modifiers
 *
 * "Details" renders every schema field that is not `description`
 * or `modifiers`, so item subtypes added later appear automatically.
 */
export class ThreeEightItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["three-eight-v2", "sheet", "item"],
    position: { width: 560, height: 600 },
    window: { resizable: true, controls: [] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: ThreeEightItemSheet.#onEditImage
    }
  };

  static PARTS = {
    partA: {
      template: "systems/three-eight-v2/templates/item/partA.hbs"
    },
    ribbon: {
      template: "systems/three-eight-v2/templates/item/ribbon.hbs"
    },
    partB: {
      template: "systems/three-eight-v2/templates/item/partB.hbs",
      scrollable: [".t8-tab-panel"]
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "description", label: "THREEEIGHT.Tab.Description", icon: "fas fa-book"    },
        { id: "details",     label: "THREEEIGHT.Tab.Details",     icon: "fas fa-list"    },
        { id: "modifiers",   label: "THREEEIGHT.Tab.Modifiers",   icon: "fas fa-wand-magic-sparkles" }
      ],
      initial: "description"
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    context.isEditable = this.isEditable;
    context.tabs = this._getTabs();
    context.typeLabel = game.i18n.localize(`TYPES.Item.${item.type}`);

    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    context.enrichedDescription = await enrich(system.description ?? "", {
      async: true,
      relativeTo: item
    });

    // Generic detail fields: every schema field except description, modifiers
    context.detailFields = this.#detailFields(system);

    // Modifier rules
    context.modifiers = Array.isArray(system.modifiers) ? system.modifiers : [];

    return context;
  }

  _getTabs() {
    const tabs = {};
    for (const [groupId, config] of Object.entries(this.constructor.TABS)) {
      tabs[groupId] = config.tabs.map(t => ({ ...t, active: false, cssClass: "" }));
      const activeId = this.tabGroups[groupId] ?? config.initial;
      const activeTab = tabs[groupId].find(t => t.id === activeId);
      if (activeTab) {
        activeTab.active = true;
        activeTab.cssClass = "active";
      }
    }
    return tabs;
  }

  /**
   * Produce a flat list of { key, value, type } entries for every
   * schema field that isn't description or modifiers. SchemaField
   * and ArrayField values are skipped — they need bespoke rendering.
   */
  #detailFields(system) {
    const skip = new Set(["description", "modifiers"]);
    const fields = [];
    for (const [key, value] of Object.entries(system)) {
      if (skip.has(key)) continue;
      if (value === null || value === undefined) continue;
      if (typeof value === "object") continue;
      fields.push({ key, value, type: typeof value });
    }
    return fields;
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
}
// module/sheets/item-sheet.mjs

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class ThreeEightItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["three-eight-v2", "sheet", "item"],
    position: { width: 560, height: 650 },
    window: { resizable: true, controls: [] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: ThreeEightItemSheet.#onEditImage,
      changeTab: ThreeEightItemSheet.#onChangeTab
    }
  };

  static PARTS = {
    partA: { template: "systems/three-eight-v2/templates/item/partA.hbs" },
    ribbon: { template: "systems/three-eight-v2/templates/item/ribbon.hbs" },
    partB: { 
      template: "systems/three-eight-v2/templates/item/partB.hbs",
      scrollable: [".t8-tab-scroll"] 
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

  constructor(options = {}) {
    super(options);
    this._activeTab = options.activeTab ?? "description";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system;

    context.item = item;
    context.system = system;
    context.isEditable = this.isEditable;
    context.typeLabel = game.i18n.localize(`TYPES.Item.${item.type}`);
    context.activeTab = this._activeTab;

    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    context.enrichedDescription = await enrich(system.description ?? "", {
      async: true,
      relativeTo: item
    });

    context.tabs = this._getTabs();
    context.modifiers = Array.isArray(system.modifiers) ? system.modifiers : [];

    return context;
  }

  _getTabs() {
    const tabs = {};
    for (const [groupId, config] of Object.entries(this.constructor.TABS)) {
      tabs[groupId] = config.tabs.map(t => {
        const isActive = t.id === this._activeTab;
        return { ...t, active: isActive, cssClass: isActive ? "active" : "" };
      });
    }
    return tabs;
  }

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
}
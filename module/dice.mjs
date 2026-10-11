import { DIFFICULTIES } from "./constants.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Open a prompt that asks for a Target Number (via Difficulty preset
 * or a custom override), then roll the Skill against it.
 * @param {Item} item  A Skill-type Item.
 */
export async function promptSkillRoll(item) {
  if (!item || item.type !== "skill") {
    ui.notifications.warn(game.i18n.localize("THREEEIGHT.Warn.NotASkill"));
    return null;
  }

  const presetOptions = Object.entries(DIFFICULTIES)
    .map(([key, { tn, label }]) => {
      const text = game.i18n.localize(label);
      return `<option value="${tn}">${text} (TN ${tn})</option>`;
    })
    .join("");

  const content = `
    <div class="form-group">
      <label>${game.i18n.localize("THREEEIGHT.Dialog.Difficulty")}</label>
      <select name="presetTn">${presetOptions}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("THREEEIGHT.Dialog.CustomTN")}</label>
      <input type="number" name="customTn" min="1" step="1"
             placeholder="${game.i18n.localize("THREEEIGHT.Dialog.CustomTNHint")}" />
    </div>
    <p class="notes">${game.i18n.localize("THREEEIGHT.Dialog.OverrideHint")}</p>
  `;

  const formData = await DialogV2.prompt({
    window: {
      title: game.i18n.format("THREEEIGHT.Dialog.RollTitle", { name: item.name })
    },
    content,
    modal: true,
    rejectClose: false,
    ok: {
      label: game.i18n.localize("THREEEIGHT.Dialog.Roll"),
      callback: (event, button) => {
        const form = button.form ?? button.closest("form");
        const fd = new FormData(form);
        return {
          presetTn: fd.get("presetTn"),
          customTn: fd.get("customTn")
        };
      }
    }
  });

  if (!formData) return null;

  const customTn = Number(formData.customTn);
  const useCustom = Number.isFinite(customTn) && customTn > 0;
  const tn = useCustom ? customTn : Number(formData.presetTn);

  const difficultyLabel = useCustom
    ? game.i18n.localize("THREEEIGHT.Dialog.Custom")
    : Object.values(DIFFICULTIES)
        .find(d => d.tn === Number(formData.presetTn))?.label ?? "";

  return item.rollSkill({
    tn,
    difficulty: game.i18n.localize(difficultyLabel)
  });
}
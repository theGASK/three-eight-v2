import { DIFFICULTIES, MODIFIER_PRESETS } from "./constants.mjs";

const { DialogV2 } = foundry.applications.api;

/* ── Modifier string parser ─────────────────────────── */

/**
 * Parse a user-entered modifier string into a Roll-compatible
 * formula fragment.
 *
 * Accepts terms separated by `+` or `-`, each of which is either:
 *   - a plain number, e.g. `2`, `-10`
 *   - a dice formula, e.g. `1d6`, `2d8`
 *   - either of the above followed by an optional `[label]`
 *
 * Examples:
 *   "2"                        → "+2"
 *   "-10"                      → "-10"
 *   "1d6"                      → "+1d6"
 *   "1d6[Lucky]"               → "+1d6[Lucky]"
 *   "2+1d8+1[Lucky]-10[Dark]"  → "+2 +1d8 +1[Lucky] -10[Dark]"
 *
 * @param {string} input
 * @returns {{ formula: string, terms: Array<{sign, text}>, error: string|null }}
 */
export function parseModifierFormula(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { formula: "", terms: [], error: null };

  // Tokenize into signed terms, treating [brackets] as part of the
  // current term so their contents (which may contain + or -) are
  // not split.
  const tokens = [];
  let sign = "+";
  let buffer = "";
  let i = 0;

  if (raw[0] === "+") i = 1;
  else if (raw[0] === "-") { sign = "-"; i = 1; }

  const pushBuffer = () => {
    const text = buffer.trim();
    if (text) tokens.push({ sign, text });
    buffer = "";
  };

  for (; i < raw.length; i++) {
    const ch = raw[i];

    if (ch === "[") {
      const close = raw.indexOf("]", i + 1);
      if (close === -1) {
        return {
          formula: "",
          terms: [],
          error: game.i18n.format("THREEEIGHT.Modifier.Err.UnclosedBracket", { input: raw })
        };
      }
      buffer += raw.slice(i, close + 1);
      i = close;
      continue;
    }

    if (ch === "+" || ch === "-") {
      pushBuffer();
      sign = ch === "-" ? "-" : "+";
    } else {
      buffer += ch;
    }
  }
  pushBuffer();

  if (tokens.length === 0) {
    return { formula: "", terms: [], error: null };
  }

  // Each term must be either a number or a dice formula, optionally
  // followed by a bracketed label.
  const TERM_RE = /^(?:\d+d\d+|\d+)(?:\[[^\]]*\])?$/i;
  for (const tok of tokens) {
    if (!TERM_RE.test(tok.text)) {
      return {
        formula: "",
        terms: [],
        error: game.i18n.format("THREEEIGHT.Modifier.Err.InvalidTerm", {
          term: `${tok.sign}${tok.text}`
        })
      };
    }
  }

  // Build the formula fragment. Each term keeps its own sign so the
  // fragment can be appended directly to a base formula.
  const formula = tokens.map(t => `${t.sign}${t.text}`).join(" ");

  // Final sanity check against the Roll parser.
  let valid = false;
  try { valid = Roll.validate(formula); } catch (_) { valid = false; }
  if (!valid) {
    return {
      formula: "",
      terms: [],
      error: game.i18n.format("THREEEIGHT.Modifier.Err.InvalidFormula", { formula })
    };
  }

  return { formula, terms: tokens, error: null };
}

/* ── Roll dialog ────────────────────────────────────── */

/**
 * Open a prompt that asks for a Target Number (via Difficulty preset
 * or a custom override) plus an optional roll modifier, then rolls
 * the Skill against that TN.
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

  const modeOptions = Object.entries(MODIFIER_PRESETS)
    .map(([key, preset]) =>
      `<option value="${key}">${game.i18n.localize(preset.label)}</option>`
    )
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
    <div class="form-group">
      <label>${game.i18n.localize("THREEEIGHT.Dialog.Modifier")}</label>
      <input type="text" name="modifier"
             placeholder="${game.i18n.localize("THREEEIGHT.Dialog.ModifierHint")}" />
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("THREEEIGHT.Dialog.Mode")}</label>
      <select name="mode">${modeOptions}</select>
    </div>
    <p class="notes">${game.i18n.localize("THREEEIGHT.Dialog.ModifierHintLong")}</p>
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
          customTn: fd.get("customTn"),
          modifier: String(fd.get("modifier") ?? "").trim(),
          mode:     String(fd.get("mode") ?? "normal")
        };
      }
    }
  });

  if (!formData) return null;

  const customTn = Number(formData.customTn);
  const useCustom = Number.isFinite(customTn) && customTn > 0;
  const tn = useCustom ? customTn : Number(formData.presetTn);

  // Resolve the difficulty label *key* here; localize exactly once,
  // at the point of use. Both branches yield a key, so there is no
  // double-localization and no risk of an unlocalized fallback string
  // slipping through.
  const difficultyKey = useCustom
    ? "THREEEIGHT.Dialog.Custom"
    : Object.values(DIFFICULTIES)
        .find(d => d.tn === Number(formData.presetTn))?.label
        ?? "THREEEIGHT.Dialog.Custom";

  // Combine the preset formula (if any) with the user-typed modifier.
  const preset = MODIFIER_PRESETS[formData.mode] ?? MODIFIER_PRESETS.normal;
  const parts = [];
  if (preset?.formula) parts.push(preset.formula);
  if (formData.modifier) parts.push(formData.modifier);
  const combinedModifier = parts.join("+");

  return item.rollSkill({
    tn,
    difficulty: game.i18n.localize(difficultyKey),
    modifier: combinedModifier
  });
}
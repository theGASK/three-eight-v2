// module/wounds.mjs

/**
 * Wounds management for Three-Eight v2.
 *
 * Two interaction paths modify the actor's current wounds:
 *
 *   1. Combat logic (attack modules). Direct updates, since damage
 *      never pushes wounds above the maximum.
 *
 *   2. User and GM input (sheet button, future dialog). These calls
 *      go through `modifyWounds` / `setWounds` and are capped at
 *      `woundsMax`: an attempt to exceed the maximum is rejected
 *      with a notification and the stored value is left unchanged.
 *
 * A third function, `restoreWounds`, sets wounds back to the max
 * in one step. It is exposed for the eventual character-sheet button.
 *
 * All three write the same persisted field, `system.wounds`.
 */

const { DialogV2 } = foundry.applications.api;

/* ── Errors ─────────────────────────────────────────── */

export class WoundsError extends Error {
    constructor(message, { actor = null, value = null, max = null } = {}) {
        super(message);
        this.name = "WoundsError";
        this.actor = actor;
        this.value = value;
        this.max = max;
    }
}

/* ── Internal helpers ───────────────────────────────── */

function readCurrent(actor) {
    return Number(actor?.system?.wounds) || 0;
}

function readMax(actor) {
    return Number(actor?.system?.woundsMax) || 0;
}

/* ── Core mutations ─────────────────────────────────── */

/**
 * Adjust the actor's wounds by a delta.
 *
 *   Positive delta  → healing (bounded by woundsMax).
 *   Negative delta  → damage (unbounded; may push wounds negative).
 *
 * @param {Actor}  actor
 * @param {number} delta
 * @param {object} [options]
 * @param {boolean} [options.enforceCap=true]  When true, refuses a
 *                                             result above woundsMax.
 * @returns {Promise<number>}  The new current wounds.
 * @throws {WoundsError}  When the cap would be exceeded.
 */
export async function modifyWounds(actor, delta, { enforceCap = true } = {}) {
    const current = readCurrent(actor);
    const max = readMax(actor);
    const step = Number(delta) || 0;
    const next = current + step;

    if (enforceCap && next > max) {
        throw new WoundsError(
            game.i18n.format("THREEEIGHT.Wounds.Err.OverMax", { value: next, max }),
            { actor, value: next, max }
        );
    }

    await actor.update({ "system.wounds": next });
    return next;
}

/**
 * Set wounds to an absolute value.
 *
 * @param {Actor}  actor
 * @param {number} value
 * @param {object} [options]
 * @param {boolean} [options.enforceCap=true]
 * @returns {Promise<number>}
 * @throws {WoundsError}
 */
export async function setWounds(actor, value, { enforceCap = true } = {}) {
    const max = readMax(actor);
    const next = Number(value) || 0;

    if (enforceCap && next > max) {
        throw new WoundsError(
            game.i18n.format("THREEEIGHT.Wounds.Err.OverMax", { value: next, max }),
            { actor, value: next, max }
        );
    }

    await actor.update({ "system.wounds": next });
    return next;
}

/**
 * Restore wounds to the actor's maximum.
 *
 * Exposed for the eventual character-sheet button. Safe to call
 * from a macro, from a future sheet action, or from a GM tool.
 *
 * @param {Actor} actor
 * @returns {Promise<number>}  The restored value (equal to woundsMax).
 */
export async function restoreWounds(actor) {
    const max = readMax(actor);
    await actor.update({ "system.wounds": max });
    return max;
}

/* ── Dialog ─────────────────────────────────────────── */

/**
 * Open the wounds modification dialog. The user enters a positive
 * or negative number; the value is added to the current wounds.
 *
 * Rejections are surfaced as an in-app notification rather than an
 * exception, so the calling sheet does not need to handle them.
 *
 * @param {Actor} actor
 * @returns {Promise<number|null>}  New wounds, or null if cancelled
 *                                  or rejected.
 */
export async function promptWoundsModification(actor) {
    const current = readCurrent(actor);
    const max = readMax(actor);

    const delta = await DialogV2.prompt({
        window: { title: game.i18n.localize("THREEEIGHT.Wounds.DialogTitle") },
        content: `
            <div class="form-group">
                <label>${game.i18n.localize("THREEEIGHT.Wounds.Current")}</label>
                <span class="wounds-current">${current} / ${max}</span>
            </div>
            <div class="form-group">
                <label>${game.i18n.localize("THREEEIGHT.Wounds.Delta")}</label>
                <input type="number" name="delta" value="0" step="1" autofocus />
            </div>
            <p class="notes">${game.i18n.localize("THREEEIGHT.Wounds.Hint")}</p>
        `,
        modal: true,
        rejectClose: false,
        ok: {
            label: game.i18n.localize("THREEEIGHT.Wounds.Apply"),
            callback: (event, button) => {
                const form = button.form ?? button.closest("form");
                return Number(new FormData(form).get("delta")) || 0;
            }
        }
    });

    if (delta === null) return null;
    if (delta === 0) return current;

    try {
        return await modifyWounds(actor, delta);
    } catch (err) {
        if (err instanceof WoundsError) {
            ui.notifications.warn(err.message);
            return null;
        }
        throw err;
    }
}
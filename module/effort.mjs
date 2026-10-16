// module/effort.mjs

/**
 * Effort management for Three-Eight v2.
 *
 * Mirrors the Wounds module. Two interaction paths modify the
 * actor's current effort:
 *
 *   1. Combat logic (melee modes). Direct updates via `setEffort`
 *      with `enforceCap: false`, since spending effort is a
 *      decrease and never exceeds the maximum.
 *
 *   2. User and GM input (sheet button, future dialog). These
 *      calls go through `modifyEffort` / `setEffort` and are
 *      capped at `maxEffort`: an attempt to exceed the maximum
 *      is rejected with a notification.
 *
 * `restoreEffort` sets effort back to the maximum in one step.
 *
 * All three write the same persisted field, `system.effectiveEffort`.
 */

const { DialogV2 } = foundry.applications.api;

/* ── Errors ─────────────────────────────────────────── */

export class EffortError extends Error {
    constructor(message, { actor = null, value = null, max = null } = {}) {
        super(message);
        this.name = "EffortError";
        this.actor = actor;
        this.value = value;
        this.max = max;
    }
}

/* ── Internal helpers ───────────────────────────────── */

function readCurrent(actor) {
    return Number(actor?.system?.effectiveEffort) || 0;
}

function readMax(actor) {
    return Number(actor?.system?.maxEffort) || 0;
}

/* ── Core mutations ─────────────────────────────────── */

/**
 * Adjust the actor's effort by a delta.
 *
 *   Positive delta  → recovery (bounded by maxEffort).
 *   Negative delta  → expenditure (unbounded, but normally
 *                     clamped by the caller before this call).
 *
 * @param {Actor}  actor
 * @param {number} delta
 * @param {object} [options]
 * @param {boolean} [options.enforceCap=true]
 * @returns {Promise<number>}
 * @throws {EffortError}  When the cap would be exceeded.
 */
export async function modifyEffort(actor, delta, { enforceCap = true } = {}) {
    const current = readCurrent(actor);
    const max = readMax(actor);
    const step = Number(delta) || 0;
    const next = current + step;

    if (enforceCap && next > max) {
        throw new EffortError(
            game.i18n.format("THREEEIGHT.Effort.Err.OverMax", { value: next, max }),
            { actor, value: next, max }
        );
    }

    await actor.update({ "system.effectiveEffort": next });
    return next;
}

/**
 * Set effort to an absolute value.
 *
 * @param {Actor}  actor
 * @param {number} value
 * @param {object} [options]
 * @param {boolean} [options.enforceCap=true]
 * @returns {Promise<number>}
 * @throws {EffortError}
 */
export async function setEffort(actor, value, { enforceCap = true } = {}) {
    const max = readMax(actor);
    const next = Number(value) || 0;

    if (enforceCap && next > max) {
        throw new EffortError(
            game.i18n.format("THREEEIGHT.Effort.Err.OverMax", { value: next, max }),
            { actor, value: next, max }
        );
    }

    await actor.update({ "system.effectiveEffort": next });
    return next;
}

/**
 * Restore effort to the actor's maximum.
 *
 * Exposed for the eventual character-sheet button, for rest
 * actions, and for macros.
 *
 * @param {Actor} actor
 * @returns {Promise<number>}  The restored value (equal to maxEffort).
 */
export async function restoreEffort(actor) {
    const max = readMax(actor);
    await actor.update({ "system.effectiveEffort": max });
    return max;
}

/* ── Dialog ─────────────────────────────────────────── */

/**
 * Open the effort modification dialog. Mirrors the wounds dialog:
 * a positive or negative number is applied to current effort.
 *
 * @param {Actor} actor
 * @returns {Promise<number|null>}  New effort, or null if cancelled
 *                                  or rejected.
 */
export async function promptEffortModification(actor) {
    const current = readCurrent(actor);
    const max = readMax(actor);

    const delta = await DialogV2.prompt({
        window: { title: game.i18n.localize("THREEEIGHT.Effort.DialogTitle") },
        content: `
            <div class="form-group">
                <label>${game.i18n.localize("THREEEIGHT.Effort.Current")}</label>
                <span class="effort-current">${current} / ${max}</span>
            </div>
            <div class="form-group">
                <label>${game.i18n.localize("THREEEIGHT.Effort.Delta")}</label>
                <input type="number" name="delta" value="0" step="1" autofocus />
            </div>
            <p class="notes">${game.i18n.localize("THREEEIGHT.Effort.Hint")}</p>
        `,
        modal: true,
        rejectClose: false,
        ok: {
            label: game.i18n.localize("THREEEIGHT.Effort.Apply"),
            callback: (event, button) => {
                const form = button.form ?? button.closest("form");
                return Number(new FormData(form).get("delta")) || 0;
            }
        }
    });

    if (delta === null) return null;
    if (delta === 0) return current;

    try {
        return await modifyEffort(actor, delta);
    } catch (err) {
        if (err instanceof EffortError) {
            ui.notifications.warn(err.message);
            return null;
        }
        throw err;
    }
}
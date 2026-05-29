/**
 * unitConversion — metric ↔ imperial helpers for catalogue mass/volume.
 *
 * Storage on `CatalogueItemMetadata.massGrams` / `volumeMl` is always
 * metric. These helpers do two jobs:
 *   - parse editor input in the seller's chosen unit system into
 *     metric for storage (`parseInputToGrams`, `parseInputToMl`);
 *   - format stored metric values back to the seller's unit system
 *     for display (`formatMass`, `formatVolume`).
 *
 * No conversion happens at storage. No conversion happens on-chain
 * (the geo validator's ABI tuple is metric: uint32 grams + uint32 ml).
 * Conversion is purely a UX edge.
 */

import type { UnitSystem } from "@/lib/shared/sellerCatalogueMetadata";

// ── Conversion constants ─────────────────────────────────────────────────────

/** 1 oz = 28.349523125 grams (international avoirdupois ounce). */
const GRAMS_PER_OUNCE = 28.349523125;
/** 1 US fluid ounce = 29.5735295625 millilitres. */
const ML_PER_FLOZ = 29.5735295625;

// ── Editor input parsing (seller-typed string → metric number) ─────────────

/**
 * Parse a number the seller typed in the editor into grams. When the
 * catalogue's `unitSystem` is "imperial", the input is interpreted as
 * ounces. Returns `undefined` when the input is empty or not a finite
 * number; the caller treats undefined as "no mass on this item".
 */
export function parseInputToGrams(input: string, system: UnitSystem): number | undefined {
    const value = parseFloat(input.trim());
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return system === "imperial" ? value * GRAMS_PER_OUNCE : value;
}

/**
 * Parse a number the seller typed in the editor into millilitres. When
 * the catalogue's `unitSystem` is "imperial", the input is interpreted
 * as US fluid ounces. Returns `undefined` per `parseInputToGrams`.
 */
export function parseInputToMl(input: string, system: UnitSystem): number | undefined {
    const value = parseFloat(input.trim());
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return system === "imperial" ? value * ML_PER_FLOZ : value;
}

// ── Stored value → editor input (metric → seller's unit) ──────────────────

/**
 * Convert a stored gram value into a number the seller's editor can
 * display. Returns "" for missing values so the input renders empty.
 * For imperial, returns ounces formatted to two decimals.
 */
export function gramsToInput(grams: number | undefined, system: UnitSystem): string {
    if (grams === undefined || grams <= 0) return "";
    if (system === "imperial") {
        return (grams / GRAMS_PER_OUNCE).toFixed(2);
    }
    return String(grams);
}

/**
 * Convert a stored ml value into a number the seller's editor can
 * display. Returns "" for missing values. For imperial, returns US
 * fluid ounces formatted to two decimals.
 */
export function mlToInput(ml: number | undefined, system: UnitSystem): string {
    if (ml === undefined || ml <= 0) return "";
    if (system === "imperial") {
        return (ml / ML_PER_FLOZ).toFixed(2);
    }
    return String(ml);
}

// ── Display formatting (metric → human-readable string) ─────────────────────

/** Display unit-system labels — used by editor labels and display badges. */
export function massUnitLabel(system: UnitSystem): string {
    return system === "imperial" ? "oz" : "g";
}

export function volumeUnitLabel(system: UnitSystem): string {
    return system === "imperial" ? "fl oz" : "ml";
}

/**
 * Format a stored gram value for human-readable display. Returns
 * an empty string when grams is missing or zero. The output includes
 * the unit suffix.
 */
export function formatMass(grams: number | undefined, system: UnitSystem): string {
    if (grams === undefined || grams <= 0) return "";
    if (system === "imperial") {
        const oz = grams / GRAMS_PER_OUNCE;
        return `${oz.toFixed(2)} oz`;
    }
    return `${grams} g`;
}

/**
 * Format a stored ml value for human-readable display. Returns an
 * empty string when ml is missing or zero. The output includes the
 * unit suffix.
 */
export function formatVolume(ml: number | undefined, system: UnitSystem): string {
    if (ml === undefined || ml <= 0) return "";
    if (system === "imperial") {
        const floz = ml / ML_PER_FLOZ;
        return `${floz.toFixed(2)} fl oz`;
    }
    return `${ml} ml`;
}

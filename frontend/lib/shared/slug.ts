/**
 * lib/shared/slug.ts
 *
 * URL/identifier-safe slug normalization. Single canonical for the
 * `lowercase + trim + replace non-alphanumerics with "-" + strip
 * leading/trailing "-"` pattern that previously lived inline as
 * `slugify` / `slugifySkinId` across four files.
 *
 * Does NOT cap length. Callers that need a length cap should slice
 * the result themselves, e.g. `slugify(name).slice(0, 64)`.
 */

export function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

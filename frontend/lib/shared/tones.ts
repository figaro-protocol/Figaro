/**
 * Semantic-tone palette for UI primitives (pills, badges, progress bars,
 * status chrome). Mirrors the Tailwind color tokens declared in
 * `tailwind.config.ts` and documented in `docs/v5/DESIGN_TOKENS.md`.
 *
 * Components that legitimately exclude a tone (e.g. progress-tracker has no
 * error tone) should derive their narrower type via `Exclude<SemanticTone,
 * "red">` rather than redeclaring the union inline.
 */
export type SemanticTone = "neutral" | "amber" | "blue" | "green" | "red";

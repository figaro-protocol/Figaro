/**
 * Per-discipline typographic glyph (8 disciplines, 1-indexed). Stable
 * cross-surface identifier — the same glyph renders wherever a discipline
 * appears (cards on `/cryptoeconomics`, anchor jumps, future cross-references
 * in paper download surfaces).
 *
 * The cipher is each discipline's working notation, not a decorative icon:
 *   1  Σ*    Nash equilibrium / strategy-profile notation
 *   2  ⊢⊣    Sequent / boundary-composition operator
 *   3  0x    Hex prefix — universally legible as cryptographic surface
 *   4  §     Section sign — the law's own glyph
 *   5  Ω/    Hegemony over the slash the kernel refuses to take
 *   6  ≡⊕    Ledger close (≡, double-entry equality) + closing entry (⊕)
 *   7  ∇·    Gradient / control-loop notation
 *   8  E[·]  Expectation operator — behavioral game theory
 *
 * Decorative-by-default: the glyph sits beside a heading that already names
 * the discipline, so screen readers read the heading once. Pass
 * `as="labelled"` for standalone use (breadcrumbs, footers without a visible
 * discipline name).
 */

export const DISCIPLINE_GLYPHS = {
    1: "Σ*",
    2: "⊢⊣",
    3: "0x",
    4: "§",
    5: "Ω/",
    6: "≡⊕",
    7: "∇·",
    8: "E[·]",
} as const;

export const DISCIPLINE_NAMES = {
    1: "Economics and Game Theory",
    2: "Industrial and Systems Engineering",
    3: "Computer Science and Cryptography",
    4: "Philosophy, Law and Ethics",
    5: "Political Science and Governance",
    6: "Operations Research and Management Science",
    7: "AI, Optimization and Control Theory",
    8: "Psychology and Decisions Science",
} as const;

export type DisciplineIndex = keyof typeof DISCIPLINE_GLYPHS;

interface DisciplineGlyphProps {
    index: DisciplineIndex;
    /** `md` (default) = 12 × 12 (h-12 w-12). `sm` = 8 × 8. */
    size?: "sm" | "md";
    /** "decorative" (default) — visually-leading cipher next to a heading
     *  that names the discipline; screen readers skip it.
     *  "labelled" — standalone use; renders with `aria-label` and `role=img`. */
    as?: "decorative" | "labelled";
}

export function DisciplineGlyph({ index, size = "md", as = "decorative" }: DisciplineGlyphProps) {
    const glyph = DISCIPLINE_GLYPHS[index];
    const name = DISCIPLINE_NAMES[index];

    const dimension = size === "md" ? "h-12 w-12 text-base" : "h-8 w-8 text-xs";
    const className =
        `inline-flex shrink-0 items-center justify-center rounded-glyph ` +
        `border border-default bg-surface text-ink-heading font-muji-mono font-semibold ${dimension}`;

    if (as === "labelled") {
        return (
            <span className={className} role="img" aria-label={name}>
                {glyph}
            </span>
        );
    }
    return (
        <span className={className} aria-hidden="true">
            {glyph}
        </span>
    );
}

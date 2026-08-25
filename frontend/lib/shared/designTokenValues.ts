/**
 * lib/shared/designTokenValues.ts
 *
 * The MUJI palette as raw hex strings — the SINGLE source for every color
 * token in docs/DESIGN_TOKENS.md §1. `tailwind.config.ts` derives its
 * `theme.extend.colors` from this object, so a value edited here changes
 * both the Tailwind utilities and the raw-hex consumers at once; there is
 * never a second, hand-maintained copy to drift.
 *
 * Why a JS module at all: some consumers cannot take a Tailwind class.
 * SVG canvases (React Flow edge `stroke` / marker `color`), `<canvas>`
 * painters, QR encoders and `next/og` image routes all need a literal
 * hex at render time. Those sites are the reason this file exists — they
 * are NOT licence to hardcode hexes elsewhere (DESIGN_TOKENS §8 still
 * bans hardcoded hex in components; the fix for such a site is to import
 * from here).
 *
 * Dependency-free by contract: this module is loaded by the Tailwind
 * config through jiti/esbuild before any path alias, bundler or React
 * runtime exists. Never add an import to it.
 */

export const colorTokens = {
    // ── Surfaces ────────────────────────────────────────────────────────
    canvas: '#f5f5f2',
    paper: '#ffffff',
    surface: '#ffffff',
    subtle: '#f0ede5',
    'subtle-hover': '#e6e2d8',

    // ── Borders ─────────────────────────────────────────────────────────
    default: '#e0dccf',
    'default-strong': '#b3a98f',

    // ── Ink (text) ──────────────────────────────────────────────────────
    // Namespaced `ink.*` rather than `text.*` to avoid the `text-text-*`
    // utility-prefix collision.
    ink: {
        heading: '#a16328',
        primary: '#3a322a',
        body: '#5a4f42',
        muted: '#857c6e',
        faint: '#a89e8d',
    },

    // ── Focus ───────────────────────────────────────────────────────────
    // Held at the hue and saturation of `default-strong` (hsl 43 19%) and
    // darkened to L 46% so the ring clears WCAG 1.4.11's 3:1 floor on every
    // surface a ring lands on — including `subtle-hover`, the darkest
    // (3.05:1). No longer an alias of `default-strong`, which stays light
    // because it is a BORDER against text, not an indicator.
    focus: '#8c7f5f',

    // ── Accent ──────────────────────────────────────────────────────────
    // Traditional MUJI aizome indigo; the single CTA-only contrast color.
    accent: '#2a578f',

    // ── Status ──────────────────────────────────────────────────────────
    // Two channels per status. The bare token is the FILL/border/ring/icon
    // channel (≥3:1, WCAG 1.4.11). The `-fg` companion is the TEXT channel:
    // the same hue and saturation darkened until it clears 4.5:1 (WCAG
    // 1.4.3) on `subtle`, the darkest surface prose sits on — which leaves
    // canvas and paper with margin. `error-fg` aliases `error` because the
    // terracotta already clears the text floor at its own lightness.
    success: '#6b7a4a',
    'success-fg': '#637044',
    warning: '#a8762d',
    'warning-fg': '#8c6326',
    error: '#9c4a3c',
    'error-fg': '#9c4a3c',
    info: '#857c6e',
    'info-fg': '#726a5e',
} as const;

# Figaro Design Tokens — MUJI Theme Spec

## Source-of-truth note

Extracted from `frontend/app/globals.css` lines 1-98 (the eight `.muji-*` declarations) and lines 106-117 (the live `@layer base { html, body }` block). The `.muji-*` classes are currently dead code (zero consumers across `frontend/app/` and `frontend/components/`) but are the canonical declaration of the theme intent. Agents drift because there is no spec; this document is the north star for Steps 2 (Tailwind tokens) and 3 (component primitives + page refactor).

## Step 3.3 revision (2026-05-06)

The values originally extracted from `.muji-*` (cool-neutral grays `#111`/`#222`/`#333`/`#555`/`#888`; 17px / 1.7 line-height / 0.01em tracking; 2.5rem H1) failed the visible-warmth test against Tailwind's cool `gray.*` ramp and produced "huge" text rendering. The canonical values below are now Step 3.3-revised in `frontend/tailwind.config.ts` and `frontend/app/globals.css`. The tables in §1 and §2 below describe the *original* extraction; the *current* live values are:

- **Ink ramp (warm, R>G>B):** `heading #1c1814` (sumi), `primary #3a322a` (umber), `body #5a4f42` (cocoa, body-text WCAG AA on canvas at 6.8:1), `muted #857c6e` (taupe, captions only), `faint #a89e8d` (khaki, decorative only).
- **Surfaces:** `subtle #f0ede5`, `subtle-hover #e6e2d8`, `border.default #e0dccf` (warm linen), `border.strong #b3a98f` (warm taupe), `focus #b3a98f`.
- **Type scale:** H1 `2rem`, H2 `1.5rem`, H3 `1.125rem`, body-lead `1.125rem`. Body defaults `16px / 1.65 / 0.005em`.
- **Link contract:** site-wide ban on default underline; `a:hover` adds underline + color shift to `ink-body`. Buttons and brand marks rendered as `<a>` opt out via `hover:no-underline`. Inline body links use `font-medium` for weight contrast.

The §1–§7 tables below remain as the historical extraction record. If a future operator reads them and the tailwind.config.ts disagrees, tailwind.config.ts wins.

---

## 1. Color tokens

| Token name           | Hex       | Source                       | Intended use                                                                 |
|----------------------|-----------|------------------------------|------------------------------------------------------------------------------|
| `bg.canvas`          | `#f5f5f2` | `globals.css:4`, `:111`      | Page background; live site-wide today via `@layer base body`.                |
| `bg.surface`         | `#ffffff` | `globals.css:31`             | Elevated surface (`.muji-section` cards).                                    |
| `bg.subtle`          | `#fafaf8` | `globals.css:42`, `:72`, `:174` | Recessed surface — link tiles, invariant cards, base `.card`/`.section-card`. |
| `bg.subtle.hover`    | `#f0f0ed` | `globals.css:53`             | Hover state for `bg.subtle` link tiles.                                      |
| `border.default`     | `#ececec` | `globals.css:36`, `:74`, `:175` | Section + invariant card borders.                                            |
| `border.subtle`      | `#e5e5e5` | `globals.css:41`             | Link-tile border (1.5px).                                                    |
| `border.strong`      | `#b3b3a8` | `globals.css:54`, `:202`     | Link-tile hover border; focus-ring color.                                    |
| `text.primary`       | `#222`    | `globals.css:5`, `:20`, `:43` | Body and title text on canvas.                                               |
| `text.heading`       | `#111`    | `globals.css:55`, `:84`      | Strongest heading / hover text emphasis.                                     |
| `text.body`          | `#333`    | `globals.css:77`             | Invariant card body text (one step softer than `text.primary`).              |
| `text.muted`         | `#555`    | `globals.css:26`, `:240`     | Subtitles; ReactFlow edge stroke.                                            |
| `text.faint`         | `#888`    | `globals.css:96`             | Footer text.                                                                 |
| `focus.ring`         | `#b3b3a8` | `globals.css:202`            | `:focus { outline: 2px solid }`, 2px offset.                                 |
| `status.success`     | `#6b7a4a` | derived                      | Muted moss green; status pill text/icon on `bg.subtle`. Decision: warm desaturated olive harmonizes with `border.strong` `#b3b3a8` rather than a saturated emerald. |
| `status.warning`     | `#a8762d` | derived                      | Muted ochre; warning pill text/icon. Decision: warm earthy amber sits in the same warm-neutral family as canvas `#f5f5f2`, not a SaaS yellow. |
| `status.error`       | `#9c4a3c` | derived                      | Muted terracotta; error text/icon. Decision: warm brick-red echoes MUJI signage rather than a bright Tailwind `red.500`. |
| `status.info`        | `#555555` | `globals.css:26`             | `text.muted` reused as info; muji-* declines to introduce blue. Decision: re-using `text.muted` keeps the palette to warm neutrals; informational state gets emphasis via weight, not hue. |
| Dark-mode tokens     | scope: Console route only | —              | Console runs `bg-zinc-950 text-zinc-100`; the rest of the site is light-only and stays so. Decision: do not introduce a global dark theme — it would conflict with the warm-neutral light palette; Console keeps its `zinc-950/100` pair as a route-scoped exception. |

---

## 2. Typography tokens

### Font stack

| Token         | Value                                                                           | Source             |
|---------------|---------------------------------------------------------------------------------|--------------------|
| `font.sans`   | `'Noto Sans JP', 'Inter', 'Helvetica Neue', Arial, sans-serif`                  | `globals.css:6`    |
| `font.mono`   | `'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace`             | derived            |

Decision (`font.mono`): a single named monospace fallback chain anchors `DisciplineGlyph` and any code/hash output without leaving the choice to Tailwind's default `ui-monospace` alone, which renders inconsistently across browsers.

### Body defaults (live via `@layer base`)

| Token              | Value     | Source              |
|--------------------|-----------|---------------------|
| `text.size.base`   | `17px`    | `globals.css:113`   |
| `text.lh.base`     | `1.7`     | `globals.css:114`   |
| `text.tracking.base` | `0.01em` | `globals.css:112`   |

### Type scale (from muji-*)

| Token              | Size     | Weight | Letter-spacing | Source                       | Use                          |
|--------------------|----------|--------|----------------|------------------------------|------------------------------|
| `type.title`       | `2.5rem` | 600    | `0.01em`       | `globals.css:17-19`          | `.muji-title` (hero H1).     |
| `type.subtitle`    | `1.25rem`| —      | —              | `globals.css:25`             | `.muji-subtitle`.            |
| `type.invariant.label` | `1.5rem` | —  | —              | `globals.css:89`             | `.muji-invariants span` (leading symbol/number). |
| `type.invariant.body`  | `1rem`   | —  | —              | `globals.css:78`             | `.muji-invariants li`.       |
| `type.footer`      | `0.95rem`| —      | —              | `globals.css:97`             | `.muji-footer`.              |
| `type.link`        | —        | 500    | —              | `globals.css:44`             | `.muji-links a` weight only. |
| `type.heading.h1`  | `2.5rem` | 600    | `0.01em`       | derived from `.muji-title`   | Page H1; matches `.muji-title` exactly. Decision: collapse the three competing scales onto `.muji-title` (2.5rem/600) — it is the only declared MUJI-voice title; `text-5xl/sm:6xl` weight 700 in `MarketingHero` is louder than the aesthetic permits. |
| `type.heading.h2`  | `1.875rem` | 600  | `0.01em`       | derived                      | Section H2 = `.muji-title × 0.75`. Decision: a 0.75 step keeps the H1/H2 ratio close to `.muji-title`/`.muji-subtitle` (2.5/1.25 = 2.0) without dropping straight to subtitle weight. |
| `type.heading.h3`  | `1.25rem`| 600    | `0.01em`       | matches `.muji-subtitle` size | Subsection H3. Decision: re-use `.muji-subtitle` 1.25rem and bump weight to 600 to distinguish heading from running subtitle while staying inside the muji-* size set. |
| `type.body.lead`   | `1.25rem`| 400    | `0.01em`       | matches `.muji-subtitle`     | Lead paragraph after H1. Decision: alias `.muji-subtitle` (`1.25rem` / `#555`) — there is no need for a separate lead size; the role-difference is colour (`text.muted`) not metric. |
| `type.eyebrow`     | `0.8125rem` | 600 | `0.08em`       | derived                      | Eyebrow over H1/H2. Decision: 13px/600 with widened tracking replaces the live `text-xs uppercase tracking-widest text-gray-600` (Tailwind cool gray) with a warm-neutral version sized just below `type.invariant.body` 1rem. |

---

## 3. Spacing tokens

| Token                  | Value     | Source              | Use                                       |
|------------------------|-----------|---------------------|-------------------------------------------|
| `space.hero.pt`        | `3.5rem`  | `globals.css:10`    | `.muji-hero` top padding.                 |
| `space.hero.pb`        | `2.5rem`  | `globals.css:11`    | `.muji-hero` bottom padding.              |
| `space.title.mb`       | `1.5rem`  | `globals.css:21`    | `.muji-title` bottom margin.              |
| `space.subtitle.mb`    | `1.5rem`  | `globals.css:27`    | `.muji-subtitle` bottom margin.           |
| `space.section.py`     | `2.5rem`  | `globals.css:34`    | `.muji-section` vertical padding.         |
| `space.section.px`     | `1.5rem`  | `globals.css:34`    | `.muji-section` horizontal padding.       |
| `space.section.mb`     | `2.5rem`  | `globals.css:35`    | `.muji-section` between-section gap.      |
| `space.link.py`        | `0.75rem` | `globals.css:45`    | `.muji-links a` vertical padding.         |
| `space.link.px`        | `2.25rem` | `globals.css:45`    | `.muji-links a` horizontal padding.       |
| `space.link.mx`        | `0.5rem`  | `globals.css:46`    | `.muji-links a` lateral margin between tiles. |
| `space.link.mb`        | `1rem`    | `globals.css:46`    | `.muji-links a` bottom margin.            |
| `space.invariants.my`  | `2.5rem`  | `globals.css:59-60` | `.muji-invariants` vertical margin.       |
| `space.invariants.gap` | `1.5rem`  | `globals.css:66`    | Grid gap between invariant cards.         |
| `space.invariant.py`   | `1.5rem`  | `globals.css:75`    | `.muji-invariants li` vertical padding.   |
| `space.invariant.px`   | `1rem`    | `globals.css:75`    | `.muji-invariants li` horizontal padding. |
| `space.invariant.label.mb` | `0.5rem` | `globals.css:91` | `.muji-invariants span` bottom margin.    |
| `space.footer.mt`      | `3rem`    | `globals.css:95`    | `.muji-footer` top margin.                |
| `space.container.px`   | `1.5rem` (sm: `2.5rem`) | `globals.css:187`   | Container side-padding; locks the live `px-6 sm:px-10` (24px / 40px) into a token. Decision: keep the live values — they already match `space.section.px` 1.5rem so container and section padding nest without seam. |
| `space.xs`             | `0.5rem`  | `globals.css:91`    | Inline gap; aliases `space.invariant.label.mb`. Decision: the smallest gap in muji-* is the 0.5rem label margin; reuse it as `xs`. |
| `space.sm`             | `0.75rem` | `globals.css:45`    | Tight padding; aliases `space.link.py`. Decision: `.muji-links a` vertical padding is the next muji-* step up; reuse as `sm`. |
| `space.md`             | `1rem`    | `globals.css:75`, `:83` | Default block gap; aliases `space.invariant.px` and `space.link.mb`. Decision: 1rem appears at two muji-* sites and is the natural medium step. |
| `space.lg`             | `1.5rem`  | `globals.css:21`, `:34`, `:66`, `:75` | Section-internal gap; aliases `space.title.mb`, `space.section.px`, `space.invariants.gap`. Decision: 1.5rem is muji-*'s most-used spacing and earns the `lg` slot. |
| `space.xl`             | `2.5rem`  | `globals.css:34`, `:35`, `:59-60` | Section-to-section gap; aliases `space.section.py/mb`. Decision: 2.5rem is the established between-section rhythm and maps cleanly to `xl`. |
| `space.2xl`            | `3.5rem`  | `globals.css:10`    | Hero top padding; aliases `space.hero.pt`. Decision: hero padding is the largest muji-* spacing; reserved for top-of-page only. |

---

## 4. Radius tokens

| Token                | Value      | Source              | Use                                       |
|----------------------|------------|---------------------|-------------------------------------------|
| `radius.section`     | `1.25rem`  | `globals.css:32`    | `.muji-section` cards.                    |
| `radius.invariant`   | `1rem`     | `globals.css:73`    | `.muji-invariants li`.                    |
| `radius.link`        | `0.75rem`  | `globals.css:40`    | `.muji-links a` tiles.                    |
| `radius.button`      | `0.75rem`  | matches `radius.link` | All buttons. Decision: align to `.muji-links a` (0.75rem) so the tile-style link and the button share one shape — the live `rounded-lg` 0.5rem and `DiscoverButton` `rounded-md` 0.375rem are both drift. |
| `radius.glyph`       | `0.25rem`  | derived             | `DisciplineGlyph` corner. Decision: keep the live `rounded` 0.25rem — glyphs read as fixed-size tokens, not tiles, so the section-card 1.25rem and link-tile 0.75rem would be too soft. |
| `radius.input`       | `0.75rem`  | matches `radius.button` | Form inputs. Decision: inputs and buttons share radius so a button and adjacent input field align visually in a form row. |

---

## 5. Shadow tokens

| Token                | Value                              | Source              | Use                          |
|----------------------|------------------------------------|---------------------|------------------------------|
| `shadow.section`     | `0 2px 8px 0 rgba(0, 0, 0, 0.03)`  | `globals.css:33`    | `.muji-section` only.        |
| `shadow.link`        | `none`                             | `globals.css:47`    | `.muji-links a` (explicitly no shadow). |
| `shadow.invariant`   | `none`                             | `globals.css:80`    | `.muji-invariants li` (explicitly no shadow). |

---

## 6. Motion tokens

| Token                | Value                                                | Source              | Use                          |
|----------------------|------------------------------------------------------|---------------------|------------------------------|
| `transition.link`    | `background 0.2s, border-color 0.2s, color 0.2s`     | `globals.css:48`    | `.muji-links a` hover.       |
| `motion.reduced`     | Animations and transitions overridden to `0.01ms` under `prefers-reduced-motion: reduce`. | `globals.css:246-255` | Site-wide a11y honor. |

---

## 7. Component shapes

### Section card (`.muji-section`)

```css
background: #fff;
border-radius: 1.25rem;
box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.03);
padding: 2.5rem 1.5rem;
margin-bottom: 2.5rem;
border: 1px solid #ececec;
```
Source: `globals.css:30-37`.

### Link tile (`.muji-links a`)

```css
border-radius: 0.75rem;
border: 1.5px solid #e5e5e5;
background: #fafaf8;
color: #222;
font-weight: 500;
padding: 0.75rem 2.25rem;
margin: 0 0.5rem 1rem 0.5rem;
box-shadow: none;
/* hover */
background: #f0f0ed;
border-color: #b3b3a8;
color: #111;
```
Source: `globals.css:39-56`.

### Invariant card (`.muji-invariants li`)

```css
background: #fafaf8;
border-radius: 1rem;
border: 1px solid #ececec;
padding: 1.5rem 1rem;
text-align: center;
color: #333;
font-size: 1rem;
box-shadow: none;
```
Grid: `repeat(auto-fit, minmax(220px, 1fr))`, gap `1.5rem` (`globals.css:64-66`).
Leading symbol: `font-size: 1.5rem; display: block; margin-bottom: 0.5rem` (`globals.css:88-92`).
Strong text: `color: #111; font-weight: 600` (`globals.css:83-86`).
Source: `globals.css:71-92`.

### Hero (`.muji-hero` + `.muji-title` + `.muji-subtitle`)

Wrapper: `padding: 3.5rem 0 2.5rem; background: none; border: none` (`globals.css:9-14`).
Title: `2.5rem`, weight 600, tracking `0.01em`, color `#222`, mb `1.5rem` (`globals.css:16-22`).
Subtitle: `1.25rem`, color `#555`, mb `1.5rem` (`globals.css:24-28`).

### Footer (`.muji-footer`)

`margin-top: 3rem; color: #888; font-size: 0.95rem` (`globals.css:94-98`).

### Body container

`background-color: #f5f5f2`, font `Noto Sans JP / Inter / Helvetica Neue / Arial`, `font-size: 17px`, `line-height: 1.7`, `letter-spacing: 0.01em` (`globals.css:108-117`).

### Focus ring

`outline: 2px solid #b3b3a8; outline-offset: 2px` on `:focus` site-wide (`globals.css:201-204`).

### Components not in the muji-* source

- **Button — primary**: `bg.subtle` `#fafaf8`, `border 1.5px border.subtle` `#e5e5e5`, `text.primary` `#222`, `radius.button` 0.75rem, `font-weight: 500`, `padding: 0.75rem 2.25rem`, `box-shadow: none`; hover → `bg.subtle.hover` `#f0f0ed`, `border.strong` `#b3b3a8`, `text.heading` `#111`. Decision: primary button IS the `.muji-links a` paper-tile shape — it is the only declared affordance in muji-*, and reaching for the existing tile makes "click here" and "primary action" one visual contract.
- **Button — secondary**: transparent `bg`, `border 1.5px border.subtle`, `text.muted` `#555`, same radius/padding/weight as primary; hover → `bg.subtle`, `text.primary`. Decision: secondary is the tile shape with the surface dropped — gives a clear visual demotion (no fill) without introducing a new shape, weight, or shadow.
- **Form input / select / textarea**: `bg.surface` `#fff`, `border 1px border.default` `#ececec`, `radius.input` 0.75rem, `padding: 0.75rem 1rem`, `min-height: 2.75rem` (44px, WCAG 2.5.5), `text.primary` color; focus → `border.strong` `#b3b3a8` plus the existing 2px focus outline. Decision: 44px min-height is the WCAG floor, surface white separates input from `bg.subtle` cards, and 1px (not 1.5px) border keeps inputs visually quieter than buttons.
- **Modal / dialog**: section-card shape — `bg.surface`, `radius.section` 1.25rem, `border 1px border.default`, `shadow.section` (the only shadow in muji-*), `padding: 2.5rem 1.5rem`; backdrop `rgba(34,34,34,0.4)` (40% `text.primary`). Decision: a modal is a section-card lifted off the page; reuse `.muji-section` exactly so the dialog reads as the same surface vocabulary, and tint the scrim from `text.primary` rather than pure black to stay warm.
- **Tab / segmented control**: row of secondary-button shapes; active tab promotes to primary (`bg.subtle` fill + `text.heading`); inactive uses `text.muted`. Decision: the link-tile shape doubles as a tab — the contract "selected = filled, unselected = outlined" is the smallest readable encoding without adding underlines or pills.
- **Loading state**: centered `text.muted` label "Loading…" inside a section-card; no spinner glyph by default, only a 1.2s opacity pulse on the label respecting `prefers-reduced-motion`. Decision: animated spinners read as SaaS dashboard; a quiet label inside the existing surface keeps the aesthetic and satisfies the `motion.reduced` honor already site-wide.
- **Empty state**: section-card with `text.muted` body and a single primary-button CTA. Decision: re-use the section-card surface — empty states are the absence of content, not a new surface type.
- **Error state**: section-card with `status.error` `#9c4a3c` strong text label and `text.body` description; primary-button "Retry" if applicable. Decision: error gets exactly one accent (the label color); body and CTA stay neutral so the page does not turn red.
- **Glyph (`DisciplineGlyph`)**: `bg.surface` `#fff`, `border 1px border.default` `#ececec`, `text.heading` `#111`, `font.mono` weight 600, `radius.glyph` 0.25rem. Decision: maps the live shape onto warm-neutral tokens (drops `border-gray-300`) without changing footprint; the 0.25rem corner is intentionally tighter than tiles (see radius decision).
- **Eyebrow label**: `type.eyebrow` (0.8125rem / 600 / 0.08em tracking, `uppercase`), color `text.muted` `#555`. Decision: replaces `text-gray-600` with the warm-neutral `text.muted` and locks size/weight/tracking into the typography table; eyebrow is information density, not decoration.
- **Top-of-section divider**: `border-top 1px border.default` `#ececec`, `padding-top: 2.5rem` (= `space.xl`). Decision: replaces `border-gray-200 pt-12` with the warm-neutral `border.default` and the existing section rhythm; no extra rule is added since `.muji-section` already separates surfaces by background.

---

## 8. Drift summary

The work Steps 2/3 will reconcile:

- **Color drift.** `MarketingHero` (`text-gray-600`/`text-gray-800`), `MarketingSection` (`border-gray-200`, `text-gray-600`), and the home page (`text-gray-700`, `text-gray-500`) reach for the Tailwind `gray.*` ramp (`tailwind.config.ts:14-25`); muji-* prescribes the warmer neutrals `#222 / #333 / #555 / #888` against canvas `#f5f5f2`. Two parallel grayscales co-exist on the page.
- **Heading-scale drift.** `globals.css:132-147` defines `h1` at `text-4xl sm:text-5xl` weight 700 and `h2` at `text-3xl sm:text-4xl` weight 600, but `MarketingHero` (`MarketingHero.tsx:25`) renders H1 at `text-5xl sm:text-6xl` weight 700, and `MarketingSection` (`MarketingSection.tsx:57`) renders H2 at `text-3xl` weight 700. Three scales in play; muji-* defines a single `.muji-title` at `2.5rem` that doesn't match any of them.
- **Button drift.** `DiscoverButton` (`rounded-md`, black bg) and the base-layer `button`/`.btn` (`rounded-lg`, white bg, `border-gray-300`) and `.muji-links a` (`rounded-0.75rem`, `bg #fafaf8`, `border 1.5px #e5e5e5`) are three independent button shapes. No primary/secondary contract exists.

---

## 9. What this doc does NOT do

Does not propose Tailwind config changes (Step 2). Does not propose component refactors or new primitives (Step 3). Token decisions in sections 1-7 are operator-approved defaults; Step 2 lifts them into `tailwind.config.ts`, Step 3 builds primitives against them.

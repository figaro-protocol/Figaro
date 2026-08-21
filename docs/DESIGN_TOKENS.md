# Figaro Design Tokens — MUJI Theme Spec

This document is the canonical token reference for `frontend/tailwind.config.ts` and `frontend/app/globals.css`. The Tailwind config is the implementation; this spec is the contract. When the two disagree, fix the disagreement — do not adjudicate by precedence. Every token below is grep-verifiable in the config.

---

## 1. Color tokens

Warm-neutral palette. Reads as warm against any cool surface. The R>G>B ramp on the ink scale and the linen/taupe surfaces give the page its MUJI register.

### Surfaces

| Token            | Hex       | Tailwind utility       | Use                                                    |
|------------------|-----------|------------------------|--------------------------------------------------------|
| `canvas`         | `#f5f5f2` | `bg-canvas`            | Page background; live site-wide via `body`.            |
| `paper`          | `#ffffff` | `bg-paper`             | Section-card surface (modals, dialogs, cards).         |
| `surface`        | `#ffffff` | `bg-surface`           | Form input / glyph surface.                            |
| `subtle`         | `#f0ede5` | `bg-subtle`            | Recessed surface — link tiles, invariant cards.        |
| `subtle-hover`   | `#e6e2d8` | `bg-subtle-hover`      | Hover state for `bg-subtle`.                           |

Do not use these as text utilities (`text-paper`, `text-subtle`, etc.) — the values render invisible or near-invisible against the canvas.

### Borders

| Token             | Hex       | Tailwind utility     | Use                                                  |
|-------------------|-----------|----------------------|------------------------------------------------------|
| `default`         | `#e0dccf` | `border-default`     | Section, card, header, divider borders (1px).        |
| `default-strong`  | `#b3a98f` | `border-default-strong` | Hover-emphasis borders, focus rings.              |

### Ink (text)

The ink ramp is namespaced `ink.*` rather than `text.*` to avoid the `text-text-*` utility-prefix collision. Read top-down as decreasing emphasis.

| Token         | Hex       | Tailwind utility    | Use                                                      |
|---------------|-----------|---------------------|----------------------------------------------------------|
| `ink.heading` | `#a16328` | `text-ink-heading`  | Page H1, strong heading emphasis. Tawny amber.           |
| `ink.primary` | `#3a322a` | `text-ink-primary`  | Default body text — set on `<body>`.                     |
| `ink.body`    | `#5a4f42` | `text-ink-body`     | Lead paragraphs, body text on subtle surfaces.           |
| `ink.muted`   | `#857c6e` | `text-ink-muted`    | Captions, secondary metadata.                            |
| `ink.faint`   | `#a89e8d` | `text-ink-faint`    | Decorative only — fails WCAG AA on canvas for body text. |

### Focus

| Token   | Hex       | Tailwind utility | Use                                          |
|---------|-----------|------------------|----------------------------------------------|
| `focus` | `#b3a98f` | `ring-focus`     | Focus-visible outline; aliases `default-strong`. |

### Accent

The single CTA-only contrast color. Traditional MUJI aizome indigo: deep, cool, distinct from every warm-neutral on the rest of the palette. Used to make a primary call-to-action read as "different mode of action" against canvas — without leaving the MUJI register.

| Token    | Hex       | Tailwind utility                            | Use                          |
|----------|-----------|---------------------------------------------|------------------------------|
| `accent` | `#2a578f` | `bg-accent`, `text-accent`, `border-accent` | Primary-CTA fill or border. |

**Discipline (load-bearing):**

- **CTAs only.** Use `bg-accent` / `text-accent` on the primary call-to-action of a page (e.g., the marketing-header Discover button, a "Download paper" button, a "Sign commitment" button on a transactional surface). Do not use accent on body text, captions, status surfaces, or decorative dividers.
- **Max one accent surface per page.** Two accent fills on one page produce CTA-stacking — neither reads as primary. The outline-strong-secondary pattern (`border-ink-heading`, paper fill) is the canonical companion shape for the secondary action.
- **Never used as a text-on-canvas color** for prose. `text-accent` on canvas is decoratively visible but not body-text legible at small sizes. Reserve for short labels (button text uses `text-paper` on `bg-accent`).
- **Hover inverts fill ⇄ outline within the same hue.** A filled `bg-accent text-paper` button hovers to `bg-paper text-accent` (with `border-accent` set in both states so the outline appears on hover). An outline-strong-sumi secondary button (`border-ink-heading bg-paper text-ink-heading`) hovers to filled-sumi (`bg-ink-heading text-paper`). The pair: filled-accent ⇄ outline-accent (primary), outline-sumi ⇄ filled-sumi (secondary). Crossing hue families on hover (indigo → sumi) reads as a register break; flipping fill state within the same hue reads as activation.

### Status

Single-value tokens. Decorative or icon use only. **Do not use as text utilities** (`text-success`, `text-warning`, `text-error`, `text-info`) — `text-error` on `bg-canvas` computes ~3.0:1 contrast and fails WCAG AA. Status surfaces should pair token-as-fill (`bg-success/10`, `border-error`) with `text-ink-*` foreground. If a future surface needs a contrast-validated text/background pair, expand each status token to `<status>-bg` / `<status>-fg` rather than reaching for `text-error` directly.

| Token      | Hex       | Tailwind utility | Intent                                         |
|------------|-----------|------------------|------------------------------------------------|
| `success`  | `#6b7a4a` | `bg-success`     | Muted moss green; status pill fill or icon.    |
| `warning`  | `#a8762d` | `bg-warning`     | Muted ochre; warning pill fill or icon.        |
| `error`    | `#9c4a3c` | `bg-error`       | Muted terracotta; error pill fill or icon.    |
| `info`     | `#857c6e` | `bg-info`        | Aliases `ink.muted`; informational fill only.  |

### Dark mode

`darkMode: 'class'` is registered in `tailwind.config.ts`. No `<html class="dark">` toggle exists yet. Reserved for any future opt-in dark theme. The site-wide light palette is the default.

---

## 2. Typography tokens

### Font stack

Three Google fonts loaded via `next/font/google` in `app/layout.tsx`, exposed as CSS variables on `<html>`:

| Variable                   | Font          |
|----------------------------|---------------|
| `--font-noto-sans-jp`      | Noto Sans JP  |
| `--font-inter`             | Inter         |
| `--font-jetbrains-mono`    | JetBrains Mono |

Tailwind stacks resolve to these variables at runtime:

| Tailwind utility   | Stack                                                                        |
|--------------------|------------------------------------------------------------------------------|
| `font-sans`        | `var(--font-noto-sans-jp), var(--font-inter), Helvetica Neue, Arial, sans-serif` |
| `font-mono`        | `var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace`     |
| `font-muji-sans`   | Same as `font-sans` (alias retained for explicit semantic naming).           |
| `font-muji-mono`   | Same as `font-mono` (alias retained).                                        |

Body inherits `font-sans` via `globals.css @layer base body { @apply font-sans }`.

### Body defaults (live via `@layer base body`)

| Property         | Value      |
|------------------|------------|
| `font-size`      | `16px`     |
| `line-height`    | `1.65`     |
| `letter-spacing` | `0.005em`  |
| `color`          | `ink.primary` (`#3a322a`) |

### Type scale

Each Tailwind utility carries the full metric set (size + line-height + letter-spacing + font-weight) so no separate utility chain is needed.

| Token         | Tailwind utility    | Size       | Weight | Line-height | Tracking   | Use                          |
|---------------|---------------------|------------|--------|-------------|------------|------------------------------|
| `heading-h1`  | `text-heading-h1`   | `2rem`     | 600    | `1.25`      | `0.005em`  | Page H1.                     |
| `heading-h2`  | `text-heading-h2`   | `1.5rem`   | 600    | `1.3`       | `0.005em`  | Section H2.                  |
| `heading-h3`  | `text-heading-h3`   | `1.125rem` | 600    | `1.4`       | `0.005em`  | Subsection H3.               |
| `body-lead`   | `text-body-lead`    | `1.125rem` | 400    | `1.6`       | `0.005em`  | Lead paragraph after H1.     |

---

## 3. Spacing tokens

Six-step scale aliasing the muji-* density values. Coexists with Tailwind's default numeric scale (`p-2`, `p-4`, etc.); choose one strategy per surface.

| Token   | Tailwind utility | Value     |
|---------|------------------|-----------|
| `xs`    | `p-xs`, `gap-xs`, `m-xs`, etc. | `0.5rem`  |
| `sm`    | `p-sm`, ...      | `0.75rem` |
| `md`    | `p-md`, ...      | `1rem`    |
| `lg`    | `p-lg`, ...      | `1.5rem`  |
| `xl`    | `p-xl`, ...      | `2.5rem`  |
| `2xl`   | `p-2xl`, ...     | `3.5rem`  |

Container side-padding is `px-6 sm:px-10` (`1.5rem` / `2.5rem`) — matches `space.lg` / `space.xl`.

---

## 4. Radius tokens

| Token        | Tailwind utility   | Value      | Use                                       |
|--------------|--------------------|------------|-------------------------------------------|
| `section`    | `rounded-section`  | `1.25rem`  | Section cards, modals, dialogs.           |
| `invariant`  | `rounded-invariant`| `1rem`     | Invariant cards, framed content.          |
| `tile`       | `rounded-tile`     | `0.75rem`  | Buttons, inputs, link tiles, primary CTAs. |
| `glyph`      | `rounded-glyph`    | `0.25rem`  | Discipline glyph, fixed-size badges.      |

Tailwind's default `rounded-{none,sm,md,lg,xl,2xl,3xl,full}` scale also remains available.

---

## 5. Shadow tokens

| Token        | Tailwind utility | Value                              | Use                          |
|--------------|------------------|------------------------------------|------------------------------|
| `section`    | `shadow-section` | `0 2px 8px 0 rgba(0, 0, 0, 0.03)`  | Section cards only.          |

Link tiles and invariant cards explicitly carry no shadow.

---

## 6. Motion tokens

| Property          | Value                                                                     |
|-------------------|---------------------------------------------------------------------------|
| Reduced motion    | Site-wide honor of `prefers-reduced-motion: reduce` — animations and transitions clamp to `0.01ms`. Lives in `globals.css @media (prefers-reduced-motion: reduce)`. |
| Interactive transition | `background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s` on `a, button, .btn, input, textarea, select`. |

---

## 7. Component shapes

These are the canonical shape contracts. New primitives should adopt these defaults; do not invent parallel shapes.

### Section card

```
bg-paper rounded-section shadow-section border border-default p-xl
```

### Link tile / primary button

```
bg-subtle border border-default-strong rounded-tile px-lg py-sm
text-ink-heading font-medium hover:bg-subtle-hover
```

### Secondary button

Tile shape, surface dropped:

```
bg-transparent border border-default-strong rounded-tile px-lg py-sm
text-ink-muted font-medium hover:bg-subtle hover:text-ink-primary
```

### Form input / select / textarea

```
bg-surface border border-default rounded-tile px-md py-sm
min-h-11 text-ink-primary
focus-visible:border-default-strong focus-visible:ring-2 focus-visible:ring-focus
```

`min-h-11` (44px) satisfies WCAG 2.5.5 (Target Size).

### Modal / dialog

Section-card shape lifted off the page. Backdrop `rgba(58, 50, 42, 0.4)` (40% `ink.primary`) — tinted from ink, not pure black.

### Glyph (`DisciplineGlyph`)

```
bg-surface border border-default rounded-glyph
text-ink-heading font-mono font-semibold
```

### Nav current state ("you are here")

Three ORTHOGONAL channels, so no two interaction states are confusable:

| Channel | State | Utilities |
|---------|-------|-----------|
| Fill    | hover (the pointer is here)   | `hover:bg-subtle-hover` |
| Ring    | focus (the keyboard is here)  | `focus-visible:ring-2` |
| Rule + weight | current (the reader is here) | `border-ink-heading` + `font-semibold` (or `font-medium` on a body-weight row) |

Never spend the fill channel on the current state — a hovered neighbour then reads as the current item. The current rule is `border-ink-heading` because the amber is already the nav's own text color; no hue family enters for a state.

Row-level rule: `pl-3.5 border-l-2` on the current row against `pl-4` on the rest — 14px + the 2px rule restores the 16px inset, so the label does not shift. `text-ink-heading` is NOT a legible current-state text color at nav sizes (4.1:1 on `bg-subtle`, below WCAG AA 1.4.3); deepen within the ink ramp (`text-ink-body` → `text-ink-primary`) instead.

Pair the treatment with `aria-current`: `"page"` on an exact route match (at most one per rendering), `"true"` on a section doorway whose group holds the route. One rule, one implementation — `components/shared/navActive.ts`.

### Status surfaces

Pair the status token as fill or icon with `text-ink-*` body. Do not use `text-success` / `text-error` / etc. as text colors directly (see §1 status-token note).

---

## 8. Anti-patterns

- Hardcoded hex anywhere outside `tailwind.config.ts` and `globals.css`. Use `@apply` against tokens instead.
- Arbitrary-value Tailwind classes (`bg-[#...]`, `text-[14px]`, `rounded-[7px]`) — each is a token-drift risk.
- `text-error` / `text-success` / `text-warning` / `text-info` as text colors — fail WCAG AA against canvas.
- `text-paper` / `text-subtle` / `text-canvas` — render invisible-on-canvas; the surface tokens are not text-safe.
- `focus:outline-none` without a paired `focus-visible:` indicator — leaves keyboard navigation with no visible focus state.
- New tokens added to `tailwind.config.ts` without a corresponding entry in this spec, or vice versa.

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
- **Hover inverts fill ⇄ outline within the same hue.** A filled `bg-accent text-paper` button hovers to `bg-paper text-accent` (with `border-accent` set in both states so the outline appears on hover). An outline-strong-sumi secondary button (`border-ink-heading bg-paper text-ink-heading`) hovers to filled-sumi (`bg-ink-primary text-paper` — the dark ink, never amber under white text; ruled 2026-08-25, see §7's Button note). The pair: filled-accent ⇄ outline-accent (primary), outline-sumi ⇄ filled-sumi (secondary). Crossing hue families on hover (indigo → sumi) reads as a register break; flipping fill state within the same hue reads as activation.

### Status

Single-value tokens. Fill, border, ring, and icon use throughout. As **text** utilities, only `text-error` is admissible — the measured contrast, not a blanket rule:

| Token      | Hex       | Tailwind utility | On `canvas` | On `paper` | Text use                                   |
|------------|-----------|------------------|-------------|------------|--------------------------------------------|
| `success`  | `#6b7a4a` | `bg-success`     | 4.26:1      | 4.66:1     | **No** — fails AA on canvas.                |
| `warning`  | `#a8762d` | `bg-warning`     | 3.63:1      | 3.97:1     | **No** — fails AA on both.                  |
| `error`    | `#9c4a3c` | `bg-error`       | 5.56:1      | 6.07:1     | **Yes** — passes AA on both.                |
| `info`     | `#857c6e` | `bg-info`        | 3.77:1      | 4.11:1     | **No** — aliases `ink.muted`; fill only.    |

Intent: `success` muted moss green, `warning` muted ochre, `error` muted terracotta, `info` the `ink.muted` alias. All four are ≥3:1 on both surfaces, so all four are valid as borders, rings, and icons (WCAG 1.4.11, Non-text Contrast).

`text-error` is what `FormField` uses for the required-marker glyph and the `role="alert"` message. For the other three, pair token-as-fill (`bg-success/10`, `border-warning`) with a `text-ink-*` foreground; if a surface needs `success`/`warning`/`info` as legible text, expand that token to a `<status>-fg` pair rather than darkening the shared value — the fill and the text want different luminances.

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

### Link tile / primary button (the CSS shape)

The `globals.css` base `button, .btn` rule — what an unstyled `<button>` renders as anywhere on the site:

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

### `<Button>` variants (`components/ui/Button.tsx`)

The cva primitive, which supersedes the base rule wherever it is used. Base string, on every variant:

```
inline-flex items-center justify-center rounded-tile text-sm font-medium
transition-colors focus-visible:outline-none focus-visible:ring-2
focus-visible:ring-offset-2 focus-visible:ring-focus
disabled:pointer-events-none disabled:opacity-50
```

| Variant | Fill | Border | Text | Hover |
|---|---|---|---|---|
| `default` | `bg-ink-primary` | `border-ink-primary` | `text-paper` | `bg-ink-body` |
| `destructive` | `bg-error` | `border-error` | `text-paper` | `bg-error/90` |
| `outline` | `bg-paper` | `border-default-strong` | `text-ink-primary` | `bg-subtle` |
| `secondary` | `bg-subtle` | `border-default` | `text-ink-primary` | `bg-subtle-hover` |
| `ghost` | `bg-transparent` | `border-transparent` | `text-ink-primary` | `bg-subtle` |
| `link` | `bg-transparent` | `border-transparent` | `text-ink-primary` | `underline` |

Every variant declares a border — including the two transparent ones — so switching variants never shifts layout by the 1px the bordered variants add.

`default` is filled-sumi, **not** `bg-accent`: accent is capped at one surface per page (§1) and this is the site-wide default variant, so accent here would stack CTAs on any page carrying two buttons. And filled-sumi means `ink-primary`, the dark warm ink — **never `ink-heading` under `text-paper`** (RULED 2026-08-25: white on the amber, though a computed 4.8:1, is not legible to actual eyes; every amber-filled primary was swept to the dark fill, hovering to `ink-body` so the text stays high-contrast in both states). Amber is for text, borders, and current-markers on light grounds only.

| Size | Utilities |
|---|---|
| `default` | `min-h-11 px-4 py-2` |
| `sm` | `min-h-11 px-3 text-xs` |
| `lg` | `min-h-12 px-8` |
| `icon` | `min-h-11 min-w-11 h-11 w-11` |

Every size clears 44px: `min-h-11` satisfies WCAG 2.5.5 (Target Size). `sm` shrinks the *type*, never the target.

### Form input / select / textarea (`components/ui/{Input,Select,Textarea}.tsx`)

One string, shared verbatim by all three:

```
flex min-h-11 w-full rounded-tile border border-default bg-surface
px-3 py-2 text-ink-primary text-sm placeholder:text-ink-muted
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
focus-visible:border-default-strong
disabled:cursor-not-allowed disabled:opacity-50
```

Error state, applied when the caller passes `hasError` (which also sets `aria-invalid`):

```
border-error focus-visible:ring-error focus-visible:border-error
```

`min-h-11` (44px), not a fixed height, satisfies WCAG 2.5.5 (Target Size) while letting a textarea grow with its `rows`.

Padding is the numeric `px-3 py-2`, not the `px-md py-sm` token pair — same choice `<Button>` makes. The spacing scale (§3) governs layout rhythm; control-internal padding is tuned against the 44px floor and the `text-sm` line box.

The focus indicator is `focus-visible:`, not `focus:`. The `globals.css` base `:focus-visible` outline would otherwise double up with the ring, which is why `focus-visible:outline-none` is in the string. Consequence to know: a **pointer** click on a `<select>` draws no ring (a `<select>` is not a text field, so it does not match `:focus-visible` on click). That is the intended pointer-vs-keyboard split — the fill channel is the pointer's, the ring channel is the keyboard's (see "Nav current state" below).

### Card (`components/ui/Card.tsx`)

```
bg-paper rounded-section border border-default
```

The same three values the `.card` / `.section-card` class applies, so the component and the class cannot render two different cards. Padding and shadow are deliberately **not** in the primitive — call sites run `p-4` through `p-8` and set their own — whereas the CSS class fixes `shadow-section p-xl`. A card at `p-4` carries a 20px radius against 16px padding; if that reads bulbous at a given call site, the fix is the call site's padding, not a second radius.

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

The rule must read as a straight rule: a row carrying `border-l-2` gets a SQUARE left corner (`rounded-r-tile rounded-l-none`, not `rounded-tile`), or the 2px stroke bends around the radius and reads as a decorative brace. On `<button>` rows, `rounded-l-none` is load-bearing rather than redundant — the `globals.css` base `button` rule already applied `rounded-tile` to all four corners.

Pair the treatment with `aria-current`: `"page"` on an exact route match (at most one per rendering), `"true"` on a section doorway whose group holds the route. One rule, one implementation — `components/shared/navActive.ts`.

### Disclosure (`components/ui/Disclosure.tsx`)

The shared show/hide shape — trigger + panel, caller-owned `expanded` state (an accordion is one state upstream of N disclosures). Trigger:

```
flex w-full items-center justify-between gap-sm min-h-11
rounded-l-none rounded-r-tile bg-transparent border-0 text-left
focus-visible:ring-2 focus-visible:ring-focus
```

`min-h-11` (44px) satisfies WCAG 2.5.5. The trigger carries `aria-expanded` + `aria-controls`; the panel carries the controlled `id` + `aria-labelledby` back at the trigger, and MOUNTS only while expanded, so collapsed content never enters a focus-trap query. The chevron is the primitive's own (`text-ink-muted`, `aria-hidden`, rotates 180° when open) — do not re-inline one.

In a nav, the section trigger takes `text-heading-h3 text-ink-heading` against `text-ink-body` page rows: the section header must DOMINATE the links it governs. A caption-sized section header over body-sized links inverts the hierarchy.

### Status surfaces

Pair `success` / `warning` / `info` as fill, border, or icon with a `text-ink-*` body — none of the three is legible as a text color. `text-error` is the one status token that measures AA-clean and is used as text (see the §1 status-token table).

---

## 8. Anti-patterns

- Hardcoded hex anywhere outside `tailwind.config.ts` and `globals.css`. Use `@apply` against tokens instead.
- Arbitrary-value Tailwind classes (`bg-[#...]`, `text-[14px]`, `rounded-[7px]`) — each is a token-drift risk.
- `text-success` / `text-warning` / `text-info` as text colors — each measures below AA against canvas (see §1). `text-error` is the exception and is measured, not assumed.
- `text-paper` / `text-subtle` / `text-canvas` — render invisible-on-canvas; the surface tokens are not text-safe.
- `focus:outline-none` without a paired `focus-visible:` indicator — leaves keyboard navigation with no visible focus state.
- New tokens added to `tailwind.config.ts` without a corresponding entry in this spec, or vice versa.

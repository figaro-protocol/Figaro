# Figaro Design Tokens — MUJI Theme Spec

This document is the canonical token reference for `frontend/tailwind.config.ts` and `frontend/app/globals.css`. The Tailwind config is the implementation; this spec is the contract. When the two disagree, fix the disagreement — do not adjudicate by precedence. Every token below is grep-verifiable in the config.

**Where the color hexes live.** Every hex in §1 is declared exactly once, in `frontend/lib/shared/designTokenValues.ts` (`colorTokens`); `tailwind.config.ts` imports that object as its `theme.extend.colors`. The module exists because some consumers cannot take a Tailwind class — SVG canvases (React Flow edge `stroke` / marker `color`), `<canvas>` painters, QR encoders, `next/og` image routes — and they must not keep private copies. It is dependency-free by contract: the Tailwind config loads it before any path alias or bundler exists, so it may never import anything. Edit a hex there; the utilities and the raw-hex consumers move together.

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
| `default-strong`  | `#b3a98f` | `border-default-strong` | Hover-emphasis borders, control outlines.         |

`default-strong` measures **2.14:1 on canvas / 2.34:1 on paper** — below WCAG 1.4.11's 3:1. It is admissible only where the control is already identified by something else (the base `button` shape pairs it with a `bg-subtle` fill and a label). Where a border is the SOLE carrier of a control's boundary or state, reach for a ≥3:1 value instead (`focus`, an `ink-*`, a status token). Focus carries its own darker token (see below).

### Ink (text)

The ink ramp is namespaced `ink.*` rather than `text.*` to avoid the `text-text-*` utility-prefix collision. Read top-down as decreasing emphasis.

| Token         | Hex       | Tailwind utility    | On `canvas` | On `paper` | On `subtle` | Use                                                      |
|---------------|-----------|---------------------|-------------|------------|-------------|----------------------------------------------------------|
| `ink.heading` | `#985d26` | `text-ink-heading`  | 4.89:1      | 5.35:1     | 4.57:1      | Page H1, strong heading emphasis. Tawny amber.           |
| `ink.primary` | `#3a322a` | `text-ink-primary`  | 11.52:1     | 12.58:1    | 10.75:1     | Default body text — set on `<body>`.                     |
| `ink.body`    | `#5a4f42` | `text-ink-body`     | 7.31:1      | 7.98:1     | 6.82:1      | Lead paragraphs, body text on subtle surfaces.           |
| `ink.muted`   | `#726a5e` | `text-ink-muted`    | 4.88:1      | 5.33:1     | 4.56:1      | Captions, secondary metadata.                            |
| `ink.faint`   | `#a89e8d` | `text-ink-faint`    | 2.42:1      | 2.64:1     | 2.26:1      | Decorative only — fails WCAG AA on canvas for body text. |

**Derivation of `ink.muted` and `ink.heading`.** Both are text, so each clears WCAG 1.4.3's 4.5:1 on every ground prose sits on — solved against `subtle`, the darkest, which leaves canvas and paper with margin. Each is its hue at unchanged hue and saturation, darkened until it clears 4.55:1 on `subtle`. `ink.muted` is the `info` hue so derived — the derivation that gives `info-fg`, so the two share one value; `info` keeps the lighter `#857c6e`: it is the fill and icon channel, judged against 1.4.11's 3:1, not a text color. `ink.heading` is the tawny amber (hsl 29 60%) so derived, which holds at normal text size the H3s, run-in labels, table headers and inline links that carry it. `frontend/tests/components/DesignTokenConformance.test.tsx` holds both to 4.5:1 on canvas, paper and subtle.

### Focus

| Token   | Hex       | Tailwind utility | On `canvas` | On `paper` | On `subtle` | On `subtle-hover` | Use                    |
|---------|-----------|------------------|-------------|------------|-------------|-------------------|------------------------|
| `focus` | `#8c7f5f` | `ring-focus`, `outline-focus` | 3.62:1 | 3.95:1 | 3.38:1 | 3.05:1 | Focus-visible ring and outline. |

**Derivation.** Aliasing `default-strong` (`#b3a98f`) measures **2.14:1 on canvas / 2.34:1 on paper** — below the 3:1 floor WCAG 1.4.11 (Non-text Contrast) sets for a focus indicator, i.e. the keyboard's only "you are here" channel fails. The focus token holds the same hue and saturation (hsl 43 19%) and lowers lightness 63% → 46%, so the palette's warm register is unchanged and only the luminance moves. The binding surface is `subtle-hover` (3.05:1), not paper: focus rings land on hovered nav rows and `bg-subtle` secondary buttons, so the darkest surface a ring can appear on is what the value is solved against — paper and canvas then clear with margin.

This value recolors **every focus state on the site** — the `globals.css :focus-visible` outline, every `focus-visible:ring-focus` in `components/ui/`, and every feature component that names `ring-focus`. No markup changes; the ring simply reads as a deeper khaki.

**Ring-offset ground.** `ringOffsetColor.DEFAULT = canvas` (`tailwind.config.ts`): the offset gap between an element and its ring draws in the page's own ground, not Tailwind's default white — on `canvas`/`subtle` surfaces a white gap read as a halo. `canvas` ≈ `paper` to the eye, so one default serves every surface; override per-site only if a ring ever sits on a dark fill.

### Accent

The single CTA-only contrast color. Traditional MUJI aizome indigo: deep, cool, distinct from every warm-neutral on the rest of the palette. Used to make a primary call-to-action read as "different mode of action" against canvas — without leaving the MUJI register.

| Token    | Hex       | Tailwind utility                            | Use                          |
|----------|-----------|---------------------------------------------|------------------------------|
| `accent` | `#2a578f` | `bg-accent`, `text-accent`, `border-accent` | Primary-CTA fill or border. |

**Discipline (load-bearing):**

- **CTAs only.** `bg-accent` / `text-accent` / `border-accent` belong to a page's one primary call to action and to nothing else — not body text, captions, status surfaces, or decorative dividers. No page spends that surface: no page or component carries any of the three utilities, and the site's calls to action are outline-sumi (`CtaLink`, `<Button>`'s `default`). The live use of the hue is the native checkbox and radio fill, `accent-accent` (`components/runtime/FieldControl.tsx`, `components/members/AssemblyChoiceRow.tsx`, `components/members/DisclosurePolicyEditor.tsx`). A focus indicator is never the accent: every field takes the Focus row's `focus-visible:ring-focus` (`frontend/tests/components/DesignTokenConformance.test.tsx` fails on any `focus:ring-accent` under `app/` or `components/`).
- **Max one accent surface per page.** Two accent fills on one page produce CTA-stacking — neither reads as primary. The outline-strong-secondary pattern (`border-ink-heading`, paper fill) is the canonical companion shape for the secondary action.
- **Never used as a text-on-canvas color** for prose. `text-accent` on canvas is decoratively visible but not body-text legible at small sizes. Reserve for short labels (button text uses `text-paper` on `bg-accent`).
- **Two hover shapes, one per job** (both are correct; do not collapse them into one rule):

  **(a) Invert, for a call to action.** A CTA hovers by flipping its fill state *within the same hue*: filled `bg-accent text-paper` ⇄ outline `bg-paper text-accent` (with `border-accent` set in both states so the outline appears on hover); outline-sumi `bg-paper text-ink-primary border-ink-primary` ⇄ filled-sumi `hover:bg-ink-primary hover:text-paper` — the marketing-page idiom, live on `/members`, `/assemblies`, `/clauses`. Crossing hue families on hover (indigo → sumi) reads as a register break; flipping fill state within one hue reads as *activation*, which is exactly what a CTA wants to promise. Never amber under white text (see §7's Button note).

  **(b) Quiet, for a utility control.** An outline `<Button>` in a form, toolbar, or table row hovers to `bg-subtle` — the surface warms, the type and border hold. A row of six utility buttons that each invert to a dark slab on hover turns a working surface into a flashing one; the quiet hover keeps the reader's eye on the content the controls act on.

  The test is the control's job, not its shape: *is this the page's call to action, or a tool beside the content?* CTAs invert; tools warm. `<Button variant="outline">`'s built-in `hover:bg-subtle` is shape (b); shape (a) is spelled out at the CTA's call site.

### Status

Each status is a **pair**, because a fill and a text run want different luminances from the same hue:

- the **bare token** is the FILL / border / ring / icon channel — judged against WCAG 1.4.11's 3:1 floor for non-text;
- the **`-fg` companion** is the TEXT channel — the same hue and saturation, darkened until it clears WCAG 1.4.3's 4.5:1.

| Token        | Hex       | Fill utility | On `canvas` | On `paper` | Text token    | Hex       | On `canvas` | On `paper` |
|--------------|-----------|--------------|-------------|------------|---------------|-----------|-------------|------------|
| `success`    | `#6b7a4a` | `bg-success` | 4.26:1      | 4.66:1     | `success-fg`  | `#637044` | 4.89:1      | 5.34:1     |
| `warning`    | `#a8762d` | `bg-warning` | 3.63:1      | 3.97:1     | `warning-fg`  | `#8c6326` | 4.89:1      | 5.35:1     |
| `error`      | `#9c4a3c` | `bg-error`   | 5.56:1      | 6.07:1     | `error-fg`    | `#9c4a3c` | 5.56:1      | 6.07:1     |
| `info`       | `#857c6e` | `bg-info`    | 3.77:1      | 4.11:1     | `info-fg`     | `#726a5e` | 4.88:1      | 5.33:1     |

Intent: `success` muted moss green, `warning` muted ocher, `error` muted terracotta, `info` the warm gray whose text channel `info-fg` is also `ink.muted`. All four bare tokens are ≥3:1 on both surfaces, so all four are valid as borders, rings, and icons (WCAG 1.4.11, Non-text Contrast) — including a Lucide icon colored by `text-warning`, which is the icon channel wearing a `text-` utility, not text.

**Derivation of the `-fg` set.** Each is its status hue at unchanged hue and saturation, darkened until it clears **4.55:1 on `subtle` (`#f0ede5`)** — the darkest surface prose sits on, which leaves canvas and paper with margin (measured above; on `subtle` the four read 4.57 / 4.57 / 5.19 / 4.56). `error-fg` **aliases `error`**: the terracotta already clears the text floor at its own lightness, so the derivation returns the value unchanged. The alias is kept rather than dropped so the rule has no exception — *status text is always `-fg`* — and so `text-error-fg` is a no-op recolor wherever `text-error` stood. `info-fg` is deliberately NOT `ink.body` (`#5a4f42`, 7.31:1): aliasing it would over-darken informational text into body-text weight and erase the register difference.

**The ban this lifts.** `text-success` / `text-warning` / `text-info` were banned outright because no status hue was legible as text. That ban now names the remedy instead of a prohibition: use `text-success-fg` / `text-warning-fg` / `text-info-fg` / `text-error-fg`. The bare `text-<status>` utilities stay off-limits for prose (they remain the icon/fill channel). `FormField` is the exemplar — its required-marker glyph and `role="alert"` message both use `text-error-fg`.

**Status-surface alpha convention.** A status surface is fill + border + foreground acting as one unit, each channel at its own weight: fills tint at `bg-<status>/10` or `/20`; hairline borders tint at `border-<status>/30`–`/40` when the border merely frames a card whose state is already carried by its text; the **bare** `border-<status>` is reserved for the case where the border is the SOLE carrier of the state (an invalid input with nothing but `aria-invalid` beside it) — that is §"Borders"' ≥3:1 sole-carrier rule applied to status. A `fixed`-position banner never tints — an alpha fill composites over scrolling content — it takes an opaque surface plus a status border rule and `-fg` text (`RpcBanner` is the exemplar).

### Dark mode

`darkMode: 'class'` is registered in `tailwind.config.ts`. No `<html class="dark">` toggle exists yet. Reserved for any future opt-in dark theme. The site-wide light palette is the default.

---

## 2. Typography tokens

### Font stack

Three faces self-hosted from `frontend/app/fonts` (the latin variable slices, each beside its OFL text) via `next/font/local` in `app/layout.tsx`, exposed as CSS variables on `<html>`; a build fetches no font:

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

Container side-padding is `px-6` (`1.5rem`, the value of `space.lg`) at every width: every page container is `container mx-auto px-6`. The `globals.css` base rule `.container { @apply px-6 sm:px-10 }` pads the page container, and only where it sets no padding of its own; `mx-auto` centers and carries no padding, so a centered figure, icon or measure keeps its own box; a `px-6` utility on the element wins at every width, because the utilities layer follows the base layer.

### Measure

| Token   | Tailwind utility | Value   | Use                                   |
|---------|------------------|---------|---------------------------------------|
| `paper` | `max-w-paper`    | `46rem` | The paper column (`PaperLayout`).     |

Every other page type reads at Tailwind's default `max-w-3xl` (`48rem`); a lead or a line inside it narrows to `max-w-2xl`.

---

## 4. Radius tokens

| Token        | Tailwind utility   | Value      | Use                                       |
|--------------|--------------------|------------|-------------------------------------------|
| `section`    | `rounded-section`  | `1.25rem`  | Section cards, modals, dialogs.           |
| `invariant`  | `rounded-invariant`| `1rem`     | Invariant cards, framed content.          |
| `tile`       | `rounded-tile`     | `0.75rem`  | Buttons, inputs, link tiles, primary CTAs. |

Tailwind's default `rounded-{none,sm,md,lg,xl,2xl,3xl,full}` scale also remains available.

---

## 5. Shadow tokens

| Token        | Tailwind utility | Value                              | Use                          |
|--------------|------------------|------------------------------------|------------------------------|
| `section`    | `shadow-section` | `0 2px 8px 0 rgba(0, 0, 0, 0.03)`  | Section cards, and a fixed control floating over scrolling content (`BackToTop`). |

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

`default` is filled-sumi, **not** `bg-accent`: accent is capped at one surface per page (§1) and this is the site-wide default variant, so accent here would stack CTAs on any page carrying two buttons. And filled-sumi means `ink-primary`, the dark warm ink — **never `ink-heading` under `text-paper`** (white on the amber, though a computed 5.35:1, is not legible to actual eyes; an amber-filled primary takes the dark fill, hovering to `ink-body` so the text stays high-contrast in both states). Amber is for text, borders, and current-markers on light grounds only.

| Size | Utilities | Height | Target-size standing |
|---|---|---|---|
| `default` | `min-h-11 px-4 py-2` | 44px | WCAG 2.5.5 (AAA) |
| `sm` | `min-h-11 px-3 text-xs` | 44px | WCAG 2.5.5 (AAA) |
| `lg` | `min-h-12 px-8` | 48px | WCAG 2.5.5 (AAA) |
| `icon` | `min-h-11 min-w-11 h-11 w-11` | 44×44px | WCAG 2.5.5 (AAA) |
| `compact` | `min-h-7 px-3 text-xs` | 28px | WCAG 2.5.8 (AA) only — **see the constraint** |

`sm` shrinks the *type*, never the target — that is the difference between `sm` and `compact`.

**`compact` is for dense tool rows only.** 28px clears WCAG 2.5.8 Target Size (Minimum, AA — 24 CSS px) but not 2.5.5 (AAA — 44). It is admissible where a row of controls sits inline with the content it acts on and a 44px row would push that content off the reading line: a table-row action strip, an editor toolbar, a filter bar over a list. It is **never** a primary CTA, never a lone control on a surface, and never the mobile-primary action. One precedence note: when a page's primary action genuinely lives inside a dense tool row (the designer's review toolbar), row consistency wins — the whole row is compact rather than one 44px control beside 28px siblings; the primary-CTA prohibition is about promoting compact onto surfaces that have room, not about demoting a row's member. Two further constraints: `px-3` plus a real label is what keeps the *width* past 24px as well, so an icon-only compact button is out (use `size="icon"`); and a compact control still needs a real gap from its neighbors — crowding two 28px targets together fails 2.5.8's spacing test even though each one passes alone.

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

### Modal / dialog (`components/ui/ModalChrome.tsx`)

Section-card shape lifted off the page. `ModalChrome` is the owning primitive — backdrop with click-to-dismiss, escape-to-dismiss, tab focus trap, initial focus + restoration, body scroll lock, `role="dialog"`/`aria-modal` ARIA — with panel styling caller-supplied (`panelClassName`); do not re-inline any of those concerns in a modal. Backdrop `rgba(58, 50, 42, 0.4)` (40% `ink.primary`) — tinted from ink, not pure black.

### Toast (`components/ui/toast.ts`)

The one notification helper over sonner — success (optional tx-hash description), error (contract reverts, wallet rejections, RPC failures decoded via `extractErrorMessage`, the same logic inline error displays use). Feature call sites import this module, never `sonner` directly; the `<Toaster>` mount lives in `app/providers.tsx`.

### Nav current state ("you are here")

Three ORTHOGONAL channels, so no two interaction states are confusable:

| Channel | State | Utilities |
|---------|-------|-----------|
| Fill    | hover (the pointer is here)   | `hover:bg-subtle-hover` |
| Ring    | focus (the keyboard is here)  | `focus-visible:ring-2` |
| Rule + weight | current (the reader is here) | `border-ink-heading` + `font-semibold` (or `font-medium` on a body-weight row) |

Never spend the fill channel on the current state — a hovered neighbor then reads as the current item. The current rule is `border-ink-heading` because the amber is already the nav's own text color; no hue family enters for a state.

Row-level rule: `pl-3.5 border-l-2` on the current row against `pl-4` on the rest — 14px + the 2px rule restores the 16px inset, so the label does not shift. `text-ink-heading` does not mark the current state: it is the nav's own text color (above), and at 4.57:1 on `bg-subtle` it sits at the WCAG 1.4.3 floor; deepen within the ink ramp (`text-ink-body` → `text-ink-primary`) instead.

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

### Tabs (`components/ui/Tabs.tsx`)

The shared WAI-ARIA tab set — one row of tabs over ONE tabpanel, caller-owned selection (`selected` + `onSelect`), the panel's content the caller's `children`. A `role="tablist"` row (`aria-label` names it) of `role="tab"` buttons, each with `aria-selected` and `aria-controls` naming the tabpanel, which `aria-labelledby` the selected tab; a roving `tabIndex`; ArrowRight / ArrowLeft (wrapping), Home and End move the selection and the focus, with automatic activation. Each tab:

```
inline-flex items-center min-h-11 px-3 text-sm rounded-tile border
```

the selected one `border-ink-heading text-ink-heading`, the rest `border-ink-muted/30 text-ink-muted hover:text-ink-heading`. `min-h-11` (44px) satisfies WCAG 2.5.5. `DataExplorer` and `RegistryExplorer` compose it; do not re-inline a tab set.

### Status surfaces

Two channels, per §1. The bare token carries the fill, border, ring, or icon (`bg-success/10`, `border-warning`, a `text-warning` Lucide glyph); the `-fg` companion carries any text that must read as that status (`text-warning-fg`). A `text-ink-*` body remains the right choice whenever the status is already carried by the fill or icon — colored prose is emphasis, and emphasis spent everywhere is emphasis nowhere.

---

## 8. Anti-patterns

- Hardcoded hex anywhere outside `lib/shared/designTokenValues.ts` and `globals.css`. Use a token class, or `@apply` against tokens. A consumer that genuinely cannot take a class (SVG stroke, canvas, QR, `next/og`) imports `colorTokens` from the values module — it never re-types the hex. One exception: the print palette in `lib/audit/pdfBundle.tsx` is deliberately outside the screen palette — print is a second medium (the evidence bundle must survive photocopying and black-and-white laser output, where the MUJI warm-neutral ramp collapses into indistinguishable mid-grays); do not "fix" it onto `colorTokens` — the code comment there is the ruling. Note also the QR encoders (`CommitmentSharePanel.tsx`, `QrChallengePanel.tsx`) pass `#000000`/`#ffffff` to the QR library: maximum-contrast module colors for scanner reliability, not palette members.
- A second copy of the palette in any form — a `colors.ts`, a CSS custom-property block duplicating §1, a per-component hex map. One source (§ intro), derived downstream.
- Arbitrary-value Tailwind classes (`bg-[#...]`, `text-[14px]`, `rounded-[7px]`) — each is a token-drift risk.
- Bare `text-success` / `text-warning` / `text-error` / `text-info` on **prose** — those are the fill/icon channel. Status text uses the `-fg` companion (§1).
- `text-paper` / `text-subtle` / `text-canvas` — render invisible-on-canvas; the surface tokens are not text-safe.
- `focus:outline-none` without a paired `focus-visible:` indicator — leaves keyboard navigation with no visible focus state.
- New tokens added to `lib/shared/designTokenValues.ts` / `tailwind.config.ts` without a corresponding entry in this spec, or vice versa. A color token also carries its measured contrast on `canvas` and `paper` in the spec — measured with the WCAG relative-luminance formula, never estimated.

---

## 9. Page composition

Six page types, one reference page each. A new page copies the reference composition of its type, in the tokens and primitives named here. Which surface a page belongs on is `docs/README.md` § "Content architecture"; the route catalog, the three doors and the wallet-provider tiers are `docs/FRONTEND.md` § "Routes" and § "Wallet-provider scope per route"; the component shapes are §7 above.

### The frame

Each route group's layout supplies the chrome; a page composes only what sits inside `<main id="main-content">`.

| Route group | Layout | Header | Wallet provider |
|---|---|---|---|
| `(marketing)` | `frontend/app/(marketing)/layout.tsx` | `MarketingHeader` (`HeaderShell`, no right cluster) | none |
| `(app)` | `frontend/app/(app)/layout.tsx` | `Header` (`HeaderShell` + `YourTurnBadge` when connected + `ConnectWallet`) | `<Providers>` |
| `(tools)` | `frontend/app/(tools)/layout.tsx` | `ToolsHeader` (`HeaderShell` + `YourTurnBadge` + `ConnectWallet`) | `<Providers>` |

All three close with `Footer` (`frontend/components/shared/Footer.tsx`). Every page type below reads in one column, `container mx-auto px-6`, at `max-w-3xl`; the paper column is `max-w-paper` (§3).

### Home — `/`

`frontend/app/(marketing)/page.tsx`; its header comment states the shape and its reasons.

- `MarketingHero` (`frontend/components/marketing/MarketingHero.tsx`): title and lead, then as children one example line (`text-base text-ink-body leading-relaxed max-w-2xl`) whose numbers render from `KERNEL_EQUILIBRIUM` (`@figaro-protocol/sdk`), and the three doors in `grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-8`, each one `text-base text-ink-body` sentence over one `CtaLink` (`frontend/components/marketing/CtaLink.tsx`).
- One section, `pb-20`: six frames, each a row `border-t border-default pt-10` (`mt-12` after the first) in `grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6 items-center`, its claim `text-heading-h3 text-ink-heading`, its fact `text-base text-ink-body leading-relaxed`, its picture `WholeStripFrame` (`frontend/components/figures/WholeStripFigure.tsx`); the picture side alternates through `md:order-*`.
- Three foot strips, each `mt-12 border-t border-default pt-8` under a `text-sm text-ink-muted` label: the on-chain compositions (each mark `h-6 w-6`, its name `text-sm text-ink-body hover:text-ink-heading`, its note `text-sm text-ink-muted`), the off-chain compositions (`text-sm text-ink-body`), and two `text-sm text-ink-muted max-w-2xl` lines, each ending in an inline link `text-ink-heading font-medium hover:underline`.

### Landing — `/core`

`docs/FRONTEND.md` § "Routes" names `/core` as the shape every door's landing takes; this entry gives its tokens. `frontend/app/(marketing)/(build)/core/page.tsx`:

- `MarketingHero`: title; as children one `CtaLink` in `flex flex-wrap gap-4 mb-8`, then the subjects, one line each, as `text-body-lead text-ink-muted max-w-2xl list-disc pl-6 space-y-2`.
- One section, `pb-20`: the subjects again as cards in `grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10`; each card `flex flex-col`, its sentence `text-heading-h3 text-ink-heading mb-2`, its paragraph `text-base text-ink-body leading-relaxed grow`, its one `CtaLink` in `mt-4`.

A landing card is a grid cell under the section rule: no `Card` surface, no shadow. The three door pages (`landings` in `frontend/lib/shared/sections.json`: `/participate`, `/terms`, `/research`) carry the same grid and card strings, with a `lead` on the hero in place of the line list. `/terms` closes with one `mt-12 border-t border-default pt-8` line in `text-sm text-ink-muted`; `/participate` follows the grid with a second section holding one trade as a table and three links.

### Owner — `/clauses`

The page a landing's card opens, which owns the how of one subject — a concept page at the site root (`docs/FRONTEND.md` § "Routes", the URL-depth rule). `frontend/app/(marketing)/(build)/clauses/page.tsx`:

- `MarketingHero`: title and lead; inline links in the lead take `underline`.
- A run of `MarketingSection`s (`frontend/components/marketing/MarketingSection.tsx`: `border-t border-default pt-xl`, H2 `text-heading-h2 text-ink-heading`, `pb-12`), each holding:
  - prose `text-sm text-ink-body leading-relaxed`, lists `space-y-3 list-disc pl-5` in the same type;
  - a table `w-full text-sm` inside `overflow-x-auto -mx-6 px-6`: header row `border-b border-default text-left font-semibold text-ink-heading`, body `[&>tr]:border-b [&>tr]:border-default align-top`, cells `py-2 pr-4`;
  - a code block `pre` in `text-xs font-mono text-ink-body bg-paper border border-default rounded-section p-4 overflow-x-auto`;
  - a sub-heading `text-heading-h3 text-ink-heading`;
  - the live registry count, `RegistryCountLink` (`frontend/components/registries/RegistryCountLink.tsx`);
  - an anchored section through `sectionId`.
- The last section, `bottomPad="wide"`, holds the page's one `CtaLink`, to the tool beneath the object (`/clauses/register`).

### Reference — `/data/explore`

A page of the reference / read-only tier (`docs/FRONTEND.md` § "Wallet-provider scope per route"): it reads the network with no wallet and mounts the provider. `frontend/app/(app)/data/explore/page.tsx`:

- The shell `container mx-auto px-6 py-10 max-w-3xl space-y-8`; a `header space-y-2` with the H1 `text-heading-h2 text-ink-heading` and one statement `text-sm text-ink-body max-w-2xl`. `/audit` (`frontend/app/(app)/audit/page.tsx`) carries the same shell and header strings.
- The reader inside `Suspense`, fallback `text-sm text-ink-muted`. `DataExplorer` (`frontend/components/data/DataExplorer.tsx`) composes `Breadcrumb` (`frontend/components/shared/Breadcrumb.tsx`); one view at a time behind `Tabs` (`frontend/components/ui/Tabs.tsx`, §7); each view headed `text-heading-h3 text-ink-heading`; `Input` and `Card` from `components/ui/`; reading, failed and resolved as three distinct states, the first two each one `text-sm text-ink-muted` line. The view rides the query string (`frontend/lib/data/explorer.ts`), so every view is a permalink.

A page that is an inventory of registrations takes its read path from `docs/FRONTEND.md` § "Canonical exemplars — copy these shapes", the event-driven inventory page (`/registries`).

### Paper — `/papers/figaro-as-a-cryptoeconomic-system`

`frontend/app/(marketing)/papers/figaro-as-a-cryptoeconomic-system/page.tsx`. The paper composes `PaperLayout`, `PaperSection`, `PaperRun` (`frontend/components/papers/PaperLayout.tsx`) and `Math` (`frontend/components/papers/Math.tsx`), and defines no component of its own.

- `PaperLayout`: `article` at `pt-16 pb-24 max-w-paper`; `Breadcrumb` (Working groups, the discipline, the title, from `frontend/app/(marketing)/_lib/paperGroups.ts`); `PaperPdfLink` (`buttonVariants({ variant: "outline", size: "sm" })`, §7); the header `paper-header border-b border-default pb-8`: H1 `text-heading-h1 text-ink-heading`, subtitle `text-body-lead text-ink-muted italic`, byline and date `text-sm text-ink-body`; the abstract `border-l-2 border-default pl-6` under a `text-xs font-semibold uppercase tracking-wide text-ink-body` label, in `text-sm text-ink-muted`, its keywords `text-xs text-ink-body`; the body `paper-body text-base text-ink-body leading-relaxed space-y-6`; the references `paper-references border-t border-default pt-8` under a `text-heading-h3` heading; the previous/next links within the discipline in `grid grid-cols-2`; `BackToTop` (`frontend/components/papers/BackToTop.tsx`).
- In the body: `PaperSection` (H2 `text-heading-h2 text-ink-heading`), `PaperRun` (run-in `font-semibold text-ink-heading`), `Math` inline and `display`; tables `text-sm border-collapse w-full` inside `overflow-x-auto my-4`, every cell `border border-default px-3 py-1.5 text-left align-top`, header cells adding `font-semibold text-ink-heading`. `PaperSubsection` (H3) and `PaperRemark` (`border-l-2 border-default pl-4 text-sm text-ink-muted italic`) are the layout's two further exports.
- The `paper-*` classes are `frontend/app/globals.css`'s print rules; the typeset PDF is `docs/FRONTEND.md` § "Static export".

### App — `/orders/view`

A transactional page (`docs/FRONTEND.md` § "Wallet-provider scope per route"). `frontend/app/(app)/orders/view/page.tsx` reads the process id from the query string inside `Suspense` (fallback `container mx-auto px-6 py-12`, `text-sm text-ink-muted`) and renders `OrderTimelineView` (`frontend/app/(app)/orders/_components/OrderTimelineView.tsx`). The derived actions it mounts are `docs/FRONTEND.md` § "Canonical exemplars — copy these shapes", the runtime order surface (`CapabilityRail`).

- The shell is the reference page's string, `container mx-auto px-6 py-10 max-w-3xl space-y-8`.
- `header space-y-3`: a caption `text-xs font-semibold text-ink-muted`; the H1 `text-heading-h1 text-ink-heading` beside a status pill `rounded-full border px-3 py-1 text-xs font-semibold` in §1's status-surface alpha convention (`border-<status>/30 bg-<status>/10 text-<status>-fg`, neutral `border-default bg-subtle text-ink-body`); one statement `text-sm text-ink-body`; meta lines `text-xs`, the process id `font-mono`.
- The panels in order (`frontend/components/runtime/`): `ResolutionProceedsPanel` and `PayoutRoutingPanel` once the process is resolved, `OrderInteractionSurfaces` and `CapabilityRail` for a wallet that is a party to it; an action error `text-sm text-error-fg`.
- The timeline: a `text-xs font-semibold text-ink-muted` label over rows `flex items-start gap-3 rounded-tile border border-default bg-paper p-3`, each led by a `h-3 w-3 rounded-full bg-success border-success` dot, its event `text-sm font-semibold text-ink-primary`, its detail `text-xs text-ink-muted`.
- The secondary links take §7's shape through `buttonVariants({ variant: "outline" })` (`frontend/components/ui/Button.tsx`): `min-h-11`, `rounded-tile`.

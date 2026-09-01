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

| Token         | Hex       | Tailwind utility    | Use                                                      |
|---------------|-----------|---------------------|----------------------------------------------------------|
| `ink.heading` | `#a16328` | `text-ink-heading`  | Page H1, strong heading emphasis. Tawny amber.           |
| `ink.primary` | `#3a322a` | `text-ink-primary`  | Default body text — set on `<body>`.                     |
| `ink.body`    | `#5a4f42` | `text-ink-body`     | Lead paragraphs, body text on subtle surfaces.           |
| `ink.muted`   | `#857c6e` | `text-ink-muted`    | Captions, secondary metadata.                            |
| `ink.faint`   | `#a89e8d` | `text-ink-faint`    | Decorative only — fails WCAG AA on canvas for body text. |

### Focus

| Token   | Hex       | Tailwind utility | On `canvas` | On `paper` | On `subtle` | On `subtle-hover` | Use                    |
|---------|-----------|------------------|-------------|------------|-------------|-------------------|------------------------|
| `focus` | `#8c7f5f` | `ring-focus`, `outline-focus` | 3.62:1 | 3.95:1 | 3.38:1 | 3.05:1 | Focus-visible ring and outline. |

**Derivation (2026-08-25).** The former value aliased `default-strong` (`#b3a98f`) and measured **2.14:1 on canvas / 2.34:1 on paper** — below the 3:1 floor WCAG 1.4.11 (Non-text Contrast) sets for a focus indicator, i.e. the keyboard's only "you are here" channel was failing. The replacement holds the same hue and saturation (hsl 43 19%) and lowers lightness 63% → 46%, so the palette's warm register is unchanged and only the luminance moves. The binding surface is `subtle-hover` (3.05:1), not paper: focus rings land on hovered nav rows and `bg-subtle` secondary buttons, so the darkest surface a ring can appear on is what the value is solved against — paper and canvas then clear with margin.

This value recolors **every focus state on the site** — the `globals.css :focus-visible` outline, every `focus-visible:ring-focus` in `components/ui/`, and every feature component that names `ring-focus`. No markup changes; the ring simply reads as a deeper khaki.

**Ring-offset ground (ruled 2026-08-25).** `ringOffsetColor.DEFAULT = canvas` (`tailwind.config.ts`): the offset gap between an element and its ring draws in the page's own ground, not Tailwind's default white — on `canvas`/`subtle` surfaces a white gap read as a halo. `canvas` ≈ `paper` to the eye, so one default serves every surface; override per-site only if a ring ever sits on a dark fill.

### Accent

The single CTA-only contrast color. Traditional MUJI aizome indigo: deep, cool, distinct from every warm-neutral on the rest of the palette. Used to make a primary call-to-action read as "different mode of action" against canvas — without leaving the MUJI register.

| Token    | Hex       | Tailwind utility                            | Use                          |
|----------|-----------|---------------------------------------------|------------------------------|
| `accent` | `#2a578f` | `bg-accent`, `text-accent`, `border-accent` | Primary-CTA fill or border. |

**Discipline (load-bearing):**

- **CTAs only.** Use `bg-accent` / `text-accent` on the primary call-to-action of a page (e.g., the marketing-header Discover button, a "Download paper" button, a "Sign commitment" button on a transactional surface). Do not use accent on body text, captions, status surfaces, or decorative dividers.
- **Max one accent surface per page.** Two accent fills on one page produce CTA-stacking — neither reads as primary. The outline-strong-secondary pattern (`border-ink-heading`, paper fill) is the canonical companion shape for the secondary action.
- **Never used as a text-on-canvas color** for prose. `text-accent` on canvas is decoratively visible but not body-text legible at small sizes. Reserve for short labels (button text uses `text-paper` on `bg-accent`).
- **Two hover shapes, one per job** (ruled 2026-08-25 — both are correct; do not collapse them into one rule):

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

Intent: `success` muted moss green, `warning` muted ochre, `error` muted terracotta, `info` the `ink.muted` alias. All four bare tokens are ≥3:1 on both surfaces, so all four are valid as borders, rings, and icons (WCAG 1.4.11, Non-text Contrast) — including a Lucide icon colored by `text-warning`, which is the icon channel wearing a `text-` utility, not text.

**Derivation of the `-fg` set (2026-08-25).** Each is its status hue at unchanged hue and saturation, darkened until it clears **4.55:1 on `subtle` (`#f0ede5`)** — the darkest surface prose sits on, which leaves canvas and paper with margin (measured above; on `subtle` the four read 4.57 / 4.57 / 5.19 / 4.56). `error-fg` **aliases `error`**: the terracotta already clears the text floor at its own lightness, so the derivation returns the value unchanged. The alias is kept rather than dropped so the rule has no exception — *status text is always `-fg`* — and so `text-error-fg` is a no-op recolor wherever `text-error` stood. `info-fg` is deliberately NOT `ink.body` (`#5a4f42`, 7.31:1): aliasing it would over-darken informational text into body-text weight and erase the register difference.

**The ban this lifts.** `text-success` / `text-warning` / `text-info` were banned outright because no status hue was legible as text. That ban now names the remedy instead of a prohibition: use `text-success-fg` / `text-warning-fg` / `text-info-fg` / `text-error-fg`. The bare `text-<status>` utilities stay off-limits for prose (they remain the icon/fill channel). `FormField` is the exemplar — its required-marker glyph and `role="alert"` message both use `text-error-fg`.

**Status-surface alpha convention (2026-08-25 sweep).** A status surface is fill + border + foreground acting as one unit, each channel at its own weight: fills tint at `bg-<status>/10` (the old `*-50` weight) or `/20` (the old `*-100`); hairline borders tint at `border-<status>/30`–`/40` when the border merely frames a card whose state is already carried by its text; the **bare** `border-<status>` is reserved for the case where the border is the SOLE carrier of the state (an invalid input with nothing but `aria-invalid` beside it) — that is §"Borders"' ≥3:1 sole-carrier rule applied to status. A `fixed`-position banner never tints — an alpha fill composites over scrolling content — it takes an opaque surface plus a status border rule and `-fg` text (`RpcBanner` is the exemplar).

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

| Size | Utilities | Height | Target-size standing |
|---|---|---|---|
| `default` | `min-h-11 px-4 py-2` | 44px | WCAG 2.5.5 (AAA) |
| `sm` | `min-h-11 px-3 text-xs` | 44px | WCAG 2.5.5 (AAA) |
| `lg` | `min-h-12 px-8` | 48px | WCAG 2.5.5 (AAA) |
| `icon` | `min-h-11 min-w-11 h-11 w-11` | 44×44px | WCAG 2.5.5 (AAA) |
| `compact` | `min-h-7 px-3 text-xs` | 28px | WCAG 2.5.8 (AA) only — **see the constraint** |

`sm` shrinks the *type*, never the target — that is the difference between `sm` and `compact`.

**`compact` is for dense tool rows only.** 28px clears WCAG 2.5.8 Target Size (Minimum, AA — 24 CSS px) but not 2.5.5 (AAA — 44). It is admissible where a row of controls sits inline with the content it acts on and a 44px row would push that content off the reading line: a table-row action strip, an editor toolbar, a filter bar over a list. It is **never** a primary CTA, never a lone control on a surface, and never the mobile-primary action. One precedence note (ruled 2026-08-25): when a page's primary action genuinely lives inside a dense tool row (the designer's review toolbar), row consistency wins — the whole row is compact rather than one 44px control beside 28px siblings; the primary-CTA prohibition is about promoting compact onto surfaces that have room, not about demoting a row's member. Two further constraints: `px-3` plus a real label is what keeps the *width* past 24px as well, so an icon-only compact button is out (use `size="icon"`); and a compact control still needs a real gap from its neighbours — crowding two 28px targets together fails 2.5.8's spacing test even though each one passes alone.

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

Two channels, per §1. The bare token carries the fill, border, ring, or icon (`bg-success/10`, `border-warning`, a `text-warning` Lucide glyph); the `-fg` companion carries any text that must read as that status (`text-warning-fg`). A `text-ink-*` body remains the right choice whenever the status is already carried by the fill or icon — colored prose is emphasis, and emphasis spent everywhere is emphasis nowhere.

---

## 8. Anti-patterns

- Hardcoded hex anywhere outside `lib/shared/designTokenValues.ts` and `globals.css`. Use a token class, or `@apply` against tokens. A consumer that genuinely cannot take a class (SVG stroke, canvas, QR, `next/og`) imports `colorTokens` from the values module — it never re-types the hex. One RULED exception (2026-08-25): the print palette in `lib/audit/pdfBundle.tsx` is deliberately outside the screen palette — print is a second medium (the evidence bundle must survive photocopying and black-and-white laser output, where the MUJI warm-neutral ramp collapses into indistinguishable mid-grays); do not "fix" it onto `colorTokens` — the code comment there is the ruling. Note also the QR encoders (`CommitmentSharePanel.tsx`, `QrChallengePanel.tsx`) pass `#000000`/`#ffffff` to the QR library: maximum-contrast module colors for scanner reliability, not palette members.
- A second copy of the palette in any form — a `colors.ts`, a CSS custom-property block duplicating §1, a per-component hex map. One source (§ intro), derived downstream.
- Arbitrary-value Tailwind classes (`bg-[#...]`, `text-[14px]`, `rounded-[7px]`) — each is a token-drift risk.
- Bare `text-success` / `text-warning` / `text-error` / `text-info` on **prose** — those are the fill/icon channel. Status text uses the `-fg` companion (§1).
- `text-paper` / `text-subtle` / `text-canvas` — render invisible-on-canvas; the surface tokens are not text-safe.
- `focus:outline-none` without a paired `focus-visible:` indicator — leaves keyboard navigation with no visible focus state.
- New tokens added to `lib/shared/designTokenValues.ts` / `tailwind.config.ts` without a corresponding entry in this spec, or vice versa. A color token also carries its measured contrast on `canvas` and `paper` in the spec — measured with the WCAG relative-luminance formula, never estimated.

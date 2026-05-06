import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        // Top-level palette replaces Tailwind defaults; preserved verbatim so
        // existing `gray.*` consumers continue to compile during the Step 3
        // migration. New MUJI tokens are added in `extend.colors` below.
        colors: {
            white: '#ffffff',
            black: '#000000',
            transparent: 'transparent',
            gray: {
                50: '#f9fafb',
                100: '#f3f4f6',
                200: '#e5e7eb',
                300: '#d1d5db',
                400: '#9ca3af',
                500: '#6b7280',
                600: '#4b5563',
                700: '#374151',
                800: '#1f2937',
                900: '#111827',
            },
        },
        // Top-level borderRadius replaces Tailwind defaults; preserved so
        // existing `rounded-{sm,md,lg,xl}` consumers continue to compile.
        // MUJI radii are added under role-based keys in `extend.borderRadius`.
        borderRadius: {
            none: '0',
            sm: '0.125rem',
            DEFAULT: '0.25rem',
            md: '0.375rem',
            lg: '0.5rem',
            xl: '0.75rem',
            full: '9999px',
        },
        extend: {
            // Per docs/v5/DESIGN_TOKENS.md §1 (Color tokens).
            // The `bg./text./border.` namespacing in the spec is dropped because
            // Tailwind class generation uses role names directly (`bg-canvas`,
            // `text-muted`, `border-default`). Note the deliberate rename of
            // `text.*` to `ink.*` to avoid the `text-text-*` class collision
            // (Tailwind utility prefix `text-` + token key `text`).
            colors: {
                // Surfaces — Step 3.3 revision: warmer recessed surfaces (R>G>B)
                // so the muji palette reads as warm rather than near-cool-gray.
                canvas: '#f5f5f2',
                paper: '#ffffff',
                surface: '#ffffff',
                subtle: '#f0ede5',
                'subtle-hover': '#e6e2d8',
                // Borders — warm linen/taupe replacing neutral grays.
                default: '#e0dccf',
                'default-strong': '#b3a98f',
                // Text (`ink.*` to avoid `text-text-*` collision).
                // Step 3.3 revision: cool-neutral grays (#111/#222/#333/#555/#888)
                // failed visible-warmth test against Tailwind's gray.* ramp;
                // replaced with R>G>B warm-neutral ramp (sumi → cocoa → khaki).
                ink: {
                    heading: '#1c1814',
                    primary: '#3a322a',
                    body: '#5a4f42',
                    muted: '#857c6e',
                    faint: '#a89e8d',
                },
                focus: '#b3a98f',
                success: '#6b7a4a',
                warning: '#a8762d',
                error: '#9c4a3c',
                info: '#857c6e',
            },
            // Per docs/v5/DESIGN_TOKENS.md §3 (Spacing tokens).
            // Six-step scale aliasing the muji-* values; named `xs..2xl` so
            // utilities read as `p-md`, `gap-lg`, `mt-2xl`. Container side-padding
            // (1.5rem / sm:2.5rem) already lives in `space.lg` / `space.xl`.
            spacing: {
                xs: '0.5rem',
                sm: '0.75rem',
                md: '1rem',
                lg: '1.5rem',
                xl: '2.5rem',
                '2xl': '3.5rem',
            },
            // Per docs/v5/DESIGN_TOKENS.md §4 (Radius tokens).
            // Spec ties `link`, `button`, `input` all to 0.75rem; deduplicated
            // here to a single `tile` key. `section`, `invariant`, `glyph`
            // keep their distinct roles.
            borderRadius: {
                section: '1.25rem',
                invariant: '1rem',
                tile: '0.75rem',   // shared by .muji-links a, button, input
                glyph: '0.25rem',
            },
            // Per docs/v5/DESIGN_TOKENS.md §2 (Typography tokens — Font stack).
            // Namespaced `muji-sans` / `muji-mono` (not plain `sans`/`mono`)
            // so Tailwind's default `font-sans` / `font-mono` stay reachable
            // through the Step 3 migration.
            fontFamily: {
                'muji-sans': [
                    'Noto Sans JP',
                    'Inter',
                    'Helvetica Neue',
                    'Arial',
                    'sans-serif',
                ],
                'muji-mono': [
                    'JetBrains Mono',
                    'ui-monospace',
                    'SFMono-Regular',
                    'Menlo',
                    'monospace',
                ],
            },
            // Per docs/v5/DESIGN_TOKENS.md §2 (Typography tokens — Type scale).
            // Each entry is [size, { lineHeight?, letterSpacing?, fontWeight? }]
            // so a single utility (e.g. `text-heading-h1`) carries the full
            // metric set. The three muji-* invariant scales are kept under
            // `muji-*` keys to mirror the spec's source-of-truth class names.
            fontSize: {
                // Step 3.3 revision: prior scale (2.5rem / 1.875rem / 1.25rem +
                // 17px base / 1.7 line-height / 0.01em tracking) produced "huge"
                // rendering; reduced to MUJI catalog density.
                'heading-h1': ['2rem', { lineHeight: '1.25', letterSpacing: '0.005em', fontWeight: '600' }],
                'heading-h2': ['1.5rem', { lineHeight: '1.3', letterSpacing: '0.005em', fontWeight: '600' }],
                'heading-h3': ['1.125rem', { lineHeight: '1.4', letterSpacing: '0.005em', fontWeight: '600' }],
                'body-lead': ['1.125rem', { lineHeight: '1.6', letterSpacing: '0.005em', fontWeight: '400' }],
                eyebrow: ['0.8125rem', { lineHeight: '1.4', letterSpacing: '0.08em', fontWeight: '600' }],
                'muji-title': ['2.5rem', { letterSpacing: '0.01em', fontWeight: '600' }],
                'muji-subtitle': ['1.25rem', {}],
                'muji-invariant-label': ['1.5rem', {}],
                'muji-invariant-body': ['1rem', {}],
                'muji-footer': ['0.95rem', {}],
            },
            // Per docs/v5/DESIGN_TOKENS.md §5 (Shadow tokens).
            // Only the section-card shadow is named; `link` and `invariant`
            // are explicitly `none` in the spec and map to Tailwind's existing
            // `shadow-none`, so no token is added for them.
            boxShadow: {
                section: '0 2px 8px 0 rgba(0, 0, 0, 0.03)',
            },
            // Per docs/v5/DESIGN_TOKENS.md §2 (Typography tokens — `type.eyebrow`).
            // The 0.08em tracking value used by the eyebrow label.
            letterSpacing: {
                eyebrow: '0.08em',
            },
        },
    },
    plugins: [],
};

export default config;

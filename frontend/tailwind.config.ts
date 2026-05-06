import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    // Class-based dark mode strategy. Registered but not yet enabled — no
    // top-level `<html class="dark">` toggle exists. Reserved for the
    // Console route's dark surface and any future opt-in dark theme.
    darkMode: 'class',
    theme: {
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
                // Accent — traditional MUJI aizome indigo. The single
                // CTA-only contrast color in an otherwise warm-neutral
                // palette. See DESIGN_TOKENS.md §1 for the discipline:
                // accent surfaces appear at most once per page, on the
                // primary call-to-action; never on body / status / icons.
                accent: '#2a578f',
                'accent-hover': '#3d6ba3',
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
            // Fonts are loaded via `next/font/google` in `app/layout.tsx` and
            // exposed as CSS variables so the Tailwind stacks resolve to the
            // actually-fetched files at runtime. The default `sans` and `mono`
            // keys are also overridden so any `font-sans` / `font-mono`
            // consumer (including body inheritance) picks up the MUJI stack.
            fontFamily: {
                sans: [
                    'var(--font-noto-sans-jp)',
                    'var(--font-inter)',
                    'Helvetica Neue',
                    'Arial',
                    'sans-serif',
                ],
                mono: [
                    'var(--font-jetbrains-mono)',
                    'ui-monospace',
                    'SFMono-Regular',
                    'Menlo',
                    'monospace',
                ],
                'muji-sans': [
                    'var(--font-noto-sans-jp)',
                    'var(--font-inter)',
                    'Helvetica Neue',
                    'Arial',
                    'sans-serif',
                ],
                'muji-mono': [
                    'var(--font-jetbrains-mono)',
                    'ui-monospace',
                    'SFMono-Regular',
                    'Menlo',
                    'monospace',
                ],
            },
            // Per docs/v5/DESIGN_TOKENS.md §2 (Type scale).
            // Each entry is [size, { lineHeight, letterSpacing, fontWeight }]
            // so a single utility (e.g. `text-heading-h1`) carries the full
            // metric set without needing a chain of utilities.
            fontSize: {
                'heading-h1': ['2rem', { lineHeight: '1.25', letterSpacing: '0.005em', fontWeight: '600' }],
                'heading-h2': ['1.5rem', { lineHeight: '1.3', letterSpacing: '0.005em', fontWeight: '600' }],
                'heading-h3': ['1.125rem', { lineHeight: '1.4', letterSpacing: '0.005em', fontWeight: '600' }],
                'body-lead': ['1.125rem', { lineHeight: '1.6', letterSpacing: '0.005em', fontWeight: '400' }],
                eyebrow: ['0.8125rem', { lineHeight: '1.4', letterSpacing: '0.08em', fontWeight: '600' }],
            },
            // Per docs/v5/DESIGN_TOKENS.md §5 (Shadow tokens).
            // Only the section-card shadow is named; link and invariant cards
            // are explicitly shadow-less and use Tailwind's existing `shadow-none`.
            boxShadow: {
                section: '0 2px 8px 0 rgba(0, 0, 0, 0.03)',
            },
        },
    },
    plugins: [],
};

export default config;

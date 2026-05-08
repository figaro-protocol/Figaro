/**
 * Fixture factory for `ResolvedAssemblySkinBundle` used across the
 * RuntimeSkin*.test.tsx files. Replaces ~130 LOC of byte-identical
 * literal copy-paste with one definition.
 *
 * Defaults to Bob's Pizza Palace, which is what 4 of the 8 skin tests
 * already used. Other tests pass their own slug + display name.
 */

import type { ResolvedAssemblySkinBundle } from '@/lib/shared/runtimeResolution';

export interface SkinBundleOverrides {
    /** URL-safe identifier woven into both `skinId` and `bindingId`. */
    slug?: string;
    displayName?: string;
    themeClass?: string;
}

export function makeSkinBundle(overrides: SkinBundleOverrides = {}): ResolvedAssemblySkinBundle {
    const slug = overrides.slug ?? 'bobs-pizza-palace';
    const displayName = overrides.displayName ?? "Bob's Pizza Palace";
    const themeClass = overrides.themeClass ?? 'runtime-shell-pizza';
    return {
        sourceKind: 'runtime-bound',
        skinId: `binding-${slug}-local-anvil`,
        subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        bindingId: `binding:${slug}:local-anvil`,
        branding: {
            branding: {
                displayName,
                accentColor: '#1f6feb',
                themeClass,
            },
            assets: {},
            logoURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png',
            heroImageURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png',
            cssURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css',
        },
    };
}

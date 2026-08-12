import type { Metadata } from "next";

const SITE_SUFFIX = " — Figaro Protocol";

/**
 * Derives a page's Open Graph + Twitter metadata from its OWN `title` +
 * `description` — no new copy authored. Next.js does not fall back to
 * `metadata.title` for `openGraph`/`twitter`: a page with no `openGraph`
 * block inherits the root layout's site-wide one wholesale, so a shared
 * link unfurls as the generic homepage card instead of that page's own
 * title. `og:title` drops the " — Figaro Protocol" suffix (applied
 * uniformly across every caller); the site context comes from `siteName`,
 * which MUST be set here — the wholesale replacement that motivates this
 * helper also discards the root layout's `siteName`. The same wholesale
 * replacement is why `images` is set explicitly: pages that leaned on the
 * root `app/opengraph-image.tsx` file convention alone shipped no
 * `og:image` (the page-level `openGraph` block replaced the resolved one),
 * so every caller points at the emitted `/opengraph-image` card here;
 * `metadataBase` makes the URL absolute.
 */
export const OG_IMAGE = {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: "Figaro completes the contract.",
};

export function withOg({
    title,
    description,
}: {
    title: string;
    description: string;
}): Metadata {
    const ogTitle = title.endsWith(SITE_SUFFIX)
        ? title.slice(0, -SITE_SUFFIX.length)
        : title;
    return {
        title,
        description,
        openGraph: {
            title: ogTitle,
            description,
            siteName: "Figaro Protocol",
            type: "website",
            images: [OG_IMAGE],
        },
        twitter: {
            card: "summary_large_image",
            title: ogTitle,
            description,
            images: [OG_IMAGE.url],
        },
    };
}

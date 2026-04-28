import type { MetadataRoute } from "next";

// Set NEXT_PUBLIC_SITE_URL in deployment env (e.g. https://figaro.org).
// Falls back to a placeholder so build does not fail in dev.
const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://figaro.example";

// Public surface. Per-instance / interactive surfaces (/sign, /terminal,
// /i/[slug], /console, /evidence-display, /fig/claim, /builders/{designer,
// authoring,assemblies,prototype}) are excluded.
const PUBLIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/spec", changeFrequency: "weekly", priority: 0.9 },
    { path: "/builders", changeFrequency: "weekly", priority: 0.9 },
    { path: "/resources", changeFrequency: "weekly", priority: 0.9 },
    { path: "/publications", changeFrequency: "weekly", priority: 0.9 },
    { path: "/about", changeFrequency: "weekly", priority: 0.9 },
    { path: "/local-commerce", changeFrequency: "weekly", priority: 0.8 },
    { path: "/operators", changeFrequency: "weekly", priority: 0.8 },
    { path: "/fig", changeFrequency: "weekly", priority: 0.8 },
    { path: "/mechanism", changeFrequency: "monthly", priority: 0.8 },
    { path: "/schemas", changeFrequency: "weekly", priority: 0.7 },
    { path: "/integrate", changeFrequency: "weekly", priority: 0.7 },
    { path: "/verification", changeFrequency: "weekly", priority: 0.7 },
    { path: "/compliance", changeFrequency: "weekly", priority: 0.7 },
    { path: "/research", changeFrequency: "weekly", priority: 0.7 },
    { path: "/sovereign-commerce", changeFrequency: "monthly", priority: 0.7 },
    { path: "/legal", changeFrequency: "monthly", priority: 0.7 },
    { path: "/labor-law", changeFrequency: "monthly", priority: 0.7 },
    { path: "/displaced", changeFrequency: "monthly", priority: 0.7 },
    { path: "/accounting", changeFrequency: "monthly", priority: 0.7 },
    { path: "/economics", changeFrequency: "monthly", priority: 0.7 },
    { path: "/fig/design", changeFrequency: "monthly", priority: 0.7 },
    { path: "/treasuries", changeFrequency: "monthly", priority: 0.6 },
    { path: "/help", changeFrequency: "monthly", priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();
    return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
        url: `${SITE_URL}${path}`,
        lastModified,
        changeFrequency,
        priority,
    }));
}

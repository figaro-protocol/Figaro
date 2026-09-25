import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// STATIC EXPORT, the same shape as frontend/next.config.mjs: `out/` is a plain
// file tree the deploy places at `/docs` on the main host (option A — no proxy,
// no subdomain), with the directory-per-route layout (`<route>/index.html`) and
// a trailing slash on every canonical URL, so no rewrite layer is needed. The
// `basePath` prefixes every route and asset URL with `/docs`, which is what
// makes the export self-consistent when served under that path.
/** @type {import('next').NextConfig} */
const config = {
    output: 'export',
    basePath: '/docs',
    trailingSlash: true,
    reactStrictMode: true,
    images: {
        unoptimized: true,
    },
};

export default withMDX(config);

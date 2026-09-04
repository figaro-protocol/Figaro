import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// STATIC EXPORT, the same shape as frontend/next.config.mjs: `out/` is a plain
// file tree servable from any static host under its own subdomain, with the
// directory-per-route layout (`<route>/index.html`) and a trailing slash on
// every canonical URL, so no rewrite layer is needed anywhere.
/** @type {import('next').NextConfig} */
const config = {
    output: 'export',
    trailingSlash: true,
    reactStrictMode: true,
    images: {
        unoptimized: true,
    },
};

export default withMDX(config);

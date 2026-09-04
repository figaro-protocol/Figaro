# docs-site — the builders' documentation

The Figaro Protocol's own documents, rendered as a static site for the people who build on the protocol. The public site (`frontend/`) presents the protocol; this one holds the detail behind it. It is a separate app with its own dependencies; nothing in `frontend/`, `docs/`, or `sdk/` refers to it.

## What renders here

Nothing is written here twice. Every page is one file that lives elsewhere in the repository — `docs/*.md`, `sdk/README.md`, `ecosystem-agents/*.md` — and `scripts/assemble-content.mjs` copies it into the ignored `content/` tree at build time, adds the frontmatter fumadocs needs, and rewrites repo-relative links (to the sibling page when the target is also rendered here, to GitHub otherwise). The typedoc output under `frontend/public/sdk-api/` is copied into `public/sdk-api/` the same way, so the export carries the API reference at `/sdk-api/`. Each page names its source at the top. To change a page, edit its source; to add or reorder one, edit the `SOURCES` table in the script and the `meta.json` under `site/`.

`site/` holds the only pages written here: the sidebar map (`meta.json` per section), the index, the security page, and the working-groups stub.

`$…$` in a source is LaTeX (remark-math + rehype-katex); the sources are compiled as plain markdown, so braces and angle brackets in prose stay literal.

## Build

```bash
cd docs-site
npm install
npm run build      # runs the assembly first, then `next build`; the site lands in out/
npm run dev        # assembles, then serves with hot reload
```

`content/`, `public/sdk-api/`, `out/`, `.next/`, and `.source/` are generated and ignored.

## Deploy shape

`out/` is a plain static file tree (`output: 'export'`, `trailingSlash: true` — every route is `<route>/index.html`), servable from any static host under its own subdomain with no rewrite layer and no Node.js runtime. Search runs client-side over an index prerendered into the export.

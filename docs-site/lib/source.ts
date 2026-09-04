import { loader } from 'fumadocs-core/source';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import { defineDocs } from 'fumadocs-mdx/macro';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { z } from 'zod';

// `content/` is assembled at build time by scripts/assemble-content.mjs from
// the repository's own documents; `source` is the repo path each page renders,
// written into its frontmatter by that script.
const docs = defineDocs({
    dir: 'content',
    docs: {
        schema: pageSchema.extend({
            source: z.string().optional(),
        }),
        // The sources are plain markdown (compiled as `md`, so braces and
        // angle brackets in prose stay literal). `$…$` in them is LaTeX.
        mdxOptions: applyMdxPreset({
            remarkPlugins: [remarkMath],
            rehypePlugins: [rehypeKatex],
        }),
        postprocess: {
            includeProcessedMarkdown: true,
        },
    },
    meta: {
        schema: metaSchema,
    },
});

export const source = loader({
    baseUrl: '/',
    source: docs.toFumadocsSource(),
});

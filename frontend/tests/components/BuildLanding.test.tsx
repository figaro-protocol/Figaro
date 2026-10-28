/**
 * BuildLanding.test.tsx — the Build landing's first screen ranks one action.
 *
 * The landing (`/terms`) opened on parallel cards with equal buttons, and a
 * panel round read it as links with no ranking. The first action is the run
 * tutorial, in the hero above the cards; the second is the design tutorial,
 * one muted line below it. Both are docs-site pages (a separate build under
 * `/docs`, `trailingSlash: true`), which the stranger crawl skips, so this
 * test also checks that each slug has its source in `docs-site/site/building/`.
 *
 * `renderToString`, as in `TagPageHydration.test.tsx`: the order asserted is
 * the order of the prerendered HTML a browser receives.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import BuildDoor from "@/app/(marketing)/(build)/terms/page";

const RUN = "/docs/building/run-a-published-composition/";
const DESIGN = "/docs/building/design-a-composition/";

describe("the Build landing's first action", () => {
    const markup = renderToString(<BuildDoor />);
    const hrefs = [...markup.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => ({ href: m[1], at: m.index ?? 0 }));

    it("the first link is the run tutorial, before the first h2", () => {
        expect(hrefs.length).toBeGreaterThan(0);
        expect(hrefs[0].href).toBe(RUN);
        const firstH2 = markup.search(/<h2\b/);
        expect(firstH2, "the landing still carries its subject cards").toBeGreaterThan(-1);
        expect(hrefs[0].at).toBeLessThan(firstH2);
    });

    it("the next docs link is the design tutorial", () => {
        const docs = hrefs.filter((h) => h.href.startsWith("/docs/"));
        expect(docs[1]?.href).toBe(DESIGN);
    });

    it("each tutorial has its source in the docs-site", () => {
        for (const href of [RUN, DESIGN]) {
            const slug = href.replace(/^\/docs\/building\//, "").replace(/\/$/, "");
            const source = path.resolve(__dirname, "../../../docs-site/site/building", `${slug}.mdx`);
            expect(fs.existsSync(source), source).toBe(true);
        }
    });
});

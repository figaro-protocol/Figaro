/**
 * TagPageHydration.test.tsx — the working-groups tag pages must hydrate
 * against their own prerendered HTML.
 *
 * The defect this guards: `<Breadcrumb>` renders a `<nav>`, and it was being
 * passed into `MarketingHero`'s `lead`, which renders inside a `<p>`. The
 * HTML parser closes an open `<p>` at any `<nav>`, so the browser built a DOM
 * the server markup did not describe and React's tree did not match it —
 * "Hydration failed because the initial UI does not match what was rendered
 * on the server" (minified #418, followed by #423 as the root fell back to
 * client rendering) on all 200 `/working-groups/{for,on}/<tag>` pages.
 *
 * The test hydrates the REAL server markup the way a browser does: the
 * `renderToString` output is assigned through `innerHTML`, so the parser's
 * relocation happens here exactly as it does on load. Asserting on
 * `console.error` is the point — React reports a hydration mismatch there and
 * recovers, so a passing render proves nothing on its own.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "react";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { TagPage } from "@/app/(marketing)/(research)/working-groups/_components/TagPage";
import { tagIndex } from "@/app/(marketing)/_lib/paperGroups";

/** Hydrate `node` against its own server markup, parsed by the browser, and
 *  return everything React logged. Empty = the server HTML and the client
 *  tree agree.
 *
 *  `renderToString`, never `renderToStaticMarkup`: the prerender ships the
 *  `<!-- -->` separators that keep adjacent text nodes distinct, and hydration
 *  needs them. Static markup drops them and manufactures a text mismatch that
 *  the real page never has. */
async function hydrationErrors(node: React.ReactElement): Promise<string[]> {
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = renderToString(node);
    const logged: string[] = [];
    const spy = vi
        .spyOn(console, "error")
        .mockImplementation((...args: unknown[]) => logged.push(args.map(String).join(" ")));
    await act(async () => {
        hydrateRoot(container, node);
    });
    spy.mockRestore();
    container.remove();
    return logged;
}

describe("the working-groups tag pages hydrate against their prerendered HTML", () => {
    it("renders the trail outside the lead paragraph, so nothing is relocated", async () => {
        const first = tagIndex("for")[0];
        expect(first, "the industry index is derived from the registry and is non-empty").toBeTruthy();

        const markup = renderToString(<TagPage kind="for" slug={first.slug} />);
        // The trail is present and the lead paragraph does not contain it:
        // no <nav> may open while a <p> is open.
        expect(markup).toContain('aria-label="Breadcrumb"');
        expect(markup).not.toMatch(/<p\b[^>]*>(?:(?!<\/p>).)*?<nav\b/s);

        const errors = await hydrationErrors(<TagPage kind="for" slug={first.slug} />);
        expect(errors, `React reported: ${errors.join(" | ")}`).toEqual([]);
    });

    it("the keyword index hydrates the same way", async () => {
        const first = tagIndex("on")[0];
        const errors = await hydrationErrors(<TagPage kind="on" slug={first.slug} />);
        expect(errors, `React reported: ${errors.join(" | ")}`).toEqual([]);
    });

    it("a block element inside the hero's lead IS the mismatch — the shape this guards against", async () => {
        // The pre-fix arrangement, kept as the negative control: without it a
        // green suite above would prove only that the assertion never fires.
        const errors = await hydrationErrors(
            <MarketingHero
                title="Accounting and audit"
                lead={
                    <>
                        <Breadcrumb items={[{ label: "Working groups", href: "/working-groups" }, { label: "Accounting and audit" }]} />
                        Two papers carry this industry.
                    </>
                }
            />,
        );
        expect(errors.join(" ")).toMatch(/Hydration failed/i);
    });
});

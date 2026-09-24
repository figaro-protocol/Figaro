import { describe, expect, it } from "vitest";
import { currentSection, sectionFaqRoute, sectionsOfRoute } from "@/lib/shared/sections";

describe("the section map", () => {
    it("resolves a route by its longest prefix, ignoring query, hash, and trailing slash", () => {
        expect(sectionsOfRoute("/kernel")).toEqual(["code"]);
        expect(sectionsOfRoute("/clauses/register")).toEqual(["terms"]);
        expect(sectionsOfRoute("/data")).toEqual(["evidence"]);
        expect(sectionsOfRoute("/data/explore")).toEqual(["evidence", "code"]);
        expect(sectionsOfRoute("/data/explore/?x=1#y")).toEqual(["evidence", "code"]);
        expect(sectionsOfRoute("/terms/faq")).toEqual(["terms"]);
        expect(sectionsOfRoute("/core/faq")).toEqual(["code"]);
        expect(sectionsOfRoute("/communities")).toEqual(["communities"]);
        expect(sectionsOfRoute("/agents/how")).toEqual(["join"]);
    });

    it("puts the home page in no section and an unknown route in none", () => {
        expect(sectionsOfRoute("/")).toEqual([]);
        expect(currentSection("/")).toBeNull();
        expect(currentSection("/no-such-route")).toBeNull();
    });

    it("gives the builders' FAQ to terms, the core's to the code, and the users' to every other door and the home page", () => {
        expect(sectionFaqRoute("join")).toBe("/faq");
        expect(sectionFaqRoute("trade")).toBe("/faq");
        expect(sectionFaqRoute("communities")).toBe("/faq");
        expect(sectionFaqRoute("evidence")).toBe("/faq");
        expect(sectionFaqRoute("terms")).toBe("/terms/faq");
        expect(sectionFaqRoute("code")).toBe("/core/faq");
        expect(sectionFaqRoute(null)).toBe("/faq");
    });

});

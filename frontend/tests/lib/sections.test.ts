import { describe, expect, it } from "vitest";
import {
    SECTION_IDS,
    currentSection,
    navGroupShown,
    sectionFaqRoute,
    sectionLabel,
    sectionLanding,
    sectionsOfRoute,
} from "@/lib/shared/sections";

describe("the section map", () => {
    it("owns every landing by its own section", () => {
        for (const s of SECTION_IDS) expect(currentSection(sectionLanding(s))).toBe(s);
    });

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

    it("names the section beside the logo, and nothing on the home page", () => {
        expect(sectionLabel(currentSection("/clauses"))).toBe("Terms");
        expect(sectionLabel(currentSection("/spec"))).toBe("The code");
        expect(sectionLabel(currentSection("/members"))).toBe("Join");
        expect(sectionLabel(currentSection("/local-commerce"))).toBe("One trade");
        expect(sectionLabel(currentSection("/"))).toBeNull();
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

    it("shows a nav group in a section when the section shows any page in it", () => {
        expect(navGroupShown(["/clauses", "/assemblies"], "/kernel")).toBe(false);
        expect(navGroupShown(["/clauses", "/assemblies"], "/rpgf")).toBe(true);
        expect(navGroupShown(["/agents", "/agents/how"], "/members")).toBe(true);
        expect(navGroupShown(["/data", "/data/explore"], "/kernel")).toBe(true);
        expect(navGroupShown(["/data", "/data/yours"], "/kernel")).toBe(false);
    });

    it("shows no group on the home page — its chrome is the six door links alone", () => {
        expect(navGroupShown(["/members", "/agents"], "/")).toBe(false);
        expect(navGroupShown(["/terms", "/clauses"], "/")).toBe(false);
        expect(navGroupShown(["/core", "/kernel"], "/")).toBe(false);
        expect(navGroupShown(["/local-commerce"], "/")).toBe(false);
    });
});

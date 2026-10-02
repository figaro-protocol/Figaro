import { describe, expect, it } from "vitest";
import { currentSection, sectionFaqRoute, sectionLanding, sectionsOfRoute } from "@/lib/shared/sections";

describe("the section map", () => {
    it("resolves a route by its longest prefix, ignoring query, hash, and trailing slash", () => {
        expect(sectionsOfRoute("/kernel")).toEqual(["research"]);
        expect(sectionsOfRoute("/clauses/register")).toEqual(["build"]);
        expect(sectionsOfRoute("/data")).toEqual(["research"]);
        expect(sectionsOfRoute("/data/explore")).toEqual(["research"]);
        expect(sectionsOfRoute("/data/explore/?x=1#y")).toEqual(["research"]);
        expect(sectionsOfRoute("/data/yours")).toEqual(["participate"]);
        expect(sectionsOfRoute("/terms/faq")).toEqual(["build"]);
        expect(sectionsOfRoute("/core/faq")).toEqual(["build"]);
        expect(sectionsOfRoute("/communities")).toEqual(["participate"]);
        expect(sectionsOfRoute("/agents/how")).toEqual(["participate", "build"]);
        expect(sectionsOfRoute("/security")).toEqual(["research", "build"]);
        expect(sectionsOfRoute("/papers/asymmetric-bonding")).toEqual(["research"]);
    });

    it("puts the home page in no section and an unknown route in none", () => {
        expect(sectionsOfRoute("/")).toEqual([]);
        expect(currentSection("/")).toBeNull();
        expect(currentSection("/no-such-route")).toBeNull();
    });

    it("gives a shared surface to the first section that lists it", () => {
        expect(currentSection("/agents")).toBe("participate");
        expect(currentSection("/security/")).toBe("research");
    });

    it("names each section's door page", () => {
        expect(sectionLanding("participate")).toBe("/participate");
        expect(sectionLanding("build")).toBe("/terms");
        expect(sectionLanding("research")).toBe("/research");
    });

    it("gives the builders' FAQ to build, the core's to research, and the users' to participate and the home page", () => {
        expect(sectionFaqRoute("participate")).toBe("/faq");
        expect(sectionFaqRoute("build")).toBe("/terms/faq");
        expect(sectionFaqRoute("research")).toBe("/core/faq");
        expect(sectionFaqRoute(null)).toBe("/faq");
    });

});

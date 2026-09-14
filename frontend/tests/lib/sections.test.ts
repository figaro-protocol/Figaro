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
        expect(sectionsOfRoute("/kernel")).toEqual(["core"]);
        expect(sectionsOfRoute("/clauses/register")).toEqual(["build"]);
        expect(sectionsOfRoute("/data")).toEqual(["use"]);
        expect(sectionsOfRoute("/data/explore")).toEqual(["core", "use"]);
        expect(sectionsOfRoute("/data/explore/?x=1#y")).toEqual(["core", "use"]);
        expect(sectionsOfRoute("/build/faq")).toEqual(["build"]);
        expect(sectionsOfRoute("/core/faq")).toEqual(["core"]);
        expect(sectionsOfRoute("/use/assemblies")).toEqual(["use"]);
    });

    it("puts the apex in no section and an unknown route in none", () => {
        expect(sectionsOfRoute("/")).toEqual([]);
        expect(currentSection("/")).toBeNull();
        expect(currentSection("/no-such-route")).toBeNull();
    });

    it("names the section beside the logo, and nothing on the apex", () => {
        expect(sectionLabel(currentSection("/clauses"))).toBe("Build");
        expect(sectionLabel(currentSection("/spec"))).toBe("Core");
        expect(sectionLabel(currentSection("/members"))).toBe("Use");
        expect(sectionLabel(currentSection("/"))).toBeNull();
    });

    it("gives each section its own FAQ, and the users' to the apex", () => {
        expect(sectionFaqRoute("use")).toBe("/faq");
        expect(sectionFaqRoute("build")).toBe("/build/faq");
        expect(sectionFaqRoute("core")).toBe("/core/faq");
        expect(sectionFaqRoute(null)).toBe("/faq");
    });

    it("shows a nav group in a section when the section shows any page in it", () => {
        expect(navGroupShown(["/clauses", "/assemblies"], "/kernel")).toBe(false);
        expect(navGroupShown(["/clauses", "/assemblies"], "/rpgf")).toBe(true);
        expect(navGroupShown(["/agents", "/agents/how"], "/kernel")).toBe(true);
        expect(navGroupShown(["/data", "/audit"], "/clauses")).toBe(true);
        expect(navGroupShown(["/data", "/data/yours"], "/clauses")).toBe(false);
    });

    it("shows only the three sections' groups on the apex", () => {
        expect(navGroupShown(["/use", "/members"], "/")).toBe(true);
        expect(navGroupShown(["/build", "/clauses"], "/")).toBe(true);
        expect(navGroupShown(["/core", "/kernel"], "/")).toBe(true);
        expect(navGroupShown(["/research", "/working-groups"], "/")).toBe(false);
        expect(navGroupShown(["/data", "/audit"], "/")).toBe(false);
        expect(navGroupShown(["/agents", "/agents/how"], "/")).toBe(false);
    });
});

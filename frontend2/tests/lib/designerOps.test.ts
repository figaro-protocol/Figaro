import { describe, expect, it } from "vitest";
import {
    addBlockToSlot,
    removeBindingFromSlot,
    pickPrimaryModuleId,
    updateBinding,
    evaluateBlockCompatibility,
    addView,
    removeView,
    addSlotToView,
    removeSlotFromView,
    addRole,
    removeRole,
    setAssemblyIdentity,
} from "@/lib/shared/designerOps";
import type { Assembly } from "@/lib/shared/assembly";
import type { BlockMetadata } from "@/lib/shared/blockMetadata";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";

const NoopModule = (_: ModuleProps) => null;

const ANY = { roles: null, requiresMechanisms: [], requiresCapabilities: [] } as const;

function makeBlock(blockId: string, moduleIds: string[] = [blockId]): BlockMetadata {
    return {
        blockId,
        displayName: blockId,
        description: "",
        category: "mechanism",
        schemaIds: [],
        modules: moduleIds.map((moduleId) => ({ moduleId, component: NoopModule })),
        compatibility: ANY,
    };
}

function makeAssembly(): Assembly {
    return {
        identity: {
            id: "a",
            name: "A",
            slug: "a",
            networkTargets: [],
            version: "1.0.0",
        },
        contracts: [],
        mechanisms: [],
        roles: [],
        views: [
            {
                viewId: "v1",
                kind: "x",
                title: "v1",
                contextsAccepted: ["assembly"],
                moduleSlots: ["primary", "secondary"],
            },
        ],
        modules: [],
        capabilityPresentation: [],
        visibilityDefaults: {
            showGraphByDefault: false,
            showAdvancedMechanisms: false,
            showRiskBoundaries: false,
            showGuarantees: false,
            showEconomicBreakdowns: false,
            showBuilderMode: false,
            showAuditMode: false,
        },
        builderMetadata: {
            assemblyClass: "x",
            compositionLevel: 1,
            requiresCustomModules: false,
        },
    };
}

describe("pickPrimaryModuleId", () => {
    it("returns the first module of the block", () => {
        expect(pickPrimaryModuleId(makeBlock("b", ["mod-a", "mod-b"]))).toBe("mod-a");
    });

    it("returns undefined if the block has no modules", () => {
        expect(pickPrimaryModuleId(makeBlock("b", []))).toBeUndefined();
    });
});

describe("addBlockToSlot", () => {
    it("adds a new binding to the slot with priority 10 when slot is empty", () => {
        const out = addBlockToSlot(makeAssembly(), makeBlock("b1"), "v1", "primary");
        expect(out.modules).toEqual([
            expect.objectContaining({ moduleId: "b1", slot: "primary", priority: 10 }),
        ]);
    });

    it("appends with next priority step when slot is non-empty", () => {
        let assembly = makeAssembly();
        assembly = addBlockToSlot(assembly, makeBlock("b1"), "v1", "primary");
        assembly = addBlockToSlot(assembly, makeBlock("b2"), "v1", "primary");
        expect(assembly.modules.map((m) => [m.moduleId, m.priority])).toEqual([
            ["b1", 10],
            ["b2", 20],
        ]);
    });

    it("returns the same assembly reference when the view does not exist", () => {
        const a = makeAssembly();
        expect(addBlockToSlot(a, makeBlock("b1"), "missing-view", "primary")).toBe(a);
    });

    it("returns the same assembly reference when the slot is not declared on the view", () => {
        const a = makeAssembly();
        expect(addBlockToSlot(a, makeBlock("b1"), "v1", "tertiary")).toBe(a);
    });

    it("returns the same assembly reference when the block has no modules", () => {
        const a = makeAssembly();
        expect(addBlockToSlot(a, makeBlock("b1", []), "v1", "primary")).toBe(a);
    });

    it("does not duplicate a binding for the same moduleId in the same slot", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "primary");
        const before = a;
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "primary");
        expect(a).toBe(before);
    });

    it("allows the same moduleId in two different slots", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "primary");
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "secondary");
        expect(a.modules).toHaveLength(2);
        expect(a.modules.map((m) => m.slot)).toEqual(["primary", "secondary"]);
    });

    it("binds every module on a multi-module block, with stepping priorities", () => {
        const out = addBlockToSlot(
            makeAssembly(),
            makeBlock("multi", ["mod-a", "mod-b", "mod-c"]),
            "v1",
            "primary",
        );
        expect(out.modules.map((m) => [m.moduleId, m.priority])).toEqual([
            ["mod-a", 10],
            ["mod-b", 20],
            ["mod-c", 30],
        ]);
    });

    it("multi-module add starts after the highest existing priority in the slot", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("first"), "v1", "primary"); // priority 10
        a = addBlockToSlot(a, makeBlock("multi", ["mod-a", "mod-b"]), "v1", "primary");
        expect(a.modules.map((m) => [m.moduleId, m.priority])).toEqual([
            ["first", 10],
            ["mod-a", 20],
            ["mod-b", 30],
        ]);
    });

    it("multi-module add only binds the modules not already present", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("solo", ["mod-b"]), "v1", "primary"); // mod-b already there
        a = addBlockToSlot(a, makeBlock("multi", ["mod-a", "mod-b", "mod-c"]), "v1", "primary");
        expect(a.modules.map((m) => m.moduleId)).toEqual(["mod-b", "mod-a", "mod-c"]);
    });

    it("returns the same assembly reference when every module on the block is already bound", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("multi", ["mod-a", "mod-b"]), "v1", "primary");
        const before = a;
        a = addBlockToSlot(a, makeBlock("multi", ["mod-a", "mod-b"]), "v1", "primary");
        expect(a).toBe(before);
    });
});

describe("removeBindingFromSlot", () => {
    it("removes the matching binding", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "primary");
        a = addBlockToSlot(a, makeBlock("b2"), "v1", "primary");
        const out = removeBindingFromSlot(a, "b1", "primary");
        expect(out.modules.map((m) => m.moduleId)).toEqual(["b2"]);
    });

    it("returns the same assembly reference when no binding matches", () => {
        const a = makeAssembly();
        expect(removeBindingFromSlot(a, "nope", "primary")).toBe(a);
    });

    it("only removes the binding in the named slot", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "primary");
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "secondary");
        const out = removeBindingFromSlot(a, "b1", "primary");
        expect(out.modules.map((m) => m.slot)).toEqual(["secondary"]);
    });
});

describe("evaluateBlockCompatibility", () => {
    function blockReq(overrides: {
        roles?: readonly string[] | null;
        requiresMechanisms?: readonly string[];
        requiresCapabilities?: readonly string[];
    }): BlockMetadata {
        return {
            ...makeBlock("b"),
            compatibility: {
                roles: overrides.roles ?? null,
                requiresMechanisms: overrides.requiresMechanisms ?? [],
                requiresCapabilities: overrides.requiresCapabilities ?? [],
            },
        };
    }

    it("returns compatible:true when assembly is null", () => {
        expect(evaluateBlockCompatibility(makeBlock("b"), null)).toEqual({ compatible: true });
    });

    it("returns compatible:true when block has no requirements", () => {
        const a = makeAssembly();
        expect(evaluateBlockCompatibility(makeBlock("b"), a)).toEqual({ compatible: true });
    });

    it("blocks when a required mechanism kind is missing", () => {
        const a = makeAssembly();
        const block = blockReq({ requiresMechanisms: ["dutch-auction"] });
        const out = evaluateBlockCompatibility(block, a);
        expect(out.compatible).toBe(false);
        expect(out.reason).toContain("dutch-auction");
    });

    it("allows when the required mechanism kind is present", () => {
        const a: Assembly = {
            ...makeAssembly(),
            mechanisms: [
                {
                    mechanismId: "m1",
                    kind: "dutch-auction",
                    displayName: "DA",
                    riskClass: "low-risk-coordinator",
                    enabled: true,
                    visibility: "primary",
                    moduleBindings: [],
                },
            ],
        };
        const block = blockReq({ requiresMechanisms: ["dutch-auction"] });
        expect(evaluateBlockCompatibility(block, a).compatible).toBe(true);
    });

    it("blocks when a required capability is missing", () => {
        const a = makeAssembly();
        const block = blockReq({ requiresCapabilities: ["commerce.cart"] });
        const out = evaluateBlockCompatibility(block, a);
        expect(out.compatible).toBe(false);
        expect(out.reason).toContain("commerce.cart");
    });

    it("allows when a required capability is in any role's sampleCapabilities", () => {
        const a: Assembly = {
            ...makeAssembly(),
            roles: [
                { roleKind: "buyer", displayName: "Buyer", visibility: "primary", sampleCapabilities: ["commerce.cart"] },
            ],
        };
        const block = blockReq({ requiresCapabilities: ["commerce.cart"] });
        expect(evaluateBlockCompatibility(block, a).compatible).toBe(true);
    });

    it("allows when a required capability is in any mechanism's capabilityBindings", () => {
        const a: Assembly = {
            ...makeAssembly(),
            mechanisms: [
                {
                    mechanismId: "m1",
                    kind: "x",
                    displayName: "X",
                    riskClass: "low-risk-coordinator",
                    enabled: true,
                    visibility: "primary",
                    moduleBindings: [],
                    capabilityBindings: ["resolve-process"],
                },
            ],
        };
        const block = blockReq({ requiresCapabilities: ["resolve-process"] });
        expect(evaluateBlockCompatibility(block, a).compatible).toBe(true);
    });

    it("blocks when no role on the assembly matches the required-roles list", () => {
        const a: Assembly = {
            ...makeAssembly(),
            roles: [{ roleKind: "buyer", displayName: "Buyer", visibility: "primary" }],
        };
        const block = blockReq({ roles: ["seller"] });
        const out = evaluateBlockCompatibility(block, a);
        expect(out.compatible).toBe(false);
        expect(out.reason).toContain("seller");
    });

    it("allows when at least one role matches the required-roles list", () => {
        const a: Assembly = {
            ...makeAssembly(),
            roles: [
                { roleKind: "buyer", displayName: "Buyer", visibility: "primary" },
                { roleKind: "seller", displayName: "Seller", visibility: "primary" },
            ],
        };
        const block = blockReq({ roles: ["seller"] });
        expect(evaluateBlockCompatibility(block, a).compatible).toBe(true);
    });

    it("treats roles:null as 'any role'", () => {
        const a = makeAssembly(); // no roles
        const block = blockReq({ roles: null });
        expect(evaluateBlockCompatibility(block, a).compatible).toBe(true);
    });
});

describe("addView", () => {
    it("appends a new view with default slot 'primary' when none supplied", () => {
        const out = addView(makeAssembly(), { viewId: "v2", title: "Second" });
        expect(out.views.map((v) => v.viewId)).toEqual(["v1", "v2"]);
        const v2 = out.views.find((v) => v.viewId === "v2")!;
        expect(v2.title).toBe("Second");
        expect(v2.moduleSlots).toEqual(["primary"]);
    });

    it("respects supplied slots", () => {
        const out = addView(makeAssembly(), {
            viewId: "v2",
            title: "Second",
            moduleSlots: ["rail", "body"],
        });
        const v2 = out.views.find((v) => v.viewId === "v2")!;
        expect(v2.moduleSlots).toEqual(["rail", "body"]);
    });

    it("returns the same assembly reference when the viewId is already in use", () => {
        const a = makeAssembly();
        expect(addView(a, { viewId: "v1", title: "dup" })).toBe(a);
    });

    it("returns the same assembly reference for a non-kebab-case viewId", () => {
        const a = makeAssembly();
        expect(addView(a, { viewId: "Bad_Id", title: "x" })).toBe(a);
    });
});

describe("removeView", () => {
    it("removes the view and drops bindings living only in that view's slots", () => {
        let a = makeAssembly();
        a = addView(a, { viewId: "v2", title: "v2", moduleSlots: ["v2-only-slot"] });
        a = addBlockToSlot(a, makeBlock("m1"), "v2", "v2-only-slot");
        expect(a.modules.map((m) => m.moduleId)).toEqual(["m1"]);

        const out = removeView(a, "v2");
        expect(out.views.map((v) => v.viewId)).toEqual(["v1"]);
        expect(out.modules).toEqual([]);
    });

    it("keeps bindings whose slot name is also declared on another view", () => {
        let a = makeAssembly();
        a = addView(a, { viewId: "v2", title: "v2", moduleSlots: ["primary"] });
        a = addBlockToSlot(a, makeBlock("m1"), "v1", "primary");
        a = addBlockToSlot(a, makeBlock("m2"), "v2", "primary");
        const out = removeView(a, "v2");
        // The "primary" slot still exists on v1; both bindings live in slot=primary,
        // so neither should be dropped just because v2 was removed.
        expect(out.modules.map((m) => m.moduleId).sort()).toEqual(["m1", "m2"]);
    });

    it("returns the same assembly reference when the view is missing", () => {
        const a = makeAssembly();
        expect(removeView(a, "missing")).toBe(a);
    });
});

describe("addSlotToView", () => {
    it("adds the slot name to the view's moduleSlots", () => {
        const out = addSlotToView(makeAssembly(), "v1", "tertiary");
        const v1 = out.views.find((v) => v.viewId === "v1")!;
        expect(v1.moduleSlots).toEqual(["primary", "secondary", "tertiary"]);
    });

    it("returns the same assembly reference when the slot is already declared", () => {
        const a = makeAssembly();
        expect(addSlotToView(a, "v1", "primary")).toBe(a);
    });

    it("returns the same assembly reference for a non-kebab-case slot name", () => {
        const a = makeAssembly();
        expect(addSlotToView(a, "v1", "Bad_Slot")).toBe(a);
    });

    it("returns the same assembly reference when the view is missing", () => {
        const a = makeAssembly();
        expect(addSlotToView(a, "missing", "new-slot")).toBe(a);
    });
});

describe("removeSlotFromView", () => {
    it("removes the slot from the view and strips bindings in that slot", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("m1"), "v1", "primary");
        const out = removeSlotFromView(a, "v1", "primary");
        const v1 = out.views.find((v) => v.viewId === "v1")!;
        expect(v1.moduleSlots).toEqual(["secondary"]);
        expect(out.modules).toEqual([]);
    });

    it("keeps bindings in a slot name that another view still declares", () => {
        let a = makeAssembly();
        a = addView(a, { viewId: "v2", title: "v2", moduleSlots: ["primary"] });
        a = addBlockToSlot(a, makeBlock("m1"), "v2", "primary");
        const out = removeSlotFromView(a, "v1", "primary");
        expect(out.modules.map((m) => m.moduleId)).toEqual(["m1"]);
    });

    it("returns the same assembly reference when the view is missing", () => {
        const a = makeAssembly();
        expect(removeSlotFromView(a, "missing", "primary")).toBe(a);
    });

    it("returns the same assembly reference when the slot is not on the view", () => {
        const a = makeAssembly();
        expect(removeSlotFromView(a, "v1", "not-declared")).toBe(a);
    });
});

describe("addRole", () => {
    it("appends a new role with primary visibility", () => {
        const out = addRole(makeAssembly(), { roleKind: "buyer", displayName: "Buyer" });
        expect(out.roles.map((r) => [r.roleKind, r.displayName, r.visibility])).toEqual([
            ["buyer", "Buyer", "primary"],
        ]);
    });

    it("returns the same assembly reference when the roleKind is already in use", () => {
        let a = addRole(makeAssembly(), { roleKind: "buyer", displayName: "Buyer" });
        const before = a;
        a = addRole(a, { roleKind: "buyer", displayName: "Other" });
        expect(a).toBe(before);
    });

    it("returns the same assembly reference for a non-kebab-case roleKind", () => {
        const a = makeAssembly();
        expect(addRole(a, { roleKind: "Bad_Role", displayName: "X" })).toBe(a);
    });

    it("falls back to roleKind when displayName is blank", () => {
        const out = addRole(makeAssembly(), { roleKind: "buyer", displayName: "  " });
        expect(out.roles[0].displayName).toBe("buyer");
    });
});

describe("removeRole", () => {
    it("removes the matching role", () => {
        let a = makeAssembly();
        a = addRole(a, { roleKind: "buyer", displayName: "Buyer" });
        a = addRole(a, { roleKind: "seller", displayName: "Seller" });
        const out = removeRole(a, "buyer");
        expect(out.roles.map((r) => r.roleKind)).toEqual(["seller"]);
    });

    it("returns the same assembly reference when the role isn't present", () => {
        const a = makeAssembly();
        expect(removeRole(a, "missing")).toBe(a);
    });
});

describe("setAssemblyIdentity", () => {
    it("patches name, slug, description independently", () => {
        const a = makeAssembly();
        const out = setAssemblyIdentity(a, {
            name: "Renamed",
            slug: "renamed",
            description: "new desc",
        });
        expect(out.identity.name).toBe("Renamed");
        expect(out.identity.slug).toBe("renamed");
        expect(out.identity.description).toBe("new desc");
    });

    it("rejects a non-kebab-case slug (returns same reference)", () => {
        const a = makeAssembly();
        expect(setAssemblyIdentity(a, { slug: "Bad_Slug" })).toBe(a);
    });

    it("returns the same assembly reference when the patch is a no-op", () => {
        const a = makeAssembly();
        expect(setAssemblyIdentity(a, { name: a.identity.name })).toBe(a);
    });

    it("preserves unrelated identity fields", () => {
        const a = makeAssembly();
        const out = setAssemblyIdentity(a, { name: "X" });
        expect(out.identity.id).toBe(a.identity.id);
        expect(out.identity.networkTargets).toBe(a.identity.networkTargets);
        expect(out.identity.version).toBe(a.identity.version);
    });
});

describe("updateBinding", () => {
    it("patches componentKind, semanticInput, priority on the matching binding", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "primary");
        const out = updateBinding(a, "b1", "primary", {
            componentKind: "card",
            semanticInput: "ghg-summary",
            priority: 50,
        });
        expect(out.modules[0]).toMatchObject({
            moduleId: "b1",
            slot: "primary",
            componentKind: "card",
            semanticInput: "ghg-summary",
            priority: 50,
        });
    });

    it("returns the same assembly reference when the binding is not found", () => {
        const a = makeAssembly();
        expect(updateBinding(a, "missing", "primary", { priority: 99 })).toBe(a);
    });

    it("returns the same assembly reference when the patch is a no-op", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "primary");
        const before = a;
        const out = updateBinding(a, "b1", "primary", {
            componentKind: "module", // matches addBlockToSlot default
            semanticInput: "default",
            priority: 10,
        });
        expect(out).toBe(before);
    });

    it("only updates the binding in the named slot", () => {
        let a = makeAssembly();
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "primary");
        a = addBlockToSlot(a, makeBlock("b1"), "v1", "secondary");
        const out = updateBinding(a, "b1", "primary", { priority: 999 });
        const primary = out.modules.find((m) => m.slot === "primary");
        const secondary = out.modules.find((m) => m.slot === "secondary");
        expect(primary?.priority).toBe(999);
        expect(secondary?.priority).toBe(10);
    });
});

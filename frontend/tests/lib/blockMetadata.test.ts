import { afterEach, describe, expect, it } from "vitest";
import {
    listBlockMetadata,
    listBlocksByCategory,
    getBlockMetadata,
    getBlockForModule,
    registerBlock,
    assertBlockMetadataIntegrity,
    _resetBlockRegistry_TESTING_ONLY,
    type BlockMetadata,
} from "@/lib/shared/blockMetadata";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";

afterEach(() => {
    _resetBlockRegistry_TESTING_ONLY();
});

const NoopModule = (_: ModuleProps) => null;

function blockOf(blockId: string, overrides: Partial<BlockMetadata> = {}): BlockMetadata {
    return {
        blockId,
        displayName: blockId,
        description: `Test block ${blockId}.`,
        category: "mechanism",
        modules: [{ moduleId: blockId, component: NoopModule }],
        compatibility: { roles: null, requiresMechanisms: [], requiresCapabilities: [] },
        ...overrides,
    };
}

describe("blockMetadata registry", () => {
    it("registerBlock stores metadata and registers each module", () => {
        const calls: Array<{ moduleId: string }> = [];
        const fakeRegister = (moduleId: string) => { calls.push({ moduleId }); };

        registerBlock(blockOf("alpha", { modules: [
            { moduleId: "alpha-a", component: NoopModule },
            { moduleId: "alpha-b", component: NoopModule },
        ]}), fakeRegister);

        expect(getBlockMetadata("alpha")?.blockId).toBe("alpha");
        expect(calls.map((c) => c.moduleId).sort()).toEqual(["alpha-a", "alpha-b"]);
        expect(getBlockForModule("alpha-a")?.blockId).toBe("alpha");
    });

    it("rejects two distinct blocks claiming the same moduleId", () => {
        const noop = () => { /* noop register */ };
        registerBlock(blockOf("first", { modules: [{ moduleId: "shared", component: NoopModule }] }), noop);
        expect(() => {
            registerBlock(blockOf("second", { modules: [{ moduleId: "shared", component: NoopModule }] }), noop);
        }).toThrow(/Module "shared" is claimed by both/);
    });

    it("re-registering the same blockId is idempotent (hot-reload-safe)", () => {
        const noop = () => {};
        registerBlock(blockOf("alpha", { displayName: "v1" }), noop);
        registerBlock(blockOf("alpha", { displayName: "v2" }), noop);
        expect(getBlockMetadata("alpha")?.displayName).toBe("v2");
    });

    it("listBlocksByCategory filters by category and respects excludeFromPalette", () => {
        const noop = () => {};
        registerBlock(blockOf("a", { category: "mechanism", paletteOrder: 10 }), noop);
        registerBlock(blockOf("b", { category: "mechanism", paletteOrder: 5 }), noop);
        registerBlock(blockOf("c", { category: "shell", excludeFromPalette: true }), noop);

        const visible = listBlocksByCategory("mechanism");
        expect(visible.map((b) => b.blockId)).toEqual(["b", "a"]);  // paletteOrder ascending

        const shellVisible = listBlocksByCategory("shell");
        expect(shellVisible).toHaveLength(0);

        const shellAll = listBlocksByCategory("shell", { includeHidden: true });
        expect(shellAll.map((b) => b.blockId)).toEqual(["c"]);
    });

    it("assertBlockMetadataIntegrity throws when a registered moduleId has no block", () => {
        const noop = () => {};
        registerBlock(blockOf("known", { modules: [{ moduleId: "known-m", component: NoopModule }] }), noop);
        const allRegistered = ["known-m", "stray-module-without-block"];
        expect(() => assertBlockMetadataIntegrity(() => allRegistered)).toThrow(/stray-module-without-block/);
    });

    it("assertBlockMetadataIntegrity passes when every registered module is claimed", () => {
        const noop = () => {};
        registerBlock(blockOf("alpha", { modules: [{ moduleId: "x", component: NoopModule }] }), noop);
        expect(() => assertBlockMetadataIntegrity(() => ["x"])).not.toThrow();
    });

    it("listBlockMetadata returns all registered blocks", () => {
        const noop = () => {};
        registerBlock(blockOf("a"), noop);
        registerBlock(blockOf("b"), noop);
        registerBlock(blockOf("c"), noop);
        expect(listBlockMetadata().map((b) => b.blockId)).toEqual(["a", "b", "c"]);
    });
});

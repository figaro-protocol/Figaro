/**
 * DesignerCanvas — a reload and a back navigation keep the designer's work.
 *
 * The canvas autosaves its whole state on every change, under the key of the
 * design it holds: the new design on /assemblies/designer/new, or the named
 * draft it opened on /assemblies/designer/edit?slug= (`syntheticDesignStore`).
 * A route resumes its own autosave on mount when that autosave is newer than
 * what it would otherwise open. A reload and a return by the browser's back
 * button both mount the route again from nothing, so each is an unmount and a
 * fresh mount here, through the real store and the real localStorage.
 *
 * The work is built through the handlers a person triggers: the canvas's
 * add-node and add-parent callbacks, the drawer's clause toggle, field and
 * bind callbacks, the assembly terms panel's callbacks, and the editorial
 * inputs typed into, keystroke by keystroke, with no blur and no Save.
 *
 * The clause keys are arbitrary: the canvas keeps whatever key the drawer
 * hands it, so no registered clause is named.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Order } from "@/lib/core/store";

type Handlers = {
    canvas: {
        orders: Order[];
        clauseValuesByOrderId: Record<string, Record<string, Record<string, unknown>>>;
        onAddSubOrder: (id: string) => void;
        onAddParent: (child: string, parent: string) => void;
        onSelectNode: (id: string | null) => void;
    } | null;
    drawer: {
        selectedClauseValues?: Record<string, Record<string, unknown>>;
        boundAgreementHash?: `0x${string}`;
        onToggleClause: (key: string, next: boolean) => void;
        onSetClauseField: (key: string, field: string, value: unknown) => void;
        onBindAgreement: (hash: `0x${string}` | null) => void;
    } | null;
    assist: {
        onImportAssembly: (hydrated: unknown, composeKeys: ReadonlySet<string>) => boolean;
    } | null;
    terms: {
        values: Record<string, Record<string, unknown>>;
        onToggleClause: (key: string, next: boolean) => void;
        onSetClauseField: (key: string, field: string, value: unknown) => void;
    } | null;
};

const h = vi.hoisted(() => ({
    handlers: { canvas: null, drawer: null, terms: null, assist: null } as unknown as Handlers,
    search: new URLSearchParams(),
    push: [] as string[],
    wallet: { address: undefined as string | undefined, isConnected: false },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: (p: string) => h.push.push(p), replace: () => undefined, prefetch: () => undefined }),
    useSearchParams: () => h.search,
    usePathname: () => "/assemblies/designer/new",
}));
// No public client: the gas ceilings are not read, so no order cap applies.
// `useAccount` is here only so a test can connect a wallet between two mounts.
vi.mock("wagmi", () => ({
    useChainId: () => 31337,
    usePublicClient: () => undefined,
    useAccount: () => h.wallet,
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, failed: false, version: 1 }) }));
vi.mock("@/lib/protocol/useAgreementRegistry", () => ({
    fetchRegisteredAgreement: async () => undefined,
    getRegisteredAgreement: () => undefined,
    useRegisteredAgreementsVersion: () => 0,
}));
vi.mock("@/components/runtime/TopologyCanvas", () => ({
    TopologyCanvas: (props: NonNullable<Handlers["canvas"]>) => {
        h.handlers.canvas = props;
        return <div data-testid="topology-canvas" data-orders={props.orders.length} />;
    },
}));
vi.mock("@/app/(tools)/assemblies/designer/_components/AgreementDrawer", () => ({
    AgreementDrawer: (props: NonNullable<Handlers["drawer"]>) => {
        h.handlers.drawer = props;
        return null;
    },
}));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyTermsPanel", () => ({
    AssemblyTermsPanel: (props: NonNullable<Handlers["terms"]>) => {
        h.handlers.terms = props;
        return null;
    },
}));
vi.mock("@/app/(tools)/assemblies/designer/_components/CompositionAssist", () => ({
    CompositionAssist: (props: NonNullable<Handlers["assist"]>) => {
        h.handlers.assist = props;
        return null;
    },
}));
// An imported assembly's hydration: the test hands the draft it would yield.
vi.mock("@/lib/designer/assemblyToDraft", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/designer/assemblyToDraft")>()),
    assemblyToDraft: (hydrated: { draft: unknown }) => hydrated.draft,
}));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyIdentity", () => ({ AssemblyIdentity: () => null }));
vi.mock("@/lib/designer/publishAssembly", () => ({ usePublishAgreement: () => ({ publishAgreement: vi.fn(), isPending: false }) }));

import { NewAssemblyClient } from "@/app/(tools)/assemblies/designer/new/NewAssemblyClient";
import { EditAssemblyClient } from "@/app/(tools)/assemblies/designer/edit/EditAssemblyClient";
import { DraftsList } from "@/app/(tools)/assemblies/designer/_components/DraftsList";
import { listNamedDrafts, loadNamedDraft, saveAutosave } from "@/lib/designer/syntheticDesignStore";

const CLAUSE_A = `0x${"a1".repeat(32)}`;
const CLAUSE_B = `0x${"b2".repeat(32)}`;
const TERM = `0x${"c3".repeat(32)}`;
const BOUND = `0x${"d4".repeat(32)}` as `0x${string}`;

const canvas = () => h.handlers.canvas!;
const drawer = () => h.handlers.drawer!;
const terms = () => h.handlers.terms!;

/** Mount a route's client as a page load does, and wait for the canvas. */
async function mount(route: React.ReactElement) {
    h.handlers.canvas = null;
    const view = render(route);
    await screen.findByTestId("topology-canvas");
    // The seed is applied in a mount effect; let it and the first autosave run.
    await act(async () => {});
    return view;
}

/** Type into an editorial input, one change per character, with no blur. */
function typeInto(testId: string, text: string) {
    const input = screen.getByTestId(testId);
    for (let i = 1; i <= text.length; i++) fireEvent.change(input, { target: { value: text.slice(0, i) } });
}

/** Build every kind of work on the canvas, through the handlers a person triggers. */
async function buildWork() {
    const root = canvas().orders[0].orderHash;
    // Orders: two children under the root.
    await act(async () => { canvas().onAddSubOrder(root); });
    await act(async () => { canvas().onAddSubOrder(root); });
    const [, b, c] = canvas().orders.map((o) => o.orderHash);
    // An edge: the third order also follows the second.
    await act(async () => { canvas().onAddParent(c, b); });
    // Clauses composed on an order in the drawer, and a designer fill typed in.
    await act(async () => { canvas().onSelectNode(b); });
    await act(async () => { drawer().onToggleClause(CLAUSE_A, true); });
    await act(async () => { drawer().onToggleClause(CLAUSE_B, true); });
    await act(async () => { drawer().onSetClauseField(CLAUSE_A, "documents", ["ipfs://consent-v1"]); });
    await act(async () => { drawer().onSetClauseField(CLAUSE_A, "note", "half-typ"); });
    // A registered agreement bound on another order.
    await act(async () => { canvas().onSelectNode(c); });
    await act(async () => { drawer().onBindAgreement(BOUND); });
    await act(async () => { canvas().onSelectNode(null); });
    // The assembly's terms.
    await act(async () => { terms().onToggleClause(TERM, true); });
    await act(async () => { terms().onSetClauseField(TERM, "forum", "kleros"); });
    // The editorial identity, the description left half typed.
    typeInto("designer-name-input", "Port run");
    typeInto("designer-summary-input", "Two legs, one join");
    typeInto("designer-description-input", "The buyer receives");
    await act(async () => {});
    return { b, c };
}

type Work = {
    orders: Order[];
    clauses: Record<string, Record<string, Record<string, unknown>>>;
    bound: (`0x${string}` | undefined)[];
    terms: Record<string, Record<string, unknown>>;
    name: string;
    summary: string;
    description: string;
};

/** Read back every kind of work the mounted canvas holds. */
async function readWork(): Promise<Work> {
    const bound: (`0x${string}` | undefined)[] = [];
    for (const o of canvas().orders) {
        await act(async () => { canvas().onSelectNode(o.orderHash); });
        bound.push(drawer().boundAgreementHash);
    }
    await act(async () => { canvas().onSelectNode(null); });
    return {
        orders: canvas().orders,
        clauses: canvas().clauseValuesByOrderId,
        bound,
        terms: terms().values,
        name: (screen.getByTestId("designer-name-input") as HTMLInputElement).value,
        summary: (screen.getByTestId("designer-summary-input") as HTMLInputElement).value,
        description: (screen.getByTestId("designer-description-input") as HTMLTextAreaElement).value,
    };
}

/** What `buildWork` made, stated outright, so a lost piece fails by name. */
function expectBuiltWork(work: Work, ids: { b: string; c: string }) {
    expect(work.orders).toHaveLength(3);
    const byId = Object.fromEntries(work.orders.map((o) => [o.orderHash, o]));
    const root = work.orders[0].orderHash;
    expect(byId[ids.b].follows).toEqual([root]);
    expect(byId[ids.c].follows).toEqual([root, ids.b]);
    expect(work.clauses[ids.b]).toEqual({
        [CLAUSE_A]: { documents: ["ipfs://consent-v1"], note: "half-typ" },
        [CLAUSE_B]: {},
    });
    expect(work.bound).toEqual([undefined, undefined, BOUND]);
    expect(work.terms).toEqual({ [TERM]: { forum: "kleros" } });
    expect(work.name).toBe("Port run");
    expect(work.summary).toBe("Two legs, one join");
    expect(work.description).toBe("The buyer receives");
}

beforeEach(() => {
    window.localStorage.clear();
    h.search = new URLSearchParams();
    h.push = [];
    h.wallet = { address: undefined, isConnected: false };
});

describe("DesignerCanvas — unsaved work on /assemblies/designer/new survives", () => {
    it("a reload: every kind of work is back, exactly, with no Save", async () => {
        // The person opens a blank canvas; the client strips ?fresh=1 from the URL.
        h.search = new URLSearchParams("fresh=1");
        const first = await mount(<NewAssemblyClient />);
        const ids = await buildWork();
        const before = await readWork();
        expectBuiltWork(before, ids);
        expect(h.push, "nothing was saved: no Save navigated").toEqual([]);
        expect(listNamedDrafts(), "nothing was saved as a named draft").toEqual([]);

        // Reload: the page unloads and loads /assemblies/designer/new again.
        first.unmount();
        h.search = new URLSearchParams();
        await mount(<NewAssemblyClient />);
        const after = await readWork();
        expect(after).toEqual(before);
        expectBuiltWork(after, ids);

        // The order counters came back too: a new node takes a fresh id.
        await act(async () => { canvas().onAddSubOrder(after.orders[0].orderHash); });
        const hashes = canvas().orders.map((o) => o.orderHash);
        expect(new Set(hashes).size).toBe(4);
    });

    it("leaving for another route and coming back with the back button: every kind of work is back, exactly", async () => {
        h.search = new URLSearchParams("fresh=1");
        const first = await mount(<NewAssemblyClient />);
        const ids = await buildWork();
        const before = await readWork();

        // Away: the designer canvas unmounts while another route renders.
        first.unmount();
        const away = render(<p data-testid="another-route">Orders</p>);
        expect(screen.queryByTestId("topology-canvas")).toBeNull();
        away.unmount();

        // Back: the history entry is /assemblies/designer/new, with no seed.
        h.search = new URLSearchParams();
        await mount(<NewAssemblyClient />);
        const after = await readWork();
        expect(after).toEqual(before);
        expectBuiltWork(after, ids);
    });

    it("a draft made with no wallet connected is still there after a wallet connects", async () => {
        h.search = new URLSearchParams("fresh=1");
        const first = await mount(<NewAssemblyClient />);
        const ids = await buildWork();
        const before = await readWork();
        first.unmount();

        // The wallet signs; it is never a login. Connecting one keys nothing.
        h.wallet = { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", isConnected: true };
        h.search = new URLSearchParams();
        await mount(<NewAssemblyClient />);
        const after = await readWork();
        expect(after).toEqual(before);
        expectBuiltWork(after, ids);
    });
});

describe("DesignerCanvas — two saved drafts do not leak into each other", () => {
    it("each named draft opens on /assemblies/designer/edit with its own work only", async () => {
        // Draft one: the full work, saved.
        h.search = new URLSearchParams("fresh=1");
        const first = await mount(<NewAssemblyClient />);
        const ids = await buildWork();
        const one = await readWork();
        fireEvent.click(screen.getByTestId("designer-save"));
        const [slugOne] = listNamedDrafts().map((d) => d.slug);
        first.unmount();

        // Draft two: a blank canvas with a name only, saved.
        h.search = new URLSearchParams("fresh=1");
        const second = await mount(<NewAssemblyClient />);
        typeInto("designer-name-input", "Second");
        await act(async () => {});
        const two = await readWork();
        fireEvent.click(screen.getByTestId("designer-save"));
        second.unmount();
        const slugTwo = listNamedDrafts().map((d) => d.slug).find((s) => s !== slugOne)!;
        expect(slugTwo).toBeTruthy();

        const editOne = await mount(<EditAssemblyClient slug={slugOne} />);
        expectBuiltWork(await readWork(), ids);
        expect(await readWork()).toEqual(one);
        editOne.unmount();

        await mount(<EditAssemblyClient slug={slugTwo} />);
        const readTwo = await readWork();
        expect(readTwo).toEqual(two);
        expect(readTwo.orders).toHaveLength(1);
        expect(readTwo.clauses).toEqual({});
        expect(readTwo.terms).toEqual({});
        expect(readTwo.name).toBe("Second");
    });
});

describe("DesignerCanvas — unsaved work on a named draft at /assemblies/designer/edit?slug=", () => {
    /** Save the built work as a named draft, and open it in the editor. */
    async function openSavedDraft() {
        h.search = new URLSearchParams("fresh=1");
        const first = await mount(<NewAssemblyClient />);
        await buildWork();
        fireEvent.click(screen.getByTestId("designer-save"));
        const [slug] = listNamedDrafts().map((d) => d.slug);
        first.unmount();
        const view = await mount(<EditAssemblyClient slug={slug} />);
        return { slug, view };
    }

    /** Unsaved work on the opened draft: one more order and a new name. */
    async function editUnsaved() {
        await act(async () => { canvas().onAddSubOrder(canvas().orders[0].orderHash); });
        fireEvent.change(screen.getByTestId("designer-name-input"), { target: { value: "Port run, edited" } });
        await act(async () => {});
        expect(canvas().orders).toHaveLength(4);
    }

    it("a reload keeps the unsaved edits", async () => {
        const { slug, view } = await openSavedDraft();
        await editUnsaved();
        view.unmount();
        await mount(<EditAssemblyClient slug={slug} />);
        expect(canvas().orders).toHaveLength(4);
        expect((screen.getByTestId("designer-name-input") as HTMLInputElement).value).toBe("Port run, edited");
    });

    it("leaving and coming back with the back button keeps the unsaved edits", async () => {
        const { slug, view } = await openSavedDraft();
        await editUnsaved();
        view.unmount();
        render(<p>Orders</p>).unmount();
        await mount(<EditAssemblyClient slug={slug} />);
        expect(canvas().orders).toHaveLength(4);
        expect((screen.getByTestId("designer-name-input") as HTMLInputElement).value).toBe("Port run, edited");
    });
});

describe("DesignerCanvas — opening a saved draft does not overwrite unsaved work on /assemblies/designer/new", () => {
    it("unsaved work on /new is still there after another draft is opened and the person goes back", async () => {
        // A saved draft, blank but for its name.
        h.search = new URLSearchParams("fresh=1");
        const saved = await mount(<NewAssemblyClient />);
        typeInto("designer-name-input", "Other draft");
        await act(async () => {});
        fireEvent.click(screen.getByTestId("designer-save"));
        const [otherSlug] = listNamedDrafts().map((d) => d.slug);
        saved.unmount();

        // Unsaved work on a fresh canvas.
        h.search = new URLSearchParams("fresh=1");
        const fresh = await mount(<NewAssemblyClient />);
        const ids = await buildWork();
        const before = await readWork();
        fresh.unmount();

        // The person opens the other draft from the drafts list, then goes back.
        const other = await mount(<EditAssemblyClient slug={otherSlug} />);
        other.unmount();
        h.search = new URLSearchParams();
        await mount(<NewAssemblyClient />);
        const after = await readWork();
        expect(after).toEqual(before);
        expectBuiltWork(after, ids);
    });
});

/** Every designer key in localStorage, with its bytes. */
function designerStorage(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)!;
        if (key.startsWith("figaro:designer:")) out[key] = window.localStorage.getItem(key);
    }
    return out;
}

const NEW_DESIGN_AUTOSAVE = "figaro:designer:autosave:new";
const draftAutosave = (slug: string) => `figaro:designer:autosave:drafts:${slug}`;
const nameValue = () => (screen.getByTestId("designer-name-input") as HTMLInputElement).value;

/** Save a canvas holding only a name as a named draft; returns its slug. */
async function saveNamed(name: string): Promise<string> {
    const before = new Set(listNamedDrafts().map((d) => d.slug));
    h.search = new URLSearchParams("fresh=1");
    const view = await mount(<NewAssemblyClient />);
    typeInto("designer-name-input", name);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("designer-save"));
    view.unmount();
    return listNamedDrafts().map((d) => d.slug).find((s) => !before.has(s))!;
}

describe("DesignerCanvas — each design keeps its own autosave", () => {
    it("two named drafts edited in turn each keep their own unsaved work", async () => {
        const one = await saveNamed("One");
        const two = await saveNamed("Two");

        const editOne = await mount(<EditAssemblyClient slug={one} />);
        await act(async () => { canvas().onAddSubOrder(canvas().orders[0].orderHash); });
        fireEvent.change(screen.getByTestId("designer-name-input"), { target: { value: "One, edited" } });
        await act(async () => {});
        editOne.unmount();

        const editTwo = await mount(<EditAssemblyClient slug={two} />);
        expect(nameValue(), "the second draft opens with its own name").toBe("Two");
        fireEvent.change(screen.getByTestId("designer-name-input"), { target: { value: "Two, edited" } });
        await act(async () => {});
        editTwo.unmount();

        const backOne = await mount(<EditAssemblyClient slug={one} />);
        expect(nameValue()).toBe("One, edited");
        expect(canvas().orders).toHaveLength(2);
        backOne.unmount();

        await mount(<EditAssemblyClient slug={two} />);
        expect(nameValue()).toBe("Two, edited");
        expect(canvas().orders).toHaveLength(1);
    });

    it("a draft opens its autosave when that is newer than the saved draft, and the saved draft otherwise", async () => {
        const slug = await saveNamed("Saved");
        const saved = loadNamedDraft(slug)!;

        saveAutosave(slug, { ...saved, name: "Newer", updatedAt: saved.updatedAt + 1 });
        const newer = await mount(<EditAssemblyClient slug={slug} />);
        expect(nameValue(), "a newer autosave opens").toBe("Newer");
        newer.unmount();

        saveAutosave(slug, { ...saved, name: "Older", updatedAt: saved.updatedAt - 1 });
        await mount(<EditAssemblyClient slug={slug} />);
        expect(nameValue(), "an autosave older than the saved draft does not override it").toBe("Saved");
    });

    it("an autosave under figaro:designer:current opens once on /new and moves to the new design's key", async () => {
        h.search = new URLSearchParams("fresh=1");
        const first = await mount(<NewAssemblyClient />);
        const ids = await buildWork();
        const before = await readWork();
        first.unmount();

        // A browser that holds the work under figaro:designer:current only.
        const stored = designerStorage();
        const bytes = stored[NEW_DESIGN_AUTOSAVE] ?? stored["figaro:designer:current"];
        expect(bytes, "the canvas autosaved the work").toBeTruthy();
        window.localStorage.clear();
        window.localStorage.setItem("figaro:designer:current", bytes!);

        h.search = new URLSearchParams();
        const migrated = await mount(<NewAssemblyClient />);
        expectBuiltWork(await readWork(), ids);
        expect(
            Object.keys(designerStorage()),
            "figaro:designer:current is gone; the new design's key holds the work",
        ).toEqual([NEW_DESIGN_AUTOSAVE]);
        migrated.unmount();

        await mount(<NewAssemblyClient />);
        expect(await readWork()).toEqual(before);
    });

    it("Save writes the named draft and clears that draft's autosave", async () => {
        const slug = await saveNamed("Port run");
        await mount(<EditAssemblyClient slug={slug} />);
        fireEvent.change(screen.getByTestId("designer-name-input"), { target: { value: "Port run, edited" } });
        await act(async () => {});
        expect(Object.keys(designerStorage()), "the unsaved edit is autosaved under the draft's key").toContain(draftAutosave(slug));

        fireEvent.click(screen.getByTestId("designer-save"));
        await act(async () => {});
        expect(Object.keys(designerStorage()).sort(), "only the saved draft and the index remain").toEqual([
            "figaro:designer:drafts",
            `figaro:designer:drafts:${slug}`,
        ]);
        expect(loadNamedDraft(slug)!.name).toBe("Port run, edited");
    });

    it("a draft deleted from the drafts list leaves nothing behind, its unsaved work included", async () => {
        const slug = await saveNamed("Doomed");
        const edit = await mount(<EditAssemblyClient slug={slug} />);
        fireEvent.change(screen.getByTestId("designer-name-input"), { target: { value: "Doomed, edited" } });
        await act(async () => {});
        edit.unmount();

        const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
        render(<DraftsList />);
        fireEvent.click(await screen.findByTestId(`draft-delete-${slug}`));
        confirm.mockRestore();
        expect(designerStorage()).toEqual({ "figaro:designer:drafts": "[]" });
    });

    it("Reset clears every kind of work, and a reload brings none of it back", async () => {
        h.search = new URLSearchParams("fresh=1");
        const first = await mount(<NewAssemblyClient />);
        await buildWork();
        fireEvent.click(screen.getByTestId("designer-reset"));
        await act(async () => {});

        const expectBlank = (work: Work) => {
            expect(work.orders).toHaveLength(1);
            expect(work.clauses).toEqual({});
            expect(work.bound).toEqual([undefined]);
            expect(work.terms).toEqual({});
            expect(work.name).toBe("");
            expect(work.summary).toBe("");
            expect(work.description).toBe("");
        };
        expectBlank(await readWork());
        first.unmount();

        h.search = new URLSearchParams();
        await mount(<NewAssemblyClient />);
        expectBlank(await readWork());
    });
});

describe("DesignerCanvas — on a named draft, the autosave follows what the canvas holds", () => {
    it("an imported assembly replaces the design: it autosaves as the new design, and the draft is untouched", async () => {
        const slug = await saveNamed("Open draft");
        const imported = { ...loadNamedDraft(slug)!, slug: "", name: "Imported" };
        const edit = await mount(<EditAssemblyClient slug={slug} />);
        let replaced = false;
        await act(async () => {
            replaced = h.handlers.assist!.onImportAssembly({ draft: imported, assembly: { name: "Imported" } }, new Set());
        });
        expect(replaced).toBe(true);
        expect(nameValue()).toBe("Imported");
        expect(Object.keys(designerStorage()), "the open draft keeps no autosave of the imported design").not.toContain(draftAutosave(slug));
        expect(JSON.parse(designerStorage()[NEW_DESIGN_AUTOSAVE] ?? "null")?.name, "the imported design is the new design's work").toBe("Imported");
        edit.unmount();

        // A reload of the draft shows the draft.
        const reloaded = await mount(<EditAssemblyClient slug={slug} />);
        expect(nameValue()).toBe("Open draft");
        reloaded.unmount();
        // The new design's route shows the imported work.
        h.search = new URLSearchParams();
        await mount(<NewAssemblyClient />);
        expect(nameValue()).toBe("Imported");
    });

    it("Reset clears the canvas to a new blank design: the draft's saved state is what a reload shows", async () => {
        const slug = await saveNamed("Kept draft");
        const edit = await mount(<EditAssemblyClient slug={slug} />);
        fireEvent.click(screen.getByTestId("designer-reset"));
        await act(async () => {});
        expect(nameValue()).toBe("");
        expect(Object.keys(designerStorage()), "no blank autosave is written over the draft").not.toContain(draftAutosave(slug));
        edit.unmount();

        await mount(<EditAssemblyClient slug={slug} />);
        expect(nameValue()).toBe("Kept draft");
        expect(loadNamedDraft(slug)!.name).toBe("Kept draft");
    });
});

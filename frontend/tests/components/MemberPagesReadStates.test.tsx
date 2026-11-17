/**
 * The member pages over a network read that fails or is still in flight
 * (docs/OPEN_WORLD.md § 1 "No fallbacks — absence is the representation").
 *
 * The edit pages under /members/edit/ read the wallet's registration from
 * `MembersRegistry`, then its profile document from IPFS, through
 * `useMemberProfileEditor`. Either read failing leaves the page with no text
 * at all: no form (a blind save would overwrite what the read would have
 * shown), no error text. A read in flight shows the wait line.
 *
 * The wizard steps under /members/ that read the assembly registry show the
 * registry's assemblies as rows; a failed or empty read shows no row and no
 * error text.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { ABSENT, PENDING, present } from "@/lib/shared/networkRead";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;

const m = vi.hoisted(() => ({
    /** Whether a wallet is connected; the read-state cases run connected. */
    connected: true,
    registration: undefined as unknown,
    profile: (async () => null) as () => Promise<unknown>,
    choices: undefined as unknown,
    catalog: (async () => null) as () => Promise<unknown>,
    onboarding: {
        state: {},
        loaded: true,
        subject: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        update: () => undefined,
    },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined }) }));
vi.mock("wagmi", () => ({
    useAccount: () => (m.connected ? { address: WALLET, isConnected: true } : { address: undefined, isConnected: false }),
    useChainId: () => 31337,
    usePublicClient: () => undefined,
    useReadContract: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/member/useMembersRegistry", () => ({
    useMemberProfile: () => ({ read: m.registration }),
    useUpdateProfile: () => ({ updateProfile: async () => undefined, isPending: false, isConfirming: false, isSuccess: false, error: null, hash: undefined }),
}));
vi.mock("@/lib/member/profileFetcher", () => ({ fetchMemberProfile: () => m.profile() }));
vi.mock("@/lib/member/catalogFetcher", () => ({ fetchMemberCatalog: () => m.catalog() }));
vi.mock("@/lib/member/onboardingState", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/member/onboardingState")>()),
    useOnboardingState: () => m.onboarding,
}));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => ({ read: m.choices }) }));
vi.mock("@/lib/member/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => ({ read: m.choices }) }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));

import { MemberEditProfile } from "@/components/members/MemberEditProfile";
import { MemberEditAgents } from "@/components/members/MemberEditAgents";
import { MemberEditBuyer } from "@/components/members/MemberEditBuyer";
import { MemberEditAssemblies } from "@/components/members/MemberEditAssemblies";
import { MemberEditCatalog } from "@/components/members/MemberEditCatalog";
import { OnboardingBuyerForm } from "@/components/members/OnboardingBuyerForm";
import { OnboardingCatalogForm } from "@/components/members/OnboardingCatalogForm";
import { OnboardingAssembliesForm } from "@/components/members/OnboardingAssembliesForm";
import { CONNECT_PROMPT } from "../lib/__fixtures__/noWallet";

/** Words a page may not show in a read's place when the read failed or came back empty. */
const ERROR_TEXT = /\bfail(s|ed|ure)?\b|\berror\b|could ?n[o']t|unavailable|unable|unreachable/i;

const REGISTERED = present({ registered: true, metadataURI: "ipfs://QmProfile", registeredBlock: 1n });

async function flush() {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

const EDIT_PAGES = [
    ["/members/edit/identity", MemberEditProfile],
    ["/members/edit/agents", MemberEditAgents],
    ["/members/edit/buyer", MemberEditBuyer],
    ["/members/edit/assemblies", MemberEditAssemblies],
    ["/members/edit/catalog", MemberEditCatalog],
] as const;

describe("member edit pages: a failed read renders nothing", () => {
    beforeEach(() => {
        m.registration = PENDING;
        m.profile = async () => null;
        m.choices = PENDING;
    });

    it.each(EDIT_PAGES)("%s — the registration read fails: no text, no form", async (_route, Page) => {
        m.registration = ABSENT;
        const { container } = render(<Page />);
        await flush();
        expect(container.textContent).toBe("");
        expect(container.querySelector("form")).toBeNull();
    });

    it.each(EDIT_PAGES)("%s — the profile document fails to read: no text, no form", async (_route, Page) => {
        m.registration = REGISTERED;
        m.profile = async () => { throw new Error("fetch failed: gateway unreachable"); };
        const { container } = render(<Page />);
        await flush();
        expect(container.textContent).toBe("");
        expect(container.querySelector("form")).toBeNull();
    });

    it.each(EDIT_PAGES)("%s — the profile document resolves empty: no text, no form", async (_route, Page) => {
        m.registration = REGISTERED;
        m.profile = async () => null;
        const { container } = render(<Page />);
        await flush();
        expect(container.textContent).toBe("");
    });

    it.each(EDIT_PAGES)("%s — the registration read is in flight: the wait line only", async (_route, Page) => {
        const { container } = render(<Page />);
        await flush();
        expect(container.textContent).toBe("Reading registry…");
    });
});

/** /members/edit/catalog reads a second document once the profile has loaded:
 *  the catalog behind the profile's `catalogURI`. Its failure leaves the page
 *  as the profile's does: no text, no form (a blind save would clobber the
 *  catalog's items). Its read in flight shows its own wait line. */
describe("/members/edit/catalog: the registry and the profile answered, the catalog document did not", () => {
    beforeEach(() => {
        m.registration = REGISTERED;
        m.profile = async () => ({ name: "Kitchen", subjectAddress: WALLET, catalogURI: "ipfs://QmCatalog" });
    });

    it("the catalog document loads: the editor renders past the gate (the read reaches the page)", async () => {
        m.catalog = async () => ({ subjectAddress: WALLET, items: [], version: "1.0.0" });
        const { container } = render(<MemberEditCatalog />);
        await flush();
        expect(container.textContent).not.toBe("");
        expect(container.textContent).not.toMatch(/Fetching catalog from IPFS…|Reading registry…/);
    });

    it("the catalog document fails to read: no text, no form", async () => {
        m.catalog = async () => { throw new Error("fetch failed: gateway unreachable"); };
        const { container } = render(<MemberEditCatalog />);
        await flush();
        expect(container.textContent).toBe("");
        expect(container.querySelector("form")).toBeNull();
    });

    it("the catalog document resolves empty: no text, no form", async () => {
        m.catalog = async () => null;
        const { container } = render(<MemberEditCatalog />);
        await flush();
        expect(container.textContent).toBe("");
        expect(container.querySelector("form")).toBeNull();
    });

    it("the catalog document is in flight: its wait line only", async () => {
        m.catalog = () => new Promise(() => undefined);
        const { container } = render(<MemberEditCatalog />);
        await flush();
        expect(container.textContent).toBe("Fetching catalog from IPFS…");
    });
});

/** Each step, and the selector of what it shows from the read: an assembly
 *  row, or (the catalog step) the item fields the bound assemblies' clauses ask for. */
const WIZARD_STEPS = [
    ["/members/buyer", OnboardingBuyerForm, '[data-testid^="buyer-assembly-"]'],
    ["/members/catalog", OnboardingCatalogForm, '[data-testid$="-clauses"]'],
    ["/members/assemblies", OnboardingAssembliesForm, '[data-testid^="seller-assembly-"]'],
] as const;

describe("member wizard steps: a failed or empty assembly-registry read shows nothing from the read and no error text", () => {
    it.each(WIZARD_STEPS)("%s — the read fails", async (_route, Step, fromRead) => {
        m.choices = ABSENT;
        const { container } = render(<Step />);
        await flush();
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
        expect(container.querySelector(fromRead)).toBeNull();
    });

    it.each(WIZARD_STEPS)("%s — the read resolves empty", async (_route, Step, fromRead) => {
        m.choices = present([]);
        const { container } = render(<Step />);
        await flush();
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
        expect(container.querySelector(fromRead)).toBeNull();
    });
});

/** One published assembly, as the registry read answers before its document loads. */
const CHOICE = {
    slug: "asm-point-of-sale", registeredBy: WALLET, assemblyHash: `0x${"ab".repeat(32)}`, contentURI: "ipfs://a",
    blockNumber: 1n, networkTargets: [], state: "loading", name: "Point of sale", summary: null,
    agreementCount: null, clauses: null, hydratedAssembly: null, stakeWithdrawn: false,
};

/** The wizard is filled with no wallet, under an anonymous draft the first wallet to connect adopts. */
describe("member wizard steps: no wallet, the assembly-registry read present", () => {
    it.each([
        ["/members/assemblies", OnboardingAssembliesForm, "seller-assembly"],
        ["/members/buyer", OnboardingBuyerForm, "buyer-assembly"],
    ] as const)("no wallet, read present: %s lists the registry's assemblies, and no prompt to connect stands in for them", async (_route, Step, prefix) => {
        m.connected = false;
        m.choices = present([CHOICE]);
        try {
            const { container, getByTestId } = render(<Step />);
            await flush();
            expect(getByTestId(`${prefix}-row-${CHOICE.slug}`).textContent).toMatch(/Point of sale/);
            expect(container.textContent ?? "").not.toMatch(CONNECT_PROMPT);
        } finally {
            m.connected = true;
        }
    });
});

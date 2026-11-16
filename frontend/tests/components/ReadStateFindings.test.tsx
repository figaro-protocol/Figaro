/**
 * Two edges of the rule that a read which failed or resolved empty leaves its
 * place empty (docs/OPEN_WORLD.md § 1, "No fallbacks — absence is the
 * representation").
 *
 * The audit page is the stated exception: the evidence file a party hands a
 * forum is whole and says what it lacks, so a failed attestation read is
 * named in its list of missing parts and nowhere else on the page.
 *
 * The member editor shows a wait line only for a read in flight: the chain's
 * answer that the wallet is not registered redirects and shows nothing.
 *
 * A case named FINDING asserts what a page does today against the rule; it
 * changes with the page.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PENDING, present } from "@/lib/shared/networkRead";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const ORDER = `0x${"0d".repeat(32)}` as const;

const m = vi.hoisted(() => ({
    client: { chain: { id: 31337 } },
    agreements: new Map(),
    orders: undefined as unknown,
    registration: undefined as unknown,
    replace: (() => undefined) as (href: string) => void,
    // Each read fails unless a case sets it.
    attestations: (async () => { throw new Error("fetch failed: RPC unreachable"); }) as () => Promise<unknown>,
    verdicts: (async () => { throw new Error("fetch failed: RPC unreachable"); }) as () => Promise<unknown>,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: WALLET, isConnected: true }),
    usePublicClient: () => m.client,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: (h: string) => m.replace(h) }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/hooks/useProcessOrders", () => ({ useProcessOrders: () => m.orders }));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => m.agreements }));
vi.mock("@/lib/composition/indexer", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composition/indexer")>()),
    getAttestationsByOrder: () => m.attestations(),
}));
vi.mock("@/lib/audit/signatureVerdicts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/audit/signatureVerdicts")>()),
    verifyOrderCommitSignatures: () => m.verdicts(),
}));
// The committed clause data an order's evidence block shows; its extraction
// is its own tests'. One committed clause puts the order's block on the page.
vi.mock("@/lib/audit/clauseDataExtract", () => ({
    extractClauseData: () => ({ clauses: [{ clauseKey: "0xc1", title: "A committed clause", fields: [] }], missing: [] }),
}));
vi.mock("@/lib/member/useMembersRegistry", () => ({
    useMemberProfile: () => ({ read: m.registration }),
    useUpdateProfile: () => ({ updateProfile: async () => undefined, isPending: false, isConfirming: false, isSuccess: false, error: null, hash: undefined }),
}));
vi.mock("@/lib/member/onboardingState", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/member/onboardingState")>()),
    useOnboardingState: () => ({ state: {}, loaded: true, subject: WALLET, update: () => undefined }),
}));

import { ProcessClauseEvidence } from "@/app/(app)/audit/_components/ProcessClauseEvidence";
import { MemberEditProfile } from "@/components/members/MemberEditProfile";

async function flush() {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

describe("/audit/view — the attestation read of a process fails", () => {
    it("names the failed read in the list of what the evidence file lacks, and nowhere else", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        m.orders = present([{ orderHash: ORDER, checkoutHash: `0x${"c0".repeat(32)}`, processId: ORDER }]);
        render(<ProcessClauseEvidence processId={ORDER} />);
        await flush();
        const text = screen.getByTestId("audit-clause-evidence").textContent ?? "";
        expect(text.match(/\bfailed\b/g) ?? []).toHaveLength(1);
        expect(text).toMatch(/the read of its attestations failed, so none are listed/);
    });
});

describe("/audit/view — the commit-calldata read of an order resolves empty", () => {
    it("FINDING: each signature row shows the stand-in text 'Unavailable — no readable commit calldata for this order'", async () => {
        // The page as it stands (app/(app)/audit/_components/ProcessClauseEvidence.tsx:92-96):
        // `verifyOrderCommitSignatures` answers "unavailable" when no commit
        // transaction and no batch carries the order (the chain's answer, not
        // a failure), and each party's row names it in words the rule bars
        // from a resolved-empty read's place. Asserted as it is; not changed.
        const checkoutHash = `0x${"c0".repeat(32)}`;
        m.orders = present([{ orderHash: ORDER, checkoutHash, processId: ORDER }]);
        m.agreements = new Map([[checkoutHash, {}]]);
        m.attestations = async () => [];
        m.verdicts = async () => ({ buyer: "unavailable", seller: "unavailable", transactionHash: null, batch: null });
        render(<ProcessClauseEvidence processId={ORDER} />);
        await flush();
        for (const party of ["buyer", "seller"]) {
            expect(screen.getByTestId(`audit-sig-${party}-${ORDER}`).textContent).toBe(
                "Unavailable — no readable commit calldata for this order",
            );
        }
    });
});

describe("/members/edit/* — the registry answers that the wallet is not registered", () => {
    it("shows no wait line once the read has answered", async () => {
        m.registration = present({ registered: false, metadataURI: "", registeredBlock: 0n });
        m.replace = vi.fn();
        const { container } = render(<MemberEditProfile />);
        await flush();
        expect(m.replace).toHaveBeenCalledWith("/members/manage");
        expect(container.textContent).not.toMatch(/Reading registry/);
    });

    it("the wait line stands for a read in flight", async () => {
        m.registration = PENDING;
        const { container } = render(<MemberEditProfile />);
        await flush();
        expect(container.textContent).toBe("Reading registry…");
    });
});

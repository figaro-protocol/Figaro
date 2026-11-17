/**
 * Two edges of the rule that a read which failed or resolved empty leaves its
 * place empty (docs/OPEN_WORLD.md § 1, "No fallbacks — absence is the
 * representation").
 *
 * The audit page is the stated exception: the evidence file a party hands a
 * forum is whole and says what it lacks, so a read it could not make is
 * named once, in its list of missing parts, and nowhere else on the page: a
 * failed attestation read, an agreement that failed to load, an order whose
 * commit calldata no transaction and no batch carries. An agreement still in
 * flight is not missing: the page shows its loading line.
 *
 * The member editor shows a wait line only for a read in flight: the chain's
 * answer that the wallet is not registered redirects and shows nothing.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ABSENT, PENDING, present } from "@/lib/shared/networkRead";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const ORDER = `0x${"0d".repeat(32)}` as const;

const m = vi.hoisted(() => ({
    client: { chain: { id: 31337 } },
    agreementReads: new Map() as Map<string, unknown>,
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
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreementReads: () => m.agreementReads }));
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

describe("/audit/view — the attestation read and the signature read both fail", () => {
    it("names each failed read once, in the list of what the evidence file lacks, and nowhere else", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        m.orders = present([{ orderHash: ORDER, checkoutHash: `0x${"c0".repeat(32)}`, processId: ORDER }]);
        render(<ProcessClauseEvidence processId={ORDER} />);
        await flush();
        const text = screen.getByTestId("audit-clause-evidence").textContent ?? "";
        const listed = screen.getByTestId("audit-missing-parts").textContent ?? "";
        // Two failed reads, two entries: every "failed" on the page is in the list.
        expect(text.match(/\bfailed\b/g) ?? []).toHaveLength(2);
        expect(listed.match(/\bfailed\b/g) ?? []).toHaveLength(2);
        expect(listed).toMatch(/the read of its attestations failed, so none are listed/);
        expect(listed).toMatch(/the read of its commit transaction failed, so neither signature was checked here/);
    });
});

describe("/audit/view — the signature read of an order fails", () => {
    it("the signature rows' place is empty, and the failed read is named once in the list of what the evidence file lacks", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const checkoutHash = `0x${"c0".repeat(32)}`;
        m.orders = present([{ orderHash: ORDER, checkoutHash, processId: ORDER }]);
        m.agreementReads = new Map([[checkoutHash, present({})]]);
        m.attestations = async () => [];
        m.verdicts = async () => { throw new Error("fetch failed: RPC unreachable"); };
        render(<ProcessClauseEvidence processId={ORDER} />);
        await flush();
        expect(screen.queryByTestId(`audit-signatures-${ORDER}`)).toBeNull();
        const text = screen.getByTestId("audit-clause-evidence").textContent ?? "";
        expect(text.match(/Signatures of order/g) ?? []).toHaveLength(1);
        expect(screen.getByTestId("audit-missing-parts").textContent).toMatch(
            /the read of its commit transaction failed, so neither signature was checked here/,
        );
    });
});

describe("/audit/view — the commit-calldata read of an order resolves empty", () => {
    it("the signature rows' place is empty, and the lack is named once in the list of what the evidence file lacks", async () => {
        // `verifyOrderCommitSignatures` answers "unavailable" when no commit
        // transaction and no batch carries the order: the chain's answer, not
        // a failure.
        const checkoutHash = `0x${"c0".repeat(32)}`;
        m.orders = present([{ orderHash: ORDER, checkoutHash, processId: ORDER }]);
        m.agreementReads = new Map([[checkoutHash, present({})]]);
        m.attestations = async () => [];
        m.verdicts = async () => ({ buyer: "unavailable", seller: "unavailable", transactionHash: null, batch: null });
        render(<ProcessClauseEvidence processId={ORDER} />);
        await flush();
        expect(screen.queryByTestId(`audit-signatures-${ORDER}`)).toBeNull();
        const text = screen.getByTestId("audit-clause-evidence").textContent ?? "";
        expect(text).not.toMatch(/Unavailable/);
        expect(text.match(/Signatures of order/g) ?? []).toHaveLength(1);
        expect(screen.getByTestId("audit-missing-parts").textContent).toMatch(
            new RegExp(`Signatures of order ${ORDER}`),
        );
    });
});

describe("/audit/view — the agreement read of an order", () => {
    const checkoutHash = `0x${"c0".repeat(32)}`;

    it("failed: the agreement is named once in the list of what the evidence file lacks", async () => {
        m.orders = present([{ orderHash: ORDER, checkoutHash, processId: ORDER }]);
        m.agreementReads = new Map([[checkoutHash, ABSENT]]);
        m.attestations = async () => [];
        m.verdicts = async () => ({ buyer: "valid", seller: "valid", transactionHash: null, batch: null });
        render(<ProcessClauseEvidence processId={ORDER} />);
        await flush();
        const text = screen.getByTestId("audit-clause-evidence").textContent ?? "";
        expect(text.match(/Agreement and clauses of order/g) ?? []).toHaveLength(1);
        expect(screen.getByTestId("audit-missing-parts").textContent).toMatch(
            new RegExp(`the agreement under checkoutHash ${checkoutHash} was not loaded`),
        );
        expect(text).not.toMatch(/Loading/);
    });

    it("in flight: the loading line, and the agreement is not listed as lacking", async () => {
        m.orders = present([{ orderHash: ORDER, checkoutHash, processId: ORDER }]);
        m.agreementReads = new Map([[checkoutHash, PENDING]]);
        m.attestations = async () => [];
        m.verdicts = async () => ({ buyer: "valid", seller: "valid", transactionHash: null, batch: null });
        render(<ProcessClauseEvidence processId={ORDER} />);
        await flush();
        const text = screen.getByTestId("audit-clause-evidence").textContent ?? "";
        expect(text).toMatch(/Loading…/);
        expect(text).not.toMatch(/Agreement and clauses of order/);
        expect(screen.queryByTestId("audit-missing-parts")).toBeNull();
    });

    it("one order's agreement in flight: the loading line is in that order's block only, and the other order's evidence shows", async () => {
        const OTHER = `0x${"0e".repeat(32)}`;
        const otherHash = `0x${"c1".repeat(32)}`;
        m.orders = present([
            { orderHash: ORDER, checkoutHash, processId: ORDER },
            { orderHash: OTHER, checkoutHash: otherHash, processId: ORDER },
        ]);
        m.agreementReads = new Map([[checkoutHash, PENDING], [otherHash, present({})]]);
        m.attestations = async () => [];
        m.verdicts = async () => ({ buyer: "valid", seller: "valid", transactionHash: null, batch: null });
        render(<ProcessClauseEvidence processId={ORDER} />);
        await flush();
        expect(screen.getByTestId(`audit-order-loading-${ORDER}`).textContent).toBe("Loading…");
        expect(screen.queryByTestId(`audit-order-loading-${OTHER}`)).toBeNull();
        const other = screen.getByTestId(`audit-order-${OTHER}`).textContent ?? "";
        expect(other).toMatch(/A committed clause/);
        expect(other).not.toMatch(/Loading/);
        expect(screen.getByTestId(`audit-order-${ORDER}`).textContent).not.toMatch(/A committed clause/);
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

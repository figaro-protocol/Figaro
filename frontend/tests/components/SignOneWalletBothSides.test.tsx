/**
 * /sign and the /orders accept card when one wallet is both the buyer and
 * the seller of an order. The Core and the SDK admit such an order. This
 * frontend's accept takes the role by address, buyer first, so on a
 * buyer-signed order it would look for the seller's signature it was meant
 * to add, and refuse. Both pages say so in one line in place of that act,
 * before any wallet prompt. What the page can still do stays: a self-order
 * the seller signed first is counter-signed as buyer.
 */
import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { buildOrderAgreement, computeCheckoutHash, type Commitment, type Hex } from "@figaro-protocol/sdk";
import { serializeCommitmentPayload, type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { present } from "@/lib/shared/networkRead";

const ONE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const OTHER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;

const m = vi.hoisted(() => ({
    address: undefined as string | undefined,
    search: "",
    // One object per read for every render, as the hooks keep them.
    client: { chain: { id: 31337 } },
    empty: { status: "present", value: [] as unknown[] },
    absent: { status: "absent" },
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: m.address }),
    useChainId: () => 31337,
    usePublicClient: () => m.client,
}));
// The path the payload's signature names is read by `usePayloadPath`
// (pinned in relayTransport.test.ts); here the order is a direct-path one.
vi.mock("@/lib/checkout/pathChoice", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/pathChoice")>()),
    usePayloadPath: () => ({ status: "present", value: "direct" }),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: "0x1111111111111111111111111111111111111111", batchVerifier: "" },
}));
vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(m.search),
    useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/lib/registries/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => ({ read: m.empty }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "TKN" }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 6, ready: true, loading: false }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: present(10n ** 30n), refetch: () => undefined }) }));
vi.mock("@/hooks/useTokenApproval", () => ({
    default: () => ({
        needsApproval: () => false, allowanceKnown: true, isAllowanceRefetching: false,
        isApprovePending: false, isApproveConfirming: false, isApproveSuccess: false, isApproveError: false,
        allowance: undefined, approve: () => undefined,
    }),
}));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ ensureApproval: vi.fn() }) }));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => null }));
vi.mock("@/lib/checkout/orderCommitmentFlow", () => ({
    useOrderCommitmentFlow: () => ({
        step: "idle", error: null, acceptOrder: vi.fn(), reset: vi.fn(),
        counterSignAndReturn: vi.fn(), quoteAndReturn: vi.fn(), commitOrder: vi.fn(),
    }),
    readSigningInputs: async () => null,
    readFollowedOrders: async () => [],
}));
vi.mock("@/lib/checkout/orderPendingSellerSignature", () => ({
    useCommitmentPayloadInbox: () => ({ entries: [], status: "idle", error: null }),
}));
vi.mock("@/lib/registries/useMembersRegistry", () => ({ useMemberProfile: () => ({ read: m.absent }) }));
vi.mock("@/lib/registries/profileFetcher", () => ({ fetchMemberProfile: async () => null }));
vi.mock("@/lib/registries/useMemberListings", () => ({ useMemberListings: () => ({ read: m.empty }) }));
vi.mock("@/components/runtime/AgreementReview", () => ({ AgreementReview: () => null, pricedLineItems: () => ({ lines: [], sum: null }) }));
vi.mock("@/components/runtime/TokenApprovalFlow", () => ({ TokenApprovalFlow: () => <div data-testid="token-approval-flow" /> }));

import SignPage from "@/app/(app)/sign/page";
import { YourTurnCard } from "@/app/(app)/orders/_components/OrdersList";

const LINE = "This frontend does not place an order whose buyer and seller are one wallet; the SDK and the Core do.";

/** An order between `buyer` and `seller`, carrying the signatures named. */
function payload(buyer: Hex, seller: Hex, sigs: { buyer?: boolean; seller?: boolean }): CommitmentPayload {
    const { agreement } = buildOrderAgreement(buyer, seller, {
        [keyOf("figaro-commerce")]: {
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: "1000" }],
        },
    }, specSource());
    const commitment: Commitment = {
        processId: `0x${"00".repeat(32)}` as Hex, buyer, seller, token: CURRENCY,
        payment: 1000n, runningTotal: 1000n,
        checkoutHash: computeCheckoutHash(agreement),
        salt: 1n, commitDeadline: 9_999_999_999n,
    };
    return {
        commitment, agreement,
        ...(sigs.buyer ? { buyerSig: `0x${"22".repeat(65)}` as Hex } : {}),
        ...(sigs.seller ? { sellerSig: `0x${"33".repeat(65)}` as Hex } : {}),
    };
}

async function renderSign(p: CommitmentPayload) {
    m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(p))}`;
    render(<SignPage />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId("sign-payment")).toBeTruthy();
}

beforeAll(async () => { await primeClauseSpecs(["figaro-commerce"]); });
beforeEach(() => { m.address = ONE; });

describe("/sign — one wallet on both sides", () => {
    it("a buyer-signed order: the line shows, and no authorization or counter-sign is offered", async () => {
        await renderSign(payload(ONE, ONE, { buyer: true }));
        expect(screen.getByTestId("sign-one-wallet-both-sides").textContent).toBe(LINE);
        expect(screen.queryByTestId("token-approval-flow")).toBeNull();
        expect(screen.queryByTestId("btn-counter-sign")).toBeNull();
    });

    it("a seller-signed order: no line, and the buyer's authorization is offered", async () => {
        await renderSign(payload(ONE, ONE, { seller: true }));
        expect(screen.queryByTestId("sign-one-wallet-both-sides")).toBeNull();
        expect(screen.getByTestId("token-approval-flow")).toBeTruthy();
    });

    it("another wallet's order: no line, and the seller's authorization is offered", async () => {
        await renderSign(payload(OTHER, ONE, { buyer: true }));
        expect(screen.queryByTestId("sign-one-wallet-both-sides")).toBeNull();
        expect(screen.getByTestId("token-approval-flow")).toBeTruthy();
    });
});

describe("/orders — the accept card, one wallet on both sides", () => {
    const card = (p: CommitmentPayload) => render(
        <YourTurnCard act="accept" payload={p} onAct={vi.fn()} onDismiss={vi.fn()} isActing={false} listings={[]} />,
    );

    it("a buyer-signed order: the line shows in place of the accept button; dismiss stays", () => {
        card(payload(ONE, ONE, { buyer: true }));
        expect(screen.getByTestId("orders-one-wallet-both-sides").textContent).toBe(LINE);
        expect(screen.queryByTestId("btn-accept-order")).toBeNull();
        expect(screen.getByTestId("btn-dismiss-order")).toBeTruthy();
    });

    it("a seller-signed order: no line, and the accept button", () => {
        card(payload(ONE, ONE, { seller: true }));
        expect(screen.queryByTestId("orders-one-wallet-both-sides")).toBeNull();
        expect(screen.getByTestId("btn-accept-order")).toBeTruthy();
    });

    it("another wallet's order: no line, and the accept button", () => {
        card(payload(OTHER, ONE, { buyer: true }));
        expect(screen.queryByTestId("orders-one-wallet-both-sides")).toBeNull();
        expect(screen.getByTestId("btn-accept-order")).toBeTruthy();
    });
});

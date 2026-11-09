/**
 * /sign — the counter-sign page, rendered from the order flow's step and the
 * wallet's one coordination-channel inbox.
 *
 * - Listening (a connected wallet, nothing pasted, linked or parsed), it reads
 *   the shared inbox: the newest payload naming this wallet loads as
 *   "Received via XMTP secure channel", a payload that does not parse says
 *   so, and a channel that could not be opened shows its reason.
 * - The terms are checked against the signed checkoutHash: a match is
 *   "Terms verified", a mismatch is the do-not-proceed warning.
 * - The seller counter-signs with its funding leg when one is chosen
 *   (`useSwapFunding`), and the button waits on the funding authorization.
 * - The step drives the page: "signing" and "committing" hold the button,
 *   "error" shows the flow's message, "awaiting-buyer" shows the returned
 *   offer and "done" the submitted commitment, each in place of the review.
 */
import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { buildOrderAgreement, computeCheckoutHash, type Commitment, type Hex } from "@figaro-protocol/sdk";
import { serializeCommitmentPayload, type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";
import { specSource } from "@/lib/shared/clauseSpecSource";

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const SELLER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;
const FUNDING_TOKEN = `0x${"1a".repeat(20)}` as Hex;

type Step = "idle" | "signing" | "sharing" | "awaiting-seller" | "awaiting-buyer" | "committing" | "done" | "error";
const m = vi.hoisted(() => ({
    address: undefined as string | undefined,
    search: "",
    flow: undefined as unknown as { step: Step; error: string | null; acceptOrder: (...a: unknown[]) => Promise<unknown>; reset: () => void },
    inbox: { entries: [] as unknown[], status: "listening" as "idle" | "listening" | "error", error: null as string | null },
    swap: undefined as unknown as { fundingToken: Hex | null; authorization: string },
    // What the seller typed in the chooser's slippage margin field (null: untouched).
    marginText: null as string | null,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(m.search) }));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: m.address }) }));
vi.mock("@/lib/checkout/orderCommitmentFlow", () => ({
    useOrderCommitmentFlow: () => ({
        ...m.flow,
        counterSignAndReturn: vi.fn(), quoteAndReturn: vi.fn(), commitOrder: vi.fn(),
    }),
    readSigningDesign: async () => null,
}));
vi.mock("@/lib/checkout/orderPendingSellerSignature", () => ({ useCommitmentPayloadInbox: () => m.inbox }));
vi.mock("@/lib/composition/useSwapFunding", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composition/useSwapFunding")>()),
    useSwapFunding: () => ({
        contracts: null, candidates: [], fundingToken: m.swap.fundingToken, setFundingToken: () => {},
        authorizationFor: () => m.swap.authorization, authorize: () => {}, authorizeFailed: false,
    }),
}));
// The margin's chain reads (the venue quote) are the hook's own; here the venue's
// margin is 1% and its quote 1000, and the real `fundingMargin` derives the rest.
vi.mock("@/lib/composition/useFundingMargin", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/composition/useFundingMargin")>();
    return {
        ...actual,
        useFundingMargin: () => ({
            marginFor: () => ({
                ...actual.fundingMargin({ text: m.marginText, defaultBps: 100, quotedInput: 1_000n, balance: 10n ** 30n }),
                venue: "uniswap-v3", decimals: 6, symbol: "AAA", onChange: () => {},
            }),
        }),
    };
});
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "present", value: 10n ** 30n }, refetch: () => {} }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 6, ready: true, loading: false }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "TKN" }) }));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => null }));
vi.mock("@/lib/member/useMembersRegistry", () => ({ useMemberProfile: () => ({ read: { status: "absent" } }) }));
vi.mock("@/lib/member/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => ({ read: { status: "absent" } }) }));
vi.mock("@/components/runtime/AgreementReview", () => ({ AgreementReview: () => null, commerceLineItems: () => [] }));
vi.mock("@/components/runtime/TokenApprovalFlow", () => ({
    TokenApprovalFlow: ({ onApprovalComplete }: { onApprovalComplete: () => void }) => (
        <button type="button" onClick={onApprovalComplete}>approve the bond</button>
    ),
}));

import SignPage from "@/app/(app)/sign/page";

/** A buyer-signed order awaiting the seller, its agreement merkling to its
 *  checkoutHash unless `tamper` changes the signed hash. */
function payload(opts: { tamper?: boolean; salt?: bigint } = {}): CommitmentPayload {
    const { agreement } = buildOrderAgreement(BUYER, SELLER, {
        [keyOf("figaro-commerce")]: {
            currency: CURRENCY, payment: "1000",
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: "1000" }],
        },
    }, specSource());
    const commitment: Commitment = {
        processId: `0x${"00".repeat(32)}` as Hex, buyer: BUYER, seller: SELLER, currency: CURRENCY,
        payment: 1000n, expectedCumulativeValue: 1000n,
        checkoutHash: opts.tamper ? (`0x${"ee".repeat(32)}` as Hex) : computeCheckoutHash(agreement),
        salt: opts.salt ?? 1n, deadline: 9_999_999_999n,
    };
    return { commitment, agreement, buyerSig: `0x${"22".repeat(65)}` as Hex };
}

async function flush() {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeAll(async () => { await primeClauseSpecs(["figaro-commerce"]); });
beforeEach(() => {
    m.address = SELLER;
    m.search = "";
    m.flow = { step: "idle", error: null, acceptOrder: vi.fn(async () => `0x${"cc".repeat(32)}`), reset: vi.fn() };
    m.inbox = { entries: [], status: "listening", error: null };
    m.swap = { fundingToken: null, authorization: "none" };
    m.marginText = null;
});

describe("/sign — the coordination-channel inbox", () => {
    it("listening with an empty inbox says so", () => {
        render(<SignPage />);
        expect(screen.getByTestId("xmtp-commitment-channel-status").textContent).toBe("Listening for incoming commitment payloads over XMTP…");
    });

    it("loads a payload from the inbox and says it arrived over the channel", async () => {
        const p = payload();
        m.inbox = { entries: [{ payload: p, json: serializeCommitmentPayload(p), orderId: "order-1", witnessed: true }], status: "listening", error: null };
        render(<SignPage />);
        await flush();
        expect(screen.getByText("Received via XMTP secure channel.")).toBeTruthy();
        expect(screen.getByText("Order Commitment")).toBeTruthy();
    });

    it("a payload that does not parse says so", async () => {
        m.inbox = { entries: [{ payload: {}, json: "{not json", orderId: "order-x", witnessed: true }], status: "listening", error: null };
        render(<SignPage />);
        await flush();
        expect(screen.getByTestId("xmtp-commitment-channel-status").textContent).toBe("Received an invalid commitment payload over XMTP.");
    });

    it("a channel that could not be opened shows its reason", () => {
        m.inbox = { entries: [], status: "error", error: "XMTP is unreachable" };
        render(<SignPage />);
        expect(screen.getByTestId("xmtp-commitment-channel-status").textContent).toBe("XMTP is unreachable");
    });
});

describe("/sign — the terms check", () => {
    it("terms that merkle to the signed checkoutHash are verified", async () => {
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(payload()))}`;
        render(<SignPage />);
        await flush();
        expect(screen.getByTestId("sign-agreement-verified")).toBeTruthy();
        expect(screen.queryByTestId("sign-agreement-invalid")).toBeNull();
    });

    it("terms that do not are the do-not-proceed warning", async () => {
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(payload({ tamper: true })))}`;
        render(<SignPage />);
        await flush();
        expect(screen.getByTestId("sign-agreement-invalid").textContent).toMatch(/These terms do NOT match the signed checkoutHash — do not proceed\./);
        expect(screen.queryByTestId("sign-agreement-verified")).toBeNull();
    });

    it("an agreement naming a design that could not be read is refused in the review, before any signature", async () => {
        // The gate reads the design an agreement names and refuses what it
        // cannot read: the validator's verdict names the unread assembly, and
        // the review shows it rather than no verdict at all.
        const p = payload();
        const agreement = { ...p.agreement, provenance: { agreementHash: `0x${"a1".repeat(32)}` as Hex, assemblyHash: `0x${"a5".repeat(32)}` as Hex } };
        const unread: CommitmentPayload = { ...p, agreement, commitment: { ...p.commitment, checkoutHash: computeCheckoutHash(agreement) } };
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(unread))}`;
        render(<SignPage />);
        await flush();
        expect(screen.getByTestId("sign-agreement-invalid").textContent).toMatch(/was not read/);
        expect(screen.queryByTestId("sign-agreement-verified")).toBeNull();
    });
});

describe("/sign — the seller's counter-signature and the flow's step", () => {
    async function reviewing(step: Step = "idle", error: string | null = null) {
        m.flow = { ...m.flow, step, error };
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(payload()))}`;
        const view = render(<SignPage />);
        await flush();
        if (screen.queryByRole("button", { name: "approve the bond" })) fireEvent.click(screen.getByRole("button", { name: "approve the bond" }));
        return view;
    }

    it("counter-signs the parsed order with no funding leg", async () => {
        await reviewing();
        await act(async () => { fireEvent.click(screen.getByTestId("btn-counter-sign")); });
        expect(m.flow.acceptOrder).toHaveBeenCalledWith(expect.objectContaining({ commitment: expect.objectContaining({ seller: SELLER }) }), undefined);
    });

    it("counter-signs with the chosen funding token's leg once it is authorized", async () => {
        m.swap = { fundingToken: FUNDING_TOKEN, authorization: "ready" };
        await reviewing();
        await act(async () => { fireEvent.click(screen.getByTestId("btn-counter-sign")); });
        // Untouched, the margin is the venue's own, and the leg is quoted with it.
        expect(m.flow.acceptOrder).toHaveBeenCalledWith(expect.anything(), { inputToken: FUNDING_TOKEN, slippageBps: 100 });
    });

    it("counter-signs with the slippage margin the seller set in the chooser", async () => {
        m.swap = { fundingToken: FUNDING_TOKEN, authorization: "ready" };
        m.marginText = "2.5";
        await reviewing();
        await act(async () => { fireEvent.click(screen.getByTestId("btn-counter-sign")); });
        expect(m.flow.acceptOrder).toHaveBeenCalledWith(expect.anything(), { inputToken: FUNDING_TOKEN, slippageBps: 250 });
    });

    it("holds the counter-signature while the slippage margin is refused", async () => {
        m.swap = { fundingToken: FUNDING_TOKEN, authorization: "ready" };
        m.marginText = "11";
        await reviewing();
        const button = screen.getByTestId("btn-counter-sign") as HTMLButtonElement;
        expect(button.textContent).toBe("Fix the slippage margin first");
        expect(button.disabled).toBe(true);
    });

    it("holds the counter-signature while the chosen funding token still needs its authorization", async () => {
        m.swap = { fundingToken: FUNDING_TOKEN, authorization: "needed" };
        await reviewing();
        const button = screen.getByTestId("btn-counter-sign") as HTMLButtonElement;
        expect(button.textContent).toBe("Authorize the funding token first");
        expect(button.disabled).toBe(true);
    });

    it("signing and committing hold the button under their own words", async () => {
        const { unmount } = await reviewing("signing");
        expect((screen.getByTestId("btn-counter-sign") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId("btn-counter-sign").textContent).toBe("Signing…");
        unmount();
        await reviewing("committing");
        expect(screen.getByTestId("btn-counter-sign").textContent).toBe("Submitting…");
    });

    it("error shows the flow's message beside the review", async () => {
        await reviewing("error", "The relayed order's counterparty signature is missing or invalid — refusing to counter-sign.");
        expect(screen.getByTestId("sign-error").textContent).toBe("The relayed order's counterparty signature is missing or invalid — refusing to counter-sign.");
        expect(screen.getByTestId("btn-counter-sign")).toBeTruthy();
    });

    it("awaiting-buyer shows the returned offer in place of the review", async () => {
        await reviewing("awaiting-buyer");
        expect(screen.getByTestId("sign-offer-returned").textContent).toBe("Offer returned to the buyer.");
        expect(screen.queryByText("Order Commitment")).toBeNull();
    });

    it("done shows the submitted commitment in place of the review", async () => {
        await reviewing("done");
        expect(screen.getByText("Commitment submitted on-chain.")).toBeTruthy();
        expect(screen.queryByText("Order Commitment")).toBeNull();
        expect(screen.queryByTestId("btn-counter-sign")).toBeNull();
    });
});

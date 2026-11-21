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
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { buildOrderAgreement, calculateBonds, computeCheckoutHash, type Commitment, type Hex } from "@figaro-protocol/sdk";
import { tokenFigure } from "@/lib/shared/utils";
import { serializeCommitmentPayload, type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "../lib/primeClauseSpecs";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const SELLER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;
const FUNDING_TOKEN = `0x${"1a".repeat(20)}` as Hex;

type Step = "idle" | "signing" | "sharing" | "awaiting-seller" | "awaiting-buyer" | "committing" | "done" | "error";
const m = vi.hoisted(() => ({
    client: { chain: { id: 31337 }, readContract: async () => `0x${"5a".repeat(32)}` },
    address: undefined as string | undefined,
    search: "",
    flow: undefined as unknown as { step: Step; error: string | null; acceptOrder: (...a: unknown[]) => Promise<unknown>; reset: () => void },
    inbox: { entries: [] as unknown[], status: "listening" as "idle" | "listening" | "error", error: null as string | null },
    swap: undefined as unknown as { fundingToken: Hex | null; authorization: string },
    // What the seller typed in the chooser's slippage margin field (null: untouched).
    marginText: null as string | null,
    // The ClauseRegistry registrations the review reads a spec's address from.
    registryRows: [] as Array<{ args: { clauseKey: string; contentURI: string } }>,
    // The path the payload's signature names, as the page reads it
    // (`usePayloadPath`): the read itself is pinned in relayTransport.test.ts.
    path: { status: "present", value: "direct" } as { status: "pending" } | { status: "absent" } | { status: "present"; value: "direct" | "batch" },
}));
vi.mock("@/lib/checkout/pathChoice", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/pathChoice")>()),
    usePayloadPath: () => m.path,
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: "0x1111111111111111111111111111111111111111", batchVerifier: "0x2222222222222222222222222222222222222222" },
    getBatchVerifier: () => "0x2222222222222222222222222222222222222222",
}));
// No relay is named: the batch path's acts wait on one.
vi.mock("@/lib/registries/profileFetcher", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/registries/profileFetcher")>()),
    profileReaderForChain: () => async () => null,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(m.search) }));
// One client for every render, as wagmi's hook keeps it.
vi.mock("wagmi", () => ({ useAccount: () => ({ address: m.address }), usePublicClient: () => m.client, useChainId: () => 31337 }));
// The review's reads are the sign action's own (`readSigningInputs`): the
// clause specs through the registry, then the design. No design is read here.
vi.mock("@/lib/checkout/orderCommitmentFlow", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/orderCommitmentFlow")>()),
    useOrderCommitmentFlow: () => ({
        ...m.flow,
        counterSignAndReturn: vi.fn(), quoteAndReturn: vi.fn(), commitOrder: vi.fn(),
    }),
}));
vi.mock("@/lib/registries/useProcessRegistry", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/registries/useProcessRegistry")>()),
    fetchHydratedAssemblyByHash: async () => null,
}));
vi.mock("@/lib/registries/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/registries/contracts")>();
    return { ...actual, REGISTRY_CONTRACTS: { ...actual.REGISTRY_CONTRACTS, clauseRegistry: "0x00000000000000000000000000000000000000c1" } };
});
vi.mock("@/lib/core/eventCache", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/eventCache")>()),
    cachedGetContractEvents: async () => m.registryRows,
}));
vi.mock("@/lib/checkout/orderPendingSellerSignature", () => ({ useCommitmentPayloadInbox: () => m.inbox }));
vi.mock("@/lib/composability/useSwapFunding", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composability/useSwapFunding")>()),
    useSwapFunding: () => ({
        contracts: null, candidates: [], fundingToken: m.swap.fundingToken, setFundingToken: () => {},
        authorizationFor: () => m.swap.authorization, authorize: () => {}, authorizeFailed: false,
    }),
}));
// The margin's chain reads (the venue quote) are the hook's own; here the venue's
// margin is 1% and its quote 1000, and the real `fundingMargin` derives the rest.
vi.mock("@/lib/composability/useFundingMargin", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/composability/useFundingMargin")>();
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
vi.mock("@/lib/registries/useMembersRegistry", () => ({ useMemberProfile: () => ({ read: { status: "absent" } }) }));
vi.mock("@/lib/registries/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => ({ read: { status: "absent" } }) }));
vi.mock("@/components/runtime/AgreementReview", () => ({ AgreementReview: () => null, pricedLineItems: () => ({ lines: [], sum: null }) }));
vi.mock("@/components/runtime/TokenApprovalFlow", () => ({
    TokenApprovalFlow: ({ onApprovalComplete }: { onApprovalComplete: () => void }) => (
        <button type="button" onClick={onApprovalComplete}>approve the bond</button>
    ),
}));

import SignPage from "@/app/(app)/sign/page";

/** A buyer-signed order awaiting the seller, its agreement merkling to its
 *  checkoutHash unless `tamper` changes the signed hash. */
function payload(opts: { tamper?: boolean; salt?: bigint; processId?: Hex; runningTotal?: bigint } = {}): CommitmentPayload {
    const { agreement } = buildOrderAgreement(BUYER, SELLER, {
        [keyOf("figaro-commerce")]: {
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: "1000" }],
        },
    }, specSource());
    const commitment: Commitment = {
        processId: opts.processId ?? (`0x${"00".repeat(32)}` as Hex), buyer: BUYER, seller: SELLER, token: CURRENCY,
        payment: 1000n, runningTotal: opts.runningTotal ?? 1000n,
        checkoutHash: opts.tamper ? (`0x${"ee".repeat(32)}` as Hex) : computeCheckoutHash(agreement),
        salt: opts.salt ?? 1n, commitDeadline: 9_999_999_999n,
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
    m.registryRows = [];
    m.path = { status: "present", value: "direct" };
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
        expect(screen.getByTestId("sign-agreement-refused").textContent).toBe("These terms do NOT match the signed checkoutHash — do not proceed.");
        expect(screen.queryByTestId("sign-agreement-verified")).toBeNull();
    });

    it("an agreement naming a design that could not be read is refused in the review, before any signature", async () => {
        // The gate reads the design an agreement names and refuses what it
        // cannot read. The terms merkle to the signed checkoutHash: the review
        // says which design was not read, and never that the terms do not match.
        const p = payload();
        const processDesignHash = `0x${"a5".repeat(32)}` as Hex;
        // A root order of the design: its topology leaf is the empty list.
        const agreement = { ...p.agreement, follows: [], provenance: { agreementHash: `0x${"a1".repeat(32)}` as Hex, processDesignHash } };
        const unread: CommitmentPayload = { ...p, agreement, commitment: { ...p.commitment, checkoutHash: computeCheckoutHash(agreement) } };
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(unread))}`;
        render(<SignPage />);
        await flush();
        const block = screen.getByTestId("sign-agreement-invalid").textContent ?? "";
        expect(screen.getByTestId("sign-agreement-unread").textContent).toBe(
            `The design this agreement names, assembly ${processDesignHash}, was not read, so its designer values cannot be checked — do not proceed.`,
        );
        expect(block).not.toMatch(/do NOT match/);
        // The heading names the unread design once; no item repeats it.
        expect(block.match(/was not read/g) ?? []).toHaveLength(1);
        expect(screen.queryByTestId("sign-agreement-verified")).toBeNull();
    });

    it("an agreement naming an unread design whose clause also breaks its spec names the design and refuses the terms, without saying they do not match", async () => {
        const p = payload();
        const processDesignHash = `0x${"a5".repeat(32)}` as Hex;
        // The commerce clause's line items are not a list: a term its spec refuses.
        const clauses = p.agreement.clauses.map((c) => ({ ...c, data: { ...(c as { data?: object }).data, lineItems: "not a list" } }));
        const agreement = { ...p.agreement, clauses, follows: [], provenance: { agreementHash: `0x${"a1".repeat(32)}` as Hex, processDesignHash } };
        const both: CommitmentPayload = { ...p, agreement: agreement as CommitmentPayload["agreement"], commitment: { ...p.commitment, checkoutHash: `0x${"ee".repeat(32)}` as Hex } };
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(both))}`;
        render(<SignPage />);
        await flush();
        expect(screen.getByTestId("sign-agreement-unread").textContent).toMatch(/was not read/);
        expect(screen.getByTestId("sign-agreement-refused").textContent).toBe("These terms are refused — do not proceed.");
        expect(screen.getByTestId("sign-agreement-invalid").textContent).not.toMatch(/do NOT match/);
    });

    it("a clause that breaks its spec under the signed checkoutHash refuses the terms, without saying they do not match it", async () => {
        // The root is computed over the refused clause, so the signed hash is
        // the agreement's own; the validator never compares it while an issue stands.
        const p = payload();
        const clauses = p.agreement.clauses.map((c) => ({ ...c, data: { ...(c as { data?: object }).data, lineItems: "not a list" } }));
        const agreement = { ...p.agreement, clauses } as CommitmentPayload["agreement"];
        const checkoutHash = computeCheckoutHash(agreement);
        const refused: CommitmentPayload = { ...p, agreement, commitment: { ...p.commitment, checkoutHash } };
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(refused))}`;
        render(<SignPage />);
        await flush();
        expect(screen.getByTestId("sign-agreement-refused").textContent).toBe("These terms are refused — do not proceed.");
        expect(screen.getByTestId("sign-agreement-invalid").textContent).toMatch(/lineItems/);
        expect(screen.getByTestId("sign-agreement-invalid").textContent).not.toMatch(/do NOT match/);
        expect(screen.queryByTestId("sign-agreement-unread")).toBeNull();
    });

    it("a malformed provenance is not called an unread design", async () => {
        const p = payload();
        const agreement = { ...p.agreement, follows: [], provenance: { agreementHash: `0x${"6f".repeat(32)}` as Hex, processDesignHash: "0x5e" as Hex } };
        const malformed: CommitmentPayload = { ...p, agreement, commitment: { ...p.commitment, checkoutHash: computeCheckoutHash(p.agreement) } };
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(malformed))}`;
        render(<SignPage />);
        await flush();
        expect(screen.queryByTestId("sign-agreement-unread")).toBeNull();
        expect(screen.getByTestId("sign-agreement-invalid").textContent).toMatch(/32-byte/);
    });
});

describe("/sign — the review reads the clause specs the sign action reads", () => {
    // A made-up clause beside the commerce clause, so one spec can be left
    // out of the registry.
    const EXTRA = pinSpec({
        clauseId: "test-sign-review-extra",
        version: 1,
        title: "Extra term",
        description: "A made-up clause with one optional field.",
        fields: [{ name: "note", type: "string", required: false }],
    });
    const COMMERCE_FILE = path.resolve(process.cwd(), "../clauses/figaro-commerce.json");

    /** A payload naming an unread design whose clauses the cache does not
     *  hold: built while the specs are loaded, then the cache is emptied. */
    async function unreadPayloadWithColdCache(): Promise<{ payload: CommitmentPayload; commerce: Hex }> {
        setClauseSpecFetcher(async (uri) => (uri === "mem://extra" ? EXTRA.bytes : canonicalFileBytes(uri)));
        await loadClauseSpec(EXTRA.clauseKey, "mem://extra");
        const commerce = keyOf("figaro-commerce");
        const p = payload();
        const clauses = [...p.agreement.clauses, ...buildOrderAgreement(BUYER, SELLER, { [EXTRA.clauseKey]: { note: "x" } }, specSource()).agreement.clauses];
        const agreement = { ...p.agreement, clauses, follows: [], provenance: { agreementHash: `0x${"a1".repeat(32)}` as Hex, processDesignHash: `0x${"a5".repeat(32)}` as Hex } };
        const out: CommitmentPayload = { ...p, agreement, commitment: { ...p.commitment, checkoutHash: computeCheckoutHash(agreement) } };
        _resetClauseSpecCache_TESTING_ONLY();
        return { payload: out, commerce };
    }

    afterEach(async () => {
        _resetClauseSpecCache_TESTING_ONLY();
        await primeClauseSpecs(["figaro-commerce"]);
    });

    it("clause specs the cache lacks but the registry holds are loaded before the check: the unread design is the only refusal", async () => {
        const { payload: p, commerce } = await unreadPayloadWithColdCache();
        m.registryRows = [
            { args: { clauseKey: commerce, contentURI: COMMERCE_FILE } },
            { args: { clauseKey: EXTRA.clauseKey, contentURI: "mem://extra" } },
        ];
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(p))}`;
        render(<SignPage />);
        await flush();
        await flush();
        expect(screen.getByTestId("sign-agreement-unread").textContent).toMatch(/was not read/);
        expect(screen.queryByTestId("sign-agreement-refused")).toBeNull();
    });

    it("a clause spec no registry holds stays unloaded: the review names that clause beside the unread design", async () => {
        const { payload: p, commerce } = await unreadPayloadWithColdCache();
        m.registryRows = [{ args: { clauseKey: commerce, contentURI: COMMERCE_FILE } }];
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(p))}`;
        render(<SignPage />);
        await flush();
        await flush();
        expect(screen.getByTestId("sign-agreement-unread").textContent).toMatch(/was not read/);
        expect(screen.getByTestId("sign-agreement-refused").textContent).toBe("These terms are refused — do not proceed.");
        const block = screen.getByTestId("sign-agreement-invalid").textContent ?? "";
        expect(block).toContain(`${EXTRA.clauseKey} clause: the clause's spec is not loaded`);
        expect(block).not.toContain(`${commerce} clause:`);
    });
});

describe("/sign — the path of the commitment, before the counter-signature", () => {
    async function open() {
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(payload()))}`;
        render(<SignPage />);
        await flush();
    }

    it("a commitment signed for the direct path names FigaroCore and its address, and offers the approval", async () => {
        await open();
        expect(screen.getByTestId("sign-path").textContent).toBe("Signed for the direct path: FigaroCore at 0x1111111111111111111111111111111111111111. Your signature is made for the same contract, and your bond is approved to it.");
        expect(screen.getByRole("button", { name: "approve the bond" })).toBeTruthy();
        expect(screen.queryByTestId("sign-relay-panel")).toBeNull();
    });

    it("a commitment signed for the batch path names the verifier and its address, and shows the relay setting", async () => {
        m.path = { status: "present", value: "batch" };
        await open();
        expect(screen.getByTestId("sign-path").textContent).toContain("Signed for the batch path: the batch verifier at 0x2222222222222222222222222222222222222222.");
        // The relays are read with the profile reader; none named: the line and the setting.
        await screen.findByTestId("sign-relay-setting-input");
        fireEvent.click(screen.getByRole("button", { name: "approve the bond" }));
        // No relay in use: no counter-signature is offered.
        expect(screen.queryByTestId("btn-counter-sign")).toBeNull();
    });

    it("while the path is read: a loading line, and no approval and no act", async () => {
        m.path = { status: "pending" };
        await open();
        expect(screen.getByTestId("sign-path-reading")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "approve the bond" })).toBeNull();
        expect(screen.queryByTestId("btn-counter-sign")).toBeNull();
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

    it("shows the seller the token, the payment and its own bond (twice the running total) before the wallet opens", async () => {
        await reviewing();
        expect(screen.getByTestId("sign-token").textContent).toBe(CURRENCY);
        // payment 1000 and running total 1000 in a 6-decimal token named TKN
        expect(screen.getByTestId("sign-payment").textContent).toBe("0.001 TKN");
        expect(screen.getByTestId("sign-my-bond").textContent).toBe("0.002 TKN");
    });

    it("shows the buyer its own bond, twice the payment, in the same token", async () => {
        m.address = BUYER;
        const p = payload();
        const sellerSigned: CommitmentPayload = { ...p, buyerSig: undefined, sellerSig: `0x${"33".repeat(65)}` as Hex };
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(sellerSigned))}`;
        render(<SignPage />);
        await flush();
        expect(screen.getByTestId("sign-my-bond").textContent).toBe("0.002 TKN");
        expect(screen.getByTestId("sign-payment").textContent).toBe("0.001 TKN");
    });

    it("no wallet, read present: the linked order's token, payment and terms check show; only the counter-signature asks for a wallet", async () => {
        m.address = undefined;
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(payload()))}`;
        render(<SignPage />);
        await flush();
        expect(screen.getByTestId("sign-token").textContent).toBe(CURRENCY);
        expect(screen.getByTestId("sign-payment").textContent).toBe("0.001 TKN");
        expect(screen.getByTestId("sign-agreement-verified")).toBeTruthy();
        // The one line that names the wallet is the signature's: the terms above it stand without one.
        expect(screen.getByText("Connect your wallet to counter-sign a commitment.")).toBeTruthy();
    });

    it.each([
        ["the seller", SELLER, "sellerBond"],
        ["the buyer", BUYER, "buyerBond"],
    ] as const)("a sub-order: %s is shown the SDK's calculateBonds over the running total and the payment", async (_who, wallet, bond) => {
        m.address = wallet;
        // Earlier orders of the process committed 2000; this one pays 1000, so its running total is 3000.
        const p = payload({ processId: `0x${"5b".repeat(32)}` as Hex, runningTotal: 3000n });
        const awaiting: CommitmentPayload = wallet === BUYER ? { ...p, buyerSig: undefined, sellerSig: `0x${"33".repeat(65)}` as Hex } : p;
        m.search = `payload=${encodeURIComponent(serializeCommitmentPayload(awaiting))}`;
        render(<SignPage />);
        await flush();
        const bonds = calculateBonds(3000n, 1000n);
        expect(bonds.sellerBond).not.toBe(bonds.buyerBond);
        expect(screen.getByTestId("sign-my-bond").textContent).toBe(`${tokenFigure(bonds[bond], 6)} TKN`);
    });

    it("counter-signs the parsed order with no funding leg", async () => {
        await reviewing();
        await act(async () => { fireEvent.click(screen.getByTestId("btn-counter-sign")); });
        expect(m.flow.acceptOrder).toHaveBeenCalledWith(expect.objectContaining({ commitment: expect.objectContaining({ seller: SELLER }) }), undefined, { relay: null });
    });

    it("counter-signs with the chosen funding token's leg once it is authorized", async () => {
        m.swap = { fundingToken: FUNDING_TOKEN, authorization: "ready" };
        await reviewing();
        await act(async () => { fireEvent.click(screen.getByTestId("btn-counter-sign")); });
        // Untouched, the margin is the venue's own, and the leg is quoted with it.
        expect(m.flow.acceptOrder).toHaveBeenCalledWith(expect.anything(), { inputToken: FUNDING_TOKEN, slippageBps: 100 }, { relay: null });
    });

    it("counter-signs with the slippage margin the seller set in the chooser", async () => {
        m.swap = { fundingToken: FUNDING_TOKEN, authorization: "ready" };
        m.marginText = "2.5";
        await reviewing();
        await act(async () => { fireEvent.click(screen.getByTestId("btn-counter-sign")); });
        expect(m.flow.acceptOrder).toHaveBeenCalledWith(expect.anything(), { inputToken: FUNDING_TOKEN, slippageBps: 250 }, { relay: null });
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

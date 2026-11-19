/**
 * PrivateFilingsPanel — the private filings of one order, delivered by the
 * receiver's request over the mock channel, with real wallet signatures and
 * real sealing.
 *
 * The buyer's page shows a filing of the seller whose content it does not
 * hold, and offers one control: it asks. The seller's page, with that
 * request present and copies kept for the order, offers one control that
 * says how many it sends. The buyer's page unseals, checks each entry
 * against the chain, keeps what passes in the store every reader reads, and
 * the comparison of filings shows the values with no blinding value. A third
 * wallet sees nothing, its request moves no one, and a payload it seals is
 * refused. The two browsers are one jsdom: the seller's kept copies are
 * removed before the buyer's page opens, as on another device.
 */
import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { keccak256, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";

const SELLER_ACCOUNT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const BUYER_ACCOUNT = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const THIRD_ACCOUNT = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
const SELLER = SELLER_ACCOUNT.address;
const BUYER = BUYER_ACCOUNT.address;
const THIRD = THIRD_ACCOUNT.address;
/** The two parties as holders of kept copies, on the chain the page shows (31337 below). */
const AS_SELLER = { address: SELLER, chainId: 31337 };
const AS_BUYER = { address: BUYER, chainId: 31337 };

/** The wallet connected in the page under render. */
let connected: PrivateKeyAccount | undefined;
/** The attestations the chain holds, as the indexer returns them. */
let chain: Array<{ orderHash: string; clauseId: string; stage: number; attester: string; contentRef: string; blockNumber: number; universe: "direct" | "batch" }> = [];

vi.mock("wagmi", () => {
    // One client for the page's life, as wagmi returns it.
    const publicClient = {};
    return {
        useAccount: () => ({ address: connected?.address }),
        useWalletClient: () => ({ data: connected ? { signMessage: ({ message }: { message: string }) => connected!.signMessage({ message }) } : undefined }),
        useChainId: () => 31337,
        usePublicClient: () => publicClient,
    };
});
vi.mock("@/lib/handoff/channel", async () => {
    const { createMockChannel } = await import("@/lib/handoff/mockChannel");
    return { getHandoffChannel: async (address: string) => createMockChannel(address) };
});
vi.mock("@/lib/composition/indexer", () => ({
    getAttestationsByOrder: async (_c: unknown, _id: number, orderHash: string) =>
        chain.filter((row) => row.orderHash.toLowerCase() === orderHash.toLowerCase()),
}));
vi.mock("@/lib/composition/useAttestationCoordinatorActions", () => ({
    useAttestationCoordinatorActions: () => ({ submitAttestation: vi.fn() }),
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));

import { PrivateFilingsPanel } from "@/components/runtime/PrivateFilingsPanel";
import { StageAttestationComparison } from "@/components/runtime/StageAttestationComparison";
import { createMockChannel } from "@/lib/handoff/mockChannel";
import { requestPrivateFilings, sendPrivateFilings, filingsCeremonyId } from "@/lib/handoff/privateFilings";
import { KEPT_WITNESS_STORAGE_KEY, keepPrivateWitnessContent, readHeldWitness } from "@/lib/composition/witnessContent";
import type { RuntimeAttestation } from "@/lib/composition/indexer";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

const READING_FIELDS = [
    { name: "reading", type: "string", required: true, disposition: "private", label: "Reading" },
    { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
];

/** A clause no file in `clauses/` holds: assembly-scoped, two private
 *  witness stages, registered by no one but this test. */
const PRIVATE = pinSpec({
    clauseId: "test-private-filings-panel",
    version: 1,
    title: "Private readings",
    description: "Two private witness stages.",
    fields: [{ name: "note", type: "string", required: true, minLength: 1, maxLength: 140, label: "Note" }],
    stages: { "1": READING_FIELDS, "2": READING_FIELDS },
    block: {
        design: { article: "test-article", scope: "assembly", nestsUnder: null, fills: ["note"], composes: null },
        checkout: { catalogueFills: [], profileFills: [] },
        runtime: { interaction: null, fields: [] },
    },
});

const BLINDING_1 = `0x${"b1".repeat(32)}` as Hex;
const BLINDING_2 = `0x${"b2".repeat(32)}` as Hex;

beforeAll(async () => {
    setClauseSpecFetcher(async () => PRIVATE.bytes);
    await loadClauseSpec(PRIVATE.clauseKey, "mem://test-private-filings-panel");
});

let orderSeq = 0;
/** A fresh order per test, so no message of another test is replayed. */
function freshOrder(): Hex {
    orderSeq += 1;
    return `0x${orderSeq.toString(16).padStart(64, "0")}` as Hex;
}

function sellerFiling(orderHash: Hex, stage: number, reading: string, blinding: Hex) {
    const content = encodeContentFromSpec(getClauseSpec(PRIVATE.clauseKey)!, { reading, blinding }, { stage });
    const event: RuntimeAttestation = {
        orderHash, clauseId: PRIVATE.clauseKey, stage, attester: SELLER, contentRef: keccak256(content), blockNumber: 10 + stage, universe: "direct",
    };
    return { content, event };
}

function setup() {
    const order = freshOrder();
    const one = sellerFiling(order, 1, "41.2", BLINDING_1);
    const two = sellerFiling(order, 2, "39.8", BLINDING_2);
    return { order, one, two, events: [one.event, two.event] };
}

/** The seller's browser keeps its two filings, as the submitter does. */
function sellerKeeps(order: Hex, ...filings: Array<{ content: Hex; event: RuntimeAttestation }>) {
    for (const f of filings) keepPrivateWitnessContent(AS_SELLER, { orderHash: order, clauseId: f.event.clauseId, stage: f.event.stage, content: f.content });
}

/** Another device: the seller's kept copies are not in the buyer's browser. */
function leaveSellerBrowser() {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith(KEPT_WITNESS_STORAGE_KEY)) window.localStorage.removeItem(key);
}

function renderAs(account: PrivateKeyAccount | undefined, order: Hex, events: readonly RuntimeAttestation[], onKept?: () => void) {
    connected = account;
    return render(<PrivateFilingsPanel orderHash={order} buyer={BUYER} seller={SELLER} attestations={events} onKept={onKept} />);
}

async function buyerRequests(order: Hex, events: readonly RuntimeAttestation[]) {
    renderAs(BUYER_ACCOUNT, order, events);
    const request = await screen.findByTestId("private-filings-request");
    expect(request.textContent).toContain("Request the private filings");
    expect(screen.getByTestId("private-filings-wallet-note").textContent).toMatch(/wallet signs/i);
    await waitFor(() => expect((request as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(request); });
    await waitFor(() => expect(screen.getByTestId("private-filings-request").textContent).toMatch(/waiting for the seller/i));
    cleanup();
}

async function sellerSends(order: Hex, events: readonly RuntimeAttestation[], count: number) {
    renderAs(SELLER_ACCOUNT, order, events);
    const send = await screen.findByTestId("private-filings-send");
    expect(send.textContent).toContain(`Send the private filings (${count})`);
    await act(async () => { fireEvent.click(send); });
    await screen.findByTestId("private-filings-sent");
    cleanup();
}

beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.__FIGARO_COORDINATION_MOCK__ = undefined;
    connected = undefined;
    chain = [];
});

describe("the private filings of one order", () => {
    it("round trip: the buyer asks, the seller sends two, the buyer keeps both and the comparison shows them with no blinding value", async () => {
        const { order, one, two, events } = setup();
        chain = [...events];
        await buyerRequests(order, events);

        sellerKeeps(order, one, two);
        await sellerSends(order, events, 2);
        leaveSellerBrowser();

        const onKept = vi.fn();
        renderAs(BUYER_ACCOUNT, order, events, onKept);
        await waitFor(() => expect(screen.getByTestId("private-filings-kept").textContent).toContain("Kept 2 private filings"), { timeout: 5000 });
        expect(onKept).toHaveBeenCalled();
        // Nothing left to ask for.
        expect(screen.queryByTestId("private-filings-request")).toBeNull();
        for (const f of [one, two]) {
            const held = readHeldWitness(AS_BUYER, f.event);
            expect(held?.content).toBe(f.content);
            expect(held?.received).toBe(true);
        }
        cleanup();

        const { container } = render(<StageAttestationComparison attestations={events} />);
        await waitFor(() => expect(container.textContent).toContain("41.2"));
        expect(container.textContent).toContain("39.8");
        expect(container.innerHTML).not.toContain("b1b1b1");
        expect(container.innerHTML).not.toContain("b2b2b2");
    });

    it("an entry whose attestation is not on the chain is kept only once the event appears", async () => {
        const { order, one, two, events } = setup();
        chain = [one.event];
        await buyerRequests(order, events);
        sellerKeeps(order, one, two);
        await sellerSends(order, events, 2);
        leaveSellerBrowser();

        renderAs(BUYER_ACCOUNT, order, events);
        await waitFor(() => expect(screen.getByTestId("private-filings-kept").textContent).toContain("Kept 1 private filing"), { timeout: 5000 });
        expect(screen.getByTestId("private-filings-pending").textContent).toContain("1 waiting");
        expect(readHeldWitness(AS_BUYER, one.event)?.content).toBe(one.content);
        expect(readHeldWitness(AS_BUYER, two.event)).toBeNull();

        chain = [one.event, two.event];
        await waitFor(() => expect(screen.getByTestId("private-filings-kept").textContent).toContain("Kept 2 private filings"), { timeout: 8000 });
        expect(readHeldWitness(AS_BUYER, two.event)?.content).toBe(two.content);
    }, 15000);

    it("a sender that is not the order's counterparty is refused: nothing it seals is kept", async () => {
        const { order, one, two, events } = setup();
        chain = [...events];
        await buyerRequests(order, events);

        // A third wallet replays the seller's filings, sealed to the buyer's key.
        const channel = createMockChannel(THIRD);
        const buyerKeyMsg = window.__FIGARO_COORDINATION_MOCK__!.messages.find(
            (m) => m.type === "ECDH_PUBKEY" && m.orderId === filingsCeremonyId(order),
        ) as { pubKeyHex: string };
        await sendPrivateFilings(channel, {
            myAddress: THIRD, recipientAddress: BUYER, orderId: order, recipientPubKeyHex: buyerKeyMsg.pubKeyHex,
            filings: [one, two].map((f) => ({ orderHash: order, clauseId: f.event.clauseId as Hex, stage: f.event.stage, contentRef: f.event.contentRef as Hex, content: f.content })),
            signAuth: (message) => THIRD_ACCOUNT.signMessage({ message }),
        });

        renderAs(BUYER_ACCOUNT, order, events);
        await screen.findByTestId("private-filings-request");
        await new Promise((r) => setTimeout(r, 300));
        expect(screen.queryByTestId("private-filings-kept")).toBeNull();
        expect(readHeldWitness(AS_BUYER, one.event)).toBeNull();
        expect(readHeldWitness(AS_BUYER, two.event)).toBeNull();
    });

    it("a message that names the seller as its sender but is signed by a third wallet is refused", async () => {
        const { order, one, two, events } = setup();
        chain = [...events];
        await buyerRequests(order, events);

        const buyerKeyMsg = window.__FIGARO_COORDINATION_MOCK__!.messages.find(
            (m) => m.type === "ECDH_PUBKEY" && m.orderId === filingsCeremonyId(order),
        ) as { pubKeyHex: string };
        // The third wallet claims the seller's address and signs with its own key.
        await sendPrivateFilings(createMockChannel(THIRD), {
            myAddress: SELLER, recipientAddress: BUYER, orderId: order, recipientPubKeyHex: buyerKeyMsg.pubKeyHex,
            filings: [one, two].map((f) => ({ orderHash: order, clauseId: f.event.clauseId as Hex, stage: f.event.stage, contentRef: f.event.contentRef as Hex, content: f.content })),
            signAuth: (message) => THIRD_ACCOUNT.signMessage({ message }),
        });

        renderAs(BUYER_ACCOUNT, order, events);
        await screen.findByTestId("private-filings-request");
        await new Promise((r) => setTimeout(r, 300));
        expect(screen.queryByTestId("private-filings-received")).toBeNull();
        expect(readHeldWitness(AS_BUYER, one.event)).toBeNull();
        expect(readHeldWitness(AS_BUYER, two.event)).toBeNull();
    });

    it("a duplicated tab, whose session storage the browser copied with the temporary key, can send the request again and receives the filings", async () => {
        const { order, one, two, events } = setup();
        chain = [...events];
        await buyerRequests(order, events);

        // The duplicate: the same session storage, a page that sent nothing.
        renderAs(BUYER_ACCOUNT, order, events);
        const again = await screen.findByTestId("private-filings-request");
        await waitFor(() => expect((again as HTMLButtonElement).disabled).toBe(false));
        expect(again.textContent).toMatch(/Request again/);
        await act(async () => { fireEvent.click(again); });
        await waitFor(() => expect((screen.getByTestId("private-filings-request") as HTMLButtonElement).disabled).toBe(true));
        expect(screen.getByTestId("private-filings-request").textContent).toMatch(/waiting for the seller$/i);
        cleanup();

        sellerKeeps(order, one, two);
        await sellerSends(order, events, 2);
        leaveSellerBrowser();
        renderAs(BUYER_ACCOUNT, order, events);
        await waitFor(() => expect(screen.getByTestId("private-filings-kept").textContent).toContain("Kept 2 private filings"), { timeout: 5000 });
    });

    it("the send control says what the key's offer is: a request, or the counterparty's own send", async () => {
        const { order, one, two, events } = setup();
        await buyerRequests(order, events);
        sellerKeeps(order, one, two);
        renderAs(SELLER_ACCOUNT, order, events);
        await screen.findByTestId("private-filings-send");
        expect(screen.getByTestId("private-filings-panel").textContent).toContain("by asking for your private filings or by sending its own");
    });

    it("a request from a third wallet gets no send control on the attester's page", async () => {
        const { order, one, two, events } = setup();
        await requestPrivateFilings(createMockChannel(THIRD), {
            myAddress: THIRD, recipientAddress: SELLER, orderId: order, signAuth: (message) => THIRD_ACCOUNT.signMessage({ message }),
        });
        sellerKeeps(order, one, two);
        renderAs(SELLER_ACCOUNT, order, events);
        await new Promise((r) => setTimeout(r, 300));
        expect(screen.queryByTestId("private-filings-send")).toBeNull();
    });

    it("a wallet that is no party to the order sees no request control and no private content", async () => {
        const { order, events } = setup();
        const { container } = renderAs(THIRD_ACCOUNT, order, events);
        await new Promise((r) => setTimeout(r, 100));
        expect(container.innerHTML).toBe("");
    });

    it("with no wallet connected the panel shows nothing; the page reads without it", async () => {
        const { order, events } = setup();
        const { container } = renderAs(undefined, order, events);
        await new Promise((r) => setTimeout(r, 100));
        expect(container.innerHTML).toBe("");
    });
});

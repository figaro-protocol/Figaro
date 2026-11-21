"use client";

/**
 * orderCommitmentFlow.ts — the SIGN step of the order flow (+ share / commit).
 *
 * Preview and APPROVE happen first and TOGETHER, OUTSIDE this hook: the page
 * builds the preview (the SDK walk (assemblyCheckout)) and approves the bond via
 * `useTokenApproval`, wired beside the preview so the approval can never be
 * forgotten. This hook owns only the deliberate SIGN step that follows, plus
 * the share / commit it leads into:
 *
 *   buyer:  signAndShare(preview) → sign → relay to the seller
 *   seller: acceptOrder(payload)  → sign → [beforeBroadcast] → broadcast on-chain
 *   either: commitOrder(signed)   → confirm → [beforeBroadcast] → broadcast on-chain
 *
 * Every seller accept path — `acceptOrder`, `counterSignAndReturn`,
 * `quoteAndReturn` — first reads the seller's OWN profile (MembersRegistry →
 * metadataURI → IPFS, at accept time) and refuses an order under an
 * assembly that profile does not bind, or one naming no assembly
 * (`checkSellerBindsProcess`).
 *
 * It owns the EIP-712 domain and the confirm gate — before every sign, and
 * before the standalone commit broadcast (`commitOrder`). It does NOT approve
 * — that is `useTokenApproval`'s job, wired beside the preview.
 */
import { useCallback, useState } from "react";
import {
    useAccount,
    useChainId,
    usePublicClient,
    useWalletClient,
    useSignTypedData,
} from "wagmi";
import {
    COMMITMENT_TYPES,
    buildDomain,
    calculateBonds,
    checkSellerBindsProcess,
    computeCheckoutHash,
    followedOrderIssues,
    hashCommitmentStruct,
    type ResolutionUniverse,
    type Agreement,
    type Commitment,
    type Hex,
    type SwapFundingLeg,
    type FollowedOrderRead,
} from "@figaro-protocol/sdk";
import { CONTRACTS } from "@/lib/core/contracts";
import { CLAUSE_REGISTRY_ABI, REGISTRY_CONTRACTS } from "@/lib/registries/contracts";
import { cachedGetContractEvents } from "@/lib/core/eventCache";
import { getCoreEvents, processPath } from "@/lib/core/indexer";
import { fetchAgreement } from "@/lib/core/agreementFetch";
import { assertAgreementSignable, type HydratedProcessDesign } from "@figaro-protocol/sdk";
import { specSource, getClauseSpec, loadClauseSpec } from "@/lib/shared/clauseSpecSource";
import { fetchHydratedAssemblyByHash } from "@/lib/registries/useProcessRegistry";
import { useFigaroActions } from "@/lib/core/useFigaroActions";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { hexEqual, isValidAddress, ZERO_ADDRESS, ZERO_PROCESS_ID } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { PartyRole } from "@/lib/core/walletProcessQueries";
import {
    requestSignConfirmation,
    requestCommitConfirmation,
    type OrderPreview,
    type SwapConfirmationDetails,
} from "@/lib/checkout/orderPreview";
import { shareSignedOrder } from "@/lib/checkout/orderSignedAndShared";
import { relayCommitmentPayload } from "@/lib/data/handoff/relayChannel";
import { buildCounterDraft, validateDraft, type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { commitSignedOrder } from "@/lib/core/orderCommitted";
import { commitmentOrderHash, pathContract } from "@/lib/core/signedCommitment";
import { signedPath } from "@/lib/core/relayTransport";
import { payloadPath } from "@/lib/checkout/pathChoice";
import { commitThroughRelay, type KnownRelay, type RelayReceipt } from "@/lib/core/useRelayActions";
import { quoteFundingLeg, signFundingLeg, type FundingQuote, type QuoteFundingLegArgs } from "@/lib/composability/swapFunding";
import { useSwapAndCommitActions } from "@/lib/composability/useSwapAndCommitActions";
import { profileReaderForChain } from "@/lib/registries/profileFetcher";

/** The buyer's checkout-time choice to fund their bond by swap: which
 *  accepted token to fund from. Threaded through the sign step so EVERY
 *  payload the checkout produces (root and sub-orders alike) carries its own
 *  witness-signed leg. */
export interface BuyerFundingRequest {
    inputToken: Hex;
    /** The slippage margin the buyer set in the funding-token chooser, in
     *  basis points; absent, the venue's own. */
    slippageBps?: number;
    /** What the party has authorized Permit2 to pull of the funding token
     *  (its allowance, in that token's units). A fresh quote whose cap exceeds
     *  it is refused before the wallet opens: the price moved since the party
     *  authorized, and the commit would revert at Permit2. */
    approvedInput?: bigint;
    /** Each order's leg of one checkout, quoted before its first signature
     *  (`quoteBuyerFunding`), by the hash of the order's commitment struct.
     *  Each swap pulls its whole cap through Permit2
     *  (`WitnessSwapAndCommitCoordinator._fund`), one commit after another,
     *  so the allowance covers the caps together, and the sum was checked
     *  against `approvedInput` before anything was signed. A sign takes its
     *  order's quote from here and quotes nothing; an order missing from it
     *  is refused. */
    legs?: ReadonlyMap<Hex, FundingQuote>;
}

/** The seller's accept-time choice to fund their bond by swap: which token
 *  to on-ramp from into the process denomination. Built and witness-signed
 *  at accept, riding the same atomic `swapAndCommit`. */
export interface SellerFundingRequest {
    inputToken: Hex;
    /** The slippage margin the seller set in the funding-token chooser, in
     *  basis points; absent, the venue's own. */
    slippageBps?: number;
    /** What the party has authorized Permit2 to pull of the funding token
     *  (its allowance, in that token's units). A fresh quote whose cap exceeds
     *  it is refused before the wallet opens: the price moved since the party
     *  authorized, and the commit would revert at Permit2. */
    approvedInput?: bigint;
}

export type OrderFlowStep =
    | "idle"
    | "signing"
    | "sharing"
    | "awaiting-seller"
    /** A race candidate countersigned an unsigned draft and returned it — now
     *  awaiting the buyer's selection (the buyer signs exactly one winner). */
    | "awaiting-buyer"
    | "committing"
    | "done"
    | "error";

/** Project a funding quote to the confirm-gate's swap summary, with the
 *  signing party whose balance the modal reads (null passes through — no
 *  swap leg, no swap clause in the modal). */
function swapDetails(
    quote: { inputToken: string; currency: string; maxInput: bigint; slippageBps: number } | null,
    party: string,
): SwapConfirmationDetails | null {
    if (!quote) return null;
    return { inputToken: quote.inputToken, currency: quote.currency, maxInput: quote.maxInput, slippageBps: quote.slippageBps, party };
}

/** The legs already signed that a payload carries to the broadcast — today
 *  the buyer's relayed leg — projected for the confirm. The broadcast takes
 *  its legs from the same payload field (`broadcasterFor`), so the confirm
 *  shows every leg the send carries. A leg carries no margin: it is no
 *  witness field. */
function carriedSwapDetails(payload: CommitmentPayload): SwapConfirmationDetails[] {
    const leg = payload.buyerFunding;
    if (!leg?.enabled) return [];
    return [{ inputToken: leg.inputToken, currency: payload.commitment.token, maxInput: leg.maxInput, party: payload.commitment.buyer }];
}

/** Quote one party's swap-funded bond leg for `commitment`: the venue quote
 *  and exact route for the party's FigaroCore pull, no signature yet.
 *  calculateBonds(runningTotal, payment) — the buyer bond is 2×payment,
 *  the seller bond 2×runningTotal; on a SUB-ORDER ecv ≠ payment,
 *  so the arg order is load-bearing (a swap here mis-quotes the FigaroCore's
 *  pull and swapAndCommit reverts at simulate). */
function quoteBondFundingLeg(
    publicClient: QuoteFundingLegArgs["publicClient"] | undefined,
    chainId: number,
    funding: BuyerFundingRequest | SellerFundingRequest,
    commitment: Commitment,
    party: PartyRole,
): Promise<FundingQuote> {
    if (!publicClient) throw new Error("No chain connection — cannot quote the funding swap.");
    const bonds = calculateBonds(commitment.runningTotal, commitment.payment);
    return quoteFundingLeg({
        publicClient,
        chainId,
        inputToken: funding.inputToken,
        currency: commitment.token as Hex,
        bondAmount: party === "buyer" ? bonds.buyerBond : bonds.sellerBond,
        deadline: commitment.commitDeadline,
        slippageBps: funding.slippageBps,
    }).then((quote) => {
        if (funding.approvedInput !== undefined && quote.maxInput > funding.approvedInput) {
            throw new Error("The swap's maximum input is above what you authorized. Authorize the funding token for the new maximum.");
        }
        return quote;
    });
}

/** The quote `quoteBuyerFunding` made for this order. An order the checkout
 *  did not quote with the others is refused: its cap was never counted
 *  against the allowance. */
function quotedLeg(legs: ReadonlyMap<Hex, FundingQuote>, commitment: Commitment): FundingQuote {
    const quote = legs.get(hashCommitmentStruct(commitment));
    if (!quote) throw new Error("This order's swap was not quoted with the checkout's other orders, so its maximum input was not counted against what you authorized.");
    return quote;
}

function assertSigningDomain(core: string | undefined, chainId: number): asserts core is `0x${string}` {
    if (!core || core === ZERO_ADDRESS || !isValidAddress(core)) {
        throw new Error(
            "Refusing to sign: FigaroCore address is missing or invalid. " +
            "Check NEXT_PUBLIC_FIGARO_CORE in your environment.",
        );
    }
    if (!chainId) {
        throw new Error("Refusing to sign: no chain detected. Connect a wallet first.");
    }
}

/** The design the agreement names in its provenance leaf, read from the
 *  chain and IPFS and verified against its assembly root and every
 *  registered agreement's hash — the input the sign gate checks the
 *  designer's values against. Null when the agreement names none or the read
 *  fails; the gate then refuses an agreement naming a design (fail-closed:
 *  an agreement it cannot fetch or verify is never signed or broadcast). */
async function readSigningDesign(agreement: Agreement): Promise<HydratedProcessDesign | null> {
    const provenance = agreement.provenance;
    if (!provenance) return null;
    try {
        return await fetchHydratedAssemblyByHash(provenance.processDesignHash);
    } catch {
        return null;
    }
}

/** The specs of the agreement's clauses, resolved through `ClauseRegistry`
 *  before the sign gate runs: every clause key the cache does not hold is
 *  looked up among the registry's registrations and its pinned spec loaded.
 *  The gate refuses a clause whose spec is still not loaded (the maintainer's
 *  ruling: a sign gate refuses what it cannot read), so a key no registry holds
 *  is never signed, and a key the cache merely had not warmed yet is. A read
 *  that fails loads nothing and leaves the refusal to the gate. */
async function readSigningSpecs(agreement: Agreement, client: { getBlockNumber?: unknown } | undefined, chainId: number): Promise<void> {
    const missing = agreement.clauses.map((c) => c.clause).filter((key) => getClauseSpec(key) === undefined);
    if (missing.length === 0 || !client) return;
    const registry = REGISTRY_CONTRACTS.clauseRegistry;
    if (!registry) return;
    let rows: { args?: { clauseKey?: `0x${string}`; contentURI?: string; registeredBy?: `0x${string}` } }[] = [];
    try {
        rows = await cachedGetContractEvents(client as Parameters<typeof cachedGetContractEvents>[0], chainId, {
            address: registry as `0x${string}`, abi: CLAUSE_REGISTRY_ABI, eventName: "ClauseRegistered",
        }) as typeof rows;
    } catch {
        return;
    }
    for (const key of missing) {
        const row = rows.find((r) => hexEqual(String(r.args?.clauseKey ?? ""), key));
        if (!row?.args?.contentURI) continue;
        try { await loadClauseSpec(key as `0x${string}`, row.args.contentURI); } catch { /* the gate refuses an unloaded spec */ }
    }
}

/** The counter-signer's own read of each order the agreement's topology leaf
 *  names (`FollowedOrderRead`): the process the chain holds it in
 *  (`OrderCommitted`, from every order emitter, so both paths), and its
 *  agreement — the one the payload carries (`CommitmentPayload.followed`)
 *  or this wallet witnessed (`fetchAgreement`), taken only when its merkle
 *  root equals the `checkoutHash` the chain holds. An order the chain does
 *  not hold is left out; an agreement not read is null. A failed chain
 *  read reads nothing, and `followedOrderIssues` then refuses every edge. */
export async function readFollowedOrders(
    payload: Pick<CommitmentPayload, "agreement" | "followed">,
    client: { getBlockNumber?: unknown } | undefined,
    chainId: number,
): Promise<FollowedOrderRead[]> {
    const follows = payload.agreement.follows;
    if (!Array.isArray(follows) || follows.length === 0 || !client) return [];
    let committed: { orderHash: Hex; processId: Hex; checkoutHash: Hex }[];
    try {
        committed = (await getCoreEvents(client as Parameters<typeof getCoreEvents>[0], chainId)).events.orderCommitted;
    } catch {
        return [];
    }
    const carriedRoot = (a: Agreement): Hex | null => {
        try { return computeCheckoutHash(a); } catch { return null; }
    };
    const reads: FollowedOrderRead[] = [];
    for (const edge of follows) {
        const event = committed.find((e) => hexEqual(e.orderHash, edge));
        if (!event) continue;
        let agreement: Agreement | null = payload.followed?.find((a) => {
            const root = carriedRoot(a);
            return root !== null && hexEqual(root, event.checkoutHash);
        }) ?? null;
        if (agreement === null) {
            const fetched = await fetchAgreement(event.checkoutHash);
            agreement = fetched.status === "present" ? fetched.value : null;
        }
        reads.push({ orderHash: event.orderHash, processId: event.processId, agreement });
    }
    return reads;
}

/** What the sign gate reads before it judges an agreement: its clause specs,
 *  resolved through `ClauseRegistry` into the cache (`readSigningSpecs`),
 *  then the design its provenance leaf names (`readSigningDesign`). Every
 *  sign, the commit broadcast and the `/sign` review call this one read, so
 *  the review's verdict is the one the action's gate would give. Returns the
 *  design, null when none is named or it could not be read; a spec that
 *  cannot be loaded stays unloaded, and the gate refuses its clause. */
export async function readSigningInputs(
    agreement: Agreement,
    client: { getBlockNumber?: unknown } | undefined,
    chainId: number,
): Promise<HydratedProcessDesign | null> {
    await readSigningSpecs(agreement, client, chainId);
    return readSigningDesign(agreement);
}

export function useOrderCommitmentFlow() {
    const { address } = useAccount();
    // The page's chain, never the wallet's: wagmi's config lists one chain
    // (`lib/shared/wagmi.ts`), so `useChainId()` is always `activeChain.id`.
    // It is the `chainId` of every EIP-712 domain this flow signs (the
    // commitment's and, through the quote, the Permit2 swap witness's), and
    // wagmi's `signTypedData` takes no `chainId` of its own, so the domain is
    // what binds a signature to the page's chain. Never build a domain from
    // the wallet's chain (`useConnection().chainId`).
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const { signTypedDataAsync } = useSignTypedData();
    const { commit } = useFigaroActions();
    const { swapAndCommit } = useSwapAndCommitActions();
    const services = useRuntimeServices();

    const [step, setStep] = useState<OrderFlowStep>("idle");
    const [error, setError] = useState<string | null>(null);
    // What a relay answered for the last commit sent on the batch path: the
    // order is with the relay, not yet on the chain.
    const [relayReceipt, setRelayReceipt] = useState<RelayReceipt | null>(null);

    const reset = useCallback(() => {
        setStep("idle");
        setError(null);
        setRelayReceipt(null);
    }, []);

    /**
     * Refuse, before anything is signed, an order on a path it cannot be
     * committed on: a sub-order whose process the chain holds on the other
     * path (the two paths share no state, so the other path's contract
     * refuses it); a swap-funded bond on the batch path (the swap
     * coordinator commits through FigaroCore); and a batch-path order with
     * no relay that passed the check against the chain.
     */
    const assertPathAccepted = useCallback(async (
        commitment: Commitment,
        path: ResolutionUniverse,
        swapFunded: boolean,
        relay: KnownRelay | null | undefined,
    ): Promise<void> => {
        if (!hexEqual(commitment.processId, ZERO_PROCESS_ID)) {
            // A read that fails decides nothing here: the path's contract,
            // or the relay's door, refuses a process it does not hold.
            const held = await processPath(publicClient, chainId, commitment.processId).catch(() => null);
            if (held && held !== path) {
                throw new Error(`This order joins a process the chain holds on the ${held} path, and it was signed for the ${path} path. A process continues on the path it started on.`);
            }
        }
        if (path === "batch" && swapFunded) {
            throw new Error("A bond funded by a swap is committed through FigaroCore, so it is offered on the direct path alone.");
        }
        if (path === "batch" && !relay) {
            throw new Error("This order is signed for the batch path, and no relay that passes the check against this deployment's batch verifier is known, so nothing was signed or sent. Name a relay, or ask for the order on the direct path.");
        }
    }, [publicClient, chainId]);

    /** Every act of the flow runs through here: the previous error clears; a
     *  throw records its message (`fallback` when it carries none), moves the
     *  flow to "error" and rethrows to the caller. */
    const runStep = useCallback(async <T,>(fallback: string, act: () => Promise<T>): Promise<T> => {
        setError(null);
        try {
            return await act();
        } catch (e: unknown) {
            setError(extractErrorMessage(e, fallback));
            setStep("error");
            throw e;
        }
    }, []);

    /** Witness-sign a quoted funding leg with the connected wallet, bound to
     *  the one commitment it pays the bond of and the party's role in it. */
    const signLeg = useCallback(
        (quote: FundingQuote, commitment: Commitment, role: PartyRole) =>
            signFundingLeg(quote, { commitment, role }, (typedData) => signTypedDataAsync(typedData) as Promise<Hex>),
        [signTypedDataAsync],
    );

    // ── Sign a commitment (gated by the confirm preview) ──
    // Under the path's domain: FigaroCore's on the direct path, the batch
    // verifier's on the batch path (`pathContract`). The domain's
    // verifying contract is what the wallet's prompt names.
    const signAs = useCallback(async (
        commitment: Commitment,
        agreement: Agreement,
        swap: SwapConfirmationDetails | null = null,
        carriedSwaps: readonly SwapConfirmationDetails[] = [],
        path: ResolutionUniverse = "direct",
    ): Promise<Hex> => {
        const verifyingContract = pathContract(path);
        assertSigningDomain(verifyingContract, chainId);
        // The agreement's specs first: a key the cache had not warmed is read
        // through the registry; a key no registry holds stays unloaded and the
        // gate below refuses it. Then the design it names.
        const design = await readSigningInputs(agreement, publicClient, chainId);
        // Off-chain validation — the FULL gate at the sign step, so no caller can bypass
        // it: every clause conforms to its clause spec AND the agreement's
        // recomputed merkle root equals the hash being signed. The /orders
        // accept card, /sign, and the buyer's checkout sign all route through
        // here — both sides of the bilateral commit get the same check. The
        // design the agreement names is read and verified here, so the
        // designer's values are checked against it.
        assertAgreementSignable(agreement, commitment.checkoutHash, specSource(), commitment, design);
        // When the bond is swap-funded, `swap` surfaces the leg's maxInput in
        // the SAME confirm — one approval covers the commitment sign AND the
        // Permit2 witness sign the caller does right after. `carriedSwaps`
        // shows every leg already signed that the caller's send carries.
        const approved = await requestSignConfirmation(commitment, agreement, swap, carriedSwaps);
        if (!approved) throw new Error("Signing canceled by user.");
        const sig = await signTypedDataAsync({
            domain: buildDomain(chainId, verifyingContract),
            types: COMMITMENT_TYPES,
            primaryType: "Commitment",
            message: {
                processId: commitment.processId,
                buyer: commitment.buyer,
                seller: commitment.seller,
                token: commitment.token,
                payment: commitment.payment,
                runningTotal: commitment.runningTotal,
                checkoutHash: commitment.checkoutHash,
                salt: commitment.salt,
                commitDeadline: commitment.commitDeadline,
            },
        });
        return sig as Hex;
    }, [chainId, signTypedDataAsync, publicClient]);

    /**
     * BUYER side: sign the previewed order WITHOUT relaying it. Returns the
     * signed payload so the caller chooses the transport (the share panel's
     * XMTP / QR / copy). The sign goes through the SAME confirm gate as every
     * other order — there is no bypass. The bond is already approved (the page
     * gated this on the approval flow before calling).
     */
    const signCommitment = useCallback(async (
        preview: OrderPreview,
        funding?: BuyerFundingRequest,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        return runStep("Order failed", async () => {
            // The path the buyer picked at checkout; the direct path where
            // none was picked. A swap-funded bond is the direct path's alone
            // (`WitnessSwapAndCommitCoordinator` commits through FigaroCore).
            const path = preview.path ?? "direct";
            if (path === "batch" && funding) {
                throw new Error("A bond funded by a swap is committed through FigaroCore, so it is offered on the direct path alone.");
            }
            setStep("signing");
            // The buyer's optional swap-funded bond leg is QUOTED before the
            // sign so its maxInput rides into the SAME confirm as the agreement
            // (one approval, both signatures); it is then witness-signed against
            // that exact quote so the relayer is untrusted by construction. A
            // checkout's legs were quoted together before its first signature
            // (`quoteBuyerFunding`): this order's quote is taken from them.
            const fundingQuote = !funding ? null
                : funding.legs ? quotedLeg(funding.legs, preview.commitment)
                : await quoteBondFundingLeg(publicClient, chainId, funding, preview.commitment, "buyer");
            const buyerSig = await signAs(preview.commitment, preview.agreement, swapDetails(fundingQuote, preview.commitment.buyer), [], path);
            const buyerFunding: CommitmentPayload["buyerFunding"] = fundingQuote ? await signLeg(fundingQuote, preview.commitment, "buyer") : undefined;
            setStep("awaiting-seller");
            return {
                commitment: preview.commitment,
                agreement: preview.agreement,
                buyerSig,
                ...(buyerFunding ? { buyerFunding } : {}),
            };
        });
    }, [address, signAs, publicClient, chainId, runStep, signLeg]);

    /**
     * BUYER side: quote the swap leg of every order of one checkout before
     * its first signature. Each swap pulls its own whole cap through Permit2
     * from the one allowance, so the caps are summed and checked against
     * `approvedInput` together; a sum above it is refused here, with nothing
     * signed. Returns the request carrying each order's quote (`legs`), which
     * every sign of the checkout then takes.
     */
    const quoteBuyerFunding = useCallback(async (
        previews: readonly OrderPreview[],
        funding: BuyerFundingRequest,
    ): Promise<BuyerFundingRequest> => {
        const legs = new Map<Hex, FundingQuote>();
        let total = 0n;
        for (const preview of previews) {
            const quote = await quoteBondFundingLeg(publicClient, chainId, funding, preview.commitment, "buyer");
            legs.set(hashCommitmentStruct(preview.commitment), quote);
            total += quote.maxInput;
        }
        if (funding.approvedInput !== undefined && total > funding.approvedInput) {
            throw new Error(
                `The swaps of this checkout's ${previews.length} orders together may pull ${total} of the funding token, `
                + `above the ${funding.approvedInput} you authorized: each swap pulls its own maximum. `
                + "Authorize the funding token for their sum.",
            );
        }
        return { ...funding, legs };
    }, [publicClient, chainId]);

    /**
     * BUYER side: sign the previewed order and relay it to the seller — sign +
     * share in one step (the XMTP auto-relay path). Composes `signCommitment`
     * then pins + relays. Returns the signed payload now in flight. A
     * race-formed order passes the winner's countersignature via
     * `opts.sellerSig` — the relayed payload then carries BOTH signatures and
     * arrives commit-ready on the winner's surface.
     */
    const signAndShare = useCallback(async (
        preview: OrderPreview,
        funding?: BuyerFundingRequest,
        opts?: { sellerSig?: Hex },
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        const signed = await signCommitment(preview, funding);
        // The orders it follows travel beside it, in their public form, so
        // its seller can check its edges (`acceptOrder`).
        const withFollowed = preview.followed?.length ? { ...signed, followed: preview.followed } : signed;
        const payload = opts?.sellerSig ? { ...withFollowed, sellerSig: opts.sellerSig } : withFollowed;
        return runStep("Order failed", async () => {
            setStep("sharing");
            await shareSignedOrder({
                payload,
                recipientAddress: preview.commitment.seller,
                senderAddress: address,
                walletClient: walletClient ?? null,
                chainId,
                handoffMessaging: services.handoffMessaging,
                evidenceTransport: services.evidenceTransport,
            });

            setStep("awaiting-seller");
            return payload;
        });
    }, [address, chainId, walletClient, services, signCommitment, runStep]);

    // Broadcast routing: a payload carrying a witness-signed buyer funding
    // leg — or an accept carrying the seller's — goes through the
    // coordinator's `swapAndCommit` (which swaps each party's tokens in place,
    // then calls FigaroCore); everything else goes straight to FigaroCore's
    // `commit`. The routes are signature-bound, so either party (or anyone)
    // may safely broadcast the funded form.
    const broadcasterFor = useCallback((payload: CommitmentPayload, sellerFunding?: SwapFundingLeg) => {
        const buyerFunding = payload.buyerFunding;
        if (buyerFunding?.enabled || sellerFunding?.enabled) {
            return (c: Commitment, buyerSig: Hex, sellerSig: Hex) =>
                swapAndCommit(c, buyerSig, sellerSig,
                    buyerFunding?.enabled ? buyerFunding : undefined,
                    sellerFunding?.enabled ? sellerFunding : undefined);
        }
        return commit;
    }, [commit, swapAndCommit]);

    /**
     * COUNTER-PARTY side (usually the seller): an incoming pending payload →
     * counter-sign → broadcast on-chain. The bond's allowance is the caller's:
     * approved beforehand (/sign), or in `opts.beforeBroadcast`, which runs
     * after the terms confirm and the signature and before the broadcast, so
     * a party who declines the terms has approved nothing (the /orders accept
     * card); a throw there broadcasts nothing. A seller short of the process
     * denomination may pass `funding` — their swap-funded bond leg is quoted,
     * route-built, and witness-signed here at accept, then rides the same
     * atomic `swapAndCommit`. Returns the tx hash.
     */
    const acceptOrder = useCallback(async (
        incoming: CommitmentPayload,
        funding?: SellerFundingRequest,
        opts?: { beforeBroadcast?: () => Promise<void>; relay?: KnownRelay | null },
    ): Promise<Hex | RelayReceipt> => runStep("Accept failed", async () => {
        const role: PartyRole = hexEqual(address, incoming.commitment.buyer) ? "buyer" : "seller";

        // Verify the COUNTERPARTY's existing signature before we sign and
        // broadcast (acceptOrder): a relayed payload
        // carrying a forged/absent counterparty sig would revert on-chain
        // after we spent gas — refuse early with a clean error. FigaroCore
        // re-verifies; this only moves the failure off-chain. The domain it
        // verifies under is the path the counterparty signed for, and this
        // signature follows it.
        assertSigningDomain(CONTRACTS.core, chainId);
        const counterSig = role === "seller" ? incoming.buyerSig : incoming.sellerSig;
        const counterparty = role === "seller" ? incoming.commitment.buyer : incoming.commitment.seller;
        const path = counterSig ? await signedPath(incoming.commitment, counterSig as Hex, counterparty as Hex, chainId) : null;
        if (!counterSig || !path) {
            throw new Error("The relayed order's counterparty signature is missing or invalid — refusing to counter-sign.");
        }
        await assertPathAccepted(incoming.commitment, path, funding !== undefined || !!incoming.buyerFunding?.enabled, opts?.relay);
        // A seller accepts only an order under an assembly its own
        // profile binds, on a path its binding accepts — read now, from
        // the registry, never from the payload.
        if (role === "seller") {
            const bound = await checkSellerBindsProcess(
                incoming.agreement, incoming.commitment.seller as Hex, profileReaderForChain(publicClient, chainId), path,
            );
            if (!bound.ok) throw new Error(`Refusing this order — ${bound.reason}`);
            // The seller's own check of the orders this one follows: each is
            // committed in the process this order joins and stands where the
            // design's entry says (`followedOrderIssues`). The pure sign gate
            // holds the leaf's form and count; this needs the chain.
            const followedIssues = followedOrderIssues(
                incoming.agreement,
                incoming.commitment,
                await readSigningInputs(incoming.agreement, publicClient, chainId),
                await readFollowedOrders(incoming, publicClient, chainId),
            );
            if (followedIssues.length > 0) {
                throw new Error(`Refusing this order — the orders it follows do not match its design: ${followedIssues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
            }
        }

        setStep("signing");
        // The seller's optional on-ramp is quoted before the sign so its
        // maxInput shows in the same confirm as the agreement.
        // 2·runningTotal is FigaroCore's seller pull.
        const sellerQuote = funding && role === "seller"
            ? await quoteBondFundingLeg(publicClient, chainId, funding, incoming.commitment, "seller")
            : null;
        // The broadcast below also carries any leg already signed in the
        // payload (the buyer's relayed leg): the same confirm shows it.
        const sig = await signAs(
            incoming.commitment, incoming.agreement,
            swapDetails(sellerQuote, incoming.commitment.seller),
            carriedSwapDetails(incoming),
            path,
        );

        const payload: CommitmentPayload = {
            ...incoming,
            buyerSig: role === "buyer" ? sig : incoming.buyerSig,
            sellerSig: role === "seller" ? sig : incoming.sellerSig,
        };

        const sellerFunding: SwapFundingLeg | undefined = sellerQuote ? await signLeg(sellerQuote, incoming.commitment, "seller") : undefined;

        await opts?.beforeBroadcast?.();

        setStep("committing");
        if (path === "batch") {
            // The batch path: the relay takes the signed commitment, and the
            // verifier pulls both bonds when its batch lands.
            const receipt = await commitThroughRelay(opts?.relay ?? null, payload.commitment, payload.buyerSig as Hex, payload.sellerSig as Hex);
            setRelayReceipt(receipt);
            setStep("done");
            return receipt;
        }
        // Every broadcaster `broadcasterFor` returns verifies its own receipt
        // (`simulateWriteVerify`: simulate → send → verify), so the helper
        // waits for no second one: a second `waitForTransactionReceipt` on
        // the same hash never resolves in the browser (viem's observer for
        // that hash is still registered when the first wait returns), which
        // held this step at "committing" after a mined commit.
        const hash = await commitSignedOrder({
            payload,
            commit: broadcasterFor(payload, sellerFunding),
            publicClient,
            waitForReceipt: false,
        });

        setStep("done");
        return hash;
    }), [address, broadcasterFor, publicClient, signAs, chainId, runStep, signLeg, assertPathAccepted]);

    /**
     * CANDIDATE side (dispatch race): an inbound UNSIGNED draft → counter-sign
     * → relay the countersigned payload BACK to the buyer. NO broadcast — a
     * draft cannot be broadcast (the buyer's signature does not exist yet),
     * which is exactly why countersigning first is safe: the countersignature
     * is the candidate's availability answer, binding only if the buyer
     * commits this struct before its deadline. The SDK's draft gate rejects a
     * tampered draft, a draft under an assembly this wallet's own profile does
     * not bind — and a payload that already carries a buyer signature
     * (that is an offer; it accepts through `acceptOrder`). Signing runs the
     * SAME off-chain validation + confirm gate as every other signature. The bond is
     * already approved (the page gated this) — being committed later pulls it.
     */
    const counterSignAndReturn = useCallback(async (
        incoming: CommitmentPayload,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        return runStep("Counter-sign failed", async () => {
            // The FULL draft gate — the specs (resolved through the registry
            // first) and the design the agreement names — so a bad request is
            // refused before the person is asked anything.
            const design = await readSigningInputs(incoming.agreement, publicClient, chainId);
            const check = await validateDraft(incoming, address, undefined, specSource(), design, profileReaderForChain(publicClient, chainId));
            if (!check.ok) throw new Error(`Refusing this draft — ${check.reason}`);
            setStep("signing");
            const sellerSig = await signAs(incoming.commitment, incoming.agreement);
            const returned: CommitmentPayload = { ...incoming, sellerSig };
            setStep("sharing");
            await relayCommitmentPayload({
                payload: returned,
                recipientAddress: incoming.commitment.buyer,
                senderAddress: address,
                walletClient: walletClient ?? null,
                chainId,
                handoffMessaging: services.handoffMessaging,
            });
            setStep("awaiting-buyer");
            return returned;
        });
    }, [address, signAs, chainId, walletClient, services, publicClient, runStep]);

    /**
     * CANDIDATE side (RFQ): an inbound QUOTE REQUEST → the person names their
     * price → counter-draft at that figure → counter-sign → relay back. The
     * human entering the quote IS the pricing function, and the sign step's
     * off-chain validation + confirm gate (rendering the QUOTED agreement) replaces the
     * autonomous floors — exactly as accept does. The counter-draft is built
     * through the SDK's shared substitution, so the buyer's reconstruction
     * reproduces it hash-for-hash; a quote above the buyer's ceiling (the
     * request's payment) or below the payment floor refuses before signing.
     */
    const quoteAndReturn = useCallback(async (
        incoming: CommitmentPayload,
        quotedPayment: bigint,
    ): Promise<CommitmentPayload> => {
        if (!address) throw new Error("Connect a wallet first.");
        return runStep("Quote failed", async () => {
            // The FULL draft gate — the specs (resolved through the registry
            // first) and the design the agreement names — so a bad request is
            // refused before the person is asked anything.
            const design = await readSigningInputs(incoming.agreement, publicClient, chainId);
            const check = await validateDraft(incoming, address, undefined, specSource(), design, profileReaderForChain(publicClient, chainId));
            if (!check.ok) throw new Error(`Refusing this draft — ${check.reason}`);
            const terms = incoming.quoteRequest;
            if (!terms) {
                throw new Error("This draft carries no quote request — counter-sign it instead.");
            }
            if (quotedPayment < 1n) throw new Error("A quote must be at least 1 unit.");
            if (quotedPayment > incoming.commitment.payment) {
                throw new Error("Your quote is above the buyer's ceiling — they asked for at most the figure shown.");
            }
            const counter = buildCounterDraft(incoming, terms, quotedPayment);
            setStep("signing");
            const sellerSig = await signAs(counter.commitment, counter.agreement);
            const returned: CommitmentPayload = { commitment: counter.commitment, agreement: counter.agreement, sellerSig };
            setStep("sharing");
            await relayCommitmentPayload({
                payload: returned,
                recipientAddress: incoming.commitment.buyer,
                senderAddress: address,
                walletClient: walletClient ?? null,
                chainId,
                handoffMessaging: services.handoffMessaging,
                // A quote is a DIFFERENT struct than the request (the whole
                // point) — it answers on the REQUEST's conversation id, where
                // the buyer is listening.
                threadOrderId: commitmentOrderHash(incoming.commitment, chainId),
            });
            setStep("awaiting-buyer");
            return returned;
        });
    }, [address, signAs, chainId, walletClient, services, publicClient, runStep]);

    /**
     * Broadcast an ALREADY fully-signed payload — no signature added. For the
     * case where both signatures are present and anyone may submit it on-chain.
     *
     * Gated like the sign step: off-chain validation first (a payload whose inline agreement
     * doesn't merkle to the signed checkoutHash is never broadcast — the chain
     * can't check it, so this is the last integrity gate), then the same
     * review-before-commit confirmation the sign step uses. The bond's
     * allowance is the caller's, as at accept: `opts.beforeBroadcast` runs
     * after the confirm and before the broadcast, so a party who declines has
     * approved nothing (the /orders ready-to-submit card); a throw there
     * broadcasts nothing.
     */
    const commitOrder = useCallback(async (
        payload: CommitmentPayload,
        opts?: { beforeBroadcast?: () => Promise<void>; relay?: KnownRelay | null },
    ): Promise<Hex | RelayReceipt> => runStep("Commit failed", async () => {
        assertAgreementSignable(
            payload.agreement,
            payload.commitment.checkoutHash,
            specSource(),
            payload.commitment,
            await readSigningInputs(payload.agreement, publicClient, chainId),
        );
        // The path both signatures were made for, read from the buyer's: the
        // order goes to that path's contract, or to a relay for the batch
        // path, and nowhere else.
        const path = await payloadPath(payload, chainId);
        if (!path) throw new Error("The order's buyer signature is missing or verifies under neither path's domain, so it was not sent.");
        await assertPathAccepted(payload.commitment, path, !!payload.buyerFunding?.enabled, opts?.relay);
        // Every swap leg the broadcast carries is shown before it is sent.
        const approved = await requestCommitConfirmation(
            payload.commitment,
            payload.agreement,
            carriedSwapDetails(payload),
        );
        if (!approved) throw new Error("Commit canceled by user.");
        await opts?.beforeBroadcast?.();
        setStep("committing");
        if (path === "batch") {
            if (!payload.buyerSig || !payload.sellerSig) throw new Error("Both signatures are required before an order can be committed.");
            const receipt = await commitThroughRelay(opts?.relay ?? null, payload.commitment, payload.buyerSig, payload.sellerSig);
            setRelayReceipt(receipt);
            setStep("done");
            return receipt;
        }
        // The broadcaster verifies the receipt itself (see `acceptOrder`).
        const hash = await commitSignedOrder({
            payload,
            commit: broadcasterFor(payload),
            publicClient,
            waitForReceipt: false,
        });
        setStep("done");
        return hash;
    }), [broadcasterFor, publicClient, chainId, runStep, assertPathAccepted]);

    return {
        step,
        error,
        relayReceipt,
        signCommitment,
        quoteBuyerFunding,
        signAndShare,
        acceptOrder,
        counterSignAndReturn,
        quoteAndReturn,
        commitOrder,
        reset,
    } as const;
}

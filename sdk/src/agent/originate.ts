/**
 * @figaro/sdk/agent — Assembly instantiation + origination handshake
 *
 * Turns a DISCOVERED assembly (its template, hydrated off-SDK from the
 * registry's contentURI) into a signable root order, and drives the two-party
 * offer/accept that originates the process. The buyer builds and signs its half;
 * the seller VALIDATES the terms and counter-signs; the buyer submits via
 * `executeAction("initiate-process", …)`.
 *
 * Scope: the ROOT order (a two-party bonded process — the minimal real
 * origination). Multi-order DAG instantiation (sub-orders bonded against
 * cumulative value through its own link) is the documented extension; the frontend's
 * `assemblyCheckout` is the reference for that walk.
 *
 * The SDK names no clause: instantiation reads the template's clause bag
 * verbatim and merges the buyer's per-clause overrides keyed by the clauseIds
 * the buyer composed. Which clause carries payment is the buyer's decision, not
 * the kernel's.
 */

import type { WalletClient, PublicClient } from "viem";
import { verifyTypedData } from "viem";
import { buildCommitment, buildDomain, ZERO_PROCESS_ID, COMMITMENT_TYPES } from "../commitments.js";
import { computeAgreementHash, type Agreement } from "../agreement.js";
import { ERC20_ABI } from "../abis.js";
import { commit, type TxResult } from "./autonomous.js";
import type { Hex, Address, Commitment, FigaroAddresses } from "../types.js";
import type { CommitmentPayload, CoordinationChannel, OfferHandler } from "./coordination.js";
import { templateParentOrderHashes } from "../assembly.js";
import type { AssemblyTemplate, TemplateAgreement } from "../assembly.js";
import { reconstructOrdersFromTemplate, templateAgreementFromClauses } from "../reconstructOrders.js";

// ── Assembly template (the pinned document, hydrated off-SDK) ─────────────────
// The shape's single home is ../assembly.js; re-exported here so the /agent
// subpath keeps offering it alongside instantiate/originate.

export type { AssemblyTemplate, TemplateAgreement };

/** A template agreement is a ROOT if no clause declares a non-empty
 *  `parentOrderHashes` — the mandatory topology clause's field, matched by name not by
 *  clause id (open-world). */
function isRootAgreement(a: TemplateAgreement): boolean {
    return templateParentOrderHashes(a).length === 0;
}

export interface InstantiateParams {
    buyer: Address;
    seller: Address;
    /** Per-clause field overrides merged onto the template's clause data — the
     *  buyer supplies its terms (typically the commerce clause's
     *  `{ currency, payment, lineItems }`). Keyed by clauseId; the SDK names none. */
    overrides?: Record<string, Record<string, unknown>>;
}

/**
 * Instantiate an assembly template's ROOT order into a signable Agreement.
 * Merges the buyer's overrides onto the template's clause bag; the resulting
 * merkle root becomes the commitment's `agreementHash`.
 */
export function instantiateRootAgreement(template: AssemblyTemplate, params: InstantiateParams): Agreement {
    const root = template.agreements.find(isRootAgreement) ?? template.agreements[0];
    if (!root) throw new Error("assembly template has no agreements to instantiate");
    // The one clause-bag → Agreement builder (root and multi-order alike)
    // lives with the template walk: ../reconstructOrders.js.
    return templateAgreementFromClauses(root.clauses, root, params.buyer, params.seller, params.overrides);
}

// ── Buyer side: build + sign the offer ────────────────────────────────────────

export interface BuildOfferParams extends InstantiateParams {
    template: AssemblyTemplate;
    currency: Address;
    /** The root order's payment (== the process's opening cumulative value). */
    payment: bigint;
    chainId: number;
    core: Address;
    salt?: bigint;
    /** CHAIN-time deadline (readChainTimestamp) — never the machine clock. */
    deadline: bigint;
}

/**
 * Buyer builds the root commitment from a discovered assembly and signs its half.
 * `wallet.account` is the buyer. Returns the offer envelope (buyerSig filled)
 * ready to send over a `CoordinationChannel`.
 */
export async function buildBuyerOffer(wallet: WalletClient, params: BuildOfferParams): Promise<CommitmentPayload> {
    const account = wallet.account;
    if (!account) throw new Error("buildBuyerOffer: wallet has no account");
    const buyer = account.address;
    const agreement = instantiateRootAgreement(params.template, {
        buyer, seller: params.seller, overrides: params.overrides,
    });
    const agreementHash = computeAgreementHash(agreement);
    const domain = buildDomain(params.chainId, params.core);
    const { commitment, typedData } = buildCommitment({
        processId: ZERO_PROCESS_ID, buyer, seller: params.seller, currency: params.currency,
        payment: params.payment, expectedCumulativeValue: params.payment,
        agreementHash, salt: params.salt, deadline: params.deadline,
    }, domain);
    const buyerSig = await wallet.signTypedData({ account, ...typedData });
    return { commitment, agreement, buyerSig };
}

// ── Seller side: validate + counter-sign ──────────────────────────────────────

export interface OfferCheck { ok: boolean; reason?: string }

/**
 * The operator's economic floor for an inbound offer — the counterpart to the
 * `accept` refuse-all floor, for the offer's *economic fields* rather than its
 * business fit. A seller counter-signing bonds 2× the offer's
 * `expectedCumulativeValue` in the offer's `currency`, so a hostile offer can
 * carry an absurd magnitude or an unexpected currency; this policy bounds both.
 * Everything here is OPERATOR-SUPPLIED — the allowlist is the operator's own set
 * of currencies, never a bundled token list. Passing a policy is opt-IN: with
 * none, the seller-facing seam DECLINES (see `counterSignOffer`), mirroring the
 * `accept` floor's unspecified case.
 */
export interface OfferPolicy {
    /** Require the offer to be a well-formed ROOT order: `processId` zero AND
     *  `expectedCumulativeValue == payment` (a root order's cumulative value IS
     *  its payment; the root signs processId=0 and the chain derives the real
     *  id). OMIT (or false) for a seller that serves sub-orders in a chain, where
     *  `processId` is the root's derived id and cumulative value exceeds payment. */
    requireRootShape?: boolean;
    /** The operator's currency allowlist — the offer's `currency` must be one of
     *  these (case-insensitive). REQUIRED when a policy is supplied: an empty or
     *  absent allowlist vouches for no currency, so the offer is rejected. */
    currencyAllowlist?: Address[];
    /** The operator's magnitude cap — neither `payment` nor
     *  `expectedCumulativeValue` may exceed it. REQUIRED when a policy is
     *  supplied: an absent cap leaves magnitude unbounded, so the offer is
     *  rejected. */
    maxValue?: bigint;
}

/**
 * Structural validation a seller MUST run before counter-signing — the
 * anti-tamper gate, plus (when an `OfferPolicy` is supplied) the operator's
 * economic floor. Verifies the offer is well-formed and internally consistent:
 * buyer signature present, named seller is me, the agreement hashes to the
 * committed `agreementHash` (the buyer cannot sign one agreement and pin
 * another), and the agreement's parties match the commitment. Cryptographic
 * verification of the buyer signature is done in `counterSignOffer` (async).
 *
 * With a `policy`, ALSO checks the economic fields the seller bonds against:
 * root-shape, the currency allowlist, and the magnitude cap. WITHOUT a `policy`,
 * only the structural checks run — the seller-facing seam (`counterSignOffer`)
 * treats an absent policy as a DECLINE, so a bare integration never vouches for
 * economic fields it has not been told to bound.
 */
export function validateOffer(offer: CommitmentPayload, expectedSeller: Address, policy?: OfferPolicy): OfferCheck {
    if (!offer.buyerSig) return { ok: false, reason: "offer is missing the buyer signature" };
    const c = offer.commitment;
    if (c.seller.toLowerCase() !== expectedSeller.toLowerCase()) return { ok: false, reason: "offer names a different seller" };
    if (c.agreementHash.toLowerCase() !== computeAgreementHash(offer.agreement).toLowerCase()) {
        return { ok: false, reason: "agreement does not hash to the committed agreementHash" };
    }
    if (offer.agreement.buyer.toLowerCase() !== c.buyer.toLowerCase()
        || offer.agreement.seller.toLowerCase() !== c.seller.toLowerCase()) {
        return { ok: false, reason: "agreement parties do not match the commitment" };
    }
    if (policy) {
        const economic = checkOfferPolicy(c, policy);
        if (!economic.ok) return economic;
    }
    return { ok: true };
}

/** The economic floor, applied once the offer is structurally sound. Each check
 *  is safe-by-default: an opted-in policy that omits the allowlist or the cap
 *  rejects rather than waving the offer through. Exported for the dispatch
 *  race's draft validator, which applies the same floor to an UNSIGNED draft
 *  (`validateOffer` itself requires a buyer signature, which a draft lacks by
 *  definition). */
export function checkOfferPolicy(c: Commitment, policy: OfferPolicy): OfferCheck {
    if (policy.requireRootShape
        && !(c.processId.toLowerCase() === ZERO_PROCESS_ID && c.expectedCumulativeValue === c.payment)) {
        return { ok: false, reason: "offer is not a well-formed root order (processId 0 and cumulativeValue == payment)" };
    }
    if (!policy.currencyAllowlist || policy.currencyAllowlist.length === 0) {
        return { ok: false, reason: "offer policy supplies no currency allowlist — no currency is vouched for" };
    }
    if (!policy.currencyAllowlist.some((a) => a.toLowerCase() === c.currency.toLowerCase())) {
        return { ok: false, reason: `offer currency ${c.currency} is not in the policy allowlist` };
    }
    if (policy.maxValue === undefined) {
        return { ok: false, reason: "offer policy supplies no magnitude cap — magnitude is unbounded" };
    }
    if (c.payment > policy.maxValue || c.expectedCumulativeValue > policy.maxValue) {
        return { ok: false, reason: `offer magnitude (payment ${c.payment}, cumulativeValue ${c.expectedCumulativeValue}) exceeds the policy cap ${policy.maxValue}` };
    }
    return { ok: true };
}

/**
 * Seller validates an inbound offer and counter-signs, or declines. `wallet` is
 * the seller. A malformed offer (fails `validateOffer`, or a buyer signature
 * that does not recover to the named buyer) THROWS — the seller must never
 * counter-sign a tampered or bogus commitment.
 *
 * TWO FLOORS, both operator-supplied, both opt-IN (autonomy is never the
 * default), both DECLINE (`null`) rather than throw — a throw is reserved for a
 * tampered/forged offer:
 *   - REFUSE-ALL FLOOR (operator ruling 2026-07-07): `accept` is the business
 *     gate. A clean offer counter-signs ONLY when an explicit `accept` returns
 *     true; omit it (or return false) and the offer is declined.
 *   - ECONOMIC FLOOR: `policy` bounds the economic fields the seller bonds
 *     against (root-shape, currency allowlist, magnitude cap). Counter-signing
 *     bonds the seller against attacker-chosen `expectedCumulativeValue` /
 *     `currency`, so with NO policy the offer is declined — a bare integration
 *     never silently vouches for unbounded magnitudes or an unexpected currency.
 */
export async function counterSignOffer(
    wallet: WalletClient,
    offer: CommitmentPayload,
    ctx: { chainId: number; core: Address },
    accept?: (offer: CommitmentPayload) => boolean,
    policy?: OfferPolicy,
): Promise<CommitmentPayload | null> {
    const account = wallet.account;
    if (!account) throw new Error("counterSignOffer: wallet has no account");
    const seller = account.address;

    // Anti-tamper gate: a malformed/tampered offer THROWS (integrity attack).
    const check = validateOffer(offer, seller);
    if (!check.ok) throw new Error(`counterSignOffer: refusing malformed offer — ${check.reason}`);

    const domain = buildDomain(ctx.chainId, ctx.core);
    const buyerSigValid = await verifyTypedData({
        address: offer.commitment.buyer,
        domain, types: COMMITMENT_TYPES, primaryType: "Commitment", message: offer.commitment,
        signature: offer.buyerSig as Hex,
    });
    if (!buyerSigValid) throw new Error("counterSignOffer: buyer signature does not recover to the named buyer");

    // Economic floor: no policy, or economic fields outside it, DECLINES.
    if (!policy) return null;
    const economic = validateOffer(offer, seller, policy);
    if (!economic.ok) return null;

    // Refuse-all floor: no accept, or an accept that says no, declines.
    if (!accept || !accept(offer)) return null;

    const sellerSig = await wallet.signTypedData({
        account, domain, types: COMMITMENT_TYPES, primaryType: "Commitment", message: offer.commitment,
    });
    return { ...offer, sellerSig };
}

/** The fully-signed commitment from a completed handshake — the input an
 *  `initiate-process` execution needs. Throws if either signature is missing. */
export function offerToExecutionInputs(offer: CommitmentPayload): { commitment: Commitment; buyerSig: Hex; sellerSig: Hex } {
    if (!offer.buyerSig || !offer.sellerSig) throw new Error("offer is not fully signed (need both buyer and seller signatures)");
    return { commitment: offer.commitment, buyerSig: offer.buyerSig, sellerSig: offer.sellerSig };
}

// ── Bond approval ─────────────────────────────────────────────────────────────

/** Approve `core` to pull `amount` of `currency` — a party's bond. ADDITIVE: a
 *  seller on multiple nodes of one chain approves each bond in turn (all
 *  handshakes precede any commit), and plain `approve()` OVERWRITES — only the
 *  last node's allowance would survive. Reads the current allowance and approves
 *  `current + amount`, so it covers every bond (over-approval is harmless).
 *  Awaits the receipt so the allowance is on chain before the counterparty's
 *  `commit`. */
async function approveBond(wallet: WalletClient, publicClient: PublicClient, core: Address, currency: Address, amount: bigint): Promise<void> {
    const account = wallet.account;
    if (!account) throw new Error("approveBond: wallet has no account");
    const current = await publicClient.readContract({
        address: currency, abi: ERC20_ABI, functionName: "allowance", args: [account.address, core],
    });
    const hash = await wallet.writeContract({
        chain: wallet.chain ?? null, account, address: currency, abi: ERC20_ABI, functionName: "approve", args: [core, current + amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
}

// ── The two loops ─────────────────────────────────────────────────────────────

export interface OriginateParams extends BuildOfferParams {
    /** The transport to the seller. */
    channel: CoordinationChannel;
    /** Approve the buyer's 2× payment bond to Core before commit (default true).
     *  Set false only if the allowance is already in place. */
    approveBond?: boolean;
}

/**
 * BUYER LOOP — originate a process end-to-end from a discovered assembly:
 * instantiate the root order, sign, send the offer over the channel, and — once
 * the seller counter-signs — approve the buyer's bond and submit the two-party
 * commit. Returns the tx result, or `null` if the seller declined / no
 * counterparty answered. The counterparty signature is never fabricated: no
 * counter-signature ⇒ no commit.
 */
export async function originateProcess(
    wallet: WalletClient,
    publicClient: PublicClient,
    addresses: FigaroAddresses,
    params: OriginateParams,
): Promise<TxResult | null> {
    const offer = await buildBuyerOffer(wallet, params);
    const signed = await params.channel.sendOffer(params.seller, offer);
    if (!signed?.sellerSig) return null;
    const { commitment, buyerSig, sellerSig } = offerToExecutionInputs(signed);
    if (params.approveBond !== false) {
        await approveBond(wallet, publicClient, addresses.core, params.currency, 2n * params.payment);
    }
    return commit(wallet, publicClient, addresses.core, commitment, buyerSig, sellerSig);
}

export interface SellerOfferHandlerOpts {
    /** Business gate (the refuse-all floor): the handler counter-signs ONLY when
     *  this returns true. OMIT it and the handler declines every offer — a fresh
     *  integration is autonomous-inert by default; enabling autonomy means
     *  writing this rule (operator ruling 2026-07-07). */
    accept?: (offer: CommitmentPayload) => boolean;
    /** Economic floor: the operator's bounds on the offer's economic fields
     *  (root-shape, currency allowlist, magnitude cap). OMIT it and the handler
     *  declines every offer — counter-signing bonds the seller against
     *  attacker-chosen magnitudes/currency, so vouching for them is opt-IN. */
    policy?: OfferPolicy;
    /** Approve the seller's 2× cumulative-value bond before returning the signed
     *  offer, so the allowance is on chain before the buyer commits (default true). */
    approveBond?: boolean;
}

/**
 * SELLER LOOP — build an `OfferHandler` to register on a channel. On an inbound
 * offer it validates (the anti-tamper gate), applies the accept policy, and — if
 * accepting — approves its bond then counter-signs. A declined offer returns
 * `null` (and does NOT approve the bond); a malformed offer throws. With no
 * `accept` business rule OR no economic `policy` the handler declines everything
 * (both floors) — so registering it bare never auto-signs a stranger's offer.
 */
export function makeSellerOfferHandler(
    wallet: WalletClient,
    publicClient: PublicClient,
    addresses: FigaroAddresses,
    opts: SellerOfferHandlerOpts = {},
): OfferHandler {
    return async (offer: CommitmentPayload): Promise<CommitmentPayload | null> => {
        const chainId = await publicClient.getChainId();
        const signed = await counterSignOffer(wallet, offer, { chainId, core: addresses.core }, opts.accept, opts.policy);
        if (!signed) return null;
        if (opts.approveBond !== false) {
            await approveBond(wallet, publicClient, addresses.core, offer.commitment.currency, 2n * offer.commitment.expectedCumulativeValue);
        }
        return signed;
    };
}

// ── Multi-order origination (the value-added chain) ───────────────────────────
//
// A DAG of orders under one root. The kernel sees a LINEAR sequence of commits
// updating a monotonic cumulative-value accumulator; DAG topology is off-chain
// (each order's parents recorded in its topology section). Beyond the root case:
//   - parents: a sub-order's topology field carries its parents' REAL EIP-712
//     order hashes, not the template-local ids — so orders are built in
//     dependency order and each order's hash is fed to its children.
//   - cumulative value: each order commits against the running total (root's
//     payment, then + each sub's), which the kernel matches exactly — so commits
//     are SUBMITTED in that same order (root first).
//   - N counterparties: each order's own seller counter-signs its own order.
// The walk's single home is `../reconstructOrders.js` (`planTemplateOrders` +
// `reconstructOrdersFromTemplate`); this module supplies the signing seam.

export interface ChainNodeSpec {
    /** Template node id (matches `template.agreements[].id`). */
    nodeId: string;
    /** The seller for this node — the buyer's counterparty choice. A single
     *  seller across multiple nodes is fine: bond approval is additive. */
    seller: Address;
    /** This node's payment (the value it adds). */
    payment: bigint;
    /** Per-clause overrides for this node (e.g. its commerce lineItems). */
    overrides?: Record<string, Record<string, unknown>>;
}

export interface BuildChainParams {
    template: AssemblyTemplate;
    currency: Address;
    chainId: number;
    core: Address;
    /** One spec per template agreement (root + subs). */
    nodes: ChainNodeSpec[];
    /** Optional deterministic salt per node (testing). */
    salt?: (nodeId: string) => bigint | undefined;
    /** CHAIN-time deadline (readChainTimestamp) — never the machine clock. */
    deadline: bigint;
}

/** A buyer-signed offer for one node, in commit order. */
export interface ChainOffer {
    nodeId: string;
    seller: Address;
    offer: CommitmentPayload;
}

/**
 * Build the whole chain's buyer-signed offers, in commit order. Walks the
 * template through the ONE walk (`reconstructOrdersFromTemplate`): the root
 * signs `processId = 0`; sub-orders name the root's derived processId, carry
 * their parents' real order hashes, and commit against the running cumulative
 * value. Every order is signed by the buyer here (in the walk's `onOrder`
 * seam); each seller counter-signs its own via the channel.
 */
export async function buildChainOffers(wallet: WalletClient, params: BuildChainParams): Promise<ChainOffer[]> {
    const account = wallet.account;
    if (!account) throw new Error("buildChainOffers: wallet has no account");
    const buyer = account.address;
    const specByNode = new Map(params.nodes.map((n) => [n.nodeId, n]));
    const out: ChainOffer[] = [];
    await reconstructOrdersFromTemplate(params.template, {
        buyer,
        currency: params.currency,
        chainId: params.chainId,
        core: params.core,
        nodes: (planned) => {
            const spec = specByNode.get(planned.nodeId);
            if (!spec) throw new Error(`no seller/payment spec for template node "${planned.nodeId}"`);
            return spec;
        },
        salt: params.salt,
        deadline: params.deadline,
        onOrder: async (order) => {
            const buyerSig = await wallet.signTypedData({ account, ...order.typedData });
            out.push({
                nodeId: order.nodeId,
                seller: order.seller,
                offer: { commitment: order.commitment, agreement: order.agreement, buyerSig },
            });
        },
    });
    return out;
}

export interface OriginateChainParams extends BuildChainParams {
    channel: CoordinationChannel;
    /** Approve the buyer's 2× total-payment bond before committing (default true). */
    approveBond?: boolean;
}

/**
 * BUYER LOOP (multi-order) — originate a value-added chain end-to-end: build
 * every order (buyer-signed), send each as an offer to its seller, and — once ALL
 * counter-sign — approve the buyer's total bond and submit the commits root-first
 * in cumulative order (each awaited so the kernel sees a consistent running
 * total). Any seller declining aborts before any commit, so nothing lands
 * half-built. Returns the ordered tx hashes, or `null` if aborted.
 */
export async function originateChain(
    wallet: WalletClient,
    publicClient: PublicClient,
    addresses: FigaroAddresses,
    params: OriginateChainParams,
): Promise<{ hashes: Hex[] } | null> {
    const offers = await buildChainOffers(wallet, params);

    // N handshakes — one offer per node to its seller. A single decline aborts.
    const signed: CommitmentPayload[] = [];
    for (const o of offers) {
        const s = await params.channel.sendOffer(o.seller, o.offer);
        if (!s?.sellerSig) return null;
        signed.push(s);
    }

    if (params.approveBond !== false) {
        const total = params.nodes.reduce((sum, n) => sum + n.payment, 0n);
        await approveBond(wallet, publicClient, addresses.core, params.currency, 2n * total);
    }

    // Ordered commit: root first, subs in cumulative order (== offers order).
    // Each awaited so the next sub commits against the confirmed cumulative value.
    const hashes: Hex[] = [];
    for (const s of signed) {
        const { commitment, buyerSig, sellerSig } = offerToExecutionInputs(s);
        const { hash } = await commit(wallet, publicClient, addresses.core, commitment, buyerSig, sellerSig);
        await publicClient.waitForTransactionReceipt({ hash });
        hashes.push(hash);
    }
    return { hashes };
}

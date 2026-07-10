/**
 * @figaro/core/agent — Assembly instantiation + origination handshake
 *
 * Turns a DISCOVERED assembly (its template, hydrated off-SDK from the
 * registry's contentURI) into a signable root order, and drives the two-party
 * offer/accept that originates the process. The buyer builds and signs its half;
 * the seller VALIDATES the terms and counter-signs; the buyer submits via
 * `executeAction("initiate-process", …)`.
 *
 * Scope: the ROOT order (a two-party bonded process — the minimal real
 * origination). Multi-order DAG instantiation (sub-orders bonded against
 * cumulative upstream value) is the documented extension; the frontend's
 * `assemblyCheckout` is the reference for that walk.
 *
 * The SDK names no clause: instantiation reads the template's clause bag
 * verbatim and merges the buyer's per-clause overrides keyed by the clauseIds
 * the buyer composed. Which clause carries payment is the buyer's decision, not
 * the kernel's.
 */

import type { WalletClient, PublicClient } from "viem";
import { verifyTypedData } from "viem";
import { buildCommitment, buildDomain, ZERO_PROCESS_ID, COMMITMENT_TYPES, computeCommitmentProcessId, computeOrderHash } from "../commitments.js";
import { computeAgreementHash, type Agreement, type AgreementSection } from "../agreement.js";
import { ERC20_ABI } from "../abis.js";
import { commit, type TxResult } from "./autonomous.js";
import type { Hex, Address, Commitment, FigaroAddresses } from "../types.js";
import type { CommitmentPayload, CoordinationChannel, OfferHandler } from "./coordination.js";
import type { AssemblyTemplate, TemplateAgreement } from "../assembly.js";

// ── Assembly template (the pinned document, hydrated off-SDK) ─────────────────
// The shape's single home is ../assembly.js; re-exported here so the /agent
// subpath keeps offering it alongside instantiate/originate.

export type { AssemblyTemplate, TemplateAgreement };

/** A template agreement is a ROOT if no clause declares a non-empty
 *  `parentOrderHashes` — the structural topology field, matched by name not by
 *  clause id (open-world). */
function isRootAgreement(a: TemplateAgreement): boolean {
    return !Object.values(a.clauses).some(
        (data) => Array.isArray((data as { parentOrderHashes?: unknown }).parentOrderHashes)
            && ((data as { parentOrderHashes: unknown[] }).parentOrderHashes.length > 0),
    );
}

export interface InstantiateParams {
    buyer: Address;
    seller: Address;
    /** Resolve each template clauseId → its registered version (e.g. via
     *  `FigaroContext.getClauses()`). */
    clauseVersion: (clauseId: string) => number;
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
    return agreementFromClauses(root.clauses, params.buyer, params.seller, params.clauseVersion, params.overrides);
}

/** Build an Agreement from a clause bag: each clauseId → a section, buyer
 *  overrides merged in. Shared by root and multi-order instantiation. */
function agreementFromClauses(
    clauses: Record<string, Record<string, unknown>>,
    buyer: Address,
    seller: Address,
    clauseVersion: (clauseId: string) => number,
    overrides?: Record<string, Record<string, unknown>>,
): Agreement {
    const sections: AgreementSection[] = Object.entries(clauses).map(([clauseId, data]) => ({
        clause: clauseId,
        version: clauseVersion(clauseId),
        data: { ...data, ...(overrides?.[clauseId] ?? {}) },
    }));
    return { version: "a1", buyer, seller, sections };
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
    deadline?: bigint;
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
        buyer, seller: params.seller, clauseVersion: params.clauseVersion, overrides: params.overrides,
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
 * Structural validation a seller MUST run before counter-signing — the
 * anti-tamper gate. Verifies the offer is well-formed and internally
 * consistent: buyer signature present, named seller is me, the agreement hashes
 * to the committed `agreementHash` (the buyer cannot sign one agreement and pin
 * another), and the agreement's parties match the commitment. Cryptographic
 * verification of the buyer signature is done in `counterSignOffer` (async).
 */
export function validateOffer(offer: CommitmentPayload, expectedSeller: Address): OfferCheck {
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
    return { ok: true };
}

/**
 * Seller validates an inbound offer and counter-signs, or declines. `wallet` is
 * the seller. A malformed offer (fails `validateOffer`, or a buyer signature
 * that does not recover to the named buyer) THROWS — the seller must never
 * counter-sign a tampered or bogus commitment. `accept` is the policy gate: a
 * clean offer the policy rejects returns `null` (declined), not a throw.
 */
export async function counterSignOffer(
    wallet: WalletClient,
    offer: CommitmentPayload,
    ctx: { chainId: number; core: Address },
    accept?: (offer: CommitmentPayload) => boolean,
): Promise<CommitmentPayload | null> {
    const account = wallet.account;
    if (!account) throw new Error("counterSignOffer: wallet has no account");
    const seller = account.address;

    const check = validateOffer(offer, seller);
    if (!check.ok) throw new Error(`counterSignOffer: refusing malformed offer — ${check.reason}`);

    const domain = buildDomain(ctx.chainId, ctx.core);
    const buyerSigValid = await verifyTypedData({
        address: offer.commitment.buyer,
        domain, types: COMMITMENT_TYPES, primaryType: "Commitment", message: offer.commitment,
        signature: offer.buyerSig as Hex,
    });
    if (!buyerSigValid) throw new Error("counterSignOffer: buyer signature does not recover to the named buyer");

    if (accept && !accept(offer)) return null;

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
    /** Policy gate: return false to decline a clean offer. Omit to accept all
     *  well-formed offers. */
    accept?: (offer: CommitmentPayload) => boolean;
    /** Approve the seller's 2× cumulative-value bond before returning the signed
     *  offer, so the allowance is on chain before the buyer commits (default true). */
    approveBond?: boolean;
}

/**
 * SELLER LOOP — build an `OfferHandler` to register on a channel. On an inbound
 * offer it validates (the anti-tamper gate), applies the accept policy, and — if
 * accepting — approves its bond then counter-signs. A declined offer returns
 * `null`; a malformed offer throws (the seller must never counter-sign a tampered
 * commitment). The bond is approved only when accepting.
 */
export function makeSellerOfferHandler(
    wallet: WalletClient,
    publicClient: PublicClient,
    addresses: FigaroAddresses,
    opts: SellerOfferHandlerOpts = {},
): OfferHandler {
    return async (offer: CommitmentPayload): Promise<CommitmentPayload | null> => {
        const chainId = await publicClient.getChainId();
        const signed = await counterSignOffer(wallet, offer, { chainId, core: addresses.core }, opts.accept);
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
// The frontend `assemblyCheckout` is the reference for this walk.

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
    clauseVersion: (clauseId: string) => number;
    /** One spec per template agreement (root + subs). */
    nodes: ChainNodeSpec[];
    /** Optional deterministic salt per node (testing). */
    salt?: (nodeId: string) => bigint | undefined;
    deadline?: bigint;
}

/** A buyer-signed offer for one node, in commit order. */
export interface ChainOffer {
    nodeId: string;
    seller: Address;
    offer: CommitmentPayload;
}

/** The template-local parent ids a node declares (the topology field, matched by
 *  name not clause id). */
function templateParentIds(node: TemplateAgreement): string[] {
    for (const data of Object.values(node.clauses)) {
        const p = (data as { parentOrderHashes?: unknown }).parentOrderHashes;
        if (Array.isArray(p)) return p as string[];
    }
    return [];
}

/** Order agreements so every node's parents precede it (root first). Throws on a
 *  cyclic or dangling parent reference. */
function topoSort(agreements: TemplateAgreement[]): TemplateAgreement[] {
    const placed = new Set<string>();
    const out: TemplateAgreement[] = [];
    const remaining = [...agreements];
    while (remaining.length > 0) {
        const i = remaining.findIndex((a) => templateParentIds(a).every((pid) => placed.has(pid)));
        if (i < 0) throw new Error("assembly template has a cyclic or dangling parent reference");
        placed.add(remaining[i].id);
        out.push(remaining[i]);
        remaining.splice(i, 1);
    }
    return out;
}

/** Replace a node's template-local parent ids with the REAL order hashes built
 *  for those nodes. Root (empty parents) passes through unchanged. */
function withRealParents(clauses: Record<string, Record<string, unknown>>, realHash: Map<string, Hex>): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = { ...clauses };
    for (const [cid, data] of Object.entries(clauses)) {
        const p = (data as { parentOrderHashes?: unknown }).parentOrderHashes;
        if (Array.isArray(p) && p.length > 0) {
            out[cid] = {
                ...data,
                parentOrderHashes: (p as string[]).map((localId) => {
                    const h = realHash.get(localId);
                    if (!h) throw new Error(`parent "${localId}" was not built before its child (bad topo order)`);
                    return h;
                }),
            };
        }
    }
    return out;
}

/**
 * Build the whole chain's buyer-signed offers, in commit order. Walks the
 * template in dependency order: the root signs `processId = 0`; sub-orders name
 * the root's derived processId, carry their parents' real order hashes, and
 * commit against the running cumulative value. Every order is signed by the
 * buyer here; each seller counter-signs its own via the channel.
 */
export async function buildChainOffers(wallet: WalletClient, params: BuildChainParams): Promise<ChainOffer[]> {
    const account = wallet.account;
    if (!account) throw new Error("buildChainOffers: wallet has no account");
    const buyer = account.address;
    const specByNode = new Map(params.nodes.map((n) => [n.nodeId, n]));
    const ordered = topoSort(params.template.agreements);
    const domain = buildDomain(params.chainId, params.core);

    const realHash = new Map<string, Hex>();
    let rootProcessId: Hex | null = null;
    let cumulative = 0n;
    const out: ChainOffer[] = [];

    for (let i = 0; i < ordered.length; i++) {
        const node = ordered[i];
        const spec = specByNode.get(node.id);
        if (!spec) throw new Error(`no seller/payment spec for template node "${node.id}"`);
        const isRoot = i === 0;
        if (!isRoot && rootProcessId === null) throw new Error("template has a sub-order but no root");

        cumulative += spec.payment;
        const clauses = withRealParents(node.clauses, realHash);
        const agreement = agreementFromClauses(clauses, buyer, spec.seller, params.clauseVersion, spec.overrides);
        const { commitment, typedData } = buildCommitment({
            processId: isRoot ? ZERO_PROCESS_ID : rootProcessId!,
            buyer, seller: spec.seller, currency: params.currency,
            payment: spec.payment, expectedCumulativeValue: cumulative,
            agreementHash: computeAgreementHash(agreement),
            salt: params.salt?.(node.id), deadline: params.deadline,
        }, domain);
        const buyerSig = await wallet.signTypedData({ account, ...typedData });

        if (isRoot) rootProcessId = computeCommitmentProcessId(commitment, params.chainId, params.core);
        realHash.set(node.id, computeOrderHash(commitment, params.chainId, params.core));
        out.push({ nodeId: node.id, seller: spec.seller, offer: { commitment, agreement, buyerSig } });
    }
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

/**
 * @figaro-protocol/sdk/agent — Assembly instantiation + origination handshake
 *
 * Turns a DISCOVERED assembly (its assembly, hydrated off-SDK from the
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
 * The SDK names no clause: instantiation reads the assembly's clause bag
 * verbatim and merges the buyer's per-clause overrides keyed by the clause keys
 * the buyer composed. Which clause carries payment is the buyer's decision, not
 * FigaroCore's.
 */

import type { WalletClient, PublicClient } from "viem";
import { verifyTypedData } from "viem";
import { buildCommitment, buildDomain, hashCommitmentStruct, verifyCommitmentSignature, ZERO_PROCESS_ID, COMMITMENT_TYPES } from "../commitments.js";
import { computeCheckoutHash, type Agreement, type AgreementProvenance } from "../agreement.js";
import { assertAgreementSignable, type SpecSource } from "../projection.js";
import { ERC20_ABI } from "../abis.js";
import { commit, type TxResult } from "./autonomous.js";
import type { Hex, Address, Commitment, FigaroAddresses } from "../types.js";
import type { CommitmentPayload, CoordinationChannel, OfferHandler } from "./coordination.js";
import { agreementClauses, assemblyCompositionHash, assemblyParentOrderHashes } from "../assembly.js";
import type { Assembly, HydratedAssembly, AssemblyAgreement } from "../assembly.js";
import { reconstructOrdersFromAssembly, agreementFromClauses, mergeOverrides, fillWalkProvenance } from "../reconstructOrders.js";
import { checkSellerBindsAssembly, type MemberProfileReader } from "../memberProfile.js";

// ── Assembly (the pinned document, hydrated off-SDK) ─────────────────
// The shapes' single home is ../assembly.js; re-exported here so the /agent
// subpath keeps offering them alongside instantiate/originate.

export type { Assembly, HydratedAssembly, AssemblyAgreement };

/** An agreement is a ROOT if its topology fill names no parent —
 *  `parentOrderHashes`, the mandatory topology clause's field, matched by
 *  name not by clause id (open-world). */
function isRootEntry(entry: AssemblyAgreement): boolean {
    return assemblyParentOrderHashes(entry).length === 0;
}

export interface InstantiateParams {
    buyer: Address;
    seller: Address;
    /** Per-clause field overrides merged onto the assembly's clause data — the
     *  buyer supplies its terms (typically the commerce clause's
     *  `{ currency, payment, lineItems }`). Keyed by clause key; the SDK names none. */
    overrides?: Record<string, Record<string, unknown>>;
}

/**
 * Instantiate a hydrated assembly's ROOT agreement into a signable
 * Agreement. Merges the buyer's overrides onto the agreement's clause bag
 * (its registered agreement's clauses and its own fills); the resulting
 * merkle root becomes the commitment's `checkoutHash`.
 */
export function instantiateRootAgreement(hydrated: HydratedAssembly, params: InstantiateParams): Agreement {
    const { assembly } = hydrated;
    const root = assembly.agreements.find(isRootEntry) ?? assembly.agreements[0];
    if (!root) throw new Error("assembly has no agreements to instantiate");
    // THE ASSEMBLY-SCOPE FOLD, exactly as the walk performs
    // it: the assembly's assembly-scoped clauses — terms of the composition
    // itself (a denomination pin, a dispute forum) — fold into the root
    // clause bag, so the agreement carries them and every party signs them.
    // Skipping the fold was the audit-confirmed parity hole: the pin escaped
    // the sign gate.
    const assemblyClauses = assembly.assemblyClauses ?? {};
    const folded = { ...assemblyClauses, ...agreementClauses(hydrated, root) };
    const merged = mergeOverrides(folded, params.overrides);
    // The one clause-bag → Agreement builder (root and multi-order alike)
    // lives with the assembly walk: ../reconstructOrders.js. The agreement
    // names the registered agreement and the design it instantiates in its
    // provenance leaf, the same fill the walk performs on every order.
    return fillWalkProvenance(
        agreementFromClauses(merged, params.buyer, params.seller),
        { agreementHash: root.agreementHash, compositionHash: assemblyCompositionHash(assembly) },
        root.id ?? "root",
    );
}

// ── Buyer side: build + sign the offer ────────────────────────────────────────

export interface BuildOfferParams extends InstantiateParams {
    /** The discovered assembly, each agreement's registered agreement
     *  hydrated beside its assembly. */
    assembly: HydratedAssembly;
    currency: Address;
    /** The root order's payment (== the process's opening cumulative value). */
    payment: bigint;
    chainId: number;
    core: Address;
    salt?: bigint;
    /** CHAIN-time deadline (readChainTimestamp) — never the machine clock. */
    deadline: bigint;
    /** The clause-spec source for the merkle-leaf seam (`assertAgreementSignable`,
     *  docs/CLAUSES.md § "Every clause is a merkle leaf"): with it, the buyer
     *  refuses to sign an agreement whose terms contradict the commitment
     *  struct. WITHOUT it, the buyer signs ungated and the counterparty's
     *  `validateOffer(..., specs)` is the only net. */
    specs?: SpecSource;
}

/**
 * Buyer builds the root commitment from a discovered assembly and signs its half.
 * `wallet.account` is the buyer. Returns the offer envelope (buyerSig filled)
 * ready to send over a `CoordinationChannel`. With `specs`, the merkle-leaf
 * sign gate runs before the signature — the buyer-side half of the check
 * `validateOffer` runs for the seller.
 */
export async function buildBuyerOffer(wallet: WalletClient, params: BuildOfferParams): Promise<CommitmentPayload> {
    const account = wallet.account;
    if (!account) throw new Error("buildBuyerOffer: wallet has no account");
    const buyer = account.address;
    const agreement = instantiateRootAgreement(params.assembly, {
        buyer, seller: params.seller, overrides: params.overrides,
    });
    const checkoutHash = computeCheckoutHash(agreement);
    const domain = buildDomain(params.chainId, params.core);
    const { commitment, typedData } = buildCommitment({
        processId: ZERO_PROCESS_ID, buyer, seller: params.seller, currency: params.currency,
        payment: params.payment, expectedCumulativeValue: params.payment,
        checkoutHash, salt: params.salt, deadline: params.deadline,
    }, domain);
    if (params.specs) {
        assertAgreementSignable(agreement, checkoutHash, params.specs, commitment, params.assembly, "This offer");
    }
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
 * committed `checkoutHash` (the buyer cannot sign one agreement and pin
 * another), and the agreement's parties match the commitment. Cryptographic
 * verification of the buyer signature is done in `counterSignOffer` (async).
 *
 * With `specs` supplied, ALSO runs the merkle-leaf seam
 * (`assertAgreementSignable` — docs/CLAUSES.md § "Every clause is a merkle
 * leaf"): every clause conforms to its clause spec, and the offer's
 * denomination TERM (the commerce clause leaf, and any composed
 * denomination pin) equals the currency the seller is about to bond against —
 * the commitment struct's `currency` field. This is off-chain validation run on the
 * SELLER's side of the handshake (the buyer-side builders —
 * `buildBuyerOffer`, `buildChainOffers` — run the same gate when given
 * `specs`); `checkOfferPolicy`'s currency check alone only bounds the
 * STRUCT field against an allowlist and cannot see a leaf that disagrees with
 * it. WITHOUT `specs`, this check is skipped — a bare integration with no
 * `SpecSource` gets no leaf/struct check here (structural + policy checks
 * still run).
 *
 * ALWAYS checks that the seller has bound the assembly the offer instantiates
 * (`checkSellerBindsAssembly`): the agreement's provenance leaf names it, and
 * `readProfile` reads the seller's OWN profile (MembersRegistry → metadataURI
 * → IPFS) at acceptance time. An offer with no provenance leaf, no reader, an
 * unreadable profile, or an assembly the profile does not bind is refused.
 *
 * With a `policy`, ALSO checks the economic fields the seller bonds against:
 * root-shape, the currency allowlist, and the magnitude cap. WITHOUT a `policy`,
 * only the structural, bound-assembly (+ merkle-leaf, when `specs` is given)
 * checks run — the seller-facing seam (`counterSignOffer`) treats an absent
 * policy as a DECLINE, so a bare integration never vouches for economic fields
 * it has not been told to bound.
 */
export async function validateOffer(
    offer: CommitmentPayload,
    expectedSeller: Address,
    policy?: OfferPolicy,
    specs?: SpecSource,
    design: HydratedAssembly | null = null,
    readProfile?: MemberProfileReader,
): Promise<OfferCheck> {
    if (!offer.buyerSig) return { ok: false, reason: "offer is missing the buyer signature" };
    return checkPayloadTerms(offer, expectedSeller, "offer", policy, specs, design, readProfile);
}

/**
 * The term check a payload passes on the offer leg (`validateOffer`) and on the
 * race draft leg (`validateDraft`): it names me as seller, its agreement hashes to
 * the committed `checkoutHash`, the agreement's parties match the commitment, the
 * seller has bound the assembly the agreement instantiates, the merkle-leaf seam
 * holds when `specs` is given, and the economic floor holds when `policy` is
 * given. `noun` ("offer" or "draft") names the payload in the refusal. The
 * signature checks differ by leg and stay with each caller.
 */
export async function checkPayloadTerms(
    payload: CommitmentPayload,
    expectedSeller: Address,
    noun: "offer" | "draft",
    policy?: OfferPolicy,
    specs?: SpecSource,
    design: HydratedAssembly | null = null,
    readProfile?: MemberProfileReader,
): Promise<OfferCheck> {
    const c = payload.commitment;
    if (c.seller.toLowerCase() !== expectedSeller.toLowerCase()) return { ok: false, reason: `${noun} names a different seller` };
    if (c.checkoutHash.toLowerCase() !== computeCheckoutHash(payload.agreement).toLowerCase()) {
        return { ok: false, reason: "agreement does not hash to the committed checkoutHash" };
    }
    if (payload.agreement.buyer.toLowerCase() !== c.buyer.toLowerCase()
        || payload.agreement.seller.toLowerCase() !== c.seller.toLowerCase()) {
        return { ok: false, reason: "agreement parties do not match the commitment" };
    }
    const bound = await checkSellerBindsAssembly(payload.agreement, c.seller, readProfile);
    if (!bound.ok) return bound;
    if (specs) {
        try {
            assertAgreementSignable(payload.agreement, c.checkoutHash, specs, c, design, `This ${noun}`);
        } catch (cause) {
            return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
        }
    }
    if (policy) {
        const economic = checkOfferPolicy(c, policy);
        if (!economic.ok) return economic;
    }
    return { ok: true };
}

/** The seller's EIP-712 signature over a commitment: the one signing call the
 *  counter-sign seams (`counterSignOffer`, `counterSignDraft`, `quoteDraft`)
 *  share. `who` names the caller in the refusal of a wallet with no account. */
export async function signCommitmentAs(
    wallet: WalletClient,
    ctx: { chainId: number; core: Address },
    commitment: Commitment,
    who: string,
): Promise<Hex> {
    const account = wallet.account;
    if (!account) throw new Error(`${who}: wallet has no account`);
    return wallet.signTypedData({
        account, domain: buildDomain(ctx.chainId, ctx.core), types: COMMITMENT_TYPES, primaryType: "Commitment", message: commitment,
    });
}

/** The head every seller leg (`counterSignOffer`, `counterSignDraft`, `quoteDraft`) shares:
 *  the wallet's account is the seller, and the term check run against it must pass or the
 *  leg THROWS, naming itself (`who`) and what it refused (`what`). Returns the seller. */
export async function gateSeller(
    wallet: WalletClient,
    who: string,
    what: string,
    check: (seller: Address) => Promise<OfferCheck>,
): Promise<Address> {
    const account = wallet.account;
    if (!account) throw new Error(`${who}: wallet has no account`);
    const checked = await check(account.address);
    if (!checked.ok) throw new Error(`${who}: refusing ${what} — ${checked.reason}`);
    return account.address;
}

/** The tail every seller leg with a boolean accept (`counterSignOffer`, `counterSignDraft`) shares:
 *  the two opt-in floors a clean payload must still pass, then the seller's signature. The
 *  ECONOMIC floor (no `policy`, or economic fields outside it, declines) and the REFUSE-ALL
 *  floor (no `accept`, or an `accept` that says no, declines) each DECLINE with `null`;
 *  autonomy is never the default. */
export async function countersignUnderFloors(
    wallet: WalletClient,
    payload: CommitmentPayload,
    ctx: { chainId: number; core: Address },
    policy: OfferPolicy | undefined,
    accept: ((payload: CommitmentPayload) => boolean) | undefined,
    who: string,
): Promise<CommitmentPayload | null> {
    if (!policy || !checkOfferPolicy(payload.commitment, policy).ok) return null;
    if (!accept || !accept(payload)) return null;
    return { ...payload, sellerSig: await signCommitmentAs(wallet, ctx, payload.commitment, who) };
}

/** A seller signature over `commitment` recovers to `seller`: the last step of every
 *  buyer-side reply check (`verifyRaceReply`, `verifyQuoteReply`). */
export async function checkSellerSignature(
    commitment: Commitment,
    sellerSig: Hex,
    seller: Address,
    ctx: { chainId: number; core: Address },
): Promise<OfferCheck> {
    const valid = await verifyCommitmentSignature(commitment, sellerSig, seller, ctx);
    return valid ? { ok: true } : { ok: false, reason: "seller signature does not recover to the drafted candidate" };
}

/** The economic floor, applied once the offer is structurally sound. Each check
 *  is safe-by-default: an opted-in policy that omits the allowlist or the cap
 *  rejects rather than waving the offer through. Exported for the dispatch
 *  race's draft validator, which applies the same floor to an UNSIGNED draft
 *  (`validateOffer` itself requires a buyer signature, which a draft lacks by
 *  definition); the counter-sign seams apply it on its own once the full gate
 *  has passed. */
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
 * the seller. An offer that fails `validateOffer` (tampered, malformed, under
 * an assembly the seller's profile — read through `readProfile` — does not
 * bind, or with no provenance leaf), or whose buyer signature does not recover
 * to the named buyer, THROWS — the seller never counter-signs it.
 *
 * TWO FLOORS, both operator-supplied, both opt-IN (autonomy is never the
 * default), both DECLINE (`null`) rather than throw — a throw is reserved for a
 * tampered/forged offer:
 *   - REFUSE-ALL FLOOR (maintainer ruling): `accept` is the business
 *     gate. A clean offer counter-signs ONLY when an explicit `accept` returns
 *     true; omit it (or return false) and the offer is declined.
 *   - ECONOMIC FLOOR: `policy` bounds the economic fields the seller bonds
 *     against (root-shape, currency allowlist, magnitude cap). Counter-signing
 *     bonds the seller against attacker-chosen `expectedCumulativeValue` /
 *     `currency`, so with NO policy the offer is declined — a bare integration
 *     never silently vouches for unbounded magnitudes or an unexpected currency.
 *
 * With `specs` supplied, the anti-tamper gate ALSO runs the merkle-leaf seam
 * (`validateOffer`'s `assertAgreementSignable` check): an offer whose
 * commerce-clause currency LEAF disagrees with the commitment struct's
 * `currency` field THROWS here too, before any signature — the same treatment
 * as every other structural tamper.
 */
export async function counterSignOffer(
    wallet: WalletClient,
    offer: CommitmentPayload,
    ctx: { chainId: number; core: Address },
    accept?: (offer: CommitmentPayload) => boolean,
    policy?: OfferPolicy,
    specs?: SpecSource,
    design: HydratedAssembly | null = null,
    readProfile?: MemberProfileReader,
): Promise<CommitmentPayload | null> {
    // The gate: a malformed or tampered offer, or one under an assembly the
    // seller has not bound, THROWS.
    await gateSeller(wallet, "counterSignOffer", "the offer", (seller) => validateOffer(offer, seller, undefined, specs, design, readProfile));

    const domain = buildDomain(ctx.chainId, ctx.core);
    const buyerSigValid = await verifyTypedData({
        address: offer.commitment.buyer,
        domain, types: COMMITMENT_TYPES, primaryType: "Commitment", message: offer.commitment,
        signature: offer.buyerSig as Hex,
    });
    if (!buyerSigValid) throw new Error("counterSignOffer: buyer signature does not recover to the named buyer");

    // Both floors (economic, refuse-all): either one declining declines.
    return countersignUnderFloors(wallet, offer, ctx, policy, accept, "counterSignOffer");
}

/**
 * Buyer-side verification of a countersigned reply — from a race candidate or
 * from the seller an offer went to. The reply's
 * commitment must be EXACTLY the struct the buyer drafted for that candidate
 * (struct-hash equality — a candidate cannot return a doctored payment or
 * terms; the signature would still recover, so equality is checked first), and
 * the seller signature must recover to the drafted candidate.
 */
export async function verifyRaceReply(
    reply: CommitmentPayload,
    draft: CommitmentPayload,
    ctx: { chainId: number; core: Address },
): Promise<OfferCheck> {
    if (!reply.sellerSig) return { ok: false, reason: "reply carries no seller signature" };
    if (hashCommitmentStruct(reply.commitment) !== hashCommitmentStruct(draft.commitment)) {
        return { ok: false, reason: "reply commitment does not match the drafted struct" };
    }
    // Verify against the buyer's OWN drafted struct (never the reply's echoed
    // fields), recovering to the drafted candidate seller.
    return checkSellerSignature(draft.commitment, reply.sellerSig as Hex, draft.commitment.seller, ctx);
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
    // The reply must be the offer this buyer sent, counter-signed by the seller
    // it went to — never another buyer-signed commitment returned in its place.
    // Checked before anything touches the chain.
    const check = await verifyRaceReply(signed, offer, { chainId: params.chainId, core: params.core });
    if (!check.ok) throw new Error(`originateProcess: the seller's reply is not the offer sent — ${check.reason}`);
    const { commitment, buyerSig, sellerSig } = offerToExecutionInputs({ ...offer, sellerSig: signed.sellerSig });
    if (params.approveBond !== false) {
        await approveBond(wallet, publicClient, addresses.core, params.currency, 2n * params.payment);
    }
    return commit(wallet, publicClient, addresses.core, commitment, buyerSig, sellerSig);
}

export interface SellerOfferHandlerOpts {
    /** Business gate (the refuse-all floor): the handler counter-signs ONLY when
     *  this returns true. OMIT it and the handler declines every offer — a fresh
     *  integration is autonomous-inert by default; enabling autonomy means
     *  writing this rule (maintainer ruling). */
    accept?: (offer: CommitmentPayload) => boolean;
    /** Economic floor: the operator's bounds on the offer's economic fields
     *  (root-shape, currency allowlist, magnitude cap). OMIT it and the handler
     *  declines every offer — counter-signing bonds the seller against
     *  attacker-chosen magnitudes/currency, so vouching for them is opt-IN. */
    policy?: OfferPolicy;
    /** The clause-spec source for the merkle-leaf seam (`assertAgreementSignable`,
     *  wired through `validateOffer`'s anti-tamper gate): an offer whose
     *  commerce-clause currency LEAF disagrees with the commitment struct's
     *  `currency` is refused (thrown) before counter-signing. OMIT it and this
     *  handler runs no leaf/struct check — the caller's own SpecSource (the same
     *  one used to originate or display the offer) is the one to pass here. */
    specs?: SpecSource;
    /** Reads the design an offer's agreement names (its provenance leaf):
     *  the assembly by its composition hash, every registered agreement
     *  verified against its key; null when it cannot be read. With `specs`,
     *  the gate checks the designer's values against it, and an offer whose
     *  design is not read is refused. */
    readDesign?: (provenance: AgreementProvenance) => Promise<HydratedAssembly | null>;
    /** Reads the seller's OWN member profile at acceptance time
     *  (MembersRegistry → metadataURI → IPFS, parsed): the gate accepts an
     *  offer only under an assembly that profile binds. OMIT it and the
     *  handler refuses every offer. */
    readProfile?: MemberProfileReader;
    /** Approve the seller's 2× cumulative-value bond before returning the signed
     *  offer, so the allowance is on chain before the buyer commits (default true). */
    approveBond?: boolean;
}

/** The design an inbound payload's agreement names, read through the
 *  operator's `readDesign`; null when the agreement names none, no reader is
 *  given, or the read fails — the gate then refuses an agreement naming a
 *  design. Shared by the offer and the race handlers. */
export async function readOfferDesign(
    payload: CommitmentPayload,
    readDesign?: (provenance: AgreementProvenance) => Promise<HydratedAssembly | null>,
): Promise<HydratedAssembly | null> {
    const provenance = payload.agreement.provenance;
    if (!provenance || !readDesign) return null;
    try {
        return await readDesign(provenance);
    } catch {
        return null;
    }
}

/**
 * SELLER LOOP — build an `OfferHandler` to register on a channel. On an inbound
 * offer it validates (the anti-tamper gate and the bound-assembly check),
 * applies the accept policy, and — if accepting — approves its bond then
 * counter-signs. A declined offer returns `null` (and does NOT approve the
 * bond); a malformed offer, or one under an assembly the seller has not bound,
 * throws. With no `accept` business rule OR no economic `policy` the handler
 * declines everything (both floors); with no `readProfile` it refuses
 * everything; given `specs`, it also needs `readDesign` or it refuses every
 * offer naming a design — so registering it bare never auto-signs a
 * stranger's offer.
 */
export function makeSellerOfferHandler(
    wallet: WalletClient,
    publicClient: PublicClient,
    addresses: FigaroAddresses,
    opts: SellerOfferHandlerOpts = {},
): OfferHandler {
    return async (offer: CommitmentPayload): Promise<CommitmentPayload | null> => {
        const chainId = await publicClient.getChainId();
        const design = await readOfferDesign(offer, opts.readDesign);
        const signed = await counterSignOffer(wallet, offer, { chainId, core: addresses.core }, opts.accept, opts.policy, opts.specs, design, opts.readProfile);
        if (!signed) return null;
        if (opts.approveBond !== false) {
            await approveBond(wallet, publicClient, addresses.core, offer.commitment.currency, 2n * offer.commitment.expectedCumulativeValue);
        }
        return signed;
    };
}

// ── Multi-order origination (the value-added chain) ───────────────────────────
//
// A DAG of orders under one root. FigaroCore sees a LINEAR sequence of commits
// updating a monotonic cumulative-value accumulator; DAG topology is off-chain
// (each order's parents recorded in its topology clause). Beyond the root case:
//   - parents: a sub-order's topology field carries its parents' REAL EIP-712
//     order hashes, not the assembly-local ids — so orders are built in
//     dependency order and each order's hash is fed to its children.
//   - cumulative value: each order commits against the running total (root's
//     payment, then + each sub's), which FigaroCore matches exactly — so commits
//     are SUBMITTED in that same order (root first).
//   - N counterparties: each order's own seller counter-signs its own order.
// The walk's single home is `../reconstructOrders.js` (`planAssemblyOrders` +
// `reconstructOrdersFromAssembly`); this module supplies the signing seam.

export interface ChainNodeSpec {
    /** Assembly node id (matches `assembly.agreements[].id`). */
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
    /** The discovered assembly, each agreement's registered agreement
     *  hydrated beside its assembly. */
    assembly: HydratedAssembly;
    currency: Address;
    chainId: number;
    core: Address;
    /** One spec per registered agreement (root + subs). */
    nodes: ChainNodeSpec[];
    /** Optional deterministic salt per node (testing). */
    salt?: (nodeId: string) => bigint | undefined;
    /** CHAIN-time deadline (readChainTimestamp) — never the machine clock. */
    deadline: bigint;
    /** The clause-spec source. With it, the walk's currency-leaf fill engages
     *  (`reconstructOrdersFromAssembly` writes the commerce leaf from the same
     *  figure the struct signs, and THROWS on a contradicting override) and
     *  every order passes the merkle-leaf sign gate before the buyer signs.
     *  WITHOUT it, the walk is the documented spec-less caller-owns-the-leaf
     *  branch and the counterparty's `validateOffer(..., specs)` is the net. */
    specs?: SpecSource;
}

/** A buyer-signed offer for one node, in commit order. */
export interface ChainOffer {
    nodeId: string;
    seller: Address;
    offer: CommitmentPayload;
}

/**
 * Build the whole chain's buyer-signed offers, in commit order. Walks the
 * assembly through the ONE walk (`reconstructOrdersFromAssembly`): the root
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
    await reconstructOrdersFromAssembly(params.assembly, {
        buyer,
        currency: params.currency,
        chainId: params.chainId,
        core: params.core,
        specs: params.specs,
        nodes: (planned) => {
            const spec = specByNode.get(planned.nodeId);
            if (!spec) throw new Error(`no seller/payment spec for assembly node "${planned.nodeId}"`);
            return spec;
        },
        salt: params.salt,
        deadline: params.deadline,
        onOrder: async (order) => {
            if (params.specs) {
                assertAgreementSignable(
                    order.agreement, order.commitment.checkoutHash, params.specs,
                    order.commitment, params.assembly, `Order "${order.nodeId}"`,
                );
            }
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
 * in cumulative order (each awaited so FigaroCore sees a consistent running
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
    // Each reply must be the offer sent to that node, counter-signed by its
    // seller; every reply is checked before anything touches the chain.
    const signed: CommitmentPayload[] = [];
    for (const o of offers) {
        const s = await params.channel.sendOffer(o.seller, o.offer);
        if (!s?.sellerSig) return null;
        const check = await verifyRaceReply(s, o.offer, { chainId: params.chainId, core: params.core });
        if (!check.ok) throw new Error(`originateChain: the reply for ${o.nodeId} is not the offer sent — ${check.reason}`);
        signed.push({ ...o.offer, sellerSig: s.sellerSig });
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

"use client";

/**
 * dispatchRace.ts — the buyer-side dispatch race: market formation with zero
 * contracts (maintainer-ruled 2026-07-20).
 *
 * An unbound sub-order (a node the adopting seller's profile leaves without a
 * counterparty — the SAME derived absence the manual picker resolves) can be
 * filled by racing the market instead of picking by hand:
 *
 *   1. Candidates are the live discovered-seller set whose catalogue can
 *      price the node (`resolveSubOrderPricing` — the ruled first-available-
 *      item rule, rate items included). A registry read, never a roster;
 *      resolved-empty = nothing to race.
 *   2. One dry walk per candidate (`planAssemblyOrders`, fixed per-node salts
 *      + one deadline) produces that candidate's EXACT commitment struct at
 *      their own posted price. The raced node's order is the draft — relayed
 *      UNSIGNED. Nothing about a draft binds anyone, and it cannot be
 *      broadcast (the kernel needs both signatures).
 *   3. Candidates countersign to answer "available at my posted price" —
 *      binding only if the buyer commits it, bounded by the struct deadline.
 *   4. Cheapest valid countersigner auto-wins at window close (the buyer may
 *      pick any reply instead — buyer dominance); the checkout then executes
 *      with the winner as the node's selection, the fixed salts + deadline
 *      reproducing the drafted struct, and the winner's countersignature
 *      riding the relay — the winner receives a commit-ready order.
 *
 * The race window and the candidate count are checkout-time buyer policy —
 * never a stored field on the payload, the template, or any profile.
 *
 * THE CHOREOGRAPHY IS THE SDK'S (`startRace` — one authored loop, ruled
 * 2026-08-14): this surface drafts the candidates, supplies each one's
 * channel (declared `services.rest` endpoint → the offer wire behind the
 * browser-edge https guard; wallet candidate → the relay adapter,
 * `@/lib/handoff/relayChannel`), renders progress, and owns the window timer
 * and the buyer's overrides. Race payloads travel INLINE over the relay —
 * deliberately NOT `shareSignedOrder` (whose documented precondition is a
 * BUYER-signed, final order): a draft or countersigned-only reply is
 * ephemeral coordination state, not evidence.
 */

import { useCallback, useRef, useState } from "react";
import { useChainId, useWalletClient } from "wagmi";
import {
    derivePricedFields,
    hashCommitmentStruct,
    resolveSubOrderPricing,
} from "@figaro/sdk";
import {
    startRace,
    postOffer,
    type CommitmentPayload,
    type RaceOutcome,
    type RaceRun,
} from "@figaro/sdk/agent";
import { generateSalt } from "@figaro/sdk";
import { planAssemblyOrders, type AssemblyCheckoutParams } from "@/lib/checkout/assemblyCheckout";
import { chainDeadline } from "@/lib/checkout/orderPreview";
import { commitmentOrderHash } from "@/lib/kernel/signedCommitment";
import { createRelayCoordinationChannel, type RelayCoordinationChannel } from "@/lib/handoff/relayChannel";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { formatToken } from "@/lib/shared/utils";
import { hexEqual } from "@/lib/shared/evm";
import { getE2EModeSession } from "@/lib/shared/e2e";
import { extractErrorMessage } from "@/lib/shared/errors";

type Hex = `0x${string}`;

export type DispatchRaceStep = "idle" | "drafting" | "racing" | "done" | "error";

/** A candidate in the running: their drafted struct + reply state (render model). */
export interface RaceCandidateView {
    address: Hex;
    itemName: string;
    payment: bigint;
    replied: boolean;
}

/** What the checkout needs to execute with the race's winner: the node's
 *  selection (the pick IS the winner), the reproduction inputs (salts +
 *  deadline), and the winner's countersignature keyed to the drafted struct.
 *  `endpoint` is present when the winner is an AGENT candidate (their profile
 *  declares `services.rest`) — the fully-signed payload is ALSO delivered
 *  there, so a wallet with no browser open still receives its commit-ready
 *  order and broadcasts it itself. */
export interface DispatchRaceResult {
    nodeId: string;
    selection: { seller: Hex; price: string; item: { id: string; name: string } };
    race: { structHash: Hex; sellerSig: Hex };
    salt: (nodeId: string) => bigint;
    deadline: bigint;
    endpoint?: string;
}

/**
 * Deliver a payload to an agent candidate's declared REST endpoint — the SAME
 * wire `HttpChannel` speaks (POST the serialized envelope; 200 = countersigned
 * reply, 204 = declined, anything else = refusal). This is what makes MIXED
 * pairings work: a human buyer's browser and an agent's service exchange the
 * same artifacts, only the transport differs per candidate.
 */
export async function postToAgentEndpoint(
    endpoint: string,
    payload: CommitmentPayload,
): Promise<CommitmentPayload | null> {
    // `endpoint` is an attacker-authorable `services.rest` from a permissionless
    // member profile — the buyer's browser POSTs to it. Restrict to https so it
    // can't be aimed at an internal/loopback/link-local host or a non-http
    // scheme (audit 2026-07-23, SSRF-shaped fan-out). new URL() rejects
    // malformed values; the CORS preflight already blocks reading a cross-origin
    // response, this stops the request from firing at a non-web target at all.
    // The e2e agent runs an http-loopback node server — relaxed ONLY inside a
    // test session, which getE2EModeSession() forces null in a production build
    // (so the loopback carve-out cannot exist in prod).
    let parsed: URL;
    try {
        parsed = new URL(endpoint);
    } catch {
        throw new Error(`Agent endpoint is not a valid URL: ${endpoint}`);
    }
    const testSession = getE2EModeSession() !== null;
    if (parsed.protocol !== "https:" && !testSession) {
        throw new Error(`Agent endpoint must be https — refusing ${parsed.protocol}//`);
    }
    // The wire itself is the SDK's — one implementation of the offer POST
    // (204 = decline, capped read, empty = decline); only the browser-edge
    // https policy above is this caller's own.
    return postOffer(endpoint, payload);
}

interface RaceCandidateState {
    address: Hex;
    item: { id: string; name: string };
    payment: bigint;
    price: string;
    draft: CommitmentPayload;
    structHash: Hex;
    orderId: string;
    /** The candidate's declared agent REST endpoint — present makes them an
     *  AGENT candidate: drafts POST there (request/reply in one round-trip)
     *  instead of relaying over the wallet coordination channel. */
    endpoint?: string;
}

const DEFAULT_RACE_WINDOW_MS = 30_000;

export function useDispatchRace() {
    const chainId = useChainId();
    const { data: walletClient } = useWalletClient();
    const services = useRuntimeServices();

    const [step, setStep] = useState<DispatchRaceStep>("idle");
    const [error, setError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<RaceCandidateView[]>([]);
    const [result, setResult] = useState<DispatchRaceResult | null>(null);

    // The choreography lives in the SDK's race engine (`startRace` — the one
    // authored loop, ruled 2026-08-14); these refs hold only SURFACE state:
    // the drafted candidates (render + winner mapping), the run handle (buyer
    // overrides call its finish), the relay adapter (closed on cleanup), and
    // the window timer (window duration is checkout policy).
    const draftsRef = useRef<RaceCandidateState[]>([]);
    const runRef = useRef<RaceRun | null>(null);
    const relayRef = useRef<RelayCoordinationChannel | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ctxRef = useRef<{ nodeId: string; salts: Map<string, bigint>; deadline: bigint; decimals: number } | null>(null);
    const finishedRef = useRef(false);
    // The quotes leg: same choreography, the CANDIDATE authors the price.
    // Set for the run by start(); rendered so the panel can label rows.
    const [quoting, setQuoting] = useState(false);

    const cleanup = useCallback(() => {
        relayRef.current?.close();
        relayRef.current = null;
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    /** Render the engine's outcome: the winner becomes the node selection.
     *  Losing countersignatures need no cancellation — they expire inert at
     *  the struct deadline. */
    const applyOutcome = useCallback((outcome: RaceOutcome) => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        cleanup();
        const ctx = ctxRef.current;
        const winner = outcome.winner;
        if (!ctx || !winner || !winner.reply.sellerSig) {
            setError("No candidate countersigned within the race window — try again, or pick a seller directly.");
            setStep("error");
            return;
        }
        const state = draftsRef.current.find((d) => hexEqual(d.address, winner.draft.commitment.seller as Hex));
        if (!state) {
            setError("The winning reply does not match any drafted candidate.");
            setStep("error");
            return;
        }
        // The committed figures come from the winner's REPLY: identical to the
        // draft on the race leg (exact-match verification), the candidate's
        // quote on the quotes leg (reconstruction-verified). The final walk
        // rebuilds at this price and must hash to this struct.
        setResult({
            nodeId: ctx.nodeId,
            selection: {
                seller: state.address,
                price: formatToken(winner.reply.commitment.payment, ctx.decimals),
                item: state.item,
            },
            race: { structHash: hashCommitmentStruct(winner.reply.commitment) as Hex, sellerSig: winner.reply.sellerSig as Hex },
            salt: (nodeId: string) => {
                const s = ctx.salts.get(nodeId);
                if (s === undefined) throw new Error(`No race salt for template node "${nodeId}" — the race fixed a salt for every node at draft time.`);
                return s;
            },
            deadline: ctx.deadline,
            endpoint: state.endpoint,
        });
        setStep("done");
    }, [cleanup]);

    /**
     * Run the race for ONE unbound node. `checkout` must already carry the
     * buyer's selections for every OTHER unbound node (the dry walk refuses a
     * node with no counterparty) — racing several positions is sequential
     * composition: each winner enters `subOrderSelections` before the next
     * race starts.
     *
     * All knobs are checkout-time buyer policy, never stored: `windowMs` (how
     * long to wait), `maxCandidates` (race only the k best-priced), and
     * `quote` — the RFQ leg: drafts go out at the buyer's CEILING with the
     * priced fields derived from the built agreement (spec-routed, no clause
     * named), candidates author the price, and replies verify by
     * reconstruction instead of exact match.
     */
    const start = useCallback(async (args: {
        checkout: Omit<AssemblyCheckoutParams, "salt" | "deadline" | "subOrderRace">;
        racedNodeId: string;
        windowMs?: number;
        maxCandidates?: number;
        quote?: { ceiling: bigint };
    }) => {
        const { checkout, racedNodeId } = args;
        const core = CONTRACTS.core as Hex | undefined;
        if (!core) throw new Error("Core contract address is not configured.");
        setError(null);
        setResult(null);
        finishedRef.current = false;
        runRef.current = null;
        try {
            setStep("drafting");
            const template = checkout.assembly.assemblyTemplate;
            const node = template.agreements.find((a) => a.id === racedNodeId);
            if (!node) throw new Error(`Template node "${racedNodeId}" not found.`);
            const specs = specSource();
            const nodeClauses = { ...node.clauses, ...(checkout.clauseFills?.[racedNodeId] ?? {}) };

            // The candidate set: the live discovered-seller catalogues that can
            // price this node — the same registry read the manual path uses,
            // resolved fresh here. The buyer's own catalogue is skipped (the
            // buyer does not race itself over the channel). Sorted best-priced
            // first so the buyer's k (a policy knob, never stored) means "the
            // k cheapest posted" — on the quotes leg the posted figure is only
            // the eligibility/ranking signal; the quote sets the price.
            const priced = checkout.sellerCatalogues
                .filter((cat) => !hexEqual(cat.address, checkout.buyer))
                .map((cat) => ({
                    address: cat.address as Hex,
                    endpoint: cat.agentServices?.rest,
                    pricing: resolveSubOrderPricing({
                        node: { ...node, clauses: nodeClauses },
                        seller: cat.address as Hex,
                        sellerCatalogues: checkout.sellerCatalogues,
                        tokenDecimals: checkout.tokenDecimals,
                        specs,
                        checkoutQuantity: checkout.subOrderQuantities?.[racedNodeId],
                    }),
                }))
                .filter(({ pricing }) => pricing.item !== null && !pricing.issue && pricing.payment > 0n)
                .sort((a, b) => (a.pricing.payment < b.pricing.payment ? -1 : a.pricing.payment > b.pricing.payment ? 1 : 0))
                .slice(0, args.maxCandidates && args.maxCandidates > 0 ? args.maxCandidates : undefined);
            if (priced.length === 0) {
                throw new Error("No registered seller's catalogue can price this order — nothing to race.");
            }
            setQuoting(!!args.quote);

            // Fix the reproduction inputs ONCE: a salt per template node and a
            // single deadline. Every dry walk and the final checkout use them.
            const deadline = await chainDeadline();
            const salts = new Map<string, bigint>(
                template.agreements.map((a) => [a.id, generateSalt()]),
            );
            const saltFn = (nodeId: string) => {
                const s = salts.get(nodeId);
                if (s === undefined) throw new Error(`No race salt for template node "${nodeId}".`);
                return s;
            };
            ctxRef.current = { nodeId: racedNodeId, salts, deadline, decimals: checkout.tokenDecimals };

            // One dry walk per candidate — the raced node's order IS the draft.
            // On the quotes leg every draft prices at the buyer's CEILING; the
            // priced fields are derived from the built agreement (the same
            // spec-routed lookup the fills use) and attached as the quote
            // request's terms.
            const drafts: RaceCandidateState[] = [];
            for (const { address: candidate, endpoint, pricing } of priced) {
                const item = { id: pricing.item!.id, name: pricing.item!.name };
                const price = formatToken(args.quote?.ceiling ?? pricing.payment, checkout.tokenDecimals);
                const orders = await planAssemblyOrders({
                    ...checkout,
                    subOrderSelections: {
                        ...checkout.subOrderSelections,
                        [racedNodeId]: { seller: candidate, price, item },
                    },
                    salt: saltFn,
                    deadline,
                }, { chainId });
                const order = orders.find((o) => o.nodeId === racedNodeId);
                if (!order) throw new Error(`The walk produced no order for node "${racedNodeId}".`);
                let payload: CommitmentPayload = { commitment: order.commitment, agreement: order.agreement };
                if (args.quote) {
                    const pricedFields = derivePricedFields(order.agreement.sections, specs);
                    if (pricedFields.length === 0) {
                        throw new Error("This order composes no commercial section to quote against.");
                    }
                    payload = { ...payload, quoteRequest: { pricedFields } };
                }
                drafts.push({
                    address: candidate,
                    item,
                    payment: order.payment,
                    price,
                    draft: payload,
                    structHash: hashCommitmentStruct(order.commitment) as Hex,
                    orderId: commitmentOrderHash(order.commitment, chainId),
                    endpoint,
                });
            }
            draftsRef.current = drafts;
            setCandidates(drafts.map((d) => ({ address: d.address, itemName: d.item.name, payment: d.payment, replied: false })));

            // THE race — the SDK engine runs the one authored choreography
            // (fan-out, verification, arrival-order accumulation, selection);
            // this surface supplies only the per-candidate channel and renders
            // progress. Candidate routing is the profile-keyed rule:
            //   - AGENT candidate (declared `services.rest`): the offer wire —
            //     POST to their endpoint behind the browser-edge https guard.
            //     Mixed pairings are exactly this branch.
            //   - wallet candidate: the relay adapter — the handoff family's
            //     pre-commit cell speaking `CoordinationChannel`.
            setStep("racing");
            const relay = createRelayCoordinationChannel({
                handoffMessaging: services.handoffMessaging,
                senderAddress: checkout.buyer,
                walletClient: walletClient ?? null,
                chainId,
            });
            relayRef.current = relay;
            const channelFor = (draft: CommitmentPayload) => {
                const d = draftsRef.current.find((s) => s.draft === draft);
                if (d?.endpoint) {
                    const endpoint = d.endpoint;
                    return { sendOffer: (_seller: Hex, dr: CommitmentPayload) => postToAgentEndpoint(endpoint, dr) };
                }
                return relay;
            };
            const run = startRace(channelFor, drafts.map((d) => d.draft), { chainId, core }, {
                quote: !!args.quote,
                onReply: (r) => {
                    const seller = r.draft.commitment.seller as Hex;
                    setCandidates((prev) => prev.map((c) =>
                        hexEqual(c.address, seller)
                            ? { ...c, replied: true, payment: r.reply.commitment.payment }
                            : c,
                    ));
                },
            });
            runRef.current = run;
            void run.done.then(applyOutcome);
            timerRef.current = setTimeout(() => run.finish(), args.windowMs ?? DEFAULT_RACE_WINDOW_MS);
        } catch (e: unknown) {
            cleanup();
            finishedRef.current = true;
            setError(extractErrorMessage(e, "The race could not start"));
            setStep("error");
        }
    }, [chainId, walletClient, services, applyOutcome, cleanup]);

    /** Buyer override: close the race now on the best reply so far. */
    const selectNow = useCallback(() => { runRef.current?.finish(); }, []);
    /** Buyer override: choose a specific countersigner instead of the cheapest. */
    const pick = useCallback((candidate: Hex) => { runRef.current?.finish(candidate); }, []);

    const reset = useCallback(() => {
        cleanup();
        finishedRef.current = false;
        draftsRef.current = [];
        runRef.current = null;
        ctxRef.current = null;
        setStep("idle");
        setError(null);
        setCandidates([]);
        setResult(null);
        setQuoting(false);
    }, [cleanup]);

    const repliedCount = candidates.filter((c) => c.replied).length;
    return { step, error, candidates, repliedCount, result, quoting, start, selectNow, pick, reset };
}

"use client";

/**
 * CheckoutView — the buyer's order surface at `/s/checkout?seller=<address>`.
 *
 * Driven EXCLUSIVELY by the seller's bound assembly. The checkout names no
 * clause and knows no modality: it resolves the assembly from the seller's
 * profile, walks the assembly's own topology + clauses, computes the bond,
 * validates the off-chain spec, runs the bilateral / multi-order commit, and redirects to
 * `/orders/view?process=<processId>`. Every order's clauses come straight from the assembly
 * template; every sub-order's seller is resolved generically from the assembly's
 * `counterpartyBindings`. No courier picker, no modality taxonomy, no
 * buyer-set pricing — those are the assembly's concerns, not the checkout's.
 *
 * The cart is read-only here: it is the buyer's line-item selection, edited on
 * the browse page. Checkout reads it, it does not mutate it.
 */

import Link from "@/components/shared/Link";
import { useEffect, useMemo, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import { maxOrdersResolvablePerProcess } from "@/lib/shared/chainGasCeilings";
import { DEVNET_CHAIN_ID } from "@/lib/shared/chains";
import { deploymentFingerprint } from "@/lib/shared/deploymentFingerprint";
import { useConnectInjected } from "@/hooks/useConnectInjected";
import { Button } from "@/components/ui/Button";
import { CartLineList } from "@/components/runtime/CartLineList";
import { useCommerce, useCheckout } from "@/lib/checkout";
import { useCartStore } from "@/lib/checkout/cartStore";
import { useRegisteredCatalogs } from "@/lib/member/useRegisteredCatalogs";
import { planSubOrderSellers, readUtilityTokenPin, resolveSubOrderPricing } from "@figaro-protocol/sdk";
import { executeAssemblyCheckout, type AssemblyCheckoutParams } from "@/lib/checkout/assemblyCheckout";
import {
    buyerAuthoredFields,
    deriveAgreementGroups,
    deriveKitBreakdown,
    isFilledValue,
    unfilledRequiredFills,
} from "@/lib/checkout/checkoutDerivations";
import { postToAgentEndpoint, useDispatchRace } from "@/lib/checkout/dispatchRace";
import { DispatchRacePanel, type RaceStartPolicy } from "@/components/runtime/DispatchRacePanel";
import { templateClauseVersion, templateParentOrderHashes } from "@/lib/shared/assemblyTemplate";
import { CommitmentSharePanel } from "@/components/runtime/CommitmentSharePanel";
import { SellerCatalogPicker, type SellerSelection } from "@/components/runtime/SellerCatalogPicker";
import { useCompositionActions } from "@/lib/composition/useCompositionActions";
import {
    effectiveUnitCost,
    formatFeeTier,
    inputForOutput,
    quotePlanConversion,
    resolveSwapFundingContracts,
    sellerConversions,
    type PlanConversion,
    type SellerPlanPart,
    type VenueRate,
} from "@/lib/composition/swapFunding";
import { SwapFundingPanel, fundingAuthorization, fundingBlocksTheAct } from "./SwapFundingPanel";
import useTokenApproval from "@/hooks/useTokenApproval";
import { useApproveThenAct } from "@/hooks/useApproveThenAct";
import { maxUint256 } from "viem";
import { FieldControl } from "@/components/runtime/FieldControl";
import { isSiblingFormatSource, resolveInputFormat, type FormatPreset } from "@/components/runtime/fieldFormatInputs";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";
import { calculateBonds } from "@figaro-protocol/sdk";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual, normalizeAddressParam, ZERO_ADDRESS } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatToken, parseToken } from "@/lib/shared/utils";
import { useMemberBoundAssemblies } from "@/lib/member/useMemberBoundAssemblies";
import { displayNameForAddress } from "@/lib/member/memberListing";
import { formatMass, formatVolume } from "@/lib/member/unitConversion";
import { getClauseSpec, specSource } from "@/lib/shared/clauseSpecSource";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { CredentialVerifyButton } from "@/components/runtime/CredentialVerifyButton";
import type { FieldSpec } from "@figaro-protocol/sdk/clauses";

interface Props {
    sellerAddress: string;
}

/** No conversion: the denomination IS the quote basis. */
const IDENTITY_RATE: VenueRate = { num: 1n, den: 1n };

/** One order's on-network composition (sixth noun): the composing clause, its
 *  standard interface, and the runtime `block.runtime.fields` the buyer fills. */
interface OrderComposition {
    nodeId: string;
    clauseId: string;
    interface: string;
    fields: readonly FieldSpec[];
}

export function CheckoutView({ sellerAddress }: Props) {
    const { lower: sellerAddressLower, typed: sellerAddressTyped } = normalizeAddressParam(sellerAddress);

    const chainId = useChainId();
    const publicClient = usePublicClient();
    // A tamper-check for the buyer: the sha256 of the on-chain address set this
    // build was made with, recomputable from the canonical deployment record.
    // Shown off the local development chain only, whose per-run addresses have
    // no canonical deployment record to check against.
    const deploymentFp = useMemo(() => deploymentFingerprint(), []);
    const { compose } = useCompositionActions();
    const { catalogs: sellerCatalogs, isLoading: catalogsLoading } = useRegisteredCatalogs();

    const memberCatalog = useMemo(
        () => sellerCatalogs.find((r) => hexEqual(r.address, sellerAddressLower)) ?? null,
        [sellerCatalogs, sellerAddressLower],
    );

    const { address: buyer } = useCommerce();
    const { items } = useCartStore();
    const connectInjected = useConnectInjected();

    const { assemblies: boundAssemblies } = useMemberBoundAssemblies(sellerAddressTyped);

    // The buyer's options ARE the seller's bound assemblies — each is one
    // option, labeled by the assembly's own name and keyed by its slug.
    // Fill-mechanism variants (a catalog-bound counterparty, a buyer pick)
    // are DISTINCT assemblies, so picking the assembly picks the mechanism;
    // the checkout hardcodes no taxonomy and reads no coordination field —
    // the mechanism is derived from binding state.
    const assemblyOptions: { slug: string; name: string }[] = useMemo(
        () => boundAssemblies.map((a) => ({ slug: a.slug, name: a.name })),
        [boundAssemblies],
    );
    // The buyer's chosen assembly slug, when the seller offers more than one.
    const [selectedSlug, setSelectedSlug] = useState<string | undefined>(undefined);

    // The assembly the buyer is ordering from attaches to the member PROFILE. One
    // bound assembly -> use it; several -> the buyer's selected slug disambiguates which.
    // Every order commits against a published assembly — there is no fallback.
    const pickedAssembly = boundAssemblies.length === 1
        ? boundAssemblies[0]
        : boundAssemblies.find((a) => a.slug === selectedSlug);

    // The process denomination. Resolution order: the assembly's UTILITY-TOKEN
    // PIN (the designer's design.fills tailoring on the root agreement — the
    // one token the whole assembly runs in, part of its identity), else the
    // BUYER'S PICK from the seller's accepted array (the social layer — the
    // seller is PAID in the picked token and spends it onward; the pick is
    // what the commitment carries), else the seller's declared default (the
    // unit of account the catalog quotes in). None ⇒ undefined — never a
    // coined default (resolved-empty = absence); ordering is gated off below.
    // The pin lives at the ASSEMBLY level of the template (design.scope:
    // "assembly") — a term of the composition, folded into
    // every agreement at checkout; the old root-order convention is dead.
    const utilityTokenPin = pickedAssembly
        ? readUtilityTokenPin(pickedAssembly.assemblyTemplate.assemblyClauses ?? {}, specSource(), pickedAssembly.assemblyTemplate.assemblyClauseVersions)
        : undefined;
    const sellerDefault = memberCatalog?.defaultTokenAddress as `0x${string}` | undefined;
    // What this surface already knows, offered to the format inputs as
    // one-click fills, keyed by FORMAT: the seller's declared locality to any
    // geohash-format field (a buyer collecting at the counter states origin
    // and destination as the seller's place, with no device read and no code
    // to know). Never keyed by clause or field name — a never-seen clause
    // declaring the format gets the offer.
    const sellerGeohash = memberCatalog?.geohash;
    const sellerAddressText = memberCatalog?.addressText;
    const formatPresets = useMemo(() => {
        const presets: Record<string, FormatPreset[]> = {};
        if (sellerGeohash) {
            presets.geohash = [{ label: `Use the seller's location${sellerAddressText ? ` (${sellerAddressText})` : ""}`, value: sellerGeohash }];
        }
        return presets;
    }, [sellerGeohash, sellerAddressText]);
    const [paymentPick, setPaymentPick] = useState<`0x${string}` | null>(null);
    const currency = utilityTokenPin ?? paymentPick ?? sellerDefault;
    // Price conversion, unit of account → the process denomination: each
    // seller's catalog prices are quoted in THAT seller's default; when the
    // pick/pin differs, that seller's part of the plan is quoted exact-output
    // on the pool THAT seller declared for the token in its profile (the
    // party made whole names the pool), and its amounts convert at that
    // quote's effective rate BEFORE display and commit. A seller with no
    // declared pool for the token is not convertible; no venue configured is
    // the same absence. The quotes run below, once every seller's part of the
    // plan is known.
    const swapFundingContracts = resolveSwapFundingContracts();
    const [planQuotes, setPlanQuotes] = useState<
        { key: string; bySeller: Record<string, { result: PlanConversion | null; error: string | null }> } | null
    >(null);
    // The lead's quote basis's symbol — the token its catalog (and so the
    // cart) is priced in: read from the token, else as the seller declared it.
    const { data: basisResolvedSymbol } = useTokenSymbol(sellerDefault ?? "");
    const basisSymbol = basisResolvedSymbol
        ?? (sellerDefault ? memberCatalog?.acceptedTokens?.find((t) => hexEqual(t.address, sellerDefault))?.symbol : undefined)
        ?? "";
    const { data: resolvedSymbol } = useTokenSymbol(currency ?? "");
    const tokenSymbol = resolvedSymbol
        ?? (currency ? memberCatalog?.acceptedTokens?.find((t) => hexEqual(t.address, currency))?.symbol : undefined)
        ?? "";
    const {
        decimals: tokenDecimals,
        decimalsReady,
        balance: tokenBalance,
        needsAuthorization: needsApproval,
        authorize: approve,
        authorization: { isPending: isApprovePending, isConfirming: isApproveConfirming, isSuccess: isApproveSuccess, isError: isApproveError },
        signRoot,
        signAndShare,
        order: { step: commitStep, error: commitError, payload },
    } = useCheckout(currency);
    // Runtime inputs for any order that composes an on-network contract — the
    // clause's `block.runtime.fields`, filled at checkout (like the cart line items),
    // keyed by template node id then field name. Interface-agnostic: the form
    // renders whatever fields the composing clause declares, naming no clause.
    const [compositionInputs, setCompositionInputs] = useState<Record<string, Record<string, unknown>>>({});
    // The buyer's GENERAL-clause field fills, nodeId → clauseId → values.
    // Design time is structural: general clauses arrive
    // from the template as `{}`; their transaction particulars are filled
    // here, at checkout. Spec-routed — the checkout names no clause.
    const [clauseFills, setClauseFills] = useState<Record<string, Record<string, Record<string, unknown>>>>({});
    const setClauseFill = (nodeId: string, clauseId: string, field: string, value: unknown) =>
        setClauseFills((prev) => ({
            ...prev,
            [nodeId]: {
                ...prev[nodeId],
                [clauseId]: { ...prev[nodeId]?.[clauseId], [field]: value },
            },
        }));
    const setCompositionField = (nodeId: string, fieldName: string, value: unknown) =>
        setCompositionInputs((prev) => {
            const nextNode = { ...(prev[nodeId] ?? {}) };
            if (value === undefined) delete nextNode[fieldName];
            else nextNode[fieldName] = value;
            return { ...prev, [nodeId]: nextNode };
        });

    // Clear a stale choice the seller no longer offers; auto-select the sole
    // option (a one-option dropdown is noise — the static line shows it).
    useEffect(() => {
        if (selectedSlug && !assemblyOptions.some((o) => o.slug === selectedSlug)) {
            setSelectedSlug(undefined);
        }
        if (assemblyOptions.length === 1 && selectedSlug !== assemblyOptions[0].slug) {
            setSelectedSlug(assemblyOptions[0].slug);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assemblyOptions]);

    const balance = tokenBalance ?? 0n;
    const isApproving = isApprovePending || isApproveConfirming;
    const { runWithApproval } = useApproveThenAct({ needsApproval, approve, isApproveSuccess, isApproveError });
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    // Swap-funded bond leg (buyer side): the ON-RAMP into the process
    // denomination — a buyer short of the picked/pinned token draws on
    // another of the seller's accepted tokens, and the coordinator swaps it
    // at commit time. Funding is never the order's denomination; the
    // candidate set IS the seller's acceptedTokens minus the process
    // denomination; available only where the swap composition (coordinator +
    // Permit2 + venue) is configured. Resolved-empty = the path is absent.
    const fundingCandidates = useMemo(
        () => (swapFundingContracts && currency
            ? (memberCatalog?.acceptedTokens ?? []).filter((t) => !hexEqual(t.address, currency))
            : []),
        [swapFundingContracts, currency, memberCatalog],
    );
    const [fundingToken, setFundingToken] = useState<`0x${string}` | null>(null);
    // The one-time Permit2 authorization for the chosen funding token (the
    // standard Permit2 max approval; per-commit amounts are witness-bound).
    const permit2Funding = useTokenApproval({
        tokenAddress: fundingToken ?? undefined,
        owner: buyer ?? undefined,
        spender: (swapFundingContracts?.permit2 ?? ZERO_ADDRESS) as `0x${string}`,
    });
    // The buyer's checkout-time counterparty choice for a sub-order the
    // adopting seller's catalog leaves unbound (the buyer assigns it).
    const [sellerSelection, setSellerSelection] = useState<SellerSelection | null>(null);
    // The dispatch race — the OTHER way to fill the same unbound sub-order:
    // candidates countersign unsigned drafts, cheapest valid reply wins, the
    // winner's countersignature rides the commit walk. `race.result` holds
    // the winner + the reproduction inputs (salts, deadline).
    const race = useDispatchRace();
    const raceOutcome = race.result;
    // Buyer-entered units per template node id — the "checkout-quantity" rate
    // source's input (hours, seats, …). Read by the SAME pricing call the
    // commit walk makes, so the shown figure equals what commits.
    const [subOrderQuantities, setSubOrderQuantities] = useState<Record<string, number>>({});
    useEffect(() => { setSellerSelection(null); }, [selectedSlug]);
    // The clause specs the agreement terms below are read from. The cache is a
    // module singleton warmed from chain → IPFS, so a surface that only READS
    // it (getClauseSpec) renders whatever happened to be cached at that instant
    // and never re-renders when the rest lands: the terms then show as bare
    // titles with no controls, and the sign gate refuses the fields the form
    // never offered. Subscribing here both re-renders as specs resolve and
    // gives the render a `loaded` flag to hold the terms until they are real.
    const { loaded: clauseSpecsLoaded } = useClauseSpecs();

    // Filter cart to items from THIS merchant only — the buyer's line-item input,
    // read-only here (edited on the browse page).
    const cartItems = items.filter((it) => it.sellerId === sellerAddressLower);
    // Assembly-level fills (the "assembly" review group) apply to EVERY
    // node: expand them under each template order id, designer values under
    // buyer values, so the walk and the price preview see one merged map.
    const assemblySections = pickedAssembly?.assemblyTemplate.assemblyClauses ?? {};
    const assemblyFills = clauseFills["assembly"] ?? {};
    const mergedAssemblyEntries = Object.fromEntries(
        Object.keys(assemblySections).map((clauseId) => [
            clauseId,
            { ...assemblySections[clauseId], ...(assemblyFills[clauseId] ?? {}) },
        ]),
    );
    const expandedClauseFills: typeof clauseFills = Object.fromEntries(
        (pickedAssembly?.assemblyTemplate.agreements ?? []).map((o, i) => {
            const nodeId = String(o.id ?? i);
            return [nodeId, { ...mergedAssemblyEntries, ...(clauseFills[nodeId] ?? {}) }];
        }),
    );
    // Every seller's part of the plan in ITS OWN quote basis — the SAME
    // derivation the shown and committed figures use, with no conversion
    // applied: the lead's cart, every bound contributor priced from its own
    // catalog, a manual pick's price. A race winner's price is already in the
    // process denomination, so its node stays out of every quoted amount.
    const cartBasisTotal = cartItems.reduce(
        (sum, item) => sum + parseToken(item.price || "0", tokenDecimals) * BigInt(item.quantity),
        0n,
    );
    const subOrderPlan = (() => {
        if (!pickedAssembly || pickedAssembly.assemblyTemplate.agreements.length <= 1) return [];
        try {
            return planSubOrderSellers(pickedAssembly);
        } catch {
            return [];
        }
    })();
    const basisKit = memberCatalog
        ? deriveKitBreakdown({
            pickedAssembly,
            leadAddress: memberCatalog.address as `0x${string}`,
            sellerCatalogs,
            pricedCatalogs: sellerCatalogs,
            cartTotal: cartBasisTotal,
            clauseFills: expandedClauseFills,
            subOrderQuantities,
            tokenDecimals,
            raceOutcome: null,
            sellerSelection,
            toCurrency: (amount) => amount,
        })
        : null;
    const planParts: SellerPlanPart[] = memberCatalog
        ? [
            { seller: memberCatalog.address, basisAmount: cartBasisTotal },
            ...subOrderPlan.flatMap(({ node, seller }): SellerPlanPart[] => {
                if (seller) return [{ seller, basisAmount: basisKit?.rows.find((r) => r.nodeId === node.id)?.payment ?? 0n }];
                if (raceOutcome && raceOutcome.nodeId === node.id) return [];
                return sellerSelection
                    ? [{ seller: sellerSelection.seller, basisAmount: parseToken(sellerSelection.price, tokenDecimals) }]
                    : [];
            }),
        ]
        : [];
    // Per seller: each converts on its OWN declared pool, never the lead's.
    const allConversions = sellerConversions(sellerCatalogs, currency, planParts);
    const conversions = allConversions.filter((c) => c.need.kind !== "none");
    const needsConversion = conversions.length > 0;
    // The sellers whose part is quoted: a declared pool and something to price.
    const quotable = conversions.flatMap((c) =>
        c.need.kind === "declared" && c.quoteBasis && c.basisTotal > 0n
            ? [{ seller: c.seller, quoteBasis: c.quoteBasis, feeTier: c.need.feeTier, basisTotal: c.basisTotal }]
            : []);
    const quotesKey = quotable.length > 0 && decimalsReady && swapFundingContracts
        ? `${currency}|${tokenDecimals}|${quotable.map((q) => `${q.seller}:${q.quoteBasis}:${q.feeTier}:${q.basisTotal}`).join(",")}`
        : null;
    useEffect(() => {
        if (!quotesKey || !publicClient || !swapFundingContracts || !currency) {
            setPlanQuotes(null);
            return;
        }
        let canceled = false;
        setPlanQuotes({ key: quotesKey, bySeller: {} });
        void Promise.all(quotable.map(async (q) => {
            try {
                const result = await quotePlanConversion(publicClient, swapFundingContracts.router, {
                    tokenIn: currency,
                    tokenOut: q.quoteBasis,
                    feeTier: q.feeTier,
                    planBasis: q.basisTotal,
                    tokenInDecimals: tokenDecimals,
                });
                return [q.seller, { result, error: null }] as const;
            } catch (e) {
                return [q.seller, { result: null, error: extractErrorMessage(e, "The quote failed.") }] as const;
            }
        })).then((entries) => { if (!canceled) setPlanQuotes({ key: quotesKey, bySeller: Object.fromEntries(entries) }); });
        return () => { canceled = true; };
        // The key carries every input the quotes read.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quotesKey, publicClient]);
    const currentQuotes = planQuotes && planQuotes.key === quotesKey ? planQuotes.bySeller : null;
    // The rate a seller's prices convert at: identity when its quote basis IS
    // the denomination; its own declared-pool quote otherwise; null while
    // unquoted or not convertible.
    const rateFor = (seller: string | undefined): VenueRate | null => {
        const c = seller ? conversions.find((x) => hexEqual(x.seller, seller)) : undefined;
        if (!c) return IDENTITY_RATE;
        return currentQuotes?.[c.seller]?.result?.rate ?? null;
    };
    // A seller with something to price and no rate blocks the order.
    const conversionBlocked = conversions.some((c) => c.basisTotal > 0n && !rateFor(c.seller));
    const convertFor = (seller: string | undefined, amount: bigint) => {
        const rate = rateFor(seller);
        return rate ? inputForOutput(amount, rate) : amount;
    };
    // The lead's cart converts on the lead's pool; a manual pick on the
    // picked seller's.
    const toCurrency = (amount: bigint) => convertFor(memberCatalog?.address, amount);
    const pickToCurrency = (amount: bigint) => convertFor(sellerSelection?.seller, amount);
    // The catalog projections re-quoted into the process denomination, each
    // at its OWN seller's rate — sub-order pricing and the commit walk read
    // prices already converted, so shown = committed in ONE basis. Identity
    // when no conversion applies.
    const sellerRates = Object.fromEntries(
        conversions.flatMap((c) => {
            const rate = rateFor(c.seller);
            return rate ? [[c.seller, rate] as const] : [];
        }),
    );
    const sellerRatesKey = Object.entries(sellerRates).map(([s, r]) => `${s}:${r.num}/${r.den}`).join(",");
    const pricedCatalogs = useMemo(() => {
        if (!sellerRatesKey) return sellerCatalogs;
        return sellerCatalogs.map((c) => {
            const rate = sellerRates[c.address.toLowerCase()];
            if (!rate) return c;
            return {
                ...c,
                items: c.items.map((it) => ({
                    ...it,
                    price: formatToken(inputForOutput(parseToken(it.price || "0", tokenDecimals), rate), tokenDecimals),
                })),
            };
        });
        // The key carries every rate the projection reads.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sellerCatalogs, sellerRatesKey, tokenDecimals]);
    // No post-place redirect: in the bilateral relay the buyer signs + shares,
    // then stays on the share panel; each order commits when its seller
    // counter-signs in their /orders list. The buyer is never the broadcaster here.

    if (catalogsLoading) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-ink-muted mb-3">Checkout</p>
                <h1 className="text-3xl font-bold text-ink-primary">Loading…</h1>
            </div>
        );
    }

    if (!memberCatalog) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl space-y-4">
                <p className="text-xs font-semibold text-ink-muted mb-3">Member not found</p>
                <h1 className="text-3xl font-bold text-ink-primary">No member page for {truncateHex(sellerAddressLower, { head: 10, tail: 0 })}</h1>
                <Link href="/discover" className="inline-block underline text-sm text-ink-primary hover:text-ink-body">
                    ← Back to discover
                </Link>
            </div>
        );
    }

    // Sub-orders the adopting seller's catalog leaves UNBOUND take the buyer's
    // checkout-time choice; bound sub-orders keep the catalog's designation
    // (seller-assigned). The fill mechanism is DERIVED from binding state +
    // composition — there is no coordination field.
    const unboundSubOrders = subOrderPlan.filter((p) => !p.seller);
    // Any order that composes an on-network contract (the sixth noun) —
    // discovered by reading `block.design.composes` + `block.runtime.fields`
    // off the clause spec, naming no clause and no interface. Applies to ANY
    // order (root, sub, 136th), not just sub-orders. The buyer fills each
    // composition's runtime input fields below.
    const orderCompositions = ((): OrderComposition[] => {
        if (!pickedAssembly) return [];
        const out: OrderComposition[] = [];
        for (const order of pickedAssembly.assemblyTemplate.agreements) {
            for (const cid of Object.keys(order.clauses)) {
                const block = getClauseSpec(cid, templateClauseVersion(order, cid))?.block;
                if (block?.design.composes && block.runtime.fields.length > 0) {
                    out.push({ nodeId: order.id, clauseId: cid, interface: block.design.composes.interface, fields: block.runtime.fields });
                    break; // one composition per order
                }
            }
        }
        return out;
    })();
    // A composition never supplies a counterparty: it invokes an on-network
    // contract, it does not name a seller. So every unbound sub-order is the
    // buyer's pick, whether or not the order also composes.
    const buyerPickSubOrders = unboundSubOrders;
    const buyerChoosesCounterparty = buyerPickSubOrders.length > 0;
    // Every composition's REQUIRED block.runtime.fields must be filled before
    // placing — the same emptiness rule the general-clause fill gate applies.
    const compositionsReady = orderCompositions.every((c) =>
        c.fields.every((f) => !f.required || isFilledValue(compositionInputs[c.nodeId]?.[f.name])),
    );
    // Ready to place when a profile-bound assembly is resolved (chosen, when the
    // seller offers more than one), any buyer-chosen counterparty is selected,
    // and every composition's runtime inputs are complete.
    const orderReady = !!pickedAssembly
        && !!currency
        && decimalsReady
        && !conversionBlocked
        && (!buyerChoosesCounterparty || !!sellerSelection || !!raceOutcome)
        && compositionsReady;
    // The root order carries the design-time clauses the buyer is bonding to.
    // Surfaced inline below so the buyer reviews the terms before placing the
    // order; the final per-order sign confirmation is the shared agreement-preview
    // gate (the same one the seller's accept uses).
    const pickedRoot = pickedAssembly
        ? (pickedAssembly.assemblyTemplate.agreements.find((o) => templateParentOrderHashes(o).length === 0)
            ?? pickedAssembly.assemblyTemplate.agreements[0])
        : undefined;
    const cartTotal = cartItems.reduce(
        (sum, item) => sum + toCurrency(parseToken(item.price || "0", tokenDecimals)) * BigInt(item.quantity),
        0n,
    );

    // Multi-order price transparency — derived in lib/checkout/checkoutDerivations
    // from the SAME plans + fills the commit walks, memoized here.
    // Plain call (not useMemo): this section sits below the page's early
    // returns, where hooks can't run — and the pre-extraction code
    // recomputed per render too. The win is the PURITY, in lib.
    const kitBreakdown = deriveKitBreakdown({
        pickedAssembly,
        leadAddress: memberCatalog.address as `0x${string}`,
        sellerCatalogs,
        pricedCatalogs,
        cartTotal,
        clauseFills: expandedClauseFills,
        subOrderQuantities,
        tokenDecimals,
        raceOutcome,
        sellerSelection,
        toCurrency: pickToCurrency,
    });

    // The buyer commits EVERY order in the plan (buyer == rootBuyer on each
    // — the star shape): 2× payment locked per order, payment to that
    // order's seller + an equal refundable bond. Aggregate over the WHOLE
    // plan — a root-only figure under-reports every multi-order checkout.
    const planTotal = kitBreakdown ? kitBreakdown.total : cartTotal;
    // The plan with no per-unit rounding: each converted seller's quoted
    // input, every other part as priced — what the conversion note compares.
    const unroundedPlanTotal = allConversions.reduce(
        (sum, c) => sum + (c.need.kind === "none" ? c.basisTotal : currentQuotes?.[c.seller]?.result?.amountIn ?? 0n),
        0n,
    ) + (raceOutcome && kitBreakdown ? parseToken(raceOutcome.selection.price, tokenDecimals) : 0n);
    const lockedTotal = planTotal > 0n ? calculateBonds(planTotal, planTotal).buyerBond : 0n;
    const hasInsufficientBalance = !!buyer && tokenBalance !== undefined && balance < lockedTotal;
    // Where the chosen funding token stands with Permit2 — the one derived
    // state the funding panel shows and the place-order button obeys.
    const buyerFunding = fundingAuthorization({
        fundingToken,
        allowanceKnown: permit2Funding.allowanceKnown && !permit2Funding.isAllowanceRefetching,
        needsApproval: permit2Funding.needsApproval(lockedTotal),
        isAuthorizing: permit2Funding.isApprovePending || permit2Funding.isApproveConfirming,
    });

    // Every order in the assembly — root + sub-orders — surfaced for review:
    // the buyer signs and bonds ALL of them. Each clause renders its COMPOSED
    // values (the terms the buyer is agreeing to), spec-driven. Mandatory
    // clauses (e.g. the topology clause) are protocol-composed, not
    // buyer-chosen terms; they stay out of the review.
    const agreementGroups = deriveAgreementGroups({
        pickedAssembly,
        leadAddress: memberCatalog.address as `0x${string}`,
        sellerCatalogs,
    });
    // The REQUIRED terms the buyer still has to author — the same required-ness
    // the off-chain validator applies at the sign gate, applied HERE so the
    // button never promises what the validator will refuse, and so the buyer
    // reads which term is missing instead of a spec path.
    const missingFills = unfilledRequiredFills(agreementGroups, clauseFills);
    // The terms are placeable when their specs are real (not a half-warm cache)
    // and every required field is filled.
    const termsReady = clauseSpecsLoaded && missingFills.length === 0;

    const cartUnitSystem = memberCatalog.unitSystem ?? "metric";
    const cartMassGrams = cartItems.reduce((sum, cartItem) => {
        const catalogItem = memberCatalog.items.find((m) => m.id === cartItem.catalogItemId);
        if (!catalogItem?.massGrams) return sum;
        return sum + catalogItem.massGrams * cartItem.quantity;
    }, 0);
    const cartVolumeMl = cartItems.reduce((sum, cartItem) => {
        const catalogItem = memberCatalog.items.find((m) => m.id === cartItem.catalogItemId);
        if (!catalogItem?.volumeMl) return sum;
        return sum + catalogItem.volumeMl * cartItem.quantity;
    }, 0);

    // ONE walk-params construction — the race's dry draft walks and the final
    // commit walk MUST build from identical inputs (the walk's digest
    // assertion refuses a drift), so both read this single builder. Null until
    // the prerequisites the checkout guards on are present.
    const buildWalkParams = (): AssemblyCheckoutParams | null => {
        if (!buyer || !pickedAssembly || !currency) return null;
        const manualSelections = buyerChoosesCounterparty && sellerSelection
            ? Object.fromEntries(buyerPickSubOrders.map(({ node }) => [
                node.id,
                {
                    seller: sellerSelection.seller,
                    price: formatToken(pickToCurrency(parseToken(sellerSelection.price, tokenDecimals)), tokenDecimals),
                    item: { id: sellerSelection.item.id, name: sellerSelection.item.name },
                },
            ]))
            : {};
        // A race winner overlays the manual pick for its node — the pick IS
        // the winner; its price is already in the process denomination.
        const selections = {
            ...manualSelections,
            ...(raceOutcome ? { [raceOutcome.nodeId]: raceOutcome.selection } : {}),
        };
        return {
            buyer,
            leadSellerAddress: memberCatalog.address as `0x${string}`,
            currency,
            payment: cartTotal,
            lineItems: cartItems.map((item) => ({
                itemId: item.catalogItemId,
                name: item.name,
                quantity: item.quantity,
                // Cart prices were snapshotted in the seller's default
                // (the unit of account); the committed unit price is in
                // the process denomination.
                unitPrice: toCurrency(parseToken(item.price, tokenDecimals)).toString(),
                massGrams: item.massGrams,
                volumeMl: item.volumeMl,
                lengthMm: item.lengthMm,
                widthMm: item.widthMm,
                heightMm: item.heightMm,
                clauseValues: item.clauseValues,
            })),
            assembly: pickedAssembly,
            sellerCatalogs: pricedCatalogs,
            tokenDecimals,
            subOrderSelections: Object.keys(selections).length > 0 ? selections : undefined,
            subOrderCompositions: orderCompositions.length > 0
                ? Object.fromEntries(orderCompositions.map((c) => [
                    c.nodeId,
                    { interface: c.interface, fieldValues: compositionInputs[c.nodeId] ?? {} },
                ]))
                : undefined,
            subOrderQuantities,
            clauseFills: expandedClauseFills,
        };
    };

    // Start the race for the first unbound sub-order — the raced position.
    // Racing several positions is sequential: each winner enters the
    // selections before the next race starts. Window, candidate count, and
    // the quotes-leg ceiling all arrive from the panel — checkout-time buyer
    // policy, never stored; the buyer can always close early.
    const handleRaceStart = (policy: RaceStartPolicy) => {
        const checkout = buildWalkParams();
        const racedNode = buyerPickSubOrders[0]?.node;
        if (!checkout || !racedNode) return;
        void race.start({
            checkout,
            racedNodeId: racedNode.id,
            windowMs: policy.windowMs,
            maxCandidates: policy.maxCandidates,
            quote: policy.ceiling ? { ceiling: parseToken(policy.ceiling, tokenDecimals) } : undefined,
        });
    };

    const executeCheckout = async () => {
        if (!buyer) {
            setCheckoutError("Connect your wallet to place an order.");
            return;
        }
        if (cartItems.length === 0) return;
        if (!orderReady) {
            setCheckoutError("Choose how you'd like to order before placing it.");
            return;
        }
        const leadSellerAddress = memberCatalog.address as `0x${string}`;
        // Every order commits against a published, profile-bound assembly — no
        // synthesized fallback. `orderReady` already guarantees this; assert it
        // for the type. FigaroCore sees a linear commit chain; the parent edges
        // are off-chain topology reconstructed from the assembly.
        if (!pickedAssembly) {
            setCheckoutError("This seller has no published assembly to order from.");
            return;
        }
        // `pickedRoot` (computed in render scope) carries the design-time clause
        // choices, spread verbatim — the checkout names no clause.
        if (!pickedRoot) {
            setCheckoutError("This assembly has no root order.");
            return;
        }
        try {
            setCheckoutError(null);
            // No declared denomination ⇒ no order (resolved-empty = absence).
            // orderReady already gates the button; this guards the path + narrows the type.
            if (!currency) { setCheckoutError("This seller hasn't set a denomination."); return; }
            // The whole commit algorithm — root prepare/validate, the bilateral
            // single-order relay, or the multi-order walk (sub-orders signed +
            // relayed to their bound sellers, root through the buyer-share-panel
            // last) — lives in lib/checkout/assemblyCheckout. The surface keeps
            // guards and error display only. A completed race adds its
            // reproduction inputs (fixed salts + deadline) and the winner's
            // countersignature.
            const walkParams = buildWalkParams();
            if (!walkParams) { setCheckoutError("The order inputs are incomplete."); return; }
            await executeAssemblyCheckout(
                raceOutcome
                    ? {
                        ...walkParams,
                        salt: raceOutcome.salt,
                        deadline: raceOutcome.deadline,
                        subOrderRace: { [raceOutcome.nodeId]: raceOutcome.race },
                    }
                    : walkParams,
                {
                    chainId,
                    readResolveCap: async () => {
                        if (!publicClient) throw new Error("No chain connection — cannot verify the resolve ceiling.");
                        return maxOrdersResolvablePerProcess(publicClient);
                    },
                    // The buyer's funding choice binds here: every order the
                    // walk signs (root and sub-orders alike) carries its own
                    // witness-signed swap leg when a funding token is chosen.
                    signRoot: (p) => signRoot(p, fundingToken ? { inputToken: fundingToken } : undefined),
                    // An AGENT winner (declared services.rest) also receives the
                    // commit-ready payload at its endpoint — a wallet with no
                    // browser open still gets its order and broadcasts itself.
                    // The channel relay still goes out; dual delivery is
                    // harmless and the endpoint failing never blocks checkout.
                    signAndShare: async (p, opts) => {
                        const payload = await signAndShare(p, fundingToken ? { inputToken: fundingToken } : undefined, opts);
                        if (opts?.sellerSig && raceOutcome?.endpoint && hexEqual(p.commitment.seller, raceOutcome.selection.seller)) {
                            await postToAgentEndpoint(raceOutcome.endpoint, payload).catch(() => undefined);
                        }
                        return payload;
                    },
                    compose,
                },
            );
        } catch (cause: unknown) {
            const msg = extractErrorMessage(cause, "Signing failed");
            setCheckoutError(msg);
        }
    };

    const handlePlaceOrder = () => {
        if (!buyer) {
            connectInjected();
            return;
        }
        if (cartItems.length === 0) return;
        if (hasInsufficientBalance && !fundingToken) {
            setCheckoutError(
                `Insufficient balance. Required: ${formatToken(lockedTotal, tokenDecimals)}, available: ${formatToken(balance, tokenDecimals)}`
                + (fundingCandidates.length > 0 ? " — or fund your bond from another accepted token below." : ""),
            );
            return;
        }
        if (fundingBlocksTheAct(buyerFunding)) {
            setCheckoutError("Authorize the funding token first — the one-time Permit2 approval below.");
            return;
        }
        setCheckoutError(null);
        try {
            runWithApproval(lockedTotal, () => void executeCheckout());
        } catch {
            setCheckoutError("Payment authorization failed. Please try again.");
        }
    };

    // Place-order accepts a NEW order only from a clean slate. Every
    // in-flight state (signing → awaiting-counter → ready → broadcasting)
    // AND the completed one (done) keep the button disabled — re-clicking
    // would sign a SECOND commitment for the same cart. A fresh order
    // starts from the browse page (new cart, fresh mount); `error`
    // re-enables for retry.
    const placingOrder = commitStep !== "idle" && commitStep !== "error";

    return (
        <div data-testid="checkout-view" data-seller-address={sellerAddressLower} className="container mx-auto px-6 py-10 max-w-2xl space-y-6">
            <div>
                <Link href={`/s/view?seller=${sellerAddressLower}`} className="text-sm text-ink-muted hover:text-ink-primary">
                    ← Back to {memberCatalog.name}
                </Link>
            </div>

            <header className="space-y-1">
                <p className="text-xs font-semibold text-ink-muted">Checkout</p>
                <h1 className="text-2xl font-bold text-ink-primary">Order from {memberCatalog.name}</h1>
            </header>

            <section
                className="rounded-lg border border-default bg-paper p-5 space-y-4"
                data-testid="checkout-cart"
            >
                {cartItems.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                        Your cart is empty.{" "}
                        <Link href={`/s/view?seller=${sellerAddressLower}`} className="underline text-ink-primary hover:text-ink-body">
                            Browse {memberCatalog.name}&apos;s catalog
                        </Link>{" "}
                        to add items.
                    </p>
                ) : (
                    <>
                        {/* Read-only line items — the buyer's selection, edited on browse. */}
                        <CartLineList items={cartItems} tokenSymbol={basisSymbol} emphasizePrice />

                        {/* THE PAYMENT TOKEN — the buyer's pick from the seller's
                            accepted array (the social layer). The pick IS the
                            process denomination: recorded in the commitment,
                            bonded 2×, received by the seller. Quoted prices
                            convert at the venue rate. A designer's denomination
                            pin replaces the pick entirely; a single-entry array
                            offers no choice. */}
                        {!utilityTokenPin && currency && (memberCatalog?.acceptedTokens?.length ?? 0) > 1 && (
                            <div className="border-t border-default pt-3 space-y-1" data-testid="payment-token-picker">
                                <p className="text-xs font-semibold text-ink-muted">Pay in</p>
                                <div className="flex flex-wrap gap-3 text-sm">
                                    {memberCatalog!.acceptedTokens!.map((t) => (
                                        <label key={t.address} className="flex items-center gap-1.5 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="payment-token"
                                                data-testid={`payment-token-${t.symbol}`}
                                                checked={hexEqual(currency, t.address)}
                                                onChange={() => setPaymentPick(
                                                    sellerDefault && hexEqual(t.address, sellerDefault)
                                                        ? null
                                                        : (t.address as `0x${string}`),
                                                )}
                                            />
                                            <span>{t.symbol}</span>
                                            {sellerDefault && hexEqual(t.address, sellerDefault) && (
                                                <span className="text-xs text-ink-faint">(list price)</span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        {utilityTokenPin && (
                            <p className="text-xs text-ink-muted border-t border-default pt-3" data-testid="payment-token-pinned">
                                This assembly is denominated by design{tokenSymbol ? ` — every bond and payment moves in ${tokenSymbol}` : ""}.
                            </p>
                        )}
                        {/* The conversion, when the denomination is not a
                            seller's list-price token: each such seller's part
                            of the plan quoted on the pool THAT seller declared
                            for it, and shown as the rate its part commits at.
                            A seller with no declared pool, no venue, or a pool
                            that cannot fill the amount each says so — naming
                            the seller — and offers no conversion. */}
                        {needsConversion && (
                            <div className="border-t border-default pt-3 space-y-2 text-xs" data-testid="payment-token-conversion">
                                {!swapFundingContracts && conversions.some((c) => c.need.kind === "declared") && (
                                    <p className="text-error-fg" data-testid="payment-token-no-venue">
                                        No conversion venue is configured — prices can&apos;t be quoted in this
                                        token.{!utilityTokenPin && " Pick the list-price token to order."}
                                    </p>
                                )}
                                {conversions.map((c) => {
                                    const isLead = hexEqual(c.seller, memberCatalog.address);
                                    const name = displayNameForAddress(sellerCatalogs, c.seller);
                                    const cBasisSymbol = isLead
                                        ? basisSymbol
                                        : sellerCatalogs.find((x) => hexEqual(x.address, c.seller))?.acceptedTokens
                                            ?.find((t) => !!c.quoteBasis && hexEqual(t.address, c.quoteBasis))?.symbol ?? "";
                                    const quote = currentQuotes?.[c.seller];
                                    return (
                                        <div key={c.seller} className="space-y-1" data-testid={`payment-token-conversion-${c.seller}`}>
                                            {c.need.kind === "undeclared" ? (
                                                <p className="text-error-fg" data-testid="payment-token-no-pool">
                                                    {name} declares no pool converting {tokenSymbol || "this token"} into{" "}
                                                    {cBasisSymbol || "its list-price token"}, so its prices can&apos;t be quoted in{" "}
                                                    {tokenSymbol || "it"}.{isLead && !utilityTokenPin && ` Pick ${basisSymbol || "the list-price token"} to order.`}
                                                </p>
                                            ) : c.need.kind !== "declared" || !swapFundingContracts || c.basisTotal === 0n ? null : quote?.error ? (
                                                <p className="text-error-fg" data-testid="payment-token-quote-error">
                                                    {name}&apos;s declared pool (fee tier {formatFeeTier(c.need.feeTier)}) can&apos;t
                                                    quote its part of this order: {quote.error}
                                                </p>
                                            ) : quote?.result ? (
                                                <>
                                                    <p className="text-ink-muted" data-testid="payment-token-quote">
                                                        {name}: quoted on its declared pool (fee tier{" "}
                                                        {formatFeeTier(quote.result.feeTier)}):{" "}
                                                        {formatToken(quote.result.basisTotal, quote.result.basisDecimals)}{" "}
                                                        {cBasisSymbol} costs{" "}
                                                        <span className="tabular-nums" data-testid="payment-token-quoted-input">
                                                            {formatToken(quote.result.amountIn, tokenDecimals)}
                                                        </span>{" "}
                                                        {tokenSymbol}.
                                                    </p>
                                                    <p className="text-ink-muted" data-testid="payment-token-effective-rate">
                                                        Effective rate: 1 {cBasisSymbol} = {formatToken(effectiveUnitCost(quote.result), tokenDecimals)}{" "}
                                                        {tokenSymbol}.
                                                    </p>
                                                </>
                                            ) : (
                                                <p className="text-ink-muted">Quoting {name}&apos;s declared pool…</p>
                                            )}
                                        </div>
                                    );
                                })}
                                {!conversionBlocked && (
                                    <p className="text-ink-muted" data-testid="payment-token-committed">
                                        The order commits{" "}
                                        <span className="tabular-nums" data-testid="payment-token-committed-total">
                                            {formatToken(planTotal, tokenDecimals)}
                                        </span>{" "}
                                        {tokenSymbol}
                                        {planTotal !== unroundedPlanTotal
                                            ? " — each unit price rounds up, so no seller is short of its price"
                                            : ""}.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="border-t border-default pt-3 space-y-1.5 text-sm">
                            {kitBreakdown ? (
                                <div className="space-y-1" data-testid="cart-contributor-breakdown">
                                    {kitBreakdown.rows.map((row, i) => (
                                        <div key={i}>
                                            <div className="flex justify-between">
                                                <span className="text-ink-body">{row.name}</span>
                                                <span className="text-ink-primary tabular-nums">
                                                    {formatToken(row.payment, tokenDecimals)}
                                                </span>
                                            </div>
                                            {/* Rate derivation — the P&L shows HOW the figure was
                                                priced before the buyer signs it. Billed per started
                                                unit; the same numbers commit as the line item. */}
                                            {row.pricing?.item?.pricingPolicy === "rate" && !row.pricing.issue && (
                                                <div
                                                    className="flex justify-between text-xs text-ink-muted"
                                                    data-testid={`rate-derivation-${row.nodeId}`}
                                                >
                                                    <span>
                                                        {row.pricing.resolvedUnits !== null && row.pricing.resolvedUnits !== row.pricing.billedQuantity
                                                            ? `${row.pricing.resolvedUnits.toFixed(2)} ${row.pricing.item.rateUnit ?? "unit"} → billed ${row.pricing.billedQuantity}`
                                                            : `billed ${row.pricing.billedQuantity} ${row.pricing.item.rateUnit ?? "unit"}`}
                                                        {" × "}
                                                        {formatToken(row.pricing.unitPrice, tokenDecimals)}
                                                        {tokenSymbol ? ` ${tokenSymbol}` : ""}/{row.pricing.item.rateUnit ?? "unit"}
                                                    </span>
                                                </div>
                                            )}
                                            {row.pricing?.item?.rateQuantitySource === "checkout-quantity" && (
                                                <label className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-body">
                                                    <span>{row.pricing.item.rateUnit ?? "unit"}s</span>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        step={1}
                                                        value={subOrderQuantities[row.nodeId!] ?? ""}
                                                        placeholder="1"
                                                        onChange={(e) => {
                                                            const n = Number(e.target.value);
                                                            setSubOrderQuantities((prev) => ({
                                                                ...prev,
                                                                [row.nodeId!]: Number.isFinite(n) && n > 0 ? n : 0,
                                                            }));
                                                        }}
                                                        className="w-20 rounded border border-default px-2 py-1 text-right text-sm"
                                                        data-testid={`rate-quantity-input-${row.nodeId}`}
                                                    />
                                                </label>
                                            )}
                                            {row.pricing?.issue === "unresolvable-quantity" &&
                                                row.pricing.item?.rateQuantitySource !== "checkout-quantity" && (
                                                <p className="text-xs text-error-fg" data-testid={`rate-unresolvable-${row.nodeId}`}>
                                                    Priced by rate ({row.pricing.item?.rateUnit ?? "unit"}), but this order
                                                    carries no value its quantity source can read.
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                    <div className="flex justify-between border-t border-default pt-1.5 font-medium">
                                        <span className="text-ink-body">Total to all sellers</span>
                                        <span className="text-ink-primary tabular-nums" data-testid="cart-kit-total">
                                            {formatToken(kitBreakdown.total, tokenDecimals)}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex justify-between">
                                    <span className="text-ink-body">Payment to seller</span>
                                    <span className="text-ink-primary tabular-nums">
                                        {formatToken(cartTotal, tokenDecimals)}
                                    </span>
                                </div>
                            )}
                            {/* The doubling on ONE line. Split across a payment
                                row and a bond row it read as 1:1 — the eye takes
                                "payment X · bond X" and stops, against copy that
                                says twice the payment. The arithmetic is stated
                                where the figure is: 2X = X + X, in the lexicon's
                                words (the payment TRANSFERS, the bond is
                                REFUNDED). The total keeps its own testid as a
                                bare number — specs read it. */}
                            <div className="flex justify-between border-t border-default pt-1.5 font-semibold">
                                <span className="text-ink-primary">Locked at commit</span>
                                <span className="text-ink-primary tabular-nums" data-testid="checkout-locked-total">
                                    {formatToken(lockedTotal, tokenDecimals)}
                                </span>
                            </div>
                            <p className="text-xs text-ink-body leading-relaxed" data-testid="checkout-bond-arithmetic">
                                {formatToken(lockedTotal, tokenDecimals)}{tokenSymbol ? ` ${tokenSymbol}` : ""} = twice the
                                {kitBreakdown ? " total" : " payment"}: {formatToken(planTotal, tokenDecimals)} transfers to
                                {kitBreakdown ? " the sellers" : " the seller"} when you resolve, and{" "}
                                {formatToken(planTotal, tokenDecimals)} is your bond, refunded to you in the same
                                transaction.
                            </p>
                            <p className="text-[11px] text-ink-muted pt-1.5 leading-relaxed" data-testid="checkout-bond-rationale">
                                Both you and the seller lock a bond against this trade, so cooperation is the
                                seller&apos;s only profitable move — no arbitrator, no timeout. You
                                alone resolve it; your bond returns when you do, and you pay only the price above.
                            </p>
                            {(cartMassGrams > 0 || cartVolumeMl > 0) && (
                                <div
                                    className="flex justify-between text-[11px] text-ink-muted pt-1.5 border-t border-default"
                                    data-testid="cart-logistics-total"
                                >
                                    <span>Shipment</span>
                                    <span className="tabular-nums">
                                        {cartMassGrams > 0 ? formatMass(cartMassGrams, cartUnitSystem) : ""}
                                        {cartMassGrams > 0 && cartVolumeMl > 0 ? " · " : ""}
                                        {cartVolumeMl > 0 ? formatVolume(cartVolumeMl, cartUnitSystem) : ""}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Inline agreement terms — the clauses the buyer is
                            bonding to, read straight from the assembly. A pre-sign
                            review; the per-order wallet sign is then confirmed in
                            the shared agreement-preview modal. */}
                        {agreementGroups.length > 0 && (
                            <div className="space-y-2 border-t border-default pt-3" data-testid="checkout-agreement-terms">
                                <p className="text-xs font-semibold text-ink-muted">Agreement</p>
                                {/* Held until the specs are real: read against a
                                    half-warm cache a clause has no fields, so it
                                    renders as a bare title with no controls and
                                    the sign gate then refuses the terms the form
                                    never offered. */}
                                {!clauseSpecsLoaded && (
                                    <p className="text-xs text-ink-muted" data-testid="checkout-terms-loading">
                                        Reading the clause specs these terms are written in…
                                    </p>
                                )}
                                {clauseSpecsLoaded && agreementGroups.map((group) => (
                                    <div key={group.key} className="space-y-0.5" data-testid={`agreement-order-${group.key}`}>
                                        {agreementGroups.length > 1 && (
                                            <p className="text-[11px] font-medium text-ink-muted">{group.label}</p>
                                        )}
                                        <ul className="text-xs text-ink-body space-y-0.5">
                                            {group.clauses.map(({ clauseId, version, values, data, fillable, mandatory }) => {
                                                const spec = getClauseSpec(clauseId, version);
                                                const specFields = spec?.fields ?? [];
                                                return (
                                                <li key={clauseId} data-testid={`agreement-clause-${clauseId}`}>
                                                    {spec?.title ?? clauseId}
                                                    {mandatory && (
                                                        <span className="text-ink-muted text-xs" data-testid={`agreement-clause-${clauseId}-required`}> · required by the assembly</span>
                                                    )}
                                                    {values && <span className="text-ink-primary"> — {values}</span>}
                                                    <CredentialVerifyButton data={data} />
                                                    {fillable && (
                                                        <div className="mt-1 mb-2 ml-3 space-y-2">
                                                            {/* The SAME list the place-order gate
                                                                checks (`buyerAuthoredFields`), so no
                                                                required term can be demanded without
                                                                a control on screen. */}
                                                            {buyerAuthoredFields(clauseId, version).map((field) => {
                                                                const inputFormat = resolveInputFormat(field, specFields, clauseFills[group.key]?.[clauseId]);
                                                                return (
                                                                <FieldControl
                                                                    key={field.name}
                                                                    field={field}
                                                                    value={clauseFills[group.key]?.[clauseId]?.[field.name]}
                                                                    onChange={(v) => setClauseFill(group.key, clauseId, field.name, v)}
                                                                    testId={`checkout-field-${group.key}-${clauseId}-${field.name}`}
                                                                    hideLabel={field.name.toLowerCase() === (spec?.title ?? "").toLowerCase()}
                                                                    resolvedFormat={inputFormat}
                                                                    siblingFormatSource={isSiblingFormatSource(field, specFields)}
                                                                    presets={inputFormat ? formatPresets[inputFormat] : undefined}
                                                                />
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                ))}
                                {/* What is still owed, named the way the buyer
                                    reads it — the validator's own required-ness,
                                    before the wallet opens instead of after. */}
                                {clauseSpecsLoaded && missingFills.length > 0 && (
                                    <p className="text-xs text-warning-fg" data-testid="checkout-missing-fills">
                                        Still to fill: {missingFills
                                            .map((m) => `${m.clauseTitle} · ${m.fieldLabel}${agreementGroups.length > 1 ? ` (${m.groupLabel})` : ""}`)
                                            .join("; ")}
                                    </p>
                                )}
                                <p className="text-[11px] text-ink-faint">
                                    Placing the order signs {agreementGroups.length > 1 ? "these agreements" : "this agreement"} and locks your bond.
                                </p>
                            </div>
                        )}

                        {/* Which bound assembly to order from — shown only when the
                            seller offers more than one. The options + labels come
                            from the assemblies themselves; the checkout hardcodes
                            no modality. */}
                        {assemblyOptions.length === 1 && (
                            <div>
                                <p className="text-xs font-semibold text-ink-muted mb-1">Method</p>
                                <p
                                    className="text-sm text-ink-primary"
                                    data-testid="method-static"
                                    data-method={assemblyOptions[0].slug}
                                >
                                    {assemblyOptions[0].name}
                                </p>
                            </div>
                        )}
                        {assemblyOptions.length > 1 && (
                            <div>
                                <label
                                    htmlFor="method-select"
                                    className="text-xs font-semibold text-ink-muted mb-1 block"
                                >
                                    Method
                                </label>
                                <select
                                    id="method-select"
                                    value={selectedSlug ?? ""}
                                    onChange={(e) =>
                                        setSelectedSlug(e.target.value === "" ? undefined : e.target.value)
                                    }
                                    className="w-full rounded border border-default bg-surface px-3 py-2 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
                                    data-testid="select-method"
                                >
                                    <option value="" data-testid="option-method-unset">
                                        Select one
                                    </option>
                                    {assemblyOptions.map((opt) => (
                                        <option key={opt.slug} value={opt.slug} data-testid={`option-method-${opt.slug}`}>
                                            {opt.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Buyer-assigned: the catalog leaves the sub-order
                            unbound — the buyer chooses the counterparty here,
                            priced from that seller's own catalog.
                            Checkout-phase data, like the cart. The dispatch
                            race below fills the SAME derived absence by racing
                            the market instead — race vs manual pick is
                            checkout-time buyer behavior, never stored. */}
                        {buyerChoosesCounterparty && (
                            <>
                                {!raceOutcome && (
                                    <SellerCatalogPicker
                                        tokenSymbol={tokenSymbol}
                                        onSelect={setSellerSelection}
                                    />
                                )}
                                <DispatchRacePanel
                                    race={race}
                                    onStart={handleRaceStart}
                                    tokenSymbol={tokenSymbol}
                                    decimals={tokenDecimals}
                                />
                            </>
                        )}

                        {/* Swap-funded bond leg: shown when the buyer's balance
                            in the process currency can't cover the locked total
                            and the seller accepts other tokens the coordinator
                            can swap from. */}
                        {hasInsufficientBalance && fundingCandidates.length > 0 && buyer && (
                            <SwapFundingPanel
                                candidates={fundingCandidates}
                                party={buyer}
                                currencySymbol={tokenSymbol}
                                decimals={tokenDecimals}
                                fundingToken={fundingToken}
                                onSelect={setFundingToken}
                                authorization={buyerFunding}
                                onAuthorize={() => permit2Funding.approve(maxUint256)}
                            />
                        )}
                        {permit2Funding.isApproveError && (
                            <p className="text-error-fg text-xs" data-testid="funding-authorize-error">
                                The funding token was not authorized: the wallet refused it or the transaction reverted.
                            </p>
                        )}

                        {/* On-network composition inputs (the sixth noun): any
                            order whose clause declares block.design.composes +
                            block.runtime.fields gets those runtime fields
                            rendered here generically — one form, naming no
                            clause or interface — a novel composition surfaces
                            its own fields with zero code. */}
                        {orderCompositions.map((c) => (
                            <div key={c.nodeId} data-testid={`composition-${c.nodeId}`} className="space-y-2">
                                {c.fields.map((field) => (
                                    <FieldControl
                                        key={field.name}
                                        field={field}
                                        mode="runtime"
                                        value={compositionInputs[c.nodeId]?.[field.name]}
                                        onChange={(v) => setCompositionField(c.nodeId, field.name, v)}
                                        testId={`composition-${c.nodeId}-${field.name}`}
                                    />
                                ))}
                            </div>
                        ))}

                        <p className="text-xs text-ink-muted" data-testid="checkout-security-link">
                            What you sign is the hash of the agreement above, and you can check it yourself.{" "}
                            <Link href="/core/faq#signing" className="underline text-ink-primary hover:text-ink-body">
                                How &rarr;
                            </Link>
                        </p>

                        {chainId !== DEVNET_CHAIN_ID && deploymentFp && (
                            <p className="text-xs text-ink-muted" data-testid="checkout-deployment-fingerprint">
                                You can also check the contract addresses this site was built with before you send it: they fingerprint to <span className="font-mono break-all">sha256:{deploymentFp}</span>, which must match the canonical deployment record.{" "}
                                <a href="/docs/protocol/contracts/#canonical-deployments" className="underline text-ink-primary hover:text-ink-body">
                                    How &rarr;
                                </a>
                            </p>
                        )}

                        <Button
                            onClick={handlePlaceOrder}
                            disabled={
                                isApproving
                                || placingOrder
                                || cartItems.length === 0
                                || !orderReady
                                || !termsReady
                                || fundingBlocksTheAct(buyerFunding)
                            }
                            data-testid="btn-place-order"
                            className="w-full"
                        >
                            {!buyer
                                ? "Connect wallet to order"
                                : isApproving
                                    ? "Approving payment…"
                                    : placingOrder
                                        ? "Placing order…"
                                        : buyerFunding === "needed"
                                            ? "Authorize the funding token first"
                                        : fundingBlocksTheAct(buyerFunding)
                                            ? "Checking the funding authorization…"
                                        : !currency
                                            ? "Seller hasn't set a denomination"
                                            : !orderReady
                                                ? "Select an option to order"
                                                : !clauseSpecsLoaded
                                                    ? "Reading the agreement terms…"
                                                    : missingFills.length > 0
                                                        ? "Fill the required terms above"
                                                        : "Place order"}
                        </Button>

                        {(checkoutError || commitError) && (
                            <p className="text-sm text-error-fg" data-testid="seller-checkout-error">
                                {checkoutError ?? commitError}
                            </p>
                        )}

                        {commitStep === "awaiting-seller" && payload && (
                            <div className="pt-2" data-testid="buyer-share-panel">
                                <CommitmentSharePanel
                                    payload={payload}
                                    step={commitStep}
                                    tokenDecimals={tokenDecimals}
                                />
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

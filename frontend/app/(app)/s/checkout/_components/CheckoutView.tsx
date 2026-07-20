"use client";

/**
 * CheckoutView — the buyer's order surface at `/s/checkout?seller=<address>`.
 *
 * Driven EXCLUSIVELY by the seller's bound assembly. The checkout names no
 * clause and knows no modality: it resolves the assembly from the seller's
 * profile, walks the assembly's own topology + clauses, computes the bond,
 * validates Layer A, runs the bilateral / multi-order commit, and redirects to
 * `/orders/view?process=<processId>`. Every order's clauses come straight from the assembly
 * template; every sub-order's seller is resolved generically from the assembly's
 * `counterpartyBindings`. No courier picker, no modality taxonomy, no
 * buyer-set pricing — those are the assembly's concerns, not the checkout's.
 *
 * The cart is read-only here: it is the buyer's line-item selection, edited on
 * the browse page. Checkout reads it, it does not mutate it.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import { maxOrdersResolvablePerProcess } from "@/lib/shared/chainGasCeilings";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { useCommerce, useCheckout } from "@/lib/checkout";
import { useCartStore } from "@/lib/checkout/cartStore";
import { useRegisteredCatalogues } from "@/lib/seller/useRegisteredCatalogues";
import { fillProfileSections, planSubOrderSellers, profileValuesFor, readDenominationPin, resolveSubOrderPricing, type SubOrderPricing } from "@figaro/sdk";
import { executeAssemblyCheckout } from "@/lib/checkout/assemblyCheckout";
import { templateParentOrderHashes } from "@/lib/shared/assemblyTemplate";
import { CommitmentSharePanel } from "@/components/runtime/CommitmentSharePanel";
import { SellerCataloguePicker, type SellerSelection } from "@/components/runtime/SellerCataloguePicker";
import { useCompositionActions } from "@/lib/composition/useCompositionActions";
import { inputForOutput, readVenueRate, resolveSwapFundingContracts, type VenueRate } from "@/lib/composition/swapFunding";
import { SwapFundingPanel } from "./SwapFundingPanel";
import useTokenApproval from "@/hooks/useTokenApproval";
import { maxUint256 } from "viem";
import { FieldControl } from "@/components/runtime/FieldControl";
import { useTokenSymbol } from "@/components/sellers/TokenAddressInput";
import { calculateBonds } from "@figaro/sdk";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual, normalizeAddressParam, ZERO_ADDRESS } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatToken, parseToken } from "@/lib/shared/utils";
import { useSellerBoundAssemblies } from "@/lib/seller/useSellerBoundAssemblies";
import { displayNameForAddress } from "@/lib/seller/sellerListing";
import { formatMass, formatVolume } from "@/lib/seller/unitConversion";
import { getClauseSpec, clauseIsMandatory, clauseIsSpecificTerms, clauseIsProcessLog, clauseIsCatalogueSourced, clauseIsProfileSourced, specSource } from "@/lib/shared/clauseSpecSource";
import { CredentialVerifyButton } from "@/components/runtime/CredentialVerifyButton";
import type { FieldSpec } from "@figaro/sdk/clauses";

interface Props {
    sellerAddress: string;
}

/** One order's on-network composition (fifth noun): the composing clause, its
 *  standard interface, and the runtime `block.fields` the buyer fills. */
interface OrderComposition {
    nodeId: string;
    clauseId: string;
    interface: string;
    fields: readonly FieldSpec[];
}

/** Compact, spec-agnostic value summary of a clause's composed fields — the
 *  leaf scalar/enum values the buyer actually chose ("delivery",
 *  "zone-wifi"), joined for inline display. Empty objects (runtime anchors
 *  like a proof clause) and booleans summarize to "" — title-only rows. */
function clauseValueSummary(fields: unknown): string {
    const leaves: string[] = [];
    const walk = (value: unknown): void => {
        if (value === null || value === undefined || value === "") return;
        if (Array.isArray(value)) { value.forEach(walk); return; }
        if (typeof value === "object") { Object.values(value as Record<string, unknown>).forEach(walk); return; }
        if (typeof value === "boolean") return;
        leaves.push(String(value));
    };
    walk(fields);
    return leaves.join(" · ");
}

export function CheckoutView({ sellerAddress }: Props) {
    const { lower: sellerAddressLower, typed: sellerAddressTyped } = normalizeAddressParam(sellerAddress);

    const chainId = useChainId();
    const publicClient = usePublicClient();
    const { compose } = useCompositionActions();
    const { catalogues: sellerCatalogues, isLoading: cataloguesLoading } = useRegisteredCatalogues();

    const sellerCatalogue = useMemo(
        () => sellerCatalogues.find((r) => hexEqual(r.address, sellerAddressLower)) ?? null,
        [sellerCatalogues, sellerAddressLower],
    );

    const { address: buyer } = useCommerce();
    const { items } = useCartStore();
    const { openConnectModal } = useConnectModal();

    const { assemblies: boundAssemblies } = useSellerBoundAssemblies(sellerAddressTyped);

    // The buyer's options ARE the seller's bound assemblies — each is one
    // option, labelled by the assembly's own name and keyed by its slug.
    // Fill-mechanism variants (a catalogue-bound counterparty, a buyer pick)
    // are DISTINCT assemblies, so picking the assembly picks the mechanism;
    // the checkout hardcodes no taxonomy and reads no coordination field —
    // the mechanism is derived from binding state.
    const assemblyOptions: { slug: string; name: string }[] = useMemo(
        () => boundAssemblies.map((a) => ({ slug: a.slug, name: a.name })),
        [boundAssemblies],
    );
    // The buyer's chosen assembly slug, when the seller offers more than one.
    const [selectedSlug, setSelectedSlug] = useState<string | undefined>(undefined);

    // The assembly the buyer is ordering from attaches to the seller PROFILE. One
    // bound assembly -> use it; several -> the buyer's selected slug disambiguates which.
    // Every order commits against a published assembly — there is no fallback.
    const pickedAssembly = boundAssemblies.length === 1
        ? boundAssemblies[0]
        : boundAssemblies.find((a) => a.slug === selectedSlug);

    // The process denomination. Resolution order: the assembly's DENOMINATION
    // PIN (the designer's specific-T&C tailoring on the root agreement — the
    // one token the whole assembly runs in, part of its identity), else the
    // BUYER'S PICK from the seller's accepted array (the social layer — the
    // seller is PAID in the picked token and spends it onward; the pick is
    // what the commitment records), else the seller's declared default (the
    // unit of account the catalogue quotes in). None ⇒ undefined — never a
    // coined default (resolved-empty = absence); ordering is gated off below.
    const pinRoot = pickedAssembly?.assemblyTemplate.agreements.find(
        (o) => templateParentOrderHashes(o).length === 0,
    );
    const denominationPin = pinRoot ? readDenominationPin(pinRoot.clauses, specSource()) : undefined;
    const sellerDefault = sellerCatalogue?.defaultTokenAddress as `0x${string}` | undefined;
    const [paymentPick, setPaymentPick] = useState<`0x${string}` | null>(null);
    const currency = denominationPin ?? paymentPick ?? sellerDefault;
    // Price conversion, unit of account → the process denomination: catalogue
    // prices are quoted in the seller's default; when the pick/pin differs,
    // every amount converts at the venue's live rate BEFORE display and
    // commit (the converted price is the input the venue needs to yield the
    // default-quoted amount — the seller is made whole in their quote basis).
    // Devnet venue = one global rate, same-decimals mocks; a production venue
    // quotes per-pair behind this same seam. No venue while conversion is
    // needed ⇒ ordering is gated off (resolved-empty = absence).
    const swapFundingContracts = resolveSwapFundingContracts();
    const needsConversion = !!currency && !!sellerDefault && !hexEqual(currency, sellerDefault);
    const [venueRate, setVenueRate] = useState<VenueRate | null>(null);
    useEffect(() => {
        let cancelled = false;
        setVenueRate(null);
        if (!needsConversion || !publicClient || !swapFundingContracts) return;
        readVenueRate(publicClient, swapFundingContracts.router)
            .then((r) => { if (!cancelled) setVenueRate(r); })
            .catch(() => { if (!cancelled) setVenueRate(null); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsConversion, publicClient, swapFundingContracts?.router]);
    const priceRate = needsConversion ? venueRate : { num: 1n, den: 1n };
    const conversionBlocked = needsConversion && !priceRate;
    const toCurrency = (amount: bigint) => (priceRate ? inputForOutput(amount, priceRate) : amount);
    const { data: resolvedSymbol } = useTokenSymbol(currency ?? "");
    const tokenSymbol = resolvedSymbol
        ?? (currency ? sellerCatalogue?.acceptedTokens?.find((t) => hexEqual(t.address, currency))?.symbol : undefined)
        ?? "";
    const {
        decimals: tokenDecimals,
        decimalsReady,
        balance: tokenBalance,
        needsAuthorization: needsApproval,
        authorize: approve,
        authorization: { isPending: isApprovePending, isConfirming: isApproveConfirming, isSuccess: isApproveSuccess },
        signRoot,
        signAndShare,
        order: { step: commitStep, error: commitError, payload },
    } = useCheckout(currency);
    // The catalogue projections re-quoted into the process denomination —
    // sub-order pricing, picker options, and the commit walk read prices
    // already converted, so shown = committed in ONE basis. Identity when no
    // conversion applies.
    const pricedCatalogues = useMemo(() => {
        if (!priceRate || (priceRate.num === 1n && priceRate.den === 1n)) return sellerCatalogues;
        return sellerCatalogues.map((c) => ({
            ...c,
            items: c.items.map((it) => ({
                ...it,
                price: formatToken(inputForOutput(parseToken(it.price || "0", tokenDecimals), priceRate), tokenDecimals),
            })),
        }));
    }, [sellerCatalogues, priceRate, tokenDecimals]);
    // Runtime inputs for any order that composes an on-network contract — the
    // clause's `block.fields`, filled at checkout (like the cart line items),
    // keyed by template node id then field name. Interface-agnostic: the form
    // renders whatever fields the composing clause declares, naming no clause.
    const [compositionInputs, setCompositionInputs] = useState<Record<string, Record<string, unknown>>>({});
    // The buyer's GENERAL-clause field fills, nodeId → clauseId → values.
    // Design time is structural (ruled 2026-07-14): general clauses arrive
    // from the template as `{}`; their transaction particulars are authored
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
    const pendingCheckout = useRef(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    // Swap-funded bond leg (buyer side): the ON-RAMP into the process
    // denomination — a buyer short of the picked/pinned token funds from
    // another of the seller's accepted tokens, and the coordinator swaps it
    // at commit time. Funding is never the order's denomination; the
    // candidate set IS the seller's acceptedTokens minus the process
    // denomination; available only where the swap composition (coordinator +
    // Permit2 + venue) is configured. Resolved-empty = the path is absent.
    const fundingCandidates = useMemo(
        () => (swapFundingContracts && currency
            ? (sellerCatalogue?.acceptedTokens ?? []).filter((t) => !hexEqual(t.address, currency))
            : []),
        [swapFundingContracts, currency, sellerCatalogue],
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
    // adopting seller's catalogue leaves unbound (the buyer assigns it).
    const [sellerSelection, setSellerSelection] = useState<SellerSelection | null>(null);
    // Buyer-entered units per template node id — the "checkout-quantity" rate
    // source's input (hours, seats, …). Read by the SAME pricing call the
    // commit walk makes, so the shown figure equals what commits.
    const [subOrderQuantities, setSubOrderQuantities] = useState<Record<string, number>>({});
    useEffect(() => { setSellerSelection(null); }, [selectedSlug]);

    // Auto-chain: when approval confirms, proceed to commit signing.
    useEffect(() => {
        if (pendingCheckout.current && isApproveSuccess) {
            pendingCheckout.current = false;
            void executeCheckout();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isApproveSuccess]);

    // No post-place redirect: in the bilateral relay the buyer signs + shares,
    // then stays on the share panel; each order commits when its seller
    // counter-signs in their /orders list. The buyer is never the broadcaster here.

    if (cataloguesLoading) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Checkout</p>
                <h1 className="text-3xl font-bold text-black">Loading…</h1>
            </div>
        );
    }

    if (!sellerCatalogue) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl space-y-4">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Seller not found</p>
                <h1 className="text-3xl font-bold text-black">No seller registered for {truncateHex(sellerAddressLower, { head: 10, tail: 0 })}</h1>
                <Link href="/discover" className="inline-block underline text-sm text-black hover:text-neutral-600">
                    ← Back to discover
                </Link>
            </div>
        );
    }

    // Filter cart to items from THIS merchant only — the buyer's line-item input,
    // read-only here (edited on the browse page).
    const cartItems = items.filter((it) => it.sellerId === sellerAddressLower);
    // Sub-orders the adopting seller's catalogue leaves UNBOUND take the buyer's
    // checkout-time choice; bound sub-orders keep the catalogue's designation
    // (seller-assigned). The fill mechanism is DERIVED from binding state +
    // composition — there is no coordination field.
    const unboundSubOrders = (() => {
        if (!pickedAssembly || pickedAssembly.assemblyTemplate.agreements.length <= 1) return [];
        try {
            return planSubOrderSellers(pickedAssembly).filter((p) => !p.seller);
        } catch {
            return [];
        }
    })();
    // Any order that composes an on-network contract (the fifth noun) —
    // discovered by reading `block.composes` + `block.fields` off the clause
    // spec, naming no clause and no interface. Applies to ANY order (root, sub,
    // 136th), not just sub-orders. The buyer fills each composition's runtime
    // `block.fields` below.
    const orderCompositions = ((): OrderComposition[] => {
        if (!pickedAssembly) return [];
        const out: OrderComposition[] = [];
        for (const order of pickedAssembly.assemblyTemplate.agreements) {
            for (const cid of Object.keys(order.clauses)) {
                const block = getClauseSpec(cid)?.block;
                if (block?.composes && block.fields && block.fields.length > 0) {
                    out.push({ nodeId: order.id, clauseId: cid, interface: block.composes.interface, fields: block.fields });
                    break; // one composition per order
                }
            }
        }
        return out;
    })();
    // A composition never supplies a counterparty (counterparty-deferring
    // compositions were retired with the dutch auction 2026-07-02) — every
    // unbound sub-order is the buyer's pick, whether or not it composes.
    const buyerPickSubOrders = unboundSubOrders;
    const buyerChoosesCounterparty = buyerPickSubOrders.length > 0;
    // Every composition's REQUIRED block.fields must be filled before placing.
    const isFilled = (v: unknown) =>
        v !== undefined && v !== null && v !== "" && (!Array.isArray(v) || v.length > 0);
    const compositionsReady = orderCompositions.every((c) =>
        c.fields.every((f) => !f.required || isFilled(compositionInputs[c.nodeId]?.[f.name])),
    );
    // Ready to place when a profile-bound assembly is resolved (chosen, when the
    // seller offers more than one), any buyer-chosen counterparty is selected,
    // and every composition's runtime inputs are complete.
    const orderReady = !!pickedAssembly
        && !!currency
        && decimalsReady
        && !conversionBlocked
        && (!buyerChoosesCounterparty || !!sellerSelection)
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

    // Multi-order price transparency: the buyer pays the lead's cut plus every
    // contributor's cut, each priced LIVE from that contributor's own catalogue.
    // Built from the SAME planSubOrderSellers + resolveSubOrderPricing the commit
    // walks (same checkout-entered quantities included), so the shown figures —
    // rate derivations and all — equal what commits.
    const kitBreakdown = ((): {
        rows: Array<{ name: string; payment: bigint; nodeId?: string; pricing?: SubOrderPricing }>;
        total: bigint;
    } | null => {
        const assembly = pickedAssembly;
        if (!assembly || assembly.assemblyTemplate.agreements.length <= 1) return null;
        const lead = sellerCatalogue.address as `0x${string}`;
        const nameOf = (addr: `0x${string}`) => displayNameForAddress(sellerCatalogues, addr);
        let plan: ReturnType<typeof planSubOrderSellers>;
        try {
            plan = planSubOrderSellers(assembly);
        } catch {
            return null;
        }
        const rows = [
            { name: nameOf(lead), payment: cartTotal },
            ...plan.map(({ node, seller }) => {
                if (seller) {
                    // The buyer's checkout fills join the node BEFORE pricing —
                    // a rate source (order-geodistance) derives from clause
                    // content, and templates arrive value-free by construction.
                    // Same merge the commit walk performs, so shown = committed.
                    const pricing = resolveSubOrderPricing({
                        node: { ...node, clauses: { ...node.clauses, ...clauseFills[node.id] } },
                        seller, sellerCatalogues: pricedCatalogues, tokenDecimals,
                        specs: specSource(),
                        checkoutQuantity: subOrderQuantities[node.id],
                    });
                    return { name: nameOf(seller), payment: pricing.payment, nodeId: node.id, pricing };
                }
                // Unbound node: the buyer's checkout-time choice fills it — the
                // shown figure is the SAME selection the commit will use.
                return sellerSelection
                    ? { name: nameOf(sellerSelection.seller), payment: toCurrency(parseToken(sellerSelection.price, tokenDecimals)) }
                    : { name: "(choose below)", payment: 0n };
            }),
        ];
        return { rows, total: rows.reduce((s, r) => s + r.payment, 0n) };
    })();

    // The buyer commits EVERY order in the plan (buyer == rootBuyer on each
    // — the kernel star shape): 2× payment locked per order, payment to that
    // order's seller + an equal refundable bond. Aggregate over the WHOLE
    // plan — a root-only figure under-reports every multi-order checkout.
    const planTotal = kitBreakdown ? kitBreakdown.total : cartTotal;
    const lockedTotal = planTotal > 0n ? calculateBonds(planTotal, planTotal).buyerBond : 0n;
    const hasInsufficientBalance = !!buyer && tokenBalance !== undefined && balance < lockedTotal;

    // Every order in the assembly — root + sub-orders — surfaced for review:
    // the buyer signs and bonds ALL of them. Each clause renders its COMPOSED
    // values (the terms the buyer is agreeing to), spec-driven. Mandatory
    // clauses (e.g. the topology clause) are protocol-composed, not
    // buyer-chosen terms; they stay out of the review.
    const agreementGroups = ((): Array<{ key: string; label: string; clauses: Array<{ clauseId: string; values: string; data: Record<string, unknown>; fillable: boolean }> }> => {
        if (!pickedAssembly) return [];
        const orders = pickedAssembly.assemblyTemplate.agreements;
        const lead = sellerCatalogue.address as `0x${string}`;
        const nameOf = (addr: `0x${string}`) => displayNameForAddress(sellerCatalogues, addr);
        let plan: ReturnType<typeof planSubOrderSellers> = [];
        if (orders.length > 1) {
            try { plan = planSubOrderSellers(pickedAssembly); } catch { plan = []; }
        }
        const sellerOf = new Map(plan.map(({ node, seller }) => [node.id, seller]));
        return orders.map((order, i) => {
            const isRoot = templateParentOrderHashes(order).length === 0;
            const assigned = isRoot ? lead : sellerOf.get(order.id);
            // Fold the assigned seller's PROFILE master data (dimweight's
            // divisor, a declared credential id) onto the preview leaves —
            // the same fold the order build applies, so the buyer reviews
            // what will actually commit (and can Verify a declared
            // credential before placing the order).
            const previewClauses = fillProfileSections(
                Object.fromEntries(Object.entries(order.clauses).filter(([clauseId]) => !clauseIsMandatory(clauseId))),
                assigned ? profileValuesFor(assigned, sellerCatalogues) : undefined,
                specSource(),
            );
            return {
                key: String(order.id ?? i),
                label: assigned ? nameOf(assigned) : "(to be assigned)",
                clauses: Object.entries(previewClauses)
                    .map(([clauseId, fields]) => ({
                        clauseId,
                        values: clauseValueSummary(fields),
                        data: fields as Record<string, unknown>,
                        // A GENERAL clause's fields are transaction particulars
                        // the buyer authors here. Not fillable: specific-T&C
                        // values (the designer's tailoring, from the template),
                        // process-log anchors (attested at runtime, empty at
                        // commit), catalogue-sourced sections (the seller's
                        // items fill them), and profile-sourced sections (the
                        // seller's standing declarations fill them). A COMPOSING
                        // clause's content fields ARE fillable — the composition
                        // surface collects only its block.fields runtime params,
                        // never its content.
                        fillable: !clauseIsSpecificTerms(clauseId)
                            && !clauseIsProcessLog(clauseId)
                            && !clauseIsCatalogueSourced(clauseId)
                            && !clauseIsProfileSourced(clauseId)
                            && (getClauseSpec(clauseId)?.fields.length ?? 0) > 0,
                    })),
            };
        });
    })();

    const cartUnitSystem = sellerCatalogue.unitSystem ?? "metric";
    const cartMassGrams = cartItems.reduce((sum, cartItem) => {
        const catalogueItem = sellerCatalogue.items.find((m) => m.id === cartItem.catalogueItemId);
        if (!catalogueItem?.massGrams) return sum;
        return sum + catalogueItem.massGrams * cartItem.quantity;
    }, 0);
    const cartVolumeMl = cartItems.reduce((sum, cartItem) => {
        const catalogueItem = sellerCatalogue.items.find((m) => m.id === cartItem.catalogueItemId);
        if (!catalogueItem?.volumeMl) return sum;
        return sum + catalogueItem.volumeMl * cartItem.quantity;
    }, 0);

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
        const leadSellerAddress = sellerCatalogue.address as `0x${string}`;
        // Every order commits against a published, profile-bound assembly — no
        // synthesized fallback. `orderReady` already guarantees this; assert it
        // for the type. The kernel sees a linear commit chain; the parent edges
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
            // No declared settlement currency ⇒ no order (resolved-empty = absence).
            // orderReady already gates the button; this guards the path + narrows the type.
            if (!currency) { setCheckoutError("This seller hasn't set a settlement currency."); return; }
            // The whole commit algorithm — root prepare/validate, the bilateral
            // single-order relay, or the multi-order walk (sub-orders signed +
            // relayed to their bound sellers, root through the buyer-share-panel
            // last) — lives in lib/checkout/assemblyCheckout. The surface keeps
            // guards and error display only.
            await executeAssemblyCheckout(
                {
                    buyer,
                    leadSellerAddress,
                    currency,
                    payment: cartTotal,
                    lineItems: cartItems.map((item) => ({
                        itemId: item.catalogueItemId,
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
                    sellerCatalogues: pricedCatalogues,
                    tokenDecimals,
                    subOrderSelections: buyerChoosesCounterparty && sellerSelection
                        ? Object.fromEntries(buyerPickSubOrders.map(({ node }) => [
                            node.id,
                            {
                                seller: sellerSelection.seller,
                                price: formatToken(toCurrency(parseToken(sellerSelection.price, tokenDecimals)), tokenDecimals),
                                item: { id: sellerSelection.item.id, name: sellerSelection.item.name },
                            },
                        ]))
                        : undefined,
                    subOrderCompositions: orderCompositions.length > 0
                        ? Object.fromEntries(orderCompositions.map((c) => [
                            c.nodeId,
                            { interface: c.interface, fieldValues: compositionInputs[c.nodeId] ?? {} },
                        ]))
                        : undefined,
                    subOrderQuantities,
                    clauseFills,
                },
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
                    signAndShare: (p) => signAndShare(p, fundingToken ? { inputToken: fundingToken } : undefined),
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
            openConnectModal?.();
            return;
        }
        if (cartItems.length === 0) return;
        if (hasInsufficientBalance && !fundingToken) {
            setCheckoutError(
                `Insufficient funds. Required: ${formatToken(lockedTotal, tokenDecimals)}, available: ${formatToken(balance, tokenDecimals)}`
                + (fundingCandidates.length > 0 ? " — or fund your bond from another accepted token below." : ""),
            );
            return;
        }
        if (fundingToken && permit2Funding.needsApproval(lockedTotal)) {
            setCheckoutError("Authorize the funding token first — the one-time Permit2 approval below.");
            return;
        }
        setCheckoutError(null);
        if (needsApproval(lockedTotal)) {
            try {
                pendingCheckout.current = true;
                approve(lockedTotal * 10n);
            } catch {
                pendingCheckout.current = false;
                setCheckoutError("Payment authorization failed. Please try again.");
            }
        } else {
            void executeCheckout();
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
                <Link href={`/s/view?seller=${sellerAddressLower}`} className="text-sm text-neutral-500 hover:text-black">
                    ← Back to {sellerCatalogue.name}
                </Link>
            </div>

            <header className="space-y-1">
                <p className="text-xs font-semibold text-neutral-500">Checkout</p>
                <h1 className="text-2xl font-bold text-black">Order from {sellerCatalogue.name}</h1>
            </header>

            <section
                className="rounded-lg border border-neutral-200 bg-white p-5 space-y-4"
                data-testid="checkout-cart"
            >
                {cartItems.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                        Your cart is empty.{" "}
                        <Link href={`/s/view?seller=${sellerAddressLower}`} className="underline text-black hover:text-neutral-600">
                            Browse {sellerCatalogue.name}&apos;s catalogue
                        </Link>{" "}
                        to add items.
                    </p>
                ) : (
                    <>
                        {/* Read-only line items — the buyer's selection, edited on browse. */}
                        <ul className="space-y-2 text-sm">
                            {cartItems.map((item) => (
                                <li
                                    key={item.catalogueItemId}
                                    className="flex items-baseline justify-between gap-2"
                                    data-testid={`cart-line-${item.catalogueItemId}`}
                                >
                                    <span className="flex-1 min-w-0 text-black font-medium truncate">
                                        {item.name} <span className="text-neutral-400">× {item.quantity}</span>
                                    </span>
                                    <span className="text-neutral-900 font-semibold tabular-nums shrink-0">
                                        {(parseFloat(item.price || "0") * item.quantity).toFixed(4)}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        {/* THE PAYMENT TOKEN — the buyer's pick from the seller's
                            accepted array (the social layer). The pick IS the
                            process denomination: recorded in the commitment,
                            bonded 2×, received by the seller. Quoted prices
                            convert at the venue rate. A designer's denomination
                            pin replaces the pick entirely; a single-entry array
                            offers no choice. */}
                        {!denominationPin && currency && (sellerCatalogue?.acceptedTokens?.length ?? 0) > 1 && (
                            <div className="border-t border-neutral-200 pt-3 space-y-1" data-testid="payment-token-picker">
                                <p className="text-xs font-semibold text-neutral-500">Pay in</p>
                                <div className="flex flex-wrap gap-3 text-sm">
                                    {sellerCatalogue!.acceptedTokens!.map((t) => (
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
                                                <span className="text-xs text-neutral-400">(list price)</span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                                {conversionBlocked && (
                                    <p className="text-xs text-red-600" data-testid="payment-token-no-venue">
                                        No conversion venue is configured — prices can&apos;t be quoted in this
                                        token. Pick the list-price token to order.
                                    </p>
                                )}
                            </div>
                        )}
                        {denominationPin && (
                            <p className="text-xs text-neutral-500 border-t border-neutral-200 pt-3" data-testid="payment-token-pinned">
                                This assembly is denominated by design{tokenSymbol ? ` — every bond and payment moves in ${tokenSymbol}` : ""}.
                            </p>
                        )}

                        <div className="border-t border-neutral-200 pt-3 space-y-1.5 text-sm">
                            {kitBreakdown ? (
                                <div className="space-y-1" data-testid="cart-contributor-breakdown">
                                    {kitBreakdown.rows.map((row, i) => (
                                        <div key={i}>
                                            <div className="flex justify-between">
                                                <span className="text-neutral-600">{row.name}</span>
                                                <span className="text-neutral-900 tabular-nums">
                                                    {formatToken(row.payment, tokenDecimals)}
                                                </span>
                                            </div>
                                            {/* Rate derivation — the P&L shows HOW the figure was
                                                priced before the buyer signs it. Billed per started
                                                unit; the same numbers commit as the line item. */}
                                            {row.pricing?.item?.pricingPolicy === "rate" && !row.pricing.issue && (
                                                <div
                                                    className="flex justify-between text-xs text-neutral-500"
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
                                                <label className="mt-1 flex items-center justify-between gap-2 text-xs text-neutral-600">
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
                                                        className="w-20 rounded border border-neutral-300 px-2 py-1 text-right text-sm"
                                                        data-testid={`rate-quantity-input-${row.nodeId}`}
                                                    />
                                                </label>
                                            )}
                                            {row.pricing?.issue === "unresolvable-quantity" &&
                                                row.pricing.item?.rateQuantitySource !== "checkout-quantity" && (
                                                <p className="text-xs text-red-600" data-testid={`rate-unresolvable-${row.nodeId}`}>
                                                    Priced by rate ({row.pricing.item?.rateUnit ?? "unit"}), but this order
                                                    carries no value its quantity source can read.
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                    <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-medium">
                                        <span className="text-neutral-700">Total to all sellers</span>
                                        <span className="text-neutral-900 tabular-nums" data-testid="cart-kit-total">
                                            {formatToken(kitBreakdown.total, tokenDecimals)}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex justify-between">
                                    <span className="text-neutral-600">Payment to seller</span>
                                    <span className="text-neutral-900 tabular-nums">
                                        {formatToken(cartTotal, tokenDecimals)}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-neutral-600">Your bond (refundable on resolve)</span>
                                <span className="text-neutral-900 tabular-nums" data-testid="checkout-bond-refundable">
                                    {formatToken(planTotal, tokenDecimals)}
                                </span>
                            </div>
                            <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-semibold">
                                <span className="text-black">Locked at commit</span>
                                <span className="text-black tabular-nums" data-testid="checkout-locked-total">
                                    {formatToken(lockedTotal, tokenDecimals)}
                                </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 pt-1.5 leading-relaxed" data-testid="checkout-bond-rationale">
                                Both you and the seller lock a bond against this deal, so cooperation is the
                                seller&apos;s only profitable move — no arbitrator, no timeout, no admin. You
                                alone resolve it; your bond returns when you do, and you pay only the price above.
                            </p>
                            {(cartMassGrams > 0 || cartVolumeMl > 0) && (
                                <div
                                    className="flex justify-between text-[11px] text-neutral-500 pt-1.5 border-t border-neutral-200"
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
                            <div className="space-y-2 border-t border-neutral-200 pt-3" data-testid="checkout-agreement-terms">
                                <p className="text-xs font-semibold text-neutral-500">Agreement</p>
                                {agreementGroups.map((group) => (
                                    <div key={group.key} className="space-y-0.5" data-testid={`agreement-order-${group.key}`}>
                                        {agreementGroups.length > 1 && (
                                            <p className="text-[11px] font-medium text-neutral-500">{group.label}</p>
                                        )}
                                        <ul className="text-xs text-neutral-600 space-y-0.5">
                                            {group.clauses.map(({ clauseId, values, data, fillable }) => (
                                                <li key={clauseId} data-testid={`agreement-clause-${clauseId}`}>
                                                    {getClauseSpec(clauseId)?.title ?? clauseId}
                                                    {values && <span className="text-neutral-900"> — {values}</span>}
                                                    <CredentialVerifyButton data={data} />
                                                    {fillable && (
                                                        <div className="mt-1 mb-2 ml-3 space-y-2">
                                                            {getClauseSpec(clauseId)?.fields.map((field) => (
                                                                <FieldControl
                                                                    key={field.name}
                                                                    field={field}
                                                                    value={clauseFills[group.key]?.[clauseId]?.[field.name]}
                                                                    onChange={(v) => setClauseFill(group.key, clauseId, field.name, v)}
                                                                    testId={`checkout-field-${group.key}-${clauseId}-${field.name}`}
                                                                    hideLabel={field.name.toLowerCase() === (getClauseSpec(clauseId)?.title ?? "").toLowerCase()}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                                <p className="text-[11px] text-neutral-400">
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
                                <p className="text-xs font-semibold text-neutral-500 mb-1">Method</p>
                                <p
                                    className="text-sm text-black"
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
                                    className="text-xs font-semibold text-neutral-500 mb-1 block"
                                >
                                    Method
                                </label>
                                <select
                                    id="method-select"
                                    value={selectedSlug ?? ""}
                                    onChange={(e) =>
                                        setSelectedSlug(e.target.value === "" ? undefined : e.target.value)
                                    }
                                    className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
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

                        {/* Buyer-assigned: the catalogue leaves the sub-order
                            unbound — the buyer chooses the counterparty here,
                            priced from that seller's own catalogue.
                            Checkout-phase data, like the cart. */}
                        {buyerChoosesCounterparty && (
                            <SellerCataloguePicker
                                tokenSymbol={tokenSymbol}
                                onSelect={setSellerSelection}
                            />
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
                                needsAuthorization={permit2Funding.needsApproval(lockedTotal)}
                                onAuthorize={() => permit2Funding.approve(maxUint256)}
                                isAuthorizing={permit2Funding.isApprovePending || permit2Funding.isApproveConfirming}
                            />
                        )}

                        {/* On-network composition inputs (the fifth noun): any
                            order whose clause declares block.composes + block.fields
                            gets those runtime fields rendered here generically —
                            one form, naming no clause or interface — a novel
                            composition surfaces its own fields with zero code. */}
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

                        <Button
                            onClick={handlePlaceOrder}
                            disabled={
                                isApproving
                                || placingOrder
                                || cartItems.length === 0
                                || !orderReady
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
                                        : !currency
                                            ? "Seller hasn't set a settlement currency"
                                            : !orderReady
                                                ? "Select an option to order"
                                                : "Place order"}
                        </Button>

                        {(checkoutError || commitError) && (
                            <p className="text-sm text-red-600" data-testid="seller-checkout-error">
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

/**
 * assemblyCheckout — the buyer-side commit algorithm for a bound assembly.
 *
 * One function owns the whole sequencing the checkout surface runs: build the
 * root order from the assembly's root node, Layer-A validate, then either the
 * single-order relay (the buyer signs the one order, then relays it from the
 * share panel) or the multi-order walk — the buyer funds EVERY order up front:
 * the root's processId is its EIP-712 digest (deterministic, computable from
 * the unsigned commitment), so each sub-order is built, validated, signed, and
 * relayed onto the coordination channel to its bound seller BEFORE any commit;
 * the root is signed LAST and surfaced to the share panel. Each seller
 * counter-signs its own order — the kernel enforces commit order (root creates
 * the process, subs extend it), so the sellers' accepts self-serialize
 * root-first. Every order's clauses come verbatim from the assembly template;
 * no clause is named — the commerce + cargo sections are found by their declared
 * fields. The buyer signs each order through the SAME confirm gate the seller's
 * accept uses; there is no checkout-only bypass.
 *
 * The UI surface (`CheckoutView`) keeps only wallet/cart guards and error
 * display; this module is the protocol algorithm. Throws Error with a
 * user-facing message on any failure — the caller renders it.
 */


import { buildOrderPreview, type OrderPreview } from "@/lib/checkout/orderPreview";
import { validateCommitmentAgreement } from "@/lib/kernel/orderAgreement";
import type { DraftOrder } from "@/lib/checkout/draftOrders";
import { commitmentOrderHash, commitmentProcessId, type CommitmentPayload } from "@/lib/kernel/signedCommitment";
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { planSubOrderSellers, resolveSubOrderPricing } from "@/lib/checkout/assemblySubOrderPlan";
import { templateClauseVersionMap, templateParentOrderHashes } from "@/lib/shared/assemblyTemplate";
import { clauseDeclaresField, clauseIsCatalogueSourced } from "@/lib/shared/clauseSpecSource";
import { parseToken } from "@/lib/shared/utils";
import type { BoundAssembly } from "@/lib/seller/useSellerBoundAssemblies";
import type { SellerCatalogue } from "@/lib/seller/types";

export interface AssemblyCheckoutLineItem {
    itemId: string;
    name: string;
    quantity: number;
    /** Decimal string, smallest unit (matches the commerce clause's bigint field). */
    unitPrice: string;
    /** Physical attributes from the catalogue item — folded onto THIS order's
     *  cargo leaf at checkout (mass/volume sum × quantity; packaged dimensions
     *  only when the order is a single parcel — dims don't sum). Optional:
     *  services / un-annotated items omit them. */
    massGrams?: number;
    volumeMl?: number;
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
    /** Catalogue-sourced clause values (freight class / hazmat / cold-chain, …)
     *  folded onto their leaves. Keyed by clauseId → field values. */
    clauseValues?: Record<string, Record<string, unknown>>;
}

/** The signing capabilities the algorithm drives — provided by `useCheckout`,
 *  which backs them with the order* commitment flow. */
export interface AssemblyCheckoutDeps {
    chainId: number;
    /** Read the chain's per-process resolve ceiling (`maxOrdersResolvablePerProcess`).
     *  Checkout refuses a template that couldn't settle in one atomic
     *  `resolveProcess` — the same ceiling the designer canvas and
     *  `publishAssembly` enforce. This copy covers foreign hand-anchored
     *  templates the permissionless registry admits. */
    readResolveCap: () => Promise<number>;
    /** Sign the root and surface its payload to the share panel (no auto-relay). */
    signRoot: (preview: OrderPreview) => Promise<CommitmentPayload>;
    /** Sign + relay a sub-order to its bound seller in one step. */
    signAndShare: (preview: OrderPreview) => Promise<CommitmentPayload>;
    /** Invokes a sub-order's on-network composition (the fifth noun) — the
     *  surface routes the standard `interface` to its handler and owns the tx +
     *  receipt wait (useCompositionActions). The composition runs alongside the
     *  order's normal commit. */
    compose?: (args: {
        interface: string;
        fieldValues: Record<string, unknown>;
        processId: `0x${string}`;
        currency: `0x${string}`;
        tokenDecimals: number;
    }) => Promise<void>;
}

/**
 * Write the order's settlement terms into the commerce section, found by its
 * declared `lineItems` field (never by clause id; gracefully skipped when the
 * assembly composes no commerce clause). currency + payment are stored as the
 * clause spec wants them (address-hex string, decimal string); `lineItems` is
 * supplied only for the root (the buyer's cart) and stripped to the commerce
 * section's closed shape — the cart's physical attributes belong to the cargo
 * collapse, not here.
 */
function fillCommerceSection(
    clauses: ClauseFields,
    currency: `0x${string}`,
    payment: bigint,
    lineItems?: AssemblyCheckoutLineItem[],
): ClauseFields {
    const commerceClauseId = Object.keys(clauses).find(
        (clauseId) => clauseDeclaresField(clauseId, "lineItems"),
    );
    if (!commerceClauseId) return clauses;
    return {
        ...clauses,
        [commerceClauseId]: {
            ...clauses[commerceClauseId],
            currency,
            payment: payment.toString(),
            ...(lineItems
                ? {
                    lineItems: lineItems.map(({ itemId, name, quantity, unitPrice }) =>
                        ({ itemId, name, quantity, unitPrice })),
                }
                : {}),
        },
    };
}

/**
 * Write the REAL parent-order hashes into the topology section, found by its
 * declared `parentOrderHashes` field (never by clause id). The template's
 * topology data carries template-LOCAL order ids ("order-0"); the committed
 * agreement must carry the actual EIP-712 order hashes — they are the DAG
 * edges every off-chain reader (audit, derive) reconstructs from, and the
 * bytes32 shape Layer A validates.
 */
function writeTopologySection(
    clauses: ClauseFields,
    parentOrderHashes: `0x${string}`[],
): ClauseFields {
    const topologyClauseId = Object.keys(clauses).find(
        (clauseId) => clauseDeclaresField(clauseId, "parentOrderHashes"),
    );
    if (!topologyClauseId) return clauses;
    return {
        ...clauses,
        [topologyClauseId]: {
            ...clauses[topologyClauseId],
            parentOrderHashes,
        },
    };
}

/**
 * Fold the order's physical measure onto its cargo leaf, found by its declared
 * `massGrams` field (never by clause id; skipped when no cargo clause is
 * composed — services have no cargo, G7). Mass and volume SUM across the order's
 * lines (× quantity — both additive). Packaged dimensions do NOT sum (packing),
 * so they are written only when the order is a single parcel (one line, quantity
 * 1) — a multi-line order's packaged dimension is a per-order input this fold
 * does not fabricate; dimensional weight then falls back to actual mass.
 */
export function fillCargoSection(clauses: ClauseFields, lines: AssemblyCheckoutLineItem[]): ClauseFields {
    const cargoId = Object.keys(clauses).find((id) => clauseDeclaresField(id, "massGrams"));
    if (!cargoId) return clauses;
    const massGrams = lines.reduce((s, li) => s + (li.massGrams ?? 0) * li.quantity, 0);
    const volumeMl = lines.reduce((s, li) => s + (li.volumeMl ?? 0) * li.quantity, 0);
    const single = lines.length === 1 && lines[0].quantity === 1 ? lines[0] : undefined;
    const dims = single && single.lengthMm && single.widthMm && single.heightMm
        ? { lengthMm: single.lengthMm, widthMm: single.widthMm, heightMm: single.heightMm }
        : {};
    return {
        ...clauses,
        [cargoId]: {
            ...clauses[cargoId],
            ...(massGrams > 0 ? { massGrams } : {}),
            ...(volumeMl > 0 ? { volumeMl } : {}),
            ...dims,
        },
    };
}

/**
 * Fold the catalogue-authored class values onto their leaves. For each
 * catalogue-sourced clause the order composes (freight-class / hazmat /
 * cold-chain, …, discovered by `block.catalogueSourced`, never by name), write
 * the first line's authored values — a homogeneous-order assumption (mixed
 * classes are a multi-ORDER concern per the aggregate model). Absent when no
 * line carries values for that clause.
 */
export function fillClassSections(clauses: ClauseFields, lines: AssemblyCheckoutLineItem[]): ClauseFields {
    let out = clauses;
    for (const clauseId of Object.keys(clauses)) {
        if (!clauseIsCatalogueSourced(clauseId)) continue;
        const line = lines.find(
            (li) => li.clauseValues?.[clauseId] && Object.keys(li.clauseValues[clauseId]).length > 0,
        );
        if (!line) continue;
        out = { ...out, [clauseId]: { ...out[clauseId], ...line.clauseValues![clauseId] } };
    }
    return out;
}

/**
 * Compute the dimensional (billed) weight onto the dimweight leaf, found by its
 * declared `billedMassGrams` field. DERIVED, not authored: billed = max(gross
 * mass, volumetric), volumetric = packaged volume ÷ divisor with each packaged
 * dimension rounded up to the next whole centimetre first (carriers round per
 * dimension). Reads the cargo leaf just filled; skipped when the order composes
 * no dimweight clause, has no packaged dimensions, or the seller declares no
 * divisor — dimensional weight then simply does not apply.
 */
export function fillDimweightSection(clauses: ClauseFields, divisor?: number): ClauseFields {
    const dimId = Object.keys(clauses).find((id) => clauseDeclaresField(id, "billedMassGrams"));
    if (!dimId || !divisor || divisor <= 0) return clauses;
    const cargoId = Object.keys(clauses).find((id) => clauseDeclaresField(id, "massGrams"));
    const cargo = cargoId ? clauses[cargoId] : undefined;
    const l = Number(cargo?.lengthMm ?? 0), w = Number(cargo?.widthMm ?? 0), h = Number(cargo?.heightMm ?? 0);
    if (!(l > 0 && w > 0 && h > 0)) return clauses;
    const gross = Number(cargo?.massGrams ?? 0);
    const roundCm = (mm: number) => Math.ceil(mm / 10) * 10;
    const volMm3 = roundCm(l) * roundCm(w) * roundCm(h);
    const volumetric = Math.ceil(volMm3 / divisor);
    return { ...clauses, [dimId]: { ...clauses[dimId], billedMassGrams: Math.max(gross, volumetric), divisor } };
}

/**
 * Fill every derivable LOGISTICS section on an order, wherever composed — cargo
 * (physical measure), the class leaves (catalogue-sourced), then the derived
 * dimweight (reads the cargo it just wrote). Each fill is a no-op when its
 * clause isn't composed, so the same call serves the root and every sub-order.
 */
function fillDerivedSections(clauses: ClauseFields, lines: AssemblyCheckoutLineItem[], divisor?: number): ClauseFields {
    return fillDimweightSection(fillClassSections(fillCargoSection(clauses, lines), lines), divisor);
}

/** The seller's dimensional-weight divisor, looked up by the order's seller
 *  address from the checkout's catalogue projections. Undefined when the seller
 *  declares none — dimweight then does not apply. */
function divisorFor(seller: `0x${string}`, catalogues: SellerCatalogue[]): number | undefined {
    return catalogues.find((c) => c.address.toLowerCase() === seller.toLowerCase())?.dimWeightDivisor;
}

/** Layer A — the buyer does not sign an invalid agreement. */
function assertValidToSign(preview: OrderPreview, label: string): void {
    const check = validateCommitmentAgreement(preview.agreement, preview.agreementHash);
    if (!check.ok) {
        throw new Error(
            `${label} isn't valid to sign yet: ${check.issues
                .map((i) => `${i.clause} ${i.path}: ${i.message}`)
                .join("; ")}`,
        );
    }
}

export async function executeAssemblyCheckout(
    params: {
        buyer: `0x${string}`;
        leadSellerAddress: `0x${string}`;
        currency: `0x${string}`;
        /** The lead order's payment — the cart total. */
        payment: bigint;
        lineItems: AssemblyCheckoutLineItem[];
        assembly: BoundAssembly;
        /** Contributor pricing context (each sub-order is priced LIVE from its
         *  own seller's catalogue). */
        sellerCatalogues: SellerCatalogue[];
        tokenDecimals: number;
        /** The buyer's checkout-time counterparty choices, keyed by template
         *  node id — fills sub-orders the adopting seller's profile leaves
         *  unbound (buyer-assigned coordination). The price is the picker's
         *  resolved figure and `item` the picked catalogue item (it becomes
         *  the sub-order's commerce line item). Checkout-phase data, like the
         *  cart — never design-time clause activation. */
        subOrderSelections?: Record<string, {
            seller: `0x${string}`;
            price: string;
            item: { id: string; name: string };
        }>;
        /** On-network compositions (the fifth noun) keyed by template node id:
         *  the composing clause's `interface` (from `block.composes`) plus the
         *  buyer's `block.fields` values collected at checkout. The composition
         *  runs alongside the order's normal commit. Interface-agnostic — the
         *  walk names no clause. */
        subOrderCompositions?: Record<string, { interface: string; fieldValues: Record<string, unknown> }>;
        /** The buyer's checkout-entered units per template node id — the
         *  "checkout-quantity" rate source's input (hours, seats, …). Only
         *  read for a node whose contributor prices by such a rate. */
        subOrderQuantities?: Record<string, number>;
    },
    deps: AssemblyCheckoutDeps,
): Promise<void> {
    const {
        buyer, leadSellerAddress, currency, payment, lineItems,
        assembly, sellerCatalogues, tokenDecimals, subOrderSelections,
    } = params;
    const { chainId, signRoot, signAndShare } = deps;

    // The root node carries the design-time clause choices, spread verbatim.
    const root = assembly.assemblyTemplate.agreements.find((o) => templateParentOrderHashes(o).length === 0)
        ?? assembly.assemblyTemplate.agreements[0];
    if (!root) throw new Error("This assembly has no root order.");
    const isMultiOrder = assembly.assemblyTemplate.agreements.length > 1;

    // Resolve-ceiling refusal BEFORE any signature: a process grown past the
    // chain's atomic-resolve cap can never settle, so the buyer must not bond
    // into one. Publish-side already refuses over-cap templates authored here;
    // this catches templates anchored by other clients (the registry is
    // permissionless).
    const orderCount = assembly.assemblyTemplate.agreements.length;
    const resolveCap = await deps.readResolveCap();
    if (orderCount > resolveCap) {
        throw new Error(
            `This assembly composes ${orderCount} orders; this chain settles at most ` +
                `${resolveCap} in one atomic resolveProcess. It can never settle as one ` +
                `process — the designer must compose multiple processes instead.`,
        );
    }

    // The root's clause map: template clauses, then the derived LOGISTICS
    // sections (cargo / class leaves / dimweight) filled from the cart — wherever
    // composed, by declared field, never by clause name — then the settlement
    // terms. `currency` is the ONE process currency (a single value used for
    // every order below), never a per-order input: the kernel enforces
    // single-denomination (FigaroCore CurrencyMismatch), so the agreement must
    // not even express a second token.
    const rootClauses = fillCommerceSection(
        fillDerivedSections({ ...root.clauses }, lineItems, divisorFor(leadSellerAddress, sellerCatalogues)),
        currency, payment, lineItems,
    );

    const rootDraft: DraftOrder = {
        buyer, seller: leadSellerAddress, currency, payment, clauses: rootClauses,
        clauseVersions: templateClauseVersionMap(root),
    };
    const rootPreview = await buildOrderPreview(rootDraft);
    assertValidToSign(rootPreview, "This order");

    // Single order (distinct parties OR self-commit) → the buyer signs the one
    // order; the share panel relays it to the seller, who counter-signs.
    if (!isMultiOrder) {
        await signRoot(rootPreview);
        return;
    }

    // The root's process id is its EIP-712 digest — computable from the unsigned
    // commitment, so the sub-orders can name it before the root commits.
    const processId = commitmentProcessId(rootPreview.commitment, chainId);
    const realOrderHash = new Map<string, `0x${string}`>([
        [root.id, commitmentOrderHash(rootPreview.commitment, chainId)],
    ]);
    let cumulativeValue = payment;

    for (const { node, seller: boundSeller } of planSubOrderSellers(assembly)) {
        // On-network composition (fifth noun): a sub-order whose clause declares
        // `block.composes` invokes the composed contract ALONGSIDE its normal
        // commit — the interface is routed to its handler by the surface
        // (`deps.compose`); the walk names no clause. (Counterparty-deferring
        // compositions were retired with the dutch auction 2026-07-02: a
        // mid-chain order whose price or party is unknown at signing is
        // structurally incompatible with the kernel's exact-match cumulative
        // accumulator.)
        const composition = boundSeller ? undefined : params.subOrderCompositions?.[node.id];
        if (composition) {
            if (!deps.compose) {
                throw new Error("This assembly composes an on-network contract for a sub-order, but no composition mechanism is available.");
            }
            await deps.compose({
                interface: composition.interface,
                fieldValues: composition.fieldValues,
                processId,
                currency,
                tokenDecimals,
            });
        }
        // A profile binding designates the counterparty; a node the profile
        // leaves unbound takes the buyer's checkout-time choice.
        const selection = boundSeller ? undefined : subOrderSelections?.[node.id];
        const subSeller = boundSeller ?? selection?.seller ?? null;
        if (!subSeller) {
            throw new Error("This assembly has a sub-order with no counterparty — the seller's profile must designate one, or the buyer chooses one at checkout.");
        }
        const parentOrderHashes = templateParentOrderHashes(node)
            .map((pid) => realOrderHash.get(pid))
            .filter((h): h is `0x${string}` => !!h);
        const pricing = selection
            ? null
            : resolveSubOrderPricing({
                node, seller: subSeller, sellerCatalogues, tokenDecimals,
                checkoutQuantity: params.subOrderQuantities?.[node.id],
            });
        if (pricing?.issue === "unresolvable-quantity") {
            throw new Error(
                `"${pricing.item?.name}" prices by rate but its quantity can't be resolved on this order — the quantity source ("${pricing.item?.rateQuantitySource}") found no value.`,
            );
        }
        const subPayment = selection
            ? parseToken(selection.price, tokenDecimals)
            : pricing!.payment;
        cumulativeValue += subPayment;
        // The sub-order's commerce section states WHAT the payment buys: the
        // contributor's resolved catalogue item (the same item the payment was
        // priced from), or the buyer's picked item on the unbound path. The
        // commerce clause requires lineItems on EVERY order, subs included.
        // Rate items commit their derivation: quantity = billed units (per
        // started unit), unitPrice = the rate — quantity × unitPrice replays
        // the payment from the committed leaf alone.
        const subLineItems: AssemblyCheckoutLineItem[] | undefined = selection
            ? [{ itemId: selection.item.id, name: selection.item.name, quantity: 1, unitPrice: subPayment.toString() }]
            : pricing!.item
                ? [{
                    itemId: pricing!.item.id,
                    name: pricing!.item.name,
                    quantity: pricing!.billedQuantity,
                    unitPrice: pricing!.unitPrice.toString(),
                    massGrams: pricing!.item.massGrams,
                    volumeMl: pricing!.item.volumeMl,
                    lengthMm: pricing!.item.lengthMm,
                    widthMm: pricing!.item.widthMm,
                    heightMm: pricing!.item.heightMm,
                    clauseValues: pricing!.item.clauseValues,
                }]
                : undefined;
        // Same fill-where-composed as the root: this sub-order's own logistics
        // leaves (cargo / class / dimweight) from its own catalogue item + its
        // own seller's divisor. A no-op for orders composing none (e.g. a
        // service leg) → G7 absence.
        const subClauses = fillCommerceSection(
            writeTopologySection(
                fillDerivedSections({ ...node.clauses }, subLineItems ?? [], divisorFor(subSeller, sellerCatalogues)),
                parentOrderHashes,
            ),
            currency, subPayment, subLineItems,
        );
        const subDraft: DraftOrder = {
            buyer, seller: subSeller, currency, payment: subPayment,
            clauses: subClauses, parentOrderHashes,
            clauseVersions: templateClauseVersionMap(node),
        };
        const subPreview = await buildOrderPreview(subDraft, {
            processId,
            expectedCumulativeValue: cumulativeValue,
        });
        assertValidToSign(subPreview, "A sub-order");
        await signAndShare(subPreview);
        realOrderHash.set(
            node.id,
            commitmentOrderHash(subPreview.commitment, chainId),
        );
    }

    // Root last → the share panel shows the root for the buyer to relay to the
    // lead. The lead accepts → root commits → the already-shared sub-orders
    // unlock for their sellers to accept.
    await signRoot(rootPreview);
}

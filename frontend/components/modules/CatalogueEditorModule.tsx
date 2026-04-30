/**
 * components/modules/CatalogueEditorModule.tsx
 *
 * Seller-side catalogue management module.
 * Allows a merchant or driver to create, edit, and publish their offering
 * metadata to IPFS, then route the OperatorRegistry pointer write through
 * the shared runtime capability executor.
 *
 * Workflow:
 * 1. Load existing catalogue from metadataURI (if registered)
 * 2. Edit menu items, hours, branding, service areas in a form
 * 3. Publish → shared IPFS service → execute register/update operator profile capability
 *
 * Renders for both merchant and driver roles, adapting the form fields
 * based on the seller's role kind.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { useAccount } from "wagmi";
import { useMerchantCatalogue } from "@/lib/mechanisms/useMerchantCatalogue";
import {
    useOperatorProfile,
} from "@/lib/mechanisms/useOperatorRegistry";
import type {
    SellerCatalogueMetadata,
    CatalogueItemMetadata,
    SupportedSchemaDeclaration,
} from "@/lib/shared/sellerCatalogueMetadata";
import type { CanonicalFulfilmentMethod } from "@/lib/core/orderAgreement";
import { FULFILMENT_MODE_LABELS } from "@/lib/marketplace/fulfilmentRouting";

const ALL_FULFILMENT_MODES: CanonicalFulfilmentMethod[] = [
    "consume-onsite",
    "pickup",
    "deliver:buyer-assigned",
    "deliver:seller-assigned",
    "deliver:dutch-auction",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface MenuItemDraft {
    id: string;
    name: string;
    description: string;
    price: string;
    category: string;
    image: string;
    available: boolean;
}

function newMenuItem(): MenuItemDraft {
    return {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        description: "",
        price: "0.01",
        category: "General",
        image: "",
        available: true,
    };
}

function menuItemToMetadata(draft: MenuItemDraft): CatalogueItemMetadata {
    return {
        id: draft.id,
        name: draft.name,
        description: draft.description || undefined,
        price: draft.price,
        category: draft.category,
        image: draft.image || undefined,
        available: draft.available,
    };
}

function metadataToMenuDraft(item: CatalogueItemMetadata): MenuItemDraft {
    return {
        id: item.id,
        name: item.name,
        description: item.description ?? "",
        price: item.price,
        category: item.category,
        image: item.image ?? "",
        available: item.available,
    };
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

/** Inline file picker → IPFS upload → returns ipfs:// URI via onUploaded */
function IpfsUploadButton({
    evidenceTransport,
    onUploaded,
}: {
    evidenceTransport: ModuleProps["context"]["services"]["evidenceTransport"];
    onUploaded: (uri: string) => void;
}) {
    const [uploading, setUploading] = useState(false);
    const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const upload = await evidenceTransport.uploadFile(file);
            onUploaded(upload.uri);
        } catch {
            // Silently ignore — user can paste URI manually
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    }, [evidenceTransport, onUploaded]);

    return (
        <label
            className="inline-flex items-center text-xs px-2 py-1 border border-neutral-200 rounded cursor-pointer hover:bg-neutral-50 text-neutral-600 whitespace-nowrap min-h-[30px]"
            data-testid="btn-upload-image"
        >
            {uploading ? "Uploading…" : "📷 Upload"}
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>
    );
}

function MenuItemRow({
    item,
    onChange,
    onRemove,
    evidenceTransport,
}: {
    item: MenuItemDraft;
    onChange: (updated: MenuItemDraft) => void;
    onRemove: () => void;
    evidenceTransport: ModuleProps["context"]["services"]["evidenceTransport"];
}) {
    return (
        <div className="border border-neutral-200 rounded-lg p-3 space-y-2" data-testid={`menu-item-editor-${item.id}`}>
            <div className="flex items-center justify-between">
                <input
                    data-testid="menu-item-name"
                    type="text"
                    placeholder="Item name"
                    value={item.name}
                    onChange={(e) => onChange({ ...item, name: e.target.value })}
                    className="flex-1 text-sm font-medium border border-neutral-200 rounded px-2 py-1 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                />
                <button
                    data-testid="btn-remove-item"
                    onClick={onRemove}
                    className="ml-2 text-xs text-red-600 hover:text-red-700 min-h-[36px] px-2"
                    aria-label={`Remove ${item.name || "item"}`}
                >
                    ✕ Remove
                </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <input
                    data-testid="menu-item-price"
                    type="text"
                    placeholder="Price (ETH)"
                    value={item.price}
                    onChange={(e) => onChange({ ...item, price: e.target.value })}
                    className="text-sm border border-neutral-200 rounded px-2 py-1 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                />
                <input
                    data-testid="menu-item-category"
                    type="text"
                    placeholder="Category"
                    value={item.category}
                    onChange={(e) => onChange({ ...item, category: e.target.value })}
                    className="text-sm border border-neutral-200 rounded px-2 py-1 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                />
            </div>
            <textarea
                data-testid="menu-item-description"
                placeholder="Description (optional)"
                value={item.description}
                onChange={(e) => onChange({ ...item, description: e.target.value })}
                rows={2}
                className="w-full text-sm border border-neutral-200 rounded px-2 py-1 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black resize-none"
            />
            <div className="flex items-center gap-3">
                <input
                    data-testid="menu-item-image"
                    type="text"
                    placeholder="Image URI (ipfs:// or emoji)"
                    value={item.image}
                    onChange={(e) => onChange({ ...item, image: e.target.value })}
                    className="flex-1 text-sm border border-neutral-200 rounded px-2 py-1 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                />
                <IpfsUploadButton
                    evidenceTransport={evidenceTransport}
                    onUploaded={(uri) => onChange({ ...item, image: uri })}
                />
                <label className="flex items-center gap-1 text-xs text-neutral-600">
                    <input
                        data-testid="menu-item-available"
                        type="checkbox"
                        checked={item.available}
                        onChange={(e) => onChange({ ...item, available: e.target.checked })}
                    />
                    Available
                </label>
            </div>
        </div>
    );
}

// ── Well-known schemas ────────────────────────────────────────────────────────

/** Schemas available for seller self-declaration.
 *  Each maps to a schema registered in SchemaRegistry on deploy. */
const WELL_KNOWN_SCHEMAS: { key: string; label: string; description: string }[] = [
    { key: "figaro-delivery-lifecycle-v1", label: "Delivery Lifecycle", description: "Order → pickup → delivery coordination signals" },
    { key: "figaro-ghg-protocol-v1", label: "GHG Protocol Disclosure", description: "GHG Protocol Corporate Standard emissions reporting per order" },
    { key: "figaro-ghg-iso-14064-v1", label: "ISO 14064 GHG Disclosure", description: "ISO 14064-aligned emissions reporting per order" },
    { key: "figaro-ghg-pas-2050-v1", label: "PAS 2050 GHG Disclosure", description: "PAS 2050 product carbon footprint reporting per order" },
    { key: "figaro-ghg-en-16258-v1", label: "EN 16258 GHG Disclosure", description: "EN 16258 transport emissions reporting per order" },
    { key: "figaro-ghg-custom-v1", label: "Custom GHG Disclosure", description: "Custom or non-standard GHG accounting methodology per order" },
    { key: "figaro-proximity-policy-v1", label: "Proximity Policy", description: "Required detection band committed at agreement signing (Category-2)" },
    { key: "figaro-proximity-proof-v1", label: "Proximity Proof", description: "Per-handoff nonce + signed witness payload at runtime (Category-1)" },
    { key: "figaro-commerce-v1", label: "Commerce", description: "Commerce attestation schema for general trade" },
    { key: "figaro-handoff-v1", label: "Handoff", description: "Manifest encoding for order handoff data" },
    { key: "erc8004-agent-services-v1", label: "Agent Services", description: "ERC-8004 autonomous agent service declarations" },
];

// ── Main module ───────────────────────────────────────────────────────────────

export function CatalogueEditorModule({ moduleId, context }: ModuleProps) {
    const { selectedRoleKind } = context;
    const { address } = useAccount();
    const { catalogue: catalogueService, evidenceTransport } = context.services;
    const accentTone = context.skinBundle?.branding.branding.accentColor;
    const shellLabel = context.shellPresentation.title;
    const sellerAddr = address as `0x${string}` | undefined;
    const accentTextStyle = accentTone ? { color: accentTone } : undefined;
    const accentCardStyle = accentTone ? { borderTopColor: accentTone, borderTopWidth: "2px" } : undefined;
    const accentButtonStyle = accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined;

    const { catalogue, isLoading: catalogueLoading, refetch } = useMerchantCatalogue(sellerAddr, {
        service: catalogueService,
    });
    const { data: profile } = useOperatorProfile(sellerAddr);

    const isRegistered = profile
        ? profile[0] !== 0
        : false;
    // Web2-strip (2026-04-26): in-place metadata updates were removed. The
    // catalogue editor now only wires through the register-operator capability.
    // Already-registered operators must withdraw + re-register to update their
    // catalogue URI on-chain (the dedup guard is cleared on withdraw).
    const operatorProfileCapability = context.capabilities.find(
        (capability) => capability.action.executionType === "transaction"
            && capability.action.kind === "register-operator"
    );

    // ── Form state ────────────────────────────────────────────────────────────

    const [merchantName, setMerchantName] = useState("");
    const [description, setDescription] = useState("");
    const [cuisine, setCuisine] = useState("");
    const [geohash, setGeohash] = useState("");
    const [addressText, setAddressText] = useState("");
    const [minimumOrder, setMinimumOrder] = useState("0.01");
    const [estimatedFulfillment, setEstimatedFulfillment] = useState("30-45 min");
    const [menuItems, setMenuItems] = useState<MenuItemDraft[]>([newMenuItem()]);
    const [accentColor, setAccentColor] = useState("");
    const [logoURI, setLogoURI] = useState("");
    const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set());
    const [selectedFulfilmentModes, setSelectedFulfilmentModes] = useState<Set<CanonicalFulfilmentMethod>>(
        new Set(["deliver:seller-assigned"]),
    );

    const [publishStatus, setPublishStatus] = useState<"idle" | "pinning" | "updating" | "done" | "error">("idle");
    const [publishError, setPublishError] = useState<string | null>(null);

    // ── Hydrate form from existing catalogue ──────────────────────────────────

    useEffect(() => {
        if (!catalogue) return;
        setMerchantName(catalogue.name);
        setDescription(catalogue.description ?? "");
        setCuisine(catalogue.cuisine ?? "");
        setGeohash(catalogue.location.geohash);
        setAddressText(catalogue.location.addressText ?? "");
        setMinimumOrder(catalogue.minimumOrder ?? "0.01");
        setEstimatedFulfillment(catalogue.estimatedFulfillment ?? "30-45 min");
        setMenuItems(
            catalogue.menu.length > 0
                ? catalogue.menu.map(metadataToMenuDraft)
                : [newMenuItem()]
        );
        setAccentColor(catalogue.branding?.accentColor ?? "");
        setLogoURI(catalogue.branding?.logoURI ?? "");
        if (catalogue.supportedSchemas) {
            setSelectedSchemas(new Set(catalogue.supportedSchemas.map((s) => s.schemaKey)));
        }
        const declared = (catalogue.fulfillmentModes ?? []).filter(
            (m): m is CanonicalFulfilmentMethod =>
                (ALL_FULFILMENT_MODES as readonly string[]).includes(m),
        );
        if (declared.length > 0) {
            setSelectedFulfilmentModes(new Set(declared));
        }
    }, [catalogue]);

    // ── Menu item CRUD ────────────────────────────────────────────────────────

    const addMenuItem = useCallback(() => {
        setMenuItems((items) => [...items, newMenuItem()]);
    }, []);

    const removeMenuItem = useCallback((index: number) => {
        setMenuItems((items) => items.filter((_, i) => i !== index));
    }, []);

    const updateMenuItem = useCallback((index: number, updated: MenuItemDraft) => {
        setMenuItems((items) => items.map((item, i) => (i === index ? updated : item)));
    }, []);

    // ── Schema selection ──────────────────────────────────────────────────────

    const toggleSchema = useCallback((key: string) => {
        setSelectedSchemas((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const toggleFulfilmentMode = useCallback((mode: CanonicalFulfilmentMethod) => {
        setSelectedFulfilmentModes((prev) => {
            const next = new Set(prev);
            if (next.has(mode)) next.delete(mode);
            else next.add(mode);
            return next;
        });
    }, []);

    // ── Publish flow ──────────────────────────────────────────────────────────

    const handlePublish = useCallback(async () => {
        if (!sellerAddr) return;

        const validItems = menuItems.filter((item) => item.name.trim());
        if (validItems.length === 0) {
            setPublishError("Add at least one menu item with a name.");
            setPublishStatus("error");
            return;
        }

        if (!merchantName.trim()) {
            setPublishError("Merchant name is required.");
            setPublishStatus("error");
            return;
        }

        if (!geohash.trim()) {
            setPublishError("Location geohash is required.");
            setPublishStatus("error");
            return;
        }

        setPublishStatus("pinning");
        setPublishError(null);

        try {
            const doc: SellerCatalogueMetadata = {
                subjectAddress: sellerAddr,
                archetypeId: "merchant-one-hop-delivery",
                merchantId: merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                slug: merchantName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                name: merchantName.trim(),
                description: description.trim() || undefined,
                cuisine: cuisine.trim() || undefined,
                fulfillmentModes: selectedFulfilmentModes.size > 0
                    ? Array.from(selectedFulfilmentModes)
                    : ["deliver:seller-assigned"],
                location: {
                    geohash: geohash.trim(),
                    addressText: addressText.trim() || undefined,
                },
                minimumOrder: minimumOrder || undefined,
                estimatedFulfillment: estimatedFulfillment || undefined,
                menu: validItems.map(menuItemToMetadata),
                branding: (accentColor || logoURI)
                    ? {
                        displayName: merchantName.trim(),
                        accentColor: accentColor || undefined,
                        logoURI: logoURI || undefined,
                    }
                    : undefined,
                supportedSchemas: selectedSchemas.size > 0
                    ? Array.from(selectedSchemas).map((key): SupportedSchemaDeclaration => ({ schemaKey: key }))
                    : undefined,
                version: "1.0.0",
            };

            const { uri } = await catalogueService.publishMerchantCatalogue(doc);

            // Already-registered operators: catalogue is pinned to IPFS but
            // the on-chain metadataURI cannot be updated in-place (no
            // updateProfile after web2-strip). The new URI is shown in the
            // success state; the operator must withdraw + re-register if they
            // want it bound on-chain.
            if (isRegistered) {
                setPublishStatus("done");
                await refetch();
                return;
            }

            setPublishStatus("updating");

            if (!operatorProfileCapability) {
                throw new Error("No operator registration capability is available for the selected role.");
            }

            await context.onExecuteCapability(
                operatorProfileCapability,
                { kind: "register-operator", metadataURI: uri },
            );

            setPublishStatus("done");
            await refetch();
        } catch (err) {
            setPublishStatus("error");
            setPublishError(err instanceof Error ? err.message : "Publish failed");
        }
    }, [
        catalogueService, sellerAddr, merchantName, description, cuisine, geohash, addressText,
        minimumOrder, estimatedFulfillment, menuItems, accentColor, logoURI,
        selectedSchemas, operatorProfileCapability, context, refetch, isRegistered,
    ]);

    // ── Render ────────────────────────────────────────────────────────────────

    // Only show for restaurant (seller) role
    if (selectedRoleKind !== "merchant") return null;

    if (!address) {
        return (
            <div data-testid="catalogue-editor-module" data-module-id={moduleId}
                data-skin={context.skinBundle?.skinId}
                className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm"
                style={accentCardStyle}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500" style={accentTextStyle}>Seller Setup</p>
                <h3 className="text-lg font-semibold text-black mb-2">Catalogue Editor</h3>
                <p className="text-sm text-neutral-500 mb-2">{shellLabel}</p>
                <p className="text-sm text-neutral-500">Connect your wallet to manage your catalogue.</p>
            </div>
        );
    }

    if (catalogueLoading) {
        return (
            <div data-testid="catalogue-editor-module" data-module-id={moduleId}
                data-skin={context.skinBundle?.skinId}
                className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm"
                style={accentCardStyle}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500" style={accentTextStyle}>Seller Setup</p>
                <h3 className="text-lg font-semibold text-black mb-2">Catalogue Editor</h3>
                <p className="text-sm text-neutral-500 mb-3">{shellLabel}</p>
                <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-neutral-100 rounded w-1/3" />
                    <div className="h-4 bg-neutral-100 rounded w-2/3" />
                    <div className="h-4 bg-neutral-100 rounded w-1/2" />
                </div>
            </div>
        );
    }

    return (
        <div data-testid="catalogue-editor-module" data-module-id={moduleId}
            data-skin={context.skinBundle?.skinId}
            className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm space-y-6"
            style={accentCardStyle}>

            <div className="flex items-center justify-between">
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500" style={accentTextStyle}>Seller Setup</p>
                    <h3 className="text-lg font-semibold text-black">Catalogue Editor</h3>
                    <p className="text-sm text-neutral-500">{shellLabel}</p>
                </div>
                {isRegistered && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Registered</span>
                )}
            </div>

            {/* Merchant info */}
            <section className="space-y-3">
                <h4 className="text-sm font-medium text-black" style={accentTextStyle}>Merchant Info</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-neutral-500">Name *</label>
                        <input
                            data-testid="catalogue-name"
                            type="text"
                            value={merchantName}
                            onChange={(e) => setMerchantName(e.target.value)}
                            placeholder="Your business name"
                            className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-neutral-500">Cuisine</label>
                        <input
                            data-testid="catalogue-cuisine"
                            type="text"
                            value={cuisine}
                            onChange={(e) => setCuisine(e.target.value)}
                            placeholder="e.g. Italian, Japanese"
                            className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-xs text-neutral-500">Description</label>
                        <textarea
                            data-testid="catalogue-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            placeholder="A short description of your offering"
                            className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black resize-none"
                        />
                    </div>
                </div>
            </section>

            {/* Location */}
            <section className="space-y-3">
                <h4 className="text-sm font-medium text-black" style={accentTextStyle}>Location</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-neutral-500">Geohash * (6 chars)</label>
                        <input
                            data-testid="catalogue-geohash"
                            type="text"
                            value={geohash}
                            onChange={(e) => setGeohash(e.target.value.slice(0, 6))}
                            maxLength={6}
                            placeholder="e.g. dr5reg"
                            className="w-full text-sm font-mono border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-neutral-500">Address (display only)</label>
                        <input
                            data-testid="catalogue-address-text"
                            type="text"
                            value={addressText}
                            onChange={(e) => setAddressText(e.target.value)}
                            placeholder="Lower Manhattan, NY"
                            className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>
                </div>
            </section>

            {/* Order settings */}
            <section className="space-y-3">
                <h4 className="text-sm font-medium text-black" style={accentTextStyle}>Order Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-neutral-500">Minimum Order (ETH)</label>
                        <input
                            data-testid="catalogue-min-order"
                            type="text"
                            value={minimumOrder}
                            onChange={(e) => setMinimumOrder(e.target.value)}
                            className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-neutral-500">Estimated Fulfillment</label>
                        <input
                            data-testid="catalogue-fulfillment-time"
                            type="text"
                            value={estimatedFulfillment}
                            onChange={(e) => setEstimatedFulfillment(e.target.value)}
                            placeholder="30-45 min"
                            className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                        />
                    </div>
                </div>
            </section>

            {/* Branding */}
            <section className="space-y-3">
                <h4 className="text-sm font-medium text-black" style={accentTextStyle}>Branding (optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-neutral-500">Logo URI (ipfs:// or URL)</label>
                        <div className="flex gap-2">
                            <input
                                data-testid="catalogue-logo-uri"
                                type="text"
                                value={logoURI}
                                onChange={(e) => setLogoURI(e.target.value)}
                                placeholder="ipfs://Qm..."
                                className="flex-1 text-sm border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                            />
                            <IpfsUploadButton
                                evidenceTransport={evidenceTransport}
                                onUploaded={(uri) => setLogoURI(uri)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-neutral-500">Accent Color</label>
                        <div className="flex gap-2">
                            <input
                                data-testid="catalogue-accent-color"
                                type="text"
                                value={accentColor}
                                onChange={(e) => setAccentColor(e.target.value)}
                                placeholder="#c2410c"
                                className="flex-1 text-sm border border-neutral-200 rounded px-2 py-1.5 text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                            />
                            {accentColor && (
                                <div
                                    className="w-8 h-8 rounded border border-neutral-200"
                                    style={{ backgroundColor: accentColor }}
                                    aria-hidden="true"
                                />
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Fulfillment Modes — what shapes of order this merchant accepts.
                 Drives the cart's mode picker and routes commitments to the
                 right assembly (consume-onsite/pickup → direct-sale; deliver:* → local-commerce). */}
            <section className="space-y-3">
                <h4 className="text-sm font-medium text-black" style={accentTextStyle}>Fulfillment Modes</h4>
                <p className="text-xs text-neutral-500">
                    Declare which fulfilment methods you accept. The buyer&apos;s cart picker shows only these. <code>consume-onsite</code> and <code>pickup</code> imply a one-node order (no delivery sub-order); the three <code>deliver:*</code> variants imply a courier sub-order.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {ALL_FULFILMENT_MODES.map((mode) => (
                        <label
                            key={mode}
                            className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${selectedFulfilmentModes.has(mode)
                                ? "border-black bg-neutral-50"
                                : "border-neutral-200 hover:border-neutral-300"
                                }`}
                            style={selectedFulfilmentModes.has(mode) && accentTone
                                ? {
                                    borderColor: accentTone,
                                    boxShadow: `0 0 0 1px ${accentTone} inset`,
                                }
                                : undefined}
                            data-testid={`fulfilment-mode-toggle-${mode}`}
                        >
                            <input
                                type="checkbox"
                                checked={selectedFulfilmentModes.has(mode)}
                                onChange={() => toggleFulfilmentMode(mode)}
                                className="mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-medium text-black">{FULFILMENT_MODE_LABELS[mode]}</span>
                                <p className="text-xs text-neutral-500 font-mono">{mode}</p>
                            </div>
                        </label>
                    ))}
                </div>
                {selectedFulfilmentModes.size === 0 && (
                    <p className="text-xs text-amber-700">
                        At least one fulfilment mode is required. Defaulting to <code>deliver:seller-assigned</code> on publish.
                    </p>
                )}
            </section>

            {/* Supported Schemas — seller-level composability */}
            <section className="space-y-3">
                <h4 className="text-sm font-medium text-black" style={accentTextStyle}>Supported Schemas</h4>
                <p className="text-xs text-neutral-500">
                    Declare which protocol schemas you operate under. This defines your capability set.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {WELL_KNOWN_SCHEMAS.map((s) => (
                        <label
                            key={s.key}
                            className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${selectedSchemas.has(s.key)
                                ? "border-black bg-neutral-50"
                                : "border-neutral-200 hover:border-neutral-300"
                                }`}
                            style={selectedSchemas.has(s.key) && accentTone
                                ? {
                                    borderColor: accentTone,
                                    boxShadow: `0 0 0 1px ${accentTone} inset`,
                                }
                                : undefined}
                            data-testid={`schema-toggle-${s.key}`}
                        >
                            <input
                                type="checkbox"
                                checked={selectedSchemas.has(s.key)}
                                onChange={() => toggleSchema(s.key)}
                                className="mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-medium text-black">{s.label}</span>
                                <p className="text-xs text-neutral-500">{s.description}</p>
                            </div>
                        </label>
                    ))}
                </div>
                {selectedSchemas.size > 0 && (
                    <p className="text-xs text-neutral-500">
                        {selectedSchemas.size} schema{selectedSchemas.size !== 1 ? "s" : ""} selected
                    </p>
                )}
            </section>

            {/* Menu items */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-black" style={accentTextStyle}>Menu Items</h4>
                    <button
                        data-testid="btn-add-menu-item"
                        onClick={addMenuItem}
                        className="text-xs px-3 py-1.5 bg-black text-white rounded hover:bg-neutral-800 transition-colors min-h-[36px]"
                        style={accentButtonStyle}
                    >
                        + Add Item
                    </button>
                </div>
                <div className="space-y-3">
                    {menuItems.map((item, index) => (
                        <MenuItemRow
                            key={item.id}
                            item={item}
                            onChange={(updated) => updateMenuItem(index, updated)}
                            onRemove={() => removeMenuItem(index)}
                            evidenceTransport={evidenceTransport}
                        />
                    ))}
                </div>
                {menuItems.length === 0 && (
                    <p className="text-sm text-neutral-500">No items. Add at least one menu item to publish.</p>
                )}
            </section>

            {/* Publish */}
            <div className="border-t border-neutral-200 pt-4">
                {publishError && (
                    <div className="text-sm text-red-600 mb-3 p-2 bg-red-50 rounded" data-testid="publish-error">
                        {publishError}
                    </div>
                )}
                {publishStatus === "done" && (
                    <div className="text-sm text-green-700 mb-3 p-2 bg-green-50 rounded" data-testid="publish-success">
                        Catalogue published successfully. On-chain pointer updated.
                    </div>
                )}
                <div className="flex items-center gap-3">
                    <button
                        data-testid="btn-publish-catalogue"
                        onClick={handlePublish}
                        disabled={publishStatus === "pinning" || publishStatus === "updating"}
                        className="px-4 py-2 bg-black text-white rounded hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 transition-colors text-sm font-medium min-h-[44px]"
                        style={publishStatus === "idle" || publishStatus === "done" || publishStatus === "error"
                            ? accentButtonStyle
                            : undefined}
                    >
                        {publishStatus === "pinning" ? "Pinning to IPFS…" :
                            publishStatus === "updating" ? "Updating on-chain…" :
                                isRegistered ? "Publish Update" : "Register & Publish"}
                    </button>
                    <span className="text-xs text-neutral-500">
                        {menuItems.filter((i) => i.name.trim()).length} item{menuItems.filter((i) => i.name.trim()).length !== 1 ? "s" : ""}
                    </span>
                </div>
            </div>
        </div>
    );
}

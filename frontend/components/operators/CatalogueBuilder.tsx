"use client";

import { useState } from "react";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { TokenAddressInput, isValidAddress } from "./TokenAddressInput";

// ── Catalogue schema ──────────────────────────────────────────────────────────

export interface CatalogueItem {
    id: string;
    name: string;
    description: string;
    price: string;
    category: string;
    available: boolean;
}

export interface CatalogueDocument {
    version: "1";
    name: string;
    denominatedIn: string;
    items: CatalogueItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
    return Math.random().toString(36).slice(2, 10);
}

function emptyItem(): CatalogueItem {
    return { id: uid(), name: "", description: "", price: "", category: "", available: true };
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="border-t border-gray-100 pt-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-6">
                {title}
            </p>
            <div className="space-y-6">{children}</div>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-semibold text-black mb-1">{label}</label>
            {hint && <p className="text-xs text-gray-500 mb-2">{hint}</p>}
            {children}
        </div>
    );
}

function StatusBox({ type, message }: { type: "error" | "progress" | "success"; message: string }) {
    const styles = {
        error: "bg-red-50 border-red-200 text-red-700",
        progress: "bg-gray-50 border-gray-200 text-gray-600",
        success: "bg-green-50 border-green-200 text-green-700",
    };
    return (
        <div className={`border rounded px-4 py-3 text-sm ${styles[type]}`}>
            {message}
        </div>
    );
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
    item,
    categories,
    onChange,
    onRemove,
}: {
    item: CatalogueItem;
    categories: string[];
    onChange: (updated: CatalogueItem) => void;
    onRemove: () => void;
}) {
    const inputClass =
        "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-black";

    return (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. Classic Burger"
                                value={item.name}
                                onChange={(e) => onChange({ ...item, name: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                            <input
                                type="text"
                                placeholder="e.g. 12.00"
                                value={item.price}
                                onChange={(e) => onChange({ ...item, price: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                        <input
                            type="text"
                            placeholder="Optional. Shown to buyers."
                            value={item.description}
                            onChange={(e) => onChange({ ...item, description: e.target.value })}
                            className={inputClass}
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                            <input
                                type="text"
                                placeholder="e.g. Burgers"
                                value={item.category}
                                onChange={(e) => onChange({ ...item, category: e.target.value })}
                                list={`cat-list-${item.id}`}
                                className={inputClass}
                            />
                            <datalist id={`cat-list-${item.id}`}>
                                {categories.map((c) => (
                                    <option key={c} value={c} />
                                ))}
                            </datalist>
                        </div>
                        <div className="flex-shrink-0 pt-5">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={item.available}
                                    onChange={(e) => onChange({ ...item, available: e.target.checked })}
                                    className="w-4 h-4 border-gray-300 rounded"
                                />
                                <span className="text-sm text-black">Available</span>
                            </label>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none mt-1 flex-shrink-0"
                    aria-label="Remove item"
                >
                    &times;
                </button>
            </div>
        </div>
    );
}

// ── Published result panel ────────────────────────────────────────────────────

function PublishedPanel({ uri, onReset }: { uri: string; onReset: () => void }) {
    const [copied, setCopied] = useState(false);

    function copy() {
        navigator.clipboard.writeText(uri).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <div className="space-y-4">
            <div className="border border-black rounded-lg px-6 py-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                    Step 2 complete
                </p>
                <p className="text-lg font-bold text-black mb-2">Catalogue published.</p>
                <p className="text-sm text-gray-600 mb-5">
                    Your catalogue is pinned to IPFS. Copy the URI and paste it into your operator profile.
                </p>

                <div className="bg-gray-50 border border-gray-200 rounded px-4 py-3 mb-4">
                    <p className="text-xs font-medium text-gray-500 mb-1">Catalogue URI</p>
                    <div className="flex items-center gap-3">
                        <code className="text-xs text-black font-mono break-all flex-1">{uri}</code>
                        <button
                            onClick={copy}
                            className="text-xs font-semibold text-black border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-100 flex-shrink-0"
                        >
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                    <a
                        href={`/operators?catalogueURI=${encodeURIComponent(uri)}`}
                        className="px-4 py-2 text-sm bg-black text-white rounded hover:bg-gray-800 transition-colors"
                    >
                        Update operator profile &rarr;
                    </a>
                    <button
                        onClick={onReset}
                        className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        Build another
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

type Status = { type: "idle" | "pinning" | "error"; message: string };

export function CatalogueBuilder() {
    const [catalogueName, setCatalogueName] = useState("");
    const [denominatedIn, setDenominatedIn] = useState("");
    const [items, setItems] = useState<CatalogueItem[]>([emptyItem()]);
    const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
    const [publishedURI, setPublishedURI] = useState<string | null>(null);

    const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];

    function updateItem(id: string, updated: CatalogueItem) {
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    }

    function removeItem(id: string) {
        setItems((prev) => prev.filter((i) => i.id !== id));
    }

    function addItem() {
        setItems((prev) => [...prev, emptyItem()]);
    }

    function reset() {
        setCatalogueName("");
        setDenominatedIn("");
        setItems([emptyItem()]);
        setStatus({ type: "idle", message: "" });
        setPublishedURI(null);
    }

    async function handlePublish(e: React.FormEvent) {
        e.preventDefault();
        if (!catalogueName.trim() || items.every((i) => !i.name.trim())) return;

        try {
            const doc: CatalogueDocument = {
                version: "1",
                name: catalogueName.trim(),
                denominatedIn: denominatedIn,
                items: items
                    .filter((i) => i.name.trim())
                    .map((i) => ({
                        id: i.id,
                        name: i.name.trim(),
                        description: i.description.trim(),
                        price: i.price.trim(),
                        category: i.category.trim(),
                        available: i.available,
                    })),
            };

            setStatus({ type: "pinning", message: "Pinning catalogue to IPFS..." });
            const { uri } = await DEFAULT_IPFS_SERVICE.publishJSON(doc);
            setPublishedURI(uri);
            setStatus({ type: "idle", message: "" });
        } catch (err) {
            setStatus({
                type: "error",
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    if (publishedURI) {
        return <PublishedPanel uri={publishedURI} onReset={reset} />;
    }

    const inputClass =
        "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-black";
    const busy = status.type === "pinning";
    const canPublish =
        catalogueName.trim() &&
        items.some((i) => i.name.trim()) &&
        isValidAddress(denominatedIn);

    return (
        <form onSubmit={handlePublish} className="space-y-0">
            {/* Section: Catalogue info */}
            <FormSection title="Catalogue">
                <Field label="Catalogue name" hint="Internal label — not shown to buyers.">
                    <input
                        required
                        type="text"
                        placeholder="e.g. Tasty Burger Menu"
                        value={catalogueName}
                        onChange={(e) => setCatalogueName(e.target.value)}
                        className={inputClass}
                    />
                </Field>
                <Field
                    label="Denomination token"
                    hint="The ERC-20 token in which item prices are expressed. Symbol is read from the contract."
                >
                    <TokenAddressInput
                        value={denominatedIn}
                        onChange={setDenominatedIn}
                    />
                    <p className="text-xs text-gray-400 mt-2">
                        FIG is the protocol&apos;s native coordination token. A stablecoin for legal convenience. Any ERC-20 works.
                    </p>
                </Field>
            </FormSection>

            {/* Section: Items */}
            <FormSection title={`Items (${items.length})`}>
                <div className="space-y-3">
                    {items.map((item) => (
                        <ItemRow
                            key={item.id}
                            item={item}
                            categories={categories}
                            onChange={(updated) => updateItem(item.id, updated)}
                            onRemove={() => removeItem(item.id)}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    onClick={addItem}
                    className="text-sm text-gray-500 hover:text-black flex items-center gap-1.5 transition-colors"
                >
                    <span className="text-base leading-none">+</span>
                    Add item
                </button>
            </FormSection>

            {/* Publish */}
            <div className="border-t border-gray-100 pt-8 space-y-4">
                <p className="text-xs text-gray-500">
                    Publishing pins the catalogue as an immutable IPFS document. You will receive a URI to add to your operator profile.
                </p>

                {status.type === "error" && <StatusBox type="error" message={status.message} />}
                {status.type === "pinning" && <StatusBox type="progress" message={status.message} />}

                <button
                    type="submit"
                    disabled={busy || !canPublish}
                    className="w-full py-3 bg-black text-white text-sm font-semibold rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                    {busy ? "Publishing..." : "Publish catalogue to IPFS"}
                </button>
            </div>
        </form>
    );
}

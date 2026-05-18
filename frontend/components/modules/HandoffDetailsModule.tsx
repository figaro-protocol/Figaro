"use client";

import { useState, useCallback, useMemo } from "react";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import {
    COS_OPTIONS,
    CoS,
    encodeGeohash,
    HandoffManifest,
} from "@/lib/handoff/manifest";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { useSchemaValidator } from "@/hooks/core/useSchemaValidator";
import { encodeFulfilmentV2Content, type FulfilmentHandoffPoint } from "@figaro/core/schemas";

/**
 * Handoff-point options — match `figaro-fulfilment-v2` handoffPoint enum.
 * The validator is the source of truth; this list is the UX surface.
 */
const HANDOFF_POINT_OPTIONS: ReadonlyArray<{ value: FulfilmentHandoffPoint; label: string; description: string }> = [
    { value: "face-to-face", label: "Hand to me", description: "Fulfiller waits for in-person handoff." },
    { value: "dead-drop", label: "Leave at door", description: "Fulfiller drops off without contact." },
    { value: "parking-area", label: "Curbside", description: "Meet at the parking area or curb." },
    { value: "locker", label: "Locker", description: "Drop into a designated locker / pickup box." },
];

/**
 * HandoffDetailsModule — captures destination details for any physical-handoff
 * institution (delivery, courier, logistics, etc.).
 *
 * Produces a HandoffManifest that the checkout flow can encode and seal.
 * Renders only for the buyer role.  The form captures:
 *   - destination address (required)
 *   - GPS-derived geohash for the dropoff zone
 *   - class-of-service selection
 *   - optional mass / volume
 *   - notes for the fulfiller
 *   - fulfiller budget cap (max price the auction can clear at)
 */

export function HandoffDetailsModule({ moduleId, context }: ModuleProps) {
    const { accentTone, shellLabel, cardStyle, labelStyle } = deriveModuleChrome(context);

    // Form state
    const [address, setAddress] = useState("");
    const [notes, setNotes] = useState("");
    const [cos, setCos] = useState<CoS>("S");
    const [handoffPoint, setHandoffPoint] = useState<FulfilmentHandoffPoint>("face-to-face");
    const [massKg, setMassKg] = useState("");
    const [volumeL, setVolumeL] = useState("");
    const [dropoffGeohash, setDropoffGeohash] = useState("");
    const [fulfillerMaxPrice, setFulfillerMaxPrice] = useState("0.002");
    const [geoLocating, setGeoLocating] = useState(false);
    const [geoError, setGeoError] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [verified, setVerified] = useState(false);

    // Layer A schema validation for the handoff-point selection. This module
    // captures the delivery-modality handoff, so validation runs against a
    // synthesized `{ modality: "delivery", handoffPoint }` figaro-fulfilment-v2
    // content shape — the same shape the on-chain FigaroFulfilmentV2Validator
    // enforces when the agreement section opens.
    const fulfilmentValidator = useSchemaValidator("figaro-fulfilment-v2");
    const handoffValidation = useMemo(
        () => fulfilmentValidator.validate({ modalities: ["delivery"], coordinations: ["seller-assigned"], handoffPoints: [handoffPoint] }),
        [fulfilmentValidator, handoffPoint],
    );
    const handoffPointValid = handoffValidation.ok;
    const handoffPointError = handoffValidation.ok ? null : handoffValidation.errors[0]?.message;

    // Derive pickup geohash from the selected order's mechanism context if available
    const coordinatorMech = context.mechanisms.find((m) => m.kind === "coordinator");
    const pickupGeohash = (coordinatorMech as unknown as Record<string, unknown> | undefined)?.pickupGeohash as string | undefined;

    const handleGeoLocate = useCallback(() => {
        if (!navigator.geolocation) {
            setGeoError("Geolocation not available in this browser.");
            return;
        }
        setGeoLocating(true);
        setGeoError("");
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const gh = encodeGeohash(pos.coords.latitude, pos.coords.longitude, 6);
                setDropoffGeohash(gh);
                setGeoLocating(false);
                if (!address) setAddress(`(GPS: ${gh})`);
            },
            (err) => {
                setGeoError(`GPS error: ${err.message}`);
                setGeoLocating(false);
            },
            { timeout: 8000 },
        );
    }, [address]);

    const handleSubmit = () => {
        if (!address.trim() || Number(fulfillerMaxPrice) <= 0 || !handoffPointValid) return;

        const manifest: HandoffManifest = {
            version: "v1",
            pickupGeohash: pickupGeohash || "------",
            dropoffGeohash: dropoffGeohash || "------",
            cos,
            massGrams: Math.round((parseFloat(massKg) || 0) * 1000),
            volumeMl: Math.round((parseFloat(volumeL) || 0) * 1000),
            destinationAddress: address.trim(),
            notes: notes.trim(),
        };

        // ABI-encode the figaro-fulfilment-v2 section content. This module
        // captures the delivery-modality handoff, so modality=delivery is
        // implicit; coordination is left unset (seller will set it). The
        // on-chain FigaroFulfilmentV2Validator re-decodes and re-checks the
        // same fields when the attestation eventually fires.
        const fulfilmentContent = encodeFulfilmentV2Content({
            modalities: ["delivery"],
            coordinations: ["seller-assigned"],
            handoffPoints: [handoffPoint],
        });

        // Store manifest in context for downstream modules (checkout, key exchange)
        // via a custom event so the shopping cart / order-creation flow can pick it up.
        window.dispatchEvent(
            new CustomEvent("figaro:handoff-manifest", {
                detail: { manifest, fulfillerMaxPrice, handoffPoint, fulfilmentContent },
            }),
        );
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div
                data-testid="handoff-details-module"
                data-module-id={moduleId}
                className="rounded-lg border border-green-200 bg-green-50 p-4"
                style={cardStyle}
            >
                <p className="mb-3 text-xs font-semibold text-neutral-500" style={labelStyle}>
                    {shellLabel}
                </p>
                <p className="text-sm font-semibold text-green-800">Handoff details confirmed</p>
                <p className="mt-1 text-xs text-green-700">
                    Destination: {address} {dropoffGeohash && <span className="font-mono">({dropoffGeohash})</span>}
                </p>
                <button
                    data-testid="btn-edit-handoff"
                    onClick={() => setSubmitted(false)}
                    className="mt-2 text-xs text-green-700 hover:text-green-900 underline"
                >
                    Edit details
                </button>
            </div>
        );
    }

    return (
        <div
            data-testid="handoff-details-module"
            data-module-id={moduleId}
            className="rounded-lg border border-neutral-200 bg-white p-6 space-y-5"
            style={cardStyle}
        >
            <p className="text-xs font-semibold text-neutral-500" style={labelStyle}>
                {shellLabel}
            </p>
            <h3 className="text-lg font-bold text-black">Handoff Details</h3>
            <p className="text-xs text-neutral-500">
                This information is encoded in the on-chain manifest and used by fulfillers to decide whether to bid on your job.
                Your full address is only revealed once a fulfiller wins the auction.
            </p>

            {/* Destination address */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Destination address <span className="text-red-500">*</span>
                </label>
                <textarea
                    data-testid="input-destination-address"
                    className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={2}
                    placeholder="123 Main St, Apt 4B, City, State, ZIP"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                />
                <div className="mt-1 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleGeoLocate}
                        disabled={geoLocating}
                        className="text-xs text-blue-600 hover:text-blue-700 disabled:text-neutral-400 flex items-center gap-1"
                        style={accentTone && !geoLocating ? { color: accentTone } : undefined}
                    >
                        {geoLocating ? "Locating…" : "📍 Use my GPS location (geohash)"}
                    </button>
                    {dropoffGeohash && (
                        <span className="text-xs text-green-600 font-mono">✓ {dropoffGeohash}</span>
                    )}
                </div>
                {geoError && <p className="text-xs text-red-500 mt-1">{geoError}</p>}
            </div>

            {/* Dropoff geohash (manual override) */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Geohash zone{" "}
                    <span className="text-neutral-500 font-normal">(optional — auto-filled by GPS)</span>
                </label>
                <input
                    data-testid="input-dropoff-geohash"
                    type="text"
                    maxLength={9}
                    className="w-40 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm font-mono placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. dqcjr5"
                    value={dropoffGeohash}
                    onChange={(e) =>
                        setDropoffGeohash(
                            e.target.value.toLowerCase().replace(/[^0-9bcdefghjkmnpqrstuvwxyz]/g, ""),
                        )
                    }
                />
                <p className="text-xs text-neutral-500 mt-1">
                    6-char geohash ≈ 1.2km × 0.6km precision. Fulfillers use this to filter jobs.
                </p>
            </div>

            {/* Fulfiller budget cap */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Fulfiller budget cap <span className="text-red-500">*</span>
                </label>
                <input
                    data-testid="input-fulfiller-max-price"
                    type="number"
                    min="0.001"
                    step="0.001"
                    className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.002"
                    value={fulfillerMaxPrice}
                    onChange={(e) => setFulfillerMaxPrice(e.target.value)}
                />
                <p className="text-xs text-neutral-500 mt-1">
                    Maximum price the dispatch market can clear at after the seller accepts.
                </p>
            </div>

            {/* Class of service */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Class of service</label>
                <div className="grid grid-cols-2 gap-2">
                    {COS_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            data-testid={`cos-btn-${opt.value}`}
                            onClick={() => setCos(opt.value)}
                            className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${cos === opt.value
                                ? "border-blue-500 bg-blue-50 text-black"
                                : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
                                }`}
                            style={cos === opt.value && accentTone
                                ? {
                                    borderColor: accentTone,
                                    backgroundColor: `${accentTone}1a`,
                                }
                                : undefined}
                        >
                            <span className="font-medium">{opt.label}</span>
                            <br />
                            <span className="text-xs text-neutral-500">{opt.description}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Handoff point — figaro-fulfilment-v2 (Layer A validated, Layer C enforced) */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Handoff point <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {HANDOFF_POINT_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            data-testid={`handoff-point-btn-${opt.value}`}
                            onClick={() => setHandoffPoint(opt.value)}
                            className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${handoffPoint === opt.value
                                ? "border-blue-500 bg-blue-50 text-black"
                                : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
                                }`}
                            style={handoffPoint === opt.value && accentTone
                                ? { borderColor: accentTone, backgroundColor: `${accentTone}1a` }
                                : undefined}
                        >
                            <span className="font-medium">{opt.label}</span>
                            <br />
                            <span className="text-xs text-neutral-500">{opt.description}</span>
                        </button>
                    ))}
                </div>
                {!handoffPointValid && handoffPointError && (
                    <p data-testid="handoff-point-validation-error" className="text-xs text-red-500 mt-1">
                        Schema validation: {handoffPointError}
                    </p>
                )}
                {fulfilmentValidator.loadError && (
                    <p className="text-xs text-amber-600 mt-1">
                        Schema spec failed to load: {fulfilmentValidator.loadError}
                    </p>
                )}
            </div>

            {/* Mass + Volume (optional) */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Mass <span className="text-neutral-500 font-normal">(kg, optional)</span>
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0.5"
                        className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={massKg}
                        onChange={(e) => setMassKg(e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Volume <span className="text-neutral-500 font-normal">(L, optional)</span>
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="1.0"
                        className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={volumeL}
                        onChange={(e) => setVolumeL(e.target.value)}
                    />
                </div>
            </div>

            {/* Notes */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Notes for fulfiller <span className="text-neutral-500 font-normal">(optional)</span>
                </label>
                <textarea
                    className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={2}
                    placeholder="e.g. Leave at door, call on arrival, gate code 1234…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            {/* Info callout */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs text-neutral-500 space-y-1">
                <p>
                    <strong className="text-neutral-700">Privacy:</strong> Your geohash zone (≈1km radius) is visible to all
                    fulfillers browsing jobs. Your exact address is stored in the manifest bytes and only revealed by apps
                    once a fulfiller wins the auction.
                </p>
                <p>
                    <strong className="text-neutral-700">On-chain:</strong> Manifest bytes are stored in the{" "}
                    <code>OrderCreated</code> event. Encryption uses per-order AES-256-GCM keys exchanged via XMTP.
                </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={verified}
                    onChange={(e) => setVerified(e.target.checked)}
                    className="rounded border-neutral-300"
                    data-testid="handoff-verified-checkbox"
                />
                I&apos;ve verified my delivery details are correct
            </label>

            <button
                data-testid="btn-confirm-handoff"
                onClick={handleSubmit}
                disabled={!address.trim() || Number(fulfillerMaxPrice) <= 0 || !verified || !handoffPointValid}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white font-semibold py-3 rounded-lg transition-colors"
                style={address.trim() && Number(fulfillerMaxPrice) > 0 && verified && handoffPointValid && accentTone
                    ? { backgroundColor: accentTone, borderColor: accentTone }
                    : undefined}
            >
                Confirm Handoff Details
            </button>
        </div>
    );
}

"use client";

/**
 * /settings — the wallet's own runtime infrastructure endpoints.
 *
 * The build-baked NEXT_PUBLIC_* endpoints are only defaults; this surface
 * writes the user's overrides (localStorage, `lib/shared/userEndpoints`).
 * Custody follows the composition cost model: reads go through the user's
 * own RPC provider; pins land on the user's own IPFS node — author pins,
 * author pays, author erases. No operator-side service sits in the middle.
 *
 * IPFS overrides apply immediately (the IpfsService seam resolves per
 * call); the RPC override applies on the next reload (wagmi's config is
 * created at module load).
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useMounted } from "@/hooks/useMounted";
import {
    readUserEndpoints,
    writeUserEndpoints,
    type UserEndpointOverrides,
} from "@/lib/shared/userEndpoints";
import {
    readUserTransport,
    writeUserTransport,
    DEFAULT_TRANSPORT,
    type CoordinationTransport,
} from "@/lib/shared/userTransport";

export default function SettingsPage() {
    const mounted = useMounted();
    const [form, setForm] = useState<Required<UserEndpointOverrides>>({
        rpcUrl: "",
        ipfsApiUrl: "",
        ipfsGatewayUrl: "",
        geocodeUrl: "",
    });
    const [transport, setTransport] = useState<CoordinationTransport>(DEFAULT_TRANSPORT);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!mounted) return;
        const current = readUserEndpoints();
        setForm({
            rpcUrl: current.rpcUrl ?? "",
            ipfsApiUrl: current.ipfsApiUrl ?? "",
            ipfsGatewayUrl: current.ipfsGatewayUrl ?? "",
            geocodeUrl: current.geocodeUrl ?? "",
        });
        setTransport(readUserTransport());
    }, [mounted]);

    if (!mounted) return null;

    function setField(key: keyof UserEndpointOverrides, value: string) {
        setSaved(false);
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function setTransportField(value: CoordinationTransport) {
        setSaved(false);
        setTransport(value);
    }

    function handleSave() {
        writeUserEndpoints(form);
        writeUserTransport(transport);
        setSaved(true);
    }

    return (
        <div className="max-w-2xl space-y-6">
            <header className="space-y-2">
                <h1 className="text-heading-h1 text-ink-heading">Endpoints</h1>
                <p className="text-sm text-ink-body">
                    The network services this frontend reads and writes through are
                    yours, not an operator&apos;s: chain reads go through your own RPC
                    provider, and what you publish is pinned on your own IPFS
                    node — you pay for it, and you can erase it. Leave a field
                    empty to use this deployment&apos;s default.
                </p>
            </header>

            <Card className="p-6 space-y-5">
                <FormField label="RPC endpoint" inputId="settings-rpc-url">
                    <Input
                        id="settings-rpc-url"
                        type="text"
                        placeholder="https://… (your JSON-RPC provider)"
                        value={form.rpcUrl}
                        onChange={(e) => setField("rpcUrl", e.target.value)}
                        data-testid="settings-rpc-url"
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Chain reads (orders, registries, attestations). Applies on the
                        next reload.
                    </p>
                </FormField>

                <FormField label="IPFS API endpoint" inputId="settings-ipfs-api-url">
                    <Input
                        id="settings-ipfs-api-url"
                        type="text"
                        placeholder="http://127.0.0.1:5001 (your Kubo node)"
                        value={form.ipfsApiUrl}
                        onChange={(e) => setField("ipfsApiUrl", e.target.value)}
                        data-testid="settings-ipfs-api-url"
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Where your pins land — profiles, catalogues, agreements,
                        evidence. Unpinning erases from this node. Applies immediately.
                    </p>
                </FormField>

                <FormField label="IPFS gateway" inputId="settings-ipfs-gateway-url">
                    <Input
                        id="settings-ipfs-gateway-url"
                        type="text"
                        placeholder="http://127.0.0.1:8080"
                        value={form.ipfsGatewayUrl}
                        onChange={(e) => setField("ipfsGatewayUrl", e.target.value)}
                        data-testid="settings-ipfs-gateway-url"
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Where pinned content is read from. Applies immediately.
                    </p>
                </FormField>

                <FormField label="Geocoder" inputId="settings-geocode-url">
                    <Input
                        id="settings-geocode-url"
                        type="text"
                        placeholder="https://nominatim.openstreetmap.org/search"
                        value={form.geocodeUrl}
                        onChange={(e) => setField("geocodeUrl", e.target.value)}
                        data-testid="settings-geocode-url"
                    />
                    <p className="text-xs text-ink-faint mt-1">
                        Nominatim-compatible search endpoint typed addresses resolve
                        through — called directly from your browser, only when you use
                        &ldquo;From address&rdquo;. Applies immediately.
                    </p>
                </FormField>

                <FormField label="Coordination transport" inputId="settings-transport">
                    <Select
                        id="settings-transport"
                        value={transport}
                        onChange={(e) => setTransportField(e.target.value as CoordinationTransport)}
                        data-testid="settings-transport"
                    >
                        <option value="links-only">Share links only (default)</option>
                        <option value="xmtp">XMTP push (dev network)</option>
                    </Select>
                    <p className="text-xs text-ink-faint mt-1">
                        How a pending commitment reaches the other party for
                        counter-signature. &ldquo;Share links only&rdquo; needs no
                        messaging network — you send them a link. Opting into XMTP
                        adds live push over its dev network, signed for with your
                        wallet on first use. Applies on the next reload.
                    </p>
                </FormField>

                <div className="flex items-center gap-3">
                    <Button type="button" onClick={handleSave} data-testid="settings-save">
                        Save
                    </Button>
                    {saved && (
                        <p className="text-xs text-ink-faint" data-testid="settings-saved">
                            Saved. RPC changes apply after a reload.
                        </p>
                    )}
                </div>
            </Card>

            <p className="text-xs text-ink-faint">
                Only http(s) URLs are accepted; anything else is discarded. Overrides
                live in this browser&apos;s storage — they never leave your device.
            </p>
        </div>
    );
}

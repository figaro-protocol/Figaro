"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useMounted } from "@/hooks/useMounted";
import {
    readUserEndpoints,
    writeUserEndpoints,
    type UserEndpointOverrides,
} from "@/lib/shared/userEndpoints";

/**
 * The member's own infrastructure endpoints — every participant runs and
 * pays for their own services, because a protocol with no revenue, no
 * expenses, and no legal entity cannot run them for anyone. Stored in THIS
 * BROWSER only (device configuration, `userEndpoints`): never pinned,
 * never published, not part of the profile — which is why the review step
 * does not list them. Leave a field empty to use this deployment's default
 * (on devnet: the local stand-ins).
 *
 * Used by the onboarding wizard step (`/members/endpoints`, save & continue)
 * and the manage-tier edit page (`/members/edit/endpoints`, save in place).
 */
interface FieldDef {
    key: "ipfsApiUrl" | "ipfsGatewayUrl" | "rpcUrl" | "batchRelayUrl";
    label: string;
    placeholder: string;
    hint: string;
}

const FIELDS: FieldDef[] = [
    {
        key: "ipfsApiUrl",
        label: "IPFS node (API)",
        placeholder: "https://ipfs.example.com:5001",
        hint: "Your own node. Everything you publish — profile, catalogue, clauses, assemblies, evidence — pins here: you pay for it, you can erase it.",
    },
    {
        key: "ipfsGatewayUrl",
        label: "IPFS gateway",
        placeholder: "https://gateway.example.com",
        hint: "The gateway this browser reads pinned content through.",
    },
    {
        key: "rpcUrl",
        label: "Chain RPC",
        placeholder: "https://rpc.example.com",
        hint: "Your own JSON-RPC provider — chain reads and writes go through it. Applies on the next reload.",
    },
    {
        key: "batchRelayUrl",
        label: "Verifier relay",
        placeholder: "https://relay.example.com",
        hint: "The relay batched trade is read and submitted through. Untrusted by construction — the audit surface re-derives everything a relay publishes.",
    },
];

export function OnboardingEndpointsForm({ nextHref }: { nextHref?: string }) {
    const mounted = useMounted();
    const router = useRouter();
    const [form, setForm] = useState<Required<Pick<UserEndpointOverrides, "ipfsApiUrl" | "ipfsGatewayUrl" | "rpcUrl" | "batchRelayUrl">>>({
        ipfsApiUrl: "",
        ipfsGatewayUrl: "",
        rpcUrl: "",
        batchRelayUrl: "",
    });
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const current = readUserEndpoints();
        setForm({
            ipfsApiUrl: current.ipfsApiUrl ?? "",
            ipfsGatewayUrl: current.ipfsGatewayUrl ?? "",
            rpcUrl: current.rpcUrl ?? "",
            batchRelayUrl: current.batchRelayUrl ?? "",
        });
    }, []);

    function handleSave(e: React.FormEvent) {
        e.preventDefault();
        const current = readUserEndpoints();
        writeUserEndpoints({ ...current, ...form });
        setSaved(true);
        if (nextHref) router.push(nextHref);
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    return (
        <form onSubmit={handleSave} className="space-y-8">
            <Card className="p-6 space-y-6">
                {FIELDS.map((f) => (
                    <FormField key={f.key} label={f.label} inputId={`endpoints-${f.key}`}>
                        <Input
                            id={`endpoints-${f.key}`}
                            type="url"
                            placeholder={f.placeholder}
                            value={form[f.key]}
                            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            data-testid={`endpoints-${f.key}`}
                        />
                        <p className="text-xs text-ink-muted mt-1">{f.hint}</p>
                    </FormField>
                ))}
                <p className="text-xs text-ink-muted">
                    Stored in this browser only &mdash; never pinned, never published.
                    Empty fields use this deployment&apos;s defaults.
                </p>
            </Card>
            <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" data-testid="endpoints-save">
                    {nextHref ? "Next \u2192" : "Save"}
                </Button>
                {nextHref && (
                    <Link href={nextHref} className="text-sm text-ink-muted hover:underline">
                        Skip &mdash; use the defaults
                    </Link>
                )}
                {saved && !nextHref && (
                    <span className="text-sm text-ink-muted" data-testid="endpoints-saved">
                        Saved.
                    </span>
                )}
            </div>
        </form>
    );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HintedFieldList, type HintedFieldDef } from "@/components/ui/HintedFieldList";
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
const FIELDS: HintedFieldDef<
    "ipfsApiUrl" | "ipfsGatewayUrl" | "rpcUrl" | "batchRelayUrl" | "analystUrl"
>[] = [
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
    {
        key: "analystUrl",
        label: "Analyst",
        placeholder: "https://analyst.example.com",
        hint: "An analyst you run over the public event record, asked free-form questions on the data explorer. Yours can also read the private substance you own or bought; unset means no prompt box, and the explorer's derived views still read straight from the chain.",
    },
];

export function OnboardingEndpointsForm({ nextHref }: { nextHref?: string }) {
    const mounted = useMounted();
    const router = useRouter();
    const [form, setForm] = useState<Required<Pick<UserEndpointOverrides, "ipfsApiUrl" | "ipfsGatewayUrl" | "rpcUrl" | "batchRelayUrl" | "analystUrl">>>({
        ipfsApiUrl: "",
        ipfsGatewayUrl: "",
        rpcUrl: "",
        batchRelayUrl: "",
        analystUrl: "",
    });
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const current = readUserEndpoints();
        setForm({
            ipfsApiUrl: current.ipfsApiUrl ?? "",
            ipfsGatewayUrl: current.ipfsGatewayUrl ?? "",
            rpcUrl: current.rpcUrl ?? "",
            batchRelayUrl: current.batchRelayUrl ?? "",
            analystUrl: current.analystUrl ?? "",
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
                <HintedFieldList
                    fields={FIELDS}
                    idPrefix="endpoints"
                    inputType="url"
                    hintClassName="text-ink-muted"
                    withTestIds
                    value={(key) => form[key]}
                    onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
                />
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

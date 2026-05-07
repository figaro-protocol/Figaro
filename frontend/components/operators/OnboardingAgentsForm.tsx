"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useMounted } from "@/lib/shared/useMounted";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import type { OperatorAgentServices } from "@/lib/shared/operatorProfileMetadata";

/**
 * Step 6 of the onboarding wizard. Collects ERC-8004-compatible
 * agent service endpoints into `state.services`. Optional and
 * advanced — autonomous-agent operators use this; human-driven
 * wallets skip the step.
 *
 * Per `reference_erc8004_interop_only.md`: Figaro does NOT depend on
 * ERC-8004; it offers an optional metadata convention so agents that
 * want cross-protocol discoverability can publish endpoints alongside
 * their canonical Figaro identity. The screen makes the optionality
 * explicit.
 */

type ServiceKey = keyof OperatorAgentServices;

interface FieldDef {
    key: ServiceKey;
    label: string;
    placeholder: string;
    hint: string;
}

const FIELDS: FieldDef[] = [
    {
        key: "mcp",
        label: "MCP endpoint",
        placeholder: "https://agent.example.com/mcp",
        hint: "Model Context Protocol — agent-to-tool integration.",
    },
    {
        key: "a2a",
        label: "A2A endpoint",
        placeholder: "https://agent.example.com/a2a",
        hint: "Agent-to-Agent protocol — direct agent communication.",
    },
    {
        key: "rest",
        label: "REST API base",
        placeholder: "https://agent.example.com/v1",
        hint: "Public REST API base URL the agent serves.",
    },
    {
        key: "did",
        label: "did:web identifier",
        placeholder: "did:web:agent.example.com",
        hint: "W3C DID resolved via HTTPS to a DID Document; SDK supports verification against the wallet address.",
    },
    {
        key: "ens",
        label: "ENS name",
        placeholder: "agent.figaro.eth",
        hint: "ENS name pointing at the wallet (optional, for human-readable lookup).",
    },
];

export function OnboardingAgentsForm() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { state, update } = useOnboardingState(address);

    const [services, setServices] = useState<OperatorAgentServices>({});
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (hydrated || !isConnected) return;
        setServices(state.services ?? {});
        setHydrated(true);
    }, [hydrated, state.services, isConnected]);

    useEffect(() => {
        if (!hydrated || !isConnected) return;
        const nonEmpty = Object.fromEntries(
            Object.entries(services).filter(([, v]) => Boolean(v?.trim())),
        ) as OperatorAgentServices;
        update({
            services: Object.keys(nonEmpty).length > 0 ? nonEmpty : undefined,
        });
    }, [services, hydrated, isConnected, update]);

    function setField(key: ServiceKey, value: string) {
        setServices((prev) => ({ ...prev, [key]: value }));
    }

    function handleNext(e: React.FormEvent) {
        e.preventDefault();
        router.push("/operators/onboard/done");
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">
                    Connect a wallet to load your agent-endpoint draft.
                </p>
                <Link href="/operators/onboard/profile">
                    <Button variant="outline">← Back</Button>
                </Link>
            </Card>
        );
    }

    return (
        <form onSubmit={handleNext} className="space-y-8">
            <Card className="p-6 space-y-3 text-sm text-ink-body">
                <p>
                    <span className="font-semibold text-ink-heading">Optional.</span>{" "}
                    Skip this step if your wallet is human-driven.
                </p>
                <p>
                    These are ERC-8004-compatible service endpoints —{" "}
                    Figaro does not depend on ERC-8004 (the bonding mechanism
                    provides trust and settlement history provides reputation),
                    but autonomous agents that want cross-protocol
                    discoverability can declare endpoints here. Frontends
                    detect agent-status by checking for any of these.
                </p>
            </Card>

            <div className="space-y-6">
                {FIELDS.map((field) => (
                    <FormField key={field.key} label={field.label} inputId={`agent-${field.key}`}>
                        <Input
                            id={`agent-${field.key}`}
                            type="text"
                            placeholder={field.placeholder}
                            value={services[field.key] ?? ""}
                            onChange={(e) => setField(field.key, e.target.value)}
                        />
                        <p className="text-xs text-ink-faint mt-1">{field.hint}</p>
                    </FormField>
                ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href="/operators/onboard/assemblies"
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    ← Back
                </Link>
                <Button type="submit">Next →</Button>
            </div>
        </form>
    );
}

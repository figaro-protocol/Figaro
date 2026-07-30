"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { useMounted } from "@/hooks/useMounted";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import type { MemberAgentServices } from "@/lib/seller/memberProfileMetadata";

/**
 * Step 6 of the onboarding wizard. Collects ERC-8004-compatible
 * agent service endpoints into `state.services`. Optional and
 * advanced — autonomous-agent sellers use this; human-driven
 * wallets skip the step.
 *
 * Per `reference_erc8004_interop_only.md`: Figaro does NOT depend on
 * ERC-8004; it offers an optional metadata convention so agents that
 * want cross-protocol discoverability can publish endpoints alongside
 * their canonical Figaro identity. The screen makes the optionality
 * explicit.
 */

type ServiceKey = keyof MemberAgentServices;

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

export interface OnboardingAgentsFormProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(services)` instead of routing to the wizard's done
     * step. The caller re-pins the seller profile with the
     * updated `services` field and dispatches `updateProfile`.
     */
    onSave?: (services: MemberAgentServices | undefined) => Promise<void>;
    /** Submit-button label override. Defaults to "Next →". */
    submitLabel?: string;
    /** Back-link href override. Defaults to "/sellers/assemblies". */
    backHref?: string;
    /** Back-link label override. Defaults to "← Back". */
    backLabel?: string;
    /** Whether the submit is currently in flight. Suppresses double-submission. */
    submitInFlight?: boolean;
    /** External error from `onSave`. */
    externalError?: string | null;
}

export function OnboardingAgentsForm({
    onSave,
    submitLabel,
    backHref,
    backLabel,
    submitInFlight = false,
    externalError = null,
}: OnboardingAgentsFormProps = {}) {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { state, loaded, update } = useOnboardingState(address);

    const [services, setServices] = useState<MemberAgentServices>({});
    const [hydrated, setHydrated] = useState(false);

    // Hydrate once `loaded === true` — see OnboardingProfileForm for
    // the race-condition rationale.
    useEffect(() => {
        if (hydrated || !loaded) return;
        setServices(state.services ?? {});
        setHydrated(true);
    }, [hydrated, loaded, state.services]);

    useEffect(() => {
        if (!hydrated || !isConnected) return;
        const nonEmpty = Object.fromEntries(
            Object.entries(services).filter(([, v]) => Boolean(v?.trim())),
        ) as MemberAgentServices;
        update({
            services: Object.keys(nonEmpty).length > 0 ? nonEmpty : undefined,
        });
    }, [services, hydrated, isConnected, update]);

    function setField(key: ServiceKey, value: string) {
        setServices((prev) => ({ ...prev, [key]: value }));
    }

    function handleNext(e: React.FormEvent) {
        e.preventDefault();
        if (onSave) {
            // Build the same trim+filter logic as the persistence
            // effect — only non-empty endpoints survive into the
            // pinned profile, and an entirely empty set becomes
            // `undefined` so the field gets stripped from the JSON.
            const nonEmpty = Object.fromEntries(
                Object.entries(services).filter(([, v]) => Boolean(v?.trim())),
            ) as MemberAgentServices;
            const payload = Object.keys(nonEmpty).length > 0 ? nonEmpty : undefined;
            onSave(payload).catch(() => {
                // Caller surfaces failures via `externalError`.
            });
            return;
        }
        router.push("/sellers/review");
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
                <Link href="/sellers/identity">
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

            {externalError && (
                <p className="text-sm text-red-600" role="alert">{externalError}</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href={backHref ?? "/sellers/assemblies"}
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    {backLabel ?? "← Back"}
                </Link>
                <Button type="submit" disabled={submitInFlight}>
                    {submitInFlight ? "Saving…" : (submitLabel ?? "Next →")}
                </Button>
            </div>
        </form>
    );
}

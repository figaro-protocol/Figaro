"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HintedFieldList, type HintedFieldDef } from "@/components/ui/HintedFieldList";
import { useMounted } from "@/hooks/useMounted";
import { useOnboardingState } from "@/lib/member/onboardingState";
import type { MemberAgentServices } from "@/lib/member/memberProfileMetadata";
import type { OnboardingStepChromeProps } from "@/components/members/OnboardingStepChrome";

/**
 * Step 6 of the onboarding wizard. Collects ERC-8004-compatible
 * agent service endpoints into `state.services`. Optional: endpoints
 * declare REACHABILITY, not what runs the wallet — a wallet that
 * nothing needs to reach directly skips the step and loses nothing
 * else.
 *
 * Per `reference_erc8004_interop_only.md`: Figaro does NOT depend on
 * ERC-8004; it offers an optional metadata convention so agents that
 * want cross-protocol discoverability can publish endpoints alongside
 * their canonical Figaro identity. The screen makes the optionality
 * explicit.
 */

type ServiceKey = keyof MemberAgentServices;

const FIELDS: HintedFieldDef<ServiceKey>[] = [
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

export interface OnboardingAgentsFormProps extends OnboardingStepChromeProps {
    /**
     * Edit-mode override. When provided, the submit handler calls
     * `onSave(services)` instead of routing to the wizard's done
     * step. The caller re-pins the member profile with the
     * updated `services` field and dispatches `updateProfile`.
     */
    onSave?: (services: MemberAgentServices | undefined) => Promise<void>;
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
        router.push("/members/endpoints");
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
                <Link href="/members/identity">
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
                    Skip this step if nothing needs to reach your wallet
                    directly.
                </p>
                <p>
                    These are ERC-8004-compatible service endpoints —{" "}
                    Figaro does not depend on ERC-8004 (the bonding mechanism
                    provides trust and settlement history provides reputation),
                    but a wallet that wants cross-protocol discoverability can
                    declare endpoints here. Endpoints declare reachability, not
                    what runs the wallet: skip them and the wallet is simply
                    unreachable for inbound coordination; nothing else changes.
                </p>
            </Card>

            <div className="space-y-6">
                <HintedFieldList
                    fields={FIELDS}
                    idPrefix="agent"
                    value={(key) => services[key] ?? ""}
                    onChange={setField}
                />
            </div>

            {externalError && (
                <p className="text-sm text-error-fg" role="alert">{externalError}</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href={backHref ?? "/members/buyer"}
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

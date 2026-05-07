"use client";

/**
 * OperatorLanding — the wallet-aware landing for `/operators`.
 *
 * Three states, picked from wallet + on-chain registry state:
 *
 *   - not connected → connect prompt.
 *   - connected, never registered → onboarding CTA → `/operators/onboard`.
 *   - connected, registered → registered card with profile summary,
 *     management cards (currently disabled — edit/delete UI ships
 *     in the next item), withdraw control.
 *
 * Detection:
 *   useOperatorProfile(address) returns [metadataURI, registeredBlock]
 *   from indexed events. `undefined` => never registered or withdrawn
 *   since most-recent registration. The profile JSON is fetched
 *   from the metadataURI for display.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import {
    useOperatorProfile,
    useRegistrationDeposit,
    useDepositLockPeriod,
    useWithdrawDeposit,
} from "@/lib/mechanisms/useOperatorRegistry";
import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { tryParseOperatorProfileDocument } from "@/lib/shared/operatorProfileMetadata";
import type { OperatorProfileMetadata } from "@/lib/shared/operatorProfileMetadata";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatEther } from "viem";

export function OperatorLanding() {
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const { data: profileData, isLoading: profileLoading, refetch } = useOperatorProfile(address);
    const { data: deposit } = useRegistrationDeposit();
    const { data: lockPeriod } = useDepositLockPeriod();

    if (!mounted) {
        return <Card className="p-8 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-8 space-y-4">
                <h2 className="text-heading-h3 text-ink-heading">Connect a wallet</h2>
                <p className="text-sm text-ink-body">
                    Connect a wallet to register a new operator profile or manage an existing one.
                </p>
                <Button onClick={() => openConnectModal?.()}>Connect wallet</Button>
            </Card>
        );
    }

    if (profileLoading && !profileData) {
        return <Card className="p-8 text-sm text-ink-faint">Reading registry…</Card>;
    }

    if (!profileData) {
        return <FirstTimeCard deposit={deposit} lockPeriod={lockPeriod} />;
    }

    const [metadataURI, registeredBlock] = profileData;
    return (
        <RegisteredCard
            address={address!}
            metadataURI={metadataURI}
            registeredBlock={registeredBlock}
            deposit={deposit}
            lockPeriod={lockPeriod}
            onWithdrawn={() => refetch()}
        />
    );
}

// ── First-time state ─────────────────────────────────────────────────────────

function FirstTimeCard({
    deposit,
    lockPeriod,
}: {
    deposit: bigint | undefined;
    lockPeriod: bigint | undefined;
}) {
    return (
        <Card className="p-8 space-y-5">
            <h2 className="text-heading-h3 text-ink-heading">You&apos;re not registered yet.</h2>
            <p className="text-sm text-ink-body">
                Registration posts a reclaimable ETH deposit and binds the wallet to an off-chain profile envelope (identity, accepted tokens, catalogue, assembly bindings, agent endpoints). The wizard walks you through it in seven screens.
            </p>
            <ul className="text-sm text-ink-body space-y-1.5 list-disc list-inside marker:text-ink-faint">
                <li>
                    Deposit:{" "}
                    <span className="font-semibold text-ink-heading">
                        {deposit !== undefined ? `${formatEther(deposit)} ETH` : "…"}
                    </span>{" "}
                    (Sybil-resistance, not a fee — fully reclaimable via withdraw)
                </li>
                <li>
                    Lock period:{" "}
                    <span className="font-semibold text-ink-heading">
                        {lockPeriod !== undefined ? formatLockPeriod(lockPeriod) : "…"}
                    </span>{" "}
                    (deposit reclaimable after this elapses)
                </li>
                <li>Profile + catalogue stored on IPFS at a URI you control. Replace any time via <code>updateProfile</code> — the deposit and lock are not touched.</li>
            </ul>
            <div className="pt-2">
                <Link href="/operators/onboard">
                    <Button>Start onboarding →</Button>
                </Link>
            </div>
        </Card>
    );
}

// ── Registered state ─────────────────────────────────────────────────────────

interface RegisteredCardProps {
    address: `0x${string}`;
    metadataURI: string;
    registeredBlock: bigint | null;
    deposit: bigint | undefined;
    lockPeriod: bigint | undefined;
    onWithdrawn: () => void;
}

function RegisteredCard({
    address,
    metadataURI,
    registeredBlock,
    deposit,
    lockPeriod,
    onWithdrawn,
}: RegisteredCardProps) {
    const [profile, setProfile] = useState<OperatorProfileMetadata | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setProfile(null);
        setProfileError(null);
        const url = resolveContentURI(metadataURI);
        if (!url) {
            setProfileError("Profile URI couldn't be resolved.");
            return;
        }
        fetch(url)
            .then((r) => r.json())
            .then((doc) => {
                if (cancelled) return;
                const parsed = tryParseOperatorProfileDocument(doc);
                if (parsed) {
                    setProfile(parsed);
                } else {
                    setProfileError("Profile JSON didn't parse as an operator profile.");
                }
            })
            .catch(() => {
                if (!cancelled) setProfileError("Couldn't fetch profile from IPFS.");
            });
        return () => {
            cancelled = true;
        };
    }, [metadataURI]);

    const cid = extractCid(metadataURI);
    const slug = profile?.slug;

    return (
        <div className="space-y-6">
            <Card className="p-8 space-y-5">
                <div className="flex items-baseline justify-between gap-4">
                    <div>
                        <p className="text-eyebrow uppercase text-ink-muted">Registered</p>
                        <h2 className="text-heading-h3 text-ink-heading mt-1">
                            {profile?.name ?? "Loading profile…"}
                        </h2>
                        {profile?.specialty && (
                            <p className="text-sm text-ink-body mt-1">{profile.specialty}</p>
                        )}
                    </div>
                    {slug && (
                        <Link
                            href={`/m/${address}`}
                            className="text-sm text-ink-faint hover:text-ink-heading underline whitespace-nowrap"
                        >
                            View public profile →
                        </Link>
                    )}
                </div>

                {profileError && (
                    <p className="text-sm text-red-600" role="alert">{profileError}</p>
                )}

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
                    <DefRow label="Wallet" value={truncateHex(address, { head: 10, tail: 8 })} mono />
                    <DefRow label="Deposit" value={deposit !== undefined ? `${formatEther(deposit)} ETH` : "…"} />
                    <DefRow label="Profile CID" value={cid ? truncateHex(cid, { head: 10, tail: 6 }) : metadataURI} mono />
                    <DefRow
                        label="Registered at block"
                        value={registeredBlock !== null ? `#${registeredBlock.toString()}` : "—"}
                        mono
                    />
                </dl>
            </Card>

            <ManageGrid />

            <WithdrawSection
                deposit={deposit}
                lockPeriod={lockPeriod}
                registeredBlock={registeredBlock}
                onWithdrawn={onWithdrawn}
            />
        </div>
    );
}

function ManageGrid() {
    const items: Array<{ label: string; description: string }> = [
        {
            label: "Profile",
            description: "Identity, branding, accepted tokens, location.",
        },
        {
            label: "Catalogue",
            description: "Items for sale or service offerings.",
        },
        {
            label: "Assemblies",
            description: "Which assemblies this wallet participates in.",
        },
        {
            label: "Agents",
            description: "ERC-8004 service endpoints (mcp, a2a, did, ens).",
        },
    ];
    return (
        <div className="space-y-3">
            <h3 className="text-eyebrow uppercase text-ink-muted">Manage</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((item) => (
                    <Card
                        key={item.label}
                        className="p-5 space-y-1 opacity-60 cursor-not-allowed"
                        aria-disabled="true"
                    >
                        <div className="flex items-baseline justify-between gap-2">
                            <h4 className="text-sm font-semibold text-ink-heading">{item.label}</h4>
                            <span className="text-xs text-ink-faint">Edit coming next</span>
                        </div>
                        <p className="text-xs text-ink-body">{item.description}</p>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function WithdrawSection({
    deposit,
    lockPeriod,
    registeredBlock,
    onWithdrawn,
}: {
    deposit: bigint | undefined;
    lockPeriod: bigint | undefined;
    registeredBlock: bigint | null;
    onWithdrawn: () => void;
}) {
    const { withdraw, isPending, isConfirming, isSuccess, error } = useWithdrawDeposit();
    const [submitError, setSubmitError] = useState<string | null>(null);
    const isProcessing = isPending || isConfirming;

    useEffect(() => {
        if (isSuccess) onWithdrawn();
    }, [isSuccess, onWithdrawn]);

    async function handleWithdraw() {
        setSubmitError(null);
        try {
            await withdraw();
        } catch (e: unknown) {
            setSubmitError(e instanceof Error ? e.message : String(e));
        }
    }

    // Lock-elapsed check is timestamp-based on-chain (block.timestamp >=
    // _registeredAt + depositLockPeriod). We don't have access to
    // _registeredAt off-chain (it's an internal mapping), so the gate
    // here is best-effort UX only — the contract is authoritative and
    // will revert with DepositLocked() on a too-early withdraw call.
    void lockPeriod; void registeredBlock;

    return (
        <Card className="p-6 space-y-3">
            <h3 className="text-eyebrow uppercase text-ink-muted">Withdraw</h3>
            <p className="text-sm text-ink-body">
                Returns the {deposit !== undefined ? formatEther(deposit) : "…"} ETH deposit and clears the registration after the lock period has elapsed. The wallet is then free to re-register with fresh metadata. Catalogue and profile pins on IPFS are not affected.
            </p>
            <Button variant="outline" onClick={handleWithdraw} disabled={isProcessing}>
                {isProcessing ? "Withdrawing…" : "Withdraw deposit"}
            </Button>
            {(submitError || error) && (
                <p className="text-sm text-red-600" role="alert">
                    {submitError ?? (error instanceof Error ? error.message : String(error))}
                </p>
            )}
        </Card>
    );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function DefRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wider text-ink-faint">{label}</dt>
            <dd className={`text-ink-heading ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
        </div>
    );
}

function extractCid(uri: string): string | null {
    const match = uri.match(/^ipfs:\/\/(.+)$/);
    return match ? match[1] ?? null : null;
}

function formatLockPeriod(seconds: bigint): string {
    const s = Number(seconds);
    if (s >= 86400) {
        const days = Math.round(s / 86400);
        return `${days} day${days === 1 ? "" : "s"}`;
    }
    if (s >= 3600) {
        const hours = Math.round(s / 3600);
        return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    return `${s} second${s === 1 ? "" : "s"}`;
}

"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { WalletGate } from "@/components/core/WalletGate";
import { formatEther } from "viem";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    useOperatorProfile,
    useRegisterOperator,
    useUpdateProfile,
    useWithdrawDeposit,
    useRegistrationDeposit,
    useDepositLockPeriod,
} from "@/lib/mechanisms/useOperatorRegistry";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { TokenAddressInput, isValidAddress } from "./TokenAddressInput";

interface OperatorMetadata {
    name: string;
    description: string;
    location: string;
    catalogueURI: string;
    mechanisms: string[];
    acceptedTokens: string[];
    services: { mcp: string; a2a: string; rest: string; did: string; ens: string };
}

const EMPTY: OperatorMetadata = {
    name: "",
    description: "",
    location: "",
    catalogueURI: "",
    mechanisms: [],
    acceptedTokens: [] as string[],
    services: { mcp: "", a2a: "", rest: "", did: "", ens: "" },
};

const MECHANISMS = [
    { id: "assigned", label: "Assigned", desc: "Assembly assigns you to the job" },
    { id: "buyer-defined", label: "Buyer-defined", desc: "Buyer selects you directly" },
    { id: "auction", label: "Dutch auction", desc: "You bid to win the job" },
];

function toggle(arr: string[], item: string): string[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function TokenList({ tokens, onChange }: { tokens: string[]; onChange: (next: string[]) => void }) {
    return (
        <div className="space-y-2">
            {tokens.map((addr, i) => (
                <TokenAddressInput
                    key={i}
                    value={addr}
                    onChange={(v) => onChange(tokens.map((a, idx) => (idx === i ? v : a)))}
                    onRemove={() => onChange(tokens.filter((_, idx) => idx !== i))}
                />
            ))}
            <button
                type="button"
                onClick={() => onChange([...tokens, ""])}
                className="text-sm text-gray-500 hover:text-black flex items-center gap-1.5 transition-colors"
            >
                <span className="text-base leading-none">+</span>
                Add token
            </button>
        </div>
    );
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

function CheckGroup({
    options,
    selected,
    onChange,
}: {
    options: { id: string; label: string; desc: string }[];
    selected: string[];
    onChange: (next: string[]) => void;
}) {
    return (
        <div className="space-y-3">
            {options.map((opt) => (
                <label key={opt.id} className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={selected.includes(opt.id)}
                        onChange={() => onChange(toggle(selected, opt.id))}
                        className="mt-0.5 w-4 h-4 border-gray-300 rounded"
                    />
                    <div>
                        <span className="text-sm font-medium text-black">{opt.label}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                </label>
            ))}
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

type Status = { type: "idle" | "pinning" | "pending" | "error" | "success"; message: string };

export function OperatorOnboarding() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const searchParams = useSearchParams();
    const { data: profile, isLoading: profileLoading, refetch } = useOperatorProfile(address);
    const { data: depositRaw } = useRegistrationDeposit();
    const { data: lockPeriodRaw } = useDepositLockPeriod();
    const { register, isPending: regPending, isConfirming: regConfirming, isSuccess: regSuccess } = useRegisterOperator();
    const { updateProfile, isPending: updPending, isConfirming: updConfirming, isSuccess: updSuccess } = useUpdateProfile();
    const { withdraw, isPending: withdrawing, isConfirming: withdrawConfirming, isSuccess: withdrawSuccess } = useWithdrawDeposit();

    const [form, setForm] = useState<OperatorMetadata>(EMPTY);
    const [showAgent, setShowAgent] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
    const [unlockTimestamp, setUnlockTimestamp] = useState<bigint | null>(null);

    const isRegistered = !!profile;
    const currentURI = profile ? profile[0] : undefined;
    const registeredBlock = profile ? profile[1] : null;
    const hasCatalogue = !!(profile && form.catalogueURI);
    const deposit = depositRaw as bigint | undefined;
    const lockPeriod = lockPeriodRaw as bigint | undefined;
    const busy =
        ["pinning", "pending"].includes(status.type) ||
        regPending || regConfirming || updPending || updConfirming || withdrawing || withdrawConfirming;

    // Pre-fill catalogue URI from URL param (handoff from catalogue builder)
    useEffect(() => {
        const uri = searchParams.get("catalogueURI");
        if (uri) setForm((f) => ({ ...f, catalogueURI: uri }));
    }, [searchParams]);

    // Load current IPFS profile into form for display when registered
    useEffect(() => {
        if (!currentURI) return;
        const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(currentURI);
        if (!url) return;
        fetch(url)
            .then((r) => safeJsonFromResponse<unknown>(r))
            .then((data: unknown) => {
                const m = data as Partial<OperatorMetadata>;
                setForm((prev) => ({
                    ...prev,
                    name: m.name ?? "",
                    description: m.description ?? "",
                    location: m.location ?? "",
                    // URL param takes precedence over stored value
                    catalogueURI: prev.catalogueURI || (m.catalogueURI ?? ""),
                    mechanisms: Array.isArray(m.mechanisms) ? m.mechanisms : [],
                    acceptedTokens: Array.isArray(m.acceptedTokens)
                        ? m.acceptedTokens.map((t) =>
                            typeof t === "string" ? t : (t as { address: string }).address
                          ).filter(Boolean)
                        : [],
                    services: {
                        mcp: m.services?.mcp ?? "",
                        a2a: m.services?.a2a ?? "",
                        rest: m.services?.rest ?? "",
                        did: m.services?.did ?? "",
                        ens: m.services?.ens ?? "",
                    },
                }));
                if (m.services && Object.values(m.services).some(Boolean)) setShowAgent(true);
            })
            .catch(() => {});
    }, [currentURI]);

    // Compute deposit unlock timestamp from registration block + lock period.
    // `lockPeriod === 0n` is a legitimate config (zero-deposit / instant
    // unlock); only bail out if the value is genuinely unavailable.
    useEffect(() => {
        if (!registeredBlock || lockPeriod === undefined || !publicClient) {
            setUnlockTimestamp(null);
            return;
        }
        publicClient.getBlock({ blockNumber: registeredBlock })
            .then((block) => setUnlockTimestamp(block.timestamp + lockPeriod))
            .catch(() => setUnlockTimestamp(null));
    }, [registeredBlock, lockPeriod, publicClient]);

    // Confirmation feedback — emitted after tx lands in a block
    useEffect(() => {
        if (regConfirming || updConfirming) setStatus({ type: "pending", message: "Waiting for confirmation..." });
    }, [regConfirming, updConfirming]);
    useEffect(() => {
        if (withdrawConfirming) setStatus({ type: "pending", message: "Waiting for confirmation..." });
    }, [withdrawConfirming]);

    // Success — driven by on-chain events via receipt + indexer refetch
    useEffect(() => {
        if (regSuccess) { setShowSuccess(true); setStatus({ type: "idle", message: "" }); refetch(); }
    }, [regSuccess, refetch]);
    useEffect(() => {
        if (updSuccess) { setStatus({ type: "success", message: "Profile updated. New metadata URI is live for this address." }); refetch(); }
    }, [updSuccess, refetch]);
    useEffect(() => {
        if (withdrawSuccess) { setStatus({ type: "success", message: "Deposit withdrawn. The address is free to register again." }); refetch(); }
    }, [withdrawSuccess, refetch]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!isConnected || !form.name.trim()) return;
        try {
            const services: Record<string, string> = {};
            for (const [k, v] of Object.entries(form.services)) {
                if (v.trim()) services[k] = v.trim();
            }
            const validTokens = form.acceptedTokens.filter(isValidAddress);
            const metadata: Record<string, unknown> = {
                name: form.name.trim(),
                mechanisms: form.mechanisms,
            };
            if (form.description.trim()) metadata.description = form.description.trim();
            if (form.location.trim()) metadata.location = form.location.trim();
            if (form.catalogueURI.trim()) metadata.catalogueURI = form.catalogueURI.trim();
            if (validTokens.length > 0) metadata.acceptedTokens = validTokens;
            if (Object.keys(services).length > 0) metadata.services = services;

            setStatus({ type: "pinning", message: "Pinning profile to IPFS..." });
            const { uri } = await DEFAULT_IPFS_SERVICE.publishJSON(metadata);

            setStatus({ type: "pending", message: "Confirm in wallet..." });
            if (isRegistered) {
                await updateProfile(uri);
            } else {
                await register(uri, deposit);
            }
        } catch (err) {
            setStatus({ type: "error", message: err instanceof Error ? err.message : String(err) });
        }
    }

    async function handleWithdraw() {
        try {
            setStatus({ type: "pending", message: "Confirm in wallet..." });
            await withdraw();
        } catch (err) {
            setStatus({ type: "error", message: err instanceof Error ? err.message : String(err) });
        }
    }

    // ── Not connected ──────────────────────────────────────────────────────────

    if (!isConnected) {
        return (
            <WalletGate
                variant="standalone"
                title="Connect your wallet to continue"
                hint="Registration requires a wallet. Your profile is signed by your address."
            >
                {null}
            </WalletGate>
        );
    }

    // ── Post-registration success ──────────────────────────────────────────────
    //
    // Check showSuccess BEFORE profileLoading: after register confirms,
    // OperatorOnboarding triggers a profile refetch which sets
    // profileLoading=true. On a long-block-height anvil the event-log scan in
    // getOperatorState can take a while, but the success state is determined
    // by the receipt (regSuccess), not the post-registration profile read.
    // Don't gate the user-visible success card behind a slow refetch.

    if (showSuccess) {
        return (
            <div className="space-y-4">
                <div className="border border-black rounded-lg px-6 py-6">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                        Step 1 complete
                    </p>
                    <p className="text-lg font-bold text-black mb-2">You&apos;re registered.</p>
                    <p className="text-sm text-gray-600 mb-6">
                        Your operator profile is live and visible to protocol assemblies.
                        Next, build your service catalogue so assemblies know what you offer.
                    </p>
                    <div className="flex gap-3 flex-wrap">
                        <Link
                            href="/operators/catalogue"
                            className="px-4 py-2 text-sm bg-black text-white rounded hover:bg-gray-800 transition-colors"
                        >
                            Build your catalogue &rarr;
                        </Link>
                        <button
                            onClick={() => setShowSuccess(false)}
                            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                            View profile
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (profileLoading) {
        return <p className="text-sm text-gray-400 py-8">Loading...</p>;
    }

    // ── Registration / update form ────────────────────────────────────────────
    //
    // The same form serves first-time registration and in-place profile
    // updates. When the wallet is already registered, the form prefills from
    // the current metadataURI (see the effect above) and the submit button
    // routes through `updateProfile` instead of `register` — no deposit
    // movement, no lock reset.

    const inputClass =
        "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-black";

    const submitLabel = busy
        ? (status.message || "Working...")
        : isRegistered
            ? "Save profile changes"
            : deposit
                ? `Register — deposit ${formatEther(deposit)} ETH`
                : "Register";

    const now = BigInt(Math.floor(Date.now() / 1000));
    const canWithdraw = unlockTimestamp !== null && now >= unlockTimestamp;
    const secondsRemaining = unlockTimestamp !== null && !canWithdraw
        ? Number(unlockTimestamp - now)
        : 0;
    const daysRemaining = Math.ceil(secondsRemaining / 86400);

    return (
        <div className="space-y-10">
            {isRegistered && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block flex-shrink-0" />
                        <span className="text-sm font-semibold text-black">Registered operator</span>
                    </div>
                    <span className="text-xs text-gray-400 font-mono">
                        {address?.slice(0, 6)}&hellip;{address?.slice(-4)}
                    </span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-0">

                {/* Section: Identity */}
                <FormSection title="Identity">
                    <Field label="Name" hint="Visible to assembly participants.">
                        <input
                            required
                            type="text"
                            placeholder="e.g. your service name"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Description">
                        <textarea
                            rows={3}
                            placeholder="Brief description of your services."
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Location" hint="Optional. Used by assemblies that route by geography.">
                        <input
                            type="text"
                            placeholder="e.g. San Francisco, CA"
                            value={form.location}
                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                            className={inputClass}
                        />
                    </Field>
                </FormSection>

                {/* Section: Capabilities — role lives in the catalogue, not here. */}
                <FormSection title="Capabilities">
                    <Field label="Accepted mechanisms" hint="Which allocation mechanisms do you accept?">
                        <CheckGroup
                            options={MECHANISMS}
                            selected={form.mechanisms}
                            onChange={(next) => setForm({ ...form, mechanisms: next })}
                        />
                    </Field>
                </FormSection>

                {/* Section: Accepted tokens */}
                <FormSection title="Accepted tokens">
                    <p className="text-xs text-gray-500 -mt-2">
                        Which ERC-20 tokens do you accept for payment? Token choice is a coordination signal —
                        a stablecoin for legal convenience, a DAO token for community alignment, FIG for protocol-native settlement.
                        Any valid ERC-20 address is accepted by the protocol.
                    </p>
                    <TokenList
                        tokens={form.acceptedTokens}
                        onChange={(next) => setForm({ ...form, acceptedTokens: next })}
                    />
                </FormSection>

                {/* Section: Catalogue */}
                <FormSection title="Catalogue">
                    <Field
                        label="Catalogue URI"
                        hint="Link to your service catalogue. Can be an IPFS URI or any URL."
                    >
                        <input
                            type="text"
                            placeholder="ipfs://Qm... or https://..."
                            value={form.catalogueURI}
                            onChange={(e) => setForm({ ...form, catalogueURI: e.target.value })}
                            className={inputClass}
                        />
                    </Field>
                    {!hasCatalogue && (
                        <p className="text-xs text-gray-500">
                            Don&apos;t have one yet?{" "}
                            <Link href="/operators/catalogue" className="underline hover:text-black">
                                Build your catalogue &rarr;
                            </Link>
                        </p>
                    )}
                </FormSection>

                {/* Section: Agent endpoints (collapsible) */}
                <div className="border-t border-gray-100 pt-8">
                    <button
                        type="button"
                        onClick={() => setShowAgent(!showAgent)}
                        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-black transition-colors"
                    >
                        <span>{showAgent ? "▾" : "▸"}</span>
                        Agent endpoints
                        <span className="normal-case font-normal tracking-normal text-gray-400">(optional)</span>
                    </button>
                    {showAgent && (
                        <div className="mt-6 space-y-4">
                            <p className="text-xs text-gray-500">
                                Service endpoints for AI agents or autonomous operators (ERC-8004). All optional.
                            </p>
                            {(["mcp", "a2a", "rest", "did", "ens"] as const).map((key) => (
                                <div key={key}>
                                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                                        {key}
                                    </label>
                                    <input
                                        type="text"
                                        placeholder={
                                            key === "did"
                                                ? "did:web:example.com"
                                                : key === "ens"
                                                    ? "operator.eth"
                                                    : "https://..."
                                        }
                                        value={form.services[key]}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                services: { ...form.services, [key]: e.target.value },
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Deposit info + submit */}
                <div className="border-t border-gray-100 pt-8 space-y-4">
                    {!isRegistered && deposit && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-4">
                            <p className="text-sm font-semibold text-black mb-1">
                                Required deposit: {formatEther(deposit)} ETH
                            </p>
                            <p className="text-xs text-gray-500">
                                Refundable after a {lockPeriod && lockPeriod > 0n
                                    ? `${Math.ceil(Number(lockPeriod) / 86400)}-day lock`
                                    : "lock period"}. Prevents spam registrations. Returned in full when you withdraw.
                            </p>
                        </div>
                    )}

                    {status.type === "error" && <StatusBox type="error" message={status.message} />}
                    {(status.type === "pinning" || status.type === "pending") && (
                        <StatusBox type="progress" message={status.message} />
                    )}
                    {status.type === "success" && <StatusBox type="success" message={status.message} />}

                    <button
                        type="submit"
                        disabled={busy || !form.name.trim()}
                        className="w-full py-3 bg-black text-white text-sm font-semibold rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                        {submitLabel}
                    </button>

                    {currentURI && (
                        <p className="text-xs text-gray-400 font-mono break-all">
                            current: {currentURI}
                        </p>
                    )}
                </div>
            </form>

            {isRegistered && (
                <div className="border border-red-100 rounded-lg px-6 py-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-3">
                        Withdraw deposit
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                        Withdrawing returns your deposit and clears the registry binding for this
                        address. Profile updates do not require this — use Save profile changes
                        above to replace your metadata in place without touching the deposit.
                    </p>
                    {lockPeriod && lockPeriod > 0n && (
                        <p className="text-xs text-gray-500 mb-3">
                            Deposits lock for {Math.ceil(Number(lockPeriod) / 86400)} days after registration.
                            {!canWithdraw && daysRemaining > 0 && (
                                <> Yours unlocks in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}.</>
                            )}
                        </p>
                    )}
                    <button
                        onClick={handleWithdraw}
                        disabled={withdrawing || withdrawConfirming || !canWithdraw}
                        title={!canWithdraw && daysRemaining > 0 ? `Deposit locked for ${daysRemaining} more day${daysRemaining !== 1 ? "s" : ""}` : undefined}
                        className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {withdrawing || withdrawConfirming
                            ? "Withdrawing..."
                            : !canWithdraw && daysRemaining > 0
                                ? `Locked — ${daysRemaining}d remaining`
                                : "Withdraw deposit"}
                    </button>
                </div>
            )}
        </div>
    );
}

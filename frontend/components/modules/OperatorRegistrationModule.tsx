"use client";

import { useState, useCallback } from "react";
import { formatEther } from "viem";
import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import {
    useRegistrationDeposit,
    useWithdrawDeposit,
    useAgentServices,
    type AgentServices,
} from "@/lib/mechanisms/useOperatorRegistry";
import { useDidVerification, isDidWeb } from "@/lib/mechanisms/useDidWeb";
import { useAccount } from "wagmi";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";

// ── Agent service field input ───────────────────────────────────────────────

function AgentServiceField({
    label,
    placeholder,
    value,
    onChange,
    hint,
}: {
    label: string;
    placeholder: string;
    value: string;
    onChange: (v: string) => void;
    hint?: string;
}) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-0.5">{label}</label>
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
            />
            {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
    );
}

// ── Agent badge ─────────────────────────────────────────────────────────────

export function AgentBadge({ services }: { services: AgentServices }) {
    const endpoints = [
        services.mcp && "MCP",
        services.a2a && "A2A",
        services.rest && "REST",
    ].filter(Boolean);
    return (
        <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200"
            data-testid="agent-badge"
        >
            <span>🤖</span>
            <span>Agent</span>
            {endpoints.length > 0 && (
                <span className="text-violet-400 font-normal">({endpoints.join(", ")})</span>
            )}
        </span>
    );
}

// ── DID verification badge ──────────────────────────────────────────────────

function DidVerificationBadge({ did, address }: { did: string; address: string }) {
    const { verified, isLoading, error } = useDidVerification(did, address);
    if (!did || !isDidWeb(did)) return null;
    return (
        <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold border ${isLoading
                ? "bg-gray-50 text-gray-500 border-gray-200"
                : verified
                    ? "bg-green-50 text-green-700 border-green-200"
                    : error
                        ? "bg-red-50 text-red-600 border-red-200"
                        : "bg-yellow-50 text-yellow-700 border-yellow-200"
                }`}
            title={error ?? (verified ? "DID verified" : "DID not verified")}
            data-testid="did-badge"
        >
            {isLoading ? "⏳" : verified ? "✓" : "⚠"} did:web
        </span>
    );
}

// ── Operator service display ────────────────────────────────────────────────

export function OperatorServiceDisplay({
    address,
}: {
    address: `0x${string}` | undefined;
}) {
    const { data, isLoading } = useAgentServices(address);
    if (isLoading || !data || !data.isAgent) return null;

    const { services, capabilities } = data;
    return (
        <div className="space-y-1.5" data-testid="operator-service-display">
            <div className="flex flex-wrap items-center gap-1.5">
                <AgentBadge services={services} />
                {services.did && address && (
                    <DidVerificationBadge did={services.did} address={address} />
                )}
                {services.ens && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        {services.ens}
                    </span>
                )}
            </div>
            {(services.mcp || services.a2a || services.rest || services.did) && (
                <div className="text-xs text-gray-500 space-y-0.5">
                    {services.mcp && <p>MCP: <span className="font-mono text-gray-500">{services.mcp}</span></p>}
                    {services.a2a && <p>A2A: <span className="font-mono text-gray-500">{services.a2a}</span></p>}
                    {services.rest && <p>REST: <span className="font-mono text-gray-500">{services.rest}</span></p>}
                    {services.did && <p>DID: <span className="font-mono text-gray-500">{services.did}</span></p>}
                </div>
            )}
            {capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {capabilities.map((cap) => (
                        <span key={cap} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 border border-gray-200">
                            {cap}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main module ─────────────────────────────────────────────────────────────

export function OperatorRegistrationModule({ context }: ModuleProps) {
    const [metadataURI, setMetadataURI] = useState("");
    const [showAgentFields, setShowAgentFields] = useState(false);
    const [publishing, setPublishing] = useState(false);

    // Agent service fields
    const [mcp, setMcp] = useState("");
    const [a2a, setA2a] = useState("");
    const [rest, setRest] = useState("");
    const [did, setDid] = useState("");
    const [ens, setEns] = useState("");
    const [capabilitiesInput, setCapabilitiesInput] = useState("");

    const { accentTone, shellLabel, cardStyle, labelStyle } = deriveModuleChrome(context);
    const accentButtonStyle = accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined;
    const depositRead = useRegistrationDeposit();
    const depositAmount = depositRead.data as bigint | undefined;
    const withdrawDeposit = useWithdrawDeposit();
    const { address } = useAccount();
    const capability = context.capabilities.find(
        (candidate) => candidate.action.executionType === "transaction"
            && (candidate.action.kind === "register-operator" || candidate.action.kind === "withdraw-operator-deposit")
    );
    const isExecuting = capability ? context.executingCapabilityId === capability.id : false;
    const isExecutable = capability ? context.executableCapabilityIds.has(capability.id) : false;

    const hasAgentInput = !!(mcp || a2a || rest || did || ens || capabilitiesInput.trim());

    const buildAndPublishMetadata = useCallback(async (): Promise<string> => {
        const services: Record<string, string> = {};
        if (mcp) services.mcp = mcp;
        if (a2a) services.a2a = a2a;
        if (rest) services.rest = rest;
        if (did) services.did = did;
        if (ens) services.ens = ens;

        const capabilities = capabilitiesInput
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

        const metadata: Record<string, unknown> = {};
        if (Object.keys(services).length > 0) metadata.services = services;
        if (capabilities.length > 0) metadata.capabilities = capabilities;

        if (Object.keys(metadata).length === 0) return "";

        const cid = await DEFAULT_IPFS_SERVICE.pinJSON(metadata);
        return DEFAULT_IPFS_SERVICE.buildURI(cid);
    }, [mcp, a2a, rest, did, ens, capabilitiesInput]);

    const handleSubmit = useCallback(async () => {
        if (!capability) return;

        let uri = metadataURI;

        // If agent fields have content and no manual URI, build + publish
        if (hasAgentInput && !metadataURI) {
            try {
                setPublishing(true);
                uri = await buildAndPublishMetadata();
            } catch (err) {
                // Fall back to empty — don't block registration
                console.error("Failed to publish agent metadata:", err);
                uri = "";
            } finally {
                setPublishing(false);
            }
        }

        context.onExecuteCapability(
            capability,
            capability.action.kind === "withdraw-operator-deposit"
                ? { kind: "withdraw-operator-deposit" }
                : { kind: "register-operator", metadataURI: uri },
        );
    }, [capability, metadataURI, hasAgentInput, buildAndPublishMetadata, context]);

    if (!capability) {
        return null;
    }

    const isRegister = capability.action.kind === "register-operator";

    return (
        <div
            className="border border-gray-200 rounded-lg p-4 space-y-3"
            style={cardStyle}
        >
            <p className="text-[11px] font-semibold text-gray-500" style={labelStyle}>Seller Setup</p>
            <h3 className="text-sm font-semibold text-black">Operator Registration</h3>
            <p className="text-xs text-gray-500">{shellLabel}</p>
            <p className="text-xs text-gray-500">
                Register as an operator to participate in this institution.
            </p>

            {/* Show current agent status if updating */}
            {!isRegister && address && (
                <OperatorServiceDisplay address={address} />
            )}

            {isRegister && depositAmount !== undefined && depositAmount > 0n && (
                <p className="text-xs text-gray-600">
                    Registration deposit: <span className="font-semibold">{formatEther(depositAmount)} ETH</span>
                    <span className="text-gray-500 ml-1">(reclaimable after lock period)</span>
                </p>
            )}

            {/* Toggle for agent service fields */}
            <button
                type="button"
                onClick={() => setShowAgentFields(!showAgentFields)}
                className="text-[11px] text-gray-500 hover:text-gray-700 underline"
                data-testid="toggle-agent-fields"
            >
                {showAgentFields ? "Hide agent service fields" : "Configure as autonomous agent"}
            </button>

            {showAgentFields && (
                <div className="space-y-2 border border-gray-100 rounded p-3 bg-gray-50" data-testid="agent-service-fields">
                    <p className="text-xs font-semibold text-gray-500">Agent Service Endpoints</p>
                    <AgentServiceField label="MCP" placeholder="https://agent.example.com/mcp" value={mcp} onChange={setMcp} hint="Model Context Protocol endpoint" />
                    <AgentServiceField label="A2A" placeholder="https://agent.example.com/a2a" value={a2a} onChange={setA2a} hint="Agent-to-Agent protocol endpoint" />
                    <AgentServiceField label="REST" placeholder="https://agent.example.com/v1" value={rest} onChange={setRest} hint="REST API base URL" />
                    <AgentServiceField label="DID" placeholder="did:web:agent.example.com" value={did} onChange={setDid} hint="W3C did:web identifier" />
                    <AgentServiceField label="ENS" placeholder="agent.figaro.eth" value={ens} onChange={setEns} hint="ENS name" />
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-0.5">Capabilities</label>
                        <input
                            type="text"
                            placeholder="route-optimization, live-eta, multi-stop"
                            value={capabilitiesInput}
                            onChange={(e) => setCapabilitiesInput(e.target.value)}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
                        />
                        <p className="text-xs text-gray-500 mt-0.5">Comma-separated capability tags</p>
                    </div>
                </div>
            )}

            {/* Manual URI override — visible when agent fields are hidden */}
            {!showAgentFields && (
                <input
                    type="text"
                    placeholder="Metadata URI (optional)"
                    value={metadataURI}
                    onChange={(e) => setMetadataURI(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
                />
            )}

            <button
                type="button"
                onClick={handleSubmit}
                disabled={!isExecutable || !!context.executingCapabilityId || publishing}
                className="text-xs px-3 py-1.5 rounded bg-black text-white disabled:opacity-40"
                style={isExecutable && !context.executingCapabilityId ? accentButtonStyle : undefined}
            >
                {publishing ? "Publishing metadata..." : isExecuting ? "Processing..." : capability.label}
            </button>
            {!isRegister && (
                <div className="border-t border-gray-100 pt-3 mt-3">
                    <p className="text-[11px] font-semibold text-gray-500 mb-2">Deposit Withdrawal</p>
                    <p className="text-xs text-gray-500 mb-2">
                        Withdraw clears your registry binding and returns the deposit. Lock period must
                        have elapsed since registration.
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            if (!window.confirm("Withdraw your registration deposit? This will clear your operator registration. Re-registration costs a fresh deposit and restarts the lock period.")) return;
                            withdrawDeposit.withdraw();
                        }}
                        disabled={withdrawDeposit.isPending || withdrawDeposit.isConfirming}
                        className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-700 disabled:opacity-40"
                    >
                        {withdrawDeposit.isPending || withdrawDeposit.isConfirming ? "Withdrawing..." : "Withdraw Deposit"}
                    </button>
                    {withdrawDeposit.error && (
                        <p className="text-xs text-red-500 mt-1">{withdrawDeposit.error.message}</p>
                    )}
                </div>
            )}
        </div>
    );
}

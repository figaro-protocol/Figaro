"use client";

/**
 * SwapFundingPanel — a party's swap-funded bond leg: the ON-RAMP into the
 * process denomination, offered when the party's balance can't cover their
 * bond. The buyer mounts it at checkout (candidates = the seller's other
 * accepted tokens); the seller mounts it at accept (candidates = their own
 * accepted set). The coordinator swaps the chosen token at commit time and
 * the kernel pulls the bond as always — the order stays denominated in the
 * one process token; only the funding source changes. Selection + the
 * one-time Permit2 authorization live here; the witness signing itself rides
 * the sign/accept step.
 */
import { useReadContract } from "wagmi";
import { Button } from "@/components/ui/Button";
import { ERC20_ABI } from "@/lib/kernel/contracts";
import type { AcceptedTokenMetadata } from "@/lib/member/acceptedTokenMetadata";
import { formatToken } from "@/lib/shared/utils";
import { hexEqual } from "@/lib/shared/evm";

function FundingTokenOption({
    token,
    party,
    selected,
    onSelect,
    decimals,
}: {
    token: AcceptedTokenMetadata;
    party: `0x${string}`;
    selected: boolean;
    onSelect: () => void;
    decimals: number;
}) {
    const { data: balance } = useReadContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [party],
    });
    return (
        <label
            className="flex items-center justify-between gap-2 rounded border border-default px-3 py-2 text-sm cursor-pointer has-[:checked]:border-ink-heading"
            data-testid={`funding-token-option-${token.address.toLowerCase()}`}
        >
            <span className="flex items-center gap-2">
                <input
                    type="radio"
                    name="funding-token"
                    checked={selected}
                    onChange={onSelect}
                    className="accent-ink-heading"
                />
                <span className="font-medium text-ink-primary">{token.symbol}</span>
            </span>
            <span className="text-ink-muted tabular-nums">
                {balance !== undefined ? `${formatToken(balance as bigint, decimals)} held` : "…"}
            </span>
        </label>
    );
}

export function SwapFundingPanel({
    candidates,
    party,
    currencySymbol,
    decimals,
    fundingToken,
    onSelect,
    needsAuthorization,
    onAuthorize,
    isAuthorizing,
}: {
    candidates: AcceptedTokenMetadata[];
    /** The wallet funding its bond — buyer at checkout, seller at accept. */
    party: `0x${string}`;
    currencySymbol: string;
    decimals: number;
    fundingToken: `0x${string}` | null;
    onSelect: (token: `0x${string}` | null) => void;
    needsAuthorization: boolean;
    onAuthorize: () => void;
    isAuthorizing: boolean;
}) {
    return (
        <div
            className="rounded border border-default bg-subtle p-3 space-y-2"
            data-testid="swap-funding-panel"
        >
            <p className="text-xs font-semibold text-ink-muted">
                Not enough {currencySymbol || "the settlement token"} — fund your bond from another accepted token
            </p>
            <p className="text-[11px] text-ink-muted leading-relaxed">
                The chosen token is swapped into {currencySymbol || "the settlement token"} when the
                order commits; the swap route is bound into your signature, so no relayer can change
                it. The order itself stays priced and bonded in {currencySymbol || "the settlement token"}.
            </p>
            <div className="space-y-1.5">
                {candidates.map((t) => (
                    <FundingTokenOption
                        key={t.address}
                        token={t}
                        party={party}
                        decimals={decimals}
                        selected={hexEqual(fundingToken, t.address)}
                        onSelect={() => onSelect(t.address as `0x${string}`)}
                    />
                ))}
            </div>
            {fundingToken && needsAuthorization && (
                <Button
                    onClick={onAuthorize}
                    disabled={isAuthorizing}
                    variant="secondary"
                    className="w-full"
                    data-testid="funding-authorize"
                >
                    {isAuthorizing ? "Authorizing…" : "Authorize funding token"}
                </Button>
            )}
        </div>
    );
}

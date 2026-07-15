"use client";

/**
 * SwapFundingPanel — the buyer's swap-funded bond leg, offered when their
 * bond-currency balance can't cover the locked total. Candidates are the
 * seller's OTHER accepted tokens — the set the buyer may swap into the
 * process currency (the swap-and-commit path): the coordinator swaps the
 * chosen token at commit time and the kernel pulls the bond as always. The
 * process stays denominated in the assembly's one currency; only the buyer's
 * funding source changes. Selection + the one-time Permit2 authorization
 * live here; the witness signing itself rides the sign step.
 */
import { useReadContract } from "wagmi";
import { Button } from "@/components/ui/Button";
import { ERC20_ABI } from "@/lib/kernel/contracts";
import type { AcceptedTokenMetadata } from "@/lib/seller/acceptedTokenMetadata";
import { formatToken } from "@/lib/shared/utils";

function FundingTokenOption({
    token,
    buyer,
    selected,
    onSelect,
    decimals,
}: {
    token: AcceptedTokenMetadata;
    buyer: `0x${string}`;
    selected: boolean;
    onSelect: () => void;
    decimals: number;
}) {
    const { data: balance } = useReadContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [buyer],
    });
    return (
        <label
            className="flex items-center justify-between gap-2 rounded border border-neutral-200 px-3 py-2 text-sm cursor-pointer has-[:checked]:border-black"
            data-testid={`funding-token-option-${token.address.toLowerCase()}`}
        >
            <span className="flex items-center gap-2">
                <input
                    type="radio"
                    name="funding-token"
                    checked={selected}
                    onChange={onSelect}
                    className="accent-black"
                />
                <span className="font-medium text-black">{token.symbol}</span>
            </span>
            <span className="text-neutral-500 tabular-nums">
                {balance !== undefined ? `${formatToken(balance as bigint, decimals)} held` : "…"}
            </span>
        </label>
    );
}

export function SwapFundingPanel({
    candidates,
    buyer,
    currencySymbol,
    decimals,
    fundingToken,
    onSelect,
    needsAuthorization,
    onAuthorize,
    isAuthorizing,
}: {
    candidates: AcceptedTokenMetadata[];
    buyer: `0x${string}`;
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
            className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-2"
            data-testid="swap-funding-panel"
        >
            <p className="text-xs font-semibold text-neutral-500">
                Not enough {currencySymbol || "the settlement token"} — fund your bond from another accepted token
            </p>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
                The chosen token is swapped into {currencySymbol || "the settlement token"} when the
                order commits; the swap route is bound into your signature, so no relayer can change
                it. The order itself stays priced and bonded in {currencySymbol || "the settlement token"}.
            </p>
            <div className="space-y-1.5">
                {candidates.map((t) => (
                    <FundingTokenOption
                        key={t.address}
                        token={t}
                        buyer={buyer}
                        decimals={decimals}
                        selected={!!fundingToken && fundingToken.toLowerCase() === t.address.toLowerCase()}
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

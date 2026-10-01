"use client";

/**
 * SwapFundingPanel — a party's swap-funded bond leg: the ON-RAMP into the
 * process denomination, offered when the party's balance can't cover their
 * bond. The buyer mounts it at checkout (candidates = the seller's other
 * accepted tokens); the seller mounts it at accept (candidates = their own
 * accepted set). The coordinator swaps the chosen token at commit time and
 * the Core pulls the bond as always — the order stays denominated in the
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

/**
 * Where a chosen funding token stands with Permit2 — derived once, read by the
 * panel and by the action beside it (place order, counter-sign):
 *
 *   none        no funding token is chosen
 *   reading     the allowance has not been read yet, or is being read again
 *               (after an approval's receipt the value in hand is stale)
 *   needed      the allowance is known and short of the bond
 *   authorizing the approval is pending or confirming
 *   ready       the allowance is known and covers the bond
 *
 * A commit with a funding leg pulls the token through Permit2, so anything but
 * `none` or `ready` would broadcast a commit that reverts.
 */
export type FundingAuthorization = "none" | "reading" | "needed" | "authorizing" | "ready";

export function fundingAuthorization({
    fundingToken,
    allowanceKnown,
    needsApproval,
    isAuthorizing,
}: {
    fundingToken: `0x${string}` | null;
    /** The allowance in hand is current: read, and not being read again. */
    allowanceKnown: boolean;
    /** The allowance last read is short of the bond. */
    needsApproval: boolean;
    /** The approval transaction is pending or confirming. */
    isAuthorizing: boolean;
}): FundingAuthorization {
    if (!fundingToken) return "none";
    if (isAuthorizing) return "authorizing";
    if (!allowanceKnown) return "reading";
    return needsApproval ? "needed" : "ready";
}

/** Whether the action beside the panel must wait: a chosen funding token that
 *  is not yet authorized. */
export function fundingBlocksTheAct(authorization: FundingAuthorization): boolean {
    return authorization !== "none" && authorization !== "ready";
}

export function SwapFundingPanel({
    candidates,
    party,
    currencySymbol,
    decimals,
    fundingToken,
    onSelect,
    authorization,
    onAuthorize,
}: {
    candidates: AcceptedTokenMetadata[];
    /** The wallet funding its bond — buyer at checkout, seller at accept. */
    party: `0x${string}`;
    currencySymbol: string;
    decimals: number;
    fundingToken: `0x${string}` | null;
    onSelect: (token: `0x${string}` | null) => void;
    /** Where the chosen token stands with Permit2 (`fundingAuthorization`). */
    authorization: FundingAuthorization;
    onAuthorize: () => void;
}) {
    return (
        <div
            className="rounded border border-default bg-subtle p-3 space-y-2"
            data-testid="swap-funding-panel"
            data-authorization={authorization}
        >
            <p className="text-xs font-semibold text-ink-muted">
                Not enough {currencySymbol || "the denomination"} — fund your bond from another accepted token
            </p>
            <p className="text-[11px] text-ink-muted leading-relaxed">
                The chosen token is swapped into {currencySymbol || "the denomination"} when the
                order commits; the swap route is bound into your signature, so no relayer can change
                it. The order itself stays priced and bonded in {currencySymbol || "the denomination"}.
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
            {(authorization === "needed" || authorization === "authorizing") && (
                <Button
                    onClick={onAuthorize}
                    disabled={authorization === "authorizing"}
                    variant="secondary"
                    className="w-full"
                    data-testid="funding-authorize"
                >
                    {authorization === "authorizing" ? "Authorizing…" : "Authorize funding token"}
                </Button>
            )}
            {(authorization === "reading" || authorization === "ready") && (
                <p className="text-[11px] text-ink-muted" data-testid="funding-authorization-status">
                    {authorization === "reading"
                        ? "Checking your authorization for this token…"
                        : "This token is authorized."}
                </p>
            )}
        </div>
    );
}

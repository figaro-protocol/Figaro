"use client";

/**
 * SwapFundingPanel — a party's swap-funded bond leg: the ON-RAMP into the
 * process denomination, offered when the party's balance can't cover their
 * bond. The buyer mounts it at checkout (candidates = the seller's other
 * accepted tokens); the seller mounts it at accept (candidates = their own
 * accepted set). The coordinator swaps the chosen token at commit time and
 * the Core pulls the bond as always — the order stays denominated in the
 * one process token; only the funding source changes. Selection + the
 * one-time Permit2 authorization are held by `useSwapFunding`; the witness
 * signing itself rides the sign/accept step.
 */
import { Button } from "@/components/ui/Button";
import type { AcceptedTokenMetadata } from "@/lib/member/acceptedTokenMetadata";
import { tokenFigure } from "@/lib/shared/utils";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import useTokenBalance from "@/hooks/useTokenBalance";
import { hexEqual } from "@/lib/shared/evm";
import type { FundingAuthorization } from "@/lib/composition/useSwapFunding";

function FundingTokenOption({
    token,
    party,
    selected,
    onSelect,
}: {
    token: AcceptedTokenMetadata;
    party: `0x${string}`;
    selected: boolean;
    onSelect: () => void;
}) {
    // This candidate's own decimals(), read from the chain — never the process token's.
    const { decimals } = useTokenDecimals(token.address as `0x${string}`);
    const { read: balance } = useTokenBalance(token.address as `0x${string}`, party);
    return (
        <label
            className="flex items-center justify-between gap-2 rounded border border-default px-3 py-2 text-sm cursor-pointer has-[:checked]:border-ink-heading"
            data-testid={`funding-token-option-${token.address.toLowerCase()}`}
        >
            <span className="flex items-center gap-2">
                {/* Raw: a radio, which the Input primitive does not model. */}
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
                {balance.status === "present" ? `${tokenFigure(balance.value, decimals)} held` : balance.status === "pending" ? "…" : null}
            </span>
        </label>
    );
}

export function SwapFundingPanel({
    candidates,
    party,
    currencySymbol,
    fundingToken,
    onSelect,
    authorization,
    onAuthorize,
}: {
    candidates: AcceptedTokenMetadata[];
    /** The wallet funding its bond — buyer at checkout, seller at accept. */
    party: `0x${string}`;
    currencySymbol: string;
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

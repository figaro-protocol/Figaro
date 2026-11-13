"use client";

/**
 * SwapFundingPanel — a party's swap-funded bond leg: the ON-RAMP into the
 * process denomination, offered when the party's balance can't cover their
 * bond. The buyer mounts it at checkout (candidates = the seller's other
 * accepted tokens); the seller mounts it at accept (candidates = their own
 * accepted set). The coordinator swaps the chosen token at commit time and
 * the Core pulls the bond as always — the order stays denominated in the
 * one process token; only the funding source changes. Selection + the
 * one-time Permit2 authorization are held by `useSwapFunding`; the slippage
 * margin, set here before the quote the signature binds, by
 * `useFundingMargin`; the witness signing itself rides the sign/accept step.
 */
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import type { AcceptedTokenMetadata } from "@/lib/member/acceptedTokenMetadata";
import { tokenFigure } from "@/lib/shared/utils";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import useTokenBalance from "@/hooks/useTokenBalance";
import { hexEqual } from "@/lib/shared/evm";
import type { FundingAuthorization } from "@/lib/composition/useSwapFunding";
import type { FundingMarginField } from "@/lib/composition/useFundingMargin";
import { spendsWholeCap } from "@/lib/composition/swapVenue";

const MARGIN_REFUSAL: Record<"range" | "balance", string> = {
    range: "Enter a margin from 0% to 10%.",
    balance: "Your balance is below the max input at this margin.",
};

/** The slippage margin the party sets before the quote its signature binds:
 *  the max input the swap may spend is the quote plus this margin. */
function FundingMarginInput({ margin }: { margin: FundingMarginField }) {
    const error = margin.refusal ? MARGIN_REFUSAL[margin.refusal] : null;
    return (
        <div className="space-y-1" data-testid="funding-margin">
            <FormField label="Slippage margin (%)" inputId="funding-margin-input">
                <Input
                    id="funding-margin-input"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="10"
                    step="0.01"
                    value={margin.text}
                    onChange={(e) => margin.onChange(e.target.value)}
                    hasError={!!error}
                    errorId={error ? "funding-margin-error" : undefined}
                    data-testid="funding-margin-input"
                />
            </FormField>
            {error && (
                <p id="funding-margin-error" role="alert" className="text-xs text-error-fg" data-testid="funding-margin-error">
                    {error}
                </p>
            )}
            {margin.maxInput !== null && margin.decimals !== undefined && (
                <p className="text-[11px] text-ink-muted tabular-nums" data-testid="funding-margin-max-input">
                    Max input: {tokenFigure(margin.maxInput, margin.decimals)} {margin.symbol}
                </p>
            )}
            {/* The coordinator returns the input the swap did not use
                (`WitnessSwapAndCommitCoordinator.sol`, step 4); an
                exact-input route spends the whole cap, so it says so below. */}
            {margin.maxInput !== null && !spendsWholeCap(margin.venue) && (
                <p className="text-[11px] text-ink-muted" data-testid="funding-margin-returned">
                    The swap takes at most this much; any unused input is returned to you.
                </p>
            )}
            {/* An exact-input route spends the whole cap. */}
            {spendsWholeCap(margin.venue) && (
                <p className="text-[11px] text-ink-muted" data-testid="funding-margin-exact-input">
                    This venue spends the whole max input.
                </p>
            )}
        </div>
    );
}

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
    margin,
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
    /** The slippage margin field (`useFundingMargin`); shown once a token is chosen. */
    margin: FundingMarginField | null;
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
            {fundingToken && margin && <FundingMarginInput margin={margin} />}
            {(authorization === "needed" || authorization === "authorizing") && (
                <Button
                    onClick={onAuthorize}
                    disabled={authorization === "authorizing"}
                    variant="secondary"
                    className="w-full"
                    data-testid="funding-authorize"
                >
                    {authorization === "authorizing"
                        ? "Authorizing…"
                        : margin?.maxInput != null && margin.decimals !== undefined
                            ? `Authorize ${tokenFigure(margin.maxInput, margin.decimals)} ${margin.symbol}`
                            : "Authorize funding token"}
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

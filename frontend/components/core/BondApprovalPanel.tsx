"use client";

import { formatToken } from "@/lib/shared/utils";
import { useArbitrationCost } from "@/hooks/core/useArbitrationCost";

interface BondApprovalPanelProps {
    proposerBond: bigint;
    counterpartyBond: bigint;
    feeAmount: bigint | null;
    feeBps: number | null;
    tokenDecimals: number | undefined;
    approved: boolean;
    currentProcessId: string | null;
    isBuyerProposal: boolean;
    /** True when the token supports EIP-2612 permit. Shows "Sign Permit" instead of "Approve". */
    supportsPermit?: boolean;
    /** Called when the user clicks the approve/permit button. */
    onApprove: () => Promise<void>;
    /** Called instead of onApprove when supportsPermit is true. Signs off-chain, no gas. */
    onSignPermit?: () => Promise<void>;
    /** Available credit in FigaroCore for the connected wallet. */
    availableCredit?: bigint;
    /** New capital needed from wallet after credit offset. */
    walletNeeded?: bigint | null;
}

export default function BondApprovalPanel({
    proposerBond,
    counterpartyBond,
    feeAmount,
    feeBps,
    tokenDecimals,
    approved,
    currentProcessId,
    isBuyerProposal,
    supportsPermit = false,
    onApprove,
    onSignPermit,
    availableCredit = 0n,
    walletNeeded,
}: BondApprovalPanelProps) {
    const { costEth, cost: arbCostWei } = useArbitrationCost();

    return (
        <div className="border-t border-gray-100 mt-4 pt-4">
            <div className="text-xs font-medium mb-3">Deposit &amp; Payment</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-gray-50 rounded p-2">
                    <div className="text-xs text-gray-500 mb-1">Your deposit</div>
                    <div
                        data-testid={isBuyerProposal ? "buyer-bond" : "seller-bond"}
                        className="font-mono text-sm font-semibold text-black"
                    >
                        {formatToken(proposerBond, tokenDecimals)}
                    </div>
                    <div className="text-xs text-gray-500">
                        {currentProcessId ? "2× payment" : isBuyerProposal ? "2× payment" : "2× cumulative"}
                    </div>
                </div>
                <div className="bg-gray-50 rounded p-2">
                    <div className="text-xs text-gray-500 mb-1">Their deposit</div>
                    <div
                        data-testid={isBuyerProposal ? "seller-bond" : "buyer-bond"}
                        className="font-mono text-sm font-semibold text-black"
                    >
                        {formatToken(counterpartyBond, tokenDecimals)}
                    </div>
                    <div className="text-xs text-gray-500">
                        {currentProcessId
                            ? "2× cumulative — grows with chain"
                            : isBuyerProposal ? "2× cumulative" : "2× payment"}
                    </div>
                </div>
            </div>
            {availableCredit > 0n && (
                <div data-testid="credit-breakdown" className="bg-green-50 border border-green-200 rounded p-2 mb-3">
                    <div className="text-xs font-medium text-green-800 mb-1">Covered by Previous Refund</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-green-700">From balance:</span>{" "}
                            <span className="font-mono font-semibold text-green-900">
                                {formatToken(availableCredit > proposerBond ? proposerBond : availableCredit, tokenDecimals)}
                            </span>
                        </div>
                        <div>
                            <span className="text-green-700">New payment needed:</span>{" "}
                            <span className="font-mono font-semibold text-green-900">
                                {formatToken(walletNeeded ?? proposerBond, tokenDecimals)}
                            </span>
                        </div>
                    </div>
                </div>
            )}
            {feeAmount !== null && (
                <div className="text-xs text-gray-500 mb-3" data-testid="protocol-fee-main">
                    ≈{formatToken(feeAmount, tokenDecimals)} deducted at settlement
                    ({feeBps !== null ? `${(feeBps / 100).toFixed(2)}%` : "—"}), split 50/50
                </div>
            )}
            {costEth && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-3" data-testid="dispute-cost">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-medium text-amber-800">Dispute cost</span>
                        <span className="font-mono text-sm font-semibold text-amber-900">{costEth} ETH</span>
                        <span className="text-xs text-amber-600">(flat fee)</span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                        If either party escalates to arbitration, this fee is paid in addition
                        to the bond already at risk. The fee is fixed regardless of order size.
                    </p>
                </div>
            )}
            <div className="bg-red-50 border border-red-200 rounded p-2 mb-3" data-testid="key-loss-warning">
                <p className="text-xs font-medium text-red-800">🔑 No admin recovery</p>
                <p className="text-xs text-red-700 mt-1">
                    Deposits are held securely and released only by settlement or
                    mutual cancellation. If you lose access to your account,
                    funds cannot be recovered &mdash; there is no admin backdoor. Consider
                    using account recovery or a backup if this is a concern.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <div data-testid="approval-status" className="text-xs text-black">
                    {walletNeeded === 0n
                        ? "Covered by balance ✓"
                        : approved ? "Authorized ✓" : "Authorization needed"}
                </div>
                {!approved && walletNeeded !== 0n && (
                    <button
                        data-testid="approve-button"
                        className="text-xs bg-black text-white px-2 py-1 rounded"
                        type="button"
                        onClick={supportsPermit && onSignPermit ? onSignPermit : onApprove}
                    >
                        {supportsPermit
                            ? "Authorize"
                            : `Authorize ${formatToken(walletNeeded ?? proposerBond, tokenDecimals)}`}
                    </button>
                )}
            </div>
        </div>
    );
}

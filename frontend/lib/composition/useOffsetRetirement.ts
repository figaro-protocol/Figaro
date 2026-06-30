"use client";

/**
 * useOffsetRetirement — Path A bridge composer.
 *
 * Composes:
 *   1. Process emissions sum (useProcessDisclosureSummary)
 *   2. Per-chain aggregator registry (offsetAggregators.ts)
 *   3. Aggregator quote (USDC.e in needed for N tonnes retired)
 *   4. Four signed transactions:
 *        a. ERC-20 approve(aggregator, maxAmountIn)
 *        b. aggregator.retire(...) — emits the retirement event
 *        c. ProcessOffsetReceipt.record(...) — anchors processId↔retirement on-chain
 *        d. (caller's responsibility) FigaroCore.resolveProcess(...)
 *
 * State machine progresses through `idle → wrong-chain | no-measurements`
 * (terminal) or `idle → quoting → ready → approving → approved → retiring →
 * retired → recording → done`. Errors from any step set status to `error`
 * and surface the error message.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    useAccount,
    useChainId,
    usePublicClient,
    useReadContract,
    useWaitForTransactionReceipt,
    useWriteContract,
} from "wagmi";
import { type Address, type Hex } from "viem";
import { ERC20_ABI } from "@/lib/core/contracts";
import { PROCESS_OFFSET_RECEIPT_ABI } from "@/lib/composition/abis";
import { COMPOSITION_CONTRACTS } from "@/lib/composition/contracts";
import { activeChain } from "@/lib/shared/chains";
import { extractErrorMessage } from "@/lib/shared/errors";
import {
    type AggregatorAdapter,
    type AggregatorQuote,
    getOffsetAggregators,
    type OffsetProvider,
} from "@/lib/composition/offsetAggregators";
import { useProcessDisclosureSummary } from "@/lib/composition/useGHGDisclosure";

type OffsetRetirementStatus =
    | "idle"
    | "no-measurements"
    | "wrong-chain"
    | "no-receipts-anchor"
    | "quoting"
    | "ready"
    | "approving"
    | "approved"
    | "retiring"
    | "retired"
    | "recording"
    | "done"
    | "error";

export interface UseOffsetRetirementResult {
    status: OffsetRetirementStatus;
    error: string | null;

    /** Process-level emissions sum, in grams CO2e. */
    totalGrams: bigint;
    /** Tonnes to retire, in 1e18 fixed-point. ceil(totalGrams / 1_000_000) tonnes. */
    tonsToRetire: bigint;

    /** Providers available on the connected chain. */
    availableProviders: readonly OffsetProvider[];
    selectedProvider: OffsetProvider | null;
    setProvider: (provider: OffsetProvider) => void;

    /** Aggregator quote (re-fetched when provider or tons change). */
    quote: AggregatorQuote | null;
    /** USDC the buyer must approve before retiring. quote.amountIn + slippage. */
    maxAmountIn: bigint;

    /** True when current allowance < maxAmountIn. */
    requiresApproval: boolean;

    approve: () => Promise<void>;
    retire: () => Promise<void>;
    recordReceipt: () => Promise<void>;

    /** Tx hashes for each step, exposed for receipts UI. */
    approveTxHash: Hex | null;
    retireTxHash: Hex | null;
    recordTxHash: Hex | null;
}

/** Slippage tolerance in basis points (100 bps = 1%). Default 1% is generous
 *  enough to absorb typical Uniswap V3 movement without forcing the user to
 *  re-quote, tight enough to bound buyer overpayment. */
const DEFAULT_SLIPPAGE_BPS = 100n;

function applySlippage(amountIn: bigint, slippageBps: bigint): bigint {
    return (amountIn * (10000n + slippageBps)) / 10000n;
}

/** Convert a tonnes-in-grams value to 1e18 fixed-point tonnes, ceiling so
 *  we don't under-offset. 1 tonne = 1_000_000 grams. Exported for test. */
export function gramsToTonsCeil1e18(grams: bigint): bigint {
    if (grams === 0n) return 0n;
    const TONNE_IN_GRAMS = 1_000_000n;
    const TONNE_FIXED_POINT = 10n ** 18n;
    const tonnesFloor = grams / TONNE_IN_GRAMS;
    const remainder = grams % TONNE_IN_GRAMS;
    const tonnesCeil = remainder === 0n ? tonnesFloor : tonnesFloor + 1n;
    return tonnesCeil * TONNE_FIXED_POINT;
}

export function useOffsetRetirement(processId: Hex | undefined): UseOffsetRetirementResult {
    const { address: buyer } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();

    const { summary } = useProcessDisclosureSummary(processId);
    const totalGrams = summary?.totalActualGrams ?? 0n;
    const tonsToRetire = useMemo(() => gramsToTonsCeil1e18(totalGrams), [totalGrams]);

    const aggregators = useMemo(() => getOffsetAggregators(chainId), [chainId]);
    const availableProviders = aggregators.providers;
    const [selectedProvider, setSelectedProvider] = useState<OffsetProvider | null>(null);

    // Default to first available provider on chain change
    useEffect(() => {
        if (availableProviders.length === 0) {
            setSelectedProvider(null);
        } else if (!selectedProvider || !availableProviders.includes(selectedProvider)) {
            setSelectedProvider(availableProviders[0]);
        }
    }, [availableProviders, selectedProvider]);

    const adapter: AggregatorAdapter | null = useMemo(
        () => (selectedProvider ? aggregators.get(selectedProvider) : null),
        [aggregators, selectedProvider],
    );

    // Quote whenever (adapter, tonsToRetire) change
    const [quote, setQuote] = useState<AggregatorQuote | null>(null);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    useEffect(() => {
        if (!publicClient || !adapter || tonsToRetire === 0n) {
            setQuote(null);
            return;
        }
        let cancelled = false;
        adapter.quote(publicClient, tonsToRetire).then(
            (q) => { if (!cancelled) { setQuote(q); setQuoteError(null); } },
            (err) => { if (!cancelled) { setQuote(null); setQuoteError(extractErrorMessage(err, "Quote failed")); } },
        );
        return () => { cancelled = true; };
    }, [publicClient, adapter, tonsToRetire]);

    const maxAmountIn = useMemo(
        () => (quote ? applySlippage(quote.amountIn, DEFAULT_SLIPPAGE_BPS) : 0n),
        [quote],
    );

    // Allowance read — re-runs when buyer / adapter / maxAmountIn changes
    const { data: allowance } = useReadContract({
        address: adapter?.inputToken,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: buyer && adapter ? [buyer, adapter.address] : undefined,
        query: { enabled: !!buyer && !!adapter },
    });
    const requiresApproval = useMemo(() => {
        if (!quote || allowance === undefined) return false;
        return (allowance as bigint) < maxAmountIn;
    }, [quote, allowance, maxAmountIn]);

    // Per-step write + receipt-wait state
    const { writeContractAsync } = useWriteContract();
    const [approveTxHash, setApproveTxHash] = useState<Hex | null>(null);
    const [retireTxHash, setRetireTxHash] = useState<Hex | null>(null);
    const [recordTxHash, setRecordTxHash] = useState<Hex | null>(null);
    const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash ?? undefined });
    const { isSuccess: retireConfirmed } = useWaitForTransactionReceipt({ hash: retireTxHash ?? undefined });
    const { isSuccess: recordConfirmed } = useWaitForTransactionReceipt({ hash: recordTxHash ?? undefined });

    const [actionInFlight, setActionInFlight] = useState<"approve" | "retire" | "record" | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const approve = useCallback(async () => {
        if (!adapter || !quote) return;
        setActionInFlight("approve");
        setActionError(null);
        try {
            const hash = await writeContractAsync({
                chain: activeChain,
                address: adapter.inputToken,
                abi: ERC20_ABI,
                functionName: "approve",
                args: [adapter.address, maxAmountIn],
            });
            setApproveTxHash(hash);
        } catch (err) {
            setActionError(extractErrorMessage(err, "Approval failed"));
        } finally {
            setActionInFlight(null);
        }
    }, [adapter, quote, maxAmountIn, writeContractAsync]);

    const retire = useCallback(async () => {
        if (!adapter || !quote || !buyer) return;
        setActionInFlight("retire");
        setActionError(null);
        try {
            const call = adapter.buildRetireCall({
                tonsToRetire,
                beneficiary: buyer,
                maxAmountIn,
            });
            const hash = await writeContractAsync({
                chain: activeChain,
                address: adapter.address,
                abi: adapter.abi as readonly unknown[],
                functionName: call.functionName,
                args: call.args as readonly unknown[],
            });
            setRetireTxHash(hash);
        } catch (err) {
            setActionError(extractErrorMessage(err, "Retirement failed"));
        } finally {
            setActionInFlight(null);
        }
    }, [adapter, quote, buyer, tonsToRetire, maxAmountIn, writeContractAsync]);

    const recordReceipt = useCallback(async () => {
        if (!adapter || !processId || !buyer || !retireTxHash || !quote) return;
        const receiptsAddress = COMPOSITION_CONTRACTS.processOffsetReceipt;
        if (!receiptsAddress || receiptsAddress.length !== 42) return;
        setActionInFlight("record");
        setActionError(null);
        try {
            const hash = await writeContractAsync({
                chain: activeChain,
                address: receiptsAddress,
                abi: PROCESS_OFFSET_RECEIPT_ABI,
                functionName: "record",
                args: [
                    processId,
                    retireTxHash,
                    adapter.address,
                    tonsToRetire,
                    adapter.inputToken,
                    quote.amountIn,
                ],
            });
            setRecordTxHash(hash);
        } catch (err) {
            setActionError(extractErrorMessage(err, "Receipt anchoring failed"));
        } finally {
            setActionInFlight(null);
        }
    }, [adapter, processId, buyer, retireTxHash, quote, tonsToRetire, writeContractAsync]);

    // Status derivation — single source of truth, no internal status state.
    const receiptsAnchorAddress = COMPOSITION_CONTRACTS.processOffsetReceipt;
    const status: OffsetRetirementStatus = useMemo(() => {
        if (actionError) return "error";
        if (totalGrams === 0n) return "no-measurements";
        if (availableProviders.length === 0) return "wrong-chain";
        if (!receiptsAnchorAddress || receiptsAnchorAddress.length !== 42) return "no-receipts-anchor";
        if (recordConfirmed) return "done";
        if (actionInFlight === "record" || (recordTxHash && !recordConfirmed)) return "recording";
        if (retireConfirmed) return "retired";
        if (actionInFlight === "retire" || (retireTxHash && !retireConfirmed)) return "retiring";
        if (approveConfirmed) return "approved";
        if (actionInFlight === "approve" || (approveTxHash && !approveConfirmed)) return "approving";
        if (quote) return "ready";
        if (adapter && tonsToRetire > 0n) return "quoting";
        return "idle";
    }, [
        actionError, totalGrams, availableProviders, receiptsAnchorAddress,
        recordConfirmed, actionInFlight, recordTxHash, retireConfirmed,
        retireTxHash, approveConfirmed, approveTxHash, quote, adapter, tonsToRetire,
    ]);

    return {
        status,
        error: actionError ?? quoteError,
        totalGrams,
        tonsToRetire,
        availableProviders,
        selectedProvider,
        setProvider: setSelectedProvider,
        quote,
        maxAmountIn,
        requiresApproval,
        approve,
        retire,
        recordReceipt,
        approveTxHash,
        retireTxHash,
        recordTxHash,
    };
}

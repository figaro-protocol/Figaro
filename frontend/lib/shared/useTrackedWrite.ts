"use client";

/**
 * useTrackedWrite — wagmi's `writeContractAsync` beside the state of the last
 * transaction it sent: in the wallet (`isPending`), mined and awaited
 * (`isConfirming`), landed (`isSuccess`), or refused (`error`). A write hook
 * sends through `writeContractAsync` (by way of `simulateWriteVerify`) and
 * hands the state to its surface as it stands.
 */

import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

export function useTrackedWrite() {
    const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    return { writeContractAsync, status: { hash, isPending, isConfirming, isSuccess, error } };
}

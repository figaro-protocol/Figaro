/**
 * verifyTxSuccess — the ONE wait-and-verify for a broadcast write: waits for
 * the receipt and throws when the transaction reverted on-chain. Every
 * write path that must not silently continue past a revert (registrations,
 * publishes, withdrawals) verifies through here; a caller that only needs
 * to WAIT (no revert consequence) uses the client directly.
 */

interface ReceiptClient {
    waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: string }>;
}

/** Wait for `hash`'s receipt; throw `consequence` (with the tx hash) when it
 *  reverted. Returns the receipt so callers can read block/log data. */
export async function verifyTxSuccess<C extends ReceiptClient>(
    client: C,
    hash: `0x${string}`,
    consequence: string,
): Promise<Awaited<ReturnType<C["waitForTransactionReceipt"]>>> {
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
        throw new Error(`Transaction reverted on-chain (tx ${hash}). ${consequence}`);
    }
    return receipt as Awaited<ReturnType<C["waitForTransactionReceipt"]>>;
}

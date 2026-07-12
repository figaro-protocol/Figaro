type RpcClient = {
    getBlockNumber: () => Promise<bigint>;
};

export async function ensureRpc(publicClient: RpcClient | null | undefined): Promise<{ ok: boolean; fromBlock: bigint }> {
    if (!publicClient) return { ok: false, fromBlock: 0n };

    try {
        // 10 s timeout — generous enough for the first request to the chain
        // endpoint while still bailing quickly on real outages.
        const latest = await Promise.race([
            publicClient.getBlockNumber(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
        ]);

        const maxScan = parseInt(process.env.NEXT_PUBLIC_MAX_LOG_SCAN_BLOCKS || "100000", 10);
        const from = BigInt(Math.max(0, Number(latest) - maxScan));
        return { ok: true, fromBlock: from };
    } catch (e) {
        console.warn("RPC not available or timed out, skipping log scan.");
        return { ok: false, fromBlock: 0n };
    }
}

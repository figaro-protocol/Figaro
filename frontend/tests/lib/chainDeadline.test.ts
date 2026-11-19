/**
 * A commitment deadline the site writes is chain time: the latest block's
 * timestamp plus the time to live, never the device's clock.
 *
 * `FigaroCore` refuses a commit past `commitDeadline` by `block.timestamp`, so
 * a deadline from a skewed device clock expires early or late against the
 * clock that judges it. `chainDeadline` (`lib/checkout/orderPreview.ts`) is
 * what the checkout walk (`executeAssemblyCheckout`) and the dispatch race
 * draft with.
 *
 * Proves: the deadline follows the block's timestamp when the device clock
 * reads another time, and a failed block read builds no deadline (no
 * wall-clock fallback). Does not prove: that every caller uses it; the two
 * callers are named above, read from the code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getBlock: vi.fn() }));

vi.mock("@/lib/shared/publicClient", () => ({ publicClient: { getBlock: m.getBlock } }));

// The setup file loads `orderPreview` before this file's mock is declared, so
// the module is loaded again here, under the mock.
async function loadChainDeadline() {
    vi.resetModules();
    return (await import("@/lib/checkout/orderPreview")).chainDeadline;
}

const BLOCK_TIME = 1_000_000n;

describe("chainDeadline", () => {
    afterEach(() => {
        vi.useRealTimers();
        m.getBlock.mockReset();
    });

    it("is the latest block's timestamp plus the time to live, whatever the device clock reads", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
        m.getBlock.mockResolvedValue({ timestamp: BLOCK_TIME });
        const chainDeadline = await loadChainDeadline();
        expect(await chainDeadline()).toBe(BLOCK_TIME + 3600n);
        expect(await chainDeadline(60n)).toBe(BLOCK_TIME + 60n);
        expect(m.getBlock).toHaveBeenCalledWith({ blockTag: "latest" });
    });

    it("builds no deadline when the block cannot be read", async () => {
        m.getBlock.mockRejectedValue(new Error("node down"));
        const chainDeadline = await loadChainDeadline();
        await expect(chainDeadline()).rejects.toThrow("node down");
    });
});

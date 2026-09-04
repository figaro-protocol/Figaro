import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEffect, useState } from "react";
import { useOnboardingState } from "@/lib/member/onboardingState";

/**
 * The wizard draft survives a page reload.
 *
 * On reload the wallet reconnects asynchronously, so every wizard step mounts
 * for a moment with no address. A form that hydrates in that window hydrates
 * from the EMPTY state, latches its `hydrated` flag, and then persists the
 * empty form over the real draft the moment the wallet arrives — the seller's
 * identity, catalogue and bindings gone without a word, the step falling back
 * to its "go set a default token" guard.
 *
 * `loaded` is the seam: it means "the draft OF A KNOWN WALLET has been read",
 * so a form gated on it cannot hydrate against the wrong draft.
 */

const WALLET = "0x1cbd3b2770909d4e10f157cabc84c7264073c9ec" as `0x${string}`;
const KEY = `figaro:onboarding:${WALLET}`;

/** Exactly the hydrate-once / persist-on-change contract every
 *  `Onboarding*Form` implements, with the form reduced to one field. */
function useFormHarness(wallet: `0x${string}` | undefined) {
    const { state, loaded, update } = useOnboardingState(wallet);
    const [name, setName] = useState("");
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (hydrated || !loaded) return;
        setName(state.profile?.name ?? "");
        setHydrated(true);
    }, [hydrated, loaded, state.profile]);

    useEffect(() => {
        if (!hydrated || !wallet) return;
        update({ profile: { name } });
    }, [name, hydrated, wallet, update]);

    return { name, setName, hydrated, loaded };
}

const storedName = () =>
    (JSON.parse(localStorage.getItem(KEY) ?? "{}") as { profile?: { name?: string } })
        .profile?.name;

beforeEach(() => {
    localStorage.clear();
});
afterEach(() => {
    localStorage.clear();
});

describe("useOnboardingState — the draft outlives a reload", () => {
    it("does not report loaded until the wallet the draft is keyed by is known", () => {
        const { result } = renderHook(() => useOnboardingState(undefined));
        expect(result.current.loaded).toBe(false);
        expect(result.current.state).toEqual({});
    });

    it("reports loaded once a wallet is connected, with that wallet's draft", () => {
        localStorage.setItem(KEY, JSON.stringify({ profile: { name: "Rosa's Kitchen" } }));
        const { result } = renderHook(() => useOnboardingState(WALLET));
        expect(result.current.loaded).toBe(true);
        expect(result.current.state.profile?.name).toBe("Rosa's Kitchen");
    });

    it("keeps what the seller typed when the wallet reconnects after the reload", async () => {
        // A seller typed a name and reloaded: the draft is on disk.
        localStorage.setItem(KEY, JSON.stringify({ profile: { name: "Rosa's Kitchen" } }));

        // The step remounts with no wallet yet — wagmi is still reconnecting.
        const { result, rerender } = renderHook(
            ({ wallet }: { wallet: `0x${string}` | undefined }) => useFormHarness(wallet),
            { initialProps: { wallet: undefined as `0x${string}` | undefined } },
        );
        expect(result.current.hydrated).toBe(false);
        expect(storedName()).toBe("Rosa's Kitchen");

        // The wallet arrives.
        await act(async () => {
            rerender({ wallet: WALLET });
        });

        expect(result.current.hydrated).toBe(true);
        expect(result.current.name).toBe("Rosa's Kitchen");
        expect(storedName()).toBe("Rosa's Kitchen");
    });

    it("persists each edit under the connected wallet's own key", async () => {
        const { result } = renderHook(() => useFormHarness(WALLET));
        await act(async () => {
            result.current.setName("Wizard Test Bakery");
        });
        expect(storedName()).toBe("Wizard Test Bakery");

        // A second wallet's draft is a different key — one browser, many wallets.
        const other = "0x0000000000000000000000000000000000000042" as `0x${string}`;
        const { result: otherResult } = renderHook(() => useFormHarness(other));
        expect(otherResult.current.name).toBe("");
        expect(storedName()).toBe("Wizard Test Bakery");
    });

    it("stamps the owning wallet and a write time on every save", async () => {
        const { result } = renderHook(() => useFormHarness(WALLET));
        await act(async () => {
            result.current.setName("Mara Oduya Ceramics");
        });
        const raw = JSON.parse(localStorage.getItem(KEY)!) as {
            walletAddress?: string;
            updatedAt?: string;
        };
        expect(raw.walletAddress?.toLowerCase()).toBe(WALLET);
        expect(Date.parse(raw.updatedAt ?? "")).not.toBeNaN();
    });

    it("clear() removes the draft — publishing is the end of the draft's life", async () => {
        const { result } = renderHook(() => useOnboardingState(WALLET));
        await act(async () => {
            result.current.update({ profile: { name: "Gone" } });
        });
        expect(localStorage.getItem(KEY)).not.toBeNull();
        await act(async () => {
            result.current.clear();
        });
        expect(localStorage.getItem(KEY)).toBeNull();
    });
});

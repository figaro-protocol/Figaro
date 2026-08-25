"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { isE2EMockSession } from "@/lib/shared/e2e";

export function RpcBanner() {
    const publicClient = usePublicClient();
    const [available, setAvailable] = useState<boolean | null>(null);
    const isE2EMock = isE2EMockSession();

    useEffect(() => {
        if (isE2EMock) {
            setAvailable(true);
            return;
        }

        let mounted = true;

        // Perform a short series of attempts before declaring the RPC unreachable.
        // If any attempt succeeds we mark available and continue background polling.
        const initialAttempts = async () => {
            if (!publicClient) {
                if (mounted) setAvailable(false);
                return;
            }

            const timeout = (ms: number) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

            const tryOnce = async (ms: number) => {
                const race = Promise.race([timeout(ms)]);
                // Try wagmi publicClient first, then fall back to the window helper if present.
                const tryClient = async () => {
                    try {
                        if (publicClient?.getBlockNumber) return await publicClient.getBlockNumber();
                    } catch (e) {
                        // swallow and try fallback
                    }
                    try {
                        const figaroWin = window as typeof window & { figaroPublicClient?: { getBlockNumber: () => Promise<bigint> } };
                        const wp = figaroWin.figaroPublicClient;
                        if (wp?.getBlockNumber) return await wp.getBlockNumber();
                    } catch (e) {
                        // swallow
                    }
                    throw new Error('no-client');
                };

                return Promise.race([tryClient(), race]);
            };

            // Try a few times with modest backoff before showing the banner.
            const attempts = [1500, 2500, 4000];
            for (let t of attempts) {
                try {
                    await tryOnce(t);
                    if (mounted) setAvailable(true);
                    return;
                } catch (e) {
                    // continue to next attempt
                }
            }

            // After initial attempts failed, mark unavailable but continue polling
            if (mounted) setAvailable(false);
        };

        // Background poll: keep trying to discover the RPC. If found, flip to available.
        const poll = async () => {
            if (!publicClient) return;
            try {
                await publicClient.getBlockNumber();
                if (mounted) setAvailable(true);
            } catch (e) {
                // ignore and allow next poll
            }
        };

        initialAttempts();
        const id = setInterval(poll, 5000);
        return () => {
            mounted = false;
            clearInterval(id);
        };
    }, [publicClient, isE2EMock]);

    if (available === null || available === true) return null;

    return (
        // Opaque `bg-canvas` rather than a `bg-warning/N` tint: the banner is
        // `fixed`, so a translucent fill would composite over whatever scrolls
        // beneath it. The status is carried by the ochre rule and the `-fg`
        // text channel, both measured against canvas (DESIGN_TOKENS §1).
        <div className="fixed left-0 right-0 top-16 z-50 bg-canvas border-y border-warning text-warning-fg text-sm py-2 text-center">
            RPC unreachable — on-chain queries are disabled until your node is available.
        </div>
    );
}

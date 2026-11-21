"use client";

/**
 * useCheckedRelay — the relays a wallet can send batch-path acts through,
 * each checked against the chain.
 *
 * A relay is found two ways, and only these: the URL the wallet's own
 * setting names (`readRelaySetting`), and the relay each named party's
 * member profile lists among its services (`profileRelayUrl`, read through
 * MembersRegistry and IPFS at the time of the read). No relay is bundled.
 * Each is checked (`checkRelay`): the chain id, verifier address and program
 * key its `/status` reports are compared with the connected chain's id, the
 * deployment's `FigaroBatchVerifier` and `FigaroBatchVerifier.programVKey()`,
 * and this page's origin must be among those it lets submit from a browser.
 *
 * Which relay the acts go to is never picked silently among several: the
 * one the wallet's setting names, when it passes; else the only one that
 * passes; else the one the wallet's holder chose among those that pass. A
 * relay that fails is never offered; its reason is kept so a page can state
 * it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import { profileRelayUrl } from "@figaro-protocol/sdk";
import { getBatchVerifier } from "@/lib/core/contracts";
import {
    checkRelay,
    readProgramVKey,
    readRelaySetting,
    writeRelaySetting,
    type RelayCheck,
} from "@/lib/core/relayTransport";
import type { KnownRelay } from "@/lib/core/useRelayActions";
import { profileReaderForChain } from "@/lib/registries/profileFetcher";
import { ABSENT, PENDING, present, type NetworkRead } from "@/lib/shared/networkRead";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";

/** The checked relays: every candidate's verdict, in the order tried (the
 *  setting first, then the parties' profiles); those that passed; and the
 *  one the acts go to, null while several pass and none is chosen. */
export interface CheckedRelays {
    relay: KnownRelay | null;
    passing: KnownRelay[];
    checks: RelayCheck[];
}

/** Every candidate relay URL, each once: the setting, then each party's. */
async function candidateUrls(
    setting: string | null,
    parties: readonly `0x${string}`[],
    readProfile: ReturnType<typeof profileReaderForChain>,
): Promise<string[]> {
    const urls: string[] = setting ? [setting] : [];
    for (const party of parties) {
        let url: string | null = null;
        try {
            const profile = await readProfile(party);
            url = profile ? profileRelayUrl(profile) : null;
        } catch {
            url = null;
        }
        if (url && !urls.includes(url)) urls.push(url);
    }
    return urls;
}

/** The relay the acts go to among those that passed, never one picked in
 *  silence: the setting's, else the only one, else the holder's choice. */
export function relayInUse(passing: readonly KnownRelay[], setting: string | null, chosen: string | null): KnownRelay | null {
    const named = (url: string | null) => (url ? passing.find((r) => r.url === url) ?? null : null);
    return named(setting) ?? (passing.length === 1 ? passing[0] : named(chosen));
}

/**
 * The relays for a trade among `parties`, checked. `pending` while the reads
 * run; `absent` when the deployment names no batch verifier or the
 * verifier's key cannot be read; `present` otherwise. Not `enabled`, nothing
 * is read and the read stays pending. `setSetting` keeps a URL as this
 * browser's setting and checks again; `choose` names the relay the acts go
 * to among those that passed.
 */
export function useCheckedRelay(parties: readonly `0x${string}`[], enabled = true): {
    read: NetworkRead<CheckedRelays>;
    setting: string | null;
    setSetting: (url: string) => boolean;
    choose: (url: string) => void;
} {
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const [setting, setSettingState] = useState<string | null>(() => readRelaySetting());
    const [chosen, setChosen] = useState<string | null>(null);
    const [checked, setChecked] = useState<NetworkRead<{ passing: KnownRelay[]; checks: RelayCheck[] }>>(PENDING);
    const partiesKey = parties.map((p) => p.toLowerCase()).join(",");
    const partyList = useMemo(
        () => (partiesKey ? partiesKey.split(",") : []) as `0x${string}`[],
        [partiesKey],
    );

    // A new input reads as pending, set during render on the render it
    // changes (`useDepsChanged`); with no verifier there is nothing to read.
    const inputsChanged = useDepsChanged([!!publicClient, chainId, setting, partyList, enabled]);
    if (inputsChanged) setChecked(enabled && publicClient && !getBatchVerifier() ? ABSENT : PENDING);
    useEffect(() => {
        const verifier = getBatchVerifier();
        if (!enabled || !publicClient || !verifier) return;
        let canceled = false;
        void (async () => {
            let programVKey: `0x${string}`;
            try {
                programVKey = await readProgramVKey(publicClient);
            } catch {
                if (!canceled) setChecked(ABSENT);
                return;
            }
            const pageOrigin = typeof window === "undefined" ? undefined : window.location.origin;
            const urls = await candidateUrls(setting, partyList, profileReaderForChain(publicClient, chainId));
            const checks: RelayCheck[] = [];
            for (const url of urls) {
                checks.push(await checkRelay(url, { chainId, batchVerifier: verifier, programVKey, pageOrigin }));
            }
            const passing = checks
                .filter((c): c is Extract<RelayCheck, { verdict: "passes" }> => c.verdict === "passes")
                .map((c) => ({ url: c.url, client: c.client }));
            if (!canceled) setChecked(present({ passing, checks }));
        })();
        return () => { canceled = true; };
    }, [publicClient, chainId, setting, partyList, enabled]);

    const read: NetworkRead<CheckedRelays> = useMemo(
        () => checked.status === "present"
            ? present({ ...checked.value, relay: relayInUse(checked.value.passing, setting, chosen) })
            : checked,
        [checked, setting, chosen],
    );

    const setSetting = useCallback((url: string) => {
        const kept = writeRelaySetting(url);
        if (kept) setSettingState(readRelaySetting());
        return kept;
    }, []);

    return { read, setting, setSetting, choose: setChosen };
}

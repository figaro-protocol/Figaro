"use client";

import { useCallback, useEffect } from "react";
import { useConnect, useAccount, useChainId } from "wagmi";
import { TEST_HELPERS_ENABLED, windowSafe } from "@/lib/core/testHelpers";
import { useOrderStore } from "@/lib/core/store";
import { calculateBonds } from "@figaro/core";
import { bytesToHex } from "@/lib/shared/evm";

type MockStoredOrder = {
    id: string;
    processId: string;
    buyer: string;
    seller: string;
    cumulativeValue: string;
    payment: string;
    state: number;
    sellerBond: string;
    buyerBond: string;
    parentOrderIds: number[];
    timestamp: number;
    permit?: unknown;
    origin: string;
    destination: string;
};

type MockStoredProcess = {
    id: string;
    orderIds: string[];
    buyer: string;
    totalValue: string;
    totalPayment: string;
    resolved: boolean;
    createdAt: number;
    ipfs?: string;
};

type MockStoreState = {
    orders: Record<string, MockStoredOrder>;
    processes: Record<string, MockStoredProcess>;
    currentProcessId: string;
};

type MockApi = {
    createOrder: (opts: {
        counterparty?: string;
        payment?: string;
        origin?: string;
        destination?: string;
        currency?: string;
    }) => Promise<{ processId: string; orderId: number; ipfsHash: string | null }>;
    subOrder: (opts: {
        processId: string;
        seller?: string;
        payment?: string;
        parentOrderIds?: number[];
        origin?: string;
        destination?: string;
    }) => Promise<{ processId: string; orderId: number; ipfsHash: string | null }>;
};

function getPendingPermit() {
    return windowSafe()?.__FIGARO_PENDING_PERMIT__;
}

function isMockStoreState(value: unknown): value is MockStoreState {
    if (!value || typeof value !== "object") return false;
    return "orders" in value && "processes" in value && "currentProcessId" in value;
}

// Dev-only client initializer: clears figaro storage in `?e2e=mock` and
// registers browser-side testing helpers. Exposes `window.__FIGARO_MOCK_API__`
// with `createOrder` / `subOrder` helpers which write a minimal
// `figaro-storage` entry and optionally persist the payload to a local IPFS
// daemon (Docker). This single component consolidates both behaviors.
//
// Also handles `?e2e=devnet`: auto-connects the injected wallet provider so
// Playwright devnet tests have a connected address without a MetaMask popup.
export default function ClientInit() {
    // Used for devnet auto-connect (injected provider from Playwright addInitScript)
    const { connect, connectors } = useConnect();
    const { isConnected, address } = useAccount();
    const chainId = useChainId();

    const findInjectedConnector = useCallback(() =>
        connectors.find((connector) => {
            const candidate = connector as typeof connector & { type?: string };
            return (
                candidate.id === 'injected' ||
                candidate.id === 'metaMask' ||
                candidate.id === 'io.metamask' ||
                candidate.type === 'injected'
            );
        }), [connectors]);

    // Raw `?e2e=` param — deliberately NOT getE2EModeFromSearchParams, which
    // collapses any non-exact value (e.g. `devnet-share`) to null.
    // `isDevnetMode` below recognises the whole `devnet-` family, so it needs
    // the raw value; otherwise `?e2e=devnet-share` (commitment-share) never
    // auto-connects and `window.__FIGARO_WALLET__` is never published.
    const getE2EMode = useCallback(() => {
        if (typeof window === 'undefined') return null;
        return new URLSearchParams(window.location.search).get('e2e');
    }, []);

    const isDevnetMode = useCallback((mode: string | null) => {
        return mode === 'devnet' || (typeof mode === 'string' && mode.startsWith('devnet-'));
    }, []);

    useEffect(() => {
        try {
            const e2eMode = getE2EMode();
            const isMock = e2eMode === "mock";

            // Only enable mock client init when explicit test helpers flag is set
            if (!TEST_HELPERS_ENABLED) return;

            if (isMock) {
                // nothing to clear — no localStorage persistence in singleton mode
            }

            if (!isMock) return;

            // Avoid overwriting if another script already set it
            const _win = windowSafe();
            if (_win && typeof _win.__FIGARO_MOCK_API__ === 'object') return;

            async function tryIpfsAdd(json: unknown) {
                try {
                    const body = new FormData();
                    const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
                    body.append('file', blob, 'order.json');
                    const res = await fetch('http://127.0.0.1:5001/api/v0/add', { method: 'POST', body });
                    if (!res.ok) return null;
                    const text = await res.text();
                    const lines = text.trim().split('\n').filter(Boolean);
                    const last = lines[lines.length - 1];
                    const parsed = JSON.parse(last);
                    return parsed?.Hash || null;
                } catch (e) {
                    return null;
                }
            }

            if (_win) _win.__FIGARO_MOCK_API__ = {
                createOrder: async (opts: { counterparty?: string; payment?: string; origin?: string; destination?: string; currency?: string }) => {
                    const paymentStr = opts?.payment || '0';
                    const paymentFloat = Number(paymentStr || '0');
                    const paymentWei = BigInt(Math.floor(paymentFloat * 1e18));

                    const processId = `0x${bytesToHex(new TextEncoder().encode(`proc-${Date.now()}`)).slice(0, 64)}`;
                    const orderId = Date.now();

                    const orders: Record<string, MockStoredOrder> = {};
                    orders[orderId.toString()] = {
                        id: orderId.toString(),
                        processId,
                        buyer: '',
                        seller: opts?.counterparty || '',
                        cumulativeValue: paymentWei.toString(),
                        payment: paymentWei.toString(),
                        state: 0,
                        sellerBond: calculateBonds(paymentWei, paymentWei).sellerBond.toString(),
                        buyerBond: calculateBonds(paymentWei, paymentWei).buyerBond.toString(),
                        parentOrderIds: [],
                        timestamp: Date.now(),
                        // attach any pending mock permit blob provided by E2E helpers
                        permit: getPendingPermit() || undefined,
                        origin: opts?.origin || '',
                        destination: opts?.destination || '',
                    };

                    const processes: Record<string, MockStoredProcess> = {};
                    processes[processId] = {
                        id: processId,
                        orderIds: [orderId.toString()],
                        buyer: '',
                        totalValue: paymentWei.toString(),
                        totalPayment: paymentWei.toString(),
                        resolved: false,
                        createdAt: Date.now(),
                    };

                    const toStore: { state: MockStoreState } = { state: { orders, processes, currentProcessId: processId } };
                    const ipfsHash = await tryIpfsAdd(toStore);
                    if (ipfsHash) {
                        toStore.state.processes[processId].ipfs = ipfsHash;
                    }

                    try {
                        localStorage.setItem('figaro-storage', JSON.stringify(toStore));
                    } catch (e) { }

                    // Keep mock behavior limited to writing `figaro-storage` (no in-memory mutations)

                    return { processId, orderId, ipfsHash };
                },

                subOrder: async (opts: { processId: string; seller?: string; payment?: string; parentOrderIds?: number[]; origin?: string; destination?: string }) => {
                    const paymentStr = opts?.payment || '0';
                    const paymentFloat = Number(paymentStr || '0');
                    const paymentWei = BigInt(Math.floor(paymentFloat * 1e18));
                    const orderId = Date.now();

                    let current: MockStoreState | null = null;
                    try {
                        const raw = localStorage.getItem('figaro-storage');
                        if (raw) {
                            const parsed = JSON.parse(raw) as MockStoreState | { state?: unknown };
                            current = isMockStoreState(parsed)
                                ? parsed
                                : isMockStoreState(parsed.state)
                                    ? parsed.state
                                    : null;
                        }
                    } catch (e) { /* ignore */ }

                    const processId = opts?.processId || `0x${bytesToHex(new TextEncoder().encode(`proc-${Date.now()}`)).slice(0, 64)}`;

                    const order = {
                        id: orderId.toString(),
                        processId,
                        buyer: '',
                        seller: opts?.seller || '',
                        cumulativeValue: paymentWei.toString(),
                        payment: paymentWei.toString(),
                        state: 0,
                        sellerBond: calculateBonds(paymentWei, paymentWei).sellerBond.toString(),
                        buyerBond: calculateBonds(paymentWei, paymentWei).buyerBond.toString(),
                        parentOrderIds: opts?.parentOrderIds || [],
                        timestamp: Date.now(),
                        // attach any pending mock permit blob provided by E2E helpers
                        permit: getPendingPermit() || undefined,
                        origin: opts?.origin || '',
                        destination: opts?.destination || '',
                    };

                    if (!current) {
                        const orders: Record<string, MockStoredOrder> = {};
                        orders[order.id] = order;
                        const processes: Record<string, MockStoredProcess> = {};
                        processes[processId] = {
                            id: processId,
                            orderIds: [order.id],
                            buyer: '',
                            totalValue: paymentWei.toString(),
                            totalPayment: paymentWei.toString(),
                            resolved: false,
                            createdAt: Date.now(),
                        };
                        current = { orders, processes, currentProcessId: processId };
                    } else {
                        current.orders = current.orders || {};
                        current.processes = current.processes || {};
                        current.orders[order.id] = order;
                        current.processes[processId] = current.processes[processId] || { id: processId, orderIds: [], totalValue: '0', totalPayment: '0', resolved: false, createdAt: Date.now() };
                        current.processes[processId].orderIds.push(order.id);
                    }

                    const toStore = { state: current };
                    const ipfsHash = await tryIpfsAdd(toStore);
                    if (ipfsHash) {
                        toStore.state.processes[processId].ipfs = ipfsHash;
                    }

                    try {
                        localStorage.setItem('figaro-storage', JSON.stringify(toStore));
                    } catch (e) { }

                    return { processId, orderId, ipfsHash };
                }
            } satisfies MockApi;
        } catch (e) {
            // swallow any client init errors in production
            // eslint-disable-next-line no-console
            console.warn('ClientInit mock API setup failed', e);
        }
    }, [getE2EMode]);

    // Devnet auto-connect: when the Playwright injector sets window.ethereum,
    // connect the injected wagmi connector so the app has an address without
    // the user clicking the RainbowKit ConnectButton.
    //
    // Dependency on `connectors`: wagmi v2 adds EIP-6963 providers AFTER mount
    // via `eip6963:announceProvider`. The connectors array changes when discovery
    // completes, re-triggering this effect with the newly-registered connector.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (isConnected) return; // already have an address — nothing to do
        const e2eMode = getE2EMode();
        if (!isDevnetMode(e2eMode)) return;

        try {
            window.dispatchEvent(new Event('eip6963:requestProvider'));
        } catch {
            // noop — best-effort provider announcement request for devnet tests
        }

        try {
            const provider = (window as typeof window & {
                ethereum?: { request?: (args: { method: string }) => Promise<unknown> };
            }).ethereum;
            void provider?.request?.({ method: 'eth_requestAccounts' });
        } catch {
            // noop — injected provider is optional until discovery completes
        }

        // Match any injected-style connector wagmi may have registered:
        //  - legacy window.ethereum:        id='injected' or type='injected'
        //  - RainbowKit MetaMask wallet:     id='metaMask'
        //  - EIP-6963 (our rdns):            id='io.metamask'
        const injectedConnector = findInjectedConnector();
        if (injectedConnector) {
            connect({ connector: injectedConnector });
        }
        // Re-run whenever connectors changes so we catch late EIP-6963 discovery
    }, [connectors, isConnected, connect, findInjectedConnector, getE2EMode, isDevnetMode]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const e2eMode = getE2EMode();
        if (!isDevnetMode(e2eMode)) return;

        const devnetWindow = window as typeof window & {
            __FIGARO_DEVNET_CONNECT__?: () => void;
            __FIGARO_SET_VIEWED_PROCESS_ID__?: (processId: string | null) => void;
        };

        devnetWindow.__FIGARO_DEVNET_CONNECT__ = () => {
            const injectedConnector = findInjectedConnector();
            if (injectedConnector) {
                connect({ connector: injectedConnector });
            }
        };

        devnetWindow.__FIGARO_SET_VIEWED_PROCESS_ID__ = (processId: string | null) => {
            const store = useOrderStore.getState();
            store.setViewedProcessId(processId);
            store.bumpProcessReload();
        };

        return () => {
            delete devnetWindow.__FIGARO_DEVNET_CONNECT__;
            delete devnetWindow.__FIGARO_SET_VIEWED_PROCESS_ID__;
        };
    }, [connect, findInjectedConnector, getE2EMode, isDevnetMode]);

    // Devnet: mirror wagmi's connection state onto `window.__FIGARO_WALLET__`
    // so Playwright waits on the wallet via a DOM-free, page-agnostic signal
    // — no header `wallet-balance` scrape. The single source of truth for
    // "wallet ready" in devnet specs (see test-helpers `waitForWalletConnected`).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!isDevnetMode(getE2EMode())) return;
        window.__FIGARO_WALLET__ = {
            isConnected,
            address: address ?? null,
            chainId,
        };
    }, [isConnected, address, chainId, getE2EMode, isDevnetMode]);

    return null;
}
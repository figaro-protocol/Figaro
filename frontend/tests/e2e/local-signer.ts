/**
 * The local-key signer bridge — the injected e2e wallet's signing path for
 * accounts Anvil does NOT hold.
 *
 * `inject-ethereum-multi.js` answers eth_accounts / chain queries in the
 * page and forwards everything else to the node — which works on Anvil
 * because its accounts are unlocked. Two smokes need keys the node has never
 * seen: the XMTP relay smoke (device-unique identities on a public XMTP
 * network) and the Sepolia smoke (nobody signs for you on a public chain).
 * For those the fixture consults `window.__FIGARO_LOCAL_SIGN__` — a
 * `context.exposeFunction` handler that signs in Node with viem accounts —
 * and `window.__FIGARO_LOCAL_ACCOUNTS__`, the addresses it may sign for.
 * The devnet suite sets neither global; the bridge never fires there.
 *
 * ONE implementation for both smokes; the chain + RPC are parameters.
 */
import type { BrowserContext } from '@playwright/test';
import { createWalletClient, http, type Chain, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

export type LocalSignHandler = (method: string, params: unknown[]) => Promise<string>;

/** Signs personal_sign / eth_sign / eth_signTypedData(_v4) with the matching
 *  local account, and SENDS eth_sendTransaction as a signed raw transaction
 *  through `rpcUrl` (the receipt hash returns to the page as any wallet's
 *  would). Unknown accounts and methods throw — silence would let a wrong
 *  signer pass unnoticed. */
export function makeLocalSignHandler(accounts: PrivateKeyAccount[], chain: Chain, rpcUrl: string): LocalSignHandler {
    const byAddress = new Map(accounts.map((a) => [a.address.toLowerCase(), a]));
    const resolve = (addr: unknown): PrivateKeyAccount => {
        const account = byAddress.get(String(addr).toLowerCase());
        if (!account) throw new Error(`local signer bridge: unknown account ${String(addr)}`);
        return account;
    };
    return async (method, params) => {
        if (method === 'personal_sign' || method === 'eth_sign') {
            // personal_sign: [data, address]; eth_sign: [address, data].
            const [data, addr] = method === 'personal_sign' ? [params[0], params[1]] : [params[1], params[0]];
            const message = typeof data === 'string' && data.startsWith('0x') ? { raw: data as Hex } : String(data);
            return resolve(addr).signMessage({ message });
        }
        if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
            const [addr, json] = params as [string, string];
            const typed = typeof json === 'string' ? JSON.parse(json) : json;
            return resolve(addr).signTypedData(typed);
        }
        if (method === 'eth_sendTransaction') {
            const tx = params[0] as { from: string; to?: Hex; data?: Hex; value?: Hex; gas?: Hex };
            const account = resolve(tx.from);
            const client = createWalletClient({ account, chain, transport: http(rpcUrl) });
            return client.sendTransaction({
                to: tx.to,
                data: tx.data,
                value: tx.value ? BigInt(tx.value) : undefined,
                gas: tx.gas ? BigInt(tx.gas) : undefined,
            });
        }
        throw new Error(`local signer bridge: unhandled method ${method}`);
    };
}

/** Wire a browser context to the bridge: expose the Node-side handler,
 *  announce the signable addresses, and (for a non-Anvil chain) tell the
 *  injected wallet which chain/RPC/default account it speaks for. Must run
 *  BEFORE the wallet fixture's own init script for a fresh page. */
export async function attachLocalSigner(
    ctx: BrowserContext,
    opts: {
        accounts: PrivateKeyAccount[];
        chain: Chain;
        rpcUrl: string;
        defaultAccount?: `0x${string}`;
    },
): Promise<void> {
    await ctx.exposeFunction('__FIGARO_LOCAL_SIGN__', makeLocalSignHandler(opts.accounts, opts.chain, opts.rpcUrl));
    const cfg = {
        addrs: opts.accounts.map((a) => a.address.toLowerCase()),
        chain: {
            chainIdHex: `0x${opts.chain.id.toString(16)}`,
            networkVersion: String(opts.chain.id),
            rpcUrl: opts.rpcUrl,
            defaultAccount: opts.defaultAccount ?? opts.accounts[0]?.address,
        },
    };
    await ctx.addInitScript((c: typeof cfg) => {
        (window as unknown as { __FIGARO_LOCAL_ACCOUNTS__: string[] }).__FIGARO_LOCAL_ACCOUNTS__ = c.addrs;
        (window as unknown as { __FIGARO_E2E_CHAIN__: unknown }).__FIGARO_E2E_CHAIN__ = c.chain;
    }, cfg);
}

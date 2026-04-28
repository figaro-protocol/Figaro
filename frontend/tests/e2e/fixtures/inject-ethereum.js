/**
 * Playwright addInitScript: injects a full EIP-1193 window.ethereum provider
 * that forwards all JSON-RPC calls to Anvil via the Next.js /rpc proxy.
 *
 * Anvil's default unlocked account[0] is used:
 *   address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 *   private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *
 * Because we proxy through /rpc (same-origin), there are no CORS issues.
 * Anvil automatically signs eth_sendTransaction for its unlocked accounts,
 * meaning no private key handling is needed in the browser.
 *
 * This file is injected as a raw script via page.addInitScript({ path: ... })
 * so it MUST NOT use import/export or any Node.js APIs.
 */
(function () {
    'use strict';

    const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    const CHAIN_ID_HEX = '0x7a69'; // 31337 decimal
    const RPC_URL = '/rpc';

    let _reqId = 1;

    async function rpcCall(method, params) {
        const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: _reqId++,
                method: method,
                params: params || [],
            }),
        });
        const data = await response.json();
        if (data.error) {
            const err = new Error(data.error.message || 'RPC error');
            err.code = data.error.code;
            throw err;
        }
        return data.result;
    }

    const _listeners = {};

    const provider = {
        isMetaMask: true,
        isConnected: function () { return true; },
        selectedAddress: ACCOUNT,
        chainId: CHAIN_ID_HEX,
        networkVersion: '31337',

        request: async function (args) {
            const method = args.method;
            const params = args.params;

            // ── Identity / accounts ──────────────────────────────────────
            if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return [ACCOUNT];
            }

            // ── Chain ────────────────────────────────────────────────────
            if (method === 'eth_chainId') return CHAIN_ID_HEX;
            if (method === 'net_version') return '31337';

            // ── Wallet meta ───────────────────────────────────────────────
            if (method === 'wallet_switchEthereumChain') {
                const targetChain = params && params[0] && params[0].chainId;
                if (targetChain) {
                    const targetId = parseInt(targetChain, 16);
                    if (targetId !== 31337) {
                        throw Object.assign(
                            new Error('wallet_switchEthereumChain: unsupported chain ' + targetChain),
                            { code: 4902 }
                        );
                    }
                }
                (_listeners['chainChanged'] || []).forEach(function (h) { h(CHAIN_ID_HEX); });
                return null;
            }
            if (method === 'wallet_addEthereumChain') return null;
            if (method === 'wallet_getPermissions' || method === 'wallet_requestPermissions') {
                return [{ parentCapability: 'eth_accounts' }];
            }

            // ── Everything else → Anvil via /rpc  ────────────────────────
            // Anvil handles signing for unlocked accounts, so eth_sendTransaction,
            // personal_sign, eth_signTypedData_v4, etc. all work without a private key.
            return rpcCall(method, params);
        },

        on: function (event, handler) {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(handler);
        },
        removeListener: function (event, handler) {
            if (_listeners[event]) {
                _listeners[event] = _listeners[event].filter(function (h) { return h !== handler; });
            }
        },
        off: function (event, handler) {
            this.removeListener(event, handler);
        },
        // Stub emit so internal wagmi compatibility shims work
        emit: function (event) {
            var args = Array.prototype.slice.call(arguments, 1);
            (_listeners[event] || []).forEach(function (h) { h.apply(null, args); });
        },
    };

    // ── Attach to window ──────────────────────────────────────────────────
    window.ethereum = provider;

    // ── EIP-6963: announce provider so wagmi v2's injected connector picks it up ──
    var providerDetail = Object.freeze({
        info: Object.freeze({
            rdns: 'io.metamask',
            name: 'Anvil Test Wallet',
            icon: '',
            uuid: 'e2e-anvil-test',
        }),
        provider: provider,
    });

    function announceProvider() {
        window.dispatchEvent(
            new CustomEvent('eip6963:announceProvider', { detail: providerDetail })
        );
    }

    // Respond to any future requestProvider events (wagmi dispatches this on init)
    window.addEventListener('eip6963:requestProvider', announceProvider);
    // Also announce immediately in case the page is already listening
    announceProvider();
})();

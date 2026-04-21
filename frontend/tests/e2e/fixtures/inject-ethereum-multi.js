/**
 * Playwright addInitScript: multi-account EIP-1193 provider for Anvil.
 *
 * Extends inject-ethereum.js with dynamic account switching.  Tests can call
 *   window.__FIGARO_SWITCH_ACCOUNT__('0xADDRESS')
 * to change the active wallet between operations.  wagmi is notified via the
 * EIP-1193 `accountsChanged` event so it re-reads the address without a full reload.
 *
 * Standard Anvil test accounts (derived from test mnemonic):
 *   [0] 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  ← buyer (default)
 *   [1] 0x70997970C51812dc3A010C7d01b50e0d17dc79C8  ← seller1
 *   [2] 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  ← seller2
 *   [3] 0x90F79bf6EB2c4f870365E785982E1f101E93b906  ← seller3
 *   [4] 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65  ← seller4
 *
 * All accounts are unlocked on Anvil so eth_sendTransaction works without
 * private-key handling in the browser.
 */
(function () {
    'use strict';

    let ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
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
        get selectedAddress() { return ACCOUNT; },
        chainId: CHAIN_ID_HEX,
        networkVersion: '31337',

        request: async function (args) {
            const method = args.method;
            const params = args.params;

            if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
                return [ACCOUNT];
            }
            if (method === 'eth_chainId') return CHAIN_ID_HEX;
            if (method === 'net_version') return '31337';
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
        off: function (event, handler) { this.removeListener(event, handler); },
        emit: function (event) {
            var args = Array.prototype.slice.call(arguments, 1);
            (_listeners[event] || []).forEach(function (h) { h.apply(null, args); });
        },
    };

    window.ethereum = provider;

    // EIP-6963 announcement
    var providerDetail = Object.freeze({
        info: Object.freeze({ rdns: 'io.metamask', name: 'Anvil Test Wallet', icon: '', uuid: 'e2e-anvil-test' }),
        provider: provider,
    });
    function announceProvider() {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: providerDetail }));
    }
    window.addEventListener('eip6963:requestProvider', announceProvider);
    announceProvider();

    /**
     * Switch the active account.  wagmi subscribes to 'accountsChanged' so it
     * should pick up the new address without a full page reload.
     *
     * @param {string} address  Checksummed address (e.g. from ANVIL_ACCOUNTS)
     */
    window.__FIGARO_SWITCH_ACCOUNT__ = function (address) {
        ACCOUNT = address;
        (_listeners['accountsChanged'] || []).forEach(function (h) { h([address]); });
        // Re-announce EIP-6963 so wagmi's injected connector sees the new account
        announceProvider();
    };

    /**
     * Return the currently active account address.
     */
    window.__FIGARO_GET_ACCOUNT__ = function () {
        return ACCOUNT;
    };
})();

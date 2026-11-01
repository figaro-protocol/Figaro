/**
 * Preloaded (NODE_OPTIONS --import) into every node process the sandbox
 * wrapper launches: routes node's fetch through the HTTP(S)_PROXY the
 * launcher set — node's undici does not honor proxy env on its own, and
 * inside the sandbox the proxy is the only way out.
 *
 * The connect to the proxy retries an EPERM: the macOS kernel now and then
 * refuses a connect to the one port the profile opens (`remote ip
 * "localhost:<port>"` refuses about one connect in five hundred, where
 * `"*:<port>"` and a permissive profile refuse none), and the profile has no
 * narrower match for 127.0.0.1 to put in its place. Only the proxy's own
 * connect retries, a bounded number of times, and only on EPERM; a refusal
 * that persists still fails the request.
 */

import { setGlobalDispatcher, EnvHttpProxyAgent, Pool } from "undici";

const CONNECT_ATTEMPTS = 5;
const CONNECT_RETRY_MS = 25;

function retryingConnect(connect) {
    return function connectToProxy(opts, callback) {
        const attempt = (n) => connect(opts, (err, socket) => {
            if (err && err.code === "EPERM" && n < CONNECT_ATTEMPTS) {
                setTimeout(() => attempt(n + 1), CONNECT_RETRY_MS * n);
                return;
            }
            callback(err, socket);
        });
        attempt(1);
    };
}

setGlobalDispatcher(new EnvHttpProxyAgent({
    clientFactory: (origin, options) => new Pool(origin, { ...options, connect: retryingConnect(options.connect) }),
}));

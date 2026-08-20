/**
 * Preloaded (NODE_OPTIONS --import) into every node process the sandbox
 * wrapper launches: routes node's fetch through the HTTP(S)_PROXY the
 * launcher set — node's undici does not honor proxy env on its own, and
 * inside the sandbox the proxy is the only way out.
 */

import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

setGlobalDispatcher(new EnvHttpProxyAgent());

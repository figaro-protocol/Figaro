/**
 * The egress proxy — the policy's `egress` allowlist, enforced.
 *
 * OS sandboxes cannot filter outbound traffic by hostname (DNS resolves
 * inside the sandbox), so the wrapper denies ALL network except this proxy's
 * loopback port and makes this proxy the only way out. The proxy runs OUTSIDE
 * the sandbox, reads the same policy file the signer owns, and forwards only
 * to the origins the policy names — host AND port, and for plain HTTP the
 * scheme too: HTTPS via CONNECT tunnels, plain HTTP via absolute-URI
 * forwarding. Every refusal is auditable on stderr, and no request can crash
 * the proxy: a refusal is an answer, never a thrown error.
 *
 * The proxy also holds the agent's RPC endpoints (`rpcUpstreams`). A provider
 * URL carries its key in the URL itself (`…/v3/<key>`), so an endpoint never
 * enters the sandbox: the agent reads `http://127.0.0.1:<port>/rpc/<n>` in its
 * place, and the proxy relays each JSON-RPC POST on that path to the n-th
 * keyed URL. The key stays on this side of the wall.
 */

import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";

const DEFAULT_PORT = { "http:": 80, "https:": 443, "ws:": 80, "wss:": 443 };

/**
 * The allowlist: one `{ protocol, host, port }` per policy origin (+ the RPC
 * origin). An origin without an explicit port takes its scheme's default. A
 * bare entry that is not an http(s)/ws(s) URL names a host reached over TLS:
 * `host` or `host:port`, port 443 unless given.
 */
export function egressOrigins(policy) {
    const origins = [];
    for (const origin of [...(policy.egress ?? []), policy.rpcUrl]) {
        if (!origin) continue;
        let url = null;
        try { url = new URL(origin); } catch { /* bare host */ }
        if (url && url.protocol in DEFAULT_PORT) {
            origins.push({
                protocol: url.protocol,
                host: url.hostname.toLowerCase(),
                port: Number(url.port || DEFAULT_PORT[url.protocol]),
            });
            continue;
        }
        const { host, port } = splitHostPort(String(origin), 443);
        origins.push({ protocol: "https:", host, port });
    }
    return origins;
}

/** The paths on the proxy's own port that relay JSON-RPC: `/rpc/<n>` to
 *  the n-th of `rpcUpstreams`. */
const RPC_RELAY_PATH = /^\/rpc\/(\d+)$/;

/** The n-th relay's address as the sandboxed agent reads it. */
export function rpcRelayUrl(port, n) {
    return `http://127.0.0.1:${port}/rpc/${n}`;
}

/**
 * An RPC endpoint a relay forwards to, checked against the allowlist: an
 * http(s) URL whose origin the policy names (scheme, host and port). A relay
 * to an origin off the allowlist would be a way out the policy never granted,
 * so it is refused at start, never at the first request.
 */
function rpcRelayUpstream(origins, rpcUpstream) {
    let url;
    try { url = new URL(rpcUpstream); } catch { throw new Error("an RPC endpoint is not a URL"); }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`an RPC endpoint must be an http(s) URL, not ${url.protocol}`);
    }
    const port = Number(url.port || DEFAULT_PORT[url.protocol]);
    if (!originAllowed(origins, { host: url.hostname, port, protocol: url.protocol })) {
        // The origin only: the URL's path may carry the key.
        throw new Error(`the RPC endpoint's origin ${url.protocol}//${url.hostname}:${port} is not on the policy egress allowlist`);
    }
    return url;
}

/** `host:port` / `[v6]:port` / `host` → parts; the port defaults as given. */
export function splitHostPort(authority, defaultPort) {
    const m = /^\[([^\]]+)\](?::(\d+))?$/.exec(authority) ?? /^([^:]+)(?::(\d+))?$/.exec(authority);
    if (!m) return { host: authority.toLowerCase(), port: NaN };
    return { host: m[1].toLowerCase(), port: m[2] === undefined ? defaultPort : Number(m[2]) };
}

/**
 * Pure decision: may the proxy open this connection? A CONNECT tunnel
 * (`protocol` omitted) carries whatever the client speaks inside it, so it
 * needs an origin on the same host and port. Absolute-URI forwarding speaks
 * plain HTTP upstream, so it needs an `http:` origin on the same host and
 * port — a host listed only as `https:` is never reached in the clear.
 */
export function originAllowed(origins, { host, port, protocol }) {
    const h = String(host).toLowerCase();
    return origins.some((o) =>
        o.host === h && o.port === Number(port) && (protocol === undefined || o.protocol === protocol));
}

/** Which relay, if any, is this request addressed to (its n, or -1)?
 *  Origin-form (`POST /rpc/<n>`) when the client talks to the proxy directly, or through a
 *  CONNECT tunnel to the proxy's own port (what the preloaded dispatcher
 *  opens for every target, loopback included); absolute-form
 *  (`POST http://127.0.0.1:<port>/rpc/<n>`) when a client forwards plain
 *  HTTP through HTTP_PROXY. */
function relayIndex(rawUrl, ownPort) {
    let url;
    try { url = new URL(rawUrl, "http://relay.local"); } catch { return -1; }
    if (!rawUrl.startsWith("/")) {
        const toSelf = url.protocol === "http:"
            && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
            && Number(url.port || 80) === ownPort;
        if (!toSelf) return -1;
    }
    const m = RPC_RELAY_PATH.exec(url.pathname);
    return m ? Number(m[1]) : -1;
}

/** Relay one JSON-RPC POST to the keyed upstream. Only the body and its
 *  content headers cross; an error answers 502 and never names the upstream
 *  URL, which carries the key. */
function relayRpc(req, res, upstreamUrl) {
    if (req.method !== "POST") {
        res.writeHead(405, { allow: "POST" }).end("proxy: the RPC relay takes JSON-RPC POSTs\n");
        return;
    }
    const headers = {};
    for (const name of ["content-type", "content-length", "accept"]) {
        if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    }
    const transport = upstreamUrl.protocol === "https:" ? https : http;
    let upstream;
    try {
        upstream = transport.request(upstreamUrl, { method: "POST", headers }, (up) => {
            const back = {};
            for (const name of ["content-type", "content-length"]) {
                if (up.headers[name] !== undefined) back[name] = up.headers[name];
            }
            res.writeHead(up.statusCode ?? 502, back);
            up.pipe(res);
        });
    } catch {
        res.writeHead(502).end("proxy: the RPC upstream did not answer\n");
        return;
    }
    upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end("proxy: the RPC upstream did not answer\n");
    });
    req.pipe(upstream);
}

/**
 * Start the proxy on 127.0.0.1:port. Returns { server, port, close() }.
 * `onDecision` (optional) observes every allow/deny for tests and audit.
 * `rpcUpstreams` (optional) are the RPC endpoints the relay paths forward
 * to, `/rpc/<n>` to the n-th; a relay path past them answers 404. One off the
 * allowlist rejects the start.
 */
export function startEgressProxy({ policy, port, onDecision, rpcUpstreams = [] }) {
    const origins = egressOrigins(policy);
    let upstreamUrls;
    try {
        upstreamUrls = rpcUpstreams.map((u) => rpcRelayUpstream(origins, u));
    } catch (e) {
        return Promise.reject(e);
    }
    const decide = (target, allowed) => {
        if (!allowed) console.error(`egress-proxy: DENY ${target}`);
        onDecision?.({ host: target, allowed });
        return allowed;
    };

    const server = http.createServer((req, res) => {
        const relay = relayIndex(req.url ?? "", server.address().port);
        if (relay >= 0) {
            if (relay >= upstreamUrls.length) {
                res.writeHead(404).end("proxy: no RPC endpoint was given to this proxy for that relay path\n");
                return;
            }
            relayRpc(req, res, upstreamUrls[relay]);
            return;
        }
        // Plain-HTTP forward proxy: absolute `http:` URIs only.
        let target;
        try {
            target = new URL(req.url ?? "");
        } catch {
            res.writeHead(400).end("proxy: absolute-URI requests only\n");
            return;
        }
        if (target.protocol !== "http:") {
            decide(`${target.protocol}//${target.host}`, false);
            res.writeHead(400).end("proxy: only http: is forwarded; reach https: origins through CONNECT\n");
            return;
        }
        const targetPort = Number(target.port || 80);
        if (!decide(`${target.hostname}:${targetPort}`, originAllowed(origins, { host: target.hostname, port: targetPort, protocol: "http:" }))) {
            res.writeHead(403).end("proxy: origin not on the policy egress allowlist\n");
            return;
        }
        let upstream;
        try {
            upstream = http.request(target, {
                method: req.method,
                headers: { ...req.headers, host: target.host },
            }, (up) => {
                res.writeHead(up.statusCode ?? 502, up.headers);
                up.pipe(res);
            });
        } catch {
            res.writeHead(502).end();
            return;
        }
        upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
        req.pipe(upstream);
    });

    // HTTPS: CONNECT tunnels — the proxy sees only host:port, never plaintext.
    server.on("connect", (req, clientSocket, head) => {
        const { host, port: targetPort } = splitHostPort(String(req.url ?? ""), 443);
        // A tunnel to the proxy's own port reaches nothing but this server,
        // whose rules apply inside it; it is how a proxied client reaches the
        // relay path.
        const toSelf = upstreamUrls.length > 0
            && (host === "127.0.0.1" || host === "localhost")
            && targetPort === server.address().port;
        if (!toSelf && (!Number.isInteger(targetPort) || !decide(`${host}:${targetPort}`, originAllowed(origins, { host, port: targetPort })))) {
            clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
            return;
        }
        const upstream = net.connect(targetPort, toSelf ? "127.0.0.1" : host, () => {
            clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            if (head?.length) upstream.write(head);
            upstream.pipe(clientSocket);
            clientSocket.pipe(upstream);
        });
        upstream.on("error", () => clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"));
        clientSocket.on("error", () => upstream.destroy());
    });

    return new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, "127.0.0.1", () => resolve({
            server,
            port: server.address().port,
            close: () => new Promise((r) => server.close(r)),
        }));
    });
}

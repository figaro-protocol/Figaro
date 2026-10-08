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
 */

import * as http from "node:http";
import * as net from "node:net";

const DEFAULT_PORT = { "http:": 80, "https:": 443, "ws:": 80, "wss:": 443 };

/**
 * The allowlist: one `{ protocol, host, port }` per policy origin (+ the RPC
 * origin). An origin without an explicit port takes its scheme's default. A
 * bare entry that is not an http(s)/ws(s) URL names a host reached over TLS:
 * `host` or `host:port`, port 443 unless given.
 */
export function allowedOrigins(policy) {
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

/**
 * Start the proxy on 127.0.0.1:port. Returns { server, port, close() }.
 * `onDecision` (optional) observes every allow/deny for tests and audit.
 */
export function startEgressProxy({ policy, port, onDecision }) {
    const origins = allowedOrigins(policy);
    const decide = (target, allowed) => {
        if (!allowed) console.error(`egress-proxy: DENY ${target}`);
        onDecision?.({ host: target, allowed });
        return allowed;
    };

    const server = http.createServer((req, res) => {
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
        if (!Number.isInteger(targetPort) || !decide(`${host}:${targetPort}`, originAllowed(origins, { host, port: targetPort }))) {
            clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
            return;
        }
        const upstream = net.connect(targetPort, host, () => {
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

/**
 * The egress proxy — the policy's `egress` allowlist, enforced.
 *
 * OS sandboxes cannot filter outbound traffic by hostname (DNS resolves
 * inside the sandbox), so the wrapper denies ALL network except loopback and
 * makes this proxy the only way out. The proxy runs OUTSIDE the sandbox,
 * reads the same policy file the signer owns, and forwards only to hosts the
 * policy names: HTTPS via CONNECT tunnels, plain HTTP via absolute-URI
 * forwarding. Every refusal is auditable on stderr.
 */

import * as http from "node:http";
import * as net from "node:net";

/** Hostname allowlist from the policy's egress origins (+ the RPC origin). */
export function allowedHosts(policy) {
    const hosts = new Set();
    for (const origin of [...(policy.egress ?? []), policy.rpcUrl]) {
        if (!origin) continue;
        try {
            hosts.add(new URL(origin).hostname.toLowerCase());
        } catch {
            // A non-URL origin entry names a bare host.
            hosts.add(String(origin).toLowerCase());
        }
    }
    return hosts;
}

/** Pure decision: may the proxy open a connection to this host? */
export function hostAllowed(hosts, host) {
    return hosts.has(String(host).toLowerCase());
}

/**
 * Start the proxy on 127.0.0.1:port. Returns { server, close() }.
 * `onDecision` (optional) observes every allow/deny for tests and audit.
 */
export function startEgressProxy({ policy, port, onDecision }) {
    const hosts = allowedHosts(policy);
    const decide = (host, allowed) => {
        if (!allowed) console.error(`egress-proxy: DENY ${host}`);
        onDecision?.({ host, allowed });
        return allowed;
    };

    const server = http.createServer((req, res) => {
        // Plain-HTTP forward proxy: absolute-URI requests only.
        let target;
        try {
            target = new URL(req.url ?? "");
        } catch {
            res.writeHead(400).end("proxy: absolute-URI requests only\n");
            return;
        }
        if (!decide(target.hostname, hostAllowed(hosts, target.hostname))) {
            res.writeHead(403).end("proxy: host not on the policy egress allowlist\n");
            return;
        }
        const upstream = http.request(target, {
            method: req.method,
            headers: { ...req.headers, host: target.host },
        }, (up) => {
            res.writeHead(up.statusCode ?? 502, up.headers);
            up.pipe(res);
        });
        upstream.on("error", () => res.writeHead(502).end());
        req.pipe(upstream);
    });

    // HTTPS: CONNECT tunnels — the proxy sees only host:port, never plaintext.
    server.on("connect", (req, clientSocket, head) => {
        const [host, portStr] = String(req.url ?? "").split(":");
        if (!decide(host, hostAllowed(hosts, host))) {
            clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
            return;
        }
        const upstream = net.connect(Number(portStr || 443), host, () => {
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

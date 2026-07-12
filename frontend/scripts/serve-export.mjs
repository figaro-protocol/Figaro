#!/usr/bin/env node
/**
 * serve-export.mjs — a minimal, leak-free static file server for the Next.js
 * static export (`output: 'export'`).
 *
 * Why not `npx serve`: under the full Playwright suite's sustained,
 * heavily-prefetched request load, `serve` (serve-handler) leaks a file
 * descriptor per aborted request and crashes on macOS's per-process fd cap
 * (`kern.maxfilesperproc` = 10240) with an unhandled EMFILE — taking every
 * subsequent test down with CONNECTION_REFUSED. This server destroys the file
 * ReadStream the moment the response closes (client abort included), so fds are
 * released promptly and a request-level error can never crash the process.
 *
 * Clean-URL resolution mirrors what a Next export needs (trailingSlash: false):
 *   /                → index.html
 *   /s/view          → s/view.html          (query string is ignored for files)
 *   /_next/static/…  → served verbatim
 *   unknown          → 404.html with status 404
 *
 * Usage: SERVE_DIR=<dir> PORT=<port> node scripts/serve-export.mjs
 *        (or: node scripts/serve-export.mjs <dir> <port>)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || process.env.SERVE_DIR || "out");
const PORT = Number(process.argv[3] || process.env.PORT || 3000);

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".wasm": "application/wasm",
};

// Resolve a request pathname to an on-disk file, or null if none exists.
// Order: exact file → `.html` → `/index.html`.
function resolveFile(pathname) {
    let rel;
    try {
        rel = decodeURIComponent(pathname);
    } catch {
        return null;
    }
    // Normalize and confine to ROOT (block path traversal).
    const abs = path.normalize(path.join(ROOT, rel));
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;

    const candidates =
        rel === "/" || rel === ""
            ? [path.join(ROOT, "index.html")]
            : [abs, abs + ".html", path.join(abs, "index.html")];

    for (const c of candidates) {
        try {
            if (fs.statSync(c).isFile()) return c;
        } catch {
            // not this candidate
        }
    }
    return null;
}

// Stream a file to the response, releasing the fd on any close/error.
function sendFile(req, res, file, status) {
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(status, { "Content-Type": type });
    const stream = fs.createReadStream(file);
    const cleanup = () => stream.destroy();
    // Client aborted / response finished → drop the fd immediately.
    res.on("close", cleanup);
    stream.on("error", () => {
        cleanup();
        if (!res.headersSent) res.writeHead(500);
        res.end();
    });
    stream.pipe(res);
}

const server = http.createServer((req, res) => {
    const pathname = (req.url || "/").split("?")[0];
    const file = resolveFile(pathname);
    if (file) {
        sendFile(req, res, file, 200);
        return;
    }
    const notFound = path.join(ROOT, "404.html");
    if (fs.existsSync(notFound)) {
        sendFile(req, res, notFound, 404);
    } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
    }
});

// A stray socket/stream error must never take the process down.
server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, () => {
    console.log(`serve-export: hosting ${ROOT} at http://127.0.0.1:${PORT}`);
});

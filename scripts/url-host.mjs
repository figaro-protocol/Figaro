#!/usr/bin/env node
// The printable part of a URL: its scheme and host, never its path, query or
// credentials. A keyed RPC URL carries its key in the path or the query, and
// the deploy and seeding logs are kept, so these scripts print a URL only
// through this function. A URL meant for readers, such as the keyless
// PUBLIC_RPC_URL a deployment record carries, may be printed whole.
//
//   urlHost("https://eth-sepolia.example.io/v2/KEY")  → "https://eth-sepolia.example.io"
//   withUrlHosts(text)  → text with every URL in it cut to its scheme and host
//
// From a shell script, the URL goes in on standard input, never on the command
// line, and the scheme and host come out on standard output:
//
//   printf '%s' "$RPC_URL" | node scripts/url-host.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The scheme and host of `url` (the port kept, the user and password left
 *  out), or "(an unreadable URL)" when it does not parse. */
export function urlHost(url) {
    try {
        const u = new URL(String(url).trim());
        return `${u.protocol}//${u.host}`;
    } catch {
        return "(an unreadable URL)";
    }
}

/** `text` with every URL in it cut to its scheme and host (`urlHost`), for an
 *  error message that may quote the endpoint it failed on. */
export function withUrlHosts(text) {
    return String(text).replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()]+/gi, (u) => urlHost(u));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.stdout.write(`${urlHost(fs.readFileSync(0, "utf8"))}\n`);
}

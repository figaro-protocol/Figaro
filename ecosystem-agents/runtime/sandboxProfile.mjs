/**
 * sandboxProfile — the launcher's pure decisions, apart from its side effects
 * so the tests drive the same functions the launcher runs.
 *
 *   - which environment variables cross into the sandbox (`scrubEnv`);
 *   - which paths are unreadable by default (`defaultDenyReads`), and how
 *     `--allow-read` opens one of them (`applyAllowReads`);
 *   - the profile text sandbox-exec runs (`renderProfile`): the parameterized
 *     base in sandbox-macos.sb plus one deny rule per unreadable path.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BASE_PROFILE = path.join(__dirname, "sandbox-macos.sb");

// ── Environment ─────────────────────────────────────────────────────────────

/** A variable whose NAME carries any of these is dropped. Deliberately broad:
 *  a secret the scrub misses is a bug, a harmless variable dropped is not. */
export const SECRET_ENV = /KEY|SECRET|TOKEN|JWT|PASS|MNEMONIC|PRIVATE|AUTH|CREDENTIAL|COOKIE|SESSION|SEED/i;

/** A URL path segment shaped like an embedded credential: 20 or more
 *  characters of [A-Za-z0-9_-] holding both a letter and a digit
 *  (`/v2/<key>`, `/v3/<project-id>`, `/<token>/`). */
const KEY_SEGMENT = /^(?=[A-Za-z0-9_-]*[0-9])(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{20,}$/;

/** Every URL-shaped substring of a value (a value may list several). */
const URL_IN_VALUE = /[a-z][a-z0-9+.-]*:\/\/[^\s,;"'<>]+/gi;

/**
 * Does this value carry a credential inside a URL? The rule: any URL in the
 * value with userinfo (`scheme://user:pass@host`), a query parameter whose
 * name is secret-shaped (`?apikey=`, `?token=`), or a path segment shaped
 * like a key (`KEY_SEGMENT`).
 */
export function valueCarriesUrlCredential(value) {
    for (const match of String(value).matchAll(URL_IN_VALUE)) {
        let url;
        try { url = new URL(match[0]); } catch { continue; }
        if (url.username || url.password) return true;
        for (const name of url.searchParams.keys()) if (SECRET_ENV.test(name)) return true;
        for (const segment of url.pathname.split("/")) {
            let decoded = segment;
            try { decoded = decodeURIComponent(segment); } catch { /* keep raw */ }
            if (KEY_SEGMENT.test(decoded)) return true;
        }
    }
    return false;
}

/**
 * The environment the sandboxed child receives: everything except a
 * secret-shaped NAME or a value carrying a URL credential, then `extra` on
 * top. Returns the names dropped too, so the launcher can say which were
 * held back (names only, never values).
 */
export function scrubEnv(env, extra = {}) {
    const kept = {};
    const scrubbed = [];
    for (const [k, v] of Object.entries(env)) {
        if (SECRET_ENV.test(k) || valueCarriesUrlCredential(v ?? "")) { scrubbed.push(k); continue; }
        kept[k] = v;
    }
    return { env: { ...kept, ...extra }, scrubbed: scrubbed.sort() };
}

// ── Unreadable paths ────────────────────────────────────────────────────────

/** The secret paths unreadable unless `--allow-read` opens one, relative to
 *  the home directory: key material, cloud and forge credentials, package
 *  registry tokens, and shell histories (a history holds every secret typed
 *  on a command line). */
export const DEFAULT_DENY_READ = [
    ".figaro-deploy.env",
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    ".config/gcloud",
    ".config/gh",
    ".docker",
    ".kube",
    ".netrc",
    ".git-credentials",
    ".npmrc",
    ".yarnrc.yml",
    ".pypirc",
    ".pgpass",
    ".foundry/keystores",
    ".ethereum/keystore",
    "Library/Ethereum/keystore",
    "Library/Keychains",
    ".zsh_history",
    ".zsh_sessions",
    ".bash_history",
    ".bash_sessions",
    ".sh_history",
    ".local/share/fish",
    ".node_repl_history",
    ".python_history",
    ".psql_history",
    ".mysql_history",
];

/** The kernel matches CANONICAL paths (/var is a symlink to /private/var on
 *  macOS) — an uncanonicalized deny silently matches nothing. A path that
 *  does not exist yet is its nearest existing ancestor's real path plus the
 *  rest, so the rule still holds when it is created. */
export function canonical(p) {
    const resolved = path.resolve(p);
    const rest = [];
    for (let at = resolved; ; at = path.dirname(at)) {
        try { return path.join(fs.realpathSync(at), ...rest); } catch { /* climb */ }
        if (path.dirname(at) === at) return resolved;
        rest.unshift(path.basename(at));
    }
}

/** The default unreadable paths under `home`, canonicalized. */
export function defaultDenyReads(home) {
    const root = canonical(home);
    return DEFAULT_DENY_READ.map((rel) => canonical(path.join(root, rel)));
}

/**
 * Open the defaults `--allow-read` names. Each allow must name a default
 * exactly (after canonicalization); one that names nothing on the list is
 * an error, never a silent no-op.
 */
export function applyAllowReads(denies, allows) {
    const open = new Set(allows.map(canonical));
    const unknown = [...open].filter((p) => !denies.includes(p));
    return { denies: denies.filter((p) => !open.has(p)), unknown };
}

// ── The profile text ────────────────────────────────────────────────────────

/** A path as an SBPL string literal. */
function sbplString(p) {
    return `"${p.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A literal path as a POSIX regex fragment. */
function regexEscape(p) {
    return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The profile sandbox-exec runs: sandbox-macos.sb (its parameters still
 * passed with -D), then one `deny file-read*` per unreadable path — any
 * number, none collapsed — and, when `home` is given, a rule that makes any
 * `*keystore*.json` under it unreadable wherever the owner keeps it.
 */
export function renderProfile({ denyReads, home, base = fs.readFileSync(BASE_PROFILE, "utf-8") }) {
    const lines = [...new Set(denyReads)].map((p) => `(deny file-read* (subpath ${sbplString(p)}))`);
    if (home) {
        lines.push(`(deny file-read* (regex #"^${regexEscape(canonical(home))}/(.*/)?[^/]*[Kk]eystore[^/]*\\.json$"))`);
    }
    return `${base.trimEnd()}\n${lines.join("\n")}\n`;
}

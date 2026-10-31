/**
 * sandboxProfile — the launcher's pure decisions, apart from its side effects
 * so the tests drive the same functions the launcher runs.
 *
 *   - which environment variables cross into the sandbox (`scrubEnv`);
 *   - which paths are readable at all: reads are denied by default, and the
 *     base profile grants the system, the workspace and temp; the launcher
 *     grants what the runtime itself loads (`runtimeReadRoots`) and each
 *     `--allow-read` (`applyAllowReads`);
 *   - which secret paths stay unreadable inside any grant (`defaultDenyReads`),
 *     and how `--allow-read` opens one of them by naming it exactly;
 *   - the profile text sandbox-exec runs (`renderProfile`): the parameterized
 *     base in sandbox-macos.sb, one allow rule per grant, then one deny rule
 *     per secret path, last so that it wins inside a grant.
 */

import * as fs from "node:fs";
import * as os from "node:os";
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

/** Is `inner` the path `outer` or under it? Both canonical. */
function within(outer, inner) {
    return inner === outer || inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);
}

/**
 * Read `--allow-read`. Reads are denied by default, so each allow is one of
 * two acts:
 *   - it names a default secret path exactly (after canonicalization), and
 *     opens that one: its deny leaves the list and its grant joins;
 *   - it names any other path, and grants reads under it. The secret denies
 *     are rendered after every grant, so a secret inside a grant stays
 *     unreadable.
 * A grant that would undo the default is refused, never widened: the root,
 * the home directory or a directory above it (the old default-allow posture),
 * and a path inside a default secret path (open the default itself, by name).
 */
export function applyAllowReads(denies, allows, { home } = {}) {
    const homeRoot = home ? canonical(home) : null;
    const opened = new Set();
    const grants = [];
    const refused = [];
    for (const p of [...new Set(allows.map(canonical))]) {
        // Opened: its deny leaves, and its grant makes it readable.
        if (denies.includes(p)) { opened.add(p); grants.push(p); continue; }
        if (p === path.parse(p).root || (homeRoot && within(p, homeRoot))) {
            refused.push({ path: p, reason: "it contains the home directory — grant the narrower path the agent reads" });
            continue;
        }
        const holder = denies.find((d) => within(d, p));
        if (holder) {
            refused.push({ path: p, reason: `it is inside the default unreadable path ${holder} — open that path itself, by name` });
            continue;
        }
        grants.push(p);
    }
    return { denies: denies.filter((p) => !opened.has(p)), grants, refused };
}

/**
 * What the runtime itself loads, granted by the launcher so that a default-deny
 * read posture still starts node and this package:
 *   - the runtime's own directory (its modules and `node_modules`);
 *   - the real path of every package a `node_modules` links elsewhere (the
 *     SDK, installed `file:../../sdk`, is a symlink to the SDK's own
 *     directory);
 *   - every `node_modules` above a granted package, where node's resolution
 *     climbs to find what the package imports (the SDK's `viem` is hoisted to
 *     the repository's root `node_modules`), and the links inside each;
 *   - node's install prefix (`<prefix>/bin/node`, `<prefix>/lib`), and the
 *     directory of the command's own executable when it names a file.
 * A root that is the filesystem root or contains the home directory is never
 * granted (a prefix of `/usr/bin/node` is `/usr`, already a system grant).
 */
export function runtimeReadRoots({ runtimeDir, execPath, command = [], home = os.homedir() }) {
    const homeRoot = canonical(home);
    const roots = new Set();
    const entries = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
    const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
    /** Grant a package directory, the links its `node_modules` holds, and
     *  every `node_modules` above it — each followed the same way, once. */
    const visit = (dir) => {
        const real = canonical(dir);
        if (roots.has(real)) return;
        roots.add(real);
        for (let at = real; ; at = path.dirname(at)) {
            const modules = path.join(at, "node_modules");
            if (isDir(modules) && !within(real, modules)) roots.add(canonical(modules));
            if (isDir(modules)) {
                for (const e of entries(modules)) {
                    const p = path.join(modules, e.name);
                    const scoped = e.name.startsWith("@") && e.isDirectory() ? entries(p).map((x) => path.join(p, x.name)) : [p];
                    for (const q of scoped) {
                        try { if (fs.lstatSync(q).isSymbolicLink() && isDir(q)) visit(fs.realpathSync(q)); } catch { /* dangling */ }
                    }
                }
            }
            if (path.dirname(at) === at) break;
        }
    };
    visit(runtimeDir);
    try {
        roots.add(path.dirname(path.dirname(fs.realpathSync(execPath))));
    } catch { /* no node to grant */ }
    const exe = command[0];
    if (exe && exe.includes(path.sep)) {
        try { roots.add(path.dirname(fs.realpathSync(exe))); } catch { /* not a file */ }
    }
    return [...roots].filter((r) => r !== path.parse(r).root && !within(r, homeRoot));
}

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
 * passed with -D; it denies every read and grants the system, the workspace
 * and temp), then one `allow file-read*` per grant, then one `deny
 * file-read*` per unreadable path — any number, none collapsed — and, when
 * `home` is given, a rule that makes any `*keystore*.json` under it unreadable
 * wherever the owner keeps it. The denies come last: the last matching rule
 * wins, so a secret inside a grant stays unreadable.
 */
export function renderProfile({ denyReads, allowReads = [], home, base = fs.readFileSync(BASE_PROFILE, "utf-8") }) {
    const lines = [
        ...[...new Set(allowReads)].map((p) => `(allow file-read* (subpath ${sbplString(p)}))`),
        ...[...new Set(denyReads)].map((p) => `(deny file-read* (subpath ${sbplString(p)}))`),
    ];
    if (home) {
        lines.push(`(deny file-read* (regex #"^${regexEscape(canonical(home))}/(.*/)?[^/]*[Kk]eystore[^/]*\\.json$"))`);
    }
    return `${base.trimEnd()}\n${lines.join("\n")}\n`;
}

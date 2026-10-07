/**
 * Global setup — the devnet seed precondition.
 *
 * The `devnet-authoring` and `devnet` projects trade against what
 * `frontend/scripts/populate-test-data.mjs` anchors before Playwright starts
 * (`npm run test:e2e:devnet`). This reads the chain out-of-band for that
 * seed — its blank single-agreement assembly, named "Devnet seed", among the
 * anchored assemblies `discoverAnchoredAssemblies` returns — and stops the run
 * with one line when it is absent, before any spec runs.
 *
 * It runs only when the run selects a project that shares the seed: the
 * `--project` filter (Playwright's own matching: case-insensitive, `*`
 * wildcards; no filter selects every project), narrowed by any file filters
 * to the projects that own a matching spec. Every other project
 * (`devnet-standalone`, `mobile`, `smoke`, `stranger`, `sepolia`) and a run
 * against Sepolia (`E2E_CHAIN=sepolia`) pass through silently.
 */
import fs from 'fs';
import path from 'path';
import type { FullConfig, FullProject } from '@playwright/test';
import { E2E_CHAIN, RPC_URL, discoverAnchoredAssemblies } from './devnet-helpers';

const SEED_PROJECTS = ['devnet-authoring', 'devnet'];
const SEED_NAME = 'Devnet seed';
const NOT_SEEDED = 'devnet not seeded: run `npm run test:e2e:devnet`, or `node scripts/populate-test-data.mjs` first';

/** Options of `playwright test` that take a value, so a value is never read as a file filter. */
const VALUE_OPTIONS = new Set([
    '--browser', '-c', '--config', '-g', '--grep', '--global-timeout', '--grep-invert', '-j', '--workers',
    '--max-failures', '--output', '--repeat-each', '--reporter', '--retries', '--shard', '--test-list',
    '--test-list-invert', '--timeout', '--trace', '--tsconfig', '--ui-host', '--ui-port', '--update-source-method',
]);

function parseCli(argv: string[]): { projects: string[]; fileFilters: string[] } {
    const args = argv.slice(argv.indexOf('test') + 1);
    const projects: string[] = [];
    const fileFilters: string[] = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith('--project=')) { projects.push(a.slice('--project='.length)); continue; }
        if (a === '--project') {
            // Variadic, as commander parses it: every following non-option token.
            while (i + 1 < args.length && !args[i + 1].startsWith('-')) projects.push(args[++i]);
            continue;
        }
        if (a.startsWith('-')) { if (!a.includes('=') && VALUE_OPTIONS.has(a)) i++; continue; }
        fileFilters.push(a);
    }
    return { projects, fileFilters };
}

function projectSelected(name: string, filters: string[]): boolean {
    if (filters.length === 0) return true;
    return filters.some((f) => {
        const pattern = new RegExp(`^${f.toLowerCase().split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
        return pattern.test(name.toLowerCase());
    });
}

function asRegExps(m: FullProject['testMatch']): RegExp[] {
    return (Array.isArray(m) ? m : [m]).filter((x): x is RegExp => x instanceof RegExp);
}

function specFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? specFiles(full) : [full];
    });
}

/** Does this project own a spec the run's file filters select? */
function projectHasFilteredSpec(project: FullProject, fileFilters: string[]): boolean {
    if (fileFilters.length === 0) return true;
    const match = asRegExps(project.testMatch);
    const ignore = asRegExps(project.testIgnore);
    const filters = fileFilters.map((f) => f.replace(/(:\d+){1,2}$/, ''));
    return specFiles(project.testDir).some((file) => {
        const posix = file.split(path.sep).join('/');
        if (!match.some((r) => r.test(posix)) || ignore.some((r) => r.test(posix))) return false;
        return filters.some((f) => {
            const abs = path.resolve(f).split(path.sep).join('/');
            if (posix === abs || posix.startsWith(`${abs}/`)) return true;
            try { return new RegExp(f).test(posix); } catch { return posix.includes(f); }
        });
    });
}

function failWith(line: string): never {
    const err = new Error(line);
    err.stack = line;
    throw err;
}

export default async function devnetSeedCheck(config: FullConfig): Promise<void> {
    if (E2E_CHAIN !== 'devnet') return;
    const { projects, fileFilters } = parseCli(process.argv);
    const sharesSeed = config.projects.some((p) => SEED_PROJECTS.includes(p.name)
        && projectSelected(p.name, projects)
        && projectHasFilteredSpec(p, fileFilters));
    if (!sharesSeed) return;

    let anchored: Awaited<ReturnType<typeof discoverAnchoredAssemblies>>;
    try {
        anchored = await discoverAnchoredAssemblies();
    } catch (cause) {
        failWith(`devnet not reachable at ${RPC_URL}: ${(cause as Error).message.split('\n')[0]}`);
    }
    if (!anchored.some((a) => a.name === SEED_NAME && a.agreements.length === 1)) failWith(NOT_SEEDED);
}

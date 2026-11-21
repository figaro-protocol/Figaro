/**
 * A field's name carries no meaning to any code (CLAUDE.md § "The clause's
 * seams", 5; docs/CLAUSES.md § "Clause-spec format"; docs/OPEN_WORLD.md § 1).
 * Code classifies a clause by its article and reads the role a field plays
 * from a mark its spec declares in `block`, by the spec's own field names.
 * The test for every line: would it still work for a stranger who registered
 * a clause no one has seen, with field names of its own?
 *
 * This test holds the frontend's app and library and the SDK to that, outside
 * the two parsers of the spec format, which read the format's own keys: the
 * SDK's clause engine (`sdk/src/clauses/`) and the frontend's `block` parser
 * (`lib/shared/clauseBlockBinding.ts`). It fails where a module names a field that a reference spec
 * in `clauses/` declares, in one of three forms:
 *
 *   - a quoted string (`clauseByField(a, "modality", …)`, `{ byField: "origin" }`);
 *   - a member read off a clause's committed values (`data.credentialId`,
 *     `values?.windowStart`);
 *   - a field in a cast of a clause's data (`as { applicableLaw?: string }`).
 *
 * A word that also names a key of something no clause defines (an ABI
 * event's `name`, a transaction's `to` and `from`, a token `amount`) is
 * left out of the scan, each with its reason, so the scan does not see a
 * read by one of those names; the list says which.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { treeSourceFiles } from "./__fixtures__/sourceTree";

const FRONTEND = process.cwd();
const REPO = path.resolve(FRONTEND, "..");

/** The modules held: the frontend's app and library, and the SDK outside its clause engine. */
const FRONTEND_DIRS = ["lib", "components", path.join("app", "(app)"), path.join("app", "(tools)")];
const SDK_SRC = path.join(REPO, "sdk", "src");
const SDK_CLAUSE_ENGINE = path.join(SDK_SRC, "clauses");

/** Everyday words a reference spec also uses as a field name, left out of the scan. */
const EVERYDAY_WORDS: Readonly<Record<string, string>> = {
    name: "the name of a member, a token, a file, an ABI entry and a priced line's item",
    event: "the event of a log filter and of an ABI entry",
    currency: "the commitment's token, a column of the audit's contract page",
    amount: "a token amount in a typed-data struct and a swap",
    from: "the sender of a transaction and a route mark's role",
    to: "the recipient of a transaction and a route mark's role",
    standard: "a capability's risk label",
    quantity: "a priced line's role in its mark and a cart's line",
    forum: "a label of the audit's contract page",
    language: "a label of the audit's contract page",
    periodStart: "a function of the usage counter",
    periodEnd: "a function of the usage counter",
    documents: "the audit bundle's list of rendered trade documents",
};

/** Every field name a reference spec in `clauses/` declares, at any depth and in any stage. */
function referenceFieldNames(): Set<string> {
    const names = new Set<string>();
    const walk = (fields: unknown): void => {
        if (!Array.isArray(fields)) return;
        for (const f of fields as Array<Record<string, unknown>>) {
            if (typeof f.name === "string") names.add(f.name);
            walk(f.fields);
            walk((f.items as Record<string, unknown> | undefined)?.fields);
        }
    };
    const dir = path.join(REPO, "clauses");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const spec = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { fields?: unknown; stages?: Record<string, unknown> };
        walk(spec.fields);
        for (const stage of Object.values(spec.stages ?? {})) walk(stage);
    }
    for (const word of Object.keys(EVERYDAY_WORDS)) names.delete(word);
    return names;
}

/** The frontend's parser of the `block` format reads the format's own
 *  attribute names, one of which (`block.runtime.modality`) is also a
 *  reference spec's field name; it is the frontend's half of the spec
 *  format, as `sdk/src/clauses/` is the SDK's. */
const BLOCK_PARSER = path.join(FRONTEND, "lib", "shared", "clauseBlockBinding.ts");

/** The scanned source files, frontend and SDK. */
function scannedFiles(): string[] {
    const frontend = treeSourceFiles(FRONTEND, FRONTEND_DIRS).filter((f) => f !== BLOCK_PARSER);
    const sdk = treeSourceFiles(SDK_SRC, ["."]).filter((f) => !f.startsWith(SDK_CLAUSE_ENGINE + path.sep));
    return [...frontend, ...sdk];
}

/** The lines of `source` that read a field by one of `names`. Comments are left out. */
function fieldNameReads(source: string, names: ReadonlySet<string>): string[] {
    const alternatives = [...names].join("|");
    const quoted = new RegExp(`["'\`](${alternatives})["'\`]`);
    const member = new RegExp(`\\b(data|values|content|clauseData|leaf)\\??\\.(${alternatives})\\b`);
    const cast = new RegExp(`\\bas\\s+\\{[^}]*\\b(${alternatives})\\??:`);
    return source
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .filter((line) => quoted.test(line) || member.test(line) || cast.test(line))
        .map((line) => line.trim());
}

describe("no module reads a clause's field by its name", () => {
    const names = referenceFieldNames();

    it("the scan reads the reference specs' field names and the app's, the library's and the SDK's modules", () => {
        expect(names.size).toBeGreaterThan(40);
        const files = scannedFiles();
        expect(files.some((f) => f.includes(path.join("lib", "data", "audit")))).toBe(true);
        expect(files.some((f) => f.startsWith(SDK_SRC))).toBe(true);
        expect(files.some((f) => f.startsWith(SDK_CLAUSE_ENGINE + path.sep))).toBe(false);
    });

    it("no frontend or SDK module names a field a reference spec declares", () => {
        const found = scannedFiles().flatMap((file) =>
            fieldNameReads(readFileSync(file, "utf8"), names).map((line) => `${path.relative(REPO, file)}: ${line}`),
        );
        expect(found).toEqual([]);
    });

    it("the scan finds a read by a field's name when one is written", () => {
        const planted = [
            'const m = clauseByField(agreement, "modality", specSource());',
            '        { hasLeafField: "origin" },',
            "    const id = data.credentialId;",
            "    const start = values?.windowStart;",
            "    const d = entry.data as { applicableLaw?: string } | undefined;",
        ];
        for (const line of planted) expect(fieldNameReads(line, names), line).toHaveLength(1);
        // A read through a mark names no field.
        expect(fieldNameReads("    const id = data[mark.id];", names)).toHaveLength(0);
        // A comment that names a reference spec's field is no read.
        expect(fieldNameReads(" * the reference spec marks `modality`.", names)).toHaveLength(0);
    });
});

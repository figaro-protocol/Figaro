// Conformance of the relay's HTTP interface to its published format
// (`sdk/src/agent/relay-wire.schema.json`).
//
// Two sides are held to the one JSON Schema:
//
// - the relay: `fixtures/relay-wire/` holds the relay's own answers and the
//   operations as the relay itself writes them. The relay's cargo test
//   `relay_wire_fixtures_are_the_relays_own_answers` drives its real router
//   and fails while any of them differs from what the router answers, so
//   these bytes are the relay's, not a copy written by hand.
// - the client: every request `SequencerClient` sends is captured and checked
//   against the JSON Schema, and every relay answer is parsed by it.
//
// A stranger's relay is checked the same way: validate its answers against
// the JSON Schema's `$defs`, and drive `SequencerClient` against it.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import schema from "../src/agent/relay-wire.schema.json";
import {
    RELAY_WIRE_FORMAT_VERSION,
    SequencerClient,
    SequencerError,
    type SequencerUsageClaim,
} from "../src/agent/sequencer.js";
import type { Commitment } from "../src/types.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(schema);
const validator = (def: string) => {
    const validate = ajv.getSchema(`${schema.$id}#/$defs/${def}`);
    if (!validate) throw new Error(`no $defs/${def} in the JSON Schema`);
    return (value: unknown) => {
        const ok = validate(value) as boolean;
        return { ok, errors: JSON.stringify(validate.errors) };
    };
};

const fixturesDir = join(__dirname, "fixtures/relay-wire");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));

describe("relay-wire.schema.json is the format the relay serves", () => {
    it("names the version this client speaks", () => {
        expect(schema["x-wire-format-version"]).toBe(RELAY_WIRE_FORMAT_VERSION);
        expect(schema.$defs.StatusResponse.properties.wire_format_version.const).toBe(RELAY_WIRE_FORMAT_VERSION);
    });

    it("names the four routes the relay serves, and no other", () => {
        expect(Object.keys(schema["x-routes"]).sort()).toEqual(["GET /health", "GET /status", "POST /submit", "POST /submit-usage"]);
    });

    const requests = readdirSync(fixturesDir).filter((f) => f.startsWith("submit-request-"));
    it("the relay's fixtures hold every operation kind it admits in the canonical batch", () => {
        expect(requests.length).toBeGreaterThanOrEqual(4);
    });
    it.each(requests)("the relay's %s is a SubmitRequest", (file) => {
        const { ok, errors } = validator("SubmitRequest")(fixture(file));
        expect(ok, errors).toBe(true);
    });

    it.each([
        ["submit-response.json", "SubmitResponse"],
        ["status-response.json", "StatusResponse"],
        ["health-response.json", "HealthResponse"],
        ["error-response.json", "ErrorResponse"],
    ])("the relay's %s is a %s", (file, def) => {
        const { ok, errors } = validator(def)(fixture(file));
        expect(ok, errors).toBe(true);
    });

    it("refuses a status answer that names no verifier or key", () => {
        const status = fixture("status-response.json") as Record<string, unknown>;
        for (const drop of ["batch_verifier", "program_vkey", "chain_id", "wire_format_version", "browser_submit_origins"]) {
            const { [drop]: _gone, ...rest } = status;
            expect(validator("StatusResponse")(rest).ok, drop).toBe(false);
        }
    });
});

describe("SequencerClient speaks the published format", () => {
    const ZERO = `0x${"00".repeat(32)}` as const;
    const SIG = `0x${"ab".repeat(32)}${"cd".repeat(32)}1b` as const;
    const commitment: Commitment = {
        processId: ZERO,
        buyer: "0x0000000000000000000000000000000000000001",
        seller: "0x0000000000000000000000000000000000000002",
        token: "0x0000000000000000000000000000000000000003",
        payment: 100n,
        runningTotal: 100n,
        checkoutHash: `0x${"11".repeat(32)}`,
        salt: 42n,
        commitDeadline: 9999n,
    };

    /** A client whose every request body is kept, answered from `answer`. */
    function capturing(answer: (url: string) => { status: number; body: unknown }) {
        const sent: Array<{ url: string; body: unknown }> = [];
        const client = new SequencerClient({
            url: "http://relay.test",
            fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
                const { status, body } = answer(url);
                return new Response(JSON.stringify(body), { status });
            }) as typeof globalThis.fetch,
        });
        return { client, sent };
    }

    it("every operation it sends is a SubmitRequest, and it reads the relay's receipt", async () => {
        const { client, sent } = capturing(() => ({ status: 200, body: fixture("submit-response.json") }));
        const witness = { clauseId: ZERO, stage: 1, contentRef: ZERO, clauseDataHash: ZERO, inclusionProof: [ZERO] };
        const receipts = [
            await client.submitCommit(commitment, SIG, SIG),
            await client.submitResolve(ZERO, 100n, [commitment], SIG),
            await client.submitResolveByWalletCode(ZERO, 100n, [commitment], "0xabcd"),
            await client.submitAttestAsSeller({ target: commitment, sellerSig: SIG, ...witness }),
            await client.submitAttestAsBuyer({ target: commitment, buyerSig: SIG, ...witness }),
            await client.submitAttestByWalletCode({ role: "Buyer", target: commitment, authorization: "0x01", ...witness }),
        ];
        expect(receipts.map((r) => r.id)).toEqual(Array(6).fill((fixture("submit-response.json") as { id: number }).id));
        for (const { url, body } of sent) {
            expect(url).toBe("http://relay.test/submit");
            const { ok, errors } = validator("SubmitRequest")(body);
            expect(ok, errors).toBe(true);
        }
    });

    it("a usage claim it sends is a SubmitUsageRequest", async () => {
        const { client, sent } = capturing(() => ({ status: 200, body: { pending: 1 } }));
        const claim: SequencerUsageClaim = {
            order: {
                process_id: ZERO, buyer: commitment.buyer, seller: commitment.seller, token: commitment.token,
                payment: "100", running_total: "100", checkout_hash: commitment.checkoutHash, salt: "42", commit_deadline: "9999",
            },
            clause_or_process: ZERO,
            kind: { Clause: { clause_data_hash: ZERO } },
            inclusion_proof: [],
        };
        expect(await client.submitUsageClaim(claim)).toEqual({ pending: 1 });
        expect(sent[0].url).toBe("http://relay.test/submit-usage");
        const { ok, errors } = validator("SubmitUsageRequest")(sent[0].body);
        expect(ok, errors).toBe(true);
    });

    it("parses the relay's status answer, and raises the relay's refusal with its reason", async () => {
        const status = await capturing(() => ({ status: 200, body: fixture("status-response.json") })).client.status();
        const served = fixture("status-response.json") as Record<string, unknown>;
        expect(status.batch_verifier).toBe(served.batch_verifier);
        expect(status.program_vkey).toBe(served.program_vkey);
        expect(status.chain_id).toBe(served.chain_id);
        expect(status.browser_submit_origins).toEqual(served.browser_submit_origins);

        const refused = capturing(() => ({ status: 422, body: fixture("error-response.json") })).client;
        const error = await refused.submitCommit(commitment, SIG, SIG).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SequencerError);
        expect((error as SequencerError).statusCode).toBe(422);
        expect((error as SequencerError).message).toBe((fixture("error-response.json") as { error: string }).error);
    });
});

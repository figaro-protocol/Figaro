/**
 * The SDK's hand-written ABIs (`src/abis.ts`) against the ABIs the contracts
 * compile to (`abi/*.json`, emitted from the forge artifacts by
 * `scripts/emit-abi-bundle.sh`). Every function, event and error the SDK
 * declares must exist in the contract with the same name, the same input
 * types — events with the same `indexed` flags, since the topics decode by
 * them — and, for functions, the same output types. A drifted fragment
 * encodes calls the contract refuses or decodes logs into nothing, and is
 * otherwise seen only on a live chain.
 *
 * And the reverse, for errors and for events: every error a contract compiles
 * is in the SDK's ABI, so a refused call decodes by name instead of raw bytes;
 * every event a contract emits is there too, so no log a reader meets on the
 * chain, on either path, is one the SDK cannot decode.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Abi, AbiParameter } from "viem";
import {
    CORE_ABI, ATTESTATION_COORDINATOR_ABI, CLAUSE_REGISTRY_ABI, MEMBERS_REGISTRY_ABI,
    ASSEMBLY_REGISTRY_ABI, AGREEMENT_REGISTRY_ABI, FLORIN_TOKEN_ABI, USAGE_COUNTER_ABI, RPGF_MINTER_ABI, BATCH_VERIFIER_ABI,
} from "../src/abis.js";

const ROOT = path.resolve(__dirname, "..", "..");

function compiled(name: string): Abi {
    const raw = JSON.parse(readFileSync(path.join(ROOT, "abi", `${name}.json`), "utf8"));
    return (Array.isArray(raw) ? raw : raw.abi) as Abi;
}

/** A parameter's canonical type: tuples expanded, arrays kept. */
function typeOf(p: AbiParameter): string {
    const components = (p as { components?: readonly AbiParameter[] }).components;
    if (p.type.startsWith("tuple") && components) {
        return `(${components.map(typeOf).join(",")})${p.type.slice("tuple".length)}`;
    }
    return p.type;
}

/** What must agree between the two ABIs for an item to encode and decode alike. */
function shape(item: Abi[number]): string | null {
    if (item.type === "function") {
        return `function ${item.name}(${item.inputs.map(typeOf).join(",")}) returns (${item.outputs.map(typeOf).join(",")})`;
    }
    if (item.type === "event") {
        return `event ${item.name}(${item.inputs.map((p) => `${typeOf(p)}${(p as { indexed?: boolean }).indexed ? " indexed" : ""}`).join(",")})`;
    }
    if (item.type === "error") {
        return `error ${item.name}(${item.inputs.map(typeOf).join(",")})`;
    }
    return null;
}

/** The denomination token's ERC-6093 errors, as OpenZeppelin's ERC-20 compiles
 *  them — read from the repo's own OpenZeppelin ERC-20, FlorinToken. FigaroCore
 *  pulls bonds with safeTransferFrom, so these revert inside the token and
 *  bubble up through a Core call; the SDK carries them so they decode by name. */
const tokenErrors = (): Abi =>
    compiled("FlorinToken").filter((i) => i.type === "error" && i.name.startsWith("ERC20"));

/** The compiled errors or events an SDK ABI lacks, each in its `shape`. */
function missing(kind: "error" | "event", sdkAbi: Abi, compiledAbi: Abi): string[] {
    const ours = new Set(sdkAbi.map(shape));
    return compiledAbi
        .filter((i) => i.type === kind)
        .map(shape)
        .filter((s): s is string => s !== null && !ours.has(s));
}

const PAIRS: [string, Abi, string, (() => Abi)?][] = [
    ["CORE_ABI", CORE_ABI, "FigaroCore", tokenErrors],
    ["ATTESTATION_COORDINATOR_ABI", ATTESTATION_COORDINATOR_ABI, "AttestationCoordinator"],
    ["CLAUSE_REGISTRY_ABI", CLAUSE_REGISTRY_ABI, "ClauseRegistry"],
    ["MEMBERS_REGISTRY_ABI", MEMBERS_REGISTRY_ABI, "MembersRegistry"],
    ["ASSEMBLY_REGISTRY_ABI", ASSEMBLY_REGISTRY_ABI, "AssemblyRegistry"],
    ["AGREEMENT_REGISTRY_ABI", AGREEMENT_REGISTRY_ABI, "AgreementRegistry"],
    ["FLORIN_TOKEN_ABI", FLORIN_TOKEN_ABI, "FlorinToken"],
    ["USAGE_COUNTER_ABI", USAGE_COUNTER_ABI, "UsageCounter"],
    ["RPGF_MINTER_ABI", RPGF_MINTER_ABI, "RpgfMinter"],
    ["BATCH_VERIFIER_ABI", BATCH_VERIFIER_ABI, "FigaroBatchVerifier"],
];

describe("the SDK's ABIs are the contracts' ABIs", () => {
    for (const [sdkName, sdkAbi, contract, alsoReverts] of PAIRS) {
        it(`${sdkName} declares nothing ${contract} does not have, as it has it`, () => {
            const reference = [...compiled(contract), ...(alsoReverts?.() ?? [])];
            const theirs = new Set(reference.map(shape).filter((s): s is string => s !== null));
            const drifted = sdkAbi.map(shape).filter((s): s is string => s !== null && !theirs.has(s));
            expect(drifted, `${sdkName} fragments not in abi/${contract}.json`).toEqual([]);
        });
        it(`${sdkName} carries every error ${contract} compiles`, () => {
            expect(missing("error", sdkAbi, compiled(contract)), `abi/${contract}.json errors not in ${sdkName}`).toEqual([]);
        });
        it(`${sdkName} carries every event ${contract} emits`, () => {
            expect(missing("event", sdkAbi, compiled(contract)), `abi/${contract}.json events not in ${sdkName}`).toEqual([]);
        });
    }

    it("a drifted fragment is caught", () => {
        // The check reads what it claims to: an indexed flag moved is a miss.
        const committed = CORE_ABI.find((i) => i.type === "event" && i.name === "OrderCommitted")!;
        const moved = {
            ...committed,
            inputs: (committed as { inputs: AbiParameter[] }).inputs.map((p, i) => (i === 3 ? { ...p, indexed: true } : p)),
        } as Abi[number];
        const theirs = new Set(compiled("FigaroCore").map(shape));
        expect(theirs.has(shape(committed))).toBe(true);
        expect(theirs.has(shape(moved))).toBe(false);
    });

    it("an error the SDK drops is caught", () => {
        // The reverse check reads what it claims to: one error removed is a miss.
        const dropped = BATCH_VERIFIER_ABI.filter((i) => !(i.type === "error" && i.name === "ZeroVerifier")) as Abi;
        expect(missing("error", dropped, compiled("FigaroBatchVerifier"))).toEqual(["error ZeroVerifier()"]);
    });

    it("an event the SDK drops is caught", () => {
        // The same reverse check for events: one event left out is a miss.
        const dropped = BATCH_VERIFIER_ABI.filter((i) => !(i.type === "event" && i.name === "BatchAccrualSkipped")) as Abi;
        expect(missing("event", dropped, compiled("FigaroBatchVerifier"))).toEqual([
            "event BatchAccrualSkipped(uint64 indexed,bytes)",
        ]);
    });
});

/** The names of an ABI's items that change state: every function that is not
 *  view or pure, and any fallback or receive (which would be a state-changing
 *  entry with no name). */
function stateChanging(abi: Abi): string[] {
    return abi
        .filter((i) =>
            (i.type === "function" && i.stateMutability !== "view" && i.stateMutability !== "pure")
            || i.type === "fallback" || i.type === "receive")
        .map((i) => (i.type === "function" ? i.name : i.type))
        .sort();
}

describe("the Core has no third action (CLAUDE.md § 'The Core's rules', rule 3: no admin, no pause, no upgrade)", () => {
    it("FigaroCore changes state only through commit and resolveProcess", () => {
        expect(stateChanging(compiled("FigaroCore"))).toEqual(["commit", "resolveProcess"]);
    });

    it("AttestationCoordinator changes state only through attestAsBuyer and attestAsSeller", () => {
        expect(stateChanging(compiled("AttestationCoordinator"))).toEqual(["attestAsBuyer", "attestAsSeller"]);
    });

    it("neither names an owner, pause, upgrade, sweep or withdraw function", () => {
        const names = [...compiled("FigaroCore"), ...compiled("AttestationCoordinator")]
            .filter((i) => i.type === "function")
            .map((i) => (i as { name: string }).name);
        expect(names.filter((n) => /owner|admin|pause|upgrade|sweep|withdraw|rescue|recover|implementation|proxy/i.test(n))).toEqual([]);
    });

    it("the check reads what it claims to: a third state-changing function is caught", () => {
        const extra = [
            ...compiled("FigaroCore"),
            { type: "function", name: "sweep", inputs: [], outputs: [], stateMutability: "nonpayable" },
        ] as Abi;
        expect(stateChanging(extra)).toEqual(["commit", "resolveProcess", "sweep"]);
    });
});

/** Every function and event name an ABI carries, sorted. */
function itemNames(abi: Abi, type: "function" | "event"): string[] {
    return abi.filter((i) => i.type === type).map((i) => (i as { name: string }).name).sort();
}

/** The words of a machine that makes the chain believe a claim about the
 *  past: post a count, bond it, challenge it, dispute it, slash, propose,
 *  finalize, referee. `UsageCounter`'s NatSpec names that apparatus as what it
 *  replaces (src/rewards/UsageCounter.sol, the contract's @notice). */
const CLAIM_GAME = /post|bond|challenge|dispute|slash|finali[sz]e|propos|referee|adjudicat|appeal|arbitrat|veto|optimistic/i;

describe("designer rewards: nothing to post, nothing to bond, nothing to dispute — the count is final when it is made", () => {
    it("UsageCounter changes state only by counting a use: the three direct records and the proved batch's accrual", () => {
        // recordClauseUsage / recordAgreementUsage / recordAssemblyUsage prove
        // the order resolved and the key is committed in its agreement;
        // applyBatchAccrual takes the uses a proof committed, from the
        // verifier alone (src/rewards/UsageCounter.sol, `batchVerifier`).
        expect(stateChanging(compiled("UsageCounter"))).toEqual([
            "applyBatchAccrual", "recordAgreementUsage", "recordAssemblyUsage", "recordClauseUsage",
        ]);
    });

    it("RpgfMinter changes state only through claim, which mints a closed period's share", () => {
        expect(stateChanging(compiled("RpgfMinter"))).toEqual(["claim"]);
    });

    it("no function or event of either contract is named for posting, bonding, challenging, disputing or finalizing", () => {
        const names = ["UsageCounter", "RpgfMinter"].flatMap((c) => [
            ...itemNames(compiled(c), "function"), ...itemNames(compiled(c), "event"),
        ]);
        expect(names.filter((n) => CLAIM_GAME.test(n))).toEqual([]);
    });

    it("the check reads what it claims to: a posted claim and its challenge are caught", () => {
        const extra = [
            ...compiled("UsageCounter"),
            { type: "function", name: "postUsage", inputs: [], outputs: [], stateMutability: "nonpayable" },
            { type: "function", name: "challengeUsage", inputs: [], outputs: [], stateMutability: "payable" },
        ] as Abi;
        expect(stateChanging(extra)).toContain("postUsage");
        expect(itemNames(extra, "function").filter((n) => CLAIM_GAME.test(n))).toEqual(["challengeUsage", "postUsage"]);
    });
});

/** A claim on revenue or a vote, by the names an ERC-20 extension gives them:
 *  ERC20Votes (delegate, getVotes, checkpoints), snapshots, dividend and
 *  distribution tokens, governors. */
const VOTE_OR_REVENUE = /delegat|vote|checkpoint|dividend|distribut|claim|snapshot|govern|proposal|quorum|revenue|profit|yield|share|withdraw/i;

describe("designer rewards: the florin carries no claim on revenue and no vote", () => {
    it("FlorinToken's functions are the ERC-20 surface, its EIP-2612 permit, the minter registration, mint and the renounce", () => {
        // src/rewards/FlorinToken.sol: `ERC20Permit` plus registerMinter,
        // mint and renounceDeployerMint, with their public state.
        expect(itemNames(compiled("FlorinToken"), "function")).toEqual([
            // ERC-20
            "allowance", "approve", "balanceOf", "decimals", "name", "symbol", "totalSupply", "transfer", "transferFrom",
            // EIP-2612 permit, an approval by signature, and EIP-5267's domain read
            "DOMAIN_SEPARATOR", "eip712Domain", "nonces", "permit",
            // the minter registry: capped, registered by the deployer until it renounces
            "MAX_SUPPLY", "deployer", "deployerMintRenounced", "mint", "minters", "registerMinter",
            "renounceDeployerMint", "totalRegisteredCap",
        ].sort());
    });

    it("FlorinToken's events are the ERC-20 events, EIP-5267's and the minter registration", () => {
        expect(itemNames(compiled("FlorinToken"), "event")).toEqual(["Approval", "EIP712DomainChanged", "MinterRegistered", "Transfer"]);
    });

    it("no function or event of FlorinToken is named for a vote, a delegation, a snapshot or a payout", () => {
        const names = [...itemNames(compiled("FlorinToken"), "function"), ...itemNames(compiled("FlorinToken"), "event")];
        expect(names.filter((n) => VOTE_OR_REVENUE.test(n))).toEqual([]);
    });

    it("the check reads what it claims to: ERC20Votes' delegate and getVotes are caught", () => {
        const extra = [
            ...compiled("FlorinToken"),
            { type: "function", name: "delegate", inputs: [], outputs: [], stateMutability: "nonpayable" },
            { type: "function", name: "getVotes", inputs: [], outputs: [], stateMutability: "view" },
        ] as Abi;
        expect(itemNames(extra, "function").filter((n) => VOTE_OR_REVENUE.test(n))).toEqual(["delegate", "getVotes"]);
    });
});

/** Every `string` and dynamic `bytes` an ABI carries in a function's inputs,
 *  a function's outputs or an event's fields, struct members included, as
 *  `function name(path): type` or `event name(path): type`. Errors are left
 *  out: they are the contract's own refusals, never data a party supplies. */
function dynamicFields(abi: Abi): string[] {
    const out: string[] = [];
    const walk = (p: AbiParameter, at: string, item: string) => {
        const here = at ? `${at}.${p.name ?? "?"}` : (p.name || "?");
        const components = (p as { components?: readonly AbiParameter[] }).components;
        if (components) for (const c of components) walk(c, here, item);
        if (/^(string|bytes)(\[\d*\])*$/.test(p.type)) out.push(`${item}(${here}): ${p.type}`);
    };
    for (const i of abi) {
        if (i.type === "function") {
            for (const p of i.inputs) walk(p, "in", `function ${i.name}`);
            for (const p of i.outputs) walk(p, "out", `function ${i.name}`);
        } else if (i.type === "event") {
            for (const p of i.inputs) walk(p, "", `event ${i.name}`);
        }
    }
    return out.sort();
}

const EIP5267 = "EIP-5267's domain read: the EIP-712 name and version, fixed at deploy, no party's data";

/** Each `string` or dynamic `bytes` the Core, the counter and the registries
 *  carry, with why it is there, read from the contract. Anything else fails. */
const DYNAMIC_ALLOWED: Record<string, Record<string, string>> = {
    FigaroCore: {
        "function commit(in.buyerSig): bytes": "the buyer's EIP-712 signature over the commitment (FigaroCore.commit @param buyerSig)",
        "function commit(in.sellerSig): bytes": "the seller's EIP-712 signature over the commitment (FigaroCore.commit @param sellerSig)",
        "function eip712Domain(out.name): string": EIP5267,
        "function eip712Domain(out.version): string": EIP5267,
    },
    AttestationCoordinator: {},
    FigaroBatchVerifier: {
        "function settleBatch(in.proof): bytes": "the SP1 proof's bytes",
        "function settleBatch(in.publicValues): bytes": "the proof's public values, decoded by _decodePV",
        "function settleBatch(in.operations): bytes": "the batch's operation stream: commitments, signatures, wallet-code authorizations and usage claims, never clause content",
        "event BatchOperations(operations): bytes": "the same operation stream, logged so the batch path's state rebuilds from the chain",
        "event BatchAccrualSkipped(reason): bytes": "the revert data of UsageCounter.applyBatchAccrual, caught so a refused accrual never blocks a batch",
        "function eip712Domain(out.name): string": EIP5267,
        "function eip712Domain(out.version): string": EIP5267,
    },
    UsageCounter: {},
    // The four registries carry a designer's or a member's URI in plain text:
    // a pointer to a public document, never a trade's content. The clause,
    // agreement and assembly URIs point at documents the key verifies
    // (keccak256 of the spec's bytes, a merkle root); the member's URI is not
    // verified by any hash on chain (MembersRegistry.register @param metadataURI:
    // "IPFS or HTTPS URI").
    ClauseRegistry: {
        "function registerClause(in.contentURI): string": "the pointer to the spec's pinned bytes, which its clause key verifies",
        "event ClauseRegistered(contentURI): string": "the same pointer, logged for readers",
    },
    AgreementRegistry: {
        "function registerAgreement(in.contentURI): string": "the pointer to the pinned agreement document, which the agreementHash verifies",
        "event AgreementRegistered(contentURI): string": "the same pointer, logged for readers",
        "function bindings(out.contentURI): string": "the same pointer, stored with the binding",
    },
    AssemblyRegistry: {
        "function registerAssembly(in.contentURI): string": "the pointer to the pinned assembly document, which the assemblyHash verifies",
        "event AssemblyRegistered(contentURI): string": "the same pointer, logged for readers",
        "function bindings(out.contentURI): string": "the same pointer, stored with the binding",
    },
    MembersRegistry: {
        "function register(in.metadataURI): string": "the pointer to the member's public profile document, which no hash on chain verifies",
        "function updateProfile(in.metadataURI): string": "the same pointer, replaced",
        "event MemberRegistered(metadataURI): string": "the same pointer, logged for discovery",
        "event MemberProfileUpdated(metadataURI): string": "the same pointer, logged for discovery",
    },
};

describe("data: the chain holds a fingerprint, never content; the protocol holds no user data to sell", () => {
    for (const [contract, allowed] of Object.entries(DYNAMIC_ALLOWED)) {
        it(`${contract} carries no string and no dynamic bytes beyond its allowlist`, () => {
            expect(dynamicFields(compiled(contract))).toEqual(Object.keys(allowed).sort());
        });
    }

    it("no function and no event of the Core or the counter takes a string", () => {
        const strings = ["FigaroCore", "AttestationCoordinator", "FigaroBatchVerifier", "UsageCounter"]
            .flatMap((c) => dynamicFields(compiled(c)).filter((f) => f.endsWith("string")).map((f) => `${c}: ${f}`));
        expect(strings.filter((f) => !f.includes("function eip712Domain(out."))).toEqual([]);
    });

    it("the check reads what it claims to: a string inside a struct a party signs is caught", () => {
        const withContent = compiled("AttestationCoordinator").map((i) =>
            i.type === "event" && i.name === "Attestation"
                ? { ...i, inputs: [...i.inputs, { name: "detail", type: "tuple", components: [{ name: "content", type: "string" }] }] }
                : i,
        ) as Abi;
        expect(dynamicFields(withContent)).toEqual(["event Attestation(detail.content): string"]);
    });
});

/** The contracts whose events a trade causes: the Core's three that declare
 *  events (`CommitmentTypes` is a library) and the counter a resolution calls. */
const TRADE_EMITTERS = ["FigaroCore", "AttestationCoordinator", "FigaroBatchVerifier", "UsageCounter"];

/** The table of docs/DATA_LAYER.md § "The fields the chain's events carry, and
 *  who reads them": one row per field, its reader and its grain. */
const DATA_LAYER = path.join(ROOT, "docs", "DATA_LAYER.md");
const FIELD_TABLE_HEADING = "## The fields the chain's events carry, and who reads them";

interface FieldRow { emitters: string[]; event: string; position: string; field: string; type: string; reader: string; grain: string }

function fieldTable(markdown: string): FieldRow[] {
    const start = markdown.indexOf(FIELD_TABLE_HEADING);
    if (start < 0) throw new Error(`docs/DATA_LAYER.md has no heading "${FIELD_TABLE_HEADING}"`);
    const rest = markdown.slice(start + FIELD_TABLE_HEADING.length);
    const end = rest.search(/\n## /);
    const tableText = end < 0 ? rest : rest.slice(0, end);
    const code = (cell: string) => cell.replace(/`/g, "").trim();
    return tableText
        .split("\n")
        .filter((line) => line.startsWith("| `"))
        .map((line) => {
            const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split(" | ").map((c) => c.trim());
            if (cells.length !== 7) throw new Error(`a row of the field table has ${cells.length} cells, not 7: ${line}`);
            const [emitters, event, position, field, type, reader, grain] = cells;
            return { emitters: emitters.split(",").map(code), event: code(event), position, field: code(field), type: code(type), reader, grain };
        });
}

/** Each event field as `Contract.Event #position field: type[ indexed]`, and an
 *  event with no field as `Contract.Event (no field)`. */
function eventFields(contract: string, abi: Abi): string[] {
    return abi
        .filter((i): i is Extract<Abi[number], { type: "event" }> => i.type === "event")
        .flatMap((e) => e.inputs.length === 0
            ? [`${contract}.${e.name} (no field)`]
            : e.inputs.map((p, n) => `${contract}.${e.name} #${n} ${p.name}: ${typeOf(p)}${(p as { indexed?: boolean }).indexed ? " indexed" : ""}`));
}

function tableFields(rows: FieldRow[]): string[] {
    return rows.flatMap((r) => r.emitters.map((c) => r.field === "—"
        ? `${c}.${r.event} (no field)`
        : `${c}.${r.event} #${r.position} ${r.field}: ${r.type}`));
}

describe("data: every field an event carries has a row in docs/DATA_LAYER.md, with its reader and its grain", () => {
    const rows = fieldTable(readFileSync(DATA_LAYER, "utf8"));

    it("the table and the compiled events list the same fields, at the same positions, with the same types", () => {
        const compiledFields = TRADE_EMITTERS.flatMap((c) => eventFields(c, compiled(c))).sort();
        expect(tableFields(rows).sort(), "docs/DATA_LAYER.md field table against abi/*.json").toEqual(compiledFields);
    });

    it("the table names no contract outside the trade's emitters", () => {
        expect(rows.flatMap((r) => r.emitters).filter((c) => !TRADE_EMITTERS.includes(c))).toEqual([]);
    });

    it("every row says who reads the field, citing the code, or says no reader was found; and states a grain", () => {
        const bare = rows.filter((r) =>
            !r.grain || !(r.reader.startsWith("no reader found") || /`[\w./-]+\.(ts|tsx|rs|sol):\d+`/.test(r.reader)));
        expect(bare.map((r) => `${r.event}.${r.field}`)).toEqual([]);
    });

    it("the check reads what it claims to: a field added to an event, or one retyped, is caught", () => {
        const added = compiled("FigaroCore").map((i) =>
            i.type === "event" && i.name === "OrderCommitted"
                ? { ...i, inputs: [...i.inputs, { name: "note", type: "bytes32", indexed: false }] }
                : i,
        ) as Abi;
        const retyped = compiled("UsageCounter").map((i) =>
            i.type === "event" && i.name === "UsageRecorded"
                ? { ...i, inputs: i.inputs.map((p) => (p.name === "c" ? { ...p, type: "uint256" } : p)) }
                : i,
        ) as Abi;
        const documented = new Set(tableFields(rows));
        expect(eventFields("FigaroCore", added).filter((f) => !documented.has(f))).toEqual([
            "FigaroCore.OrderCommitted #10 note: bytes32",
        ]);
        expect(eventFields("UsageCounter", retyped).filter((f) => !documented.has(f))).toEqual([
            "UsageCounter.UsageRecorded #5 c: uint256",
        ]);
    });
});

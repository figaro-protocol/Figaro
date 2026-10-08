/**
 * lib/data/analystEndpoint.ts — speaking to an ANALYST, if a reader has one.
 *
 * ── What an analyst is ──────────────────────────────────────────────────────
 *
 * The analyst (`ecosystem-agents/figaro-analyst.md`, runnable at
 * `ecosystem-agents/runtime/figaro-analyst.mjs`) is an agent anyone can run: it
 * rides the INDEXER tooling — the same `@figaro-protocol/sdk` events and
 * `/derive` projections this page reads in the browser — and serves its own
 * small descriptive wire. Six routes: five deterministic folds over the
 * projected graphs, and a sixth model loop that exists only when its host
 * configured a model. It shares nothing with the resolution sequencer but a
 * chain.
 *
 * ── The posture: configuration, never doctrine ──────────────────────────────
 *
 * There is deliberately NO fallback endpoint. Who runs an analyst — and who
 * pays for its inference — is a deployment's choice, and defaulting every
 * reader onto an endpoint of ours would make a convenience look like an
 * authority. Unset means there is NO analyst here: the deterministic views on
 * this page still render in full (they are read from the chain by the reader's
 * own browser), and the prompt box simply does not exist. That is the absence
 * of a reader, never the absence of an answer.
 *
 * The user's own choice wins over the build-baked default, exactly as with the
 * batch relay. The analyst's `/prompt` route asks for the bearer token its run
 * wrote at start; the reader stores it beside their own endpoint
 * (`userEndpoints.analystToken`), and it is sent to that endpoint only — never
 * to the build-baked default: an analyst is one reader among any number, its answers are
 * checkable against the same deterministic routes, and pointing this at your
 * own is the first-class case (a user-run analyst is the one that can read the
 * private substance that user OWNS or BOUGHT).
 *
 * ── What is trusted ─────────────────────────────────────────────────────────
 *
 * Nothing structural. An analyst answer is a READING of public data, and
 * every answer carries the TRUTH BOUNDARY of what it reports, in the wire's own
 * vocabulary — the caller renders that label with the claim, never louder than
 * the guarantee behind it. An analyst can be wrong, stale, or hostile; the
 * deterministic routes it also serves, and this page's own client-side
 * projections, are how a reader checks it.
 */

import { extractErrorMessage } from "@/lib/shared/errors";
import { safeJsonFromResponse, safeJsonParse } from "@/lib/shared/safeJson";
import { readUserEndpoints, sanitizeEndpointUrl } from "@/lib/shared/userEndpoints";

/** The analyst this deployment points at by default. No fallback value — see
 *  the posture above. */
const ANALYST_URL = process.env.NEXT_PUBLIC_ANALYST_URL || "";

/** `userEndpoints.sanitizeEndpointUrl` with this resolver's null-not-undefined
 *  contract: an endpoint is an http(s) base URL, and anything else is refused
 *  outright rather than handed to `fetch`. */
function resolveAnalystEndpoint(raw: string | undefined): string | null {
    return sanitizeEndpointUrl(raw) ?? null;
}

/**
 * The single canonical resolver for the analyst endpoint. Returns null when
 * unset or malformed — resolved-empty means NO analyst is reachable from here,
 * so no prompt box renders at all.
 */
export function getAnalystUrl(): string | null {
    return resolveAnalystEndpoint(readUserEndpoints().analystUrl) ?? resolveAnalystEndpoint(ANALYST_URL);
}

/** The reader's analyst token, or null. Paired with the reader's OWN endpoint:
 *  with no `analystUrl` override the request goes to the build-baked default,
 *  and the token is never sent there. */
function getAnalystToken(): string | null {
    const own = readUserEndpoints();
    return resolveAnalystEndpoint(own.analystUrl) ? own.analystToken ?? null : null;
}

// ── The wire (read from `ecosystem-agents/runtime/figaro-analyst.mjs`) ───────

/** `GET /status` — what the corpus is, how far it synced, and whether the
 *  model loop exists on this host. Fields beyond these are passed through
 *  untouched; the wire is descriptive and may say more than this reader
 *  needs. */
export interface AnalystStatus {
    chainId?: number;
    syncedFromBlock?: string;
    syncedToBlock?: string;
    orderCommitted?: number;
    attestations?: number;
    substanceRecovered?: number;
    heldAgreements?: number;
    /** Present or absent, never guessed: the model loop exists only when its
     *  host configured BOTH an API key and a model id. */
    prompt?: { available: boolean; model?: string; reason?: string };
    routes?: string[];
}

/** `POST /prompt` — the model's answer plus the tool calls it made. The trace
 *  IS the audit trail: every tool in it is a deterministic route a reader can
 *  re-run and check. `answer` is null when the loop ran out of turns.
 *
 *  @public — names the payload of a successful `AnalystOutcome`, so any
 *  consumer rendering an answer with its trace needs it even though nothing
 *  imports it by name today. */
export interface AnalystAnswer {
    answer: string | null;
    trace: Array<{ tool: string; input: Record<string, unknown> }>;
    turns: number;
    truncated: boolean;
}

/** Why a prompt produced no answer — each a DIFFERENT fact, kept apart. */
export type AnalystOutcome =
    | { state: "answered"; answer: AnalystAnswer }
    /** The host runs an analyst but configured no model: the deterministic
     *  routes exist, the loop does not. */
    | { state: "no-prompt"; reason: string }
    /** The endpoint could not be reached, or answered unusably. */
    | { state: "unreachable"; error: string }
    /** The endpoint answered 2xx with a body that is not an answer — kept
     *  apart from transport failure: the analyst spoke, and what it said is
     *  not readable as an answer. */
    | { state: "unreadable"; error: string }
    /** The endpoint asks for its bearer token (401): none is stored for it,
     *  or the stored one is not this run's (`tokenSent`). */
    | { state: "needs-token"; tokenSent: boolean }
    /** The question was refused by the wire (empty, over the body cap). */
    | { state: "refused"; error: string };

const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Read a `POST /prompt` body as an `AnalystAnswer`, or say what is wrong with
 * it. The body is reader-configured, external JSON: its shape is checked here,
 * at the edge, so no render path meets a missing trace or a non-string answer.
 */
function readAnalystAnswer(body: unknown): AnalystAnswer | string {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return "the body is not a JSON object";
    }
    const b = body as Record<string, unknown>;
    if (b.answer !== null && typeof b.answer !== "string") return "`answer` is neither text nor null";
    if (!Array.isArray(b.trace)) return "`trace` is not a list";
    const trace: AnalystAnswer["trace"] = [];
    for (const t of b.trace) {
        if (typeof t !== "object" || t === null || typeof (t as { tool?: unknown }).tool !== "string") {
            return "a `trace` entry names no tool";
        }
        const input = (t as { input?: unknown }).input;
        trace.push({
            tool: (t as { tool: string }).tool,
            input: typeof input === "object" && input !== null && !Array.isArray(input)
                ? (input as Record<string, unknown>)
                : {},
        });
    }
    return {
        answer: b.answer,
        trace,
        turns: typeof b.turns === "number" ? b.turns : 0,
        truncated: b.truncated === true,
    };
}

/** A wire error field as text, or undefined — never an object handed on to a
 *  render path. */
function wireText(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

async function analystFetch(path: string, init?: RequestInit): Promise<Response> {
    const url = getAnalystUrl();
    if (!url) throw new Error("no analyst endpoint configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(`${url}${path}`, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Read `GET /status`. Returns null when no endpoint is configured or the
 * endpoint cannot be reached — the caller renders that as absence (no prompt
 * box), never as an error banner on a page whose deterministic views are fine.
 */
export async function readAnalystStatus(): Promise<AnalystStatus | null> {
    if (!getAnalystUrl()) return null;
    try {
        const res = await analystFetch("/status");
        // An analyst endpoint is network-fetched, reader-configured JSON —
        // parsed through the prototype-pollution-stripping reader like every
        // other external body this app reads.
        return await safeJsonFromResponse<AnalystStatus>(res);
    } catch {
        return null;
    }
}

/**
 * Ask a question. The wire's own error shapes are preserved rather than
 * flattened: a 401 means the endpoint asks for its token, a 404 means this host
 * runs no model loop (and says why), another 4xx means the question itself was
 * refused, and anything else is a transport failure reported verbatim.
 */
export async function askAnalyst(question: string): Promise<AnalystOutcome> {
    if (!getAnalystUrl()) {
        return { state: "no-prompt", reason: "no analyst endpoint is configured for this reader" };
    }
    const token = getAnalystToken();
    let res: Response;
    try {
        res = await analystFetch("/prompt", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ question }),
        });
    } catch (e) {
        return { state: "unreachable", error: extractErrorMessage(e, "the analyst could not be reached") };
    }

    // Read the body whatever the status: the wire's ERROR shapes carry the
    // fact (a 404's `reason` names why this host runs no model). Parsed
    // through the stripping reader — this is external, reader-configured JSON.
    let body: unknown = null;
    try {
        body = safeJsonParse(await res.text());
    } catch {
        // fall through — the status code still carries the fact
    }
    const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const detail = { error: wireText(raw.error), reason: wireText(raw.reason) };

    if (res.status === 401) return { state: "needs-token", tokenSent: token !== null };
    if (res.status === 404) {
        return {
            state: "no-prompt",
            reason: detail.reason ?? detail.error ?? "this analyst serves the deterministic routes only",
        };
    }
    if (!res.ok) {
        return {
            state: res.status >= 400 && res.status < 500 ? "refused" : "unreachable",
            error: detail.error ?? `the analyst answered ${res.status}`,
        };
    }
    const answer = readAnalystAnswer(body);
    return typeof answer === "string"
        ? { state: "unreadable", error: answer }
        : { state: "answered", answer };
}

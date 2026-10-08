/**
 * analystEndpoint.test.ts — the analyst is CONFIGURATION, never doctrine.
 *
 * The two things worth pinning: the endpoint resolver refuses anything that is
 * not an http(s) base URL (a `javascript:` override must never reach `fetch`),
 * and the wire's outcomes stay DISTINCT — "no analyst here", "this analyst
 * runs no model", "the question was refused", "unreachable" are four different
 * facts and the UI renders them differently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const readUserEndpointsMock = vi.fn();

vi.mock("@/lib/shared/userEndpoints", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/userEndpoints")>();
    return { ...actual, readUserEndpoints: () => readUserEndpointsMock() };
});

import { askAnalyst, getAnalystUrl, readAnalystStatus } from "@/lib/data/analystEndpoint";

const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("getAnalystUrl", () => {
    beforeEach(() => readUserEndpointsMock.mockReturnValue({}));

    it("resolves to null when nothing is configured — no analyst, no prompt box", () => {
        expect(getAnalystUrl()).toBeNull();
    });

    it("takes the reader's own endpoint and strips a trailing slash", () => {
        readUserEndpointsMock.mockReturnValue({ analystUrl: "https://analyst.example.com/" });
        expect(getAnalystUrl()).toBe("https://analyst.example.com");
    });

    it("refuses anything that is not an http(s) URL", () => {
        for (const hostile of [
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "ftp://analyst.example.com",
            "   ",
            42 as unknown as string,
        ]) {
            readUserEndpointsMock.mockReturnValue({ analystUrl: hostile });
            expect(getAnalystUrl()).toBeNull();
        }
    });
});

describe("the wire", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        readUserEndpointsMock.mockReturnValue({ analystUrl: "https://analyst.example.com" });
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockReset();
    });
    afterEach(() => vi.unstubAllGlobals());

    it("reads /status, and treats an unreachable analyst as absence, not an error", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(200, { syncedToBlock: "42", prompt: { available: true, model: "some-model" } }),
        );
        const status = await readAnalystStatus();
        expect(status?.syncedToBlock).toBe("42");
        expect(status?.prompt?.available).toBe(true);
        expect(fetchMock.mock.calls[0][0]).toBe("https://analyst.example.com/status");

        fetchMock.mockRejectedValueOnce(new Error("connection refused"));
        expect(await readAnalystStatus()).toBeNull();
    });

    it("returns the answer with the tool trace that produced it", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(200, { answer: "Two markets resolved.", trace: [{ tool: "market_shape", input: {} }], turns: 2, truncated: false }),
        );
        const outcome = await askAnalyst("what resolved?");
        expect(outcome).toEqual({
            state: "answered",
            answer: { answer: "Two markets resolved.", trace: [{ tool: "market_shape", input: {} }], turns: 2, truncated: false },
        });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://analyst.example.com/prompt");
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({ question: "what resolved?" });
    });

    it("a 404 means this analyst runs no model — reported in its own words", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse(404, { error: "no prompt endpoint on this analyst", reason: "ANTHROPIC_MODEL is unset" }),
        );
        expect(await askAnalyst("q")).toEqual({ state: "no-prompt", reason: "ANTHROPIC_MODEL is unset" });
    });

    it("keeps a refused question apart from an unreachable analyst", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(422, { error: 'body must be {"question": "…"}' }));
        expect(await askAnalyst("q")).toEqual({ state: "refused", error: 'body must be {"question": "…"}' });

        fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "model API answered 529" }));
        expect(await askAnalyst("q")).toEqual({ state: "unreachable", error: "model API answered 529" });

        fetchMock.mockRejectedValueOnce(new Error("network down"));
        expect(await askAnalyst("q")).toMatchObject({ state: "unreachable" });
    });

    it("a 2xx body that is not an answer is UNREADABLE — never handed on as one", async () => {
        // Each of these crashed the card when cast straight to an answer.
        const cases: Array<[unknown, RegExp]> = [
            [{}, /`answer` is neither text nor null/],
            [{ answer: "x" }, /`trace` is not a list/],
            [{ answer: { nested: true }, trace: [] }, /`answer` is neither text nor null/],
            [{ answer: "x", trace: [{ input: {} }] }, /names no tool/],
            [{ answer: "x", trace: [null] }, /names no tool/],
            [null, /not a JSON object/],
            [["x"], /not a JSON object/],
        ];
        for (const [body, reason] of cases) {
            fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
            const outcome = await askAnalyst("q");
            expect(outcome.state).toBe("unreadable");
            expect(outcome.state === "unreadable" && outcome.error).toMatch(reason);
        }
        fetchMock.mockResolvedValueOnce(new Response("<html>proxy page</html>", { status: 200 }));
        expect(await askAnalyst("q")).toMatchObject({ state: "unreadable" });
    });

    it("optional answer fields default rather than fail: a null answer, no turns, no truncated", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { answer: null, trace: [{ tool: "market_shape" }] }));
        expect(await askAnalyst("q")).toEqual({
            state: "answered",
            answer: { answer: null, trace: [{ tool: "market_shape", input: {} }], turns: 0, truncated: false },
        });
    });

    it("an error field that is not text is never handed on as the reason", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(422, { error: { nested: "object" } }));
        expect(await askAnalyst("q")).toEqual({ state: "refused", error: "the analyst answered 422" });
    });

    it("sends the reader's token as a bearer header to the reader's own endpoint", async () => {
        readUserEndpointsMock.mockReturnValue({ analystUrl: "https://analyst.example.com", analystToken: "run-token-1" });
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { answer: "x", trace: [] }));
        await askAnalyst("q");
        const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
        expect(headers.authorization).toBe("Bearer run-token-1");
    });

    it("sends no authorization header when no token is stored", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { answer: "x", trace: [] }));
        await askAnalyst("q");
        const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
        expect(headers).not.toHaveProperty("authorization");
    });

    it("a 401 is the endpoint asking for its token — told apart from a refused question", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "this route requires Authorization: Bearer <token>" }));
        expect(await askAnalyst("q")).toEqual({ state: "needs-token", tokenSent: false });

        readUserEndpointsMock.mockReturnValue({ analystUrl: "https://analyst.example.com", analystToken: "stale" });
        fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "this route requires Authorization: Bearer <token>" }));
        expect(await askAnalyst("q")).toEqual({ state: "needs-token", tokenSent: true });
    });

    it("never reads a /status with the token: the status route asks for none", async () => {
        readUserEndpointsMock.mockReturnValue({ analystUrl: "https://analyst.example.com", analystToken: "run-token-1" });
        fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
        await readAnalystStatus();
        expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit | undefined)?.headers).has("authorization")).toBe(false);
    });

    it("asks nothing at all when no endpoint is configured", async () => {
        readUserEndpointsMock.mockReturnValue({});
        expect(await askAnalyst("q")).toMatchObject({ state: "no-prompt" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("the token goes to the reader's own endpoint only", () => {
    const fetchMock = vi.fn();
    const DEFAULT = "https://deployment-default.example.com";

    beforeEach(() => {
        vi.stubEnv("NEXT_PUBLIC_ANALYST_URL", DEFAULT);
        vi.resetModules();
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockReset();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("with no endpoint override, the build-baked default is asked WITHOUT the stored token", async () => {
        readUserEndpointsMock.mockReturnValue({ analystToken: "run-token-1" });
        const fresh = await import("@/lib/data/analystEndpoint");
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { answer: "x", trace: [] }));
        await fresh.askAnalyst("q");
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(`${DEFAULT}/prompt`);
        expect((init as RequestInit).headers as Record<string, string>).not.toHaveProperty("authorization");
    });
});

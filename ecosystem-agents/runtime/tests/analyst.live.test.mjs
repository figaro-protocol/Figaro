/**
 * The analyst's model loop over the real model API, on the fixture corpus.
 *
 * It needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL, and with either unset it
 * fails, naming both. `npm test` does not select this file; `npm run
 * test:live` runs it. No workflow runs it: a run needs a model account and
 * spends on it, and both are the maintainer's decision. The same loop runs
 * against a stub transport in analyst.test.mjs on every run.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { analystTools, modelConfig, runPrompt } from "../figaro-analyst.mjs";
import { fixtureCorpus } from "./analystFixture.mjs";

const LIVE = modelConfig();
if (!LIVE.enabled) {
    throw new Error(`analyst.live.test.mjs needs ANTHROPIC_API_KEY and ANTHROPIC_MODEL set: ${LIVE.reason}`);
}

test("LIVE: the model loop answers over the real API", async () => {
    const out = await runPrompt(
        "How many processes does this corpus hold, and how many are unattributed? Answer in one sentence.",
        analystTools(fixtureCorpus()), LIVE,
    );
    assert.equal(out.truncated, false);
    assert.ok(out.answer && out.answer.length > 0);
    assert.ok(out.trace.length > 0, "it reached for a tool rather than answering from nothing");
});

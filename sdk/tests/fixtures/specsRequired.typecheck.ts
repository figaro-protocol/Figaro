// Type-checked, never run: tests/dispatchRace.test.ts compiles this file and
// expects no diagnostics. Each seller signing leg takes `specs` as a required
// parameter, so a call that omits it is a compile error, and a call that
// passes it compiles.
import type { WalletClient } from "viem";
import { counterSignOffer, counterSignDraft, quoteDraft, type SellerSignCtx } from "../../src/agent/index.js";
import type { CommitmentPayload } from "../../src/agent/index.js";
import type { SpecSource } from "../../src/index.js";

declare const wallet: WalletClient;
declare const payload: CommitmentPayload;
declare const ctx: SellerSignCtx;
declare const specs: SpecSource;

// @ts-expect-error specs is required
void counterSignOffer(wallet, payload, ctx);
// @ts-expect-error specs is required
void counterSignDraft(wallet, payload, ctx);
// @ts-expect-error specs is required
void quoteDraft(wallet, payload, ctx);

void counterSignOffer(wallet, payload, ctx, specs);
void counterSignDraft(wallet, payload, ctx, specs);
void quoteDraft(wallet, payload, ctx, specs);

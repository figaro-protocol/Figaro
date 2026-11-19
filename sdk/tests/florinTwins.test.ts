/**
 * The florin-gated twins (`assemblies/*-florin.json`): a designer's token as
 * the door to a process, built over the REAL specs, agreements and
 * assemblies. Each twin composes the same agreements as its open original,
 * unchanged, plus `figaro-utility-token` left unfilled in the written file
 * and named, beside it, as the deployment's `florinToken`
 * (`deployTimeCurrency`). The seeding fills the pin with that address
 * (`deployTimeCurrencyOf`, then `fillDeployTimeCurrency`), and the sign gate
 * then refuses an order of the twin in any other token. The originals stay
 * open to any token: the protocol never requires the florin.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
    agreementHashOf,
    composeAuthoredAgreements,
    composeAuthoredProcessDesign,
    deployTimeCurrencyOf,
    fillDeployTimeCurrency,
    processDesignHashOf,
    type BuiltProcessDesign,
    type RegisteredAgreement,
} from "../src/index.js";
import { buildBuyerOffer } from "../src/agent/originate.js";
import type { Address } from "../src/types.js";
import { keyOf, specSourceFromFixtures } from "./specFixtures.js";

const ROOT = path.join(__dirname, "../..");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
const names = (dir: string) => readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".json")).sort();

const SPECS = specSourceFromFixtures(names("clauses").map((f) => f.replace(/\.json$/, "")));
const AGREEMENTS: Record<string, RegisteredAgreement> = Object.fromEntries(
    Object.entries(composeAuthoredAgreements(
        Object.fromEntries(names("agreements").map((f) => [f.replace(/\.json$/, ""), readJson(path.join(ROOT, "agreements", f))])),
        SPECS,
    )).map(([name, { document }]) => [name, document]),
);
const written = (file: string) => readJson(path.join(ROOT, "assemblies", file));
const built = (file: string): BuiltProcessDesign => composeAuthoredProcessDesign(written(file), AGREEMENTS, SPECS);

const FLORIN = "0x097521270f1b6EEc47BD86D834E4995a068B260f" as Address;
const DEPLOYMENT_TOKEN = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;
const OTHER = "0x0000000000000000000000000000000000000002" as Address;
const DEPLOYMENT = { chainId: 11155111, florinToken: FLORIN };

/** Every written process design that names an address of the deployment for its pin. */
const TWINS = names("assemblies").filter((f) => written(f).deployTimeCurrency !== undefined);
/** The open design a twin doubles: `assemblies/<base>.json` when one exists,
 *  else the one agreement `agreements/<base>.json` as a single order. */
const baseOf = (twin: string) => twin.replace(/-florin\.json$/, "");

describe("the florin-gated twins — the reference set holds them", () => {
    it("carries a twin of tradelens, of local-commerce and of each transport agreement", () => {
        expect(TWINS).toEqual([
            "courier-delivery-florin.json",
            "drayage-delivery-florin.json",
            "local-commerce-florin.json",
            "reefer-carriage-florin.json",
            "tradelens-florin.json",
        ]);
    });

    for (const twin of TWINS) {
        describe(twin, () => {
            const base = baseOf(twin);
            const original = existsSync(path.join(ROOT, "assemblies", `${base}.json`)) ? `${base}.json` : undefined;

            it("names the deployment's florin for its pin, and leaves the pin unfilled", () => {
                expect(written(twin).deployTimeCurrency).toEqual({ deployment: "florinToken" });
                expect((written(twin).assemblyClauses as Record<string, unknown>)["figaro-utility-token"]).toEqual({});
            });

            it("composes the same agreements as its original, unchanged, and adds only the pin", () => {
                const t = built(twin).assembly;
                if (original) {
                    const o = built(original).assembly;
                    expect(t.agreements).toEqual(o.agreements);
                    expect(t.assemblyClauses).toEqual({ ...(o.assemblyClauses ?? {}), [keyOf("figaro-utility-token")]: {} });
                    // The original stays open: it composes no pin.
                    expect(o.assemblyClauses?.[keyOf("figaro-utility-token")]).toBeUndefined();
                } else {
                    expect(t.agreements).toHaveLength(1);
                    // The one order binds the written agreement itself: the same key, the same clauses.
                    expect(t.agreements[0].agreementHash).toBe(agreementHashOf(AGREEMENTS[base]));
                    expect(t.agreements[0].follows).toEqual([]);
                    expect(t.assemblyClauses).toEqual({ [keyOf("figaro-utility-token")]: {} });
                }
            });

            it("is filled with the deployment's florin, never the deployment's token, and the florin picks its hash", () => {
                const token = deployTimeCurrencyOf(written(twin), DEPLOYMENT, DEPLOYMENT_TOKEN);
                expect(token).toBe(FLORIN);
                const filled = fillDeployTimeCurrency(built(twin).assembly, token, SPECS);
                expect(filled.assemblyClauses?.[keyOf("figaro-utility-token")]).toEqual({ currency: FLORIN });
                const withOther = fillDeployTimeCurrency(built(twin).assembly, DEPLOYMENT_TOKEN, SPECS);
                expect(processDesignHashOf(filled)).not.toBe(processDesignHashOf(withOther));
                if (original) expect(processDesignHashOf(filled)).not.toBe(processDesignHashOf(built(original).assembly));
            });
        });
    }
});

describe("deployTimeCurrencyOf — the token a written file's pin is filled with", () => {
    it("a file that names no address of the deployment takes the deployment's token", () => {
        expect(deployTimeCurrencyOf(written("equipment-hire.json"), DEPLOYMENT, DEPLOYMENT_TOKEN)).toBe(DEPLOYMENT_TOKEN);
    });

    it("refuses a deployment that lacks the named address, or holds no address there", () => {
        expect(() => deployTimeCurrencyOf(written("tradelens-florin.json"), { chainId: 1 }, DEPLOYMENT_TOKEN)).toThrow(/"florinToken".*not an address/);
        expect(() => deployTimeCurrencyOf(written("tradelens-florin.json"), { florinToken: `0x${"0".repeat(40)}` }, DEPLOYMENT_TOKEN)).toThrow(/not an address/);
        expect(() => deployTimeCurrencyOf({ deployTimeCurrency: {} }, DEPLOYMENT, DEPLOYMENT_TOKEN)).toThrow(/names no address of the deployment/);
    });

    it("refuses a file that names nothing when no deployment token is given", () => {
        expect(() => deployTimeCurrencyOf(written("equipment-hire.json"), DEPLOYMENT, undefined)).toThrow(/not decided/);
    });
});

describe("the sign gate on a florin-gated twin", () => {
    const BUYER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // anvil[0]
    const SELLER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // anvil[1]
    // signTypedData on a local account is offline: no RPC call is made.
    const buyerW = createWalletClient({ account: BUYER, transport: http("http://localhost:0") });
    const twin = built("courier-delivery-florin.json");
    const design = { ...twin, assembly: fillDeployTimeCurrency(twin.assembly, deployTimeCurrencyOf(written("courier-delivery-florin.json"), DEPLOYMENT, undefined), SPECS) };
    // The buyer's fills of the courier-delivery agreement's clauses.
    const overrides = {
        [keyOf("figaro-commerce")]: { lineItems: [{ itemId: "parcel", name: "Parcel delivery", quantity: 1, unitPrice: "1000" }] },
        [keyOf("figaro-geolocation")]: { geocodeStandard: "geohash", origin: "9q8yyk", destination: "9q8yym" },
        [keyOf("figaro-handoff")]: { handoff: ["face-to-face"] },
        [keyOf("figaro-proximity-policy")]: { bands: ["nearby-ble"] },
    };
    const offer = (currency: Address) => buildBuyerOffer(buyerW, {
        assembly: design, seller: SELLER.address, currency, payment: 1000n,
        chainId: 11155111, core: "0x000000000000000000000000000000000000c0de", deadline: 1_900_000_000n, overrides, specs: SPECS,
    });

    it("accepts an order denominated in the florin", async () => {
        const signed = await offer(FLORIN);
        expect(signed.buyerSig).toBeDefined();
        expect(signed.commitment.token).toBe(FLORIN);
        const pin = signed.agreement.clauses.find((c) => c.clause === keyOf("figaro-utility-token"));
        expect(pin?.data?.currency).toBe(FLORIN);
        expect(signed.agreement.provenance?.processDesignHash).toBe(processDesignHashOf(design.assembly));
    });

    it("refuses an order of the same twin in any other token", async () => {
        for (const other of [DEPLOYMENT_TOKEN, OTHER]) {
            await expect(offer(other)).rejects.toThrow(/figaro-utility-token currency: this assembly is denominated by design .* contradicts the pinned term/);
        }
    });
});

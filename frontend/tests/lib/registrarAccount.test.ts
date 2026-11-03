import { afterEach, describe, expect, it } from "vitest";
import { registrarAccount } from "@/scripts/populate-clauses.mjs";

// anvil[0] of the default mnemonic: a key every Foundry install prints, so a
// signer that falls back to it on a public chain signs for anyone.
const ANVIL_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("registrarAccount", () => {
    const saved = process.env.REGISTRAR_PRIVATE_KEY;
    afterEach(() => {
        if (saved === undefined) delete process.env.REGISTRAR_PRIVATE_KEY;
        else process.env.REGISTRAR_PRIVATE_KEY = saved;
    });

    it("signs as anvil[0] on the devnet when no key is set", () => {
        delete process.env.REGISTRAR_PRIVATE_KEY;
        expect(registrarAccount(31337).address).toBe(ANVIL_0);
    });

    it("refuses to sign on any other chain when no key is set", () => {
        delete process.env.REGISTRAR_PRIVATE_KEY;
        expect(() => registrarAccount(11155111)).toThrow(/REGISTRAR_PRIVATE_KEY/);
        expect(() => registrarAccount(1)).toThrow(/REGISTRAR_PRIVATE_KEY/);
    });

    it("signs with the key it is given, on any chain", () => {
        process.env.REGISTRAR_PRIVATE_KEY = KEY;
        expect(registrarAccount(11155111).address).not.toBe(ANVIL_0);
    });
});

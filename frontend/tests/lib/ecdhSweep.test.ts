import { beforeEach, describe, expect, it } from "vitest";
import {
    getOrCreateOrderEcdhKeypair,
    getOrderEcdhKeypair,
    sweepStaleEcdhKeypairs,
} from "@/lib/handoff/ecdh";

const ECDH_KEYS_STORAGE_KEY = "figaro-ecdh-keys";

/**
 * Item 2 — abandoned-ceremony ephemeral-key sweep. An orphaned ECDH keypair
 * (a ceremony that never resolved, so no terminal-event purge fires) must be
 * purgeable by age; a fresh keypair must survive; a pre-upgrade entry with no
 * `createdAt` must be left alone (never wrongly swept).
 */
describe("sweepStaleEcdhKeypairs (item 2)", () => {
    beforeEach(() => sessionStorage.clear());

    it("purges a keypair older than maxAge, keeps a fresh one", () => {
        // Fresh keypair (stamped now).
        getOrCreateOrderEcdhKeypair("0xABC", "order-fresh");
        expect(getOrderEcdhKeypair("0xABC", "order-fresh")).not.toBeNull();

        // A definitely-stale keypair, written directly with an old createdAt.
        const store = JSON.parse(sessionStorage.getItem(ECDH_KEYS_STORAGE_KEY) ?? "{}");
        store["0xabc:order-stale"] = { publicKeyHex: "0xpub", privateKeyHex: "0xpriv", createdAt: 1 };
        sessionStorage.setItem(ECDH_KEYS_STORAGE_KEY, JSON.stringify(store));

        const NOW = 24 * 60 * 60 * 1000 + 1000; // just past a 24h window from t=1
        sweepStaleEcdhKeypairs(NOW, 24 * 60 * 60 * 1000);

        expect(getOrderEcdhKeypair("0xABC", "order-stale")).toBeNull();
        expect(getOrderEcdhKeypair("0xABC", "order-fresh")).not.toBeNull();
    });

    it("never sweeps an entry that has no createdAt (pre-upgrade)", () => {
        const store = { "0xabc:order-old": { publicKeyHex: "0xp", privateKeyHex: "0xk" } };
        sessionStorage.setItem(ECDH_KEYS_STORAGE_KEY, JSON.stringify(store));
        sweepStaleEcdhKeypairs(9_999_999_999, 1);
        expect(getOrderEcdhKeypair("0xABC", "order-old")).not.toBeNull();
    });
});

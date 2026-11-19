import { describe, expect, it } from "vitest";
import { checkContentAddress } from "@/lib/shared/contentAddress";

// Every CID below is what Kubo 0.42 reports for the bytes beside it
// (`ipfs add -nQ` with the flags named, or `ipfs cid format`), so each case
// checks the recomputation against the importer the project pins through.

const SMALL = new TextEncoder().encode('{"a":1}');

/** 600000 bytes of a fixed pattern: three chunks under Kubo's default chunker. */
function bigFile(): Uint8Array {
    const bytes = new Uint8Array(600_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 251;
    return bytes;
}

describe("checkContentAddress — the CID forms a Kubo add or block/put produces", () => {
    const small: [string, string][] = [
        ["CIDv0, the add default", "QmPmgMwMdNnt4ujECmfCvwY9K4heH1qLnMeaLW7XDqxtxH"],
        ["CIDv1 raw, sha2-256 (add --cid-version=1)", "bafkreiablk6x6xgfpiw5ss3vsdyevwaiijzzaxxdh3c45pvomitwvf7ymi"],
        ["CIDv1 dag-pb (add --cid-version=1 --raw-leaves=false)", "bafybeiaviujuxqkkrdn55hizozn6iprfbjzatduuindxfamqbbozdwjrji"],
        ["CIDv1 raw, keccak-256 (add --hash=keccak-256)", "bafkrwibf47bkszjr5niciz4ayhzfoqxerg7vkiioe2mb3qbjsk5vqx7ls4"],
        ["CIDv1 raw in base16", "f01551220015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862"],
        ["CIDv1 raw in base58btc", "zb2rhWjZrNbSeNurrZweDkUdD5nQ9fUxqJFBzsf4mmkHf5Qnu"],
        ["the CIDv0 upgraded to CIDv1 dag-pb in base16", "f017012201545134bc14a88dbde9d19765be43e250a72098e944347728190085d91d9314a"],
    ];
    for (const [form, cid] of small) {
        it(`one chunk, ${form}: the bytes match under ipfs://, /ipfs/ and bare`, () => {
            expect(checkContentAddress(`ipfs://${cid}`, SMALL)).toBe("match");
            expect(checkContentAddress(`/ipfs/${cid}`, SMALL)).toBe("match");
            expect(checkContentAddress(cid, SMALL)).toBe("match");
        });
        it(`one chunk, ${form}: one changed byte is a mismatch`, () => {
            const other = SMALL.slice();
            other[2] ^= 1;
            expect(checkContentAddress(`ipfs://${cid}`, other)).toBe("mismatch");
        });
    }

    const big: [string, string][] = [
        ["CIDv0, dag-pb leaves", "QmXoNkP3DBcSVpFSPw5WZrxs2LvbKDGtvQSmhxNXYYVtwJ"],
        ["CIDv1, raw leaves", "bafybeifm6ozrt4mfvwkwdtw5yk5fk5xbro4pxhthzp4malew6f7df2kada"],
        ["CIDv1, dag-pb leaves", "bafybeicqs2lweowqt5zxnylxm3dug422cprzrah3w4rv3xyllfg363qrne"],
        ["CIDv1, raw leaves, keccak-256", "bafybwickr4q5o732amrtsrxyrhtfmwy4fpmhxx6tu7fefvn3qrnki2ziqi"],
    ];
    for (const [form, cid] of big) {
        it(`three chunks under a balanced root, ${form}: match, and a changed byte in the last chunk is a mismatch`, () => {
            const bytes = bigFile();
            expect(checkContentAddress(`ipfs://${cid}`, bytes)).toBe("match");
            bytes[bytes.length - 1] ^= 1;
            expect(checkContentAddress(`ipfs://${cid}`, bytes)).toBe("mismatch");
        });
    }
});

describe("checkContentAddress — a form it cannot recompute is unverifiable, never trusted", () => {
    it("a file imported with another chunker (add --chunker=size-1000) does not match the default rebuild", () => {
        expect(checkContentAddress("ipfs://QmbScoZ8TVuAQyPqUYxuE3EkNzjXfRQqRZMXGpMgyEAvnL", bigFile())).toBe("mismatch");
    });

    it("sha2-512 (add --hash=sha2-512) is unverifiable", () => {
        const cid = "bafkrgqhpw6uctd4qlltuhw7ccuxbmjav6yvbnuwvvrohralnzvlrctt2k5dstoattchr2cmez5xtrrh4zgrx5kp6ypndkgmdknxxe6c5pk3qo";
        expect(checkContentAddress(`ipfs://${cid}`, SMALL)).toBe("unverifiable");
    });

    it("base36 (k…), a path below the CID, an http locator and a word are unverifiable", () => {
        expect(checkContentAddress("ipfs://k2cwue8omaxkx503iai2aidki69o9adx75tw01cakymyh02rbfp3llr6", SMALL)).toBe("unverifiable");
        expect(checkContentAddress("ipfs://bafkreiablk6x6xgfpiw5ss3vsdyevwaiijzzaxxdh3c45pvomitwvf7ymi/spec.json", SMALL)).toBe("unverifiable");
        expect(checkContentAddress("https://example.org/spec.json", SMALL)).toBe("unverifiable");
        expect(checkContentAddress("ipfs://spec", SMALL)).toBe("unverifiable");
    });
});

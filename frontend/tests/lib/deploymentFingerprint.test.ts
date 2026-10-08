import { describe, it, expect, vi, afterEach } from "vitest";

// The exact Sepolia deployment record's operative address fields. The expected
// fingerprint is the sha256 of the canonical serialization, and it is byte-
// identical to the documented reproduction recipe on /docs/protocol/contracts:
//   jq -j '{...}| to_entries | map(select(.value!=null)) | sort_by(.key)
//          | map("\(.key)=\(.value|ascii_downcase)") | join("\n")' record.json
//     | shasum -a 256
// If a future edit changes the serialization, this expected value changes too —
// which is the point: the number a buyer verifies must never drift silently.
const SEPOLIA_ENV: Record<string, string> = {
    NEXT_PUBLIC_ASSEMBLY_REGISTRY: "0x6e8d1dc453ed558D7F04f76fe0Bc207310040689",
    NEXT_PUBLIC_ATTESTATION_COORDINATOR: "0x494806e367B6b859Dcb9A6CBF1C5bCcAA0eA0B23",
    NEXT_PUBLIC_BATCH_VERIFIER: "0x44050dbca8E532fc179A88FFfb0033382191329a",
    NEXT_PUBLIC_CLAUSE_REGISTRY: "0x7739a17d4C0dcA2dF7f53f79A37251079d212d95",
    NEXT_PUBLIC_FIGARO_CORE: "0xC45891C8a02c9f81Bcd9752FB4AA13878712693F",
    NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS: "0xeeF80cecC72c9f051F79628d6073473dD4061C03",
    NEXT_PUBLIC_MEMBERS_REGISTRY: "0x366f43Aa5656869167aFB2b1cFC62318460D123F",
    NEXT_PUBLIC_MULTISENDER: "0xD152f549545093347A162Dce210e7293f1452150",
    NEXT_PUBLIC_PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    NEXT_PUBLIC_RPGF_MINTER: "0x8dF4047AfF1eF8F233BD3f8BbcF0A8585De6C90A",
    NEXT_PUBLIC_SWAP_QUOTER: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    NEXT_PUBLIC_SWAP_ROUTER: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    NEXT_PUBLIC_USAGE_COUNTER: "0x8AB0c7D010D468E04C9Ca7Ce92e628C5E360891a",
    NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR: "0x5b7d3A222053c0DdC3F2B8f94D3A85DE4DBa867F",
};
const EXPECTED = "99db7853192bd7f7a280c2cf8505a603d10c69f81dc4a9c54f9be3ac02ba02e3";

async function importFresh() {
    vi.resetModules();
    return import("@/lib/shared/deploymentFingerprint");
}

describe("deploymentFingerprint", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("reproduces the canonical Sepolia fingerprint the jq|shasum recipe prints", async () => {
        for (const [k, v] of Object.entries(SEPOLIA_ENV)) vi.stubEnv(k, v);
        const { deploymentFingerprint } = await importFresh();
        expect(deploymentFingerprint()).toBe(EXPECTED);
    });

    it("is case-insensitive on the input addresses (the serialization lowercases)", async () => {
        for (const [k, v] of Object.entries(SEPOLIA_ENV)) vi.stubEnv(k, v.toLowerCase());
        const { deploymentFingerprint } = await importFresh();
        expect(deploymentFingerprint()).toBe(EXPECTED);
    });

    it("withholds the fingerprint when the operative set is incomplete", async () => {
        for (const [k, v] of Object.entries(SEPOLIA_ENV)) vi.stubEnv(k, v);
        vi.stubEnv("NEXT_PUBLIC_FIGARO_CORE", "");
        const { deploymentFingerprint } = await importFresh();
        expect(deploymentFingerprint()).toBeNull();
    });

    it("withholds the fingerprint when the multisender is unset", async () => {
        for (const [k, v] of Object.entries(SEPOLIA_ENV)) vi.stubEnv(k, v);
        vi.stubEnv("NEXT_PUBLIC_MULTISENDER", "");
        const { deploymentFingerprint } = await importFresh();
        expect(deploymentFingerprint()).toBeNull();
    });
});

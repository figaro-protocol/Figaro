import { describe, it, expect, vi, afterEach } from "vitest";

// The Sepolia deployment record's operative address fields, as
// deployments/11155111.json holds them. The expected
// fingerprint is the sha256 of the canonical serialization, and it is byte-
// identical to the documented reproduction recipe on /docs/protocol/contracts:
//   jq -j '{...}| to_entries | map(select(.value!=null)) | sort_by(.key)
//          | map("\(.key)=\(.value|ascii_downcase)") | join("\n")' record.json
//     | shasum -a 256
// If a future edit changes the serialization, this expected value changes too —
// which is the point: the number a buyer verifies must never drift silently.
const SEPOLIA_ENV: Record<string, string> = {
    NEXT_PUBLIC_AGREEMENT_REGISTRY: "0xf971DF5b82fb7ae0Fc583067859ec0189b4A6983",
    NEXT_PUBLIC_ASSEMBLY_REGISTRY: "0x72B894FB53Eac4A0c140526cc765D50F75D02eda",
    NEXT_PUBLIC_ATTESTATION_COORDINATOR: "0x41fdeB462Ae3C3Cde3E9CB9E5118875c15E3898a",
    NEXT_PUBLIC_BATCH_VERIFIER: "0xCb327261eFbEB6C1ce0729AF2D8698421a1Da8Bc",
    NEXT_PUBLIC_CLAUSE_REGISTRY: "0xDd908d94ED4FB2cC498FDC4f8b1E56e6a1733e09",
    NEXT_PUBLIC_FIGARO_CORE: "0x4718CFa294A280F022FC15bFE6318CD5Bd95b6A8",
    NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS: "0x2356f0efadDd06f95285009Ff53f95d7784f27FA",
    NEXT_PUBLIC_MEMBERS_REGISTRY: "0xE88517D8e66f9d0BeCc3ba5C50FB14f18c622B34",
    NEXT_PUBLIC_MULTISENDER: "0xD152f549545093347A162Dce210e7293f1452150",
    NEXT_PUBLIC_PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    NEXT_PUBLIC_RPGF_MINTER: "0x6F2956f8794591Eed24e86BA5F4D0BC03110c0a7",
    NEXT_PUBLIC_SWAP_QUOTER: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    NEXT_PUBLIC_SWAP_ROUTER: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    NEXT_PUBLIC_USAGE_COUNTER: "0xF0d4a44074DbBEC4fa617921310147af34e17781",
    NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR: "0x1dED6C07efE803f3D0a0BA2073Bd10BEc865853E",
};
const EXPECTED = "72383dd554814aaba3a49ea78a13c2476ac08b530ee9a51970d61d2ddd3726f9";

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

    it("withholds the fingerprint when the agreement registry is unset", async () => {
        for (const [k, v] of Object.entries(SEPOLIA_ENV)) vi.stubEnv(k, v);
        vi.stubEnv("NEXT_PUBLIC_AGREEMENT_REGISTRY", "");
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

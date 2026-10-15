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
    NEXT_PUBLIC_AGREEMENT_REGISTRY: "0x7C5ff9b17BD9d05B0d7290F649443b3a91d1FEA4",
    NEXT_PUBLIC_ASSEMBLY_REGISTRY: "0x8E70F4c09243EaAb1Cb5F30Cb5Fd47E8Bca8e6C6",
    NEXT_PUBLIC_ATTESTATION_COORDINATOR: "0x7A15994Bc78d516966F99b4c394aAf0f0706aCEB",
    NEXT_PUBLIC_BATCH_VERIFIER: "0x832d3816afda8863878435762d0b4c0e3aCb85D2",
    NEXT_PUBLIC_CLAUSE_REGISTRY: "0xC250F52beea79A4A8d44e3ac4Feb466530E6606E",
    NEXT_PUBLIC_FIGARO_CORE: "0x7537B979D92d2964e9c504429065a0FCde12f528",
    NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS: "0x6Bb43E3C52dd24CEeD652B9069A97cc9E21c99EB",
    NEXT_PUBLIC_MEMBERS_REGISTRY: "0xFF252dE4c9Af4D65f41730CC45eE528c7b45790a",
    NEXT_PUBLIC_MULTISENDER: "0xD152f549545093347A162Dce210e7293f1452150",
    NEXT_PUBLIC_PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    NEXT_PUBLIC_RPGF_MINTER: "0x15AED66e387532D93b3f7082F76268260a19F4bf",
    NEXT_PUBLIC_SWAP_QUOTER: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    NEXT_PUBLIC_SWAP_ROUTER: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    NEXT_PUBLIC_USAGE_COUNTER: "0x47d4878a96Bd1e5191E724bDc7C0f9121A3f3cDd",
    NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR: "0x695c50706F6445780DC40397EaFff66DfBb02998",
};
const EXPECTED = "b69893dda0edf8860fb9ca1ea85a0326c93c4f86fec4160513abc37493b99dba";

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

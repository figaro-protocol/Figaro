/**
 * addressesFromDeploymentRecord — the deployment-record→FigaroAddresses map.
 *
 * The published record's vocabulary (`figaroCore`, `tokenAddress`) is not
 * the SDK's (`core`, `token`); this is the one place they meet. A record
 * spread verbatim must NOT silently half-work, and extra record keys
 * (coordinators, routers, governance tokens) must not leak through.
 */
import { describe, expect, it } from "vitest";
import { addressesFromDeploymentRecord } from "../src/index.js";

const RECORD = {
    chainId: 31337,
    figaroCore: "0x1b788bD14e2798479f5d984B8B7f9Dd653720Bc7",
    tokenAddress: "0x2C2a169Fb5aD5364205FE77DbbcFA24744c200b2",
    attestationCoordinator: "0xc66312DDc3CFe8e224C1904d05170226D650F159",
    clauseRegistry: "0x33599bF469bE8cB082919a22b6efFC46bD00F0Ba",
    sellerRegistry: "0x6FbDc4b41Bc30713F08A4c82350e203934E97D3e",
    assemblyRegistry: "0x5dd25cb04a82590B4f5221eD489399DA02b37Eb2",
    permit2: "0x09D3bbF6fF8DC6567a9eCD92F6f38AB88be8070d",
    florinToken: "0xE62860dC192eB92f0b270aA8E46E17731c0Ad56e",
} as const;

describe("addressesFromDeploymentRecord", () => {
    it("maps the published record vocabulary onto FigaroAddresses", () => {
        const addresses = addressesFromDeploymentRecord(RECORD);
        expect(addresses).toEqual({
            core: RECORD.figaroCore,
            token: RECORD.tokenAddress,
            attestationCoordinator: RECORD.attestationCoordinator,
            clauseRegistry: RECORD.clauseRegistry,
            sellerRegistry: RECORD.sellerRegistry,
            assemblyRegistry: RECORD.assemblyRegistry,
        });
        // Extra record keys (permit2, florinToken, chainId, …) never leak.
        expect("permit2" in addresses).toBe(false);
        expect("figaroCore" in addresses).toBe(false);
    });

    it("keeps absent optional entries absent rather than undefined-valued", () => {
        const addresses = addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore });
        expect(addresses).toEqual({ core: RECORD.figaroCore });
        expect("token" in addresses).toBe(false);
    });

    it("throws on a record with no kernel address — never a silent half-map", () => {
        expect(() => addressesFromDeploymentRecord({} as never))
            .toThrow(/figaroCore/);
    });
});

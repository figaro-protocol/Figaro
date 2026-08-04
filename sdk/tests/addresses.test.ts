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
    membersRegistry: "0x6FbDc4b41Bc30713F08A4c82350e203934E97D3e",
    assemblyRegistry: "0x5dd25cb04a82590B4f5221eD489399DA02b37Eb2",
    permit2: "0x09D3bbF6fF8DC6567a9eCD92F6f38AB88be8070d",
    florinToken: "0xE62860dC192eB92f0b270aA8E46E17731c0Ad56e",
    swapRouter: "0x8F52DD8ACfAB2d9696F0FE6a51D99abd4443eC1B",
    witnessSwapAndCommitCoordinator: "0x67F046CAfa8Bd95d84AF7c5Dfc7F67966C2B20DF",
    usageCounter: "0x90C38DB6b140cA7376a319a8461c4fB6bE602805",
    rpgfMinter: "0xD92369889aE21b4B6245148aBdBDa028728Af5c2",
    batchVerifier: "0x17e331C83621abB5702735c992a2FCB769DC51C7",
    daoTreasury: "0xA683d1B0Ba731A3993397706579DF152671E2d7E",
    multisender: "0xb27F1A1973B0CdFAe53216425DCaa6d039d1b5AD",
} as const;

describe("addressesFromDeploymentRecord", () => {
    it("maps the published record vocabulary onto FigaroAddresses", () => {
        const addresses = addressesFromDeploymentRecord(RECORD);
        expect(addresses).toEqual({
            core: RECORD.figaroCore,
            token: RECORD.tokenAddress,
            attestationCoordinator: RECORD.attestationCoordinator,
            clauseRegistry: RECORD.clauseRegistry,
            membersRegistry: RECORD.membersRegistry,
            assemblyRegistry: RECORD.assemblyRegistry,
            permit2: RECORD.permit2,
            swapRouter: RECORD.swapRouter,
            witnessSwapAndCommitCoordinator: RECORD.witnessSwapAndCommitCoordinator,
            usageCounter: RECORD.usageCounter,
            rpgfMinter: RECORD.rpgfMinter,
            batchVerifier: RECORD.batchVerifier,
            daoTreasury: RECORD.daoTreasury,
            multisender: RECORD.multisender,
        });
        // Extra record keys not in FigaroDeploymentRecord (florinToken, chainId, …) never leak.
        expect("florinToken" in addresses).toBe(false);
        expect("figaroCore" in addresses).toBe(false);
    });

    it("keeps absent optional entries absent rather than undefined-valued", () => {
        const addresses = addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore });
        expect(addresses).toEqual({ core: RECORD.figaroCore });
        expect("token" in addresses).toBe(false);
        expect("batchVerifier" in addresses).toBe(false);
        expect("usageCounter" in addresses).toBe(false);
        expect("rpgfMinter" in addresses).toBe(false);
        expect("permit2" in addresses).toBe(false);
        expect("swapRouter" in addresses).toBe(false);
        expect("witnessSwapAndCommitCoordinator" in addresses).toBe(false);
        expect("multisender" in addresses).toBe(false);
        expect("daoTreasury" in addresses).toBe(false);
    });

    it("passes through each optional deployment-record key present, one at a time", () => {
        expect(addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore, batchVerifier: RECORD.batchVerifier }))
            .toEqual({ core: RECORD.figaroCore, batchVerifier: RECORD.batchVerifier });
        expect(addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore, usageCounter: RECORD.usageCounter }))
            .toEqual({ core: RECORD.figaroCore, usageCounter: RECORD.usageCounter });
        expect(addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore, rpgfMinter: RECORD.rpgfMinter }))
            .toEqual({ core: RECORD.figaroCore, rpgfMinter: RECORD.rpgfMinter });
        expect(addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore, permit2: RECORD.permit2 }))
            .toEqual({ core: RECORD.figaroCore, permit2: RECORD.permit2 });
        expect(addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore, swapRouter: RECORD.swapRouter }))
            .toEqual({ core: RECORD.figaroCore, swapRouter: RECORD.swapRouter });
        expect(addressesFromDeploymentRecord({
            figaroCore: RECORD.figaroCore,
            witnessSwapAndCommitCoordinator: RECORD.witnessSwapAndCommitCoordinator,
        })).toEqual({ core: RECORD.figaroCore, witnessSwapAndCommitCoordinator: RECORD.witnessSwapAndCommitCoordinator });
        expect(addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore, multisender: RECORD.multisender }))
            .toEqual({ core: RECORD.figaroCore, multisender: RECORD.multisender });
        expect(addressesFromDeploymentRecord({ figaroCore: RECORD.figaroCore, daoTreasury: RECORD.daoTreasury }))
            .toEqual({ core: RECORD.figaroCore, daoTreasury: RECORD.daoTreasury });
    });

    it("throws on a record with no kernel address — never a silent half-map", () => {
        expect(() => addressesFromDeploymentRecord({} as never))
            .toThrow(/figaroCore/);
    });
});

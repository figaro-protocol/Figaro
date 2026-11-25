/**
 * The devnet swap venue's `swap` function, read from its Solidity source
 * (`src/mocks/MockSwapVenue.sol`). The SDK carries no ABI for this test-only
 * contract and `abi/*.json` holds the deployed contracts alone, so a test
 * decodes the route it builds against the contract's own declaration: a
 * changed parameter list there fails the decode here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAbi, type Abi } from "viem";

const SOURCE = path.resolve(process.cwd(), "../src/mocks/MockSwapVenue.sol");

export function mockSwapVenueSwapAbi(): Abi {
    const source = readFileSync(SOURCE, "utf8");
    const m = /function\s+swap\s*\(([^)]*)\)\s*external\s+returns\s*\(\s*uint256\s+\w+\s*\)/.exec(source);
    if (!m) throw new Error(`${SOURCE} declares no swap(...) external returns (uint256)`);
    const params = m[1]!.split(",").map((p) => p.trim().replace(/\s+/g, " ")).join(", ");
    return parseAbi([`function swap(${params}) returns (uint256)`]);
}

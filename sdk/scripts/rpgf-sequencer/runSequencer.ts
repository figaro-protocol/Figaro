import { createPublicClient, http, type Hex } from "viem";
import { buildEventStream } from "./eventStream.js";
import { RpcEventFetcher } from "./fetcher.js";
import { runProver } from "./runProver.js";
import { submitRoot } from "./submitRoot.js";
import type { ProveRequest } from "./types.js";

interface Env {
  rpcUrl: string;
  figaroCore: Hex;
  attestationCoordinator: Hex;
  schemaRegistry: Hex;
  rpgfMinter: Hex;
  submitterPrivateKey: Hex;
  trancheIndex: number;
  trancheBudgetWei: Hex;
  alphaNumerator: number;
  alphaDenominator: number;
  capNumerator: number;
  capDenominator: number;
  fromBlock?: bigint;
  toBlock?: bigint;
  proverManifestPath: string;
}

function readEnv(): Env {
  function need(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`Missing required env var: ${key}`);
    return v;
  }
  function hex(key: string): Hex {
    const v = need(key);
    if (!v.startsWith("0x")) throw new Error(`${key} must be 0x-prefixed`);
    return v as Hex;
  }
  function optBigint(key: string): bigint | undefined {
    const v = process.env[key];
    if (!v) return undefined;
    return BigInt(v);
  }
  function intOrDefault(key: string, dflt: number): number {
    const v = process.env[key];
    return v ? parseInt(v, 10) : dflt;
  }

  return {
    rpcUrl: need("RPC_URL"),
    figaroCore: hex("FIGARO_CORE"),
    attestationCoordinator: hex("ATTESTATION_COORDINATOR"),
    schemaRegistry: hex("SCHEMA_REGISTRY"),
    rpgfMinter: hex("RPGF_MINTER"),
    submitterPrivateKey: hex("RPGF_SUBMITTER_PRIVATE_KEY"),
    trancheIndex: intOrDefault("TRANCHE_INDEX", 0),
    trancheBudgetWei: hex("TRANCHE_BUDGET_WEI"),
    alphaNumerator: intOrDefault("RPGF_ALPHA_NUM", 33),
    alphaDenominator: intOrDefault("RPGF_ALPHA_DEN", 100),
    capNumerator: intOrDefault("RPGF_CAP_NUM", 15),
    capDenominator: intOrDefault("RPGF_CAP_DEN", 100),
    fromBlock: optBigint("RPGF_FROM_BLOCK"),
    toBlock: optBigint("RPGF_TO_BLOCK"),
    proverManifestPath: process.env.PROVER_MANIFEST_PATH ?? "prover/Cargo.toml",
  };
}

async function main() {
  const env = readEnv();
  console.error(`[sequencer] tranche ${env.trancheIndex}, RPC ${env.rpcUrl}`);

  const publicClient = createPublicClient({ transport: http(env.rpcUrl) });

  const fetcher = new RpcEventFetcher({
    client: publicClient,
    figaroCore: env.figaroCore,
    attestationCoordinator: env.attestationCoordinator,
    schemaRegistry: env.schemaRegistry,
    fromBlock: env.fromBlock,
    toBlock: env.toBlock,
  });

  console.error("[sequencer] fetching events …");
  const events = await buildEventStream(fetcher);
  console.error(
    `[sequencer] events: ${events.schemas_registered.length} schemas, ${events.orders_created.length} orders, ${events.processes_resolved.length} resolved processes, ${events.attestations.length} attestations`,
  );

  const request: ProveRequest = {
    events,
    tranche_index: env.trancheIndex,
    tranche_budget_wei: env.trancheBudgetWei,
    alpha_numerator: env.alphaNumerator,
    alpha_denominator: env.alphaDenominator,
    cap_numerator: env.capNumerator,
    cap_denominator: env.capDenominator,
  };

  console.error("[sequencer] running prover (this can take a while on first run) …");
  const proof = await runProver(request, { proverManifestPath: env.proverManifestPath });
  console.error(`[sequencer] proof generated. vkey=${proof.vkey.slice(0, 10)}…`);

  console.error("[sequencer] submitting root on-chain …");
  const txHash = await submitRoot({
    publicClient,
    rpgfMinter: env.rpgfMinter,
    submitterPrivateKey: env.submitterPrivateKey,
    publicValues: proof.public_values,
    proof: proof.proof,
    rpcUrl: env.rpcUrl,
  });
  console.error(`[sequencer] submitted tx ${txHash}`);
  console.log(txHash);
}

main().catch((e) => {
  console.error("[sequencer] error:", e);
  process.exit(1);
});

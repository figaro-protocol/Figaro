import { createWalletClient, http, parseAbi, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPGF_MINTER_ABI = parseAbi([
  "function submitRoot(bytes publicValues, bytes proof) external",
]);

export interface SubmitRootOptions {
  publicClient: PublicClient;
  rpgfMinter: Hex;
  submitterPrivateKey: Hex;
  publicValues: Hex;
  proof: Hex;
  rpcUrl: string;
}

/**
 * Call RpgfMinter.submitRoot with the SP1 proof. Submitter key must
 * match the address RpgfMinter was deployed with — only the registered
 * submitter can invoke submitRoot (phase-1 trust model).
 *
 * Returns the transaction hash on success. The caller can confirm
 * receipt via publicClient.waitForTransactionReceipt if needed.
 */
export async function submitRoot(opts: SubmitRootOptions): Promise<Hex> {
  const account = privateKeyToAccount(opts.submitterPrivateKey);
  const wallet = createWalletClient({
    account,
    chain: opts.publicClient.chain,
    transport: http(opts.rpcUrl),
  });

  // Simulate first — surfaces revert reasons before broadcast.
  const { request } = await opts.publicClient.simulateContract({
    address: opts.rpgfMinter,
    abi: RPGF_MINTER_ABI,
    functionName: "submitRoot",
    args: [opts.publicValues, opts.proof],
    account,
  });

  return wallet.writeContract(request);
}

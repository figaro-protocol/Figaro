#![no_main]
sp1_zkvm::entrypoint!(main);

use figaro_rpgf::aggregate;
use figaro_rpgf::types::TrancheInput;

fn main() {
    let input: TrancheInput = sp1_zkvm::io::read();
    let output = aggregate(&input);
    // Commit ABI-encoded bytes so RpgfMinter.submitRoot's
    // abi.decode((uint8, bytes32, uint256, uint32)) reads them directly.
    // Using io::commit (bincode) would mis-shape the public values for
    // the on-chain decode.
    let abi_bytes = output.abi_encode_public_values();
    sp1_zkvm::io::commit_slice(&abi_bytes);
}

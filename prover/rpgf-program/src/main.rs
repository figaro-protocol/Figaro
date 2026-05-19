#![no_main]
sp1_zkvm::entrypoint!(main);

use figaro_rpgf::aggregate;
use figaro_rpgf::types::TrancheInput;

fn main() {
    let input: TrancheInput = sp1_zkvm::io::read();
    let output = aggregate(&input);
    sp1_zkvm::io::commit(&output);
}

//! The guest's cycles against the size of the stored state — the measurement
//! behind the incremental state root. Ignored by default (it runs the guest
//! in SP1's executor several times); run it with
//! `cargo test --release -p figaro-prove-test --test guest_cycles -- --ignored --nocapture`.
//!
//! The canonical batch (`build_canonical_batch_input`) runs on its own state
//! plus `n` unrelated resolved orders. The guest receives only the witness of
//! the entries the batch touches, so its cycles should not grow with `n`.

use alloy_primitives::{Address, B256, U256};
use figaro_kernel::kernel::guest_input;
use figaro_kernel::types::ProcessState;
use figaro_prove_test::build_canonical_batch_input;
use sp1_sdk::{Prover, ProverClient, SP1Stdin};

#[tokio::test]
#[ignore]
async fn the_guests_cycles_do_not_grow_with_the_stored_state() {
    let elf = sp1_sdk::include_elf!("figaro-prover");
    let client = ProverClient::builder().mock().build().await;
    let mut cycles = Vec::new();
    for n in [0usize, 1_000, 10_000] {
        let mut input = build_canonical_batch_input();
        for i in 0..n {
            let key = B256::from(U256::from(i as u64 + 1) << 128);
            input.prev_state.processes.push((
                key,
                ProcessState {
                    root_buyer: Address::repeat_byte(1),
                    currency: Address::repeat_byte(2),
                    cumulative_value: U256::from(100u64),
                    active_order_count: 0,
                },
            ));
            input.prev_state.order_status.push((key, 2));
        }
        let guest = guest_input(&input).expect("the canonical batch's witness");
        let mut stdin = SP1Stdin::new();
        stdin.write(&guest);
        let (_, report) = client.execute(elf.clone(), stdin).await.expect("the guest executes");
        let total = report.total_instruction_count();
        println!("CYCLES stored_orders={n} cycles={total}");
        cycles.push(total);
    }
    // A tree path grows with the logarithm of the state: allow a margin,
    // never a factor of the state.
    assert!(cycles[2] < cycles[0] * 2, "cycles grew with the stored state: {cycles:?}");
}

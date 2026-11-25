//! The guest's cycles: a measurement, not a test, so it is an example
//! target the test suite builds and never runs. Run it with
//! `cargo run --release -p figaro-prove-test --example guest_cycles`; it
//! executes the guest in SP1's executor several times and prints one
//! `CYCLES …` line per run, the lines `docs/SCALING_STRATEGY.md` and
//! `docs/TESTING.md` cite, and exits non-zero when a bound below fails.
//!
//! Two measurements:
//!
//! - Against the size of the stored state, the measurement behind the
//!   incremental state root. The canonical batch
//!   (`build_canonical_batch_input`) runs on its own state plus `n`
//!   unrelated resolved orders. The guest receives only the witness of the
//!   entries the batch touches, so its cycles should not grow with `n`.
//! - For a full batch: the hundred operations a relay's batch is cut at by
//!   default (`MAX_BATCH_OPS`), as twenty-five processes of a commit, two
//!   attestations and a resolve each, with their usage claims, beside the
//!   canonical batch. A batch's cycles grow with its operations and no
//!   faster: twenty-five times the operations cost no more than twenty-five
//!   times the cycles.

use alloy_primitives::{Address, B256, U256};
use figaro_kernel::kernel::guest_input;
use figaro_kernel::types::{BatchInput, ProcessState};
use figaro_prove_test::{build_batch_input_of, build_canonical_batch_input};
use sp1_sdk::{Prover, ProverClient, SP1Stdin};

/// The guest's cycle count for one batch, in SP1's executor.
async fn cycles_of(input: &BatchInput) -> u64 {
    let elf = sp1_sdk::include_elf!("figaro-prover");
    let client = ProverClient::builder().mock().build().await;
    let guest = guest_input(input).expect("the batch's witness");
    let mut stdin = SP1Stdin::new();
    stdin.write(&guest);
    let (_, report) = client
        .execute(elf, stdin)
        .await
        .expect("the guest executes");
    report.total_instruction_count()
}

async fn the_guests_cycles_do_not_grow_with_the_stored_state() {
    let mut cycles = Vec::new();
    for n in [0usize, 1_000, 10_000] {
        let mut input = build_canonical_batch_input();
        for i in 0..n {
            let key = B256::from(U256::from(i as u64 + 1) << 128);
            input.prev_state.processes.push((
                key,
                ProcessState {
                    root_buyer: Address::repeat_byte(1),
                    token: Address::repeat_byte(2),
                    running_total: U256::from(100u64),
                    active_order_count: 0,
                },
            ));
            input.prev_state.order_status.push((key, 2));
        }
        let total = cycles_of(&input).await;
        println!("CYCLES stored_orders={n} cycles={total}");
        cycles.push(total);
    }
    // A tree path grows with the logarithm of the state: allow a margin,
    // never a factor of the state.
    assert!(
        cycles[2] < cycles[0] * 2,
        "cycles grew with the stored state: {cycles:?}"
    );
}

async fn the_guests_cycles_for_a_full_batch() {
    let mut cycles = Vec::new();
    for processes in [1usize, 25] {
        let input = build_batch_input_of(processes);
        let operations = input.operations.len();
        let total = cycles_of(&input).await;
        println!("CYCLES operations={operations} cycles={total}");
        cycles.push(total);
    }
    assert!(
        cycles[1] <= cycles[0] * 25,
        "a full batch's cycles grew faster than its operations: {cycles:?}"
    );
}

#[tokio::main]
async fn main() {
    the_guests_cycles_do_not_grow_with_the_stored_state().await;
    the_guests_cycles_for_a_full_batch().await;
}

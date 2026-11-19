//! The proof program carries no registration operation. Registering a
//! clause, an agreement, an assembly or a member stays on the direct path
//! (`KernelOp`'s doc comment in `src/types.rs`), so no variant of `KernelOp`
//! may be one.
//!
//! `kind` matches `KernelOp` exhaustively, with no wildcard arm: a new
//! variant stops this file from compiling until it is named here, and the
//! test then asserts that the name is not a registration.

use figaro_kernel::types::KernelOp;

/// One name per variant of `KernelOp`, written by hand so a new variant is
/// read and named before the suite compiles again.
const KINDS: [&str; 6] = [
    "Commit",
    "Resolve",
    "ResolveByWalletCode",
    "AttestAsSeller",
    "AttestAsBuyer",
    "AttestByWalletCode",
];

/// The variant's name. No wildcard arm: an added variant fails to compile.
#[allow(dead_code)]
fn kind(op: &KernelOp) -> &'static str {
    match op {
        KernelOp::Commit { .. } => KINDS[0],
        KernelOp::Resolve { .. } => KINDS[1],
        KernelOp::ResolveByWalletCode { .. } => KINDS[2],
        KernelOp::AttestAsSeller { .. } => KINDS[3],
        KernelOp::AttestAsBuyer { .. } => KINDS[4],
        KernelOp::AttestByWalletCode { .. } => KINDS[5],
    }
}

#[test]
fn no_kernel_op_is_a_registration() {
    for name in KINDS {
        let lower = name.to_ascii_lowercase();
        assert!(
            !lower.contains("regist") && !lower.contains("publish") && !lower.contains("member"),
            "KernelOp::{name} reads as a registration; registration stays on the direct path"
        );
    }
}

#[test]
fn every_kernel_op_kind_is_named_once() {
    let mut names = KINDS.to_vec();
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), KINDS.len(), "a KernelOp name appears twice");
}

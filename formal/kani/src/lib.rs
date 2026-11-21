//! Kani proof harnesses for the bonding arithmetic of the proof program's
//! mirror of the Core (`prover/lib/src/kernel.rs`).
//!
//! What the harnesses reach. A harness outside `prover/lib` reaches only the
//! crate's public items, and `prover/lib` carries no Kani attribute:
//!
//! - `kernel::resolution_payouts`, the one place the guest computes the two
//!   payout legs of a resolved order (seller `2 × runningTotal + payment`,
//!   buyer `payment`);
//! - `operation_stream::resolved_running_total`, the cumulative value a
//!   resolve signs, the sum of the listed payments.
//!
//! The two bonds (buyer `2 × payment`, seller `2 × runningTotal`) are
//! computed inside `apply_commit`, and the netting of deposits and payouts
//! inside `TokenTracker`; both are private to `kernel.rs`. Their only public
//! caller is `apply_operations`, which recovers secp256k1 signatures and
//! hashes with keccak before any bond is computed. So the harnesses below
//! state the two bond formulas as the Core defines them
//! (`FigaroCore.commit`, mirrored at `kernel.rs` `apply_commit`) and prove
//! the payouts against them; they do not prove that `apply_commit` computes
//! them, nor anything about `TokenTracker`.
//!
//! Out of reach, each because the item is private to `prover/lib/src/kernel.rs`
//! and this crate adds no attribute there:
//!
//! - the bonds: `apply_commit` (`fn apply_commit`, private) computes the
//!   buyer's `2 × payment` and the seller's `2 × runningTotal` and checks
//!   their overflow;
//! - the netting: `TokenTracker::deposit`, `TokenTracker::payout` and
//!   `TokenTracker::net_positions` (`struct TokenTracker`, private) add up
//!   each (token, user)'s deposits and payouts across a batch;
//! - across a batch, that no user's payouts exceed what the batch and the
//!   state locked for it, which needs the two above and the state.
//!
//! `apply_operations` is public and reaches all three, but every commit and
//! every signed resolve first recovers a secp256k1 signature over a keccak
//! digest, which CBMC cannot invert, so a harness through it proves nothing
//! past the signature check.
//!
//! Run: `scripts/test-kani.sh`.

#[cfg(kani)]
mod proofs {
    use alloy_primitives::{Address, B256, U256};
    use figaro_kernel::kernel::resolution_payouts;
    use figaro_kernel::operation_stream::resolved_running_total;
    use figaro_kernel::types::Commitment;

    fn any_u256() -> U256 {
        U256::from_limbs(kani::any::<[u64; 4]>())
    }

    fn commitment(payment: U256, running_total: U256) -> Commitment {
        Commitment {
            process_id: B256::ZERO,
            buyer: Address::ZERO,
            seller: Address::ZERO,
            token: Address::ZERO,
            payment,
            running_total,
            checkout_hash: B256::ZERO,
            salt: U256::ZERO,
            commit_deadline: U256::ZERO,
        }
    }

    /// The payout legs never panic and never wrap: the call fails exactly
    /// when `2 × runningTotal + payment` passes 2^256, and otherwise returns
    /// the seller's `2 × runningTotal + payment` and the buyer's `payment`.
    #[kani::proof]
    #[kani::unwind(34)]
    fn payouts_are_exact_or_overflow() {
        let p = any_u256();
        let rt = any_u256();
        let wide = rt
            .checked_mul(U256::from(2))
            .and_then(|d| d.checked_add(p));
        match resolution_payouts(&commitment(p, rt)) {
            Ok((seller, buyer)) => {
                assert!(wide.is_some());
                assert_eq!(seller, wide.unwrap());
                assert_eq!(buyer, p);
            }
            Err(_) => assert!(wide.is_none()),
        }
    }

    /// One order conserves its bonds: what resolution pays out equals what
    /// commit locked (buyer `2 × payment` plus seller `2 × runningTotal`),
    /// no leg exceeds the total locked, and the buyer's leg never exceeds the
    /// buyer's own bond. Over every payment and running total whose bonds fit.
    #[kani::proof]
    #[kani::unwind(34)]
    fn one_order_conserves_its_bonds() {
        let p = any_u256();
        let rt = any_u256();
        let two = U256::from(2);
        let (Some(buyer_bond), Some(seller_bond)) = (p.checked_mul(two), rt.checked_mul(two))
        else {
            return;
        };
        let Some(locked) = buyer_bond.checked_add(seller_bond) else {
            return;
        };
        let (seller, buyer) = resolution_payouts(&commitment(p, rt))
            .expect("bonds that fit give payouts that fit");
        assert_eq!(seller.checked_add(buyer), Some(locked));
        assert!(le(seller, locked));
        assert!(le(buyer, buyer_bond));
        assert!(le(buyer, locked));
    }

    /// `a <= b` limb by limb. `U256`'s own ordering reaches the x86-64
    /// `_subborrow_u64` intrinsic, which Kani does not model.
    fn le(a: U256, b: U256) -> bool {
        let (a, b) = (a.as_limbs(), b.as_limbs());
        for i in (0..4).rev() {
            if a[i] != b[i] {
                return a[i] < b[i];
            }
        }
        true
    }

    /// A process of two orders, each committed under the Core's rule (the
    /// k-th order's running total is the sum of the first k payments): the
    /// cumulative value a resolve signs is the last running total, and the
    /// sum of every payout equals the sum of every bond, with no overflow in
    /// the payouts once the bonds fit. Two orders, not more: a third symbolic
    /// 256-bit payment drove CBMC past the 8 GB of the machine it first ran
    /// on, and `one_order_conserves_its_bonds` already holds each order alone.
    #[kani::proof]
    #[kani::unwind(34)]
    fn a_process_conserves_its_bonds() {
        let two = U256::from(2);
        let mut orders = Vec::new();
        let mut running = U256::ZERO;
        let mut locked = U256::ZERO;
        for _ in 0..2 {
            let p = any_u256();
            kani::assume(!p.is_zero());
            let Some(next) = running.checked_add(p) else {
                return;
            };
            running = next;
            let (Some(b), Some(s)) = (p.checked_mul(two), running.checked_mul(two)) else {
                return;
            };
            let Some(l) = locked.checked_add(b).and_then(|l| l.checked_add(s)) else {
                return;
            };
            locked = l;
            orders.push(commitment(p, running));
        }
        assert_eq!(resolved_running_total(&orders), Some(running));
        let mut paid = U256::ZERO;
        for c in &orders {
            let (seller, buyer) =
                resolution_payouts(c).expect("bonds that fit give payouts that fit");
            paid = paid
                .checked_add(seller)
                .and_then(|x| x.checked_add(buyer))
                .expect("payouts that sum to the bonds fit");
        }
        assert_eq!(paid, locked);
    }

    /// The cumulative value a resolve signs is `None` exactly when the listed
    /// payments sum past 2^256, and the exact sum otherwise.
    #[kani::proof]
    #[kani::unwind(34)]
    fn resolved_running_total_is_the_exact_sum() {
        let a = any_u256();
        let b = any_u256();
        let orders = [commitment(a, U256::ZERO), commitment(b, U256::ZERO)];
        assert_eq!(resolved_running_total(&orders), a.checked_add(b));
    }
}

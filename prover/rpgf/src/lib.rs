// figaro-rpgf — Retroactive Public Goods Funding aggregator.
//
// Computes per-clause-author allocations of the FIG staged-airdrop
// budget from per-clause cumulative statistics, using the V5 formula
// from sdk/scripts/rpgf-simulator. Output is a Merkle root over
// (clauseAuthor, amount) leaves matching RpgfMinter's leaf
// format: `keccak256(abi.encodePacked(recipient, amount))`.
//
// SP1 entrypoint: see ../rpgf-program/.
//
// Parallel crate seam: a future `figaro-clauses` crate would provide
// the Layer B byte-for-byte Rust mirror of TypeScript clause content
// validators (`sdk/src/clauses`). That work is independent of RPGF —
// the RPGF aggregator consumes pre-aggregated per-clause stats, not
// raw attestation content.

pub mod aggregator;
pub mod events;
pub mod formula;
pub mod merkle;
pub mod snapshots;
pub mod types;

pub use aggregator::aggregate;
pub use events::{AttestationEvent, EventStream, OrderCreatedEvent, ProcessResolvedEvent, ClauseRegisteredEvent};
pub use formula::{score, tier1_weight, WeightBreakdown};
pub use merkle::{build_merkle_root, leaf_hash};
pub use snapshots::build_tranche_input;
pub use types::{ClauseSnapshot, TrancheInput, TrancheOutput};

// figaro-rpgf — Retroactive Public Goods Funding aggregator.
//
// Computes per-schema-author allocations of the FIG staged-airdrop
// budget from per-schema cumulative statistics, using the V5 formula
// from sdk/scripts/rpgf-simulator. Output is a Merkle root over
// (schemaAuthor, amount) leaves matching RpgfMinter's leaf
// format: `keccak256(abi.encodePacked(recipient, amount))`.
//
// SP1 entrypoint: see ../rpgf-program/.
//
// Parallel crate seam: a future `figaro-schemas` crate would provide
// the Layer B byte-for-byte Rust mirror of TypeScript schema content
// validators (`sdk/src/schemas`). That work is independent of RPGF —
// the RPGF aggregator consumes pre-aggregated per-schema stats, not
// raw attestation content.

pub mod aggregator;
pub mod events;
pub mod formula;
pub mod merkle;
pub mod snapshots;
pub mod types;

pub use aggregator::aggregate;
pub use events::{AttestationEvent, EventStream, OrderCreatedEvent, ProcessResolvedEvent, SchemaRegisteredEvent};
pub use formula::{score, tier1_weight, WeightBreakdown};
pub use merkle::{build_merkle_root, leaf_hash};
pub use snapshots::build_tranche_input;
pub use types::{SchemaSnapshot, TrancheInput, TrancheOutput};

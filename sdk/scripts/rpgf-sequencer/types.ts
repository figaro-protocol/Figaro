// Wire-format types matching the serde shapes in prover/rpgf/src/events.rs
// + prover/rpgf-script/src/main.rs. BigInts are encoded as hex strings
// (alloy's default U256 serialization), addresses + bytes32 as the same.
// Field names are snake_case to match Rust's default serde.

export type Hex = `0x${string}`;

export interface ClauseRegisteredEvent {
  clause_id: Hex;
  version: number;
  uri_hash: Hex;
  registrar: Hex;
}

export interface OrderCreatedEvent {
  order_hash: Hex;
  process_id: Hex;
  buyer: Hex;
  seller: Hex;
  currency: Hex;
  payment: Hex; // U256-hex
  cumulative_value: Hex; // U256-hex
  chain_position: number;
}

export interface ProcessResolvedEvent {
  process_id: Hex;
}

export interface AttestationEvent {
  order_hash: Hex;
  process_id: Hex;
  attester: Hex;
  clause_id: Hex;
  stage: number;
  content_ref: Hex;
}

export interface EventStream {
  clauses_registered: ClauseRegisteredEvent[];
  orders_created: OrderCreatedEvent[];
  processes_resolved: ProcessResolvedEvent[];
  attestations: AttestationEvent[];
}

export interface ProveRequest {
  events: EventStream;
  tranche_index: number;
  tranche_budget_wei: Hex; // U256-hex
  alpha_numerator: number;
  alpha_denominator: number;
  cap_numerator: number;
  cap_denominator: number;
}

export interface ProveResponse {
  public_values: Hex;
  proof: Hex;
  vkey: Hex;
}

export function bigintToHex(v: bigint): Hex {
  return `0x${v.toString(16)}`;
}

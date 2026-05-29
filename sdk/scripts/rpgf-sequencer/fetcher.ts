import { parseAbiItem, type PublicClient } from "viem";
import type {
  AttestationEvent,
  Hex,
  OrderCreatedEvent,
  ProcessResolvedEvent,
  ClauseRegisteredEvent,
} from "./types.js";
import { bigintToHex } from "./types.js";
import { computeChainPositions, type CommittedLogWithPosition } from "./chainPosition.js";

/**
 * Progressive indexing seam — current implementation is Level 0A
 * (direct viem.getLogs, no caching, server-side / one-shot).
 * Future implementations can swap to Level 0B (self-hosted indexer)
 * or Level 1 (Sequence, Envio, subgraph) without touching the
 * sequencer's higher-level logic. See frontend/lib/core/indexer.ts
 * for the existing browser-side progressive layer; the abstraction
 * mirrors that "swap point" design.
 */
export interface EventFetcher {
  fetchClausesRegistered(): Promise<ClauseRegisteredEvent[]>;
  fetchOrdersCreated(): Promise<OrderCreatedEvent[]>;
  fetchProcessesResolved(): Promise<ProcessResolvedEvent[]>;
  fetchAttestations(): Promise<AttestationEvent[]>;
}

export interface RpcEventFetcherConfig {
  client: PublicClient;
  figaroCore: Hex;
  attestationCoordinator: Hex;
  clauseRegistry: Hex;
  fromBlock?: bigint;
  toBlock?: bigint;
}

const EV_CLAUSE_REGISTERED = parseAbiItem(
  "event ClauseRegistered(bytes32 indexed clauseId, uint64 version, bytes32 uriHash, address indexed registrar)",
);

const EV_ORDER_COMMITTED = parseAbiItem(
  "event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 cumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)",
);

const EV_PROCESS_RESOLVED = parseAbiItem(
  "event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount)",
);

const EV_ATTESTATION = parseAbiItem(
  "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
);

export class RpcEventFetcher implements EventFetcher {
  constructor(private readonly cfg: RpcEventFetcherConfig) {}

  private range() {
    return {
      fromBlock: this.cfg.fromBlock,
      toBlock: this.cfg.toBlock,
    };
  }

  async fetchClausesRegistered(): Promise<ClauseRegisteredEvent[]> {
    const logs = await this.cfg.client.getLogs({
      address: this.cfg.clauseRegistry,
      event: EV_CLAUSE_REGISTERED,
      ...this.range(),
    });
    return logs.map((log) => {
      const args = log.args as {
        clauseId: Hex;
        version: bigint;
        uriHash: Hex;
        registrar: Hex;
      };
      return {
        clause_id: args.clauseId,
        version: Number(args.version),
        uri_hash: args.uriHash,
        registrar: args.registrar,
      };
    });
  }

  async fetchOrdersCreated(): Promise<OrderCreatedEvent[]> {
    const logs = await this.cfg.client.getLogs({
      address: this.cfg.figaroCore,
      event: EV_ORDER_COMMITTED,
      ...this.range(),
    });

    // First derive chain_position from the same log stream.
    const positioned: CommittedLogWithPosition[] = logs.map((log) => {
      const args = log.args as { orderHash: Hex; processId: Hex };
      return {
        order_hash: args.orderHash,
        process_id: args.processId,
        block_number: Number(log.blockNumber ?? 0n),
        log_index: Number(log.logIndex ?? 0),
      };
    });
    const positions = computeChainPositions(positioned);

    return logs.map((log) => {
      const args = log.args as {
        orderHash: Hex;
        processId: Hex;
        buyer: Hex;
        seller: Hex;
        currency: Hex;
        payment: bigint;
        cumulativeValue: bigint;
      };
      const pos = positions.get(args.orderHash) ?? 1;
      return {
        order_hash: args.orderHash,
        process_id: args.processId,
        buyer: args.buyer,
        seller: args.seller,
        currency: args.currency,
        payment: bigintToHex(args.payment),
        cumulative_value: bigintToHex(args.cumulativeValue),
        chain_position: pos,
      };
    });
  }

  async fetchProcessesResolved(): Promise<ProcessResolvedEvent[]> {
    const logs = await this.cfg.client.getLogs({
      address: this.cfg.figaroCore,
      event: EV_PROCESS_RESOLVED,
      ...this.range(),
    });
    return logs.map((log) => {
      const args = log.args as { processId: Hex };
      return { process_id: args.processId };
    });
  }

  async fetchAttestations(): Promise<AttestationEvent[]> {
    const logs = await this.cfg.client.getLogs({
      address: this.cfg.attestationCoordinator,
      event: EV_ATTESTATION,
      ...this.range(),
    });
    return logs.map((log) => {
      const args = log.args as {
        orderHash: Hex;
        processId: Hex;
        attester: Hex;
        clauseId: Hex;
        stage: number;
        contentRef: Hex;
      };
      return {
        order_hash: args.orderHash,
        process_id: args.processId,
        attester: args.attester,
        clause_id: args.clauseId,
        stage: Number(args.stage),
        content_ref: args.contentRef,
      };
    });
  }
}

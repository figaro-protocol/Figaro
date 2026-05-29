import type { EventFetcher } from "./fetcher.js";
import type { EventStream } from "./types.js";

/**
 * Assemble a full EventStream for one tranche window by issuing four
 * parallel getLogs calls and joining. Pure orchestration — no
 * aggregation logic. The Rust prover applies the V5 filter chain
 * (resolved-only, known-order) inside the SP1 program.
 */
export async function buildEventStream(fetcher: EventFetcher): Promise<EventStream> {
  const [clauses_registered, orders_created, processes_resolved, attestations] =
    await Promise.all([
      fetcher.fetchClausesRegistered(),
      fetcher.fetchOrdersCreated(),
      fetcher.fetchProcessesResolved(),
      fetcher.fetchAttestations(),
    ]);
  return { clauses_registered, orders_created, processes_resolved, attestations };
}

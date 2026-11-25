/**
 * The one stand-in for `@/lib/core/contracts` the unit tests share: the real
 * module, with the Core's and the verifier's addresses and the two resolvers
 * a test points elsewhere. From an async factory, as Vitest hoists `vi.mock`:
 *
 *     vi.mock("@/lib/core/contracts", async (importOriginal) =>
 *         (await import("../support/contractsMock")).contractsMock(await importOriginal(), {
 *             contracts: { core: CORE, batchVerifier: VERIFIER },
 *             batchVerifier: () => VERIFIER,
 *         }));
 *
 * `contracts` replaces `CONTRACTS` whole; `core` keeps the module's
 * `CONTRACTS` and names another Core. The real `getBatchVerifier` and
 * `getAttestationCoordinator` read the module's own record, never the
 * `CONTRACTS` given here, so a test that needs them to answer names them.
 */
type Address = string;

export interface ContractsMockOptions {
    contracts?: { core: Address; batchVerifier: Address };
    core?: Address;
    batchVerifier?: () => Address | null | undefined;
    coordinator?: () => Address | null | undefined;
}

export function contractsMock<M extends { CONTRACTS: object }>(actual: M, options: ContractsMockOptions): M {
    return {
        ...actual,
        ...(options.contracts ? { CONTRACTS: options.contracts } : {}),
        ...(options.core !== undefined && !options.contracts ? { CONTRACTS: { ...actual.CONTRACTS, core: options.core } } : {}),
        ...(options.batchVerifier ? { getBatchVerifier: options.batchVerifier } : {}),
        ...(options.coordinator ? { getAttestationCoordinator: options.coordinator } : {}),
    };
}

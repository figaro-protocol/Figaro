/**
 * The revert tables every K4 staked-intent registry shares: the register
 * reverts common to all of them, and the reverts of the two withdrawal calls
 * (`requestWithdrawal` and `withdraw`). Pure
 * functions, with no wallet and no client: each registry's read module
 * (`useClauseRegistry.ts`, `useProcessRegistry.ts`, `useAgreementRegistry.ts`)
 * builds its own tables on them, and the withdraw hooks
 * (`useWithdrawStake.ts`) take the withdraw table from here.
 */

/**
 * The register/publish reverts every registry shares — the stake that changed
 * between read and send, and the empty pin — as a message, or null for a
 * revert only one registry has. Each register translator's table ends in it.
 */
export function sharedRegisterRevertMessage(
    errorName: string | undefined,
    args: readonly unknown[] | undefined,
): string | null {
    switch (errorName) {
        case "WrongDeposit": {
            const provided = (args?.[0] as bigint | undefined)?.toString() ?? "?";
            const required = (args?.[1] as bigint | undefined)?.toString() ?? "?";
            return `Registration stake mismatch (provided ${provided} wei, required ${required} wei). The stake amount changed between the read and the send — retry.`;
        }
        case "EmptyContentURI":
            return "The IPFS pin returned an empty URI.";
        default:
            return null;
    }
}

/**
 * The shared revert table of `requestWithdrawal` and `withdraw` — the on-chain
 * guards only (registeredBy-only, once-only, must-exist, the cooldown; the commits==resolves gate is
 * off-chain/advisory via `useWithdrawGate`). The registries' tables
 * differed only by noun, so the noun is the parameter; the assembly keeps
 * "composition" for the must-exist case because the binding's identity IS
 * the composition.
 */
export function withdrawRevertMessage(noun: "clause" | "assembly" | "agreement") {
    return (errorName: string | undefined): string | null => {
        switch (errorName) {
            case "AlreadyWithdrawn":
                return `This ${noun}'s registration stake has already been requested back.`;
            case "NothingPending":
                return `No stake is waiting to be claimed for this ${noun}.`;
            case "CooldownActive":
                return "The cooldown has not passed yet; the stake can be claimed once it has.";
            case "NotRegisteredBy":
                return `Only the wallet that registered this ${noun} can reclaim its registration stake.`;
            case "NotRegistered":
                return noun === "assembly"
                    ? "No registration binding exists for this composition."
                    : `No registration binding exists for this ${noun}.`;
            case "TransferFailed":
                return "The stake transfer failed. The stake is still waiting to be claimed — retry.";
            default:
                return null;
        }
    };
}

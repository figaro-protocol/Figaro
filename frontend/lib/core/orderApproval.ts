import { TEST_HELPERS_ENABLED, windowSafe, getMockFn } from "@/lib/core/testHelpers";
import type { PermitSignature } from "@/hooks/core/useTokenApproval";

interface ApprovalSatisfiedArgs {
    amount: bigint;
    currency?: string;
    mockApproved?: boolean;
    hasPermit?: boolean;
    needsApproval: (amount?: bigint) => boolean;
}

interface ApproveAmountArgs {
    amount: bigint;
    currency: string;
    approve: (amount: bigint) => unknown | Promise<unknown>;
    refetchAllowance?: (() => unknown | Promise<unknown>) | undefined;
}

interface SignPermitWithFallbackArgs {
    amount: bigint;
    signPermitForTx: (amount: bigint) => Promise<PermitSignature>;
    onPermitSigned: (permit: PermitSignature) => void;
    onFallbackApprove: () => Promise<void>;
}

export function getTestHelperAllowance(currency?: string): bigint | null {
    if (!TEST_HELPERS_ENABLED || !currency) return null;

    try {
        const appWindow = windowSafe();
        if (!appWindow?.__FIGARO_ALLOWANCES__) return null;

        const value = appWindow.__FIGARO_ALLOWANCES__[currency.toLowerCase()];
        return value ? BigInt(value) : null;
    } catch {
        return null;
    }
}

export function clearTestHelperAllowance(currency?: string): void {
    if (!TEST_HELPERS_ENABLED || !currency) return;

    try {
        const appWindow = windowSafe();
        if (appWindow?.__FIGARO_ALLOWANCES__) {
            delete appWindow.__FIGARO_ALLOWANCES__[currency.toLowerCase()];
        }
    } catch {
        // Best-effort cleanup for the E2E allowance shim.
    }
}

export function isApprovalSatisfied({
    amount,
    currency,
    mockApproved = false,
    hasPermit = false,
    needsApproval,
}: ApprovalSatisfiedArgs): boolean {
    if (amount <= 0n) return false;
    if (mockApproved || hasPermit) return true;

    const testHelperAllowance = getTestHelperAllowance(currency);
    if (testHelperAllowance !== null) {
        return testHelperAllowance >= amount;
    }

    try {
        return !needsApproval(amount);
    } catch {
        return false;
    }
}

export async function approveAmount({
    amount,
    currency,
    approve,
    refetchAllowance,
}: ApproveAmountArgs): Promise<"mock" | "chain"> {
    if (amount <= 0n) {
        throw new Error("Nothing to approve");
    }

    const mockApprove = getMockFn<(currency: string, amount: string) => Promise<void>>("__FIGARO_MOCK_APPROVE__");
    if (mockApprove) {
        await mockApprove(currency, amount.toString());
        await refetchAllowance?.();
        return "mock";
    }

    await approve(amount);
    return "chain";
}

export async function signPermitWithFallback({
    amount,
    signPermitForTx,
    onPermitSigned,
    onFallbackApprove,
}: SignPermitWithFallbackArgs): Promise<void> {
    if (amount <= 0n) return;

    try {
        const permit = await signPermitForTx(amount);
        onPermitSigned(permit);
    } catch {
        await onFallbackApprove();
    }
}
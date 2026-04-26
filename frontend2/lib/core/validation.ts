/**
 * Input Validation Utilities
 * Addresses AUDIT FINDING SEC-2: No Input Validation
 */

import { isAddress, getAddress, isHex } from "viem";
import type { Address, Hex } from "viem";

/**
 * Validates and checksums an Ethereum address
 * @throws Error if address is invalid
 */
export function validateAddress(address: string | undefined, fieldName: string = "Address"): Address {
    if (!address) {
        throw new Error(`${fieldName} is required`);
    }

    if (!isAddress(address)) {
        throw new Error(`${fieldName} is not a valid Ethereum address: ${address}`);
    }

    // Return checksummed address
    return getAddress(address);
}

/**
 * Validates multiple addresses
 */
export function validateAddresses(addresses: (string | undefined)[], fieldName: string = "Addresses"): Address[] {
    return addresses.map((addr, i) => validateAddress(addr, `${fieldName}[${i}]`));
}

/**
 * Validates a BigInt amount is positive and within reasonable bounds
 */
export function validateAmount(
    amount: bigint | undefined,
    fieldName: string = "Amount",
    options?: {
        min?: bigint;
        max?: bigint;
        allowZero?: boolean;
    }
): bigint {
    if (amount === undefined) {
        throw new Error(`${fieldName} is required`);
    }

    const { min = 0n, max = BigInt(Number.MAX_SAFE_INTEGER), allowZero = false } = options || {};

    if (!allowZero && amount === 0n) {
        throw new Error(`${fieldName} must be greater than 0`);
    }

    if (amount < min) {
        throw new Error(`${fieldName} must be at least ${min.toString()}`);
    }

    if (amount > max) {
        throw new Error(`${fieldName} exceeds maximum value ${max.toString()}`);
    }

    return amount;
}

/**
 * Validates a process ID (bytes32 hex string)
 */
export function validateProcessId(processId: string | undefined): Hex {
    if (!processId) {
        throw new Error("Process ID is required");
    }

    if (!isHex(processId)) {
        throw new Error(`Process ID must be a hex string: ${processId}`);
    }

    if (processId.length !== 66) { // "0x" + 64 hex chars
        throw new Error(`Process ID must be 32 bytes (66 chars with 0x prefix), got ${processId.length}`);
    }

    return processId as Hex;
}

/**
 * Validates an order ID is a positive integer
 */
export function validateOrderId(orderId: bigint | undefined): bigint {
    if (orderId === undefined) {
        throw new Error("Order ID is required");
    }

    if (orderId < 0n) {
        throw new Error(`Order ID cannot be negative: ${orderId}`);
    }

    return orderId;
}

/**
 * Validates that user has sufficient balance for an operation
 */
export async function validateBalance(
    userBalance: bigint | undefined,
    requiredAmount: bigint,
    tokenSymbol: string = "tokens"
): Promise<void> {
    if (userBalance === undefined) {
        throw new Error("Unable to fetch user balance");
    }

    if (userBalance < requiredAmount) {
        throw new Error(
            `Insufficient balance: have ${userBalance.toString()} ${tokenSymbol}, ` +
            `need ${requiredAmount.toString()} ${tokenSymbol}`
        );
    }
}

/**
 * Validates chain ID matches expected chain
 */
export function validateChain(
    currentChainId: number | undefined,
    expectedChainIds: number[],
    chainNames: string[] = []
): void {
    if (!currentChainId) {
        throw new Error("No chain connected");
    }

    if (!expectedChainIds.includes(currentChainId)) {
        const expectedNames = chainNames.length > 0
            ? chainNames.join(" or ")
            : expectedChainIds.join(" or ");
        throw new Error(
            `Wrong network. Please switch to ${expectedNames} (chain ID: ${expectedChainIds.join(" or ")})`
        );
    }
}

/**
 * Sanitizes user input to prevent injection attacks
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
    if (!input) return "";

    // Remove null bytes and control characters
    let sanitized = input.replace(/[\x00-\x1F\x7F]/g, "");

    // Truncate to max length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized.trim();
}

/**
 * Validates array bounds
 */
export function validateArray<T>(
    array: T[] | undefined,
    fieldName: string,
    options?: {
        minLength?: number;
        maxLength?: number;
    }
): T[] {
    if (!array) {
        throw new Error(`${fieldName} is required`);
    }

    const { minLength = 0, maxLength = 1000 } = options || {};

    if (array.length < minLength) {
        throw new Error(`${fieldName} must have at least ${minLength} item(s)`);
    }

    if (array.length > maxLength) {
        throw new Error(`${fieldName} cannot have more than ${maxLength} items`);
    }

    return array;
}

/**
 * Type guard for checking if error is a validation error
 */
export function isValidationError(error: unknown): error is Error {
    return error instanceof Error && (
        error.message.includes("is required") ||
        error.message.includes("is not a valid") ||
        error.message.includes("must be") ||
        error.message.includes("Insufficient")
    );
}

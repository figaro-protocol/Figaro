/**
 * Environment Variable Validation
 * Addresses AUDIT FINDING CODE-3: Missing Environment Validation
 * 
 * Validates all required environment variables at build/runtime
 * Prevents silent failures from missing or invalid configuration
 */

import { isAddress } from "viem";

/**
 * Required environment variables with validation rules
 */
const ENV_SCHEMA = {
    NEXT_PUBLIC_FIGARO_CORE: {
        required: true,
        validate: (value: string) => isAddress(value),
        errorMessage: "NEXT_PUBLIC_FIGARO_CORE must be a valid Ethereum address",
    },
    NEXT_PUBLIC_TOKEN_ADDRESS: {
        required: true,
        validate: (value: string) => isAddress(value),
        errorMessage: "NEXT_PUBLIC_TOKEN_ADDRESS must be a valid Ethereum address",
    },
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: {
        required: false, // Fallback exists in wagmi.ts
        validate: (value: string) => !value || value.length > 10,
        errorMessage: "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID must be at least 10 characters if provided",
    },
} as const;

type EnvKey = keyof typeof ENV_SCHEMA;

/**
 * Validation error class
 */
export class EnvironmentValidationError extends Error {
    constructor(
        public errors: Array<{ key: string; message: string }>,
        message?: string
    ) {
        super(message || `Environment validation failed with ${errors.length} error(s)`);
        this.name = "EnvironmentValidationError";
    }
}

/**
 * Get environment variable with fallback
 */
function getEnvVar(key: string): string | undefined {
    return process.env[key];
}

/**
 * Validate all environment variables
 * Throws EnvironmentValidationError if validation fails
 */
export function validateEnvironment(): void {
    const errors: Array<{ key: string; message: string }> = [];

    // Check for placeholder values (common mistake)
    const PLACEHOLDER_REGEX = /^0x0+$/;

    Object.entries(ENV_SCHEMA).forEach(([key, schema]) => {
        const value = getEnvVar(key);

        // Check if required variable is missing
        if (schema.required && !value) {
            errors.push({
                key,
                message: `${key} is required but not set`,
            });
            return;
        }

        // Skip validation if optional and not provided
        if (!value) return;

        // Check for placeholder values
        if (PLACEHOLDER_REGEX.test(value)) {
            errors.push({
                key,
                message: `${key} appears to be a placeholder value (0x000...). Did you forget to update it?`,
            });
            return;
        }

        // Run custom validation
        if (schema.validate && !schema.validate(value)) {
            errors.push({
                key,
                message: schema.errorMessage,
            });
        }
    });

    if (errors.length > 0) {
        // In development, just warn
        if (process.env.NODE_ENV === "development") {
            console.warn("⚠️  Environment Validation Warnings:");
            errors.forEach(({ key, message }) => {
                console.warn(`   - ${key}: ${message}`);
            });
            console.warn("\n💡 See .env.local.example for required variables\n");
        } else {
            // In production, throw error
            throw new EnvironmentValidationError(errors);
        }
    }
}

/**
 * Get validated environment object
 * Returns typed object with all environment variables
 */
export function getValidatedEnv() {
    validateEnvironment();

    return {
        FIGARO_CORE: getEnvVar("NEXT_PUBLIC_FIGARO_CORE") || "",
        TOKEN_ADDRESS: getEnvVar("NEXT_PUBLIC_TOKEN_ADDRESS") || "",
        WALLETCONNECT_PROJECT_ID: getEnvVar("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID") || "",
    };
}

/**
 * Check if environment is properly configured
 * Returns true if all required variables are set
 */
export function isEnvironmentConfigured(): boolean {
    try {
        validateEnvironment();
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get human-readable environment status
 */
export function getEnvironmentStatus(): {
    isValid: boolean;
    errors: Array<{ key: string; message: string }>;
    warnings: Array<{ key: string; message: string }>;
} {
    const errors: Array<{ key: string; message: string }> = [];
    const warnings: Array<{ key: string; message: string }> = [];
    const PLACEHOLDER_REGEX = /^0x0+$/;

    Object.entries(ENV_SCHEMA).forEach(([key, schema]) => {
        const value = getEnvVar(key);

        if (schema.required && !value) {
            errors.push({ key, message: `${key} is required but not set` });
        } else if (value && PLACEHOLDER_REGEX.test(value)) {
            warnings.push({ key, message: `${key} appears to be a placeholder` });
        } else if (value && schema.validate && !schema.validate(value)) {
            errors.push({ key, message: schema.errorMessage });
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}

// Run validation on module import (build-time check)
if (typeof window === "undefined") {
    // Server-side only
    validateEnvironment();
}

"use client";

/**
 * useSchemaValidator — React binding for content validation against a
 * SchemaSpec. The validation function is the same one used by the SDK,
 * the on-chain validator (eventually), and the SP1 prover (eventually).
 *
 * Typical usage in a form:
 *
 *   const { validate, isReady } = useSchemaValidator("figaro-handoff-v1");
 *   const result = validate({ mode: selectedMode });
 *   if (!result.ok) showErrors(result.errors);
 */

import { useCallback, useMemo } from "react";
import { validateContent, type ValidationResult, type ValidateOptions } from "@figaro/core/schemas";
import { getSchemaSpec, getSchemaSpecLoadError } from "@/lib/shared/schemaSpecSource";

export interface UseSchemaValidatorResult {
    /** True iff the spec is loaded and ready. False = validate() will return ok: true (no spec to enforce). */
    isReady: boolean;
    /** Spec load error, if any. */
    loadError: string | undefined;
    /**
     * Validate `content` against the spec. If the spec is not loaded (yet),
     * returns `{ ok: true }` — caller MUST gate on `isReady` if validation
     * is required before submission.
     */
    validate: (content: unknown, options?: ValidateOptions) => ValidationResult;
}

export function useSchemaValidator(schemaId: string): UseSchemaValidatorResult {
    const spec = useMemo(() => getSchemaSpec(schemaId), [schemaId]);
    const loadError = useMemo(() => getSchemaSpecLoadError(schemaId), [schemaId]);

    const validate = useCallback(
        (content: unknown, options?: ValidateOptions): ValidationResult => {
            if (spec === undefined) return { ok: true };
            return validateContent(content, spec, options);
        },
        [spec],
    );

    return {
        isReady: spec !== undefined,
        loadError,
        validate,
    };
}

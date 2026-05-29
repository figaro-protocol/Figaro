"use client";

/**
 * useClauseValidator — React binding for content validation against a
 * ClauseSpec. The validation function is the same one used by the SDK,
 * the on-chain validator (eventually), and the SP1 prover (eventually).
 *
 * Typical usage in a form:
 *
 *   const { validate, isReady } = useClauseValidator("figaro-handoff-v1");
 *   const result = validate({ mode: selectedMode });
 *   if (!result.ok) showErrors(result.errors);
 */

import { useCallback, useMemo } from "react";
import { validateContent, type ValidationResult, type ValidateOptions } from "@figaro/core/clauses";
import { getClauseSpec, getClauseSpecLoadError } from "@/lib/shared/clauseSpecSource";

export interface UseClauseValidatorResult {
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

export function useClauseValidator(clauseId: string): UseClauseValidatorResult {
    const spec = useMemo(() => getClauseSpec(clauseId), [clauseId]);
    const loadError = useMemo(() => getClauseSpecLoadError(clauseId), [clauseId]);

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

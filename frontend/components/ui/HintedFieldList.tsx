"use client";

/**
 * A labeled text-input list where every field carries a hint line —
 * the shape shared by the endpoint-style wizard forms. The field
 * CATALOGUES stay with each form (they are designed content, not
 * chrome); this component owns only the FormField + Input + hint
 * render.
 */

import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";

export interface HintedFieldDef<K extends string = string> {
    key: K;
    label: string;
    placeholder: string;
    hint: string;
}

export function HintedFieldList<K extends string>({
    fields,
    idPrefix,
    value,
    onChange,
    inputType = "text",
    hintClassName = "text-ink-faint",
    withTestIds = false,
}: {
    fields: readonly HintedFieldDef<K>[];
    /** Prefixes each field's input id (`${idPrefix}-${key}`). */
    idPrefix: string;
    value: (key: K) => string;
    onChange: (key: K, value: string) => void;
    inputType?: string;
    hintClassName?: string;
    /** Stamp `data-testid={`${idPrefix}-${key}`}` on each input (e2e contract). */
    withTestIds?: boolean;
}) {
    return (
        <>
            {fields.map((field) => (
                <FormField key={field.key} label={field.label} inputId={`${idPrefix}-${field.key}`}>
                    <Input
                        id={`${idPrefix}-${field.key}`}
                        type={inputType}
                        placeholder={field.placeholder}
                        value={value(field.key)}
                        onChange={(e) => onChange(field.key, e.target.value)}
                        {...(withTestIds ? { "data-testid": `${idPrefix}-${field.key}` } : {})}
                    />
                    <p className={`text-xs ${hintClassName} mt-1`}>{field.hint}</p>
                </FormField>
            ))}
        </>
    );
}

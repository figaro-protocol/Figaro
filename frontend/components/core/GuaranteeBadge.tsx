import { memo } from "react";
import { GuaranteeModel } from "@/lib/semantic/models";

interface Props {
    guarantee: GuaranteeModel;
}

const TRUTH_CLASS_LABELS: Record<string, string> = {
    'protocol-enforced': 'Enforced by the protocol',
    'institution-declared': 'Declared by the institution',
    'off-chain-overlay': 'Off-chain attestation',
};

export const GuaranteeBadge = memo(function GuaranteeBadge({ guarantee }: Props) {
    const truthLabel = TRUTH_CLASS_LABELS[guarantee.source.truthClass] ?? guarantee.source.truthClass;
    return (
        <div className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 bg-white">
            <span className="font-semibold text-black">{guarantee.label}</span>
            <span className="text-neutral-500"> · {truthLabel}</span>
        </div>
    );
});
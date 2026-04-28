import { memo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Copy, Check } from "lucide-react";
import { ProcessModel } from "@/lib/semantic/models";
import type { ResolvedAssemblySkinBundle } from "@/lib/shared/runtimeResolution";

interface Props {
    process: ProcessModel;
    orderCount?: number;
    selected: boolean;
    onSelect: () => void;
    skin?: ResolvedAssemblySkinBundle;
}

export const ProcessSummaryCard = memo(function ProcessSummaryCard({ process, orderCount, selected, onSelect, skin }: Props) {
    const accentColor = skin?.branding.branding.accentColor;
    const [copied, setCopied] = useState(false);

    const copyId = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(process.processId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <button type="button" onClick={onSelect} className="w-full text-left" data-testid={`process-summary-${process.processId}`}>
            <Card
                className={`p-4 transition-colors ${selected ? "border-black" : "hover:bg-neutral-50"}`}
                data-skin={skin?.skinId}
                style={selected && accentColor ? { borderColor: accentColor } : undefined}
            >
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-black">Process</p>
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-500 font-mono">
                            {process.processId.slice(0, 12)}…
                            <button
                                type="button"
                                onClick={copyId}
                                className="p-0.5 hover:text-black transition-colors"
                                aria-label="Copy process ID"
                                title="Copy full process ID"
                            >
                                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                        </span>
                    </div>
                    <span
                        className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700"
                        style={selected && accentColor ? { borderColor: accentColor, color: accentColor } : undefined}
                    >
                        {process.stateSummary}
                    </span>
                </div>
                <p className="text-xs text-neutral-500 mt-3">Orders: {orderCount ?? process.orders.length}</p>
                {process.rootOrderId && (
                    <p className="text-xs text-neutral-500 mt-1">Root: #{process.rootOrderId}</p>
                )}
                {(process.upstreamLinks.length > 0 || process.downstreamLinks.length > 0) && (
                    <p className="text-xs text-neutral-500 mt-1">
                        Links: {process.upstreamLinks.length} upstream / {process.downstreamLinks.length} downstream
                    </p>
                )}
            </Card>
        </button>
    );
});
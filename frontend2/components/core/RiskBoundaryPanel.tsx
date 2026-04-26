import { RiskBoundaryModel } from "@/lib/semantic/models";

interface Props {
    riskBoundary: RiskBoundaryModel;
}

export function RiskBoundaryPanel({ riskBoundary }: Props) {
    return (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-sm text-black">
            <p className="font-semibold mb-2">Risk Boundary</p>
            <div className="space-y-1 text-xs text-neutral-700">
                <p>Risk class: <span className="font-mono text-black">{riskBoundary.riskClass}</span></p>
                <p>Touches assets: <span className="font-mono text-black">{riskBoundary.touchesAssets ? "yes" : "no"}</span></p>
                <p>Can reprice: <span className="font-mono text-black">{riskBoundary.canReprice ? "yes" : "no"}</span></p>
                <p>Signal only: <span className="font-mono text-black">{riskBoundary.canOnlySignal ? "yes" : "no"}</span></p>
            </div>
            <div className="mt-3 text-xs text-neutral-600">
                <p className="font-semibold text-neutral-800 mb-1">Failure modes</p>
                <ul className="space-y-1">
                    {riskBoundary.failureModes.map((failureMode) => (
                        <li key={failureMode}>• {failureMode}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
"use client";

import { windowSafe, getMockFn } from "@/lib/core/testHelpers";

interface PermitControlProps {
    currency: string;
    permitEnabled: boolean;
    permitTarget: string | null;
    onPermitEnabledChange: (enabled: boolean) => void;
    onPermitTargetChange: (target: string | null) => void;
    onPermitDataChange: (data: string | null) => void;
}

export default function PermitControl({
    currency,
    permitEnabled,
    permitTarget,
    onPermitEnabledChange,
    onPermitTargetChange,
    onPermitDataChange,
}: PermitControlProps) {
    return (
        <div className="flex items-center gap-2 mt-2">
            <label className="flex items-center gap-2 text-sm">
                <input
                    data-testid="checkbox-use-permit"
                    type="checkbox"
                    checked={permitEnabled}
                    onChange={(e) => {
                        const v = e.target.checked;
                        onPermitEnabledChange(v);
                        if (!v) {
                            onPermitTargetChange(null);
                            onPermitDataChange(null);
                            try {
                                const _w = windowSafe();
                                // eslint-disable-next-line -- E2E test helper on untyped window global
                                if (_w) _w.__FIGARO_PENDING_PERMIT__ = undefined;
                            } catch { }
                        } else {
                            onPermitTargetChange("");
                        }
                    }}
                />
                Use Custom Permit Call
            </label>
            {permitEnabled && (
                <>
                    <input
                        data-testid="input-permit-target"
                        type="text"
                        placeholder="permit target override"
                        value={permitTarget || ""}
                        onChange={(e) => onPermitTargetChange(e.target.value)}
                        className="font-mono text-xs px-2 py-1 border"
                    />
                    <p className="text-xs text-gray-500 mt-1 w-full">
                        Advanced compatibility testing. Leave empty to target the token's own permit() surface.
                    </p>
                    <button
                        data-testid="btn-mock-sign-permit"
                        type="button"
                        className="text-xs bg-black text-white px-2 py-1 rounded"
                        onClick={async () => {
                            try {
                                const mockSign = getMockFn<(target: string) => Promise<{ data: string } | string>>(
                                    "__FIGARO_MOCK_SIGN_PERMIT__"
                                );
                                if (mockSign) {
                                    const blob = await mockSign(permitTarget || currency);
                                    const data = typeof blob === 'object' && blob !== null && 'data' in blob ? blob.data : (blob ?? "0x");
                                    onPermitDataChange(data);
                                    try {
                                        const _win = windowSafe();
                                        // eslint-disable-next-line -- E2E test helper on untyped window global
                                        if (_win)
                                            _win.__FIGARO_PENDING_PERMIT__ = {
                                                target: permitTarget || currency,
                                                data,
                                            };
                                    } catch { }
                                    return;
                                }
                            } catch { }
                            // Fallback: dummy calldata
                            const dummy = "0x" + "00".repeat(4);
                            onPermitDataChange(dummy);
                            try {
                                const _win = windowSafe();
                                // eslint-disable-next-line -- E2E test helper on untyped window global
                                if (_win)
                                    _win.__FIGARO_PENDING_PERMIT__ = {
                                        target: permitTarget || currency,
                                        data: dummy,
                                    };
                            } catch { }
                        }}
                    >
                        Mock Sign
                    </button>
                </>
            )}
        </div>
    );
}

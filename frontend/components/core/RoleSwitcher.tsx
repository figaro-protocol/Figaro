"use client";

import { RoleContext } from "@/lib/semantic/models";
import type { ResolvedInstitutionSkinBundle } from "@/lib/shared/runtimeResolution";

interface Props {
    roles: RoleContext[];
    selectedRoleKind: string;
    onSelectRole: (roleKind: string) => void;
    contextLabel?: string;
    skin?: ResolvedInstitutionSkinBundle;
}

export function RoleSwitcher({
    roles,
    selectedRoleKind,
    onSelectRole,
    contextLabel,
    skin,
}: Props) {
    const accentColor = skin?.branding.branding.accentColor;

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4" data-skin={skin?.skinId}>
            <p
                className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1"
                style={accentColor ? { color: accentColor } : undefined}
            >
                I am a…
            </p>
            {contextLabel && (
                <p className="mb-3 text-sm font-medium text-neutral-600">{contextLabel}</p>
            )}
            <div className="flex flex-wrap gap-2">
                {roles.map((role) => {
                    const selected = role.roleKind === selectedRoleKind;
                    return (
                        <button
                            key={role.roleKind}
                            type="button"
                            data-testid={`role-btn-${role.roleKind}`}
                            onClick={() => onSelectRole(role.roleKind)}
                            aria-pressed={selected}
                            className={`rounded border px-3 py-2 text-sm font-semibold ${selected
                                ? "border-black bg-black text-white"
                                : "border-neutral-300 bg-white text-black hover:bg-neutral-100"
                                }`}
                            style={selected && accentColor
                                ? {
                                    borderColor: accentColor,
                                    color: accentColor,
                                    boxShadow: `0 0 0 1px ${accentColor} inset`,
                                    backgroundColor: "#ffffff",
                                }
                                : undefined}
                            title={role.description ?? role.roleKind}
                        >
                            {role.displayName}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
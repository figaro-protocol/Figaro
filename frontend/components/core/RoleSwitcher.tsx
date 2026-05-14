"use client";

import { RoleContext } from "@/lib/semantic/models";

interface Props {
    roles: RoleContext[];
    selectedRoleKind: string;
    onSelectRole: (roleKind: string) => void;
    contextLabel?: string;
}

export function RoleSwitcher({
    roles,
    selectedRoleKind,
    onSelectRole,
    contextLabel,
}: Props) {
    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-xs font-semibold text-neutral-500 mb-1">
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

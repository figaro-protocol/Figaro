"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { RoleSwitcher as RoleSwitcherBase } from "@/components/core/RoleSwitcher";

export function RoleSwitcherModule({ context }: ModuleProps) {
    const selectableRoles = context.roles.filter(
        (r) => r.visibility === "primary" || r.visibility === "secondary"
    );

    return (
        <RoleSwitcherBase
            roles={selectableRoles}
            selectedRoleKind={context.selectedRoleKind}
            onSelectRole={context.onSelectRole}
            contextLabel={context.shellPresentation.title}
            skin={context.skinBundle}
        />
    );
}

import type { CSSProperties } from "react";
import type { ModuleRenderContext } from "@/lib/shared/moduleRegistry";

interface ModuleChrome {
    accentTone?: string;
    shellLabel: string;
    cardStyle?: CSSProperties;
    labelStyle?: CSSProperties;
}

export function deriveModuleChrome(context: ModuleRenderContext): ModuleChrome {
    const accentTone = context.skinBundle?.branding.branding.accentColor;

    return {
        accentTone,
        shellLabel: context.shellPresentation?.title ?? context.skinBundle?.branding.branding.displayName ?? "Institution Runtime",
        cardStyle: accentTone ? { borderTopColor: accentTone, borderTopWidth: "2px" } : undefined,
        labelStyle: accentTone ? { color: accentTone } : undefined,
    };
}
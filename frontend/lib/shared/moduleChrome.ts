import type { CSSProperties } from "react";
import type { ModuleRenderContext } from "@/lib/shared/moduleRegistry";

interface ModuleChrome {
    accentTone?: string;
    shellLabel: string;
    cardStyle?: CSSProperties;
    labelStyle?: CSSProperties;
}

export function deriveModuleChrome(context: ModuleRenderContext): ModuleChrome {
    return {
        accentTone: undefined,
        shellLabel: context.shellPresentation?.title ?? "Assembly Runtime",
        cardStyle: undefined,
        labelStyle: undefined,
    };
}
import type { CSSProperties, ReactNode } from "react";

interface ModuleEmptyStateCardProps {
    testId: string;
    skinId?: string;
    cardStyle?: CSSProperties;
    labelStyle?: CSSProperties;
    title?: ReactNode;
    message: ReactNode;
}

export function ModuleEmptyStateCard({
    testId,
    skinId,
    cardStyle,
    labelStyle,
    title,
    message,
}: ModuleEmptyStateCardProps) {
    return (
        <div
            data-testid={testId}
            data-skin={skinId}
            className="rounded-lg border border-neutral-200 bg-white p-6"
            style={cardStyle}
        >
            {title ? (
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1" style={labelStyle}>
                    {title}
                </p>
            ) : null}
            <p className="text-sm text-neutral-500">{message}</p>
        </div>
    );
}
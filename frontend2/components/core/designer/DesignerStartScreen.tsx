"use client";

/**
 * DesignerStartScreen — shown when no assembly is loaded.
 *
 * Orients a first-time visitor: explains what an assembly is, offers
 * reference templates as starting points, and offers a blank canvas.
 * Replaces the previous default of "Figaro Eats preloaded with no context."
 */

import type { Assembly } from "@/lib/shared/assembly";

export interface DesignerStartScreenProps {
    references: readonly Assembly[];
    onPickReference: (slug: string) => void;
    onStartBlank: () => void;
}

export function DesignerStartScreen({
    references,
    onPickReference,
    onStartBlank,
}: DesignerStartScreenProps) {
    return (
        <div
            data-testid="designer-start-screen"
            className="flex-1 overflow-y-auto px-8 py-12"
        >
            <div className="max-w-3xl mx-auto">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                    Designer
                </p>
                <h1 className="text-3xl font-bold text-black mb-3">
                    Compose an assembly.
                </h1>
                <p className="text-base text-neutral-700 leading-relaxed mb-2 max-w-2xl">
                    An assembly is a composition of roles, coordination mechanisms, and display views that use the Figaro kernel to coordinate a multi-party process.
                </p>
                <p className="text-sm text-neutral-600 leading-relaxed max-w-2xl">
                    Drag blocks from the palette on the left into slots on the canvas. Every assembly has a fixed baseline (the core process shell); the rest is up to you.
                </p>

                <div className="mt-10">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-4">
                        Start from a reference template
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {references.map((a) => (
                            <button
                                key={a.identity.slug}
                                type="button"
                                data-testid={`start-screen-reference-${a.identity.slug}`}
                                onClick={() => onPickReference(a.identity.slug)}
                                className="text-left rounded-lg border border-neutral-200 bg-white hover:border-neutral-400 transition-colors px-5 py-4"
                            >
                                <p className="text-base font-semibold text-black mb-1">
                                    {a.identity.name}
                                </p>
                                <p className="font-mono text-[11px] text-neutral-500 mb-2">
                                    /{a.identity.slug}
                                </p>
                                {a.identity.description && (
                                    <p className="text-sm text-neutral-600 leading-relaxed">
                                        {a.identity.description}
                                    </p>
                                )}
                                <p className="text-xs text-neutral-500 mt-3">
                                    {a.roles.length} roles · {a.mechanisms.length} mechanisms · {a.views.length} views
                                </p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-10 pt-8 border-t border-neutral-200">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                        Or start from scratch
                    </p>
                    <button
                        type="button"
                        data-testid="start-screen-blank"
                        onClick={onStartBlank}
                        className="rounded-lg border border-neutral-300 bg-white hover:border-neutral-500 transition-colors px-5 py-3 text-sm font-semibold text-black"
                    >
                        Start a blank assembly
                    </button>
                    <p className="text-xs text-neutral-500 mt-2">
                        A blank assembly starts with the core process shell and no other blocks. You add what you need.
                    </p>
                </div>
            </div>
        </div>
    );
}

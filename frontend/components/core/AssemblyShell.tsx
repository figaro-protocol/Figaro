import { ReactNode } from "react";
import type { ResolvedInstitutionSkinBundle } from "@/lib/shared/runtimeResolution";

interface Props {
    title: string;
    subtitle?: string;
    sidebar: ReactNode;
    main: ReactNode;
    skin?: ResolvedInstitutionSkinBundle;
}

export function AssemblyShell({ title, subtitle, sidebar, main, skin }: Props) {
    return (
        <div className="space-y-8">
            <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white">
                {skin?.branding.heroImageURL && (
                    <div className="absolute inset-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Runtime skin bundles can resolve arbitrary IPFS or HTTP hero assets. */}
                        <img
                            src={skin.branding.heroImageURL}
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover opacity-15"
                        />
                        <div className="absolute inset-0 bg-white/80" />
                    </div>
                )}

                <div className="relative p-8">
                    <p
                        className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500"
                        style={skin?.branding.branding.accentColor ? { color: "var(--merchant-accent)" } : undefined}
                    >
                        {title}
                    </p>

                    <div className="flex flex-wrap items-start gap-4">
                        {skin?.branding.logoURL && (
                            // eslint-disable-next-line @next/next/no-img-element -- Runtime skin bundles can resolve arbitrary IPFS or HTTP logo assets.
                            <img
                                src={skin.branding.logoURL}
                                alt={`${title} logo`}
                                className="h-16 w-16 rounded-2xl border border-neutral-200 bg-white object-cover shadow-sm"
                            />
                        )}

                        <div className="min-w-0 flex-1">
                            <h1 className="mb-4 text-5xl font-bold text-black">{title}</h1>
                            {subtitle && <p className="max-w-3xl text-lg text-black">{subtitle}</p>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-6 items-start">
                <aside className="space-y-6">{sidebar}</aside>
                <section className="space-y-6">{main}</section>
            </div>
        </div>
    );
}

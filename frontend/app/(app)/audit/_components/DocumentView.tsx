"use client";

/**
 * DocumentView — the ONE on-screen renderer for EVERY projected document.
 *
 * The on-screen twin of `pdfBundle.tsx`'s `DocumentPage`: it knows no genre.
 * It draws whatever the generic document engine produced — header rows, an
 * optional line table with a total, generic whole-leaf sections, a note.
 * Invoice, bill of lading, financial statements: all the same
 * `RenderedDocument` shape, all this one component. A new genre is a new
 * template / projector in `lib/audit/` — this renderer never changes.
 */

import type { RenderedDocument } from "@/lib/audit/documentProjection";

export function DocumentView({ document }: { document: RenderedDocument }) {
    return (
        <section className="space-y-4" data-testid={`document-${document.genre}`}>
            <header className="space-y-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-700">
                    {document.title}
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-neutral-700">
                    {document.header.map((r) => (
                        <div key={r.label}>
                            <dt className="text-neutral-500">{r.label}</dt>
                            <dd className="break-all">{r.value}</dd>
                        </div>
                    ))}
                </dl>
            </header>

            {document.leafSections?.map((s) => (
                <div key={s.label} className="bg-white border border-neutral-200 rounded-lg p-5 space-y-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-3">
                        {s.label}
                    </h4>
                    {s.entries.map((e) => (
                        <div key={e.key} className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="text-neutral-700">{e.key}</span>
                            <span className="font-mono text-neutral-700">{e.value}</span>
                        </div>
                    ))}
                </div>
            ))}

            {document.lines && (
                <div className="overflow-x-auto bg-white border border-neutral-200 rounded-lg">
                    <table className="w-full text-xs" data-testid={`document-lines-${document.genre}`}>
                        <thead className="bg-neutral-50 text-neutral-600">
                            <tr>
                                {document.lines.columns.map((c, i) => (
                                    <th
                                        key={c}
                                        className={`px-3 py-2 font-medium ${i === document.lines!.columns.length - 1 ? "text-right" : "text-left"}`}
                                    >
                                        {c}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {document.lines.rows.map((row, ri) => (
                                <tr key={ri} className="border-t border-neutral-100">
                                    {row.map((cell, ci) => (
                                        <td
                                            key={ci}
                                            className={`px-3 py-2 font-mono ${ci === row.length - 1 ? "text-right" : "text-left"}`}
                                        >
                                            {cell || "—"}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        {document.lines.total && (
                            <tfoot>
                                <tr className="border-t border-neutral-200 font-semibold">
                                    <td className="px-3 py-2" colSpan={Math.max(1, document.lines.columns.length - 1)}>
                                        {document.lines.total.label}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono">{document.lines.total.value}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}

            {document.note && (
                <p className="text-[11px] text-neutral-500 max-w-2xl">{document.note}</p>
            )}
        </section>
    );
}

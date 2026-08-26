import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/shared/utils";

/**
 * The shared chrome of every SVG content figure: a `<figure>` on the
 * content rail wrapping one accessible `<svg role="img">` whose
 * `<title>`/`<desc>` pair is minted under `idPrefix` (the collision
 * guard `BaseFigureProps` documents), plus the standard `<figcaption>`.
 * Each figure keeps its own drawing (the SVG children) and any fields
 * of its own; plain-HTML figures (ruled 2026-08-06: the stack must read
 * as TEXT) do not use this frame.
 */
export interface FigureFrameProps {
    /** Base id for the accessible <title>/<desc> pair. */
    idPrefix: string;
    /** Accessible <title> text. */
    title: ReactNode;
    /** Accessible <desc> text. */
    desc: ReactNode;
    viewBox: string;
    /** The <figure> measure; figures on a wider rail override (max-w-2xl). */
    frameClassName?: string;
    /** Page-provided class, merged onto the <figure> after `frameClassName`. */
    className?: string;
    /** Extra classes on the <svg> (e.g. a currentColor context). */
    svgClassName?: string;
    svgProps?: SVGProps<SVGSVGElement>;
    /** The <figcaption>; omitted when the figure carries none. */
    caption?: ReactNode;
    /** Chrome rendered inside the <figure> before the SVG (e.g. an HTML legend). */
    beforeSvg?: ReactNode;
    /** The drawing. */
    children: ReactNode;
}

export function FigureFrame({
    idPrefix,
    title,
    desc,
    viewBox,
    frameClassName = "w-full max-w-xl mx-auto",
    className,
    svgClassName,
    svgProps,
    caption,
    beforeSvg,
    children,
}: FigureFrameProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    return (
        <figure className={cn(frameClassName, className)}>
            {beforeSvg}
            <svg
                viewBox={viewBox}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className={cn("w-full h-auto", svgClassName)}
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>{title}</title>
                <desc id={descId}>{desc}</desc>
                {children}
            </svg>
            {caption != null && (
                <figcaption className="mt-3 text-center text-sm text-ink-muted">{caption}</figcaption>
            )}
        </figure>
    );
}

import type { SVGProps } from "react";

/**
 * Shared prop shape for a content-figure SVG: an id namespace for its
 * accessible <title>/<desc> pair (and any other ids it mints, e.g. an arrow
 * marker), a className merged onto its outer wrapper, and passthrough SVG
 * attributes. Each figure's own `*Props` extends this; some add fields of
 * their own (e.g. `DisciplineIntersectionFigureProps.labels`).
 */
export interface BaseFigureProps {
    /** Base id for the accessible <title>/<desc> pair. Override when embedding
     *  more than one instance on the same page to avoid id collisions. */
    idPrefix?: string;
    /** Merged onto the outer <figure>. Default width is a sensible content-figure
     *  measure (`max-w-xl mx-auto`); override to fit a specific page's rail. */
    className?: string;
    svgProps?: SVGProps<SVGSVGElement>;
}

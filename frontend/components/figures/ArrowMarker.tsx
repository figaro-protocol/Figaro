/**
 * The standard figure arrowhead — ONE geometry for every content figure
 * that draws directed edges (figures share a 400-unit-wide coordinate
 * space, so the marker size is uniform by design). Render inside the
 * figure's `<defs>`; mint `id` under the figure's `idPrefix` so two
 * instances on one page cannot collide. A figure whose arrows carry
 * per-edge color (currentColor) defines its own marker instead.
 */
export function ArrowMarker({ id }: { id: string }) {
    return (
        <marker
            id={id}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
        >
            <path d="M0,0 L10,5 L0,10 z" className="fill-ink-muted" />
        </marker>
    );
}

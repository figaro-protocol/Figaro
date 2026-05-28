import katex from "katex";

/**
 * Server-rendered KaTeX. The math is turned into static HTML at render time —
 * no client JS to hydrate, and it prints reliably, which is the whole point of
 * authoring papers as pages. Inline by default; pass `display` for a centered
 * block equation.
 *
 * Usage: <Math>{"P + 2G"}</Math>  ·  <Math display>{"\\sum_i b_i"}</Math>
 * (TeX backslashes must be escaped in the JS string: "\\times", "\\to").
 */
export function Math({ children, display = false }: { children: string; display?: boolean }) {
    const html = katex.renderToString(children, {
        throwOnError: false,
        displayMode: display,
    });
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

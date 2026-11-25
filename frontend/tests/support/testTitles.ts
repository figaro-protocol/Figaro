/**
 * The titles of the test cases a test file declares, read by parsing it with
 * the TypeScript compiler: the first argument of each `it(…)` / `test(…)`
 * call, of each `it.each(…)(…)` / `test.each(…)(…)` call, and of their
 * `.only` / `.concurrent` forms, each preceded by the titles of the
 * `describe(…)` blocks it stands in, joined by " > " (the full name the
 * runner reports). A word in a comment or a string elsewhere is not a case's
 * title, and a `describe` that declares no case names none. A template title
 * keeps its literal text, each `${…}` standing as `${}`; a title that is
 * neither a string nor a template is not read.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";

const CASE_CALLEES = new Set(["it", "test"]);
const BLOCK_CALLEES = new Set(["describe"]);
const CASE_MODIFIERS = new Set(["only", "concurrent"]);

/** Whether `callee` is one of `names`, or a modified form of one:
 *  `.only`, `.concurrent`, or the function `.each(table)` returns. */
function calls(callee: ts.Expression, names: ReadonlySet<string>): boolean {
    if (ts.isIdentifier(callee)) return names.has(callee.text);
    if (ts.isPropertyAccessExpression(callee)) {
        return CASE_MODIFIERS.has(callee.name.text) && calls(callee.expression, names);
    }
    if (ts.isCallExpression(callee) && ts.isPropertyAccessExpression(callee.expression)) {
        return callee.expression.name.text === "each" && calls(callee.expression.expression, names);
    }
    return false;
}

function titleText(node: ts.Expression | undefined): string | null {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
        return node.head.text + node.templateSpans.map((span) => "${}" + span.literal.text).join("");
    }
    return null;
}

export function testCaseTitles(file: string): string[] {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const titles: string[] = [];
    const visit = (node: ts.Node, blocks: readonly string[]): void => {
        if (ts.isCallExpression(node) && calls(node.expression, CASE_CALLEES)) {
            const title = titleText(node.arguments[0]);
            if (title !== null) titles.push([...blocks, title].join(" > "));
        }
        if (ts.isCallExpression(node) && calls(node.expression, BLOCK_CALLEES)) {
            const title = titleText(node.arguments[0]) ?? "";
            ts.forEachChild(node, (child) => visit(child, [...blocks, title]));
            return;
        }
        ts.forEachChild(node, (child) => visit(child, blocks));
    };
    visit(source, []);
    return titles;
}

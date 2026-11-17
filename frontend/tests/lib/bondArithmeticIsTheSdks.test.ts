/**
 * A bond or a payout figure is the SDK's arithmetic, never the frontend's.
 *
 * The SDK computes what the Core locks and pays: `calculateBonds` (each
 * seller twice the running total, the buyer twice the payment) and
 * `calculateResolution` (sdk/src/bonds.ts). A page that doubles a payment or a
 * running total itself carries a second copy of the Core's rule, and the copy
 * is the one that drifts: twice the payment where the rule says twice the
 * running total is the error a sub-order exposes.
 *
 * This test parses every source file under `app/`, `components/`, `hooks/`
 * and `lib/` and fails on a multiplication by two (`2 *`, `* 2`, `2n *`,
 * `* 2n`, `BigInt(2)`) or a left shift by one whose operands, or the name the
 * result is given, speak of a payment, a running total, a bond or a payout.
 * The frontend has no module of its own that wraps the SDK's functions: every
 * caller imports `calculateBonds` or `calculateResolution` from the SDK
 * directly, so no wrapper is allowed. The allowlist names each other file
 * that may, with its reason, and an entry that no longer matches fails, so
 * the list cannot outlive its reason.
 *
 * It fails as well on `calculateResolution`'s arithmetic spelled by hand: a
 * bond less a payment or a bond plus a payment (`order.buyerBond -
 * order.payment`), and a refund or a payout given a payment's value
 * (`refundOwedToBuyer += o.payment`). Each operand is a value read by name,
 * so a sentence assembled from strings is not arithmetic.
 *
 * Proves: no source file outside the allowlist multiplies a payment, a
 * running total, a bond or a payout by two, subtracts a payment from a bond or
 * adds the two, or gives a refund or a payout a payment's value. Does not
 * prove: arithmetic spelled another way (`x + x`, a figure under a name that
 * says none of these words); those are read by the figure tests of each
 * surface.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { treeSourceFiles } from "./__fixtures__/sourceTree";

const ROOT = path.resolve(process.cwd());
const DIRS = ["app", "components", "hooks", "lib"];

/** Words that name a figure the Core's rule computes. */
const FIGURE_NAME = /payment|cumulative|running|bond|payout|refund|locked|_G\b|_P\b/i;
const BOND = /bond/i;
const PAYMENT = /payment/i;
const PAYOUT = /payout|refund/i;

/**
 * Files allowed to double a figure themselves, each with its reason. Paths are
 * relative to `frontend/`.
 */
const ALLOWED: Record<string, string> = {
    "app/(marketing)/papers/asymmetric-bonding/page.tsx":
        "a frozen paper's worked example: plain numbers in the paper's own notation, typeset beside the theorem they illustrate; no party's figure",
    "app/(marketing)/papers/coordination-substrates/page.tsx":
        "a frozen paper's worked example: plain numbers in the paper's own notation; no party's figure",
    "components/figures/ProcessTopologyFigure.tsx":
        "a figure of the papers and marketing pages drawn from illustrative JavaScript numbers, not from any order; it repeats the rule in its own arithmetic (reported, not changed by this test)",
    "components/figures/StackedBondChainFigure.tsx":
        "a figure of the papers and marketing pages drawn from illustrative JavaScript numbers, not from any order; it repeats the rule in its own arithmetic (reported, not changed by this test)",
};

const isTwo = (n: ts.Node): boolean =>
    (ts.isNumericLiteral(n) && n.text === "2")
    || (ts.isBigIntLiteral(n) && n.text === "2n")
    || (ts.isCallExpression(n) && n.expression.getText() === "BigInt" && n.arguments.length === 1 && /^2n?$/.test(n.arguments[0].getText()))
    || (ts.isParenthesizedExpression(n) && isTwo(n.expression));

const isOne = (n: ts.Node): boolean =>
    (ts.isNumericLiteral(n) && n.text === "1") || (ts.isBigIntLiteral(n) && n.text === "1n");

/** A value read by name: an identifier, or a property of one, never a string
 *  and never a call's result (`calculateResolution(...).buyerPayout` is the SDK's). */
const isRead = (n: ts.Node): boolean =>
    ts.isIdentifier(n)
    || ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && isRead(n.expression))
    || (ts.isParenthesizedExpression(n) && isRead(n.expression));

/** The name the expression's value is given: a variable, a property, a parameter or an assignment target. */
function nameGiven(node: ts.Node): string {
    let at: ts.Node | undefined = node.parent;
    while (at && (ts.isBinaryExpression(at) && at.operatorToken.kind !== ts.SyntaxKind.EqualsToken || ts.isParenthesizedExpression(at))) at = at.parent;
    if (!at) return "";
    if (ts.isVariableDeclaration(at) || ts.isPropertyAssignment(at) || ts.isPropertyDeclaration(at) || ts.isParameter(at)) return at.name.getText();
    if (ts.isBinaryExpression(at)) return at.left.getText();
    return "";
}

interface Hit { file: string; line: number; text: string }

function doublings(file: string): Hit[] {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const hits: Hit[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isBinaryExpression(node)) {
            const op = node.operatorToken.kind;
            const doubled =
                (op === ts.SyntaxKind.AsteriskToken || op === ts.SyntaxKind.AsteriskEqualsToken) && (isTwo(node.left) || isTwo(node.right))
                || (op === ts.SyntaxKind.LessThanLessThanToken || op === ts.SyntaxKind.LessThanLessThanEqualsToken) && isOne(node.right);
            // A payout spelled by hand: a bond less a payment (the buyer's
            // refund) or a bond plus a payment (the seller's payout), which is
            // `calculateResolution`'s arithmetic.
            const resolvedByHand =
                (op === ts.SyntaxKind.MinusToken || op === ts.SyntaxKind.MinusEqualsToken
                    || op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.PlusEqualsToken)
                && isRead(node.left) && isRead(node.right)
                && (BOND.test(node.left.getText()) && PAYMENT.test(node.right.getText())
                    || PAYMENT.test(node.left.getText()) && BOND.test(node.right.getText()));
            // A refund or a payout given a payment's value: the buyer's refund
            // equals its payment only by `calculateResolution`'s rule.
            const paymentAsPayout =
                (op === ts.SyntaxKind.EqualsToken || op === ts.SyntaxKind.PlusEqualsToken)
                && PAYOUT.test(node.left.getText())
                && isRead(node.right) && PAYMENT.test(node.right.getText());
            if (resolvedByHand || paymentAsPayout) {
                hits.push({
                    file: path.relative(ROOT, file),
                    line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                    text: node.getText(),
                });
            }
            if (doubled && FIGURE_NAME.test(`${node.left.getText()} ${node.right.getText()} ${nameGiven(node)}`)) {
                hits.push({
                    file: path.relative(ROOT, file),
                    line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                    text: node.getText(),
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return hits;
}

describe("no source file doubles a payment, a running total, a bond or a payout itself", () => {
    const hits = treeSourceFiles(ROOT, DIRS).flatMap(doublings);

    it("outside the allowlist, no file multiplies such a figure by two or spells a payout by hand", () => {
        const outside = hits.filter((h) => !(h.file in ALLOWED)).map((h) => `${h.file}:${h.line}: ${h.text}`);
        expect(outside).toEqual([]);
    });

    it("every allowlist entry still matches, so none outlives its reason", () => {
        const matched = new Set(hits.map((h) => h.file));
        expect(Object.keys(ALLOWED).filter((f) => !matched.has(f))).toEqual([]);
    });
});

export default function Home() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                Your deal stays yours.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Nobody holds your money. Nobody decides for you. Nobody takes a cut.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                You have probably been on the short end of this. You sold something, or finished the work, and the payment sat frozen while a platform &ldquo;reviewed&rdquo; it. A deal went wrong, and the platform &mdash; not you, not the person you dealt with &mdash; decided who was right. A cut came off the top of every transaction, the standing price of being allowed to trade at all. None of it was yours to argue with.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                It works that way for a reason. You and the person on the other side did not know each other, and someone had to make the deal safe &mdash; so a company stepped into the middle and did it. Holding the money, setting the rules, judging the disputes: that was how it made the deal safe, and the cut was its fee. It was a real service. For a long time it was the only way to do this at all.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Figaro makes a deal safe a different way &mdash; and once a deal can make itself safe, no company needs to stand in the middle of it. Here is how. Before any work begins, both sides lock a deposit into a lockbox. The lockbox is not a thing anyone holds: it is a small program that runs in the open, owned by no one, that takes the deposits in and follows one fixed rule for letting them out. The deposits are paid in digital tokens &mdash; a stablecoin, say, something with a steady, familiar value.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Each side locks in more than the deal is worth. If both sides honor the deal, the lockbox opens: each side takes its own stake back, and the payment goes to the seller. If either side cheats, both forfeit what they staked &mdash; and because the stake is larger than anything cheating could win, cheating is simply the losing move, every time. The safety is in the arithmetic, not in trusting the person across from you.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                So everything from the top of this page changes. Your money is never frozen, because no one is holding it to freeze &mdash; the program holds it, and a program cannot freeze anything; it can only follow its rule. No company stands in judgment of your deal; there is no platform to rule for you or against you. And there is no cut, because there is no longer anyone in the middle to pay. The deal belongs to you and the other side, from start to finish.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                No one runs Figaro. There is no company behind it and no account that can be closed &mdash; there is nothing to close, and no one in charge. It is shared infrastructure, the way the internet is. It is also still being built: the part described here works and has been tested, but it is not yet open on a public network. What you can do today is see exactly how it works.
            </p>
        </section>
    );
}

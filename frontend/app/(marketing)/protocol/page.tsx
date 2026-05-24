import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "How it works — Figaro Protocol",
    description:
        "How a Figaro deal works: both sides lock a deposit larger than the deal, so cheating always loses; the buyer closes it out; every step is recorded permanently.",
};

export default function Protocol() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                How any two parties can transact directly, anywhere.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Two deposits, each bigger than the deal. One rule for who opens the box. That is the entire machine.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The short version is a lockbox: both sides put in a deposit, more than the deal is worth. The lockbox is a small program that runs in the open, owned by no one, that holds the deposits and follows one fixed rule. Here is the exact version. Say the deal is worth ten tokens &mdash; a stablecoin, the kind that holds a steady value. The buyer locks twenty &mdash; the ten they owe, and ten more of their own as a stake. The seller locks twenty too, all of it stake. Forty is now held, and until the deal is done, neither side can reach any of it.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Why twice the value, and not the payment plus a small margin? Because the size of the stake is the whole mechanism. If a side could cheat and still come out level, some would. At twice the value, cheating always ends in a loss &mdash; you give up a stake worth more than anything you could have walked away with. There is no amount that is clever to steal. So both sides do the plain thing: they honor the deal. When they do, the lockbox opens &mdash; each side gets its stake back, and the seller is paid.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                One rule decides who opens the lockbox: the buyer, and only the buyer. That can sound like an advantage held over the seller. It is not. The buyer is locked at twice the value too, so stalling &mdash; or refusing to close &mdash; costs the buyer exactly as much as it costs anyone else. The buyer is simply the party with the most reason to see the deal finished, made the one who finishes it. No arbitrator weighs the case. No timer releases the money on its own. The deal ends when the buyer ends it.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Most real work is not two people. A delivered meal can involve a cook, whoever supplied the ingredients, and a courier. Figaro handles that with the same move, repeated: every contributor posts their own deposit, and all of them are linked into one deal. If any single one fails, the whole deal fails and every deposit is at risk &mdash; so each person has a direct, money-backed reason to want everyone else to deliver. No manager hands out the work or inspects it. The shape of the deal does that.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                And the rare case &mdash; someone who cheats anyway, who burns their own stake out of spite? The deposit settles the overwhelming majority of deals long before spite enters the picture; cheating simply is not worth it, and almost no one tries. For the exception, the protocol does one more thing, quietly, the whole way through: it writes down every step. When the work was accepted, when it changed hands, when it arrived &mdash; each is recorded the moment it happens, permanently, where no one can edit it afterward. If a deal ever does reach an arbitrator or a court, the account is already there and cannot be forged. No one has to reconstruct what happened.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                That is the whole of it: a deposit large enough that cheating loses, and one clear rule for who opens the box. Everything else Figaro can do &mdash; carrying many kinds of agreement, linking long chains of contributors &mdash; is built on those two facts and changes neither. Figaro is still in development; the mechanism described here is built and tested, but not yet running on a public network. The hard part was never the machinery. It was making it simple enough that you never have to trust the person on the other side.
            </p>
        </section>
    );
}

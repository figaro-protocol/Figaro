import Link from "@/components/shared/Link";

/** One question in a FAQ's jump index: the section's anchor id and its title. */
export interface FaqQuestion {
    id: string;
    title: string;
}

/** A titled group of questions; a FAQ's index is one group or several. */
export interface FaqQuestionGroup {
    heading: string;
    questions: FaqQuestion[];
}

/**
 * The jump index at the top of a FAQ page: each group's heading, then one
 * link per question to its section's anchor. Groups after the first are
 * spaced from the one above.
 */
export function FaqJumpIndex({ groups }: { groups: FaqQuestionGroup[] }) {
    return (
        <nav aria-label="Jump to a question" data-testid="faq-jump-index">
            {groups.map((group, index) => (
                <div key={group.heading} className={index < groups.length - 1 ? "mb-8" : undefined}>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                        {group.heading}
                    </h2>
                    <ul className="[&>li]:border-b [&>li]:border-default text-base">
                        {group.questions.map((item) => (
                            <li key={item.id}>
                                <Link href={`#${item.id}`} className="flex items-baseline justify-between gap-4 py-2.5 text-ink-heading hover:underline">
                                    <span>{item.title}</span>
                                    <span aria-hidden="true" className="text-ink-muted">&darr;</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </nav>
    );
}

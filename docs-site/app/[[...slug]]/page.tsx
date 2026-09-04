import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { getMDXComponents } from '@/components/mdx';
import { GITHUB_BLOB } from '@/lib/shared';
import { source } from '@/lib/source';

type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page(props: Props) {
    const params = await props.params;
    const page = source.getPage(params.slug);
    if (!page) notFound();

    const MDX = page.data.body;
    const src = page.data.source;

    return (
        <DocsPage toc={page.data.toc} full={page.data.full}>
            <DocsTitle>{page.data.title}</DocsTitle>
            <DocsDescription>{page.data.description}</DocsDescription>
            {src ? (
                <p className="text-sm text-fd-muted-foreground border-b pb-4">
                    Source:{' '}
                    <a
                        href={`${GITHUB_BLOB}${src}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4"
                    >
                        <code>{src}</code>
                    </a>{' '}
                    in the repository — this page renders that file at build time.
                </p>
            ) : null}
            <DocsBody>
                <MDX components={getMDXComponents()} />
            </DocsBody>
        </DocsPage>
    );
}

export async function generateStaticParams() {
    return source.generateParams();
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;
    const page = source.getPage(params.slug);
    if (!page) notFound();

    return {
        title: page.data.title,
        description: page.data.description,
    };
}

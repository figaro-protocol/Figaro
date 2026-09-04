import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { Provider } from '@/components/provider';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import './global.css';
import 'katex/dist/katex.min.css';

export const metadata: Metadata = {
    title: {
        template: '%s — Figaro Protocol docs',
        default: 'Figaro Protocol docs',
    },
    description: "The Figaro Protocol's own documents, rendered for builders from the repository they live in.",
};

// The whole site is the docs tree, rooted at `/`: one layout, one sidebar.
export default function Layout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="flex flex-col min-h-screen">
                <Provider>
                    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
                        {children}
                    </DocsLayout>
                </Provider>
            </body>
        </html>
    );
}

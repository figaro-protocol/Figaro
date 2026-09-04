import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { GITHUB_REPO, SITE_URL } from './shared';

export function baseOptions(): BaseLayoutProps {
    return {
        nav: {
            title: 'Figaro Protocol · docs',
        },
        githubUrl: GITHUB_REPO,
        links: [
            {
                text: 'figaroprotocol.com',
                url: SITE_URL,
                external: true,
            },
        ],
    };
}

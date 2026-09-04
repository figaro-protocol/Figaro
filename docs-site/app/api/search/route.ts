import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

// Static export: the search index is prerendered as a file and queried
// client-side (components/search.tsx); there is no server.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
    language: 'english',
});

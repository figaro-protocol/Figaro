// pdf-text.mjs — the text layer of PDFs, one pypdf pass (`python3 -I`), page by page.
// The layer referees, indexes and search engines read; the paper check
// (frontend/scripts/check-paper-pdfs.mjs) and the personal-information check
// (scripts/check-export-no-personal-info.mjs) both read it here.

import { spawnSync } from 'node:child_process';

const PY = `
import json, sys, pypdf
out = {}
for path in sys.argv[1:]:
    out[path] = [p.extract_text() or "" for p in pypdf.PdfReader(path).pages]
print(json.dumps(out))
`;

/** `{ [path]: string[] }`, each PDF's text page by page. Throws when pypdf
 *  cannot read them, so a check that needs the text never passes without it. */
export function pdfPages(paths) {
    if (paths.length === 0) return {};
    const py = spawnSync('python3', ['-I', '-c', PY, ...paths], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (py.status !== 0) {
        throw new Error(`pypdf could not read the PDFs (python3 -I with pypdf installed is required)\n${py.stderr ?? py.error}`);
    }
    return JSON.parse(py.stdout);
}

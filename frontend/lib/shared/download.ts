/**
 * The one browser download of a file built in the page. The blob gets an
 * object URL, a detached anchor carries it with the file name, the anchor is
 * clicked and removed, and the URL is revoked. Nothing leaves the browser.
 */
export function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

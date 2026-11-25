/**
 * env — the runtime's one reader of a required environment variable, shared
 * by its command-line tools (figaro-analyst, figaro-fetch).
 */

/** The value of `name`, or exit with `<tool>: missing env <name>`. */
export function requireEnv(name, tool) {
    const v = process.env[name];
    if (!v) {
        console.error(`${tool}: missing env ${name}`);
        process.exit(1);
    }
    return v;
}

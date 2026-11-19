/** The withdrawal delay as prose, from the live `withdrawalCooldown`
 *  immutable. The stake is quoted from the chain, so the delay it is
 *  held for must be too — a participant prices the pair, never one alone.
 *  The phrase always says the delay is THIS deployment's, fixed when it was
 *  deployed: a reader who has met "a delay fixed at deployment" on /faq and
 *  /members must find the same fact here, not a contradiction. Zero is a
 *  real deployed value (a local development deployment wires no delay);
 *  undefined means the read has not landed yet. One copy, read by every
 *  member screen that states the cooldown. */
export function cooldownPhrase(seconds: bigint | undefined): string {
    if (seconds === undefined) return "after the cooldown this chain sets";
    if (seconds === 0n) return "at once; the cooldown here is zero";
    const days = Number(seconds) / 86_400;
    if (days >= 1) {
        const n = Math.round(days * 10) / 10;
        return `after ${n} ${n === 1 ? "day" : "days"}, the cooldown this chain sets`;
    }
    const hours = Math.round((Number(seconds) / 3_600) * 10) / 10;
    return `after ${hours} ${hours === 1 ? "hour" : "hours"}, the cooldown this chain sets`;
}

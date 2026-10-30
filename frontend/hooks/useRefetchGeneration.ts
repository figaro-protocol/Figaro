import { useCallback, useState } from "react";

/**
 * The re-read counter every registry reader keys its effect on: `generation` goes in the
 * effect's dependency list and `refetch` bumps it. `refetch` is stable across renders, so a
 * consumer that puts it in a `useEffect` dependency list does not re-fire on every render
 * (an unstable one looped a refetch-redirect cycle on the /members/edit pages).
 */
export function useRefetchGeneration(): { generation: number; refetch: () => void } {
    const [generation, setGeneration] = useState(0);
    const refetch = useCallback(() => setGeneration((g) => g + 1), []);
    return { generation, refetch };
}

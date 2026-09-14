// The one Link the tree imports (scripts/lint-section-map.sh fails a
// next/link import anywhere else). One host, one seam: every page writes its
// links as in-tree paths, and this is where a change to how links are
// emitted would land.
export { default } from "next/link";

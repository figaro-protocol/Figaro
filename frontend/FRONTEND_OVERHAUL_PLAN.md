# SYNCHRONIZATION WITH USER JOURNEYS

- Do not remove any page that is a primary entry point for a user journey (see USER_TYPES_AND_JOURNEYS.md).
- Any page rename/migration (e.g., Workbench, Sovereign Commerce) must be reflected in USER_TYPES_AND_JOURNEYS.md and all journey entry points.
- Document page intent and audience for every route, and cross-reference USER_TYPES_AND_JOURNEYS.md for entry point mapping.

# GAP TODOs (from journey analysis)

- [x] Add explicit onboarding page for new users (Visitor, Buyer, Seller)
- [x] Add dedicated help/FAQ page (all users)
- [ ] Add "My Orders" or "My Processes" dashboard (Buyer, Seller)
- [ ] Add notifications/inbox page if not covered by NotificationBell (Buyer, Seller, Agent)

---

# Figaro Frontend Overhaul Plan — Low Risk First

This plan is organized by agent risk, starting with the lowest-risk (polish, consistency, documentation) and moving up. Each section lists concrete actions to be taken.

---

## 1. Low Risk (Polish, Consistency, Documentation)

### A. Footer and Navigation Consistency
- Remove all outdated, broken, or irrelevant links (Discord, Origin, Game Theory, Vision, PDFs if not needed).
- Fix PDF dates (ensure 2026, not 2024).
- Remove "Sign" if not needed.
- Update footer messaging to: "TCP/IP of unbreakable Trade."
- Only include essential, working links in both footer and main navigation.

### B. Visual and Content Polish
- Add visuals/diagrams where possible to break up text-heavy pages.
- Use whitespace and clear hierarchy for readability.
- Ensure all terminology is consistent and user-facing.

### C. Document Page Intents and Structure
- For each page, write a short intent statement and define the audience.
- Make these visible to contributors (e.g., as comments or in a docs file) to prevent future drift.

---

## 2. Medium Risk (User Experience, Clarity, Onboarding)

### D. Home and Landing Pages
- Rewrite for clarity, focus on a single message and CTA.
- Remove protocol philosophy from main view; link to explainer if needed.

### E. Builder and Developer Surfaces
- Move deep technical content to developer docs.
- Restore "Build Anything Studio" to original drag-and-drop intent and fix CSS.
- Audit and clarify prototype pages.

### F. Audit and Decide on "Network State," "God’s Eye," "Accounting"
- Remove or merge if not functional or essential.
- Ensure all pages have a clear purpose and are discoverable from main navigation.

---

## 3. High Risk (Protocol, User Trust, Functional Breakage)

### G. Restore Wallet Connect on All Critical Pages
- Add a clear "Connect Wallet" button to every page that requires wallet interaction (Workbench, Accounting, Console, Seller Admin, etc.).
- Verify e2e tests require wallet connection and do not bypass it.

### H. Fix Broken/Missing Core Flows
- Restore Seller Admin/catalogue CRUD page.
- Restore Kleros integration and ensure it is surfaced in dispute flows.
- Restore Console functionality and ensure it is accessible from main navigation.
- Audit and restore Figaro Eats and prototype flows to original intent.

### I. Remove/Correct All Broken Navigation and Footer Links
- Remove Discord, Origin, Game Theory, Vision, and any other dead or misleading links.
- Fix PDF dates and remove "PDF" section if not needed.
- Remove "Sign" if not needed.
- Update footer messaging to "TCP/IP of unbreakable Trade."

### J. Clarify and Separate "Graph" vs. "Schema"
- Audit all pages for misuse/confusion of these terms.
- Ensure each is defined and used consistently.

### K. Rename/Migrate High-Confusion Pages
- Rename "Workbench" to something user-friendly and descriptive.
- Rename "Sovereign Commerce" to a clear, accessible title.
- Remove all internal navbars from pages.

---

This plan ensures the lowest-risk, least-destructive changes are made first, building trust and stability before addressing higher-risk protocol and UX issues.
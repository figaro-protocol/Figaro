# ---
# Figaro Runtime — User Types and Journeys

**Framing:**
Figaro is the TCP/IP of unbreakable trade — the smallest possible unit of a secure handshake. It is more abstract than any pre-existing form of organization, enabling the design and sharing of any value-added process for economic exchange, with as much or as little transparency as desired. The UI is a permissionless terminal for builders and contributors. Come and build. Challenge the status quo in safety: accounts are pseudonymous, tokens cannot be seized, and Figaro does not extract value — it builds trust.

## User Types

7. **Visitor**
  - First-time or unauthenticated user exploring the site
  - Seeks to understand what Figaro is, how it works, and why it matters
  - Motivated by curiosity, research, or evaluating whether to participate



1. **Builder**
  - Uses no-code/low-code tools to assemble, configure, and publish new institution templates, assemblies, or modules (see [Builder Levels](./builders/page.tsx)).
  - Operates at:
    - **Level 1:** Composes new institutions using only existing protocol primitives (no new contracts or mechanisms).
    - **Level 2:** Attaches new lightweight coordinators (e.g., lifecycle, disclosure) to extend workflow semantics, without changing core economic mechanisms.
  - Motivated by innovation, composability, and open experimentation.

2. **Buyer**
   - Initiates a value-added process (e.g., places an order, requests a service)
   - Selects terms, bonds, and triggers settlement
   - Motivated by trust, safety, and outcome certainty

3. **Seller**
   - Responds to buyer-initiated processes (e.g., fulfills an order, provides a service)
   - Bonds, delivers, and attests to completion
   - Motivated by fair compensation, reputation, and capital efficiency

4. **Agent**
   - Autonomous or semi-autonomous participant (bot, AI, or script)
   - Reads public graphs, proposes actions, and executes on behalf of a principal
   - Motivated by automation, arbitrage, or delegated operation

5. **Arbiter / Juror**
   - (Optional) Participates in dispute resolution (e.g., Kleros juror)
   - Reviews evidence, renders decisions, or verifies protocol invariants
   - Motivated by protocol integrity, fairness, and evidence-based outcomes

6. **Observer / Analyst**
   - Audits, analyzes, or visualizes process graphs and economic flows
   - Motivated by transparency, research, or reporting

7. **Developer**
  - Writes code, extends the protocol, or interacts directly with protocol primitives (see [Builder Levels](./builders/page.tsx)).
  - Operates at:
    - **Level 2:** (optionally) Implements new lightweight coordinators or mechanism modules.
    - **Level 3:** Designs and implements new economic mechanisms (e.g., auctions, allocation modules) that require code changes, audits, and protocol extension.
  - Motivated by protocol extension, mechanism design, and advanced use cases.

> See the [Builders page](./builders/page.tsx) for a full description of the three levels:
> 1. Existing contracts only (Builder)
> 2. Add lightweight coordinators (Builder/Developer)
> 3. Custom high-risk mechanisms (Developer)


## User Journeys

### 0. Visitor
**Entry Points:** Home, /figaro-eats, /why-figaro, /sovereign-commerce, /network-state, /fig, /builders, /gods-eye, /accounting, /onboarding (planned), /help (planned)
**Journey:**
  1. Lands on a marketing or explainer page (e.g., Home, Why Figaro, Eats, Sovereign Commerce).
  2. Reads about the protocol, its guarantees, and how it differs from platforms or traditional firms.
  3. Explores example use cases, archetypes, and the "How it works" sections.
  4. Optionally browses live institution assemblies or the Eats demo to see real flows.
  5. Decides whether to proceed as a Builder, Buyer, Seller, or Agent — or leaves with a better understanding.
**Outcome:** Gains clarity on Figaro's purpose, mechanism, and value proposition. May convert to an active user or return later.

### 1. Builder
**Entry Points:** Home, /builders, /builders/authoring, /builders/prototype, /builders/templates
**Journey:**
  1. Lands on Home or Builders page, sees invitation to create or remix an institution.
  2. Explores existing assemblies, templates, and mechanism modules.
  3. Uses authoring studio to compose new assemblies, define roles, and bind mechanisms.
  4. Prototypes and tests assemblies in a sandboxed environment.
  5. Publishes or shares assemblies for others to use or extend.
**Outcome:** New institution templates, modules, or mechanisms are published and discoverable by others.

### 2. Buyer
**Entry Points:** Home, /figaro-eats, /i/[slug], /my-orders (planned), /notifications (planned), /onboarding (planned), /help (planned)
**Journey:**
  1. Browses published catalogues (e.g., Eats, equipment rental) — sees offerings defined by sellers (menu, services, terms).
  2. Selects items or services from a seller's catalogue and configures order terms.
  3. Locks bond and confirms commitment (initiates the process).
  4. Monitors process status and receives on-chain updates/attestations.
  5. Triggers settlement when satisfied (releases payment, returns bonds).
**Outcome:** Secure, trustless completion of a value-added process, with all terms and offerings defined by sellers and capital at risk for both parties.

### 3. Seller
**Entry Points:** Home, /figaro-eats, /i/[slug], /my-processes (planned), /notifications (planned), /onboarding (planned), /help (planned)
**Journey:**
  1. Publishes a catalogue of offerings (menu, services, terms, branding, schemas) via the Catalogue Editor and registers on-chain via the Operator Registry.
  2. Receives orders from buyers who select from the published catalogue.
  3. Locks bond and accepts commitment (if required by process or batch).
  4. Delivers goods/services and attests to completion (on-chain attestations, status updates).
  5. Monitors process status and awaits buyer resolution for all orders in the batch or process.
  6. Receives settlement upon successful completion (payment and return of bond for all orders in the batch or process).
  6. Receives settlement upon successful completion (payment and return of bond).
**Outcome:** Earns payment and reputation through direct, bonded exchange, with full control over offerings and terms via the published catalogue.

### 4. Agent
**Entry Points:** /console, /builders, /api/semantic/*, public graphs
**Journey:**
  1. Reads public process, capital, and semantic graphs.
  2. Proposes or executes actions (e.g., commit, resolve, attest) on behalf of a principal.
  3. Coordinates with other agents or humans via public data.
  4. Optionally participates in HITL (human-in-the-loop) approval flows.
**Outcome:** Automated or semi-automated participation in economic processes, maximizing efficiency or arbitrage.

### 5. Arbiter / Juror
**Entry Points:** /evidence-display, /gods-eye, /console
**Journey:**
  1. Receives notification of a dispute or evidence submission.
  2. Reviews on-chain evidence, attestations, and process history.
  3. Renders a decision or records an outcome (if protocol-integrated).
**Outcome:** Disputes are resolved transparently, with evidence and process history available to all parties.

### 6. Observer / Analyst
**Entry Points:** /gods-eye, /network-state, /accounting, /console
**Journey:**
  1. Audits or visualizes process graphs, capital flows, and settlement outcomes.
  2. Extracts data for research, reporting, or compliance.
**Outcome:** Gains insight into protocol activity, economic flows, and institutional design patterns.

### 7. Developer
**Entry Point:** /workbench
> Keep page names and entry points in sync with FRONTEND_OVERHAUL_PLAN.md and planned changes.
  1. Accesses the Protocol Workbench for direct interaction with protocol primitives.
  2. Initiates simple orders or participates in complex, seller-prepared process graphs (batch orders, multi-party flows).
  3. Uses advanced features for testing, debugging, or protocol research.
  4. Triggers settlement when satisfied (releases payment, returns bonds for all orders in the batch or process).
  5. Monitors process status and receives on-chain updates/attestations for all orders in the process tree.
**Outcome:** Gains direct access to protocol operations for development, testing, or advanced use cases. Not intended for typical buyers or sellers.

---

# Page Inventory (cross-referenced to user journeys)

## Main Pages and Their Value

| Route | Purpose | User Types/Journeys | Keep/Delete | Notes |
|-------|---------|---------------------|-------------|-------|
| `/` | Protocol intro, links | Visitor, Builder, Buyer, Seller, Agent | Keep | Home |
| `/why-figaro` | Protocol theory, invariants | Visitor, Analyst, Builder | Keep | |
| `/sovereign-commerce` | Philosophy, protocol thesis | Visitor, Analyst | Keep | |
| `/network-state` | Protocol theory, stats | Visitor, Analyst | Keep | |
| `/fig` | FIG token explainer/dashboard | Visitor, Buyer, Seller, Analyst | Keep | |
| `/accounting` | Reporting, stats | Analyst, Seller, Buyer | Keep | |
| `/gods-eye` | Network/process observability | Analyst, Observer, Juror | Keep | |
| `/sign` | Signature/agreement tooling | Builder, Buyer, Seller, Agent | Keep | |
| `/builders` | Builder landing, 3-level path | Builder, Developer | Keep | Cross-ref in Builder journey |
| `/builders/authoring` | Authoring studio | Builder | Keep | |
| `/builders/prototype` | Browse prototypes | Builder | Keep | |
| `/builders/prototype/[slug]` | Prototype workspace | Builder | Keep | |
| `/builders/assemblies` | Reference assemblies | Builder | Keep | |
| `/builders/templates` | Template browsing | Builder | Keep | |
| `/workbench` | Protocol workbench | Developer, advanced Builder | Keep | Cross-ref in Developer journey |
| `/figaro-eats` | Eats archetype landing | Buyer, Seller, Visitor | Keep | |
| `/i/[slug]` | Live institution rendering | Buyer, Seller, Agent | Keep | |
| `/console` | HITL queue, agent actions | Agent, Developer, Builder | Keep | |
| `/evidence-display` | Kleros evidence display | Juror, Analyst, Observer | Keep | |
| `/admin` | Stubbed, no owner/fee | None | Delete or keep as stub | Not used |
| `/api/semantic/*` | Semantic endpoints | Agent, Builder, Analyst | Keep | |

### Gaps / Potential Additions

- No explicit onboarding page for new users (could be added for clarity)
- No dedicated help/FAQ page (could be added for support)
- No explicit "My Orders" or "My Processes" dashboard (could be useful for Buyer/Seller)
- No explicit notifications/inbox page (if not covered by NotificationBell)

---


> All journeys are permissionless, composable, and agent-native. The runtime is a blank canvas for new forms of economic coordination — the TCP/IP of unbreakable trade.

## Next Steps
- For each user type, define primary journeys through the runtime (pages, actions, outcomes)
- Use the "TCP/IP of unbreakable trade" framing for all journeys
- Apply Japanese minimalism (MUJI-inspired) to all visual and UX design
- Document page intent and audience for every route

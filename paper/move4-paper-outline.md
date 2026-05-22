# Paper Outline — *Mechanism Design as the Engineering of Consent, Reversed*

**Status:** Outline only. The framing is half-baked and under exploration — this is
*not* a committed paper. Drafted 2026-05-22 from a two-pass prior-art search. Every
TODO fact-checking marker below must be resolved before any drafting begins.

**Working title (options):**

- *Mechanism Design as the Engineering of Consent, Reversed*
- *The Disclosure Asymmetry: Cryptoeconomic Mechanism Design and the Engineering of Consent*
- *Propaganda in Reverse* (informal; likely too glib for a final title)

---

## Thesis

> The cryptoeconomic use of mechanism design is the structural inverse of the
> engineering of consent: both deploy the same instruments — incentives, common
> knowledge, equilibrium selection — but where consent-engineering manufactures a
> disposition by concealing the rules and exploiting the ruled's ignorance of them,
> cryptoeconomic mechanism design constructs warranted confidence by making the
> rules common knowledge and deterministically enforced — so that a participant who
> models the mechanism in full is the source of trust, not the obstacle to it.

The single load-bearing claim: **the sign-flip is disclosure.** The whole paper
defends that one sentence.

---

## The contribution, located

This is **not** a six-step synthesis. The prior-art search established:

- **Moves 1, 2, 5** (rule-making modes; trust as a society-shaped disposition;
  Bitcoin relocates trust to the edges) — well-trodden premises. Cite, do not argue.
- **Move 3** (authentic vs. engineered disposition; dissonance as the tell) — a thin
  recombination of the manufactured-consent literature. State briefly; do not headline.
- **Move 6** (three-builder taxonomy) — informal, close to existing builders-vs-
  speculators commentary. Use as rhetorical framing only; do not defend as a taxonomy.
- **Move 4** (mechanism design as the inverse of consent-engineering) — the one
  genuine contribution.

The paper has exactly one contribution and must argue it against a **named opponent**:

- **Viljoen, Goldenfein & McGuigan, "Design choices: Mechanism design and platform
  capitalism," *Big Data & Society* 8(2), 2021.** They occupy the same conceptual
  seam and reach the *contrary* conclusion: mechanism design *is* the predatory
  instrument — platforms "opaquely generate and exploit information asymmetries" for
  "information domination." [Quotes VERIFIED against full text, 2026-05-22.]
- The paper concedes their case for the *platform* setting, then shows the crypto
  setting flips the sign — and that the thing that flips it is disclosure. Their own
  word — *opaquely* — is the opening.

---

## Structure

### §1 — Premises (compressed; cite, don't argue)

- Rule-making: coercion vs. written law. [premise — Weber's typology of authority]
- Both rest on the ruled trusting the rulers; trust as a society-shaped disposition.
  [premise — Weber → Beetham → Habermas]
- The manufacture of consent: Lippmann, Bernays, Herman & Chomsky. [premise]
- `TODO(fact-check)`: confirm Beetham's formulation verbatim — a power relationship
  "is not legitimate because people believe in its legitimacy, but because it can be
  justified in terms of their beliefs." Cite precisely.

### §2 — Mechanism design as an instrument of consent

- The toolkit: incentives, common knowledge, equilibrium selection. Hurwicz, Maskin,
  Myerson (Nobel 2007).
- `TODO(fact-check)`: Hurwicz, "But Who Will Guard the Guardians?" (Nobel lecture,
  2007) — full text NOT yet read (PDF extraction failed). Verify the guardian-regress
  argument before citing.
- The antagonist, stated at full strength: Viljoen et al. (2021) — mechanism design
  as platform capitalism's instrument of information domination and choice-architecture
  manipulation.

### §3 — The inversion: disclosure (the contribution)

- Same toolkit, opposite vector.
- Predatory consent-engineering (Bernays) **and** platform mechanism design (Viljoen
  et al.) both depend on the target *not* modeling the rules — concealment, opacity,
  exploited information asymmetry.
- Cryptoeconomic mechanism design depends on the opposite: rules published,
  deterministically enforced, common knowledge. The participant who models the
  mechanism in full is the source of confidence, not its victim.
- The formal dual. This is the section that earns the paper.

### §4 — Figaro as the worked instance

- The bonded commitment; bilateral EIP-712; the two mechanisms (asymmetric bonding;
  buyer dominance + atomic resolution). The kernel is public, deterministic, ownerless
  — every rule is common knowledge.
- **Codebase verification — done (2026-05-22).** Claims checked against
  `src/FigaroCore.sol` + `src/CommitmentTypes.sol`:
  - [x] "stateless, ownerless kernel" — VERIFIED. No owner/admin/pause/upgrade
    (`FigaroCore.sol:14-15`, `:26`). "Stateless" is doctrine shorthand: the kernel
    keeps a minimal accumulator (three mappings), not ledger/account state.
  - [x] "buyer locks 2× payment, seller locks 2× cumulative value" — VERIFIED exactly
    (`FigaroCore.sol:206-207`).
  - [x] "two mechanisms" — VERIFIED. Bonding at `:206-207`; buyer-dominance + atomic
    resolution at `:263-299`.
  - [x] "atomic resolution — all orders settle together or not at all" — VERIFIED.
    Full order set required or revert (`:265-267`); single-transaction loop (`:272-295`).
  - [x] "no arbitrator, no timeout, no admin" — VERIFIED. No escape hatch; buyer
    key-loss is terminal by design (`FigaroCore.sol:236-238`).
  - [x] "deterministic" — VERIFIED. Settlement path uses no `tx.*` / `prevrandao`;
    `block.timestamp` only for the commit deadline (`:152`).
  - **CORRECTION** — cooperation is *weakly* dominant, not "dominant"
    (`figaro-mechanism.tex:649-656`, Remark "On Weak vs. Strict Dominance"). The §4
    draft must say "weakly dominant" / iterated-elimination, never bare "dominant".
  - **CORRECTION** — a single process is capped at ~2,145 orders by block gas
    (`FigaroCore.sol:240-253`). The §4 draft must not say "any number"; unbounded
    scale comes from multi-process composition, not one chain.

### §5 — Answering Viljoen et al.

- Why the crypto setting flips the sign they (correctly) assign to platform mechanism
  design. Three flips:
  1. **Disclosure** — rules are common knowledge vs. opaque.
  2. **Determinism** — enforced by the chain, not by a designer with discretion.
  3. **No privileged designer position** — the kernel is ownerless; the designer
     cannot occupy a place the rules do not grant everyone.
- `TODO(fact-check)`: claim (3) "the designer holds no privileged position" — verify
  against the kernel (no owner; permissionless registration).

### §6 — Conclusion

- Trust relocated to the edges of a deterministic network.
- Closing frame (rhetorical, not a defended taxonomy): the three kinds of builder —
  grifters, traditional-finance-on-rails, trust-engineers.

---

## Must-engage prior work

- **Viljoen, Goldenfein & McGuigan** — "Design choices: Mechanism design and platform
  capitalism," *Big Data & Society* (2021). **The named opponent.**
- **Lippmann** — *Public Opinion* (1922).
- **Bernays** — "The Engineering of Consent" (1947); *Propaganda* (1928).
- **Herman & Chomsky** — *Manufacturing Consent* (1988).
- **Hurwicz** — "But Who Will Guard the Guardians?" (Nobel lecture, 2007). [full text TODO]
- **Werbach** — *The Blockchain and the New Architecture of Trust* (2018). [full text TODO]
- **De Filippi, Mannan & Reijers** — "Blockchain as a Confidence Machine"
  (*Technology in Society*, 2020). [full text TODO — paywalled]
- **Berg, Davidson & Potts** — *Understanding the Blockchain Economy* (2019);
  **Davidson, De Filippi & Potts** — "Blockchains and the Economic Institutions of
  Capitalism" (*J. Institutional Economics*, 2018).
- **Buterin** — "Trust Models" (2020); "The Most Important Scarce Resource is
  Legitimacy" (2021). [both verified]
- **Beetham** — *The Legitimation of Power*; **Habermas** — *Legitimation Crisis*.
- **Lessig** — *Code* / "code is law".
- **Gambetta** — *Trust* (1988); **Hardin** — *Trust and Trustworthiness* (2002).

---

## Consolidated TODO — fact-checking before drafting

- [x] §4 Figaro protocol claims verified against `src/FigaroCore.sol` +
      `src/CommitmentTypes.sol` (over-selling review, 2026-05-22). All six hold; two
      corrections logged in §4 — "weakly dominant" (not "dominant") and the
      ~2,145-order-per-process gas cap (not "any number").
- [ ] Read the full text of Hurwicz's Nobel lecture; confirm the guardian-regress argument.
- [ ] Read the full text of De Filippi/Mannan/Reijers "Confidence Machine" (paywalled
      — find an open version or library access).
- [ ] Read the full text of Werbach's *New Architecture of Trust*; confirm the
      three-architectures argument.
- [ ] Confirm the Beetham legitimacy formulation verbatim, with citation.
- [ ] Confirm the Lippmann / Bernays / Herman-Chomsky attributions verbatim.
- [x] Viljoen et al. quotes — verified against full text 2026-05-22.

---

## Scope discipline (when this becomes a paper)

- One contribution: the disclosure asymmetry. Moves 1/2/5 stay premises.
- Per CLAUDE.md "Paper Authorship Discipline": no companion-paper references, no
  open-questions / future-work section, no contact-email footer, attribution
  consistency (cite key ↔ bibitem ↔ acknowledgement), "process chain" never "process
  tree".
- Resolve all TODO markers — a finished paper carries no verify markers.

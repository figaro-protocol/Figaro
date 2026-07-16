# Security Policy

Figaro is a settlement kernel: `FigaroCore.sol` holds bonded collateral and
discharges resolution. A flaw in the on-chain surface can mean direct loss of
locked funds. Disclosure is taken seriously.

## Reporting a vulnerability

**Report privately. Do not open a public issue, pull request, or discussion
for a suspected vulnerability.**

Email **security@figaro.org** with:

- the affected file(s), with line numbers where possible;
- the impact — what an attacker gains, and whose funds or state is at risk;
- a proof-of-concept or reproduction steps, if you have them.

You will get an acknowledgement. There is no fixed response SLA — this is a
small project — but every report is read.

## Scope

In scope:

- `src/**/*.sol` — the kernel (`FigaroCore.sol`, `CommitmentTypes.sol`), the
  attestation / clause / mechanism contracts, the florin token contracts, the
  per-clause validators, and the batch verifier.
- `formal/` — the TLA+ models and Certora CVL specs, if a spec asserts an
  invariant the kernel does not actually hold.

Out of scope:

- `src/mocks/`, `src/echidna/` — test infrastructure, never deployed.
- `archive-v3/`, `archive-v4/`, `archive-frontend/` — retired code.
- `frontend/` and `sdk/` for issues that do not reach on-chain state — report
  those as ordinary issues.

## Read this before reporting

`docs/DESIGN_DECISIONS.md` documents **a catalogue of patterns that look like
vulnerabilities but are correct by design** — missing timeouts, no admin
recovery path, bonds locked permanently on buyer key loss, attestations on
resolved orders, and others. Each is a deliberate consequence of the
protocol's game theory. A report that one of these "should" be fixed is a
design disagreement, not a vulnerability; the doc explains the reasoning.

## Audit status

The Solidity surface is **UNAUDITED** — it has not been reviewed by an
independent security firm (see each contract's `@custom:audit-status`
NatSpec). It is verified internally across Foundry, Halmos, Certora, TLA+, and
Echidna (`docs/VERIFICATION_MAP.md`), but internal verification is not an
external audit.

## Bug bounty

There is no paid bug-bounty program. Figaro is pre-deployment and runs no
treasury — there is nothing to fund a bounty from. This may change if the
protocol is deployed to a public network. Disclosure is asked for on the
merits.

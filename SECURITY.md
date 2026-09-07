# Security Policy

Figaro is a settlement kernel: `FigaroCore.sol` holds bonded collateral and
discharges resolution. A flaw in the on-chain surface can mean direct loss of
locked funds. Disclosure is taken seriously.

## Reporting a vulnerability

**Report privately. Do not open a public issue, pull request, or discussion
for a suspected vulnerability.**

Preferred channel: **[GitHub private vulnerability reporting](https://github.com/figaro-protocol/Figaro/security/advisories/new)**
— a confidential report visible only to you and the maintainer, with
structured triage and CVE issuance if one is warranted.

Alternate channel (if you prefer not to use GitHub): email
**figarosecurity@gmail.com**.

Either way, include:

- the affected file(s), with line numbers where possible;
- the impact — what an attacker gains, and whose funds or state is at risk;
- a proof-of-concept or reproduction steps, if you have them.

You will get an acknowledgement. There is no fixed response SLA — this is a
small project — but every report is read.

## Scope

In scope:

- `src/**/*.sol` — the kernel (`FigaroCore.sol`, `CommitmentTypes.sol`), the
  attestation / registry / mechanism contracts, the florin token contracts,
  the usage counter + RPGF minter, and the batch verifier. (Per-clause
  validator contracts do not exist, permanently — clause content validation
  is off-chain, plus the batch path's generic proof engine.)
- `formal/` (the TLA+ models) and `certora/` (the CVL specs) — if a spec
  asserts an invariant the kernel does not actually hold.

Out of scope:

- `src/mocks/`, `src/echidna/` — test infrastructure, never deployed.
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

Bounties are denominated in florins, the protocol's ERC-20, and paid from the
DAO treasury by its discretionary decision (`docs/DAO.md`). A florin is a
Schelling point and carries no rights of any kind — no ownership interest, no
vote, no claim on anyone's work — and has no guaranteed market; a bounty is a
transfer of tokens, nothing more. The schedule applies to the mainnet
deployment; testnet florins are worth nothing and no testnet finding is paid.

| Severity | What it is | Florins |
|---|---|---|
| Critical | loss or theft of locked bonds; a resolution by anyone but the buyer; a batch resolution the direct path would refuse | 1,000,000 |
| High | reward inflation or Sybil accrual; loss of a registry stake; a batch the proof did not commit to | 250,000 |
| Medium | liveness of one process or one batch without loss | 50,000 |
| Low | informational, with a concrete misuse | 10,000 |

Severity is set by the maintainer on the report's demonstrated impact, in
scope as defined above, first reporter paid. A report of a pattern listed in
`docs/DESIGN_DECISIONS.md` is a design disagreement and earns nothing.

## Incident response

Nothing in the protocol can be paused, upgraded, or drained by an
administrator, so an incident has exactly one shape: disclosure, then
redeployment under a new identifier. The steps, in order:

1. **Acknowledge** the report through the channel it arrived on and reproduce
   it against the deployed addresses in `deployments/<chainId>.json`.
2. **Bound the exposure.** A kernel defect that lets anyone but the buyer move
   bonds is Critical and public the moment it is exploited; one that blocks
   resolution locks the affected processes with no recovery, and the advisory
   says so plainly. Every process on an unaffected path keeps resolving: the
   buyer can always call `resolveProcess`, and a batch-path defect never
   touches the direct path.
3. **Publish the advisory** through GitHub's security-advisory channel, with a
   CVE where warranted, naming the affected contract, the addresses, what a
   participant should do (resolve open processes; commit nothing new on the
   affected contract), and the fix's commit.
4. **Redeploy the fixed contract at a new address** with the deploy scripts in
   `scripts/` (`deploy-mainnet.sh`, or `deploy-swap-coordinator.sh` for the
   coordinator alone). The registries are first-write-wins, so a replaced
   registry starts empty and every registrant re-registers under its own
   stake; the old contracts stay on the chain, unowned, and are simply no
   longer the ones the site and the SDK point at.
5. **Propagate the deployment record**: the new `deployments/<chainId>.json` is committed;
   the site is rebuilt against it and published; the SDK release that reads
   it is tagged. Anyone else reading the deployment record picks up the new addresses
   from the same file.
6. **Enter the finding** in `docs/AUDITOR_HANDOVER.md` as a post-audit
   amendment and re-run the full formal battery on the fixed tree before the
   broadcast, not after.

**The site and the sequencer are the other two legs, and they differ.** The
contracts are immutable, so their incident is the redeployment above. The site
(`frontend/`, a static build published by direct upload) is mutable: a defect
there is fixed and republished within the hour, nothing on the chain changes,
and it becomes an advisory only if the page misrepresented what a participant
signed. The batch sequencer (`prover/sequencer`, off-chain) is trusted for
liveness alone: if it stops or misbehaves, every process keeps its direct path
to `FigaroCore`, and the incident is to stop the sequencer and say so.

There is no fixed response time. Every report is read the day it arrives.

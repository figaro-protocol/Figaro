# Figaro V5 — Solidity Surface Freeze Notice

Date: 2026-04-20 (initial freeze declaration)
Amended: 2026-04-21

> **Amendment notice (2026-04-21)**: The initial freeze declared on 2026-04-20
> was voluntarily broken to land a set of audit findings before external review.
> Changes applied: FIG allocation restructured (10% founder genesis mint,
> 30% DAO genesis mint, 60% community airdrop staged at yr 2/5/9);
> `MerkleAirdrop.sol` and `TrancheVesting.sol` deleted and replaced by
> `StagedMerkleAirdrop.sol`; `figToken` dead-code field removed from
> `FigaroBatchVerifier.sol`; `DOMAIN_SEPARATOR()` getter added to `FigaroCore.sol`;
> `totalRegisteredCap` sum-enforcement added to `FigToken.sol`.
> These changes render the 2026-04-20 freeze commit invalid. A new freeze
> commit must be declared below before the external audit window opens.

---

## Freeze Declaration

The following Solidity surface is hereby declared frozen for external audit.

No feature changes, refactors, or dependency upgrades will be made to these
directories during the audit window. Any edit after the freeze commit requires
either a narrow follow-up review or a repeat audit decision.

### Frozen scope

| Directory / file | Contents |
|---|---|
| `src/` | `FigaroCore.sol`, `AttestationCoordinator.sol`, `CommitmentTypes.sol`, `IRoleResolver.sol`, `SchemaRegistry.sol`, `SchemaRegistrationHelper.sol`, `DutchAuction.sol`, `OperatorRegistry.sol`, `FigaroBatchVerifier.sol` |
| `src/fig/` | `FigToken.sol`, `StagedMerkleAirdrop.sol`, `IFigMinter.sol` |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface) |

### Explicitly out of scope (not frozen)

- `src/mocks/` — test helpers, never deployed to mainnet
- `src/echidna/` — fuzzing harnesses, never deployed to mainnet
- `test/` — Foundry test suite
- `frontend/` — TypeScript runtime
- `sdk/` — TypeScript SDK
- `prover/` — Rust SP1 prover

---

## Freeze Commit

Record the git commit hash at the time of freeze:

```
FREEZE_COMMIT=<fill in: git rev-parse HEAD>
FREEZE_DATE=2026-04-20
```

To verify a file is unchanged from the freeze commit:

```bash
git diff <FREEZE_COMMIT> -- src/ src/fig/ script/Deploy.s.sol script/DeployMainnet.s.sol
```

Expected output: empty (no diff).

---

## Handover Checklist for the Auditor

The following documents should be provided to the external auditor alongside
the frozen Solidity surface:

| Document | Location | Purpose |
|---|---|---|
| Design decisions | `docs/v5/DESIGN_DECISIONS.md` | 11 intentional patterns that look like vulnerabilities |
| AI audit report | `docs/v5/SECURITY_AUDIT_AI.md` | Prior audit pass; 0 actionable findings, 6 informational |
| Verification map | `docs/v5/VERIFICATION_MAP.md` | Every invariant → code → test → formal layer |
| Release readiness | `docs/v5/RELEASE_READINESS.md` | Gate criteria and current pass status |
| Sequencer trust model | `docs/v5/SEQUENCER_TRUST_MODEL.md` | What the sequencer is trusted for and why |

The AI audit report is provided for context only. The external auditor should
form their own independent findings.

---

## Post-Audit Policy

Any Solidity edit after the freeze commit must be:

1. Explicitly scoped to a specific finding or accepted-risk item
2. Reviewed by the original auditor or a qualified substitute
3. Recorded in `docs/v5/AUDIT_REPORT.md` with finding reference and outcome

Changes to `test/`, `frontend/`, `sdk/`, or `prover/` do not require re-audit
unless they expose a new on-chain attack surface.

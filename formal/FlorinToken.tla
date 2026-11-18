---- MODULE FlorinToken ----
(*
 * Formal model of `src/rewards/FlorinToken.sol`.
 *
 * What the model states, function by function:
 *
 *   constructor            — stores the deployer and registers no minter, so
 *                            every cap, every minted amount and
 *                            `totalRegisteredCap` start at 0.
 *   registerMinter(m, cap) — RegisterMinter. Refused after renounce
 *                            (`DeployerMintRenounced`), for a minter whose cap
 *                            is not 0 (`MinterAlreadySet`), and when
 *                            `totalRegisteredCap + cap > MAX_SUPPLY`
 *                            (`SupplyCapExceeded`). Adds `cap` to
 *                            `totalRegisteredCap`. The deployer may register
 *                            itself, as the mainnet deploy script does.
 *   mint(to, amount)       — Mint. Refused for the deployer after renounce
 *                            (`DeployerMintRenounced`), for a caller whose cap
 *                            is 0 (`MinterNotRegistered`), past the caller's
 *                            cap (`MinterCapExceeded`), past `MAX_SUPPLY`
 *                            (`SupplyCapExceeded`), and to the zero address
 *                            (OpenZeppelin's `ERC20InvalidReceiver`).
 *   renounceDeployerMint() — RenounceDeployerMint. Sets the flag; the
 *                            contract does not refuse a second call, which
 *                            changes no state and is a stuttering step here.
 *   transfer / transferFrom / permit — Transfer: the inherited ERC-20 moves a
 *                            balance between two non-zero addresses and
 *                            changes no supply. The token has no public burn.
 *
 * What the model leaves out:
 *   - Who calls. `registerMinter` and `renounceDeployerMint` revert
 *     (`NotDeployer`) for any caller but the deployer; the model's actions are
 *     the deployer's. A mint's caller is the minter `m`.
 *   - The zero address as a minter (`ZeroAddress`): it is not in `Minters`.
 *   - A zero cap or a zero amount: each changes no balance, cap or supply
 *     (a zero-cap registration leaves the minter unregistered), so each is a
 *     stuttering step.
 *   - Allowances and permit signatures: `transferFrom` and `permit` are
 *     modeled only by the balance move they make.
 *
 * `deployerMintedAtRenounce` is a ghost variable for
 * Inv_DeployerCannotMintAfterRenounce; the contract has no such variable.
 *)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS MAX_SUPPLY, Minters, Recipients

VARIABLES totalSupply,
          minterCaps,
          minterMinted,
          totalRegisteredCap,
          deployerMintRenounced,
          deployerMintedAtRenounce,
          balances

vars == << totalSupply, minterCaps, minterMinted, totalRegisteredCap,
           deployerMintRenounced, deployerMintedAtRenounce, balances >>

\* Recursive sum over a function f and a set S.
\* Used by Inv_SupplyEqualsSumMinted, Inv_BalancesSumToSupply and
\* Inv_RegisteredCapsWithinMaxSupply.
RECURSIVE SumSet(_, _)
SumSet(f, S) ==
  IF S = {} THEN 0
  ELSE LET x == CHOOSE m \in S : TRUE
       IN f[x] + SumSet(f, S \ {x})

\* The constructor registers no minter.
Init ==
  /\ totalSupply = 0
  /\ minterCaps = [m \in Minters |-> 0]
  /\ minterMinted = [m \in Minters |-> 0]
  /\ totalRegisteredCap = 0
  /\ deployerMintRenounced = FALSE
  /\ deployerMintedAtRenounce = 0
  /\ balances = [r \in Recipients |-> 0]

\* FlorinToken.registerMinter: the sum of the registered caps is checked,
\* never the supply.
RegisterMinter(m, cap) ==
  /\ ~deployerMintRenounced
  /\ m \in Minters
  /\ minterCaps[m] = 0
  /\ totalRegisteredCap + cap <= MAX_SUPPLY
  /\ minterCaps' = [minterCaps EXCEPT ![m] = cap]
  /\ totalRegisteredCap' = totalRegisteredCap + cap
  /\ UNCHANGED << totalSupply, minterMinted, deployerMintRenounced,
                  deployerMintedAtRenounce, balances >>

\* FlorinToken.mint, called by minter m.
Mint(m, to, amount) ==
  /\ m \in Minters
  /\ to \in Recipients
  /\ to # "0x0"
  /\ ~(m = "deployer" /\ deployerMintRenounced)
  /\ minterCaps[m] # 0
  /\ minterMinted[m] + amount <= minterCaps[m]
  /\ totalSupply + amount <= MAX_SUPPLY
  /\ totalSupply' = totalSupply + amount
  /\ minterMinted' = [minterMinted EXCEPT ![m] = @ + amount]
  /\ balances' = [balances EXCEPT ![to] = @ + amount]
  /\ UNCHANGED << minterCaps, totalRegisteredCap, deployerMintRenounced,
                  deployerMintedAtRenounce >>

\* FlorinToken.renounceDeployerMint. A repeated call is a stuttering step.
RenounceDeployerMint ==
  /\ ~deployerMintRenounced
  /\ deployerMintRenounced' = TRUE
  /\ deployerMintedAtRenounce' = minterMinted["deployer"]
  /\ UNCHANGED << totalSupply, minterCaps, minterMinted, totalRegisteredCap,
                  balances >>

\* The inherited ERC-20 transfer, transferFrom and permit-then-transferFrom:
\* a balance moves between two non-zero addresses.
Transfer(from, to, amount) ==
  /\ from \in Recipients
  /\ to \in Recipients
  /\ from # "0x0"
  /\ to # "0x0"
  /\ balances[from] >= amount
  /\ balances' = [balances EXCEPT ![from] = @ - amount, ![to] = @ + amount]
  /\ UNCHANGED << totalSupply, minterCaps, minterMinted, totalRegisteredCap,
                  deployerMintRenounced, deployerMintedAtRenounce >>

Next ==
  (\E mReg \in Minters, cap \in 1..MAX_SUPPLY : RegisterMinter(mReg, cap))
  \/ (\E mMint \in Minters, toMint \in Recipients, amount \in 1..MAX_SUPPLY :
        Mint(mMint, toMint, amount))
  \/ RenounceDeployerMint
  \/ (\E from \in Recipients, to \in Recipients, amount \in 1..MAX_SUPPLY :
        Transfer(from, to, amount))

Spec == Init /\ [][Next]_vars

\* ── Invariants ──────────────────────────────────────────────────────────────

\* Total supply never exceeds MAX_SUPPLY. Implied by Inv_SupplyEqualsSumMinted,
\* Inv_MinterCap and Inv_RegisteredCapsWithinMaxSupply together; kept as the
\* direct statement of the cap.
Inv_MaxSupply == totalSupply <= MAX_SUPPLY

\* After renounce, deployer cannot have minted more than at renounce time
Inv_DeployerCannotMintAfterRenounce ==
  deployerMintRenounced => minterMinted["deployer"] <= deployerMintedAtRenounce

\* No minter mints more than their cap
Inv_MinterCap == \A m \in Minters : minterMinted[m] <= minterCaps[m]

\* No minter cap exceeds MAX_SUPPLY. Implied by
\* Inv_RegisteredCapsWithinMaxSupply; kept as the per-minter statement.
Inv_CapBelowMaxSupply == \A m \in Minters : minterCaps[m] <= MAX_SUPPLY

\* Total supply equals the sum of all minters' minted amounts (covers ALL minters)
Inv_SupplyEqualsSumMinted ==
  totalSupply = SumSet(minterMinted, Minters)

\* All state variables are non-negative
Inv_NonNegative ==
  /\ totalSupply >= 0
  /\ \A m \in Minters : minterCaps[m] >= 0
  /\ \A m \in Minters : minterMinted[m] >= 0
  /\ totalRegisteredCap >= 0
  /\ deployerMintedAtRenounce >= 0
  /\ \A r \in Recipients : balances[r] >= 0

\* Zero address receives no tokens
Inv_NoMintToZero == balances["0x0"] = 0

\* Balances sum to total supply (excludes zero address, which holds nothing)
Inv_BalancesSumToSupply ==
  totalSupply = SumSet(balances, Recipients \ {"0x0"})

\* The contract's own rule for `totalRegisteredCap`: it is the sum of the
\* registered caps, and that sum never exceeds MAX_SUPPLY.
Inv_RegisteredCapsWithinMaxSupply ==
  /\ totalRegisteredCap = SumSet(minterCaps, Minters)
  /\ totalRegisteredCap <= MAX_SUPPLY

\* Renounce is one-way. A temporal formula, not listed in FlorinToken.cfg;
\* RenounceDeployerMint is the only action that writes the flag.
Inv_RenounceOneWay == deployerMintRenounced => []deployerMintRenounced

====

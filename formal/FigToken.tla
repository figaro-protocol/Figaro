---- MODULE FigToken ----
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS MAX_SUPPLY, Minters, Recipients

VARIABLES totalSupply,
          minterCaps,
          minterMinted,
          deployerMintRenounced,
          deployerMintedAtRenounce,
          balances

\* Recursive sum over a function f and a set S.
\* Used by Inv_SupplyEqualsSumMinted and Inv_BalancesSumToSupply.
RECURSIVE SumSet(_, _)
SumSet(f, S) ==
  IF S = {} THEN 0
  ELSE LET x == CHOOSE m \in S : TRUE
       IN f[x] + SumSet(f, S \ {x})

Init ==
  /\ totalSupply = 0
  /\ minterCaps = [m \in Minters |-> IF m = "deployer" THEN MAX_SUPPLY ELSE 0]
  /\ minterMinted = [m \in Minters |-> 0]
  /\ deployerMintRenounced = FALSE
  /\ deployerMintedAtRenounce = 0
  /\ balances = [r \in Recipients |-> 0]

RegisterMinter(m, cap) ==
  /\ ~deployerMintRenounced
  /\ m \in Minters
  /\ minterCaps[m] = 0
  /\ cap + totalSupply <= MAX_SUPPLY
  /\ minterCaps' = [minterCaps EXCEPT ![m] = cap]
  /\ UNCHANGED << totalSupply, minterMinted, deployerMintRenounced,
                  deployerMintedAtRenounce, balances >>

Mint(m, to, amount) ==
  /\ m \in Minters
  /\ to \in Recipients
  /\ to # "0x0"
  /\ minterCaps[m] # 0
  /\ minterMinted[m] + amount <= minterCaps[m]
  /\ totalSupply + amount <= MAX_SUPPLY
  /\ ~(m = "deployer" /\ deployerMintRenounced)
  /\ totalSupply' = totalSupply + amount
  /\ minterMinted' = [minterMinted EXCEPT ![m] = @ + amount]
  /\ balances' = [balances EXCEPT ![to] = @ + amount]
  /\ UNCHANGED << minterCaps, deployerMintRenounced, deployerMintedAtRenounce >>

RenounceDeployerMint ==
  /\ ~deployerMintRenounced
  /\ deployerMintRenounced' = TRUE
  /\ deployerMintedAtRenounce' = minterMinted["deployer"]
  /\ UNCHANGED << totalSupply, minterCaps, minterMinted, balances >>

Next ==
  (\E mReg \in Minters, cap \in 1..MAX_SUPPLY : RegisterMinter(mReg, cap))
  \/ (\E mMint \in Minters, toMint \in Recipients, amount \in 1..MAX_SUPPLY :
        Mint(mMint, toMint, amount))
  \/ RenounceDeployerMint

Spec ==
  Init /\ [][Next]_<< totalSupply, minterCaps, minterMinted,
                       deployerMintRenounced, deployerMintedAtRenounce, balances >>

\* ── Invariants ──────────────────────────────────────────────────────────────

\* Total supply never exceeds MAX_SUPPLY
Inv_MaxSupply == totalSupply <= MAX_SUPPLY

\* After renounce, deployer cannot have minted more than at renounce time
Inv_DeployerCannotMintAfterRenounce ==
  deployerMintRenounced => minterMinted["deployer"] <= deployerMintedAtRenounce

\* No minter mints more than their cap
Inv_MinterCap == \A m \in Minters : minterMinted[m] <= minterCaps[m]

\* No minter cap exceeds MAX_SUPPLY
Inv_CapBelowMaxSupply == \A m \in Minters : minterCaps[m] <= MAX_SUPPLY

\* Total supply equals the sum of all minters' minted amounts (covers ALL minters)
Inv_SupplyEqualsSumMinted ==
  totalSupply = SumSet(minterMinted, Minters)

\* All state variables are non-negative
Inv_NonNegative ==
  /\ totalSupply >= 0
  /\ \A m \in Minters : minterCaps[m] >= 0
  /\ \A m \in Minters : minterMinted[m] >= 0
  /\ deployerMintedAtRenounce >= 0
  /\ \A r \in Recipients : balances[r] >= 0

\* Zero address receives no tokens
Inv_NoMintToZero == balances["0x0"] = 0

\* Balances sum to total supply (excludes zero address, which holds nothing)
Inv_BalancesSumToSupply ==
  totalSupply = SumSet(balances, Recipients \ {"0x0"})

\* Renounce is one-way
Inv_RenounceOneWay == deployerMintRenounced => []deployerMintRenounced

\* ── Optional actions (not in Next — for trace analysis only) ────────────────

Transfer(from, to, amount) ==
  /\ from \in Recipients
  /\ to \in Recipients
  /\ from # "0x0"
  /\ to # "0x0"
  /\ balances[from] >= amount
  /\ balances' = [balances EXCEPT ![from] = @ - amount, ![to] = @ + amount]
  /\ UNCHANGED << totalSupply, minterCaps, minterMinted,
                  deployerMintRenounced, deployerMintedAtRenounce >>

Burn(from, amount) ==
  /\ from \in Recipients
  /\ from # "0x0"
  /\ balances[from] >= amount
  /\ balances' = [balances EXCEPT ![from] = @ - amount]
  /\ totalSupply' = totalSupply - amount
  /\ UNCHANGED << minterCaps, minterMinted,
                  deployerMintRenounced, deployerMintedAtRenounce >>

====

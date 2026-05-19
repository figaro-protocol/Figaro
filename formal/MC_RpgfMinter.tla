---- MODULE MC_RpgfMinter ----
\* Model-check harness for RpgfMinter — supplies concrete constants to
\* the RpgfMinter spec. TLC's .cfg file format does not support function
\* literals in CONSTANTS, so we bind the function constants here as
\* operator overrides and let .cfg refer to them by name.

EXTENDS Naturals, FiniteSets

\* These names match the CONSTANTS declared in RpgfMinter.tla.
CONSTANT STAGE_COUNT, Accounts, Submitter, NonSubmitters, MaxTime

\* Concrete function bindings (referenced from MC_RpgfMinter.cfg).
DefaultUnlockTimes ==
  [s \in 0..(STAGE_COUNT - 1) |->
     IF s = 0 THEN 1 ELSE IF s = 1 THEN 2 ELSE 3]

DefaultEntitlements ==
  [s \in 0..(STAGE_COUNT - 1) |->
     [a \in Accounts |->
        IF a = "alice" THEN 1
        ELSE IF a = "bob" THEN 2
        ELSE 0]]

VARIABLES roots, unlockTimes, totalAllocated, claimed, submitter, now

INSTANCE RpgfMinter
  WITH UnlockTimes <- DefaultUnlockTimes,
       Entitlements <- DefaultEntitlements

====

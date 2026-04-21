---- MODULE MC ----

(*
 * Model-checking configuration for FigaroCore V5.
 *
 * Model values:
 *   b1, b2   — two buyers (enables cross-buyer invariant verification)
 *   s1, s2   — two sellers (enables multi-seller process trees)
 *
 * Parameters tuned for exhaustive exploration under TLC:
 *   InitialBalance = 30  (enough for ~5 max-payment orders per participant)
 *   MaxPayment = 3       (small domain, captures edge cases)
 *   MaxProcesses = 2     (concurrent process interaction)
 *   MaxSubOrders = 2     (process trees with up to 3 orders)
 *)
EXTENDS FigaroCore

CONSTANTS b1, b2, s1, s2

MCBuyers == { b1, b2 }
MCSellers == { s1, s2 }
MCInitialBalance == 30
MCMaxPayment == 3
MCMaxProcesses == 2
MCMaxSubOrders == 2

====

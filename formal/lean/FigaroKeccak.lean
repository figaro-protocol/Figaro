/-
FigaroKeccak — the one cryptographic assumption the data lemmas rest on,
stated once.

A word is 32 bytes, as `bytes32` in Solidity, `B256` in the guest and a
32-byte `Hex` in the SDK. `keccak` is any function from byte strings to
words: every definition in `FigaroMerkle.lean` and `FigaroStateTree.lean`
takes it as a parameter, so nothing about keccak256's internals is assumed.

The assumption is `CollisionFree keccak`: equal digests come from equal
inputs. No function from all byte strings into 32-byte words is injective,
so each lemma is also stated in its constructive form, a conclusion OR an
explicit collision (`keccak x = keccak y` with `x ≠ y`). That form is a
plain implication about the real keccak256: a counterexample to the lemma
hands over a keccak collision.

`ZeroUnreached keccak` (no input hashes to the zero word) is used by the
state tree alone, because that tree writes the zero word for an empty
subtree (`prover/lib/src/state_tree.rs:5`, `:63`). Without it the lemma is
false: a leaf whose hash were zero would share its root with the empty tree.
-/

/-- A 32-byte word. -/
structure Word where
  bytes : List UInt8
  len : bytes.length = 32
deriving DecidableEq

namespace Word

theorem ext {a b : Word} (h : a.bytes = b.bytes) : a = b := by
  cases a; cases b; simp at h; subst h; rfl

/-- `bytes32(0)` / `B256::ZERO`. -/
def zero : Word := ⟨List.replicate 32 0, by simp⟩

/-- Two words read back from their concatenation. -/
theorem append_inj {a b c d : Word} (h : a.bytes ++ b.bytes = c.bytes ++ d.bytes) :
    a = c ∧ b = d := by
  have := List.append_inj h (by rw [a.len, c.len])
  exact ⟨ext this.1, ext this.2⟩

end Word

/-- THE ASSUMPTION: keccak is injective on its inputs (collision freedom). -/
def CollisionFree (keccak : List UInt8 → Word) : Prop :=
  ∀ x y, keccak x = keccak y → x = y

/-- The state tree's second assumption: the zero word has no keccak preimage. -/
def ZeroUnreached (keccak : List UInt8 → Word) : Prop :=
  ∀ x, keccak x ≠ Word.zero

/-- Collision freedom fails only through an exhibited collision. -/
theorem collisionFree_or_collision (keccak : List UInt8 → Word) :
    CollisionFree keccak ∨ ∃ x y, x ≠ y ∧ keccak x = keccak y := by
  apply Classical.byCases (p := ∃ x y, x ≠ y ∧ keccak x = keccak y)
  · intro h; exact Or.inr h
  · intro h
    left
    intro x y hxy
    apply Classical.byContradiction
    intro hne
    exact h ⟨x, y, hne, hxy⟩

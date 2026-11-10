import FigaroKeccak

/-
FigaroMerkle — merkle binding for the agreement and assembly trees: a leaf
opens against a root only if it was one of the leaves the root was built
from. Assumes only `CollisionFree keccak` (`FigaroKeccak.lean`).

THE MODEL, and the code each definition stands for:

* `hashPair`: the sorted-pair node, `keccak256(min(a,b) ‖ max(a,b))`, 64
  bytes — `sdk/src/agreement.ts:265` (`hashPair`), OpenZeppelin
  `Hashes.commutativeKeccak256` (`lib/openzeppelin-contracts/contracts/
  utils/cryptography/Hashes.sol:17`), `prover/lib/src/merkle.rs:24`
  (`hash_pair_sorted`). The comparator is a parameter `lt`: every lemma
  holds for every comparator, so it covers the uint256 order on-chain and
  the lowercase-hex order in the SDK alike.
* `buildMerkleRoot`: layer by layer, adjacent pairs hashed, an odd last
  node carried up, the empty tree's root the zero word —
  `sdk/src/agreement.ts:281`. The SDK sorts leaves first
  (`sortLeaves`, `:273`); binding holds for any order, so the sort is not
  modeled.
* `verify`: fold the proof into the leaf, compare with the root —
  OpenZeppelin `MerkleProof.verify` / `processProof`
  (`MerkleProof.sol:45`, `:57`), called by
  `src/core/attestation/AttestationCoordinator.sol:163`;
  `prover/lib/src/merkle.rs:14` (`verify_inclusion`).
* `clauseLeaf`: `keccak256(keccak256(key ‖ dataHash))` —
  `src/core/kernel/CommitmentTypes.sol:45`, `sdk/src/agreement.ts:258`.
  `assemblyLeaf`: `keccak256(keccak256(domain ‖ key ‖ dataHash))` —
  `sdk/src/assembly.ts:251`.

DOMAIN SEPARATION. The code calls its leaves double-hashed, and that is the
separation: a leaf's outer preimage is 32 bytes, a node's is 64, so no node
digest can stand for a leaf (OpenZeppelin's second-preimage defence). There
is no prefix byte in this tree. The lemma needs exactly this: every leaf is
a digest of an input whose length is not 64 (`LeafForm`). Dropping the outer
hash of `clauseLeaf` makes its preimage 64 bytes and `clauseLeaf_form` no
longer proves.

The shared vectors `test/fixtures/merkle-vectors.json`, checked by
`sdk/tests/merkleParity.test.ts`, `test/core/attestation/MerkleParityTest.t.sol`
and `prover/lib/tests/merkle_parity.rs`, tie these definitions to the three
codebases; this file proves properties of the model, not of the code.
-/

section Merkle

variable (keccak : List UInt8 → Word) (lt : Word → Word → Bool)

/-- The sorted-pair node digest. -/
def hashPair (a b : Word) : Word :=
  if lt a b then keccak (a.bytes ++ b.bytes) else keccak (b.bytes ++ a.bytes)

/-- One layer up: adjacent pairs hashed, an odd last node carried up. -/
def nextLayer : List Word → List Word
  | a :: b :: t => hashPair keccak lt a b :: nextLayer t
  | l => l

theorem nextLayer_length_le (l : List Word) : (nextLayer keccak lt l).length ≤ l.length := by
  induction l using nextLayer.induct keccak lt with
  | case1 a b t ih => simp [nextLayer]; omega
  | case2 l h => rw [nextLayer.eq_2 keccak lt l h]; exact Nat.le_refl _

theorem nextLayer_length_lt (a b : Word) (t : List Word) :
    (nextLayer keccak lt (a :: b :: t)).length < (a :: b :: t).length := by
  simp [nextLayer]; have := nextLayer_length_le keccak lt t; omega

/-- `buildMerkleRoot` (`sdk/src/agreement.ts:281`). -/
def buildMerkleRoot : List Word → Word
  | [] => Word.zero
  | [r] => r
  | a :: b :: t => buildMerkleRoot (nextLayer keccak lt (a :: b :: t))
termination_by l => l.length
decreasing_by exact nextLayer_length_lt keccak lt a b t

/-- `MerkleProof.verify`: the proof folded into the leaf equals the root. -/
def verify (proof : List Word) (root leaf : Word) : Bool :=
  decide (proof.foldl (hashPair keccak lt) leaf = root)

/-- The agreement leaf (`CommitmentTypes.clauseLeaf`). -/
def clauseLeaf (key dataHash : Word) : Word :=
  keccak (keccak (key.bytes ++ dataHash.bytes)).bytes

/-- The assembly leaf (`computeAssemblyLeaf`). -/
def assemblyLeaf (domain key dataHash : Word) : Word :=
  keccak (keccak (domain.bytes ++ key.bytes ++ dataHash.bytes)).bytes

/-- A leaf digest: the hash of an input that is not 64 bytes long, so of no
node's input. -/
def LeafForm (w : Word) : Prop := ∃ bs : List UInt8, bs.length ≠ 64 ∧ w = keccak bs

/-! ### The tree the layers build -/

inductive MTree where
  | leaf (w : Word)
  | node (l r : MTree)

namespace MTree

def hash : MTree → Word
  | leaf w => w
  | node l r => hashPair keccak lt (hash l) (hash r)

def leaves : MTree → List Word
  | leaf w => [w]
  | node l r => leaves l ++ leaves r

/-- `s` is a subtree of `t`. -/
def IsSub (s : MTree) : MTree → Prop
  | leaf w => s = leaf w
  | node l r => s = node l r ∨ IsSub s l ∨ IsSub s r

end MTree

def nextLayerT : List MTree → List MTree
  | a :: b :: t => MTree.node a b :: nextLayerT t
  | l => l

theorem nextLayerT_hash (ts : List MTree) :
    (nextLayerT ts).map (MTree.hash keccak lt) = nextLayer keccak lt (ts.map (MTree.hash keccak lt)) := by
  induction ts using nextLayerT.induct with
  | case1 a b t ih => simp [nextLayerT, nextLayer, MTree.hash, ih]
  | case2 l h =>
    rw [nextLayerT.eq_2 l h]
    cases l with
    | nil => rfl
    | cons x xs =>
      cases xs with
      | nil => rfl
      | cons y ys => exact absurd rfl (h x y ys)

theorem nextLayerT_leaves (ts : List MTree) :
    (nextLayerT ts).flatMap MTree.leaves = ts.flatMap MTree.leaves := by
  induction ts using nextLayerT.induct with
  | case1 a b t ih => simp [nextLayerT, MTree.leaves, ih]
  | case2 l h => rw [nextLayerT.eq_2 l h]

theorem nextLayerT_length_le (l : List MTree) : (nextLayerT l).length ≤ l.length := by
  induction l using nextLayerT.induct with
  | case1 a b t ih => simp [nextLayerT]; omega
  | case2 l h => rw [nextLayerT.eq_2 l h]; exact Nat.le_refl _

theorem nextLayerT_length_lt (a b : MTree) (t : List MTree) :
    (nextLayerT (a :: b :: t)).length < (a :: b :: t).length := by
  simp [nextLayerT]; have := nextLayerT_length_le t; omega

/-- The layers build a tree: the root is that tree's hash, its leaves the
input leaves in order. -/
theorem build_is_tree : ∀ ts : List MTree, ts ≠ [] →
    ∃ t : MTree, buildMerkleRoot keccak lt (ts.map (MTree.hash keccak lt)) = t.hash keccak lt ∧
      t.leaves = ts.flatMap MTree.leaves
  | [], h => absurd rfl h
  | [t], _ => ⟨t, by simp [buildMerkleRoot]⟩
  | a :: b :: t, _ => by
    have hne : nextLayerT (a :: b :: t) ≠ [] := by simp [nextLayerT]
    obtain ⟨u, hu, hl⟩ := build_is_tree (nextLayerT (a :: b :: t)) hne
    refine ⟨u, ?_, ?_⟩
    · rw [List.map_cons, List.map_cons, buildMerkleRoot, ← List.map_cons, ← List.map_cons,
        ← nextLayerT_hash, hu]
    · rw [hl, nextLayerT_leaves]
termination_by ts => ts.length
decreasing_by exact nextLayerT_length_lt a b t

/-! ### The binding argument -/

section Binding

variable {keccak} {lt}

theorem hashPair_inj (hcf : CollisionFree keccak) {x y c s : Word}
    (h : hashPair keccak lt x y = hashPair keccak lt c s) : c = x ∨ c = y := by
  unfold hashPair at h
  split at h <;> split at h <;>
  · have := Word.append_inj (hcf _ _ h)
    first
      | exact Or.inl this.1.symm
      | exact Or.inr this.1.symm
      | exact Or.inl this.2.symm
      | exact Or.inr this.2.symm

theorem hashPair_not_leaf (hcf : CollisionFree keccak) {w a b : Word}
    (hw : LeafForm keccak w) : w ≠ hashPair keccak lt a b := by
  obtain ⟨bs, hlen, rfl⟩ := hw
  intro h
  unfold hashPair at h
  split at h <;>
  · have := congrArg List.length (hcf _ _ h)
    simp [a.len, b.len] at this
    exact hlen this

theorem isSub_refl (t : MTree) : t.IsSub t := by
  cases t <;> simp [MTree.IsSub]

theorem isSub_trans {s u : MTree} : ∀ {t : MTree}, s.IsSub u → u.IsSub t → s.IsSub t
  | .leaf w, hsu, hut => by
    simp [MTree.IsSub] at hut; subst hut; exact hsu
  | .node l r, hsu, hut => by
    simp only [MTree.IsSub] at hut
    rcases hut with rfl | hl | hr
    · exact hsu
    · exact Or.inr (Or.inl (isSub_trans hsu hl))
    · exact Or.inr (Or.inr (isSub_trans hsu hr))

theorem isSub_leaves {s : MTree} : ∀ {t : MTree}, s.IsSub t → ∀ w ∈ s.leaves, w ∈ t.leaves
  | .leaf v, h, w, hw => by simp [MTree.IsSub] at h; subst h; exact hw
  | .node l r, h, w, hw => by
    simp only [MTree.IsSub] at h
    rcases h with rfl | hl | hr
    · exact hw
    · simp [MTree.leaves]; exact Or.inl (isSub_leaves hl w hw)
    · simp [MTree.leaves]; exact Or.inr (isSub_leaves hr w hw)

/-- The descent: whatever a proof folds into a tree's root is the hash of a
subtree of that tree — a node digest is never a leaf. -/
theorem fold_is_subtree (hcf : CollisionFree keccak) (t : MTree)
    (hleaves : ∀ w ∈ t.leaves, LeafForm keccak w) :
    ∀ (proof : List Word) (c : Word), proof.foldl (hashPair keccak lt) c = t.hash keccak lt →
      ∃ s : MTree, s.IsSub t ∧ s.hash keccak lt = c
  | [], c, h => ⟨t, isSub_refl t, h.symm⟩
  | p :: rest, c, h => by
    obtain ⟨s, hs, hsh⟩ := fold_is_subtree hcf t hleaves rest (hashPair keccak lt c p) h
    cases s with
    | leaf w =>
      exfalso
      have hw : LeafForm keccak w := hleaves w (isSub_leaves hs w (by simp [MTree.leaves]))
      exact hashPair_not_leaf hcf hw hsh
    | node l r =>
      simp only [MTree.hash] at hsh
      rcases hashPair_inj hcf hsh with hc | hc
      · exact ⟨l, isSub_trans (show l.IsSub (.node l r) from Or.inr (Or.inl (isSub_refl l))) hs,
          hc.symm⟩
      · exact ⟨r, isSub_trans (show r.IsSub (.node l r) from Or.inr (Or.inr (isSub_refl r))) hs,
          hc.symm⟩

theorem flatMap_leaf : ∀ l : List Word, (l.map MTree.leaf).flatMap MTree.leaves = l
  | [] => rfl
  | x :: xs => by
    have := flatMap_leaf xs
    simp only [List.map_cons, List.flatMap_cons, MTree.leaves] at this ⊢
    rw [this]; rfl

/-- LEMMA 1, MERKLE BINDING. If `verify(proof, root, leaf)` holds and
`root = buildMerkleRoot(leaves)`, with every leaf (and the opened one) a leaf
digest, then `leaf ∈ leaves`. Assumes only collision freedom. -/
theorem merkle_binding (hcf : CollisionFree keccak) (leaves : List Word) (hne : leaves ≠ [])
    (hforms : ∀ w ∈ leaves, LeafForm keccak w) (proof : List Word) (root leaf : Word)
    (hleaf : LeafForm keccak leaf)
    (hroot : root = buildMerkleRoot keccak lt leaves)
    (hv : verify keccak lt proof root leaf = true) :
    leaf ∈ leaves := by
  have hne' : leaves.map MTree.leaf ≠ [] := by
    cases leaves with
    | nil => exact absurd rfl hne
    | cons _ _ => simp
  obtain ⟨t, ht, hl⟩ := build_is_tree keccak lt (leaves.map MTree.leaf) hne'
  have hmap : (leaves.map MTree.leaf).map (MTree.hash keccak lt) = leaves := by
    simp [List.map_map, Function.comp_def, MTree.hash]
  have hflat : (leaves.map MTree.leaf).flatMap MTree.leaves = leaves := flatMap_leaf leaves
  rw [hmap] at ht
  rw [hflat] at hl
  have hfold : proof.foldl (hashPair keccak lt) leaf = t.hash keccak lt := by
    simp [verify] at hv; rw [hv, hroot, ht]
  obtain ⟨s, hs, hsh⟩ := fold_is_subtree hcf t (by rw [hl]; exact hforms) proof leaf hfold
  cases s with
  | leaf w =>
    simp only [MTree.hash] at hsh; subst hsh
    have := isSub_leaves hs w (by simp [MTree.leaves])
    rw [hl] at this; exact this
  | node l r =>
    simp only [MTree.hash] at hsh
    exact absurd hsh.symm (hashPair_not_leaf hcf hleaf)

/-- The same, as a statement about the real keccak256: membership, or a
keccak collision. -/
theorem merkle_binding_or_collision (leaves : List Word) (hne : leaves ≠ [])
    (hforms : ∀ w ∈ leaves, LeafForm keccak w) (proof : List Word) (root leaf : Word)
    (hleaf : LeafForm keccak leaf)
    (hroot : root = buildMerkleRoot keccak lt leaves)
    (hv : verify keccak lt proof root leaf = true) :
    leaf ∈ leaves ∨ ∃ x y, x ≠ y ∧ keccak x = keccak y := by
  rcases collisionFree_or_collision keccak with hcf | hcol
  · exact Or.inl (merkle_binding hcf leaves hne hforms proof root leaf hleaf hroot hv)
  · exact Or.inr hcol

/-! ### The agreement's and the assembly's leaves -/

theorem clauseLeaf_form (key dataHash : Word) : LeafForm keccak (clauseLeaf keccak key dataHash) :=
  ⟨_, by simp [Word.len], rfl⟩

theorem assemblyLeaf_form (domain key dataHash : Word) :
    LeafForm keccak (assemblyLeaf keccak domain key dataHash) :=
  ⟨_, by simp [Word.len], rfl⟩

theorem clauseLeaf_inj (hcf : CollisionFree keccak) {k d k' d' : Word}
    (h : clauseLeaf keccak k d = clauseLeaf keccak k' d') : k = k' ∧ d = d' :=
  Word.append_inj (hcf _ _ (Word.ext (hcf _ _ h)))

/-- An agreement's clause opens against its `checkoutHash` only if it is one
of the agreement's clauses: the key AND the data hash. -/
theorem clause_binding (hcf : CollisionFree keccak) (clauses : List (Word × Word))
    (hne : clauses ≠ []) (proof : List Word) (checkoutHash key dataHash : Word)
    (hroot : checkoutHash = buildMerkleRoot keccak lt (clauses.map fun c => clauseLeaf keccak c.1 c.2))
    (hv : verify keccak lt proof checkoutHash (clauseLeaf keccak key dataHash) = true) :
    (key, dataHash) ∈ clauses := by
  have hne' : clauses.map (fun c => clauseLeaf keccak c.1 c.2) ≠ [] := by
    cases clauses with
    | nil => exact absurd rfl hne
    | cons _ _ => simp
  have hmem := merkle_binding hcf _ hne'
    (by intro w hw; simp at hw; obtain ⟨a, b, _, rfl⟩ := hw; exact clauseLeaf_form a b)
    proof checkoutHash _ (clauseLeaf_form key dataHash) hroot hv
  simp at hmem
  obtain ⟨a, b, hab, he⟩ := hmem
  obtain ⟨rfl, rfl⟩ := clauseLeaf_inj hcf he
  exact hab

end Binding

end Merkle

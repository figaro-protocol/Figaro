import FigaroKeccak

/-
FigaroStateTree — the batch path's state tree: when `verify_and_update`
accepts a witness for a previous root that is the root of a state S, the new
root it returns is the root of S updated by the batch's writes. Assumes
`CollisionFree keccak` and `ZeroUnreached keccak` (`FigaroKeccak.lean`; the
second is needed because the tree writes the zero word for an empty subtree).

THE MODEL, read from `prover/lib/src/state_tree.rs` whole:

* `leafHash`: `keccak256(0x00 ‖ path ‖ value_hash)` — `:25`.
  `nodeHash`: `keccak256(0x01 ‖ left ‖ right)` — `:33`. Both 65 bytes; the
  first byte separates them.
* `bit`: bit `d` of a path, bit 0 the most significant — `:42`.
* `T`: the root as the module comment defines it (`:4`-`:8`): the empty set
  is the zero word, a set of one leaf is that leaf's hash, a larger set is the
  node over its two halves split by bit `d`.
* `Summary`, `combine` (`:54`-`:76`): two empty siblings are empty, a lone
  leaf beside an empty sibling RISES unchanged, anything else is a node.
* `summarize` (`:80`), `root` (`:92`): `T` as a summary, split by bit `d`.
  The code splits a sorted slice at `partition_point`; the model filters by
  the bit, which selects the same leaves when the slice is sorted by path.
* `walk` (`:164`-`:220`) with `split` (`:224`-`:231`): the descent. The
  items are `ProofItem` (`:99`): Empty, Leaf, Node, Descend. A Descend at
  depth 256 is refused (`:214`). The code's `prefix` word with bit `d` set
  for the right child (`:226`-`:227`) is the list of the position's bits.
* `roots` (`:239`) and `verify_and_update` (`:255`): the order check, the
  removed-leaf check, the descent from depth 0, the refusal of an
  unconsumed proof (`:248`), and the previous-root check (`:261`).

TWO PLACES THE MODEL REFUSES WHERE THE CODE WOULD PANIC. With two or more
witnessed paths at depth 256 (`:218`) and in `summarize` with two or more
leaves at depth 256, the code reads bit 256 and indexes past the 32 bytes.
Strictly increasing paths never get there, since two distinct paths differ
in a bit below 256. The model refuses there (and gives `summarize` a fixed
node) so every definition is total.

The state tree's Rust tests (`prover/lib/tests/state_tree.rs`) tie the code
to its own reference (`root`, `prove`); this file proves a property of the
model, not of the compiled guest.
-/

section StateTree

variable (keccak : List UInt8 → Word)

/-- A leaf: its path and its value hash. -/
abbrev Leaf := Word × Word

/-- `leaf_hash` (`state_tree.rs:25`). -/
def leafHash (q : Leaf) : Word := keccak ((0 : UInt8) :: (q.1.bytes ++ q.2.bytes))

/-- `node_hash` (`state_tree.rs:33`). -/
def nodeHash (l r : Word) : Word := keccak ((1 : UInt8) :: (l.bytes ++ r.bytes))

/-- `bit` (`state_tree.rs:42`): bit `d` of a path, bit 0 the most significant. -/
def bit (p : Word) (d : Nat) : Bool :=
  ((p.bytes.getD (d / 8) 0) >>> (7 - d % 8).toUInt8) &&& 1 == 1

/-- The path agrees with the position `pre` (its first `pre.length` bits). -/
def OnPos (p : Word) (pre : List Bool) : Prop := (List.range pre.length).map (bit p) = pre

instance (p : Word) (pre : List Bool) : Decidable (OnPos p pre) :=
  inferInstanceAs (Decidable (_ = _))

/-- The leaves of `L` whose bit `d` is `c`: `c = false` the left half. -/
def part (c : Bool) (d : Nat) (L : List Leaf) : List Leaf := L.filter (fun q => bit q.1 d == c)

/-- `T` (`state_tree.rs:4`-`:8`), the root's definition. -/
def T : List Leaf → Nat → Word
  | [], _ => Word.zero
  | [q], _ => leafHash keccak q
  | y1 :: y2 :: r, d =>
    if _ : d < 256 then
      nodeHash keccak (T (part false d (y1 :: y2 :: r)) (d + 1)) (T (part true d (y1 :: y2 :: r)) (d + 1))
    else nodeHash keccak Word.zero Word.zero
termination_by _ d => 256 - d

/-- `Summary` (`state_tree.rs:54`). -/
inductive Summary where
  | empty
  | one (h : Word)
  | node (h : Word)
deriving DecidableEq

def Summary.hash : Summary → Word
  | .empty => Word.zero
  | .one h => h
  | .node h => h

/-- `Summary::combine` (`state_tree.rs:69`): the lone leaf rises. -/
def combine : Summary → Summary → Summary
  | .empty, .empty => .empty
  | .empty, .one h => .one h
  | .one h, .empty => .one h
  | l, r => .node (nodeHash keccak l.hash r.hash)

/-- `summarize` (`state_tree.rs:80`). -/
def summarize : List Leaf → Nat → Summary
  | [], _ => .empty
  | [q], _ => .one (leafHash keccak q)
  | y1 :: y2 :: r, d =>
    if _ : d < 256 then
      combine keccak (summarize (part false d (y1 :: y2 :: r)) (d + 1))
        (summarize (part true d (y1 :: y2 :: r)) (d + 1))
    else .node (nodeHash keccak Word.zero Word.zero)
termination_by _ d => 256 - d

/-- `root` (`state_tree.rs:92`). -/
def root (S : List Leaf) : Word := (summarize keccak S 0).hash

/-- `T` as the summary of its set, by the set's size. -/
def sumT (L : List Leaf) (d : Nat) : Summary :=
  match L with
  | [] => .empty
  | [q] => .one (leafHash keccak q)
  | _ :: _ :: _ => .node (T keccak L d)

/-- `ProofItem` (`state_tree.rs:99`). -/
inductive ProofItem where
  | empty
  | leaf (path valueHash : Word)
  | node (h : Word)
  | descend

/-- `WitnessedLeaf` (`state_tree.rs:113`). -/
structure WL where
  path : Word
  before : Option Word
  after : Option Word

/-- `TreeError` (`state_tree.rs:121`). -/
inductive TreeError where
  | entriesNotStrictlyIncreasing
  | leafRemoved
  | presentLeafClaimedAbsent
  | absenceProofForPresentEntry
  | leafOffPosition
  | valueMismatch
  | nodeAtWitnessedPosition
  | descendWithoutWitnessedPath
  | descendPastLastBit
  | proofTooShort
  | proofNotConsumed
  | previousRootMismatch

/-- Path order, as `B256`'s byte order. -/
def Word.ltB (a b : Word) : Bool := decide (a.bytes < b.bytes)

/-- The two-leaf slice sorted by path (`state_tree.rs:207`-`:208`). -/
def sortPair (a b : Leaf) : List Leaf := if Word.ltB b.1 a.1 then [b, a] else [a, b]

/-- The witnessed leaves on side `c` of bit `d` (`state_tree.rs:225`). -/
def wpart (c : Bool) (d : Nat) (w : List WL) : List WL := w.filter (fun x => bit x.path d == c)

abbrev Step := Except TreeError (Summary × Summary × List ProofItem)

/-- `split` (`state_tree.rs:224`): the left half, then the right half on the
items the left one left, combined. -/
def splitWith (left right : List ProofItem → Step) (items : List ProofItem) : Step :=
  match left items with
  | .error e => .error e
  | .ok (lb, la, r1) =>
    match right r1 with
    | .error e => .error e
    | .ok (rb, ra, r2) => .ok (combine keccak lb rb, combine keccak la ra, r2)

/-- `walk` (`state_tree.rs:164`): the (before, after) summaries of the
subtree at depth `d`, position `pre`, its witnessed leaves `w`, and the items
not consumed. -/
def walk : List WL → Nat → List Bool → List ProofItem → Step
  | [], _, pre, items =>
    match items with
    | [] => .error .proofTooShort
    | .empty :: rest => .ok (.empty, .empty, rest)
    | .leaf p v :: rest =>
      if OnPos p pre then .ok (.one (leafHash keccak (p, v)), .one (leafHash keccak (p, v)), rest)
      else .error .leafOffPosition
    | .node h :: rest => .ok (.node h, .node h, rest)
    | .descend :: _ => .error .descendWithoutWitnessedPath
  | [x], d, pre, items =>
    match items with
    | [] => .error .proofTooShort
    | .empty :: rest =>
      if x.before.isSome then .error .absenceProofForPresentEntry
      else
        .ok (.empty, (match x.after with
          | none => .empty
          | some v => .one (leafHash keccak (x.path, v))), rest)
    | .leaf p v :: rest =>
      if p = x.path then
        match x.before with
        | none => .error .presentLeafClaimedAbsent
        | some bv =>
          if bv ≠ v then .error .valueMismatch
          else
            match x.after with
            | none => .error .leafRemoved
            | some av =>
              .ok (.one (leafHash keccak (x.path, bv)), .one (leafHash keccak (x.path, av)), rest)
      else if ¬ OnPos p pre then .error .leafOffPosition
      else if x.before.isSome then .error .absenceProofForPresentEntry
      else
        match x.after with
        | none => .ok (.one (leafHash keccak (p, v)), .one (leafHash keccak (p, v)), rest)
        | some av =>
          .ok (.one (leafHash keccak (p, v)), summarize keccak (sortPair (p, v) (x.path, av)) d, rest)
    | .descend :: rest =>
      if _ : d < 256 then
        splitWith keccak (fun its => walk (wpart false d [x]) (d + 1) (pre ++ [false]) its)
          (fun its => walk (wpart true d [x]) (d + 1) (pre ++ [true]) its) rest
      else .error .descendPastLastBit
    | .node _ :: _ => .error .nodeAtWitnessedPosition
  | x :: y :: t, d, pre, items =>
    if _ : d < 256 then
      splitWith keccak (fun its => walk (wpart false d (x :: y :: t)) (d + 1) (pre ++ [false]) its)
        (fun its => walk (wpart true d (x :: y :: t)) (d + 1) (pre ++ [true]) its) items
    else .error .descendPastLastBit
termination_by _ d _ _ => 256 - d

/-- The witnessed paths strictly increase (`state_tree.rs:240`). -/
def strictlyIncreasing : List WL → Bool
  | x :: y :: t => Word.ltB x.path y.path && strictlyIncreasing (y :: t)
  | _ => true

/-- `roots` (`state_tree.rs:239`). -/
def roots (w : List WL) (proof : List ProofItem) : Except TreeError (Word × Word) :=
  if !strictlyIncreasing w then .error .entriesNotStrictlyIncreasing
  else if w.any (fun x => x.before.isSome && x.after.isNone) then .error .leafRemoved
  else
    match walk keccak w 0 [] proof with
    | .error e => .error e
    | .ok (b, a, rest) => if rest.isEmpty then .ok (b.hash, a.hash) else .error .proofNotConsumed

/-- `verify_and_update` (`state_tree.rs:255`). -/
def verifyAndUpdate (prev : Word) (w : List WL) (proof : List ProofItem) : Except TreeError Word :=
  match roots keccak w proof with
  | .error e => .error e
  | .ok (before, after) => if before ≠ prev then .error .previousRootMismatch else .ok after

/-- The leaves on a position. -/
def AtPos (pre : List Bool) (L : List Leaf) : Prop := ∀ y ∈ L, OnPos y.1 pre

/-- `La` is `Lb` updated by the batch's writes: a leaf of `La` is a write
`(path, after)`, or a leaf of `Lb` at a path the batch does not write. -/
def Updated (w : List WL) (Lb La : List Leaf) : Prop :=
  ∀ y : Leaf, y ∈ La ↔
    ((∃ x ∈ w, x.path = y.1 ∧ x.after = some y.2) ∨ (y ∈ Lb ∧ ∀ x ∈ w, x.path = y.1 → x.after = none))

def Summary.rank : Summary → Nat
  | .empty => 0
  | .one _ => 1
  | .node _ => 2

/-! ### Plain facts: positions, lists, shapes -/

theorem onPos_nil (p : Word) : OnPos p [] := by simp [OnPos]

theorem onPos_snoc {p : Word} {pre : List Bool} {c : Bool} :
    OnPos p (pre ++ [c]) ↔ OnPos p pre ∧ bit p pre.length = c := by
  unfold OnPos
  rw [List.length_append, List.length_singleton, List.range_succ, List.map_append]
  constructor
  · intro h
    have := List.append_inj h (by simp)
    simp only [List.map_cons, List.map_nil, List.cons.injEq, and_true] at this
    exact this
  · rintro ⟨h1, h2⟩
    rw [h1]; simp [h2]

theorem list_shape {α : Type} (L : List α) : L = [] ∨ (∃ q, L = [q]) ∨ ∃ a b r, L = a :: b :: r := by
  match L with
  | [] => exact Or.inl rfl
  | [q] => exact Or.inr (Or.inl ⟨q, rfl⟩)
  | a :: b :: r => exact Or.inr (Or.inr ⟨a, b, r, rfl⟩)

theorem nodup_part {L : List Leaf} (h : L.Nodup) (c : Bool) (d : Nat) : (part c d L).Nodup :=
  List.Pairwise.filter _ h

theorem mem_part {y : Leaf} {c : Bool} {d : Nat} {L : List Leaf} :
    y ∈ part c d L ↔ y ∈ L ∧ bit y.1 d = c := by
  simp [part]

theorem mem_wpart {x : WL} {c : Bool} {d : Nat} {w : List WL} :
    x ∈ wpart c d w ↔ x ∈ w ∧ bit x.path d = c := by
  simp [wpart]

/-- Two duplicate-free lists with the same members have the same shape. -/
theorem nodup_shape {L L' : List Leaf} (hL : L.Nodup) (hL' : L'.Nodup) (hm : ∀ y, y ∈ L ↔ y ∈ L') :
    (L = [] ∧ L' = []) ∨ (∃ q, L = [q] ∧ L' = [q]) ∨
      ((∃ a b r, L = a :: b :: r) ∧ (∃ a b r, L' = a :: b :: r)) := by
  rcases list_shape L with rfl | ⟨q, rfl⟩ | ⟨a, b, r, rfl⟩ <;>
  rcases list_shape L' with rfl | ⟨q', rfl⟩ | ⟨a', b', r', rfl⟩
  · exact Or.inl ⟨rfl, rfl⟩
  · exact absurd ((hm q').2 (by simp)) (by simp)
  · exact absurd ((hm a').2 (by simp)) (by simp)
  · exact absurd ((hm q).1 (by simp)) (by simp)
  · have := (hm q).1 (by simp); simp at this; subst this; exact Or.inr (Or.inl ⟨q, rfl, rfl⟩)
  · have ha := (hm a').2 (by simp); have hb := (hm b').2 (by simp)
    simp at ha hb; subst ha; subst hb
    exact absurd (by simp) (List.nodup_cons.1 hL').1
  · exact absurd ((hm a).1 (by simp)) (by simp)
  · have ha := (hm a).1 (by simp); have hb := (hm b).1 (by simp)
    simp at ha hb; subst ha; subst hb
    exact absurd (by simp) (List.nodup_cons.1 hL).1
  · exact Or.inr (Or.inr ⟨⟨a, b, r, rfl⟩, ⟨a', b', r', rfl⟩⟩)

/-- When the left half is empty the right half is everything. -/
theorem part_false_nil {L : List Leaf} {d : Nat} (h : part false d L = []) : part true d L = L := by
  unfold part at *
  rw [List.filter_eq_nil_iff] at h
  rw [List.filter_eq_self]
  intro a ha
  have := h a ha
  revert this; cases bit a.1 d <;> simp

theorem part_true_nil {L : List Leaf} {d : Nat} (h : part true d L = []) : part false d L = L := by
  unfold part at *
  rw [List.filter_eq_nil_iff] at h
  rw [List.filter_eq_self]
  intro a ha
  have := h a ha
  revert this; cases bit a.1 d <;> simp

/-! ### T, its summary, and `summarize` -/

theorem T_two (y1 y2 : Leaf) (r : List Leaf) (d : Nat) :
    ∃ a c, T keccak (y1 :: y2 :: r) d = nodeHash keccak a c := by
  rw [T]; split
  · exact ⟨_, _, rfl⟩
  · exact ⟨_, _, rfl⟩

theorem sumT_hash (L : List Leaf) (d : Nat) : (sumT keccak L d).hash = T keccak L d := by
  rcases list_shape L with rfl | ⟨q, rfl⟩ | ⟨a, b, r, rfl⟩ <;> simp [sumT, Summary.hash, T]

/-- Where neither half is a lone leaf beside an empty one, the halves
combine into a node. -/
theorem combine_node {l r : Summary}
    (h1 : ¬ (l = .empty ∧ r = .empty)) (h2 : ∀ h, ¬ (l = .empty ∧ r = .one h))
    (h3 : ∀ h, ¬ (l = .one h ∧ r = .empty)) :
    combine keccak l r = .node (nodeHash keccak l.hash r.hash) := by
  cases l <;> cases r <;> simp_all [combine]

/-- THE RISE, as the code's `combine` and the definition `T` agree on it: a
set of two or more leaves is the node over its halves' summaries. -/
theorem combine_parts (y1 y2 : Leaf) (r : List Leaf) (d e : Nat) :
    combine keccak (sumT keccak (part false d (y1 :: y2 :: r)) e) (sumT keccak (part true d (y1 :: y2 :: r)) e)
      = .node (nodeHash keccak (T keccak (part false d (y1 :: y2 :: r)) e) (T keccak (part true d (y1 :: y2 :: r)) e)) := by
  rw [← sumT_hash, ← sumT_hash]
  apply combine_node
  · intro ⟨hl, hr⟩
    have hl' : part false d (y1 :: y2 :: r) = [] := by
      rcases list_shape (part false d (y1 :: y2 :: r)) with h | ⟨q, h⟩ | ⟨a, b, s, h⟩ <;>
        rw [h] at hl ⊢ <;> simp [sumT] at hl
    have := part_false_nil hl'
    rw [this] at hr; simp [sumT] at hr
  · intro h ⟨hl, hr⟩
    have hl' : part false d (y1 :: y2 :: r) = [] := by
      rcases list_shape (part false d (y1 :: y2 :: r)) with h | ⟨q, h⟩ | ⟨a, b, s, h⟩ <;>
        rw [h] at hl ⊢ <;> simp [sumT] at hl
    have := part_false_nil hl'
    rw [this] at hr; simp [sumT] at hr
  · intro h ⟨hl, hr⟩
    have hr' : part true d (y1 :: y2 :: r) = [] := by
      rcases list_shape (part true d (y1 :: y2 :: r)) with h | ⟨q, h⟩ | ⟨a, b, s, h⟩ <;>
        rw [h] at hr ⊢ <;> simp [sumT] at hr
    have := part_true_nil hr'
    rw [this] at hl; simp [sumT] at hl

/-- The code's `summarize` is the definition's `T`. -/
theorem summarize_eq_sumT : ∀ (L : List Leaf) (d : Nat), summarize keccak L d = sumT keccak L d
  | [], d => by simp [summarize, sumT]
  | [q], d => by simp [summarize, sumT]
  | y1 :: y2 :: r, d => by
    rw [summarize]
    split
    · rename_i hd
      rw [summarize_eq_sumT (part false d (y1 :: y2 :: r)) (d + 1),
        summarize_eq_sumT (part true d (y1 :: y2 :: r)) (d + 1), combine_parts]
      simp only [sumT]; rw [T, dif_pos hd]
    · rename_i hd
      simp only [sumT]; rw [T, dif_neg hd]
termination_by _ d => 256 - d

theorem sumT_unfold (L : List Leaf) {d : Nat} (hd : d < 256) :
    sumT keccak L d = combine keccak (sumT keccak (part false d L) (d + 1)) (sumT keccak (part true d L) (d + 1)) := by
  rcases list_shape L with rfl | ⟨q, rfl⟩ | ⟨a, b, r, rfl⟩
  · simp [sumT, part, combine]
  · simp only [part, List.filter]
    cases bit q.1 d <;> simp [sumT, combine]
  · rw [combine_parts]; simp only [sumT]; rw [T, dif_pos hd]

/-- `T` depends on the set of leaves alone. -/
theorem T_ext : ∀ (L L' : List Leaf) (d : Nat), L.Nodup → L'.Nodup → (∀ y, y ∈ L ↔ y ∈ L') →
    T keccak L d = T keccak L' d
  | L, L', d, hL, hL', hm => by
    rcases nodup_shape hL hL' hm with ⟨rfl, rfl⟩ | ⟨q, rfl, rfl⟩ | ⟨⟨a, b, r, rfl⟩, ⟨a', b', r', rfl⟩⟩
    · rfl
    · rfl
    · rw [T, T]
      split
      · rename_i hd
        have hpart : ∀ c, ∀ y, y ∈ part c d (a :: b :: r) ↔ y ∈ part c d (a' :: b' :: r') := by
          intro c y; rw [mem_part, mem_part, hm y]
        rw [T_ext (part false d _) (part false d _) (d + 1) (nodup_part hL _ _) (nodup_part hL' _ _)
            (hpart false),
          T_ext (part true d _) (part true d _) (d + 1) (nodup_part hL _ _) (nodup_part hL' _ _)
            (hpart true)]
      · rfl
termination_by _ _ d => 256 - d

theorem sumT_ext {L L' : List Leaf} (d : Nat) (hL : L.Nodup) (hL' : L'.Nodup) (hm : ∀ y, y ∈ L ↔ y ∈ L') :
    sumT keccak L d = sumT keccak L' d := by
  rcases nodup_shape hL hL' hm with ⟨rfl, rfl⟩ | ⟨q, rfl, rfl⟩ | ⟨⟨a, b, r, rfl⟩, ⟨a', b', r', rfl⟩⟩
  · rfl
  · rfl
  · simp only [sumT]; rw [T_ext keccak _ _ d hL hL' hm]

/-! ### Where the assumption enters -/

section Hash

variable {keccak}

theorem leafHash_eq_iff (hcf : CollisionFree keccak) {q q' : Leaf} :
    leafHash keccak q = leafHash keccak q' ↔ q = q' := by
  constructor
  · intro h
    have h1 := hcf _ _ h
    simp only [List.cons.injEq, true_and] at h1
    obtain ⟨a, b⟩ := Word.append_inj h1
    exact Prod.ext a b
  · intro h; rw [h]

theorem nodeHash_eq_iff (hcf : CollisionFree keccak) {a b c e : Word} :
    nodeHash keccak a b = nodeHash keccak c e ↔ a = c ∧ b = e := by
  constructor
  · intro h
    have h1 := hcf _ _ h
    simp only [List.cons.injEq, true_and] at h1
    exact Word.append_inj h1
  · rintro ⟨rfl, rfl⟩; rfl

theorem leafHash_ne_nodeHash (hcf : CollisionFree keccak) {q : Leaf} {a b : Word} :
    leafHash keccak q ≠ nodeHash keccak a b := by
  intro h
  have h1 := hcf _ _ h
  simp at h1

theorem nodeHash_ne_leafHash (hcf : CollisionFree keccak) {q : Leaf} {a b : Word} :
    nodeHash keccak a b ≠ leafHash keccak q := fun h => leafHash_ne_nodeHash hcf h.symm

theorem leafHash_ne_zero (hz : ZeroUnreached keccak) {q : Leaf} : leafHash keccak q ≠ Word.zero := hz _

theorem zero_ne_leafHash (hz : ZeroUnreached keccak) {q : Leaf} : Word.zero ≠ leafHash keccak q :=
  fun h => hz _ h.symm

theorem nodeHash_ne_zero (hz : ZeroUnreached keccak) {a b : Word} : nodeHash keccak a b ≠ Word.zero := hz _

theorem zero_ne_nodeHash (hz : ZeroUnreached keccak) {a b : Word} : Word.zero ≠ nodeHash keccak a b :=
  fun h => hz _ h.symm

theorem sumT_hash_zero (hz : ZeroUnreached keccak) {L : List Leaf} {d : Nat}
    (h : (sumT keccak L d).hash = Word.zero) : L = [] := by
  rcases list_shape L with rfl | ⟨q, rfl⟩ | ⟨a, b, r, rfl⟩
  · rfl
  · simp [sumT, Summary.hash] at h; exact absurd h (leafHash_ne_zero hz)
  · simp only [sumT, Summary.hash] at h
    obtain ⟨u, v, hT⟩ := T_two keccak a b r d
    rw [hT] at h; exact absurd h (nodeHash_ne_zero hz)

theorem sumT_hash_leaf (hcf : CollisionFree keccak) (hz : ZeroUnreached keccak) {L : List Leaf} {d : Nat}
    {q : Leaf} (h : (sumT keccak L d).hash = leafHash keccak q) : L = [q] := by
  rcases list_shape L with rfl | ⟨q', rfl⟩ | ⟨a, b, r, rfl⟩
  · simp [sumT, Summary.hash] at h; exact absurd h (zero_ne_leafHash hz)
  · simp only [sumT, Summary.hash] at h; rw [(leafHash_eq_iff hcf).1 h]
  · simp only [sumT, Summary.hash] at h
    obtain ⟨u, v, hT⟩ := T_two keccak a b r d
    rw [hT] at h; exact absurd h (nodeHash_ne_leafHash hcf)

/-- What a summary the descent computes can be. -/
def WForm (pre : List Bool) (s : Summary) : Prop :=
  s = .empty ∨ (∃ q : Leaf, s = .one (leafHash keccak q) ∧ OnPos q.1 pre) ∨ ∃ h, s = .node h

/-- What a summary of a set of leaves on a position can be. -/
def TForm (pre : List Bool) (s : Summary) : Prop :=
  s = .empty ∨ (∃ q : Leaf, s = .one (leafHash keccak q) ∧ OnPos q.1 pre) ∨
    ∃ a c, s = .node (nodeHash keccak a c)

theorem sumT_tform {pre : List Bool} {L : List Leaf} (d : Nat) (h : AtPos pre L) :
    TForm (keccak := keccak) pre (sumT keccak L d) := by
  rcases list_shape L with rfl | ⟨q, rfl⟩ | ⟨a, b, r, rfl⟩
  · exact Or.inl rfl
  · exact Or.inr (Or.inl ⟨q, rfl, h q (by simp)⟩)
  · obtain ⟨u, v, hT⟩ := T_two keccak a b r d
    exact Or.inr (Or.inr ⟨u, v, by simp only [sumT]; rw [hT]⟩)

/-- The children's hashes from the parent's: a node digest opens into its
two children; a risen lone leaf opens on the side its path lies on. -/
theorem split_hashes (hcf : CollisionFree keccak) (hz : ZeroUnreached keccak)
    {p0 p1 : List Bool} (hdisj : ∀ p, OnPos p p0 → OnPos p p1 → False)
    {lb rb lt rt : Summary} (hlb : WForm (keccak := keccak) p0 lb) (hrb : WForm (keccak := keccak) p1 rb)
    (hlt : TForm (keccak := keccak) p0 lt) (hrt : TForm (keccak := keccak) p1 rt)
    (heq : (combine keccak lb rb).hash = (combine keccak lt rt).hash) :
    lb.hash = lt.hash ∧ rb.hash = rt.hash := by
  rcases hlb with rfl | ⟨q1, rfl, hq1⟩ | ⟨h1, rfl⟩ <;>
  rcases hrb with rfl | ⟨q2, rfl, hq2⟩ | ⟨h2, rfl⟩ <;>
  rcases hlt with rfl | ⟨q3, rfl, hq3⟩ | ⟨a3, c3, rfl⟩ <;>
  rcases hrt with rfl | ⟨q4, rfl, hq4⟩ | ⟨a4, c4, rfl⟩ <;>
  simp [combine, Summary.hash, leafHash_eq_iff hcf, nodeHash_eq_iff hcf, leafHash_ne_nodeHash hcf,
    nodeHash_ne_leafHash hcf, leafHash_ne_zero hz, zero_ne_leafHash hz, nodeHash_ne_zero hz,
    zero_ne_nodeHash hz] at heq ⊢ <;>
  first
    | exact heq
    | (subst heq; exact hdisj _ hq3 hq2)
    | (subst heq; exact hdisj _ hq1 hq4)
    | skip

/-- A child masqueraded by a `Node` item where the set holds one leaf or
none: the parent's hash catches it unless the sibling holds a leaf, and then
the masquerade is harmless before and after the batch. -/
theorem masq_left (hcf : CollisionFree keccak) (hz : ZeroUnreached keccak)
    {p0 p1 : List Bool} {lb lt rt ra : Summary}
    (hm : lb = lt ∨ ∃ h, lb = .node h) (hh : lb.hash = lt.hash)
    (hlt : TForm (keccak := keccak) p0 lt) (hrt : TForm (keccak := keccak) p1 rt)
    (hrank : rt.rank ≤ ra.rank)
    (heq : (combine keccak lb rt).hash = (combine keccak lt rt).hash) :
    combine keccak lb rt = combine keccak lt rt ∧ combine keccak lb ra = combine keccak lt ra := by
  rcases hm with rfl | ⟨h, rfl⟩
  · exact ⟨rfl, rfl⟩
  rcases hlt with rfl | ⟨q3, rfl, _⟩ | ⟨a3, c3, rfl⟩ <;>
  rcases hrt with rfl | ⟨q4, rfl, _⟩ | ⟨a4, c4, rfl⟩ <;>
  cases ra <;>
  simp [combine, Summary.hash, Summary.rank, leafHash_eq_iff hcf, nodeHash_eq_iff hcf,
    leafHash_ne_nodeHash hcf, nodeHash_ne_leafHash hcf, leafHash_ne_zero hz, zero_ne_leafHash hz,
    nodeHash_ne_zero hz, zero_ne_nodeHash hz] at hh heq hrank ⊢ <;>
  simp_all

theorem masq_right (hcf : CollisionFree keccak) (hz : ZeroUnreached keccak)
    {p0 p1 : List Bool} {rb rt lt la : Summary}
    (hm : rb = rt ∨ ∃ h, rb = .node h) (hh : rb.hash = rt.hash)
    (hlt : TForm (keccak := keccak) p0 lt) (hrt : TForm (keccak := keccak) p1 rt)
    (hrank : lt.rank ≤ la.rank)
    (heq : (combine keccak lt rb).hash = (combine keccak lt rt).hash) :
    combine keccak lt rb = combine keccak lt rt ∧ combine keccak la rb = combine keccak la rt := by
  rcases hm with rfl | ⟨h, rfl⟩
  · exact ⟨rfl, rfl⟩
  rcases hlt with rfl | ⟨q3, rfl, _⟩ | ⟨a3, c3, rfl⟩ <;>
  rcases hrt with rfl | ⟨q4, rfl, _⟩ | ⟨a4, c4, rfl⟩ <;>
  cases la <;>
  simp [combine, Summary.hash, Summary.rank, leafHash_eq_iff hcf, nodeHash_eq_iff hcf,
    leafHash_ne_nodeHash hcf, nodeHash_ne_leafHash hcf, leafHash_ne_zero hz, zero_ne_leafHash hz,
    nodeHash_ne_zero hz, zero_ne_nodeHash hz] at hh heq hrank ⊢ <;>
  simp_all

end Hash

/-! ### The descent -/

theorem splitWith_ok {left right : List ProofItem → Step} {items : List ProofItem}
    {b a : Summary} {rest : List ProofItem}
    (h : splitWith keccak left right items = .ok (b, a, rest)) :
    ∃ lb la r1 rb ra, left items = .ok (lb, la, r1) ∧ right r1 = .ok (rb, ra, rest) ∧
      b = combine keccak lb rb ∧ a = combine keccak la ra := by
  unfold splitWith at h
  split at h
  · cases h
  · rename_i lb la r1 hl
    split at h
    · cases h
    · rename_i rb ra r2 hr
      simp only [Except.ok.injEq, Prod.mk.injEq] at h
      obtain ⟨rfl, rfl, rfl⟩ := h
      exact ⟨_, _, _, _, _, hl, hr, rfl, rfl⟩

theorem combine_wform {pre : List Bool} {l r : Summary}
    (hl : WForm (keccak := keccak) (pre ++ [false]) l) (hr : WForm (keccak := keccak) (pre ++ [true]) r) :
    WForm (keccak := keccak) pre (combine keccak l r) := by
  rcases hl with rfl | ⟨q1, rfl, hq1⟩ | ⟨h1, rfl⟩ <;>
  rcases hr with rfl | ⟨q2, rfl, hq2⟩ | ⟨h2, rfl⟩ <;>
  first
    | exact Or.inl rfl
    | exact Or.inr (Or.inr ⟨_, rfl⟩)
    | exact Or.inr (Or.inl ⟨q1, rfl, (onPos_snoc.1 hq1).1⟩)
    | exact Or.inr (Or.inl ⟨q2, rfl, (onPos_snoc.1 hq2).1⟩)

theorem combine_rank_mono {l r l' r' : Summary} (hl : l.rank ≤ l'.rank) (hr : r.rank ≤ r'.rank) :
    (combine keccak l r).rank ≤ (combine keccak l' r').rank := by
  cases l <;> cases r <;> cases l' <;> cases r' <;> simp [combine, Summary.rank] at hl hr ⊢

/-- Every summary the descent computes for the previous tree is a leaf on the
position, a node, or empty. -/
theorem walk_wform (w : List WL) (d : Nat) (pre : List Bool) (items : List ProofItem)
    (b a : Summary) (rest : List ProofItem)
    (hw : walk keccak w d pre items = .ok (b, a, rest)) (hpre : pre.length = d)
    (hon : ∀ x ∈ w, OnPos x.path pre) :
    WForm (keccak := keccak) pre b ∧ b.rank ≤ a.rank := by
  have child : ∀ (w' : List WL) (its : List ProofItem) (b' a' : Summary) (r' : List ProofItem) (c : Bool),
      d < 256 → w' = wpart c d w →
      walk keccak w' (d + 1) (pre ++ [c]) its = .ok (b', a', r') →
      WForm (keccak := keccak) (pre ++ [c]) b' ∧ b'.rank ≤ a'.rank := by
    intro w' its b' a' r' c hd' hw' hc
    exact walk_wform w' (d + 1) (pre ++ [c]) its b' a' r' hc (by simp [hpre]) (by
      intro x hx; rw [hw', mem_wpart] at hx
      exact onPos_snoc.2 ⟨hon x hx.1, by rw [hpre]; exact hx.2⟩)
  have fromSplit : ∀ (its : List ProofItem), d < 256 →
      splitWith keccak (fun its => walk keccak (wpart false d w) (d + 1) (pre ++ [false]) its)
        (fun its => walk keccak (wpart true d w) (d + 1) (pre ++ [true]) its) its = .ok (b, a, rest) →
      WForm (keccak := keccak) pre b ∧ b.rank ≤ a.rank := by
    intro its hd hs
    obtain ⟨lb, la, r1, rb, ra, hl, hr, rfl, rfl⟩ := splitWith_ok keccak hs
    have h1 := child _ _ _ _ _ false hd rfl hl
    have h2 := child _ _ _ _ _ true hd rfl hr
    exact ⟨combine_wform keccak h1.1 h2.1, combine_rank_mono keccak h1.2 h2.2⟩
  match w, hw with
  | [], hw =>
    rw [walk.eq_def] at hw; dsimp only at hw
    split at hw <;> (try split at hw) <;> simp only [Except.ok.injEq, Prod.mk.injEq, reduceCtorEq] at hw
    · obtain ⟨rfl, rfl, rfl⟩ := hw; exact ⟨Or.inl rfl, Nat.le_refl _⟩
    · obtain ⟨rfl, rfl, rfl⟩ := hw
      rename_i hp
      exact ⟨Or.inr (Or.inl ⟨_, rfl, hp⟩), Nat.le_refl _⟩
    · obtain ⟨rfl, rfl, rfl⟩ := hw; exact ⟨Or.inr (Or.inr ⟨_, rfl⟩), Nat.le_refl _⟩
  | [x], hw =>
    rw [walk.eq_def] at hw; dsimp only at hw
    split at hw
    · cases hw
    · split at hw
      · cases hw
      · simp only [Except.ok.injEq, Prod.mk.injEq] at hw
        obtain ⟨rfl, rfl, rfl⟩ := hw
        exact ⟨Or.inl rfl, Nat.zero_le _⟩
    · rename_i p v rest'
      split at hw
      · rename_i hpx
        subst hpx
        split at hw
        · cases hw
        · split at hw
          · cases hw
          · split at hw
            · cases hw
            · simp only [Except.ok.injEq, Prod.mk.injEq] at hw
              obtain ⟨rfl, rfl, rfl⟩ := hw
              exact ⟨Or.inr (Or.inl ⟨_, rfl, hon x (by simp)⟩), Nat.le_refl _⟩
      · split at hw
        · cases hw
        · rename_i hp
          split at hw
          · cases hw
          · split at hw
            · simp only [Except.ok.injEq, Prod.mk.injEq] at hw
              obtain ⟨rfl, rfl, rfl⟩ := hw
              exact ⟨Or.inr (Or.inl ⟨_, rfl, Classical.not_not.1 hp⟩), Nat.le_refl _⟩
            · simp only [Except.ok.injEq, Prod.mk.injEq] at hw
              obtain ⟨rfl, rfl, rfl⟩ := hw
              refine ⟨Or.inr (Or.inl ⟨_, rfl, Classical.not_not.1 hp⟩), ?_⟩
              rw [summarize_eq_sumT]
              unfold sortPair; split <;> simp [sumT, Summary.rank]
    · split at hw
      · rename_i hd; exact fromSplit _ hd hw
      · cases hw
    · cases hw
  | x :: y :: t, hw =>
    rw [walk.eq_def] at hw; dsimp only at hw
    split at hw
    · rename_i hd; exact fromSplit _ hd hw
    · cases hw
termination_by 256 - d

/-! ### Soundness of the descent -/

section Sound

variable {keccak}

/-- The descent's result at one position against the leaves there: exact
where a witnessed path lies; where none does, the after summary is the
before one, the set is unchanged, and the before summary is the set's own or
a `Node` item standing for it. -/
def Child (w : List WL) (b a tb ta : Summary) : Prop :=
  (w ≠ [] → b = tb ∧ a = ta) ∧ (w = [] → a = b ∧ ta = tb ∧ (b = tb ∨ ∃ h, b = .node h))

theorem updated_part {w : List WL} {Lb La : List Leaf} (h : Updated w Lb La) (c : Bool) (d : Nat) :
    Updated (wpart c d w) (part c d Lb) (part c d La) := by
  intro y
  rw [mem_part, h y, mem_part]
  constructor
  · rintro ⟨⟨x, hx, hp, ha⟩ | ⟨hy, hn⟩, hc⟩
    · exact Or.inl ⟨x, mem_wpart.2 ⟨hx, by rw [hp]; exact hc⟩, hp, ha⟩
    · exact Or.inr ⟨⟨hy, hc⟩, fun x hx hp => hn x (mem_wpart.1 hx).1 hp⟩
  · rintro (⟨x, hx, hp, ha⟩ | ⟨⟨hy, hc⟩, hn⟩)
    · have hx' := mem_wpart.1 hx
      exact ⟨Or.inl ⟨x, hx'.1, hp, ha⟩, by rw [← hp]; exact hx'.2⟩
    · exact ⟨Or.inr ⟨hy, fun x hx hp => hn x (mem_wpart.2 ⟨hx, by rw [hp]; exact hc⟩) hp⟩, hc⟩

theorem atPos_part {pre : List Bool} {d : Nat} {L : List Leaf} (h : AtPos pre L) (hpre : pre.length = d)
    (c : Bool) : AtPos (pre ++ [c]) (part c d L) := by
  intro y hy
  rw [mem_part] at hy
  exact onPos_snoc.2 ⟨h y hy.1, by rw [hpre]; exact hy.2⟩

theorem onPos_wpart {w : List WL} {pre : List Bool} {d : Nat} (h : ∀ x ∈ w, OnPos x.path pre)
    (hpre : pre.length = d) (c : Bool) : ∀ x ∈ wpart c d w, OnPos x.path (pre ++ [c]) := by
  intro x hx
  rw [mem_wpart] at hx
  exact onPos_snoc.2 ⟨h x hx.1, by rw [hpre]; exact hx.2⟩

/-- The parent from its two children (`split`, `state_tree.rs:224`). -/
theorem split_case (hcf : CollisionFree keccak) (hz : ZeroUnreached keccak)
    {w : List WL} {d : Nat} {pre : List Bool} {Lb La : List Leaf} {lb la rb ra : Summary}
    (hd : d < 256) (hpre : pre.length = d) (hne : w ≠ []) (hLb : AtPos pre Lb)
    (hlf : WForm (keccak := keccak) (pre ++ [false]) lb) (hrf : WForm (keccak := keccak) (pre ++ [true]) rb)
    (hlr : lb.rank ≤ la.rank) (hrr : rb.rank ≤ ra.rank)
    (hb : (combine keccak lb rb).hash = (sumT keccak Lb d).hash)
    (IHl : lb.hash = (sumT keccak (part false d Lb) (d + 1)).hash →
      Child (wpart false d w) lb la (sumT keccak (part false d Lb) (d + 1)) (sumT keccak (part false d La) (d + 1)))
    (IHr : rb.hash = (sumT keccak (part true d Lb) (d + 1)).hash →
      Child (wpart true d w) rb ra (sumT keccak (part true d Lb) (d + 1)) (sumT keccak (part true d La) (d + 1))) :
    combine keccak lb rb = sumT keccak Lb d ∧ combine keccak la ra = sumT keccak La d := by
  rw [sumT_unfold keccak Lb hd] at hb ⊢
  rw [sumT_unfold keccak La hd]
  have hdisj : ∀ p, OnPos p (pre ++ [false]) → OnPos p (pre ++ [true]) → False := by
    intro p h0 h1
    have e0 := (onPos_snoc.1 h0).2
    rw [(onPos_snoc.1 h1).2] at e0
    exact absurd e0 (by decide)
  have hlt := sumT_tform (keccak := keccak) (d + 1) (atPos_part hLb hpre false)
  have hrt := sumT_tform (keccak := keccak) (d + 1) (atPos_part hLb hpre true)
  obtain ⟨hh0, hh1⟩ := split_hashes hcf hz hdisj hlf hrf hlt hrt hb
  obtain ⟨Al, Bl⟩ := IHl hh0
  obtain ⟨Ar, Br⟩ := IHr hh1
  by_cases h0 : wpart false d w = []
  · by_cases h1 : wpart true d w = []
    · exfalso
      obtain ⟨x, xs, hxs⟩ := List.exists_cons_of_ne_nil hne
      have hx : x ∈ w := by rw [hxs]; simp
      cases hc : bit x.path d
      · have : x ∈ wpart false d w := mem_wpart.2 ⟨hx, hc⟩
        rw [h0] at this; simp at this
      · have : x ∈ wpart true d w := mem_wpart.2 ⟨hx, hc⟩
        rw [h1] at this; simp at this
    · obtain ⟨rfl, hta, hm⟩ := Bl h0
      obtain ⟨rfl, rfl⟩ := Ar h1
      rw [hta]
      exact masq_left hcf hz hm hh0 hlt hrt hrr hb
  · obtain ⟨rfl, rfl⟩ := Al h0
    by_cases h1 : wpart true d w = []
    · obtain ⟨rfl, hta, hm⟩ := Br h1
      rw [hta]
      exact masq_right hcf hz hm hh1 hlt hrt hlr hb
    · obtain ⟨rfl, rfl⟩ := Ar h1
      exact ⟨rfl, rfl⟩

theorem updated_nil {Lb La : List Leaf} (h : Updated [] Lb La) : ∀ y, y ∈ La ↔ y ∈ Lb := by
  intro y; rw [h y]; simp

theorem nodup_single (q : Leaf) : [q].Nodup := by simp

theorem nodup_pair {q q' : Leaf} (h : q ≠ q') : [q, q'].Nodup := by
  simp [List.nodup_cons, h]

theorem mem_sortPair {q q' y : Leaf} : y ∈ sortPair q q' ↔ y = q ∨ y = q' := by
  unfold sortPair; split <;> simp [or_comm]

theorem nodup_sortPair {q q' : Leaf} (h : q ≠ q') : (sortPair q q').Nodup := by
  unfold sortPair; split
  · exact nodup_pair (Ne.symm h)
  · exact nodup_pair h

/-- THE DESCENT LEMMA. If the descent at a position accepts, and the
before summary it computes hashes to the before set's, then it computed
that set's summary before and the updated set's after (up to a `Node` item
standing for an unwitnessed subtree). -/
theorem walk_sound (hcf : CollisionFree keccak) (hz : ZeroUnreached keccak)
    (w : List WL) (d : Nat) (pre : List Bool) (items : List ProofItem)
    (b a : Summary) (rest : List ProofItem) (Lb La : List Leaf)
    (hw : walk keccak w d pre items = .ok (b, a, rest)) (hpre : pre.length = d)
    (hon : ∀ x ∈ w, OnPos x.path pre) (hLbn : Lb.Nodup) (hLan : La.Nodup) (hLb : AtPos pre Lb)
    (hupd : Updated w Lb La) (hb : b.hash = (sumT keccak Lb d).hash) :
    Child w b a (sumT keccak Lb d) (sumT keccak La d) := by
  have fromSplit : ∀ its, d < 256 → w ≠ [] →
      splitWith keccak (fun its => walk keccak (wpart false d w) (d + 1) (pre ++ [false]) its)
        (fun its => walk keccak (wpart true d w) (d + 1) (pre ++ [true]) its) its = .ok (b, a, rest) →
      Child w b a (sumT keccak Lb d) (sumT keccak La d) := by
    intro its hd hne hs
    obtain ⟨lb, la, r1, rb, ra, hl, hr, rfl, rfl⟩ := splitWith_ok keccak hs
    have hpre' : ∀ c : Bool, (pre ++ [c]).length = d + 1 := by intro c; simp [hpre]
    have hl' := walk_wform keccak _ _ _ _ _ _ _ hl (hpre' false) (onPos_wpart hon hpre false)
    have hr' := walk_wform keccak _ _ _ _ _ _ _ hr (hpre' true) (onPos_wpart hon hpre true)
    have := split_case hcf hz hd hpre hne hLb hl'.1 hr'.1 hl'.2 hr'.2 hb
      (fun h => walk_sound hcf hz _ (d + 1) _ _ _ _ _ _ _ hl (hpre' false) (onPos_wpart hon hpre false)
        (nodup_part hLbn _ _) (nodup_part hLan _ _) (atPos_part hLb hpre false) (updated_part hupd false d) h)
      (fun h => walk_sound hcf hz _ (d + 1) _ _ _ _ _ _ _ hr (hpre' true) (onPos_wpart hon hpre true)
        (nodup_part hLbn _ _) (nodup_part hLan _ _) (atPos_part hLb hpre true) (updated_part hupd true d) h)
    exact ⟨fun _ => this, fun h => absurd h hne⟩
  match w, hw, hon, hupd, fromSplit with
  | [], hw, _, hupd, _ =>
    have hta : sumT keccak La d = sumT keccak Lb d := sumT_ext keccak d hLan hLbn (updated_nil hupd)
    rw [walk.eq_def] at hw; dsimp only at hw
    split at hw
    · cases hw
    · simp only [Except.ok.injEq, Prod.mk.injEq] at hw
      obtain ⟨rfl, rfl, rfl⟩ := hw
      have hLe : Lb = [] := sumT_hash_zero hz (by simpa [Summary.hash] using hb.symm)
      subst hLe
      exact ⟨fun h => absurd rfl h, fun _ => ⟨rfl, hta, Or.inl rfl⟩⟩
    · split at hw
      · simp only [Except.ok.injEq, Prod.mk.injEq] at hw
        obtain ⟨rfl, rfl, rfl⟩ := hw
        have hLe := sumT_hash_leaf hcf hz (by simpa [Summary.hash] using hb.symm)
        subst hLe
        exact ⟨fun h => absurd rfl h, fun _ => ⟨rfl, hta, Or.inl rfl⟩⟩
      · cases hw
    · simp only [Except.ok.injEq, Prod.mk.injEq] at hw
      obtain ⟨rfl, rfl, rfl⟩ := hw
      exact ⟨fun h => absurd rfl h, fun _ => ⟨rfl, hta, Or.inr ⟨_, rfl⟩⟩⟩
    · cases hw
  | [x], hw, hon, hupd, fromSplit =>
    have hupd1 : ∀ y : Leaf, y ∈ La ↔
        ((x.path = y.1 ∧ x.after = some y.2) ∨ (y ∈ Lb ∧ (x.path = y.1 → x.after = none))) := by
      intro y; rw [hupd y]; simp
    have hne : [x] ≠ [] := by simp
    rw [walk.eq_def] at hw; dsimp only at hw
    split at hw
    · cases hw
    · -- an Empty item: the witnessed path is absent before
      split at hw
      · cases hw
      · simp only [Except.ok.injEq, Prod.mk.injEq] at hw
        obtain ⟨rfl, rfl, rfl⟩ := hw
        have hLe : Lb = [] := sumT_hash_zero hz (by simpa [Summary.hash] using hb.symm)
        subst hLe
        refine ⟨fun _ => ⟨rfl, ?_⟩, fun h => absurd h hne⟩
        cases hxa : x.after with
        | none =>
          have hm : ∀ y, y ∈ La ↔ y ∈ ([] : List Leaf) := by
            intro y; rw [hupd1 y]; simp [hxa]
          rw [sumT_ext keccak d hLan (by simp) hm]; rfl
        | some v =>
          have hm : ∀ y, y ∈ La ↔ y ∈ [(x.path, v)] := by
            intro ⟨y1, y2⟩; rw [hupd1]; simp only [hxa, Option.some.injEq, List.mem_cons,
              Prod.mk.injEq, List.not_mem_nil, false_and, or_false]
            constructor
            · rintro ⟨h1, h2⟩; exact ⟨h1.symm, h2.symm⟩
            · rintro ⟨h1, h2⟩; exact ⟨h1.symm, h2.symm⟩
          rw [sumT_ext keccak d hLan (nodup_single _) hm]; rfl
    · rename_i p v rest' hwold
      split at hw
      · -- the item is the witnessed leaf itself
        rename_i hpx
        subst hpx
        split at hw
        · cases hw
        · rename_i bv _
          split at hw
          · cases hw
          · rename_i hbvv
            have hbv : bv = v := Classical.not_not.1 hbvv
            subst hbv
            split at hw
            · cases hw
            · rename_i av hav
              simp only [Except.ok.injEq, Prod.mk.injEq] at hw
              obtain ⟨rfl, rfl, rfl⟩ := hw
              have hLe := sumT_hash_leaf hcf hz (by simpa [Summary.hash] using hb.symm)
              subst hLe
              refine ⟨fun _ => ⟨rfl, ?_⟩, fun h => absurd h hne⟩
              have hm : ∀ y, y ∈ La ↔ y ∈ [(x.path, av)] := by
                intro ⟨y1, y2⟩; rw [hupd1]
                simp only [hav, Option.some.injEq, List.mem_cons, Prod.mk.injEq, List.not_mem_nil,
                  or_false, reduceCtorEq, imp_false]
                constructor
                · rintro (⟨h1, h2⟩ | ⟨⟨h1, _⟩, h3⟩)
                  · exact ⟨h1.symm, h2.symm⟩
                  · exact absurd h1.symm h3
                · rintro ⟨h1, h2⟩; exact Or.inl ⟨h1.symm, h2.symm⟩
              rw [sumT_ext keccak d hLan (nodup_single _) hm]; rfl
      · -- another leaf holds the position: the witnessed one is absent before
        rename_i hpx
        split at hw
        · cases hw
        · split at hw
          · cases hw
          · split at hw
            · rename_i hav
              simp only [Except.ok.injEq, Prod.mk.injEq] at hw
              obtain ⟨rfl, rfl, rfl⟩ := hw
              have hLe := sumT_hash_leaf hcf hz (by simpa [Summary.hash] using hb.symm)
              subst hLe
              refine ⟨fun _ => ⟨rfl, ?_⟩, fun h => absurd h hne⟩
              have hm : ∀ y, y ∈ La ↔ y ∈ [(p, v)] := by
                intro ⟨y1, y2⟩; rw [hupd1]
                simp only [hav, List.mem_cons, Prod.mk.injEq, List.not_mem_nil, or_false,
                  reduceCtorEq, and_false, false_or]
                constructor
                · rintro ⟨h, _⟩; exact h
                · rintro ⟨h1, h2⟩; exact ⟨⟨h1, h2⟩, fun _ => trivial⟩
              rw [sumT_ext keccak d hLan (nodup_single _) hm]; rfl
            · rename_i av hav
              simp only [Except.ok.injEq, Prod.mk.injEq] at hw
              obtain ⟨rfl, rfl, rfl⟩ := hw
              have hLe := sumT_hash_leaf hcf hz (by simpa [Summary.hash] using hb.symm)
              subst hLe
              refine ⟨fun _ => ⟨rfl, ?_⟩, fun h => absurd h hne⟩
              have hqne : (p, v) ≠ (x.path, av) := by
                intro h; exact hpx (Prod.mk.inj h).1
              have hm : ∀ y, y ∈ La ↔ y ∈ sortPair (p, v) (x.path, av) := by
                intro ⟨y1, y2⟩; rw [hupd1, mem_sortPair]
                simp only [hav, Option.some.injEq, List.mem_cons, Prod.mk.injEq, List.not_mem_nil,
                  or_false, reduceCtorEq, imp_false]
                constructor
                · rintro (⟨h1, h2⟩ | ⟨⟨h1, h2⟩, _⟩)
                  · exact Or.inr ⟨h1.symm, h2.symm⟩
                  · exact Or.inl ⟨h1, h2⟩
                · rintro (⟨h1, h2⟩ | ⟨h1, h2⟩)
                  · exact Or.inr ⟨⟨h1, h2⟩, fun h => hpx (h.trans h1).symm⟩
                  · exact Or.inl ⟨h1.symm, h2.symm⟩
              rw [summarize_eq_sumT, sumT_ext keccak d hLan (nodup_sortPair hqne) hm]
    · split at hw
      · rename_i hd; exact fromSplit _ hd hne hw
      · cases hw
    · cases hw
  | x :: y :: t, hw, _, _, fromSplit =>
    rw [walk.eq_def] at hw; dsimp only at hw
    split at hw
    · rename_i hd; exact fromSplit _ hd (by simp) hw
    · cases hw
termination_by 256 - d

/-- LEMMA 2, THE STATE TREE UPDATE. If `verify_and_update` accepts a
witness for `prev`, and `prev` is the root of the state `S`, then the new
root it returns is the root of `S'`, the state `S` updated by the batch's
writes. -/
theorem state_tree_update (hcf : CollisionFree keccak) (hz : ZeroUnreached keccak)
    (S S' : List Leaf) (hS : S.Nodup) (hS' : S'.Nodup)
    (w : List WL) (proof : List ProofItem) (prev new : Word)
    (hprev : prev = root keccak S) (hupd : Updated w S S')
    (hacc : verifyAndUpdate keccak prev w proof = .ok new) :
    new = root keccak S' := by
  unfold verifyAndUpdate at hacc
  split at hacc
  · cases hacc
  · rename_i before after hroots
    split at hacc
    · cases hacc
    · rename_i hbp
      have hbp' : before = prev := Classical.not_not.1 hbp
      simp only [Except.ok.injEq] at hacc
      subst hacc
      unfold roots at hroots
      split at hroots
      · cases hroots
      · split at hroots
        · cases hroots
        · split at hroots
          · cases hroots
          · rename_i b a rest hw
            split at hroots
            · simp only [Except.ok.injEq, Prod.mk.injEq] at hroots
              obtain ⟨rfl, rfl⟩ := hroots
              have hb : b.hash = (sumT keccak S 0).hash := by
                rw [hbp', hprev, root, summarize_eq_sumT]
              have hc := walk_sound hcf hz w 0 [] proof b a rest S S' hw rfl
                (fun x _ => onPos_nil _) hS hS' (fun y _ => onPos_nil _) hupd hb
              rw [root, summarize_eq_sumT]
              by_cases hne : w = []
              · obtain ⟨rfl, hta, _⟩ := hc.2 hne
                rw [hta]; exact hb
              · rw [(hc.1 hne).2]
            · cases hroots

/-- The same, as a statement about the real keccak256: the new root is the
updated state's, or keccak has a collision, or some input hashes to zero. -/
theorem state_tree_update_or_collision (S S' : List Leaf) (hS : S.Nodup) (hS' : S'.Nodup)
    (w : List WL) (proof : List ProofItem) (prev new : Word)
    (hprev : prev = root keccak S) (hupd : Updated w S S')
    (hacc : verifyAndUpdate keccak prev w proof = .ok new) :
    new = root keccak S' ∨ (∃ x y, x ≠ y ∧ keccak x = keccak y) ∨ ∃ x, keccak x = Word.zero := by
  rcases collisionFree_or_collision keccak with hcf | hcol
  · apply Classical.byCases (p := ∃ x, keccak x = Word.zero)
    · intro h; exact Or.inr (Or.inr h)
    · intro h
      exact Or.inl (state_tree_update hcf (fun x hx => h ⟨x, hx⟩) S S' hS hS' w proof prev new
        hprev hupd hacc)
  · exact Or.inr (Or.inl hcol)

end Sound

end StateTree

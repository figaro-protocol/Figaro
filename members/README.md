# Reference member profiles — the genesis identities

Each file here is a `MemberProfileMetadata` document — committed seed data for
the wallets the maintainer registers at genesis, `clauses/`' and `assemblies/`'
sibling (clauses are the vocabulary, assemblies the worked sentences, these the
speakers of record). `populate-members.mjs` validates each with the strict SDK
parser (`parseMemberProfileDocument`), pins it with its OWNER's key, and
registers it from its owner's wallet — every member from its own balance
(RELEASE_READINESS Task 13), the profile CID bound first-write-wins on
`MembersRegistry`.

- `founder.json` — the founder as a BUYER-side member (ruled 2026-08-18: a
  profile holds both postures; every buyer is a seller of its data): buyer
  assembly subscriptions (`buyerAssemblies`, keyed by content-derived
  compositionHash — stable across redeploys) and buyer-posture
  `disclosurePolicy` entries. The seller side lands later on the same profile.
- `dao.json` — the DAO's identity, registered under its EIP-7702 OPERATOR EOA,
  never the vault address (`DAO.md` § "Who holds the treasury").

A registered profile evolves by `updateProfile` — the member's own runtime act,
not seeding; these files are the genesis content, not a mirror of live state.

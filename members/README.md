# Reference member profiles — the genesis identities

Each file here is a `MemberProfileMetadata` document — committed seed data for
the wallets the maintainer registers at genesis, `clauses/`' and `assemblies/`'
sibling (clauses are the vocabulary, assemblies the worked sentences, these the
speakers of record). `populate-members.mjs` validates each with the strict SDK
parser (`parseMemberProfileDocument`), pins it through the pin service or the
IPFS node its environment names, and registers it from its owner's wallet —
every member from its own balance (RELEASE_READINESS Task 13). The owner of
each file is the wallet `deployments/<chainId>.expected.json` names for it
(`registrations.members`); `scripts/seed/seed.sh member <file>` runs the
registration with that wallet's signer and refuses a signer whose address is
not the plan's.

- `founder.json` — the founder as a BUYER-side member: buyer
  assembly subscriptions (`buyerAssemblies`, keyed by content-derived
  processDesignHash — the assembly root over the assembly's agreements,
  stable across redeploys; the profile names no agreement hash). The seller side
  lands later on the same profile.
- `dao.json` — the DAO's identity. Its owner is the DAO's OPERATOR EOA
  (`daoOperator` in the plan): the EOA registers it in a transaction signed
  with its own key (`DAO_OPERATOR_KEY`), staking from its own balance. The
  vault address never registers it (`docs/DAO.md` § "Who holds the treasury").
- `deployer.json` — the deployer's wallet as the test seller of the Sepolia batch
  rehearsal: a member so its usage claim credits; it sells nothing outside that rehearsal.

A registered profile evolves by `updateProfile` — the member's own runtime act,
not seeding; these files are the genesis content, not a mirror of live state.

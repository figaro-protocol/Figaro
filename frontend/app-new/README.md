# app-new — the parallel frontend

The new site is written here, beside `app/`, and is NOT routed: Next.js serves only
`app/`. Nothing in `app/` is edited or deleted while this tree is being written. When
the maintainer has read the new tree and said so, this directory replaces `app/` and is
renamed; until then it is reviewed, not served.

Three readers, three sections, one home:

- Home — three doors: Use it → Discover; Build on it → the builders' first page;
  Check the proofs → Working Groups.
- Participate — for laymen (members, users): your word is your bond; when something goes wrong; your
  agent; your data; your community's token; become a member; FAQ about use only.
- Build — for builders: what it displaces and how — institutions, the process, the network,
  agents that design, the data layer, the token, what changes — then the docs.
- Research — for academics: Working Groups, the papers, what changes.

Guards keyed on `app/(marketing)` paths do not see this tree until the rename; run them
by hand against `app-new/` before review.

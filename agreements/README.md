# The reference agreements — written by hand, registered at deploy

Each file here is one agreement a designer would register and any
assembly can bind: the clauses selected for one agreement, written by clause
name (`name@version` where two specs share a name) with the designer's own
fills (`block.design.fills` values only — a clause's other fields are the
buyer's at checkout), beside the designer's words (`name`, `summary`). A file
lists every clause its agreement carries, and nothing is added to it: each
file here names `figaro-commerce`, because each of these agreements commits
its line items, and an agreement that commits none would leave it out. No file
names a topology: who follows whom is each assembly
entry's `follows`, and each signed agreement carries it as the format's
topology leaf, never as a clause.

The populate path composes each file at deploy (`composeAuthoredAgreement` in
the SDK: names resolved to keys, the key derived
as the merkle root over the composed clauses), pins the document and registers
it once on `AgreementRegistry` under its key (one stake; a key the registry
already binds is skipped). A reference assembly (`assemblies/*.json`) names the
agreements its agreements bind by file name; two assemblies naming one file
bind one registration. Nothing here is read at runtime: a reader hydrates an
assembly from the registry's bindings and verifies each document against its
key.

Editorial prose here is audience-owned (the general-public register).
The written shape is published as a JSON Schema beside the clause's,
`sdk/src/agreement.schema.json`, which also describes the registered form the
seeding pins; `sdk/tests/documents/schema-conformance.test.ts` keeps that `.schema.json`
and `composeAuthoredAgreement` in lockstep over these files.
Conformance: `frontend/tests/lib/referenceAssemblies.test.ts`.

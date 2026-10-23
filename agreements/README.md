# The reference agreements — written by hand, registered at deploy

Each file here is one agreement a designer would register and any
assembly can bind: the clauses selected for one agreement, written by clause
name (`name@version` where two specs share a name) with the designer's own
fills (`block.design.fills` values only — a clause's other fields are the
buyer's at checkout), beside the designer's words (`name`, `summary`), and the agreement it picks in
the mandatory article (`mandatory`, a file name here): the pick's clauses merge
in, so a file lists what the designer selects. `mandatory-clauses.json` is that
pick: the mandatory clauses alone, the registration the designer drawer's
mandatory article lists, registered beside the clauses at deploy; it names no
pick of its own.

The populate path composes each file at deploy (`composeAuthoredAgreement` in
the SDK: names resolved to keys, the pick's clauses merged, the key derived
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

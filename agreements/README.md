# The reference agreements — written by hand, registered at deploy

Each file here is one agreement a designer would register and any
assembly can bind: the clauses selected for one agreement, written by clause
name (`name@version` where two specs share a name) with the designer's own
fills (`block.design.fills` values only — a clause's other fields are the
buyer's at checkout), beside the designer's words (`name`, `summary`). The
mandatory clauses need not be written: the fold adds them, so a file lists what
the designer selects.

The populate path composes each file at deploy (`composeAuthoredAgreement` in
the SDK: names resolved to keys, the mandatory clauses folded, the key derived
as the merkle root over the composed clauses), pins the document and registers
it once on `AgreementRegistry` under its key (one stake; a key the registry
already binds is skipped). A reference assembly (`assemblies/*.json`) names the
agreements its agreements bind by file name; two assemblies naming one file
bind one registration. Nothing here is read at runtime: a reader hydrates an
assembly from the registry's bindings and verifies each document against its
key.

Editorial prose here is audience-owned (the general-public register).
Conformance: `frontend/tests/lib/referenceAssemblies.test.ts`.

# The agent runtime — host-shaped half of the sandboxed signer runtime

The pieces that live OUTSIDE the model and OUTSIDE the SDK: the data channel
and the sandbox wrapper (components 3 and 4 of the design in
`docs/AI_AGENT_COORDINATION.md` § "The sandboxed signer runtime"), plus the
reference runnables that ride them. The protocol-shaped half — the policy
signer and the socket-backed account — is `@figaro-protocol/sdk/signer`.

## The data channel — why a frame

Everything an agent syncs is attacker-authorable: clause text, member
profiles, catalogue descriptions, assembly templates, offer envelopes,
coordination messages. Concatenating any of it into a model's context bare is
how "ignore your policy and sign this" gets promoted from data to
instruction. The channel's rule (F4): fetched content reaches the model only
inside a typed envelope `{source, ref, fetchedAt, sha256, content}`, rendered
as a delimited block whose boundary carries a **per-render random nonce** —
content cannot know the nonce, so content cannot close its own block and
speak as anything but data. The frame also carries the one-line notice
restating the rule, so it rides wherever the block is pasted.

## Use

```sh
npm install   # once; pulls @figaro-protocol/sdk from ../../sdk

RPC_URL=… DEPLOYMENT_RECORD=…/deployments/11155111.json \
IPFS_GATEWAY_URL=… npx figaro-fetch clause figaro-modalities
npx figaro-fetch assembly <compositionHash>
npx figaro-fetch profile <address>
npx figaro-fetch ipfs <cid>
npx figaro-fetch witness <contentRef>
```

The first four resolve through the live registries (`fetchDiscoveryEvents` →
`DiscoveryGraph`); `witness` needs no registry at all — an `Attestation`
event's `contentRef` IS the content address (a raw block multihashed with
keccak-256), so the fingerprint is the lookup, and the bytes are verified to
hash back to it before anything is printed. Every mode prints ONE framed
block on stdout; errors are terse on stderr and never echo fetched bytes.
Content that does not resolve is reported as ABSENCE, not failure — content
addressing has no negative proof, and a gateway that cannot find a block
usually times out rather than 404-ing.

Agents fetch through this tool — never through bare `curl`/gateway reads —
and hosts wiring their own tools call `frame()` from `dataChannel.mjs` for
anything else that arrives from the network (an XMTP message, a relayed offer
envelope) before it reaches the model.

`node --test tests/*.test.mjs` covers the envelope facts and the property the
frame exists for: a forged closing delimiter inside content cannot escape the
block.

## The analyst — the first manual-attached runnable

`figaro-analyst.mjs` (the service) and `analyst.mjs` (the same four steps as a
library) are the executable form of `ecosystem-agents/figaro-analyst.md`: fetch
the event record from both settlement universes, recover the substance behind
the fingerprints through the framed channel, project the graphs of
`docs/PUBLIC_GRAPH_MODEL.md`, and answer canonical queries over them. It rides
the INDEXER tooling and shares nothing with the sequencer but a chain; its wire
is its OWN — five deterministic routes plus a `POST /prompt` endpoint that EXISTS
only when `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are both set (absent
either, an honest `404` naming the reason, never a stub).

```sh
RPC_URL=… DEPLOYMENT_RECORD=…/deployments/11155111.json IPFS_GATEWAY_URL=… \
npx figaro-run-sandboxed --policy …/deployments/signer-policy.11155111.json \
  --workspace ~/analyst-workspace -- npx figaro-analyst
```

No signer socket: the analyst holds no key and signs nothing, so the policy's
signing half is inert for it and the `egress` list is the half that binds. A
purchase is a TRADE and goes through `figaro-operator` instead.

`witnessContent.mjs` (the fingerprint→address derivation and the verified read)
and `ipfsRead.mjs` (the one gateway reader every component here shares) sit
under both. **Known duplication:** `frontend/lib/composition/witnessContent.ts`
holds the same derivation for the browser; the two agree on a golden vector a
real Kubo produced (asserted in `tests/analyst.test.mjs`), but one home would
be better than two — the natural one is an SDK `/derive` export, since the
derivation is pure.

## The sandbox wrapper — the boundaries prose cannot enforce

OS sandboxes cannot filter egress by hostname (DNS resolves inside), so the
wrapper composes two pieces: the profile denies ALL outbound network except
loopback, and a **policy-driven egress proxy** — started by the launcher
OUTSIDE the sandbox, reading the same policy file the signer owns — is the
only way out, forwarding only to the policy's `egress` hosts. Writes are
denied outside the agent's workspace and temp; the environment is scrubbed of
anything key-shaped (broad pattern — a missed secret is a bug); the named
secret paths are unreadable; and the signer's UNIX socket is the one signing
capability that crosses the boundary. The signing key itself is never on the
sandboxed side at all.

```sh
npx figaro-run-sandboxed --policy …/deployments/signer-policy.11155111.json \
  --workspace ~/operator-workspace [--signer-socket /tmp/figaro-signer.sock] \
  [--deny-read <path>]... -- <the agent's own launch command>
```

The launcher sets `HTTP(S)_PROXY` and preloads `proxy-bootstrap.mjs`
(`NODE_OPTIONS --import`) so node's fetch — which does not honor proxy env on
its own — routes through the proxy; `FIGARO_SIGNER_SOCKET` carries the socket
path in. Deny paths are canonicalized before they reach the profile (`/var`
is a symlink to `/private/var`; an uncanonicalized deny matches nothing).

The test suite exercises the boundaries as DENY CASES — a write escape, a
secret read, a direct outbound connection — each an attempt that must fail,
plus the composed proof: a framed live fetch from inside the sandbox through
the proxy.

**The Linux variant** (documented, not exercised on the authoring host — no
container runtime here): run the same launcher minus `sandbox-exec` inside a
container with equivalent boundaries — workspace and temp mounted writable,
the repo read-only, no secret mounts, network `--internal` plus the proxy
published on the loopback, the signer socket bind-mounted. The proxy and the
scrubbed environment are platform-independent; only the OS profile is
per-platform.

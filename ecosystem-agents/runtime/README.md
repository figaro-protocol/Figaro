# The agent runtime — host-shaped half of the sandboxed signer runtime

The pieces that live OUTSIDE the model and OUTSIDE the SDK: the data channel
and the sandbox wrapper (components 3 and 4 of the design in
`docs/AI_AGENT_COORDINATION.md` § "The sandboxed signer runtime"), plus the
reference runnables that ride them. The protocol-shaped half — the policy
signer and the socket-backed account — is `@figaro-protocol/sdk/signer`.

## The data channel — why a frame

Everything an agent syncs is attacker-authorable: clause text, member
profiles, catalog descriptions, assembly templates, offer envelopes,
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
hash back to it before anything is printed. `clause` and `assembly` verify the
same way, against the registry's anchor: a spec must hash
(`canonicalContentHash`) to `ClauseRegistry`'s content hash and a template
(`templateCompositionHash`) to its composition hash, so a gateway that serves
other bytes is read as absence, never as the registry's content. `profile` and
`ipfs` print what the gateway served, framed as untrusted, and check nothing:
their CID is the address, but a CID over a UnixFS file (what a pinning service
returns for an uploaded file) checks against the bytes only through the file's
DAG, and this runtime does not decode one. Every mode prints ONE framed
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
the events from both resolution universes, recover the substance behind
the fingerprints through the framed channel, project the graphs of
`docs/DATA_LAYER.md`, and answer canonical queries over them. It rides
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
signing half is inert for it and the `egress` list is the half that binds.
`RPC_URL` (and each `FIGARO_ANALYST_CROSSCHECK_RPC_URLS` entry) may be a keyed
provider URL: the launcher hands it to the egress proxy and the analyst reads
the proxy's relay in its place, so the key never enters the sandbox; its
origin must be on the policy's `egress` list. A
purchase is a TRADE and goes through `figaro-operator` instead. Launched this
way the analyst has no `POST /prompt`: the wrapper's scrub holds back
`ANTHROPIC_API_KEY` with every other key-shaped variable, and `GET /status`
names the reason. The model loop exists only on an analyst its host runs
outside the wrapper with both variables set.

`POST /prompt` and `GET /queries/market-shape` (attributed from the agreement
bodies the wallet holds or bought) answer only `Authorization: Bearer <token>`.
The analyst draws a fresh token at every start and writes it to
`FIGARO_ANALYST_BEARER_FILE` (default `analyst.token` in its working directory —
the workspace, under the wrapper), mode `0600`, naming the file on stderr and
never printing the token. CORS reads are granted only to the origins in
`FIGARO_ANALYST_CORS_ORIGINS` — none by default, never `*` — and
`FIGARO_ANALYST_MAX_PROMPTS` (default 1) caps the model loops in flight, `429`
past it.

`witnessContent.mjs` (the verified read behind an attestation's fingerprint),
`anchoredContent.mjs` (the verified reads of a clause spec and an assembly
template — the analyst decodes and prices with nothing else; both verify
through the SDK's `anchor*` functions, the ones the frontend uses) and `ipfsRead.mjs` (the one gateway reader every component here shares) sit
under both. The fingerprint→address derivation itself is `witnessContentCid`
(`@figaro-protocol/sdk/derive` — pure, no I/O); this runtime and
`frontend/lib/composition/witnessContent.ts` both consume that one export,
each supplying its own I/O, and the derivation is asserted against a golden
vector a real Kubo produced (`tests/analyst.test.mjs`).

## The sandbox wrapper — the boundaries prose cannot enforce

OS sandboxes cannot filter egress by hostname (DNS resolves inside), so the
wrapper composes two pieces: the profile denies ALL outbound network except
the proxy's own loopback port — every other loopback service (a local IPFS
API, a devnet node, another proxy) is as closed as the internet — and a
**policy-driven egress proxy**, started by the launcher OUTSIDE the sandbox and
reading the same policy file the signer owns, is the only way out. It forwards
only to the policy's `egress` origins, matched by host and port (an origin
without a port takes its scheme's default; a bare host is TLS on 443): a
CONNECT tunnel needs an origin on that host and port, and plain-HTTP
forwarding needs an `http:` origin, so a host listed as `https:` is never
reached in the clear. An absolute URI in any other scheme is refused with a
`400`, never forwarded.

Writes are denied outside the agent's workspace and temp, and denied in the
signer's own directory wherever it sits — the spend journal and the audit log
live there beside the socket, and an agent that could write the journal would
set its own ceiling. The environment is scrubbed of anything key-shaped, by
name (`KEY`, `SECRET`, `TOKEN`, `JWT`, `PASS`, `MNEMONIC`, `PRIVATE`, `AUTH`,
`CREDENTIAL`, `COOKIE`, `SESSION`, `SEED`) and by value: any URL in the value
with userinfo, a query parameter whose name matches that pattern, or a path
segment shaped like a key (20 or more of `[A-Za-z0-9_-]`, holding a letter and
a digit — `…/v2/<key>`). The launcher names what it held back on stderr, names
only; a missed secret is a bug, so the rule is deliberately broad. The RPC
endpoints are the exception that still runs: `RPC_URL` and every
`FIGARO_ANALYST_CROSSCHECK_RPC_URLS` entry are taken out of the environment
before the scrub and handed to the egress proxy, which relays JSON-RPC POSTs on
`http://127.0.0.1:<proxy port>/rpc/<n>` to the n-th endpoint; the agent
receives those relay addresses under the same names. A provider key in the
URL's path stays outside, and the launcher refuses an endpoint whose origin
the policy's `egress` list does not name. The secret
paths are unreadable BY DEFAULT: keystores (`~/.foundry/keystores`, the geth
keystore directories, and any `*keystore*.json` under the home directory),
credentials (`~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.config/gh`, `~/.npmrc`, and
the rest of `sandboxProfile.mjs` § `DEFAULT_DENY_READ`) and shell histories.
`--keystore <path>` names the signer's keystore wherever it sits;
`--deny-read <path>` adds any path, each with its own rule; `--allow-read
<path>` opens one default and refuses a path that is not on the list. The
signer's UNIX socket is the one signing capability that crosses the boundary.
The signing key itself is never on the sandboxed side at all.

```sh
npx figaro-run-sandboxed --policy …/deployments/signer-policy.11155111.json \
  --workspace ~/operator-workspace [--signer-socket ~/.figaro-signer/signer.sock] \
  [--keystore <keystore>] [--deny-read <path>]... [--allow-read <path>]... \
  -- <the agent's own launch command>
```

The launcher sets `HTTP(S)_PROXY`, empties `NO_PROXY`, and preloads `proxy-bootstrap.mjs`
(`NODE_OPTIONS --import`) so node's fetch — which does not honor proxy env on
its own — routes through the proxy; `FIGARO_SIGNER_SOCKET` carries the socket
path in. The socket's directory is the signer's own (`~/.figaro-signer` by
default), and the profile denies every write in it. That rule covers the
directory and what is under it, not its parents, and matches real paths, so
the launcher refuses a directory that is inside, or contains, the workspace or
a temp directory (a parent the agent could rename), and one that does not
exist yet (start the signer first). A signer started with `--dir <dir>` is
matched here with `--signer-socket <dir>/signer.sock`. The agent may signal
its own processes and no other: the signer daemon cannot be killed from
inside. Deny paths are canonicalized before they reach the profile (`/var`
is a symlink to `/private/var`; an uncanonicalized deny matches nothing).

The test suite exercises the boundaries as DENY CASES — a write escape, a
secret read, the default secret paths read through the launcher without being
named, three `--deny-read` paths in one parent each read, a direct outbound
connection, a loopback port other than the proxy's, an egress origin on the
wrong port or scheme, key-shaped names and URL-embedded credentials in the
environment, a keyed RPC endpoint that stays outside while the analyst starts
and syncs through the proxy's relay, nine ways of changing the
signer's journal, audit log or socket (append, truncate, delete, replace,
rewrite the audit log, delete the socket, move the directory, a hard link, a
symlink), a signer directory the launcher must refuse, and a signal to an
outside process — each an attempt that must fail,
plus the composed proof: a framed live fetch from inside the sandbox through
the proxy.

**The Linux variant** (exercised in CI on demand — `on-demand-docker.yml` Job 2
runs the write, secret, egress and socket cases on ubuntu runners; the
signer-directory cases run on macOS, since the container mounts the socket
alone and the journal never enters it; never on the authoring host, which has no
container runtime): run the same launcher minus `sandbox-exec` inside a
container with equivalent boundaries — workspace and temp mounted writable,
the repo read-only, no secret mounts, network `--internal` plus the proxy
published on the loopback, the signer socket bind-mounted. The proxy and the
scrubbed environment are platform-independent; only the OS profile is
per-platform.

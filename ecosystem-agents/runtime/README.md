# The agent runtime — host-shaped half of the sandboxed signer runtime

The pieces that live OUTSIDE the model and OUTSIDE the SDK: the data channel
(this directory, component 3 of the design in `docs/AI_AGENT_COORDINATION.md`
§ "The sandboxed signer runtime") and, when it lands, the sandbox wrapper
(component 4). The protocol-shaped half — the policy signer and the
socket-backed account — is `@figaro/sdk/signer`.

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
npm install   # once; pulls @figaro/sdk from ../../sdk

RPC_URL=… DEPLOYMENT_RECORD=…/deployments/11155111.json \
IPFS_GATEWAY_URL=… npx figaro-fetch clause figaro-modalities
npx figaro-fetch assembly <compositionHash>
npx figaro-fetch profile <address>
npx figaro-fetch ipfs <cid>
```

Every mode resolves through the live registries (`fetchDiscoveryEvents` →
`DiscoveryGraph`) and prints ONE framed block on stdout; errors are terse on
stderr and never echo fetched bytes. Agents fetch through this tool — never
through bare `curl`/gateway reads — and hosts wiring their own tools call
`frame()` from `dataChannel.mjs` for anything else that arrives from the
network (an XMTP message, a relayed offer envelope) before it reaches the
model.

`node --test tests/*.test.mjs` covers the envelope facts and the property the
frame exists for: a forged closing delimiter inside content cannot escape the
block.

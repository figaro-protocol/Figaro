# Settle a deal

One complete Figaro trade, start to finish, narrated to your terminal.

A buyer and a seller who have never met settle a purchase directly. No platform
sits between them, no arbitrator is consulted, there is no timeout and no admin
key. The script discovers what the network holds, adopts one of the anchored
compositions, builds and signs the agreement on both sides, locks both bonds,
records evidence, settles — and then reads every balance back off the chain to
prove the payouts were exactly what the mechanism says they must be.

It runs against a **local devnet** you bring up yourself. There is no hosted
public network yet.

```
$ npm install
$ node settle-a-deal.mjs
```

Exit code is `0` only if every assertion held.

---

## What you need running

From a checkout of [the Figaro repository](https://github.com/figaro-protocol/Figaro):

```bash
npm run build --workspace sdk   # build @figaro/sdk (this example installs it from ../../sdk)
./scripts/devup.sh              # Anvil + IPFS + the deployed protocol stack
```

`devup.sh` writes `.deployments/local.json` — the record this example reads its
contract addresses from.

| Environment variable | Default | What it is |
|---|---|---|
| `DEPLOYMENT_RECORD` | `../../.deployments/local.json` | the deployment record `devup.sh` writes |
| `FIGARO_RPC_URL` | `http://127.0.0.1:8545` | the JSON-RPC endpoint |
| `IPFS_API_URL` | `http://127.0.0.1:5001` | the Kubo HTTP API |

---

## What it actually does

1. **Reads the deployment record.** A published record uses its own key names
   (`figaroCore`, `tokenAddress`, …); one SDK call — `addressesFromDeploymentRecord`
   — maps it into the shape every other SDK function takes.

2. **Discovers the network.** Registry *events* are the source of truth. The
   script fetches every live-staked clause and every anchored assembly, then
   follows each clause's pointer to IPFS and parses its spec. Nothing is bundled
   with this script — take the registries away and it discovers nothing, which is
   the correct answer.

3. **Adopts a composition** by a rule it states before applying it: among the
   anchored compositions, take the single-order ones that carry every clause the
   specs themselves declare mandatory, then the one composing the fewest clauses
   (ties broken by composition hash). It prints the whole candidate table with the
   reason each one was kept or skipped, then recomputes the chosen composition's
   hash from the pinned template and checks it against the hash the registry
   holds.

4. **Fills the composition.** The designer composed the clauses and authored the
   tailoring; the buyer fills the rest. Which fields the buyer must answer is
   *derived*: the script asks the SDK which fields the walk fills mechanically,
   lets each spec's own declared defaults stand, and answers what remains from a
   small map keyed by **field name** — never by clause id. A required field with
   no answer and no default stops the run with a message naming the field, rather
   than inventing a value.

5. **Builds, hashes, pins, and signs.** `reconstructOrdersFromTemplate` is the
   one walk from template to kernel orders; `assertAgreementSignable` is the gate
   every signature routes through. The agreement is pinned to IPFS and the chain
   gets only its merkle root. Both parties sign the same EIP-712 struct — the SDK
   never fabricates a signature.

6. **Approves the exact bonds and commits.** The bond figures come from
   `calculateBonds` / `calculateRootApproval`, never from arithmetic written here.
   One transaction locks both sides.

7. **Attests.** The seller binds a section of the signed agreement to the chain
   through a merkle inclusion proof. Which section is read off the agreement
   itself. Only the fingerprint goes on chain — the plaintext never touches public
   calldata.

8. **Resolves, and checks the arithmetic.** The buyer settles. Balances are then
   read *fresh from the token contract* — never from what the script believes it
   did — and asserted against `calculateSettlement`:

   | | at commit | at resolve | net |
   |---|---|---|---|
   | buyer | −2 × payment | +2 × payment − payment | **− payment** |
   | seller | −2 × cumulative value | +2 × cumulative value + payment | **+ payment** |
   | kernel | holds both bonds | holds nothing | — |

---

## Nothing about the trade is hardcoded

The script names no assembly, no slug, no clause id, and no seller roster. It
reads what the registries hold and routes every fill through the field names the
specs declare. Anchor a new composition tomorrow that uses a clause nobody has
ever seen, and this same file will discover it, fill it, sign it and settle it
with no edit — which is the property the protocol is for.

The one thing it does hold is a small `BUYER_ANSWERS` map: the values a human
buyer would type into a checkout form. They are keyed by field name, so they
apply to whichever registered clause declares that field. If a composition asks
for something the map has no answer for, the script says so and stops.

## About the bonds

Each side locks a stake worth more than the deal, and gets it back in full when
the deal is honored. It is not a fee, not collateral being put to work, and not
a fund anyone can draw on: it is a **deterrent**, and its only price is being
immobilized for exactly as long as the deal is open. That is the whole reason two
strangers can trade without trusting each other — defecting costs more than
cooperating, for both of them, at every point.

## The two wallets

The example uses **anvil indices 38 and 39**, derived from the public anvil
development mnemonic (`test test test …`) — worthless keys, identical on every
machine. Never put a real key in a file like this one.

Those two indices are the next free ones past everything the repository's own
devnet test machinery claims (it allocates 0–37, and re-using an allocated index
is how one test silently overwrites another's fixtures). Because this example
signs locally rather than through an unlocked node account, it needs no change to
how the node is launched — only funding, which it arranges itself:

- **gas** — anvil's pre-funded index 0 acts as the faucet and tops each wallet up
  only when it is below the floor;
- **settlement tokens** — the devnet's mock token has an open `mint`, so each
  wallet mints exactly its own shortfall.

Both paths are devnet-only and permissionless. On a real network a wallet arrives
already holding what it bonds.

Nothing else on the devnet is touched: no profile is published, no catalogue is
written, no assembly is anchored. The script only reads the registries.

## Running it more than once

Every run generates a fresh commitment salt, so every run is a genuinely new
order and a genuinely new process — nothing collides with the run before it. Run
it as many times as you like; the assertions hold each time.

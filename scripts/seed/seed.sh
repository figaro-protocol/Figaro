#!/usr/bin/env bash
# The genesis seeding of a deployed stack, step by step, on any chain.
#
#   scripts/seed/seed.sh <step> [args]
#
# Every chain value is an input: the record (deployments/<chainId>.json), the
# plan in the expectations file (deployments/<chainId>.expected.json
# § registrations: who registers which clause, agreement, assembly and member
# profile, and the token the assemblies' denomination pin is filled with), and
# the chain id read from RPC_URL. The steps wrap frontend/scripts/populate-clauses.mjs
# and populate-members.mjs, which skip every key already registered, so a step
# re-run after a failure registers only what is missing. The order is the plan's
# (docs/RELEASE_READINESS.md Task 13): the vault's clauses first, because a
# registration is first-write-wins and permanent.
#
# Steps:
#   plan                    print the written plan (Task 13 rule 1); exit 1 on anything undecided
#   fund-vault              the founder sends the vault the stakes of the clauses the plan gives it
#                           (AMOUNT in ether overrides: that many stakes, read from the chain)
#   vault-clauses           the vault registers exactly the clauses the plan gives it
#   founder [assembly ...]  the founder registers the named reference assemblies with the
#                           clauses and distinct agreements they compose (SEED_LIMIT caps new
#                           registrations); no name: every clause, agreement and assembly
#                           still missing that the plan gives no other wallet
#   member <file>           registers members/<file>.json from the wallet the plan names for it
#   delegation              the DAO operator grants the vault its bounded delegation
#                           (frontend/scripts/dao-operator-delegation.mjs grant), naming the
#                           record's vault and members registry
#
# Inputs:
#   RPC_URL                 the chain (required); never printed
#   DEPLOYMENT_RECORD       default deployments/<chainId>.json
#   EXPECTED                default deployments/<chainId>.expected.json
#   IPFS_PIN_SERVICE_JWT    the pinning service key, or NEXT_PUBLIC_IPFS_API_URL for a Kubo node
# Signers, by the wallet name the plan uses:
#   founder                 FOUNDER_LEDGER_HD_PATH (Ledger Live path m/44'/60'/N'/0/0)
#   daoOperator             DAO_OPERATOR_KEY
#   deployer                PRIVATE_KEY (the deploy's key)
#   the vault's owners      VAULT_OWNER_KEYS, with the founder's Ledger as the second approval.
#                           These steps speak the devnet mock vault's interface
#                           (frontend/scripts/populate-clauses.mjs VAULT_ABI); a Safe, the
#                           vault on every public chain, is signed through its own interface,
#                           which these steps do not speak yet
#   IMPERSONATE=1           fork rehearsal only: every wallet the plan names signs as its own
#                           address, impersonated on the Anvil node (refused elsewhere)
# Each signer's address is read and compared with the plan's before anything is sent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STEP="${1:-}"; shift || true

: "${RPC_URL:?RPC_URL is required}"
CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
RECORD="${DEPLOYMENT_RECORD:-$REPO_ROOT/deployments/$CHAIN_ID.json}"
EXPECTED="${EXPECTED:-$REPO_ROOT/deployments/$CHAIN_ID.expected.json}"
[ -f "$RECORD" ] || { echo "❌ no record at $RECORD"; exit 1; }
[ -f "$EXPECTED" ] || { echo "❌ no expectations file at $EXPECTED"; exit 1; }
REC_CHAIN=$(jq -r .chainId "$RECORD")
[ "$REC_CHAIN" = "$CHAIN_ID" ] || { echo "❌ RPC_URL is chain $CHAIN_ID, the record $RECORD is chain $REC_CHAIN"; exit 1; }

plan() { node "$SCRIPT_DIR/plan.mjs" "$RECORD" "$EXPECTED" "$@"; }
rec() { jq -r ".$1 // empty" "$RECORD"; }
lower() { tr '[:upper:]' '[:lower:]'; }
is_anvil() { cast rpc anvil_nodeInfo --rpc-url "$RPC_URL" > /dev/null 2>&1; }
if [ "${IMPERSONATE:-}" = "1" ] && ! is_anvil; then
  echo "❌ IMPERSONATE=1 is the fork rehearsal's: this node is not Anvil"; exit 1
fi

# signer_for <wallet name>: exports the populate scripts' registrar variables
# for that wallet and refuses a signer whose address is not the plan's.
signer_for() {
  local name="$1" want got
  want=$(plan --get wallet "$name")
  unset REGISTRAR_LEDGER_HD_PATH REGISTRAR_IMPERSONATE REGISTRAR_PRIVATE_KEY
  if [ "${IMPERSONATE:-}" = "1" ]; then
    export REGISTRAR_IMPERSONATE="$want"
    echo "   $name = $want (impersonated on the fork)"
    return
  fi
  case "$name" in
    founder)
      : "${FOUNDER_LEDGER_HD_PATH:?the founder signs on its Ledger: set FOUNDER_LEDGER_HD_PATH}"
      got=$(cast wallet address --ledger --hd-path "$FOUNDER_LEDGER_HD_PATH")
      export REGISTRAR_LEDGER_HD_PATH="$FOUNDER_LEDGER_HD_PATH" ;;
    daoOperator)
      : "${DAO_OPERATOR_KEY:?the DAO's profile registers from its operator EOA: set DAO_OPERATOR_KEY}"
      got=$(cast wallet address --private-key "$DAO_OPERATOR_KEY")
      export REGISTRAR_PRIVATE_KEY="$DAO_OPERATOR_KEY" ;;
    deployer)
      : "${PRIVATE_KEY:?the deployer signs with the deploy's key: set PRIVATE_KEY}"
      got=$(cast wallet address --private-key "$PRIVATE_KEY")
      export REGISTRAR_PRIVATE_KEY="$PRIVATE_KEY" ;;
    *) echo "❌ no signer is known for the wallet \"$name\""; exit 1 ;;
  esac
  if [ "$(echo "$got" | lower)" != "$(echo "$want" | lower)" ]; then
    echo "❌ the $name signer is $got; the plan names $want"; exit 1
  fi
  echo "   $name = $want"
}

# The founder's second approval on the vault: its Ledger, or impersonated on a fork.
vault_owners() {
  : "${VAULT_OWNER_KEYS:?the vault needs its key owners: set VAULT_OWNER_KEYS}"
  export VAULT_OWNER_KEYS
  unset VAULT_LEDGER_HD_PATH VAULT_IMPERSONATE_OWNER
  if [ "${IMPERSONATE:-}" = "1" ]; then export VAULT_IMPERSONATE_OWNER="$(plan --get wallet founder)"
  elif [ -n "${FOUNDER_LEDGER_HD_PATH:-}" ]; then export VAULT_LEDGER_HD_PATH="$FOUNDER_LEDGER_HD_PATH"
  fi
}

populate() { # <script> — the registries from the record, run from frontend/
  export RPC_URL
  export DEPLOYMENT_RECORD="$RECORD"   # a reference that pins an address of the deployment (deployTimeCurrency) reads it here
  export NEXT_PUBLIC_CLAUSE_REGISTRY="$(rec clauseRegistry)"
  export NEXT_PUBLIC_PROCESS_REGISTRY="$(rec processRegistry)"
  export NEXT_PUBLIC_AGREEMENT_REGISTRY="$(rec agreementRegistry)"
  export NEXT_PUBLIC_MEMBERS_REGISTRY="$(rec membersRegistry)"
  (cd "$REPO_ROOT/frontend" && node "scripts/$1")
}

echo "🌱 seed $STEP — chain $CHAIN_ID, record $RECORD"
case "$STEP" in
  plan)
    plan ;;

  fund-vault)
    VAULT=$(plan --get wallet daoVault)
    CLAUSES=$(plan --get clauses-for daoVault)
    [ -n "$CLAUSES" ] || { echo "   the plan gives the vault no clause — nothing to fund"; exit 0; }
    STAKE=$(cast call "$(rec clauseRegistry)" 'registrationDeposit()(uint256)' --rpc-url "$RPC_URL" | awk '{print $1}')
    COUNT=$(echo "$CLAUSES" | tr ',' '\n' | grep -c .)
    WEI="${AMOUNT:+$(cast to-wei "$AMOUNT")}"
    WEI="${WEI:-$(( STAKE * COUNT ))}"
    FOUNDER=$(plan --get wallet founder)
    echo "   the vault $VAULT stakes $COUNT clause(s) ($CLAUSES) at $STAKE wei: sending $WEI wei from the founder $FOUNDER"
    if [ "${IMPERSONATE:-}" = "1" ]; then
      cast rpc anvil_impersonateAccount "$FOUNDER" --rpc-url "$RPC_URL" > /dev/null
      cast send --unlocked --from "$FOUNDER" --rpc-url "$RPC_URL" --value "$WEI" "$VAULT" > /dev/null
    else
      signer_for founder
      echo "   confirm the recipient $VAULT and the amount on the device"
      cast send --ledger --hd-path "$FOUNDER_LEDGER_HD_PATH" --rpc-url "$RPC_URL" --value "$WEI" "$VAULT" > /dev/null
    fi
    echo "   the vault holds $(cast balance "$VAULT" --rpc-url "$RPC_URL") wei" ;;

  vault-clauses)
    VAULT=$(plan --get wallet daoVault)
    CLAUSES=$(plan --get clauses-for daoVault)
    [ -n "$CLAUSES" ] || { echo "   the plan gives the vault no clause"; exit 0; }
    unset REGISTRAR_LEDGER_HD_PATH REGISTRAR_IMPERSONATE REGISTRAR_PRIVATE_KEY SEED_ASSEMBLIES ASSEMBLY_TOKEN_ADDRESS
    vault_owners
    export REGISTRAR_VAULT="$VAULT" SEED_CLAUSES="$CLAUSES"
    # A Safe names its version; the devnet mock vault has no such function.
    if cast call "$VAULT" 'VERSION()(string)' --rpc-url "$RPC_URL" > /dev/null 2>&1; then
      echo "❌ the vault $VAULT is a Safe, and this step speaks the devnet mock vault's interface only"
      echo "   (frontend/scripts/populate-clauses.mjs VAULT_ABI): $CLAUSES cannot be registered through it yet"
      exit 1
    fi
    echo "   the vault $VAULT registers $CLAUSES"
    populate populate-clauses.mjs ;;

  founder)
    # The vault's clauses come first: populate-clauses.mjs leaves them out of a
    # founder run by the same plan, and this refuses to start before they stand.
    for ref in $(plan --get clauses-for daoVault | tr ',' ' '); do
      KEY=$(node -e "import('$REPO_ROOT/sdk/dist/discovery.js').then(({computeClauseKey})=>{const fs=require('fs');const d='$REPO_ROOT/clauses';for(const f of fs.readdirSync(d)){const s=JSON.parse(fs.readFileSync(d+'/'+f,'utf8'));if(s.clauseId+'@'+s.version==='$ref')console.log(computeClauseKey(s))}})")
      if [ "$(cast call "$(rec clauseRegistry)" 'registered(bytes32)(bool)' "$KEY" --rpc-url "$RPC_URL")" != "true" ]; then
        echo "❌ $ref, which the plan gives the vault, is not registered yet: run vault-clauses first"; exit 1
      fi
    done
    signer_for founder
    unset REGISTRAR_VAULT SEED_CLAUSES
    export ASSEMBLY_TOKEN_ADDRESS="$(plan --get assembly-token)"
    if [ "$#" -gt 0 ]; then export SEED_ASSEMBLIES="$(IFS=,; echo "$*")"; else unset SEED_ASSEMBLIES; fi
    echo "   assemblies: ${SEED_ASSEMBLIES:-every one still missing}; token $ASSEMBLY_TOKEN_ADDRESS, or the record's entry a file names (deployTimeCurrency)"
    populate populate-clauses.mjs ;;

  member)
    FILE="${1:?member <file in members/, no .json>}"
    [ -f "$REPO_ROOT/members/$FILE.json" ] || { echo "❌ no members/$FILE.json"; exit 1; }
    WALLET=$(plan --get member-wallet "$FILE")
    unset REGISTRAR_VAULT VAULT_OWNER_KEYS VAULT_LEDGER_HD_PATH VAULT_IMPERSONATE_OWNER
    signer_for "$WALLET"
    export MEMBER_PROFILE="$REPO_ROOT/members/$FILE.json"
    populate populate-members.mjs ;;

  delegation)
    : "${DAO_OPERATOR_KEY:?the delegation is signed by the operator: set DAO_OPERATOR_KEY}"
    signer_for daoOperator
    export DELEGATE="$(plan --get wallet daoVault)" ALLOWED_TARGETS="$(rec membersRegistry)"
    export DELEGATION_OUT="${DELEGATION_OUT:-$REPO_ROOT/deployments/dao-operator-delegation.$CHAIN_ID.json}"
    (cd "$REPO_ROOT/frontend" && node scripts/dao-operator-delegation.mjs grant) ;;

  *)
    sed -n '2,45p' "$0"; exit 2 ;;
esac

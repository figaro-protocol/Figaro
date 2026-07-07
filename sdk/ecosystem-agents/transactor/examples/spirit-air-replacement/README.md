# Spirit Air replacement

A passenger-airline assembly where the airline is *seller-of-record* buying from gate-ops, fuel, crew, catering, and maintenance as sub-sellers. The structural fix isn't a better airline; it's repricing cascading delays as a bonded coordination problem.

## What Spirit (and the airline-as-system) gets wrong

The pattern isn't unique to Spirit, but Spirit makes it visible. Three failure modes:

1. **Cost-optimized to no slack.** Razor-thin margins eliminate operational buffer. One late connection cascades because nothing else can absorb the slip.
2. **Misaligned incentives between airline and sub-suppliers.** Gate ops, fuel, crew agencies, and catering are separate companies on separate contracts. When something goes wrong, blame-shifting and partial service follow. The airline is the public face but doesn't control the dependencies.
3. **No passenger leverage.** Contract of carriage limits liability; voucher policies cap recourse. The passenger has paid in full and can't recover damages proportional to the disruption.

## What Figaro fixes structurally

Each ticket is a bonded commitment. Buyer-dominance is operational: the passenger holds the resolution key. Don't make it to your destination on schedule → buyer doesn't release bonds → the airline (and its sub-supplier chain) eats the bond loss.

The interesting part is the sub-supplier chain. The airline isn't a single seller — it's a *seller-of-record buying from sub-sellers* (gate-ops, fuel, crew, catering, maintenance). Each sub-leg is its own bonded sub-process under the parent ticket process. Asymmetric bonding scales the bilateral primitive across these per Paper A.

When fuel doesn't show up, the airline's bond to the passenger is at risk *and* the fuel supplier's bond to the airline is at risk. Whichever party caused the slip eats the loss. This is weakest-link coordination on the mesh — the same mechanism the protocol uses for shipping handoffs.

## What you'd build

- **Clauses to author**: ~1 new clause (see `clauses.md`). The biggest gap is a scheduled-departure binding.
- **Assembly DAG**: passenger as root buyer; airline as fan-out seller; 5 typical sub-sellers. See `assembly.md`.
- **Transactors**: one per role — passenger, airline, gate-ops, fuel, crew, catering, maintenance. See `roles.md`.

## Bond posture preview

For a $200 ticket on a single flight with no connections:

- Passenger buyer-bond: 2 × $200 = $400
- Airline seller-bond: 2 × $200 = $400 (the airline's commitment to the passenger)
- Airline buyer-bonds at sub-processes: 2 × cost-of-each-sub-service. If gate-ops is $50, fuel is $1500, crew is $300, catering is $40, maintenance is $20 — those sub-processes have buyer-bonds proportional to each cost.
- Each sub-seller's seller-bond is symmetric.

Total custody briefly hits $400 (passenger) + $400 (airline) = $800 on the parent process, plus the sub-process custodies which are separate bonded scopes. Asymmetric bonding's whole point is that this composes — the kernel only knows about the bilateral; the structure emerges.

## Provenance

Same caveat as the TradeLens example: the structural fix isn't novel; it's the application of an existing protocol to an existing failure mode. The interesting work is what the agents handle versus what they don't.

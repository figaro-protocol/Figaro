# Figaro Eats — First Archetype

Figaro Eats was the first institution archetype built on Figaro Protocol.
It demonstrated a concrete merchant-plus-delivery institution built on the
core asymmetric bonding mechanism, where independent value-adders (food
preparers, customers, couriers) coordinate directly through bonded settlement.

## Current Status

The eats archetype has been rebuilt in this repo as composable components and
templates. It is now one of five reference institution assemblies:

- **eats** — bonded delivery coordination
- **equipment-rental** — bonded asset rental
- **procurement** — bonded procurement process
- **disclosure-review** — bonded disclosure and review
- **freelance** — bonded solo-service coordination

These assemblies live in `frontend/lib/shared/assemblies/*.reference.json` and are
rendered by the shared runtime from the same component and module library.

The mechanism contracts (`src/eats/`) are not scoped to eats — they are
permissionless primitives usable by any institution assembly.

## Architecture

See the main [copilot-instructions.md](../.github/copilot-instructions.md) for
the complete frontend structure, contract inventory, and development setup.
See [THEORY.md](../docs/v5/THEORY.md) for the game-theoretic derivation.

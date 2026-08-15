# Door Pistons — Design

## Problem

Phase 3 made "abre hacia arriba" (up-opening/flap door) a real, configurable
hinge option on any door, with genuine distinct 3D pivot behavior. The
user's original request (Section 2 of the "mejoras de muebles" ask) wants
an optional gas-strut piston attachable to any such up-opening door —
appearing as a real, admin-priced catalog component that sums into the
project's cost automatically, never a hardcoded number. This is phase 4 of
the larger effort (materials CRUD — done; multi-door reuse — done;
per-category material defaults follow as a separate spec).

## Goals

- Any door whose hinge side is "arriba" can optionally get a piston.
- The option disappears/resets if that door's hinge side changes away
  from "arriba" — no orphaned piston flag on a door that can't use one.
- Piston price comes from the materials catalog (Phase 1's CRUD), never a
  hardcoded frontend constant, and is admin-editable from day one (a real
  seeded row, not something the admin has to discover they need to add).
- Piston count/cost appears as its own line item in the project's quote,
  summed automatically — same mechanism every other hardware line already
  uses.

## Current state (verified against the code)

- **Up-opening mechanism** (built in phase 3): `ModuleOptions.doorHingeSides?:
  ("izquierda"|"derecha"|"arriba")[]` (`frontend/types/kitchen.ts`) — a
  flat, index-aligned array, one entry per door. The "arriba" option is
  offered via `DOOR_HINGE_OPTIONS_UPPER`
  (`frontend/components/kitchen/ModuleInspector.tsx`), only for
  `isUpper` category modules, in the per-door "Apertura de puertas"
  section (`ModuleInspector.tsx:810+`) — the exact place a new per-door
  piston control belongs, right alongside the existing hinge-side/
  hinge-type/glass fields for that same door index.
- **3D**: `DoorPanel` (`frontend/components/3d/ModulePreview3D.tsx`)
  already renders a genuinely different pivot (rotates around X instead
  of Y) when `door.hingeTop` is true — real geometry, not just a data
  flag. No hinge, corredera, or other hardware fitting is ever rendered
  as a discrete 3D mesh anywhere in this codebase (confirmed: hardware
  is a cost/data concept only, `HARDWARE_LOOKS` only affects visible
  handle/jaladera appearance, not hinges). Pistons follow this same
  established precedent — no new 3D geometry.
- **Materials catalog** (built in phase 1): a real backend CRUD
  (`backend/app/Models/Material.php`, `MaterialController.php`,
  `materials` table with a `code` column) already exists and is wired to
  kitchen pricing via `materialCosts?.get(code) ?? <fallback>` at every
  cost site in `calculateKitchenMaterials`
  (`frontend/services/kitchenData.ts`). The materials CRUD's category
  dropdown (`frontend/components/materials/MaterialFormModal.tsx`'s
  `TYPE_OPTIONS`) already includes `"Pistón"` — added in phase 1
  anticipating this phase, but **no seeded row exists yet** for it.
- **Cost calc structure**: front-door hinge cost is computed once per
  module at `kitchenData.ts:1960-1962`
  (`const hingeCode = ...; const hingeCost = materialCosts?.get(hingeCode)
  ?? (...); addHardware("bisagra", "Bisagras", doors.length, "pares",
  hingeCost);`) — the natural neighboring location for a new piston-cost
  addition, since it already has `doors`/`o` in scope at that point in
  the per-module loop.
- **Backward-compat precedent**: phase 1's migration
  (`2026_08_15_120000_add_code_to_materials.php`) already established
  the pattern for adding a new priced catalog row via an additive
  migration — a new piston row follows the identical shape.

## Non-goals

- No 3D piston geometry — matches the existing, established precedent
  that hardware fittings are never visually modeled in this codebase.
- No change to the up-opening mechanism itself (phase 3, already correct
  and unchanged here).
- No per-piston-type variety (single/double, different strut strengths,
  etc.) — one generic "Pistón" option per door, matching the scope of
  the original request. A richer taxonomy is easy to add later (the
  materials catalog already supports arbitrary categorization) but isn't
  asked for now.
- No back-door pistons — back doors (island cabinets) don't expose an
  "arriba" hinge option today (confirmed: no `doorHingeSides`-driven UI
  exists for `backDoors`), so there's no door a back-door piston could
  attach to. If back-door up-opening is ever added, piston support there
  is a natural, small follow-up, not part of this phase.

## 1. Data model — one new field

`ModuleOptions` gains `doorPistons?: boolean[]` — flat, index-aligned,
identical convention to `doorGlass`/`doorPullOut`. Meaningful only at
indices where the same-indexed `doorHingeSides[i] === "arriba"`; ignored
(and effectively `false`) everywhere else. `DoorPanel`'s existing
`useEffect` that resets a door's open/closed animation state when its
hinge side/type changes gets no new responsibility here — the *option*
itself (whether a piston is requested) is UI-level state the inspector
manages, not something the 3D layer needs to react to at all, since
nothing renders differently.

## 2. UI — one new per-door control

Inside the existing "Apertura de puertas" section's per-door loop
(`ModuleInspector.tsx:812+`), add one more field for each door, rendered
only when that door's current hinge side is `"arriba"`: a checkbox/toggle
bound to `doorPistons[i]`. When a door's hinge side changes away from
`"arriba"`, its `doorPistons[i]` entry is cleared back to `false` in the
same `onChange` that updates `doorHingeSides` — so a stale "piston
requested" flag can never silently persist and reappear if that door's
hinge is later changed back to `"arriba"`.

## 3. Pricing — one new hardware line, catalog-sourced

New constant `HARDWARE_COSTS.piston_arriba` (fallback value only — the
seeded catalog row is the real source of truth once loaded) alongside
the existing hinge/corredera constants. In the per-module cost loop,
right after the existing front-door hinge cost computation
(`kitchenData.ts:1960-1962`), count how many of this module's doors have
both `doorHingeSides[i] === "arriba"` and `doorPistons[i] === true`, and
— if that count is greater than zero — add one `addHardware("piston",
"Pistones", count, "pzas", materialCosts?.get("piston_arriba") ??
HARDWARE_COSTS.piston_arriba)` line, following the exact same
aggregation pattern every other hardware line item already uses (pooled
by type across the whole project, not per-module).

## 4. Backend — one new seeded catalog row

An additive migration (mirroring phase 1's
`add_code_to_materials.php` pattern exactly): insert one new `materials`
row, `type: "Pistón"`, `code: "piston_arriba"`, a real starting price
(sourced from the same fallback constant added in §3, so the seed and
the code-level fallback never silently disagree), `unit: "pzas"`,
`active: true`. No schema change — the `code` column and `type`
free-text field already exist from phase 1.

## 5. Backward compatibility

`doorPistons` is optional — every existing saved project loads with it
`undefined`, which reads as "no pistons requested" everywhere (`?.[i]`
optional-chained, never a hard requirement). No project's rendered
geometry or previously-quoted price changes on load; the only way a
project's quote total changes is a user actively opting a door into a
piston going forward. If the piston catalog row hasn't synced yet in a
given environment (fresh DB before the migration runs), pricing falls
back to the hardcoded constant, exactly like every other phase-1-wired
cost site already does.

## 6. Testing

`npx tsc --noEmit` plus reasoning (frontend, no unit-test runner);
`php artisan test` (backend, real Feature-test suite already
established in phase 1 — this migration doesn't need new test coverage
of its own beyond confirming it runs cleanly, since it adds no new
validated endpoint behavior, just seed data).

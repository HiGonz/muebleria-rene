# Floor/Wall Material Defaults — Design

## Problem

Every new kitchen module's `boardMaterial` (the primary board/melamine
choice) defaults to a single hardcoded value,
`DEFAULT_OPTIONS.boardMaterial = "Melamina blanca 15mm"`
(`frontend/services/kitchenData.ts`) — regardless of whether the module
is a floor cabinet (lower/tower/corner/appliance — "muebles bajos, piso")
or a wall cabinet (upper — "muebles altos, aéreos"). Real kitchens
commonly use a different board for uppers than lowers, and today an admin
can't set that without a code change and a deploy — the same root problem
Phase 1 solved for prices, now for *which* material is the default.

The codebase already has this exact floor/wall grouping: `placementBandFor`
(`kitchenData.ts:1537`) classifies every module category into `"floor"`
(lower/tower/corner/appliance) or `"wall"` (upper), used today only for
placement/overlap-prevention. This phase reuses that grouping rather than
inventing a second one.

This is Phase 2 of the larger 4-phase effort (materials CRUD — done;
multi-door reuse — done; pistons — done). It closes the loop Phase 1
opened: Phase 1 made prices admin-editable; this phase makes the
*default selection* admin-editable too, for exactly the one option field
(`boardMaterial`) where "floor vs. wall" is the natural, already-existing
split.

## Goals

- An admin can mark exactly one active `"Tablero"`-type material as the
  default for floor cabinets, and exactly one as the default for wall
  cabinets, from the existing Materials CRUD UI (`/materials`).
- A newly added floor-band module (lower/tower/corner/appliance) defaults
  its `boardMaterial` to the admin's floor default; a newly added
  wall-band module (upper) defaults to the admin's wall default.
- Catalog entries that already explicitly set their own `boardMaterial`
  in `defaultOptions` (the 3 decorative accessory panels — `panel_lateral`,
  `panel_remate`, `panel_decorativo`) are unaffected — an explicit catalog
  default still wins, exactly as the existing
  `{...DEFAULT_OPTIONS, ...smartDefaults, ...entry.defaultOptions}` merge
  order already establishes.
- Categories outside the floor/wall bands (`accessory`, `countertop`,
  `opening`) keep using today's hardcoded fallback, unchanged.
- Zero breakage if no default is configured yet (fresh install, or the
  admin hasn't set one): behavior is identical to today.
- Existing saved projects are completely unaffected — this only changes
  what *new* modules default to at creation time; it never touches
  `boardMaterial` on modules that already exist in a saved draft.

## Current state (verified against the code)

- **`DEFAULT_OPTIONS.boardMaterial`** (`kitchenData.ts:178`): a single
  hardcoded string applied via
  `buildNewModule` (`kitchenData.ts:1509`, `options: {...DEFAULT_OPTIONS,
  ...smartDefaults, ...entry.defaultOptions}`) to every catalog entry that
  doesn't explicitly override it. Only 3 of ~150 catalog entries do
  (`kitchenData.ts:1155,1165,1175` — all `category: "accessory"` decorative
  panels with deliberately special finishes).
- **`placementBandFor`** (`kitchenData.ts:1537`, a hoisted `function`
  declaration, callable from anywhere earlier in the file): `isWallMounted
  = category === "upper" || <3 corner-cabinet types>` → `"wall"`;
  `category` is `lower`/`tower`/`corner`/`appliance` → `"floor"`;
  anything else (`accessory`/`countertop`/`opening`) → `null`. Already used
  for overlap-prevention placement (`kitchenData.ts:1611-1613`) — this
  phase reads it for a second purpose, doesn't duplicate its logic.
- **`buildNewModule(type, x, z, rotation)`** (`kitchenData.ts:1509`): pure
  function, no store/React dependency. Called from
  `useKitchenStore.ts`'s `addModule`/`placeAccessoryInNiche`, and
  internally from `kitchenData.ts`'s own `makeModuleAdder`
  (`buildSampleKitchen`'s demo-layout helper, `kitchenData.ts:1258`) and a
  dev-only thumbnail-export page. All 4 call sites pass at most 4
  positional args today.
- **`addModule` in `useKitchenStore.ts:247`**: after `buildNewModule`,
  applies `pickGlobalMaterial(s.draft.modules[0].options)` when the room
  already has a module — but `GLOBAL_MATERIAL_FIELDS`
  (`useKitchenStore.ts:60-63`) is `exteriorTexture, hardwareFinish,
  zocaloMaterial, countertopModel/Material/Color/Texture` — **`boardMaterial`
  is not in that list**, so this phase's floor/wall default correctly
  applies to every newly added module, not only the room's first one.
- **Materials CRUD** (built in Phase 1): `materials` table
  (`id, name, code, type, unit, cost_per_unit, stock, active`),
  `MaterialController` (`store`/`update`/`destroy`, no cross-row
  exclusivity logic today), `listMaterials()`/`createMaterial()`/
  `updateMaterial()` (`frontend/services/api.ts:268-320`, mapping
  `BackendMaterial` ↔ the frontend's `{cost, ...}` shape),
  `MaterialFormModal.tsx` (`TYPE_OPTIONS = ["Tablero", "Herraje",
  "Acabado", "Fijación", "Cubierta", "Pistón", "Otro"]`), `/materials/page.tsx`
  (a table with per-row `Editar`/`Desactivar`/`Eliminar` actions, each
  calling `updateMaterial`/`deleteMaterial` then `reload()` — the pattern
  this phase's new "set as default" actions follow).
- **`useKitchenStore.ts`'s `loadMaterialCosts()`** (`:716-729`): the single
  existing fetch-all-materials call, already builds `materialCosts: Map`
  from the same `listMaterials()` response this phase also needs — this
  phase extends that one call rather than adding a second fetch.

## Non-goals

- No change to any option field other than `boardMaterial` —
  `exteriorMaterial`, `countertopMaterial`, `hardwareFinish`, etc. keep
  their current defaulting behavior untouched.
- No per-individual-category (8-way) defaults — literally floor vs. wall
  (2 groups), matching both this phase's name and the codebase's existing
  2-way `placementBandFor` grouping. A module type outside both bands
  (`accessory`/`countertop`/`opening`) is out of scope.
- No retroactive update of existing modules or saved projects.
- No change to `buildSampleKitchen`'s demo layouts — they keep their
  intentionally fixed appearance; `makeModuleAdder`'s internal
  `buildNewModule` call stays as today (floor/wall params simply omitted,
  falling back to the hardcoded default exactly as today).
- No general-purpose settings system — two boolean columns on the
  existing `materials` table, admin-toggleable from the existing CRUD UI,
  mirroring how Phase 1 added the `code` column.
- No DB-level uniqueness constraint for "only one default per band" —
  enforced in the controller instead (see §1), matching this codebase's
  existing preference for application-level checks over DB constraints
  for this kind of business rule.

## 1. Backend — two new flag columns + exclusivity logic

Additive migration (mirroring Phase 1's `add_code_to_materials.php`
pattern): adds `default_floor` and `default_wall`, both
`boolean, not null, default(false)`, to `materials`. No backfill needed —
`false` for every existing row is the correct "no default set yet" state.

`MaterialController@store`/`@update` gain two new validated fields,
`default_floor`/`default_wall` (`sometimes|boolean` on update,
`sometimes|boolean` with an implicit `false` default on store, matching
how `active` is already handled). A custom validation rule rejects
setting either flag `true` on a request whose resulting `type` (the
request's `type` if present, else the existing row's `type` on update)
is not `"Tablero"` — a piston or hardware row can never be a board
default. When a request sets `default_floor: true` (or `default_wall:
true`), the controller — inside a DB transaction — first sets that same
flag to `false` on every *other* row that currently holds it, then saves
the requested row: exactly one row can hold each flag at a time, enforced
in application code, not a DB constraint (see Non-goals). Setting a flag
to `false` never needs this exclusivity step — clearing a default just
leaves that band with no default (falls back to the hardcoded constant,
same as today).

## 2. Frontend API + store — extend the existing fetch, don't add one

`BackendMaterial` and the `listMaterials()`/`mapMaterial()`/`MaterialInput`
shapes in `frontend/services/api.ts` gain `default_floor`/`default_wall`
(backend) ↔ `defaultFloor`/`defaultWall` (frontend), following the exact
naming convention already used for `cost_per_unit` ↔ `cost`.
`updateMaterial()` forwards `patch.defaultFloor`/`patch.defaultWall` to
the request body the same way it forwards `patch.active`.

`useKitchenStore.ts` gains two new state fields, `defaultFloorBoardMaterial:
string | null` and `defaultWallBoardMaterial: string | null`, initialized
to `null` (same pattern as `materialCosts`). `loadMaterialCosts()` — the
one existing call that already fetches every material — additionally
scans the same response for the (at most one) active row with
`defaultFloor === true` and the (at most one) with `defaultWall === true`,
storing each row's `name` (board materials are matched by name directly,
per Phase 1's established convention — no `code` lookup needed here) into
the two new state fields. No new network call.

## 3. `buildNewModule` — two new optional parameters

`buildNewModule(type, x = 0, z = 0, rotation = 0, floorBoardMaterial?:
string, wallBoardMaterial?: string)` — two new trailing optional
parameters appended after the existing 4, so every existing call site
(the dev-thumbnail-export page, `buildSampleKitchen`'s internal
`makeModuleAdder`) keeps compiling and behaving identically unchanged,
simply omitting the new args.

Inside, after the existing `smartDefaults` computation, one more
`Partial<ModuleOptions>` is derived:

```ts
const band = placementBandFor({ category: entry.category, type });
const boardDefault: Partial<ModuleOptions> =
  band === "floor" && floorBoardMaterial ? { boardMaterial: floorBoardMaterial }
  : band === "wall" && wallBoardMaterial ? { boardMaterial: wallBoardMaterial }
  : {};
```

merged as `{...DEFAULT_OPTIONS, ...smartDefaults, ...boardDefault,
...entry.defaultOptions}` — placed *after* `smartDefaults` but *before*
`entry.defaultOptions`, so the 3 catalog entries with an explicit
`boardMaterial` still win (last-write-wins spread order), and a module
outside both bands (`band === null`) or with no default configured for
its band (`floorBoardMaterial`/`wallBoardMaterial` undefined) falls
through to `DEFAULT_OPTIONS.boardMaterial` exactly as today.

## 4. Store wiring

`addModule` and `placeAccessoryInNiche` (`useKitchenStore.ts:247,278`)
pass `get().defaultFloorBoardMaterial ?? undefined` and
`get().defaultWallBoardMaterial ?? undefined` as `buildNewModule`'s two
new trailing arguments. `?? undefined` converts the store's `null`
("no default configured") into the parameter's own "not provided"
state, so `buildNewModule`'s existing `floorBoardMaterial ? ... : {}`
check needs no `null`-awareness of its own.

## 5. UI — two new per-row actions, Tablero rows only

`/materials/page.tsx`'s table gains, only on rows where `material.type
=== "Tablero"`, two new row actions next to the existing
`Editar`/`Desactivar`/`Eliminar` buttons: "Predeterminado piso" and
"Predeterminado pared" — each calling `updateMaterial(material.id,
{ defaultFloor: true })` (or `defaultWall`) then `reload()`, following
the exact same call-then-reload shape as the existing `handleToggle`.
Whichever row currently holds a flag shows it as an active/filled state
(e.g. a small `Badge`) instead of a clickable action, so at most one
Tablero row per band is ever shown as clickable to *become* the default at
a time — clicking a non-default row's action makes it the default (and,
via §1's server-side exclusivity, un-defaults whoever held it before).

## Backward compatibility

Every existing saved kitchen project is unaffected: `boardMaterial` is
only read from a project's own stored options, never recomputed on load.
`default_floor`/`default_wall` both start `false` on every existing
materials row (migration adds the columns with that default, no
backfill) — until an admin explicitly sets one, `buildNewModule`'s new
parameters are simply `undefined`, and every new module defaults exactly
as it does today. The dev-thumbnail-export page and `buildSampleKitchen`
never pass the new parameters, so their output is byte-for-byte unchanged.

## Testing

`npx tsc --noEmit` plus reasoning (frontend, no unit-test runner, this
project's established convention). `php artisan test` (backend, real
Feature-test suite already established in Phase 1) — new coverage for
`MaterialControllerTest.php`: setting `default_floor` on one row unsets
it on another; setting `default_floor`/`default_wall` on a non-`"Tablero"`
row is rejected; setting `active` alone (no default flags in the request)
never touches either flag on any row.

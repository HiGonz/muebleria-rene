# Catalog-Driven Countertops & Board Materials — Design

## Problem

An admin can add a new material of type `Cubierta` (e.g. "Kober Yule")
or `Tablero` in `/materials`, but it has no way to actually be selected
in a project and quoted. Two selection pickers in the kitchen/closet
builder still read from small, hand-picked, hardcoded arrays instead of
the `materials` catalog:

1. **Countertops**: `CountertopModelPicker` (`ModuleInspector.tsx:410`)
   renders `COUNTERTOP_MODELS` (`kitchenData.ts:260`), a fixed array of
   11 `{id, label, material, color, pricePerM2, finishCode?}` entries.
   The array's own comment says *"a real catalog (with its own CRUD
   screen) would replace this array"* — that never happened. A new
   `Cubierta` material is invisible to every project regardless of how
   many are added.
2. **Board substrate (interior/exterior)**: the "Tablero
   interior"/"Tablero exterior" picker in `GlobalMaterialsModal.tsx`
   renders `BOARD_OPTIONS = Object.keys(BOARD_COSTS)`
   (`kitchenData.ts:204`), 10 fixed literal names. A `Tablero` material
   can only become a *default* (floor/wall) if its `name` string
   matches one of those 10 exactly — a genuinely new board finish can
   never appear as a selectable option.

This is a known, deliberate gap: the 2026-09-01 Hardware Materials
Costing design explicitly deferred "dynamic selection or CRUD-driven
appearance of visual materials (board finish, countertop model)" as
"a distinct 3D-asset problem, a separate future project." This spec is
that project.

Two related systems already exist and are NOT being rebuilt:

- **`hardware_role`/`is_default`** (`materials` table): already makes
  bisagra/corredera catalog-driven and selectable, with a
  deactivation/default guard in `MaterialController`. This spec follows
  the identical pattern for `Cubierta` and `Tablero`.
- **`finishes` table**: an admin-manageable photo → seamless-texture +
  sampled-swatch-color pipeline, `type: panel|cubierta|ambos`, already
  live at `/finishes`. Already used to paint the panel/exterior texture
  picker (`TexturePicker`, `ModuleInspector.tsx:384`) and to optionally
  pin a real photo onto one of the 11 hardcoded `COUNTERTOP_MODELS`
  entries via `finishCode`. This spec reuses it unchanged for
  countertop color — it does not touch the upload pipeline.

## Goals

- A `Cubierta`-type material in the catalog is immediately selectable
  in the countertop picker, with its own cost per m² and, optionally, a
  real photographed color/texture (via an existing `finishes` row).
- A `Tablero`-type material in the catalog is immediately selectable in
  the interior/exterior board picker, with its own cost per m².
- **Zero breakage**: every kitchen/closet project saved before this
  ships computes byte-identical totals and renders the same colors
  after this ships, with no manual data migration of saved projects.
- Deactivating a material never strands an existing project that
  already picked it (matches the existing hardware_role precedent:
  cost/name lookups stay available for inactive materials; only new
  selection is blocked).

## Non-goals

- No changes to the `finishes` upload/processing pipeline — reused as-is.
- No change to how exterior panel *texture/color* is picked
  (`exteriorTexture`) — already catalog-driven via `finishes`, already
  correct.
- No server-side price validation/recomputation (existing project-wide
  precedent: client-computed totals are trusted).
- No retroactive rewrite of already-saved `KitchenQuote.material_lines`
  — those stay frozen, exactly like every prior materials-pricing phase.
- No database-level uniqueness constraint for defaults — enforced in
  the controller only, consistent with `default_floor`/`default_wall`
  and `hardware_role`'s `is_default`.

## 1. Backend

### Countertops

Additive migration on `materials`: adds `finish_code` (nullable
string, no FK — same informational-only style as other `code` columns)
so a `Cubierta` material can optionally point at a `finishes.code` row
for its rendered color/texture.

`MaterialController@store`/`@update` accept `finish_code` as
`sometimes|nullable|string` — no existence check against `finishes`
(same laxness already accepted for `hardware_role`/`code`; a stale
reference degrades to the existing flat-color fallback, never an
error).

**Backfill, same migration**: insert one `Material` row per current
`COUNTERTOP_MODELS` entry:

| code | name | type | unit | cost_per_unit | finish_code |
|---|---|---|---|---|---|
| `postformado_blanco` | Postformado Blanco | Cubierta | m² | 420 | `postformado_blanco` |
| `postformado_arena` | Postformado Arena | Cubierta | m² | 460 | `postformado_arena` |
| ... (all 11, verbatim from `COUNTERTOP_MODELS`) | | | | | |

`code` is set to the exact same string as the array's old `id` —
this is what makes every already-saved `mod.options.countertopModel`
value resolve to the same row, unchanged.

### Board substrate

No schema change (`materials.code` already exists). Backfill migration:
for each currently-seeded `Tablero` row whose `name` exactly matches
one of the 10 legacy `BoardMaterial` union values, set its `code` to a
slug (`mdf_18mm`, `melamina_blanca_18mm`, etc.) if not already set. Rows
that don't match (including ones the admin added after seeding) are
left untouched — they already work via the existing `code ?? name`
cost-lookup fallback, just without a stable code yet.

## 2. Frontend — store

`useKitchenStore.loadMaterialCosts()` (no new network call) gains:

```ts
countertopOptions: { code: string; name: string; cost: number; finishCode?: string }[]
boardOptions: { code: string; name: string; cost: number }[]
```

built the same way `hardwareOptionsByRole` already is: filter
`materials` by `type === "Cubierta"` / `"Tablero"` and `active`,
skipping the existing per-hardware-role logic untouched.

## 3. Frontend — pickers & cost engine

- `CountertopModelPicker` (`ModuleInspector.tsx:410`) reads
  `countertopOptions` from the store instead of the `COUNTERTOP_MODELS`
  constant. Swatch color: look up `finishCode` (if any) against the
  already-loaded `finishes` list for `swatchColor`; no `finishCode` →
  existing flat-gray fallback swatch, same as an unset finish today.
- `COUNTERTOP_MODELS` and `getCountertopModel()` are deleted from
  `kitchenData.ts` once nothing references them (backend backfill made
  every old id resolve as a real catalog row, so nothing is lost).
- `resolveCountertopCost()` (`kitchenData.ts:346`) becomes a thin
  `materialCosts.get(o.countertopModel)` lookup, mirroring
  `resolveHardwareCost`'s shape — no `COUNTERTOP_COSTS`/model-array
  fallback needed since the backfill guarantees every legacy id has a
  matching row.
- Countertop 3D rendering (`KitchenAssemblyScene.tsx` `CountertopMesh`)
  keeps its existing `finishCode → finishes lookup → texture` logic
  unchanged; only the source of `finishCode` changes (from the deleted
  array to the material row looked up by `o.countertopModel`).
- Board picker (`GlobalMaterialsModal.tsx`, `BOARD_OPTIONS`) reads
  `boardOptions` from the store instead of `Object.keys(BOARD_COSTS)`.
- `ModuleOptions.boardMaterial` type widens from the closed
  `BoardMaterial` union to `string` (a material code or, for an
  unmigrated legacy value, still a bare name) — identical treatment to
  what `drawerSystem` already got in the hardware-role phase.
- `BOARD_COSTS` stays as a fallback constant (not deleted) for any
  material whose `name` still matches one of its 10 keys and has no
  catalog override — same "leave working fallback in place" precedent
  used for `HARDWARE_COSTS`'s unrelated dead entries.

## 4. Compatibility — Zustand persist migrate, bumped one version

Both entry points that already run the hardware-role
`normalizeLegacyHardwareOptions` migration (`persist`'s `migrate`
function, and `loadProject()`) gain one more mapping step, following
the exact same shape:

```ts
const LEGACY_BOARD_MATERIAL_TO_CODE: Record<string, string> = {
  "MDF 18mm": "mdf_18mm",
  "Melamina blanca 18mm": "melamina_blanca_18mm",
  // ... one entry per seeded Tablero row that got a code in the backend backfill
};

function normalizeLegacyBoardMaterial(opt: ModuleOptions): ModuleOptions {
  return { ...opt, boardMaterial: LEGACY_BOARD_MATERIAL_TO_CODE[opt.boardMaterial] ?? opt.boardMaterial };
}
```

A name with no entry in the map (never seeded, or an admin-added board
that never got a code) passes through unchanged — it keeps resolving
via the existing `materialCosts.get(name)` fallback, exactly as today.

`countertopModel` needs **no** compatibility mapping — the backend
backfill guarantees every legacy id is now a real `materials.code`, so
old and new values are already the same string.

## 5. Testing

`npx tsc --noEmit` (frontend convention, no unit-test runner).
`php artisan test`: new coverage on `MaterialController` for
`finish_code` accept/persist (no existence check, so any string
saves), and confirming the migration backfill produces exactly 11
`Cubierta` rows with the right codes/costs.

Manual verification (required before shipping, per explicit
backward-compatibility requirement):

1. Open a kitchen/closet project saved **before** this change and
   confirm its quoted total and rendered colors are unchanged.
2. In "Prueba Materiales": confirm the existing "Kober Yule" `Cubierta`
   material appears in the countertop picker, select it on a module,
   confirm it shows in the quote breakdown with correct name/cost.
3. Attach a `finishes` photo/color to it and confirm it renders in the
   3D view.
4. Repeat 2-3 for a new `Tablero` material as interior/exterior board.
5. Deactivate the Kober Yule material and confirm: it disappears from
   the picker for new selections, but a project that already selected
   it keeps quoting the same price (matches the existing
   deactivated-material precedent for hardware).

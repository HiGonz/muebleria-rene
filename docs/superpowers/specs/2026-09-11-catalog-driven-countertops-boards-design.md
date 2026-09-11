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
for its rendered color/texture. No backfill, no data migration.

`MaterialController@store`/`@update` accept `finish_code` as
`sometimes|nullable|string` — no existence check against `finishes`
(same laxness already accepted for `hardware_role`/`code`; a stale
reference degrades to the existing flat-color fallback, never an
error).

**Revised, lower-risk than originally drafted**: `COUNTERTOP_MODELS`
(the 11 hardcoded entries) is left completely untouched — no backfill
into `materials`, no id migration. Reason found during implementation
planning: `getCountertopModel()` isn't only read by the picker — it's
called from 6 places, including live 3D rendering
(`KitchenAssemblyScene.tsx`, `ModulePreview3D.tsx` ×4) to resolve a
countertop's color/texture. Migrating the static array into the
database and deleting it would mean every one of those call sites'
correctness now depends on the migration backfill being byte-perfect.
Instead, catalog `Cubierta` materials become **additional** options
alongside the static 11 — see Section 3. This still fully satisfies
the goal (a new `Cubierta` material is immediately selectable and
quoted) with zero risk to any already-saved project, since the code
path an old project already uses is never touched.

### Board substrate

**Also revised, lower-risk**: no schema change and no migration at
all. `materials.code` already exists but isn't needed for this part —
board substrate selection is fixed by removing an unnecessary
*frontend* restriction (Section 3), not by adding backend
infrastructure.

## 2. Frontend — store

`useKitchenStore.loadMaterialCosts()` (no new network call) gains, built
in the same loop as `hardwareOptionsByRole` (filtered by `type` and
`active`, skipping everything already there):

```ts
countertopOptions: { code: string; name: string; cost: number; finishCode?: string }[] // type === "Cubierta"
boardOptions: { name: string; cost: number }[]                                          // type === "Tablero"
```

`countertopOptions`'s `code` is `m.code ?? m.name` — the exact same
value that ends up stored in `mod.options.countertopModel` when this
material is picked, matching the `hingeMaterial`/`drawerSystem`
convention already used for hardware. `boardOptions` doesn't need a
`code` field at all (see Section 3 — board substrate is keyed by name,
unchanged from today).

## 3. Frontend — pickers & cost engine

### Countertops (additive — nothing existing is touched)

- `getCountertopModel(id, catalogOptions?)` (`kitchenData.ts:274`)
  gains an optional second parameter. It checks the static
  `COUNTERTOP_MODELS` array first, exactly as today (zero change for
  every id that already resolves there); only when that misses does it
  look up `id` in the passed-in `catalogOptions` list and synthesize a
  `CountertopModel`-shaped object (`color` from the matching
  `finishes` row's `swatchColor` if `finishCode` is set, else a neutral
  gray placeholder; `material` a harmless constant — confirmed unread
  by every caller that passes `catalogOptions`, see below).
- The 5 rendering call sites that resolve a countertop's texture
  (`KitchenAssemblyScene.tsx:894`, `ModulePreview3D.tsx` ×4) start
  passing `useKitchenStore.getState().countertopOptions` as the second
  argument, so a catalog-selected countertop's `finishCode` resolves
  the same way a static model's already does. `useKitchenStore.ts`'s
  own internal call (`applyCountertopToAll`) is deliberately **not**
  changed — it only reads `.material` for a cosmetic label fallback,
  and passing no `catalogOptions` there means it keeps returning
  `undefined` for a catalog id, so the existing `model?.material ?? m.options.countertopMaterial`
  fallback keeps the module's current value, which is the correct
  behavior.
- `resolveCountertopCost()` (`kitchenData.ts:346`) gains
  `materialCosts`/`hardwareCatalog` parameters (both already threaded
  through `calculateKitchenMaterials`, its only caller). It still
  tries the static model first (unchanged); if that misses, it reads
  `materialCosts.get(o.countertopModel)` for the cost and
  `hardwareCatalog.nameByCode.get(o.countertopModel) ?? o.countertopModel`
  for the label — reusing infrastructure `loadMaterialCosts()` already
  populates for every material, no new lookup structure needed.
- `CountertopModelPicker` (defined once in `ModuleInspector.tsx:410`,
  duplicated in `GlobalMaterialsModal.tsx:20`) renders a new shared
  helper, `mergeCountertopModels(catalogOptions, finishes)`
  (`kitchenData.ts`, new export next to `getCountertopModel`), which
  returns `[...COUNTERTOP_MODELS, ...catalogOptions mapped to
  CountertopModel shape]` — same swatch-color resolution as above.
- `COUNTERTOP_MODELS` and `COUNTERTOP_COSTS` are **not** deleted or
  modified — every existing project keeps resolving through
  byte-identical code.

### Board substrate (no schema/type-value change — a restriction removed)

- `materials/page.tsx`'s `handleSetDefault` currently refuses to set
  `default_floor`/`default_wall` unless `material.name in BOARD_COSTS`
  (one of the 10 legacy names) — this client-side check is removed
  (the backend's own `guardDefaultFlagsAgainstType`, requiring
  `type === "Tablero"`, is the real and sufficient guard). A `try/catch`
  around the call is added, matching the pattern already used by
  `handleToggle`/`handleDelete`/`handleSetHardwareDefault` in the same
  file (today it's the one handler without one).
- `ModuleOptions.boardMaterial`/`exteriorMaterial`
  (`types/kitchen.ts:393,398`) widen from the closed `BoardMaterial`
  union to `string`. Every read site is a plain display string or a
  pass-through value (confirmed: `KitchenSummary.tsx`,
  `KitchenReportPDF.tsx`, `ModuleCard.tsx`, `applyExteriorToAll/Band` —
  no `switch`/enum-dependent logic anywhere). `applyExteriorToAll`/
  `applyExteriorToBand`'s `material` parameter widens the same way; the
  two now-redundant `as BoardMaterial` casts in `buildNewModule`
  (`kitchenData.ts:1824-1825`) are removed.
- `BOARD_OPTIONS` (`ModuleInspector.tsx:433`,
  `GlobalMaterialsModal.tsx:12`) reads the new `boardOptions` store
  field instead of `Object.keys(BOARD_COSTS)`.
- Cost lookup needs **no changes at all** — `materialCosts.get(material) ?? BOARD_COSTS[material] ?? 180`
  (`kitchenData.ts:3059`) already checks the catalog map first, keyed
  by `code ?? name`; a new Tablero material's name already works as
  soon as it's selectable, which this section is what actually enables.
- `BOARD_COSTS` stays as-is (not deleted) — still the fallback for the
  10 legacy names with no catalog override, same precedent as
  `HARDWARE_COSTS`'s unrelated leftover entries.

## 4. Compatibility

**No Zustand persist version bump and no migration function is needed
for this phase.** Nothing about what's already stored in a saved
draft or project changes meaning: `countertopModel` values keep
resolving through the untouched static array; `boardMaterial`/
`exteriorMaterial` values are still the same plain strings they always
were, just declared as `string` instead of a closed union at the type
level — a compile-time-only change with no runtime effect on existing
data. This is a direct, safer consequence of Section 1's revised
approach (nothing moved to a new representation, so nothing needs
translating from an old one).

## 5. Testing

`npx tsc --noEmit` (frontend convention, no unit-test runner).
`php artisan test`: new coverage on `MaterialController` for
`finish_code` accept/persist (no existence check, so any string
saves).

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

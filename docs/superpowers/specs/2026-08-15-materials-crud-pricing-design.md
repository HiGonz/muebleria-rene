# Materials CRUD + Dynamic Kitchen Pricing — Design

## Problem

Kitchen board and hardware costs are hardcoded frontend constants
(`BOARD_COSTS`, `HARDWARE_COSTS` in `frontend/services/kitchenData.ts`) —
editing a price means a code change and a deploy. A backend `Material`
CRUD (model, controller, routes) already exists, built for the older
non-kitchen "Project" system, with real seed data whose names/prices
closely mirror the kitchen system's hardcoded values — but it was never
wired to kitchen pricing, and its frontend page is a non-functional
read-only shell (create/edit/toggle buttons with no handlers).

This is Phase 1 of a larger 4-phase effort (multi-door reuse for
`armario_alto_media_puerta`, pistons, per-category material defaults are
Phases 2-4, tracked separately). This phase's job: let an admin edit
material prices/categories and have kitchen pricing read them, without
touching the visual material *catalog* itself (which materials are
selectable in the 3D configurator) — that's explicitly out of scope, see
Non-goals.

## Goals

- An admin can create, edit, activate/deactivate, and (when safe) delete
  materials via a real UI, with a name, category, unit, and price.
- Editing a material's price changes kitchen quotes automatically — no
  code change, no deploy.
- Materials are categorized (at minimum: Tablero, Herraje, Acabado,
  Fijación, Cubierta, Pistón) so future phases (pistons, per-category
  defaults) have somewhere to look up a price by category.
- Zero breakage: every existing kitchen project, saved quote, and
  old-system `Project`/`Quote` row keeps working exactly as today, even
  if the materials table is empty or a specific material was never
  added.

## Current state (verified against the code)

- **Backend `materials` table** (`backend/database/migrations/2026_05_21_000100_create_business_tables.php:37-46`):
  `id, name, type (string, unconstrained), unit, cost_per_unit (decimal),
  stock (decimal), active (boolean), timestamps`. No CHECK constraint on
  `type` — free text, can take new category values with no migration.
- **11 seeded rows** (confirmed via `php artisan tinker`): 6 `Tablero`
  rows (MDF 15/18mm, Melamina blanca/nogal 18mm, Triplay 9/12mm), 3
  `Herraje` rows (Bisagra 35mm: 35, Corredera telescópica 450mm: 95,
  Jalador moderno: 60), 1 `Acabado` row (Canto PVC 0.4mm: 12), 1
  `Fijación` row (Tornillo confimát: 2.5). Several prices already match
  the frontend's hardcoded constants exactly (e.g. `MDF 18mm: 180` ↔
  `BOARD_COSTS["MDF 18mm"] ?? 180`; `Bisagra 35mm: 35` ↔ the inlined `35`
  at `kitchenData.ts:1938`).
- **`Material` model** (`backend/app/Models/Material.php`): plain
  Eloquent, `fillable: ['name','type','unit','cost_per_unit','stock','active']`,
  casts `active:boolean, cost_per_unit:float, stock:float`.
- **`MaterialController`** (`backend/app/Http/Controllers/MaterialController.php`):
  full `index/store/update/destroy` already implemented, standard
  `$request->validate()` per action, `sometimes` rules on update. No
  `show` action (not needed — the frontend list already returns full rows).
- **Route**: `Route::apiResource('materials', MaterialController::class)->except(['show'])`
  (`backend/routes/api.php:33`), inside the `auth:sanctum` group.
- **Frontend `listMaterials()`** (`frontend/services/api.ts:267-278`):
  already maps `cost_per_unit`→`cost`. No `createMaterial`/
  `updateMaterial`/`deleteMaterial` exist yet.
- **`frontend/app/materials/page.tsx`**: fetches and renders a table;
  "Nuevo material" (`:26`), "Editar"/"Toggle" (`:45`) buttons have no
  `onClick` at all.
- **`BoardMaterial`** union (`frontend/types/kitchen.ts:142-152`): 10
  fixed literal strings, e.g. `"MDF 18mm"`, `"Melamina roble 18mm"`.
  **`BOARD_COSTS`** (`kitchenData.ts:203-214`): `Record<BoardMaterial,
  number>`, consumed at `kitchenData.ts:2353` as
  `BOARD_COSTS[material] ?? 180`.
- **`HARDWARE_COSTS`** (`kitchenData.ts:333-345`): 11 keys
  (`bisagra_simple: 35, bisagra_amortiguada: 65, corredera_simple: 95,
  corredera_extraccion: 145, corredera_softclose: 130,
  jaladera_barra_acero: 85, jaladera_gota: 75, pata_metalica: 140,
  tornillo_confirmat: 2.5, canto_pvc_04: 12, canto_pvc_2mm: 18`).
  **Only one of these 11 is actually read**:
  `HARDWARE_COSTS.corredera_softclose` at `kitchenData.ts:1979`. Hinge
  cost is inlined instead of reading the other two hinge constants:
  `const hingeCost = o.drawerSystem === "Soft-close" ? 65 : 35;`
  (`kitchenData.ts:1938, 1951`) — the numbers match
  `bisagra_amortiguada`/`bisagra_simple` exactly, but nothing references
  those constants. This means most of `HARDWARE_COSTS` is currently dead
  — repricing it today would change nothing. Jaladera/pata/tornillo/canto
  costs are not found wired into `calculateKitchenMaterials`'s line-item
  emission at all in the current read (they may be priced as part of
  board-area/edge aggregation instead, or not priced per-unit yet) — this
  needs a direct re-check at implementation time before assuming which
  hardware costs are live today.
- **Single call site** for pricing: `useKitchenStore.ts:700`,
  `getMaterials: () => calculateKitchenMaterials(get().draft.modules)`,
  a derived Zustand getter with no caching. `KitchenSummary.tsx` calls
  `getMaterials()`; `KitchenReportPDF.tsx` only renders a pre-computed
  `summary` prop, it never calls pricing itself.
- **Backend pricing**: kitchen pricing is 100% client-computed and
  trusted — `KitchenProjectController::quote()` just persists whatever
  `subtotal_materials/labor_cost/profit_cost/total/material_lines` the
  frontend sends (`backend/app/Http/Controllers/KitchenProjectController.php:183-208`).
  The old "Project" system has its own separate, already-drifted backend
  pricing engine (`backend/app/Services/MaterialCalculatorService.php`) —
  untouched by this phase.

## Non-goals

- No change to which materials are *selectable* in the 3D configurator —
  `BoardMaterial`'s 10 literal values and the `SelectInput`/`TexturePicker`
  UI stay exactly as they are. An admin can reprice "MDF 18mm" but cannot
  add an 11th board material and have it appear as a pickable option —
  that requires also defining a 3D texture/appearance, which the codebase
  itself already flags as a distinct future concern (`kitchen.ts:155-157`:
  "a future ERP screen will let the shop add more").
- No backend-side price computation or price validation for kitchen
  quotes — pricing stays client-computed and client-trusted, exactly as
  today. This phase only changes where the *unit costs* come from.
- No change to the old "Project" system's `MaterialCalculatorService` or
  its separate (already-inconsistent) hardcoded cost table — out of
  scope, pre-existing drift, not this phase's problem to reconcile.
- No changes to `project_materials` (the old system's per-project
  material line-item join table) — kitchen pricing computes line items
  on the fly today and continues to; it has no persisted per-material
  join table and doesn't need one for this phase.
- Phases 2-4 (multi-door reuse, pistons, per-category material defaults)
  are separate specs, brainstormed after this one lands.

## 1. Data model: additive `code` column

Board materials already match cleanly by `name` — `BoardMaterial`'s 10
literal strings *are* what a `materials.name` row would read (e.g.
`"MDF 18mm"`). Hardware doesn't: `HARDWARE_COSTS` has 11 distinct
semantic SKUs, but the DB has 5 coarser rows with different names
("Jalador moderno" vs. two distinct `jaladera_*` frontend keys). Matching
hardware by display `name` would silently break the moment an admin
renames a row for clarity.

Add one nullable, unique `code` column to `materials`
(`backend/database/migrations/<new>_add_code_to_materials.php`,
`$table->string('code')->nullable()->unique()->after('name')`) — a
stable slug used only by the kitchen pricing lookup, independent of the
human-editable `name`. Backfill the migration with the 10
`BoardMaterial` names as `code` (board rows can use `name` as their own
`code` 1:1, since no renaming concern exists there — simplest to just
copy) and the 11 `HARDWARE_COSTS` keys as `code` for their corresponding
hardware rows, updating existing seed rows in place and inserting the
missing ones (the 11 hardware SKUs minus the ~3 already seeded need ~8
new rows; the 4 unseeded `BoardMaterial` values need 4 new rows) — each
new row's `cost_per_unit` seeded from the current hardcoded constant, so
the migration is the bridge, not a separate concern. `Material.php`
gains `code` in `$fillable`. `MaterialController`'s validation gains
`'code' => ['nullable','string','max:255','unique:materials,code']`
(with `Rule::unique(...)->ignore($material->id)` on update).

## 2. Pricing lookup: `materialCosts` threaded through, never replacing the fallback

`useKitchenStore` gains a `materialCosts: Map<string, number> | null`
field (`null` until loaded) and a `loadMaterialCosts()` action: fetches
`listMaterials()`, filters `active`, builds one `Map` keyed by `code ??
name` (falling back to `name` for any legacy/board row without a
`code`). `KitchenBuilder.tsx` calls `loadMaterialCosts()` once on mount,
alongside its existing project-load effect — fire-and-forget, no loading
gate on the builder UI (pricing simply uses hardcoded fallbacks until it
resolves, then re-renders once loaded, since `getMaterials()` reads live
Zustand state).

`getMaterials` becomes `() =>
calculateKitchenMaterials(get().draft.modules, get().materialCosts)`.
`calculateKitchenMaterials` gains a second parameter,
`materialCosts: Map<string, number> | null`. Every cost read becomes
`materialCosts?.get(code) ?? <existing hardcoded expression>` — e.g.
`kitchenData.ts:2353` becomes
`materialCosts?.get(material) ?? BOARD_COSTS[material] ?? 180`; the
inlined hinge cost becomes
`materialCosts?.get(o.drawerSystem === "Soft-close" ? "bisagra_amortiguada" : "bisagra_simple") ?? (o.drawerSystem === "Soft-close" ? 65 : 35)`.
This is purely additive at every call site — with `materialCosts` `null`
or a row missing, behavior is byte-identical to today.

The exact set of `HARDWARE_COSTS` keys currently wired into a real cost
line (vs. defined-but-unused) needs a direct re-check against
`kitchenData.ts` at implementation time (noted as unverified above) —
the implementation only needs to touch call sites that actually exist
today; it must not invent new pricing behavior for currently-unpriced
items as part of this phase.

## 3. Frontend CRUD

`services/api.ts` gains `createMaterial(input)`, `updateMaterial(id,
patch)`, `deleteMaterial(id)` — same request/response shape convention as
`createProject`, posting/patching the snake_case backend fields directly
(`name, type, code, unit, cost_per_unit, stock, active`).

`app/materials/page.tsx`'s three dead buttons get wired to a single
reusable inline form (a modal, not a dedicated `/materials/new` route —
5 flat fields, no wizard steps, so a full page navigation is more
ceremony than the data needs): "Nuevo material" opens it empty, "Editar"
opens it pre-filled, "Toggle" calls `updateMaterial(id, { active: !active
})` directly with no form. `type` becomes a `<select>` of the known
categories (Tablero, Herraje, Acabado, Fijación, Cubierta, Pistón) plus
free text, since the column has no DB constraint and later phases may add
categories without a migration. `code` is an optional field, shown but
not required (most future ad-hoc materials won't need one — only board/
hardware SKUs that the pricing engine actually looks up by code need it
set). "Eliminar" only enabled when nothing references the material —
since kitchen pricing never persists a `material_id` foreign key
(costs are computed on the fly, not joined), the only real FK to check is
the old system's `project_materials.material_id` (`nullOnDelete`, so
deletion is always DB-safe) — "safe to delete" here just means asking
for confirmation, not a hard guard.

## 4. Testing

`npx tsc --noEmit` plus reasoning, per this repo's established
convention (no frontend unit-test runner). Backend: this project doesn't
appear to run PHPUnit/Pest in this workflow either (no test invocation
seen in prior kitchen work) — verify at implementation time whether a
backend test suite exists and runs; if so, add coverage for the new
`code` validation/uniqueness on `MaterialController`. Manual/live
verification (reading actual computed prices via the store, not
browser screenshots) is appropriate here given real money-affecting
logic — matches how island-mode/cost logic was verified in earlier
sessions on this project (see `docs/superpowers/plans/2026-08-11-island-cabinets.md`
for the precedent), not full browser click-through testing.

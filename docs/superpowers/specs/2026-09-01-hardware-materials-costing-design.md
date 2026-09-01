# Hardware Materials Costing & Categorization — Design

## Problem

The Kitchen system's cost engine (`calculateKitchenMaterials`,
`frontend/services/kitchenData.ts:2105`) is the single source of the
"DESGLOSE DE MATERIALES" breakdown shown to the user. A prior phase
(`docs/superpowers/specs/2026-08-15-materials-crud-pricing-design.md`)
wired a handful of hardware cost lines — door hinges, drawer slides,
door piston, push-to-open — to the `materials` catalog via a
`materialCosts?.get(code) ?? HARDWARE_COSTS[code]` pattern, where `code`
is a hardcoded literal string baked into a `switch`/ternary in code.
But two problems remain unsolved:

1. **Several cost lines never consult the catalog at all.** Edge
   banding (`Canto`) reads a single flat constant, `EDGE_UNIT_COST = 12`
   (`kitchenData.ts:2729`), for every edge profile — even though
   `HARDWARE_COSTS.canto_pvc_04`/`canto_pvc_2mm` (`:417-418`) exist and
   are never read. Countertops, zócalo aluminio, lambrín, rod, mirror,
   backsplash, and accessory costs are 100% hardcoded constants with no
   catalog lookup whatsoever — out of scope here (visual materials, a
   separate future project — see Non-goals), but edge banding is a pure
   cost-only hardware line exactly like hinges/slides, and its price is
   simply broken today.

2. **No real categorization exists.** The `materials` table's only
   category column, `type`, is a coarse display badge — it is never
   used to decide *which* row is "the hinge" or "the slide." That
   decision is 100% hardcoded: `resolveDrawerSlideCode()`
   (`kitchenData.ts:434-441`) is a `switch` over the 5-value
   `DrawerSystem` union, and hinge cost is a binary ternary,
   `o.drawerSystem === "Soft-close" ? "bisagra_amortiguada" :
   "bisagra_simple"` (`:2491-2492`, `:2529-2530`), that also
   double-duties a drawer-slide field as the hinge's implicit
   selector. An admin can reprice an existing SKU by matching its
   `code`, but can never add a new hinge/slide/piston/push-to-open/edge
   SKU and have it become a selectable option — and can silently break
   pricing for an *existing* SKU by deactivating or deleting it, since
   nothing prevents that today: `MaterialController::destroy()`
   (`backend/app/Http/Controllers/MaterialController.php:74-79`) is an
   unguarded hard delete, and deactivating a material simply drops it
   out of the `materialCosts` map (`useKitchenStore.ts:1055`,
   `if (!m.active) continue;`), silently reverting its price to the
   stale hardcoded constant with no warning anywhere.

This design closes both gaps for **hardware-only cost items** (hinges,
drawer slides, piston, push-to-open, edge banding) — the pattern
already established by
`docs/superpowers/specs/2026-08-15-floor-wall-material-defaults-design.md`
for board defaults (a `hardware_role` + `is_default` pair, generalizing
that doc's `default_floor`/`default_wall`), extended with real
selectability, deactivation/deletion safety, and visible degraded-state
handling instead of silent fallback.

## Goals

- **Categorization**: a new `hardware_role` column on `materials`
  (`bisagra` | `corredera` | `piston` | `push_to_open` | `canto` |
  `null`) is the real, data-driven answer to "which materials feed
  this cost/selection slot" — replacing hardcoded `switch`/ternary
  dispatch for these five items.
- **Dynamic selection** for **bisagra** and **corredera**: an admin
  can add a new SKU under either role, and it appears as a selectable
  option in the module inspector — no code change, no deploy. (Piston,
  push-to-open, and canto stay single-SKU-per-role today, matching
  their current reality — see Non-goals.)
- **Bisagra decoupled from `drawerSystem`** (confirmed): hinge
  selection gets its own field and its own selector, independent of
  "Sistema de cajón."
- **No hardcoded fallback once a role has an active default.** A
  missing/misconfigured default is a visible warning in the quote
  breakdown, never a silently-substituted number.
- **Deactivation/deletion guard** (confirmed): a material cannot be
  deactivated or deleted while it is `is_default` for its
  `hardware_role`, or while it holds `default_floor`/`default_wall` —
  the admin must reassign the default first. This closes an existing
  gap for `default_floor`/`default_wall` too (today wide open), not
  just the new roles, since it's the same guard in the same
  controller.
- **Edge banding price fixed**: cost is read from the `canto` role's
  default material instead of the flat, profile-blind `$12/ml`
  constant.
- **Traceability**: new `KitchenQuote.material_lines` entries carry an
  optional `materialId`, informational only (no FK enforcement) — an
  old quote is unaffected if that material is later deleted.
- **Backward compatible**: every existing saved draft (local or
  server-persisted `KitchenProject`) keeps computing the same numbers
  it does today, via an in-memory compatibility mapping — no database
  migration of saved project data.
- **CRUD completeness**: fixes the existing `TYPE_OPTIONS` mismatch
  (`Corredera` and `Push to open` exist in seed data but aren't
  selectable in `MaterialFormModal`), and the list/delete/deactivate
  actions in `/materials` surface backend rejection errors instead of
  swallowing them.

## Current state (verified against the code)

- **`materials` schema** (`backend/database/migrations/2026_05_21_000100_create_business_tables.php:37-46`,
  plus `code` and `default_floor`/`default_wall` added later): `id,
  name, code(nullable unique), type, unit, cost_per_unit, stock,
  active, default_floor, default_wall`. `Material.php:9` fillable list
  matches exactly.
- **`MaterialController`** (`backend/app/Http/Controllers/MaterialController.php`):
  `store`/`update` already validate and guard `default_floor`/
  `default_wall` via `guardDefaultFlagsAgainstType()` (:83-91, requires
  `type === 'Tablero'`) and `clearOtherDefaults()` (:98-110, sweeps
  `UPDATE ... WHERE default_floor = true` inside `DB::transaction`,
  scoped to at most one row per flag). `destroy()` (:74-79) is an
  unguarded `$material->delete()`.
- **Seeded hardware rows** (`backend/database/seeders/MaterialSeeder.php`
  + `2026_08_15_120000_add_code_to_materials.php` +
  `2026_08_15_130000_add_piston_material.php` +
  `2026_08_23_120000_add_drawer_and_push_to_open_materials.php`):
  `bisagra_simple` ($35), `bisagra_amortiguada` ($65),
  `corredera_simple` ($95), `corredera_softclose` ($130),
  `corredera_self_close` ($110), `corredera_extraccion` ($145),
  `corredera_push_to_open` ($150), `piston_arriba` ($180),
  `push_to_open_puerta` ($60), `canto_pvc_04` ($12), `canto_pvc_2mm`
  ($18) — all `type: 'Herraje'` except the last two (`'Acabado'`),
  `corredera_self_close`/`corredera_push_to_open` (`'Corredera'`), and
  `push_to_open_puerta` (`'Push to open'`).
- **`DEFAULT_OPTIONS`** (`kitchenData.ts:163,165`):
  `drawerSystem: "Soft-close"`, `edgeProfile: "PVC 0.4mm"` — meaning a
  brand-new module's *effective* default hinge is **`bisagra_amortiguada`**
  (the ternary's `"Soft-close"` branch), its default corredera is
  **`corredera_softclose`** (`resolveDrawerSlideCode("Soft-close")`),
  and its edge cost always keys off `canto_pvc_04` in spirit (the
  literal `edgeProfile` value never actually varies — see next point).
- **`edgeProfile` has no reachable UI control.** The only component
  that renders a "Canto" dropdown, `ModuleForm.tsx:138-149`, is used
  exclusively by `ModuleEditor.tsx`, which is not imported anywhere in
  the app (confirmed by repo-wide search — only a stale comment
  references it in `KitchenBuilder.tsx:225`). The live, mounted
  inspector, `ModuleInspector.tsx`, has no edge-profile control at all.
  Every module's `edgeProfile` is therefore frozen at
  `DEFAULT_OPTIONS.edgeProfile` for the entire lifetime of the app.
- **`drawerSystem` has a reachable UI control**
  (`ModuleInspector.tsx:1039-1053`, "Sistema de cajón," rendered when
  `!isFixedDrawerHueco && opt.drawers > 0`) and is purely cost/label
  affecting — verified no geometry, dimension, or animation effect
  anywhere in `ModulePreview3D.tsx` or elsewhere.
- **`ModuleOptions`** (`frontend/types/kitchen.ts:327,331`):
  `drawerSystem: DrawerSystem` and `edgeProfile: EdgeProfile` are
  required, closed-union string fields directly on the module's
  options object — not references into any table.
- **`calculateKitchenMaterials`** signature
  (`kitchenData.ts:2105`): `(modules, materialCosts?, finishes?):
  { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary }`.
  `KitchenMaterialLine` (`frontend/types/kitchen.ts:644-656`) already
  has several optional fields (`category?`, `cutDetails?`,
  `cutLayout?`) — the established pattern for adding new
  informational fields without touching existing callers.
- **`useKitchenStore.loadMaterialCosts()`** (`:1048-1060`): the single
  existing fetch-all-materials call; builds `materialCosts: Map` and
  scans the same response for `default_floor`/`default_wall` rows.
  This phase extends the same call, no new network request.
- **Zustand persist versioning** (`useKitchenStore.ts:1108-1113`):
  `version: 4`, a `migrate` function already used twice to backfill
  new fields onto old persisted drafts (`autosaveEnabled`,
  `projectType`) — the established, correct hook for this phase's
  compatibility mapping.
- **`KitchenQuote.material_lines`** (`backend/app/Models/KitchenQuote.php:19,25`,
  cast `array`) is a frozen JSON snapshot with no `material_id`
  reference at all, written via `updateOrCreate` in
  `KitchenProjectController::quote()` (:358-376). No existing quote
  needs migrating — this phase only changes what *new* quotes store.
- **`/materials` CRUD** (`frontend/app/materials/page.tsx`,
  `MaterialFormModal.tsx`): `handleToggle`/`handleDelete`
  (`page.tsx:32-50`) call the API with no `try`/`catch` — any backend
  rejection is currently unhandled. `TYPE_OPTIONS`
  (`MaterialFormModal.tsx:9`) is `["Tablero", "Herraje", "Acabado",
  "Fijación", "Cubierta", "Pistón", "Otro"]` — missing `"Corredera"`
  and `"Push to open"`, both present in seed data.

## Non-goals

- Dynamic selection or CRUD-driven appearance of **visual** materials
  (board finish, countertop model) — a distinct 3D-asset problem,
  explicitly deferred to a separate future project (per prior
  agreement in this design conversation).
- Reviving the edge-profile per-module selector UI. It has no reachable
  control today (`ModuleForm`/`ModuleEditor` are dead code) — this
  phase only fixes the *price* to track the `canto` role's default
  material; offering multiple edge profiles to choose from is a
  separate, later request if ever needed.
- Multi-SKU pickers for **piston** and **push-to-open** — each stays a
  single default-driven material (matching today's single-SKU
  reality). An admin can still swap *which* SKU is the default via the
  same `is_default` mechanism used for bisagra/corredera; there's just
  no per-door choice among several.
- Server-side price validation/recomputation — explicitly declined
  earlier in this design conversation; the backend continues to trust
  client-computed totals, unchanged.
- A database-level uniqueness constraint for "one default per role" —
  enforced in the controller, consistent with the existing
  `default_floor`/`default_wall` precedent.
- Retroactively rewriting any already-saved `KitchenQuote.material_lines`
  — those stay exactly as frozen today; `materialId` is only populated
  on quotes computed after this ships.

## 1. Backend — `hardware_role` + `is_default` columns, scoped exclusivity, deactivation guard

Additive migration (mirrors `add_code_to_materials.php`'s pattern: add
columns, then backfill/seed): adds `hardware_role` (nullable string)
and `is_default` (`boolean, not null, default(false)`) to `materials`.
In the same migration, backfill the existing seeded hardware rows so
current pricing behavior is preserved exactly:

| code | hardware_role | is_default |
|---|---|---|
| `bisagra_amortiguada` | `bisagra` | `true` |
| `bisagra_simple` | `bisagra` | `false` |
| `corredera_softclose` | `corredera` | `true` |
| `corredera_simple`, `corredera_self_close`, `corredera_extraccion`, `corredera_push_to_open` | `corredera` | `false` |
| `piston_arriba` | `piston` | `true` |
| `push_to_open_puerta` | `push_to_open` | `true` |
| `canto_pvc_04` | `canto` | `true` |
| `canto_pvc_2mm` | `canto` | `false` |

(`is_default` picks the row matching today's *effective* default per
the "Current state" derivation above — `bisagra_amortiguada` and
`corredera_softclose`, not the alphabetically-first-seeded rows — so a
brand-new module costs exactly the same immediately after this ships.)

`MaterialController@store`/`@update` gain `hardware_role` (`sometimes
| nullable | string | in:bisagra,corredera,piston,push_to_open,canto`)
and `is_default` (`sometimes | boolean`). A new guard,
`guardHardwareRoleAgainstType()`, mirrors `guardDefaultFlagsAgainstType`'s
shape but inverted: `hardware_role` may only be set on a row whose
effective `type` is **not** `"Tablero"`.

`clearOtherDefaults()` is extended with a third, role-scoped sweep:
when a request sets `is_default: true` and the row's effective
`hardware_role` is non-null, every *other* row sharing that same
`hardware_role` is swept to `is_default = false` first (same
transaction, same "only sweep when setting true" logic already used
for `default_floor`/`default_wall` — clearing to `false` never
triggers a sweep). `is_default: true` on a row with no `hardware_role`
is rejected (nonsensical — nothing for it to be "the default" of).

**Deactivation/deletion guard** (new — closes an existing gap for
`default_floor`/`default_wall` too, not just the new roles, since it's
the same code path): `update()` rejects a request that would result in
`active === false` while the row still holds `is_default === true`
(for its role) or `default_floor`/`default_wall === true`, with a
`ValidationException` message: *"No se puede desactivar un material
predeterminado. Asigna otro material como predeterminado antes."*
`destroy()` gains the identical check before deleting, same message
adapted to "eliminar." An admin reassigns the default to a different
material first (which, via the exclusivity sweep, un-defaults the one
they're about to touch), then deactivates/deletes it — same two-step
flow the design conversation confirmed.

## 2. Frontend API + store — extend the existing fetch

`BackendMaterial`/`listMaterials()`/`MaterialInput`
(`frontend/services/api.ts`) gain `hardware_role` ↔ `hardwareRole`,
`is_default` ↔ `isDefault`, following the exact `cost_per_unit` ↔
`cost` naming convention already established.

`useKitchenStore.ts` gains, computed inside the existing
`loadMaterialCosts()` (no new network call):

```ts
hardwareOptionsByRole: Record<HardwareRole, { code: string; name: string }[]>
hardwareDefaultCodeByRole: Partial<Record<HardwareRole, string>>
```

built by grouping the same `listMaterials()` response by
`hardwareRole`, active rows only (matching the existing `if
(!m.active) continue` convention), recording each role's `is_default`
row's `code` into `hardwareDefaultCodeByRole`.

## 3. Cost engine — `kitchenData.ts`

A small helper replaces every hardcoded-fallback cost lookup for the
five roles:

```ts
function resolveHardwareCost(
  code: string | undefined,
  role: HardwareRole,
  materialCosts: Map<string, number> | null | undefined,
  defaultCodeByRole: Partial<Record<HardwareRole, string>>
): { cost: number; code: string } | { missing: true; role: HardwareRole } {
  const resolvedCode = code ?? defaultCodeByRole[role];
  const cost = resolvedCode ? materialCosts?.get(resolvedCode) : undefined;
  return cost !== undefined ? { cost, code: resolvedCode! } : { missing: true, role };
}
```

No `HARDWARE_COSTS[...]` fallback constant is consulted for these five
roles anymore — their entries (`bisagra_*`, `corredera_*`,
`piston_arriba`, `push_to_open_puerta`, `canto_pvc_*`) are removed from
that object. `HARDWARE_COSTS` itself is **not** deleted: it also holds
`jaladera_barra_acero`, `jaladera_gota`, `pata_metalica`,
`tornillo_confirmat` — already-unused, pre-existing dead entries
unrelated to any of these five roles (confirmed: no read site anywhere
in the file today) — out of scope for this change; leave them as-is
rather than removing unrelated dead code in this pass. A `missing`
result adds a `warnings: string[]` entry (new,
additive field on `calculateKitchenMaterials`'s return value, next to
existing `lines`/`summary`) instead of a cost line — Section 5 covers
how the UI surfaces this.

- **Bisagra**: new `ModuleOptions.hingeMaterial: string` field
  (material code, `DEFAULT_OPTIONS.hingeMaterial =
  "bisagra_amortiguada"`), read directly at the three call sites
  (`:2349, 2491-2492, 2529-2530`) via `resolveHardwareCost(o.hingeMaterial,
  "bisagra", ...)`. The `=== "Soft-close"` ternary is deleted.
- **Corredera**: `resolveDrawerSlideCode()` is deleted.
  `ModuleOptions.drawerSystem` changes type from the closed
  `DrawerSystem` union to `string` (a material code) — verified
  cost/label-only, no geometry/animation dependency (Current State).
  The "Sistema de cajón" selector's options come from
  `hardwareOptionsByRole.corredera` instead of the 5 hardcoded
  literals. Cost line (`:2558-2567`) becomes
  `resolveHardwareCost(o.drawerSystem, "corredera", ...)`.
- **Piston / push-to-open**: unchanged mechanically (still per-door
  `doorPistons`/`doorPushToOpen` booleans); cost lookup becomes
  `resolveHardwareCost(undefined, "piston" | "push_to_open", ...)` —
  no per-module code stored, always resolves to that role's current
  default (Non-goals: no per-door SKU choice).
- **Canto**: `EDGE_UNIT_COST` constant deleted. Cost line
  (`:2729-2738`) becomes `resolveHardwareCost(undefined, "canto",
  ...)`. The line label keeps using `o.edgeProfile` for its display
  text (`Canto ${profile}`) purely as a cosmetic grouping label — it
  is never used as a lookup key, since the field cannot actually vary
  today (Non-goals).

## 4. Compatibility layer — Zustand persist `migrate`, bumped to version 5

`useKitchenStore.ts`'s existing `migrate` function (`:1109-1113`)
gains a mapping step applied to every module in `state.draft.modules`,
following the exact pattern of its prior two field-backfills:

```ts
const LEGACY_DRAWER_SYSTEM_TO_CODE: Record<string, string> = {
  "Simple": "corredera_simple",
  "Self-close": "corredera_self_close",
  "Soft-close": "corredera_softclose",
  "Push to open": "corredera_push_to_open",
  "Extracción total": "corredera_extraccion",
};

function normalizeLegacyHardwareOptions(opt: ModuleOptions): ModuleOptions {
  const legacyDrawerSystem = opt.drawerSystem;
  const hingeMaterial = opt.hingeMaterial
    ?? (legacyDrawerSystem === "Soft-close" ? "bisagra_amortiguada" : "bisagra_simple");
  const drawerSystem = LEGACY_DRAWER_SYSTEM_TO_CODE[legacyDrawerSystem] ?? legacyDrawerSystem;
  return { ...opt, drawerSystem, hingeMaterial };
}
```

Applied unconditionally (idempotent — an already-migrated module's
`drawerSystem` is already a code, missing from the lookup table, so it
passes through unchanged; `hingeMaterial` short-circuits via `??` once
present). This reproduces exactly what each module's hinge cost equaled
*before* this change — a reopened old draft or quote doesn't silently
recompute to a different number. The same normalization must run
inside `loadProject(projectId, draft)` (`useKitchenStore.ts:338-339`)
— the other place a full `KitchenDraft` enters the store (loading a
saved `KitchenProject` from the server), which bypasses the Zustand
`persist` `migrate` path entirely since it's a direct `set()` call, not
a rehydration. Both call sites should share the same
`normalizeLegacyHardwareOptions` mapping over `draft.modules` rather
than duplicating the logic.

`KitchenQuote.material_lines` needs no migration — it's frozen numbers
with no `code`/`drawerSystem` reference at all (Current State), so
this compatibility layer only concerns *drafts still being edited*,
never past quotes.

## 5. Error handling — visible degraded state, not a silent number

`calculateKitchenMaterials`'s new `warnings: string[]` return field
(Section 3) is surfaced by the quote/breakdown UI as a visible banner
(e.g. "Falta un material predeterminado para: bisagra — configúralo en
Materiales") above the totals, and the quote's total is flagged
incomplete (a boolean alongside the existing summary, checked before
allowing "Cotizar" the way other required-field checks already gate
that action) rather than silently omitting the line or guessing a
number. This state should be unreachable in practice once the
deactivation guard (Section 1) ships — it only surfaces during the
migration backfill window or a future direct DB edit — but is real
defensive handling for exactly the "silent degradation" failure mode
identified in Current State.

## 6. CRUD completeness — `/materials`

- `MaterialFormModal.tsx`'s `TYPE_OPTIONS` gains `"Corredera"` and
  `"Push to open"`, fixing the existing seed-data/dropdown mismatch.
- A new "Rol de hardware" `<select>` (none | bisagra | corredera |
  piston | push_to_open | canto), enabled only when `type !==
  "Tablero"` — mirrors the backend guard.
- `/materials/page.tsx`'s table gains a "Rol" badge column, and,
  parallel to the existing "Predeterminado piso/pared" buttons, a
  "Predeterminado (<rol>)" action per row with a `hardware_role` set —
  reusing `handleSetDefault`'s exact call-then-reload shape,
  generalized to accept any role instead of being hardcoded to
  `BOARD_COSTS`/Tablero.
- `handleToggle`/`handleDelete` (currently no error handling at all)
  gain a `try`/`catch` around the API call, displaying the backend's
  validation message inline (e.g. a small error toast/banner) instead
  of silently doing nothing on a 422 rejection from Section 1's new
  guard.

## 7. Traceability — `material_lines` gains an optional `materialId`

`KitchenMaterialLine` (`frontend/types/kitchen.ts:644-656`) gains
`materialId?: number`, populated wherever a line is built from a
resolved hardware cost (`resolveHardwareCost`'s returned `code`,
looked up against the materials list already in the store for its
`id`). No FK, no backend schema change — `material_lines` stays a
plain JSON array; this is purely an informational field for future
traceability ("this quote used material X"), consistent with the
existing frozen-snapshot design (Non-goals: no rewriting past quotes).

## Testing

`npx tsc --noEmit` plus reasoning (frontend, this project's established
convention, no unit-test runner). `php artisan test` (backend) — new
`MaterialControllerTest` coverage: `hardware_role` rejected on a
`"Tablero"`-typed row; `is_default` exclusivity is scoped per role
(setting it on a `corredera` row doesn't unset a `bisagra` row's
default); deactivating or deleting a material that is `is_default`
(any role) or holds `default_floor`/`default_wall` is rejected with a
clear message; deactivating/deleting a non-default material still
succeeds unchanged. Manual verification: open an existing saved
kitchen project predating this change and confirm its quoted total is
byte-for-byte identical before and after; deactivate the `canto`
role's only active material and confirm the breakdown shows a visible
warning instead of silently reverting to `$12/ml`.

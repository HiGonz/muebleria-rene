# Catalog-Driven Countertops & Board Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Cubierta`-type material created in `/materials` (e.g. "Kober Yule") becomes immediately selectable as a countertop in a kitchen/closet project and shows up correctly in the quote, with an optional real photo/color via the existing `finishes` catalog; a `Tablero`-type material becomes selectable as interior/exterior board substrate the same way — with zero change to how any already-saved project computes its total or renders.

**Architecture:** Both gaps are closed additively, reusing infrastructure this codebase already has for the identical problem (`hardware_role`/`is_default` for bisagra/corredera, and the `finishes` photo-to-texture catalog). Countertops: catalog `Cubierta` materials become *extra* options layered on top of the existing hardcoded `COUNTERTOP_MODELS` array — that array is never modified or deleted, so every already-saved project's cost/render path is untouched byte-for-byte. Board substrate: the only real blocker was a client-side validation rule blocking any material whose name isn't one of 10 hardcoded strings from becoming the floor/wall default — removing it, plus widening two TypeScript field types from a closed union to `string`, is sufficient; the cost engine already reads the catalog first.

**Tech Stack:** Laravel (PHP) backend with Sanctum auth, Eloquent, PHPUnit (sqlite `:memory:` for tests); Next.js/React/TypeScript frontend, Zustand store, Three.js for 3D rendering. No frontend unit-test runner — this repo's convention is `npx tsc --noEmit` plus manual verification.

**Spec:** `docs/superpowers/specs/2026-09-11-catalog-driven-countertops-boards-design.md`

## Global Constraints

- Zero behavior change for any project saved before this ships — verified manually in Task 10, not just by type-checking.
- No new network requests — every frontend list this plan adds is built from data `loadMaterialCosts()`/`listFinishes()` already fetch.
- `COUNTERTOP_MODELS`, `COUNTERTOP_COSTS`, and `BOARD_COSTS` (all in `frontend/services/kitchenData.ts`) are never deleted or restructured in this plan — only added to/read from.
- No server-side price validation is added — the client-computed total stays authoritative, matching the rest of this codebase.

---

## Task 1: Backend — `finish_code` column on materials

**Files:**
- Create: `backend/database/migrations/2026_09_11_000100_add_finish_code_to_materials.php`
- Modify: `backend/app/Models/Material.php`
- Modify: `backend/app/Http/Controllers/MaterialController.php`
- Modify: `backend/tests/Feature/MaterialControllerTest.php`

**Interfaces:**
- Produces: a nullable `materials.finish_code` (string) column; `MaterialController@store`/`@update` accept a `finish_code` field (`sometimes|nullable|string|max:255`, no existence check against `finishes`); `Material::$fillable` includes `'finish_code'`.

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('materials', function (Blueprint $table) {
            $table->string('finish_code')->nullable()->after('is_default');
        });
    }

    public function down(): void
    {
        Schema::table('materials', function (Blueprint $table) {
            $table->dropColumn('finish_code');
        });
    }
};
```

Save as `backend/database/migrations/2026_09_11_000100_add_finish_code_to_materials.php`.

- [ ] **Step 2: Add `finish_code` to the model's fillable list**

In `backend/app/Models/Material.php`, change:

```php
protected $fillable = ['name', 'code', 'type', 'unit', 'cost_per_unit', 'stock', 'active', 'default_floor', 'default_wall', 'hardware_role', 'is_default'];
```

to:

```php
protected $fillable = ['name', 'code', 'type', 'unit', 'cost_per_unit', 'stock', 'active', 'default_floor', 'default_wall', 'hardware_role', 'is_default', 'finish_code'];
```

- [ ] **Step 3: Write the failing tests**

In `backend/tests/Feature/MaterialControllerTest.php`, add (anywhere among the other test methods, e.g. right after `test_type_change_to_tablero_clears_hardware_role_and_is_default`):

```php
    public function test_store_accepts_finish_code_for_a_cubierta_material(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/materials', [
            'name' => 'Kober Yule',
            'type' => 'Cubierta',
            'unit' => 'm²',
            'cost_per_unit' => 2100,
            'stock' => 0,
            'active' => true,
            'finish_code' => 'kober_yule_photo',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('materials', ['name' => 'Kober Yule', 'finish_code' => 'kober_yule_photo']);
    }

    public function test_store_succeeds_with_finish_code_omitted(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/materials', [
            'name' => 'Postformado Genérico',
            'type' => 'Cubierta',
            'unit' => 'm²',
            'cost_per_unit' => 400,
            'stock' => 0,
            'active' => true,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('materials', ['name' => 'Postformado Genérico', 'finish_code' => null]);
    }

    public function test_update_can_clear_finish_code(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['type' => 'Cubierta', 'finish_code' => 'kober_yule_photo']);

        $response = $this->putJson("/api/materials/{$material->id}", [
            'finish_code' => null,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'finish_code' => null]);
    }
```

- [ ] **Step 4: Run the migration and the tests to verify they fail correctly first**

Run: `cd backend && php artisan migrate:fresh --env=testing --force` is not needed (PHPUnit uses `RefreshDatabase` against the sqlite `:memory:` DB and runs migrations itself). Just run the tests before Step 5:

Run: `cd backend && php artisan test --filter=MaterialControllerTest`
Expected: the 3 new tests FAIL (validation rejects `finish_code` as an unexpected field is fine either way in Laravel — the real failure is `assertDatabaseHas` not finding the `finish_code` column, since it doesn't exist yet) — confirms the tests actually exercise the new column before it exists.

- [ ] **Step 5: Add `finish_code` validation to the controller**

In `backend/app/Http/Controllers/MaterialController.php`, in `store()`, change:

```php
            'hardware_role' => ['sometimes', 'nullable', 'string', Rule::in(self::HARDWARE_ROLES)],
            'is_default' => ['sometimes', 'boolean'],
        ]);
        $this->guardDefaultFlagsAgainstType($validated, $validated['type']);
```

to:

```php
            'hardware_role' => ['sometimes', 'nullable', 'string', Rule::in(self::HARDWARE_ROLES)],
            'is_default' => ['sometimes', 'boolean'],
            'finish_code' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        $this->guardDefaultFlagsAgainstType($validated, $validated['type']);
```

And in `update()`, change:

```php
            'hardware_role' => ['sometimes', 'nullable', 'string', Rule::in(self::HARDWARE_ROLES)],
            'is_default' => ['sometimes', 'boolean'],
        ]);
        $effectiveType = $validated['type'] ?? $material->type;
```

to:

```php
            'hardware_role' => ['sometimes', 'nullable', 'string', Rule::in(self::HARDWARE_ROLES)],
            'is_default' => ['sometimes', 'boolean'],
            'finish_code' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        $effectiveType = $validated['type'] ?? $material->type;
```

No guard against `type` is needed for `finish_code` — unlike `hardware_role`/`default_floor`, an unused `finish_code` on the wrong type is inert (never read), matching the existing `code` field's laxness.

- [ ] **Step 6: Run the tests again to verify they pass**

Run: `cd backend && php artisan test --filter=MaterialControllerTest`
Expected: PASS — all tests in the file, including the 3 new ones and every pre-existing one (confirms no regression on `hardware_role`/`default_floor` guards).

- [ ] **Step 7: Commit**

```bash
git add backend/database/migrations/2026_09_11_000100_add_finish_code_to_materials.php backend/app/Models/Material.php backend/app/Http/Controllers/MaterialController.php backend/tests/Feature/MaterialControllerTest.php
git commit -m "Add finish_code column to materials for catalog-driven countertop color"
```

---

## Task 2: Frontend API plumbing + Cubierta finish picker in the Materials form

**Files:**
- Modify: `frontend/services/api.ts`
- Modify: `frontend/components/materials/MaterialFormModal.tsx`

**Interfaces:**
- Consumes: `listFinishes(): Promise<Finish[]>` and `type Finish` (already exported from `frontend/services/api.ts`, unchanged).
- Produces: `listMaterials()`'s return items and `MaterialInput` both gain `finishCode?: string | null`, consumed by Task 3 (`loadMaterialCosts`) and by `materials/page.tsx`'s existing `MaterialRow` type alias (which derives automatically from `listMaterials()`'s return type — no separate edit needed there).

- [ ] **Step 1: Add `finish_code`/`finishCode` to the API layer**

In `frontend/services/api.ts`, in the `BackendMaterial` interface, change:

```ts
interface BackendMaterial {
  id: number;
  name: string;
  code: string | null;
  type: string;
  unit: string;
  cost_per_unit: string | number;
  stock: string | number;
  active: boolean;
  default_floor: boolean;
  default_wall: boolean;
  hardware_role: HardwareRole | null;
  is_default: boolean;
}
```

to:

```ts
interface BackendMaterial {
  id: number;
  name: string;
  code: string | null;
  type: string;
  unit: string;
  cost_per_unit: string | number;
  stock: string | number;
  active: boolean;
  default_floor: boolean;
  default_wall: boolean;
  hardware_role: HardwareRole | null;
  is_default: boolean;
  finish_code: string | null;
}
```

In `listMaterials()`, change:

```ts
export async function listMaterials() {
  const materials = await http.get<BackendMaterial[]>("/materials");
  return materials.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    type: m.type,
    unit: m.unit,
    cost: Number(m.cost_per_unit),
    stock: Number(m.stock),
    active: m.active,
    defaultFloor: m.default_floor,
    defaultWall: m.default_wall,
    hardwareRole: m.hardware_role,
    isDefault: m.is_default,
  }));
}
```

to (adding `finishCode`):

```ts
export async function listMaterials() {
  const materials = await http.get<BackendMaterial[]>("/materials");
  return materials.map((m) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    type: m.type,
    unit: m.unit,
    cost: Number(m.cost_per_unit),
    stock: Number(m.stock),
    active: m.active,
    defaultFloor: m.default_floor,
    defaultWall: m.default_wall,
    hardwareRole: m.hardware_role,
    isDefault: m.is_default,
    finishCode: m.finish_code,
  }));
}
```

In `MaterialInput`, change:

```ts
export interface MaterialInput {
  name: string;
  code?: string | null;
  type: string;
  unit: string;
  cost: number;
  stock: number;
  active: boolean;
  defaultFloor?: boolean;
  defaultWall?: boolean;
  hardwareRole?: HardwareRole | null;
  isDefault?: boolean;
}
```

to:

```ts
export interface MaterialInput {
  name: string;
  code?: string | null;
  type: string;
  unit: string;
  cost: number;
  stock: number;
  active: boolean;
  defaultFloor?: boolean;
  defaultWall?: boolean;
  hardwareRole?: HardwareRole | null;
  isDefault?: boolean;
  finishCode?: string | null;
}
```

In `mapMaterial()`, change:

```ts
function mapMaterial(m: BackendMaterial) {
  return { id: m.id, name: m.name, code: m.code, type: m.type, unit: m.unit, cost: Number(m.cost_per_unit), stock: Number(m.stock), active: m.active, defaultFloor: m.default_floor, defaultWall: m.default_wall, hardwareRole: m.hardware_role, isDefault: m.is_default };
}
```

to:

```ts
function mapMaterial(m: BackendMaterial) {
  return { id: m.id, name: m.name, code: m.code, type: m.type, unit: m.unit, cost: Number(m.cost_per_unit), stock: Number(m.stock), active: m.active, defaultFloor: m.default_floor, defaultWall: m.default_wall, hardwareRole: m.hardware_role, isDefault: m.is_default, finishCode: m.finish_code };
}
```

In `createMaterial()`, change:

```ts
export async function createMaterial(input: MaterialInput) {
  const material = await http.post<BackendMaterial>("/materials", {
    name: input.name,
    code: input.code || null,
    type: input.type,
    unit: input.unit,
    cost_per_unit: input.cost,
    stock: input.stock,
    active: input.active,
    default_floor: input.defaultFloor,
    default_wall: input.defaultWall,
    hardware_role: input.hardwareRole,
    is_default: input.isDefault,
  });
  return mapMaterial(material);
}
```

to (adding `finish_code`):

```ts
export async function createMaterial(input: MaterialInput) {
  const material = await http.post<BackendMaterial>("/materials", {
    name: input.name,
    code: input.code || null,
    type: input.type,
    unit: input.unit,
    cost_per_unit: input.cost,
    stock: input.stock,
    active: input.active,
    default_floor: input.defaultFloor,
    default_wall: input.defaultWall,
    hardware_role: input.hardwareRole,
    is_default: input.isDefault,
    finish_code: input.finishCode ?? null,
  });
  return mapMaterial(material);
}
```

In `updateMaterial()`, change:

```ts
export async function updateMaterial(id: number, patch: Partial<MaterialInput>) {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.code !== undefined) body.code = patch.code || null;
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.unit !== undefined) body.unit = patch.unit;
  if (patch.cost !== undefined) body.cost_per_unit = patch.cost;
  if (patch.stock !== undefined) body.stock = patch.stock;
  if (patch.active !== undefined) body.active = patch.active;
  if (patch.defaultFloor !== undefined) body.default_floor = patch.defaultFloor;
  if (patch.defaultWall !== undefined) body.default_wall = patch.defaultWall;
  if (patch.hardwareRole !== undefined) body.hardware_role = patch.hardwareRole;
  if (patch.isDefault !== undefined) body.is_default = patch.isDefault;
  const material = await http.put<BackendMaterial>(`/materials/${id}`, body);
  return mapMaterial(material);
}
```

to (adding the `finishCode` branch):

```ts
export async function updateMaterial(id: number, patch: Partial<MaterialInput>) {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.code !== undefined) body.code = patch.code || null;
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.unit !== undefined) body.unit = patch.unit;
  if (patch.cost !== undefined) body.cost_per_unit = patch.cost;
  if (patch.stock !== undefined) body.stock = patch.stock;
  if (patch.active !== undefined) body.active = patch.active;
  if (patch.defaultFloor !== undefined) body.default_floor = patch.defaultFloor;
  if (patch.defaultWall !== undefined) body.default_wall = patch.defaultWall;
  if (patch.hardwareRole !== undefined) body.hardware_role = patch.hardwareRole;
  if (patch.isDefault !== undefined) body.is_default = patch.isDefault;
  if (patch.finishCode !== undefined) body.finish_code = patch.finishCode || null;
  const material = await http.put<BackendMaterial>(`/materials/${id}`, body);
  return mapMaterial(material);
}
```

- [ ] **Step 2: Run the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (this step only widens shapes additively; nothing yet consumes `finishCode`, so no downstream type errors).

- [ ] **Step 3: Add the finish picker to `MaterialFormModal.tsx`**

In `frontend/components/materials/MaterialFormModal.tsx`, change the imports:

```ts
import { createMaterial, updateMaterial, type MaterialInput } from "@/services/api";
import type { HardwareRole } from "@/types/kitchen";
```

to:

```ts
import { createMaterial, listFinishes, updateMaterial, type Finish, type MaterialInput } from "@/services/api";
import type { HardwareRole } from "@/types/kitchen";
import { useEffect } from "react";
```

(Note: `useState` is already imported from `"react"` at the top of the file — add `useEffect` to that same existing import instead of a separate line: change `import { useState } from "react";` to `import { useEffect, useState } from "react";`.)

Change the `EditableMaterial` interface:

```ts
interface EditableMaterial {
  id: number;
  name: string;
  code: string | null;
  type: string;
  unit: string;
  cost: number;
  stock: number;
  active: boolean;
  hardwareRole: HardwareRole | null;
}
```

to:

```ts
interface EditableMaterial {
  id: number;
  name: string;
  code: string | null;
  type: string;
  unit: string;
  cost: number;
  stock: number;
  active: boolean;
  hardwareRole: HardwareRole | null;
  finishCode: string | null;
}
```

Add state, right after the existing `hardwareRole` state line:

```ts
  const [hardwareRole, setHardwareRole] = useState<HardwareRole | "">(material?.hardwareRole ?? "");
```

becomes:

```ts
  const [hardwareRole, setHardwareRole] = useState<HardwareRole | "">(material?.hardwareRole ?? "");
  const [finishCode, setFinishCode] = useState(material?.finishCode ?? "");
  const [cubiertaFinishes, setCubiertaFinishes] = useState<Finish[]>([]);

  useEffect(() => {
    listFinishes()
      .then((all) => setCubiertaFinishes(all.filter((f) => f.active && (f.type === "cubierta" || f.type === "ambos"))))
      .catch(() => setCubiertaFinishes([]));
  }, []);
```

Change `handleSubmit`'s `input` construction:

```ts
    const input: MaterialInput = { name: name.trim(), code: code.trim() || null, type, unit: unit.trim(), cost: parsedCost, stock: parsedStock, active, hardwareRole: type === "Tablero" ? null : (hardwareRole || null) };
```

to:

```ts
    const input: MaterialInput = { name: name.trim(), code: code.trim() || null, type, unit: unit.trim(), cost: parsedCost, stock: parsedStock, active, hardwareRole: type === "Tablero" ? null : (hardwareRole || null), finishCode: type === "Cubierta" ? (finishCode || null) : null };
```

Add the picker UI right after the existing "Rol de hardware" `</div>` block (i.e. right after this closing tag, still inside the form's `space-y-4` container):

```tsx
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Rol de hardware</label>
            <select
              value={hardwareRole}
              onChange={(e) => setHardwareRole(e.target.value as HardwareRole | "")}
              disabled={type === "Tablero"}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white disabled:opacity-40"
            >
              {HARDWARE_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>)}
            </select>
            {type === "Tablero" && <p className="text-[11px] text-zinc-500">No disponible para materiales de tipo Tablero.</p>}
          </div>
```

becomes:

```tsx
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Rol de hardware</label>
            <select
              value={hardwareRole}
              onChange={(e) => setHardwareRole(e.target.value as HardwareRole | "")}
              disabled={type === "Tablero"}
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white disabled:opacity-40"
            >
              {HARDWARE_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>)}
            </select>
            {type === "Tablero" && <p className="text-[11px] text-zinc-500">No disponible para materiales de tipo Tablero.</p>}
          </div>
          {type === "Cubierta" && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Acabado (color/textura)</label>
              <select
                value={finishCode}
                onChange={(e) => setFinishCode(e.target.value)}
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white"
              >
                <option value="" className="bg-zinc-900">— Ninguno (color plano) —</option>
                {cubiertaFinishes.map((f) => <option key={f.code} value={f.code} className="bg-zinc-900">{f.name}</option>)}
              </select>
              <p className="text-[11px] text-zinc-500">Opcional — vincula una foto/color ya creada en Acabados para que se vea real en el modelador 3D.</p>
            </div>
          )}
```

- [ ] **Step 4: Run the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual check**

Run the frontend dev server (`npm run dev` in `frontend/`), open `/materials`, click "Nuevo material", set Categoría to "Cubierta" — confirm the new "Acabado (color/textura)" dropdown appears and lists any existing `/finishes` entries of type `cubierta`/`ambos`; switch Categoría to something else and confirm it disappears. Save a Cubierta material with an acabado selected, reopen it for editing, confirm the selection persisted.

- [ ] **Step 6: Commit**

```bash
git add frontend/services/api.ts frontend/components/materials/MaterialFormModal.tsx
git commit -m "Let a Cubierta material optionally reference a finish for its color/texture"
```

---

## Task 3: Store — `countertopOptions` and `boardOptions`

**Files:**
- Modify: `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `listMaterials()`'s items now carrying `finishCode` (Task 2).
- Produces: two new `KitchenStore` state fields, read by Tasks 4-6 and 8:
  - `countertopOptions: { code: string; name: string; cost: number; finishCode?: string }[]`
  - `boardOptions: { name: string; cost: number }[]`

- [ ] **Step 1: Add the two fields to the `KitchenStore` interface**

In `frontend/store/useKitchenStore.ts`, right after the existing `hardwareCatalog: HardwareCatalog | null;` line (part of the interface block that also declares `materialCosts`, `finishes`, `hardwareOptionsByRole`), add:

```ts
  // Active "Cubierta" materials, selectable as a countertop alongside the
  // static COUNTERTOP_MODELS array — see mergeCountertopModels in
  // kitchenData.ts. `code` is `material.code ?? material.name`, the same
  // value that ends up stored in a module's countertopModel field.
  countertopOptions: { code: string; name: string; cost: number; finishCode?: string }[];
  // Active "Tablero" materials, selectable as interior/exterior board
  // substrate (ModuleInspector.tsx/GlobalMaterialsModal.tsx's board
  // pickers). No `code` needed — board substrate is keyed by name, exactly
  // like today's BOARD_COSTS lookup.
  boardOptions: { name: string; cost: number }[];
```

- [ ] **Step 2: Initialize both fields in the store's initial state**

Change:

```ts
      hardwareOptionsByRole: { bisagra: [], corredera: [], piston: [], push_to_open: [], canto: [] },
      hardwareCatalog: null,
```

to:

```ts
      hardwareOptionsByRole: { bisagra: [], corredera: [], piston: [], push_to_open: [], canto: [] },
      hardwareCatalog: null,
      countertopOptions: [],
      boardOptions: [],
```

- [ ] **Step 3: Build both lists inside `loadMaterialCosts()`**

In the same function's `for (const m of materials)` loop, change:

```ts
          const nameByCode = new Map<string, string>();
          const idByCode = new Map<string, number>();
          for (const m of materials) {
            // Cost/name lookups stay populated even for a deactivated
            // material — an existing module stores its board/hardware pick
            // as a bare code (see ModuleOptions.hingeMaterial/drawerSystem/
            // boardMaterial), not "use whatever's active", so retiring a
            // material must not strand every module that already committed
            // to it without a price. Deactivating only removes it from the
            // sections below (picker options, floor/wall/role defaults) —
            // what a NEW pick can choose, never what an old one still costs.
            costs.set(m.code ?? m.name, m.cost);
            if (m.code) {
              nameByCode.set(m.code, m.name);
              idByCode.set(m.code, m.id);
            }
            if (!m.active) continue;
            if (m.defaultFloor) defaultFloorBoardMaterial = m.name;
            if (m.defaultWall) defaultWallBoardMaterial = m.name;
            if (m.hardwareRole && m.code) {
              hardwareOptionsByRole[m.hardwareRole].push({ code: m.code, name: m.name });
              if (m.isDefault) defaultCodeByRole[m.hardwareRole] = m.code;
            }
          }
          set({
            materialCosts: costs,
            defaultFloorBoardMaterial,
            defaultWallBoardMaterial,
            hardwareOptionsByRole,
            hardwareCatalog: { defaultCodeByRole, nameByCode, idByCode },
          });
```

to:

```ts
          const nameByCode = new Map<string, string>();
          const idByCode = new Map<string, number>();
          const countertopOptions: { code: string; name: string; cost: number; finishCode?: string }[] = [];
          const boardOptions: { name: string; cost: number }[] = [];
          for (const m of materials) {
            // Cost/name lookups stay populated even for a deactivated
            // material — an existing module stores its board/hardware pick
            // as a bare code (see ModuleOptions.hingeMaterial/drawerSystem/
            // boardMaterial), not "use whatever's active", so retiring a
            // material must not strand every module that already committed
            // to it without a price. Deactivating only removes it from the
            // sections below (picker options, floor/wall/role defaults) —
            // what a NEW pick can choose, never what an old one still costs.
            costs.set(m.code ?? m.name, m.cost);
            if (m.code) {
              nameByCode.set(m.code, m.name);
              idByCode.set(m.code, m.id);
            }
            if (!m.active) continue;
            if (m.defaultFloor) defaultFloorBoardMaterial = m.name;
            if (m.defaultWall) defaultWallBoardMaterial = m.name;
            if (m.hardwareRole && m.code) {
              hardwareOptionsByRole[m.hardwareRole].push({ code: m.code, name: m.name });
              if (m.isDefault) defaultCodeByRole[m.hardwareRole] = m.code;
            }
            if (m.type === "Cubierta") {
              countertopOptions.push({ code: m.code ?? m.name, name: m.name, cost: m.cost, finishCode: m.finishCode ?? undefined });
            }
            if (m.type === "Tablero") {
              boardOptions.push({ name: m.name, cost: m.cost });
            }
          }
          set({
            materialCosts: costs,
            defaultFloorBoardMaterial,
            defaultWallBoardMaterial,
            hardwareOptionsByRole,
            hardwareCatalog: { defaultCodeByRole, nameByCode, idByCode },
            countertopOptions,
            boardOptions,
          });
```

- [ ] **Step 4: Run the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual check**

In the browser dev console on any page that has already called `loadMaterialCosts()` (any kitchen/closet builder page), run `useKitchenStore.getState().countertopOptions` and `useKitchenStore.getState().boardOptions` — confirm they list the active Cubierta/Tablero materials from `/materials` with the right `cost`/`name`.

- [ ] **Step 6: Commit**

```bash
git add frontend/store/useKitchenStore.ts
git commit -m "Add countertopOptions/boardOptions to the kitchen store"
```

---

## Task 4: Cost engine — catalog countertops as extra options

**Files:**
- Modify: `frontend/services/kitchenData.ts`

**Interfaces:**
- Consumes: `KitchenStore.countertopOptions` shape from Task 3 (as a plain parameter — this file has no store dependency).
- Produces:
  - `getCountertopModel(id: string | undefined, catalogOptions?: { code: string; name: string; finishCode?: string }[]): CountertopModel | undefined` (signature change: new optional 2nd param, backward compatible with every existing 1-arg call).
  - `mergeCountertopModels(catalogOptions: { code: string; name: string; cost: number; finishCode?: string }[], finishes: { code: string; swatchColor: string }[]): CountertopModel[]` (new export), consumed by Task 5.
  - `resolveCountertopCost` gains two parameters (internal — not exported, but its two call sites inside this same file change).

- [ ] **Step 1: Extend `getCountertopModel`**

In `frontend/services/kitchenData.ts`, change:

```ts
export function getCountertopModel(id: string | undefined): CountertopModel | undefined {
  return COUNTERTOP_MODELS.find((m) => m.id === id);
}
```

to:

```ts
export function getCountertopModel(
  id: string | undefined,
  catalogOptions?: { code: string; name: string; finishCode?: string }[],
): CountertopModel | undefined {
  const stock = COUNTERTOP_MODELS.find((m) => m.id === id);
  if (stock) return stock;
  const fromCatalog = catalogOptions?.find((m) => m.code === id);
  if (!fromCatalog) return undefined;
  // material/color are placeholders never read by any caller that reaches
  // this branch (confirmed: every current getCountertopModel() consumer
  // only reads .finishCode from a catalog-sourced result) — pricePerM2
  // is likewise not read here, since cost for a catalog material comes
  // from resolveCountertopCost's own materialCosts lookup, not this
  // function.
  return { id: fromCatalog.code, label: fromCatalog.name, material: "Postformado", color: "#c9c9c9", pricePerM2: 0, finishCode: fromCatalog.finishCode };
}
```

- [ ] **Step 2: Add the `mergeCountertopModels` helper**

Right after the `getCountertopModel` function (still in `kitchenData.ts`), add:

```ts
// The picker's full option list: every static COUNTERTOP_MODELS entry,
// plus one synthesized entry per active catalog "Cubierta" material.
// Swatch color comes from the material's linked finish (if any) — same
// fallback gray as an uninitialized countertop everywhere else in the app.
export function mergeCountertopModels(
  catalogOptions: { code: string; name: string; cost: number; finishCode?: string }[],
  finishes: { code: string; swatchColor: string }[],
): CountertopModel[] {
  return [
    ...COUNTERTOP_MODELS,
    ...catalogOptions.map((o) => ({
      id: o.code,
      label: o.name,
      color: finishes.find((f) => f.code === o.finishCode)?.swatchColor ?? "#c9c9c9",
      pricePerM2: o.cost,
      finishCode: o.finishCode,
    })),
  ];
}
```

- [ ] **Step 3: Extend `resolveCountertopCost` to fall back to the catalog**

Change:

```ts
// A specific model's price takes over from the generic per-material rate —
// same idea as an exterior texture overriding a flat color, just for cost too.
function resolveCountertopCost(o: ModuleOptions): { label: string; cost: number } {
  const model = getCountertopModel(o.countertopModel);
  if (model) return { label: model.label, cost: model.pricePerM2 };
  return { label: o.countertopMaterial, cost: COUNTERTOP_COSTS[o.countertopMaterial] ?? 420 };
}
```

to:

```ts
// A specific model's price takes over from the generic per-material rate —
// same idea as an exterior texture overriding a flat color, just for cost too.
// A catalog "Cubierta" material (no entry in the static COUNTERTOP_MODELS
// array) is the second fallback, resolved the exact same way every other
// catalog-driven cost already is (materialCosts keyed by code ?? name).
function resolveCountertopCost(
  o: ModuleOptions,
  materialCosts?: Map<string, number> | null,
  hardwareCatalog?: HardwareCatalog | null,
): { label: string; cost: number } {
  const model = getCountertopModel(o.countertopModel);
  if (model) return { label: model.label, cost: model.pricePerM2 };
  if (o.countertopModel) {
    const catalogCost = materialCosts?.get(o.countertopModel);
    if (catalogCost !== undefined) {
      return { label: hardwareCatalog?.nameByCode.get(o.countertopModel) ?? o.countertopModel, cost: catalogCost };
    }
  }
  return { label: o.countertopMaterial, cost: COUNTERTOP_COSTS[o.countertopMaterial] ?? 420 };
}
```

- [ ] **Step 4: Update both call sites inside `calculateKitchenMaterials`**

Change (first call site, inside the wall-run branch):

```ts
      if (o.includesCountertop) {
        const { label, cost } = resolveCountertopCost(o);
        addCountertop(label, panelWidth / 100, cost, mod);
      }
```

to:

```ts
      if (o.includesCountertop) {
        const { label, cost } = resolveCountertopCost(o, materialCosts, hardwareCatalog);
        addCountertop(label, panelWidth / 100, cost, mod);
      }
```

Change (second call site, freestanding countertop branch):

```ts
    } else if (mod.category === "countertop") {
      const { label, cost } = resolveCountertopCost(o);
```

to:

```ts
    } else if (mod.category === "countertop") {
      const { label, cost } = resolveCountertopCost(o, materialCosts, hardwareCatalog);
```

(`materialCosts` and `hardwareCatalog` are already `calculateKitchenMaterials`'s own parameters, in scope at both call sites — no new plumbing needed.)

- [ ] **Step 5: Remove the now-redundant `as BoardMaterial` casts in `buildNewModule`**

Change:

```ts
  const boardDefault: Partial<ModuleOptions> =
    band === "floor" && floorBoardMaterial ? { boardMaterial: floorBoardMaterial as BoardMaterial }
    : band === "wall" && wallBoardMaterial ? { boardMaterial: wallBoardMaterial as BoardMaterial }
    : {};
```

to:

```ts
  const boardDefault: Partial<ModuleOptions> =
    band === "floor" && floorBoardMaterial ? { boardMaterial: floorBoardMaterial }
    : band === "wall" && wallBoardMaterial ? { boardMaterial: wallBoardMaterial }
    : {};
```

(This will only compile once Task 7 widens `ModuleOptions.boardMaterial` to `string` — if Task 7 hasn't landed yet when this task runs, leave the casts in place for now and do this specific edit as part of Task 7 instead. Note it there.)

- [ ] **Step 6: Run the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS. (If Step 5 was skipped because Task 7 hasn't run yet, the file still compiles with the casts left in place — `as BoardMaterial` on a `string` param remains valid.)

- [ ] **Step 7: Manual check**

In "Prueba Materiales" (or any test project), open the browser console and run:

```js
useKitchenStore.getState().draft.modules[0] // pick any module with includesCountertop
```

then manually set that module's `options.countertopModel` to one of your catalog Cubierta materials' `code` (or name, if it has no code) via the store, and confirm `useKitchenStore.getState().draft` recomputes a quote (via the Cotización tab) showing that material's name and cost — this exercises `resolveCountertopCost`'s new fallback branch before Task 5 wires up the actual picker UI.

- [ ] **Step 8: Commit**

```bash
git add frontend/services/kitchenData.ts
git commit -m "Resolve countertop cost/label from the materials catalog as a fallback"
```

---

## Task 5: Countertop pickers read the merged catalog

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx`
- Modify: `frontend/components/kitchen/GlobalMaterialsModal.tsx`

**Interfaces:**
- Consumes: `mergeCountertopModels` and `CountertopModel` from Task 4; `countertopOptions` from `useKitchenStore` (Task 3).

- [ ] **Step 1: `ModuleInspector.tsx` — import `mergeCountertopModels` instead of `COUNTERTOP_MODELS`**

Change:

```ts
import { BOARD_COSTS, COUNTERTOP_MODELS, PULL_OUT_ACCESSORY_LABELS, NICHE_ACCESSORY_MATCH, getCatalogEntry, ISLAND_ELIGIBLE_CATEGORIES, placementBandFor } from "@/services/kitchenData";
```

to:

```ts
import { BOARD_COSTS, mergeCountertopModels, PULL_OUT_ACCESSORY_LABELS, NICHE_ACCESSORY_MATCH, getCatalogEntry, ISLAND_ELIGIBLE_CATEGORIES, placementBandFor } from "@/services/kitchenData";
```

(`BOARD_COSTS` stays imported here for now — Task 8 removes it.)

- [ ] **Step 2: `ModuleInspector.tsx` — `CountertopModelPicker` reads the merged list**

Change:

```tsx
function CountertopModelPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {COUNTERTOP_MODELS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
            value === m.id ? "border-brass bg-brass/10" : "border-ivory/10 bg-ivory/3 hover:border-ivory/25"
          }`}
        >
          <span className="h-7 w-7 shrink-0 rounded-md border border-black/20" style={{ backgroundColor: m.color }} />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-medium text-ivory">{m.label}</span>
            <span className="block text-[10px] text-warmgray">${m.pricePerM2.toLocaleString("es-MX")}/m²</span>
          </span>
        </button>
      ))}
    </div>
  );
}
```

to:

```tsx
function CountertopModelPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const countertopOptions = useKitchenStore((s) => s.countertopOptions);
  const finishes = useKitchenStore((s) => s.finishes);
  const models = mergeCountertopModels(countertopOptions, finishes);
  return (
    <div className="grid grid-cols-2 gap-2">
      {models.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
            value === m.id ? "border-brass bg-brass/10" : "border-ivory/10 bg-ivory/3 hover:border-ivory/25"
          }`}
        >
          <span className="h-7 w-7 shrink-0 rounded-md border border-black/20" style={{ backgroundColor: m.color }} />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-medium text-ivory">{m.label}</span>
            <span className="block text-[10px] text-warmgray">${m.pricePerM2.toLocaleString("es-MX")}/m²</span>
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `ModuleInspector.tsx` — fix the `onChange` handler that only searched the static array**

This is a real bug fix, not cosmetic: today, picking a catalog-only model would silently do nothing. Change:

```tsx
              <FieldGroup label="Modelo">
                <CountertopModelPicker
                  value={opt.countertopModel}
                  onChange={(id) => {
                    const model = COUNTERTOP_MODELS.find((m) => m.id === id);
                    if (!model) return;
                    applyCountertopToAll(model.id, model.color);
                  }}
                />
```

to:

```tsx
              <FieldGroup label="Modelo">
                <CountertopModelPicker
                  value={opt.countertopModel}
                  onChange={(id) => {
                    const model = mergeCountertopModels(countertopOptions, finishes).find((m) => m.id === id);
                    if (!model) return;
                    applyCountertopToAll(model.id, model.color);
                  }}
                />
```

This `onChange` callback lives inside the main `ModuleInspector` component function, which already calls `useKitchenStore()` once near the top for other fields — add `countertopOptions` and `finishes` to that existing destructure:

```ts
  const {
    draft, getEditingModule, updateModule, setEditingModule, removeModule, duplicateModule, rotateModule, toggleModuleLock,
    applyExteriorToAll, applyExteriorToBand, applyHardwareToAll, applyCountertopToAll, applyZocaloMaterialToAll, placeAccessoryInNiche,
    setIslandModeManual, updateSharedMaletero, hardwareOptionsByRole,
  } = useKitchenStore();
```

becomes:

```ts
  const {
    draft, getEditingModule, updateModule, setEditingModule, removeModule, duplicateModule, rotateModule, toggleModuleLock,
    applyExteriorToAll, applyExteriorToBand, applyHardwareToAll, applyCountertopToAll, applyZocaloMaterialToAll, placeAccessoryInNiche,
    setIslandModeManual, updateSharedMaletero, hardwareOptionsByRole, countertopOptions, finishes,
  } = useKitchenStore();
```

- [ ] **Step 4: `GlobalMaterialsModal.tsx` — same treatment**

Change the import (keeping `COUNTERTOP_MODELS` — it's still needed below for the component's initial default state — and adding `mergeCountertopModels`):

```ts
import { BOARD_COSTS, COUNTERTOP_MODELS } from "@/services/kitchenData";
```

to:

```ts
import { BOARD_COSTS, COUNTERTOP_MODELS, mergeCountertopModels } from "@/services/kitchenData";
```

Change the local `CountertopModelPicker`:

```tsx
function CountertopModelPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {COUNTERTOP_MODELS.map((m) => (
```

to:

```tsx
function CountertopModelPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const countertopOptions = useKitchenStore((s) => s.countertopOptions);
  const finishes = useKitchenStore((s) => s.finishes);
  const models = mergeCountertopModels(countertopOptions, finishes);
  return (
    <div className="grid grid-cols-2 gap-2">
      {models.map((m) => (
```

(the rest of the `.map()` body is unchanged — only its source array changes; close the added `const models = ...` scope the same way Task 5 Step 2 did).

The component's local state initializer is unchanged — it still uses the static array's first entry as the initial default, exactly as today:

```tsx
  const [countertopModelId, setCountertopModelId] = useState(COUNTERTOP_MODELS[0].id);
  const [countertopColor, setCountertopColor] = useState(COUNTERTOP_MODELS[0].color);
```

Change the `onChange` handler:

```tsx
              <CountertopModelPicker
                value={countertopModelId}
                onChange={(id) => {
                  setCountertopModelId(id);
                  const model = COUNTERTOP_MODELS.find((m) => m.id === id);
                  if (model) setCountertopColor(model.color);
                }}
              />
```

to:

```tsx
              <CountertopModelPicker
                value={countertopModelId}
                onChange={(id) => {
                  setCountertopModelId(id);
                  const model = mergeCountertopModels(useKitchenStore.getState().countertopOptions, useKitchenStore.getState().finishes).find((m) => m.id === id);
                  if (model) setCountertopColor(model.color);
                }}
              />
```

(`useKitchenStore.getState()` here — not the `useKitchenStore()` hook — because this `onChange` handler is a plain callback in the parent `GlobalMaterialsModal` component, which doesn't otherwise need to re-render on `countertopOptions` changes; a one-off read is enough and avoids adding an unused reactive subscription to a component that already destructures several store actions at its top.)

- [ ] **Step 5: Run the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual check**

In "Prueba Materiales", open a module with a countertop (or the "Materiales globales" panel), confirm the Cubierta materials created in Task 2 (e.g. "Kober Yule") now appear as swatches in the "Modelo" picker alongside the original 11, that clicking one actually applies it (this was the bug fixed in Step 3), and that the quote breakdown shows it with the right name/cost (Task 4's plumbing).

- [ ] **Step 7: Commit**

```bash
git add frontend/components/kitchen/ModuleInspector.tsx frontend/components/kitchen/GlobalMaterialsModal.tsx
git commit -m "Countertop pickers show catalog Cubierta materials alongside the built-in models"
```

---

## Task 6: Countertop 3D rendering resolves catalog materials' color

**Files:**
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx`
- Modify: `frontend/components/3d/ModulePreview3D.tsx`

**Interfaces:**
- Consumes: `getCountertopModel`'s extended signature from Task 4; `useKitchenStore.getState().countertopOptions` (Task 3, read non-reactively via the vanilla store API since these are per-module 3D mesh helpers, not necessarily always top-level components).

- [ ] **Step 1: `KitchenAssemblyScene.tsx`**

Change:

```ts
  const ctModel = getCountertopModel(mod.options.countertopModel);
```

to:

```ts
  const ctModel = getCountertopModel(mod.options.countertopModel, useKitchenStore.getState().countertopOptions);
```

(`useKitchenStore` is already imported in this file.)

- [ ] **Step 2: `ModulePreview3D.tsx` — add the missing import**

This file does not currently import `useKitchenStore`. Add it near the top with the other imports, e.g. right after:

```ts
import { cornerExtensionWidthCm, getCountertopModel } from "@/services/kitchenData";
```

add on the next line:

```ts
import { useKitchenStore } from "@/store/useKitchenStore";
```

- [ ] **Step 3: `ModulePreview3D.tsx` — update all 4 call sites**

There are 4 occurrences of the exact same line in this file (at the time of writing, near lines 1788, 2083, 2469, 2698 — search for the literal string to find them precisely, since line numbers shift as earlier tasks land):

```ts
  const ctModel = getCountertopModel(module.options.countertopModel);
```

Change **each of the 4** to:

```ts
  const ctModel = getCountertopModel(module.options.countertopModel, useKitchenStore.getState().countertopOptions);
```

- [ ] **Step 4: Run the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual check**

In "Prueba Materiales": create (or reuse) a `Cubierta` material with a `finish_code` pointing at a real uploaded finish (Task 2 + the existing `/finishes` page), select it as a module's countertop (Task 5), and confirm the 3D view (both the module inspector's small preview and the full assembly scene) renders the finish's real photo texture instead of the flat gray placeholder color.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/3d/KitchenAssemblyScene.tsx frontend/components/3d/ModulePreview3D.tsx
git commit -m "Render a catalog-selected countertop's linked finish in the 3D view"
```

---

## Task 7: Board substrate — widen types, remove the frontend default-guard

**Files:**
- Modify: `frontend/types/kitchen.ts`
- Modify: `frontend/store/useKitchenStore.ts`
- Modify: `frontend/services/kitchenData.ts`
- Modify: `frontend/app/materials/page.tsx`

**Interfaces:**
- Produces: `ModuleOptions.boardMaterial`/`exteriorMaterial` become `string` (were `BoardMaterial`); `applyExteriorToAll`/`applyExteriorToBand`'s `material` parameter becomes `string`. Consumed by Task 8's pickers.

- [ ] **Step 1: Widen the two `ModuleOptions` fields**

In `frontend/types/kitchen.ts`, change:

```ts
  // Materials (interior board — carcass: top/bottom/back/shelves)
  boardMaterial: BoardMaterial;
```

to:

```ts
  // Materials (interior board — carcass: top/bottom/back/shelves). A
  // material code/name from the catalog's "Tablero" materials — see
  // useKitchenStore.boardOptions. Was the closed BoardMaterial union;
  // widened so a shop can add a genuinely new board finish without a
  // code change (BOARD_COSTS/BoardMaterial still exist, as the fallback
  // for the 10 original names with no catalog override).
  boardMaterial: string;
```

and change:

```ts
  // Materials (exterior board — visible/finished faces: doors, drawer fronts, and
  // any side panel manually marked "exterior". Comes from a different sheet/pool.)
  exteriorMaterial: BoardMaterial;
```

to:

```ts
  // Materials (exterior board — visible/finished faces: doors, drawer fronts, and
  // any side panel manually marked "exterior". Comes from a different sheet/pool.)
  // Same widening as boardMaterial above, same reason.
  exteriorMaterial: string;
```

- [ ] **Step 2: Widen the two store action signatures**

In `frontend/store/useKitchenStore.ts`, change:

```ts
  applyExteriorToAll: (material: BoardMaterial, texture: string) => number;
```

to:

```ts
  applyExteriorToAll: (material: string, texture: string) => number;
```

and change:

```ts
  applyExteriorToBand: (band: "floor" | "wall", material: BoardMaterial, texture: string) => number;
```

to:

```ts
  applyExteriorToBand: (band: "floor" | "wall", material: string, texture: string) => number;
```

(Their implementations, at the `applyExteriorToAll: (material, texture) => {...}` and `applyExteriorToBand: (band, material, texture) => {...}` definitions further down, are untyped destructured parameters and need no change.)

Change the now-unnecessary cast:

```ts
    ...(s.defaultFloorBoardMaterial ? { boardMaterial: s.defaultFloorBoardMaterial as BoardMaterial } : {}),
```

to:

```ts
    ...(s.defaultFloorBoardMaterial ? { boardMaterial: s.defaultFloorBoardMaterial } : {}),
```

If, after this edit, `BoardMaterial` is no longer referenced anywhere else in this file, remove it from the top-of-file import list (change `BoardMaterial, ExteriorTextureId, HardwareCatalog, ...` to drop the leading `BoardMaterial, `) — check with a search for `BoardMaterial` in the file first; if any other usage remains, leave the import as-is.

- [ ] **Step 3: Remove the casts in `buildNewModule` (if Task 4 Step 5 didn't already do this)**

In `frontend/services/kitchenData.ts`, confirm:

```ts
  const boardDefault: Partial<ModuleOptions> =
    band === "floor" && floorBoardMaterial ? { boardMaterial: floorBoardMaterial }
    : band === "wall" && wallBoardMaterial ? { boardMaterial: wallBoardMaterial }
    : {};
```

is in place (no `as BoardMaterial`) — if Task 4 left the casts in place because this task hadn't landed yet, remove them now.

- [ ] **Step 4: Relax `materials/page.tsx`'s default-floor/wall guard**

Change:

```ts
  const handleSetDefault = async (material: MaterialRow, band: "defaultFloor" | "defaultWall") => {
    if (!(material.name in BOARD_COSTS)) {
      window.alert(`"${material.name}" no coincide con ningún tipo de tablero reconocido. Solo un material cuyo nombre coincida exactamente con un tipo de tablero existente (ej. "MDF 18mm", "Melamina blanca 15mm") puede ser el predeterminado.`);
      return;
    }
    await updateMaterial(material.id, { [band]: true });
    reload();
  };
```

to:

```ts
  const handleSetDefault = async (material: MaterialRow, band: "defaultFloor" | "defaultWall") => {
    setActionError(null);
    try {
      await updateMaterial(material.id, { [band]: true });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No fue posible marcar el material como predeterminado.");
    }
  };
```

The `BOARD_COSTS` import at the top of `frontend/app/materials/page.tsx` (`import { BOARD_COSTS } from "@/services/kitchenData";`) becomes unused after this edit — remove that import line entirely.

- [ ] **Step 5: Run the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual check**

In `/materials`, create a new `Tablero` material whose name does **not** match any of the 10 legacy names (e.g. "Melamina azul 18mm"), click "Predeterminado piso" — confirm it succeeds (no alert, the badge updates) where it would have been blocked before this change. Confirm the backend still rejects setting a default on a non-`Tablero` material (try it on a `Herraje` row) — the try/catch should surface the 422's message instead of failing silently.

- [ ] **Step 7: Commit**

```bash
git add frontend/types/kitchen.ts frontend/store/useKitchenStore.ts frontend/services/kitchenData.ts frontend/app/materials/page.tsx
git commit -m "Allow any active Tablero material to become the floor/wall board default"
```

---

## Task 8: Board substrate pickers read the catalog

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx`
- Modify: `frontend/components/kitchen/GlobalMaterialsModal.tsx`

**Interfaces:**
- Consumes: `boardOptions` from `useKitchenStore` (Task 3); `string`-typed `boardMaterial`/`exteriorMaterial` (Task 7).

- [ ] **Step 1: `ModuleInspector.tsx`**

Remove the top-level constant:

```ts
const BOARD_OPTIONS = (Object.keys(BOARD_COSTS) as BoardMaterial[]).map((k) => ({ value: k, label: k }));
```

(delete this line entirely). Remove `BOARD_COSTS` from the `kitchenData` import (it was already changed to `mergeCountertopModels` in Task 5 — confirm `BOARD_COSTS` isn't imported anymore, or remove it now if it still is).

At the picker's usage site, change:

```tsx
                        <SelectInput value={opt.exteriorMaterial} onChange={(v) => applyExteriorToBand(band, v, opt.exteriorTexture)} options={BOARD_OPTIONS} />
```

to:

```tsx
                        <SelectInput value={opt.exteriorMaterial} onChange={(v) => applyExteriorToBand(band, v, opt.exteriorTexture)} options={boardOptions.map((b) => ({ value: b.name, label: b.name }))} />
```

`boardOptions` comes from the same `useKitchenStore()` destructure already extended in Task 5 Step 3 — add it there too:

```ts
    setIslandModeManual, updateSharedMaletero, hardwareOptionsByRole, countertopOptions, finishes,
  } = useKitchenStore();
```

becomes:

```ts
    setIslandModeManual, updateSharedMaletero, hardwareOptionsByRole, countertopOptions, finishes, boardOptions,
  } = useKitchenStore();
```

- [ ] **Step 2: `GlobalMaterialsModal.tsx`**

Change:

```ts
const BOARD_OPTIONS = Object.keys(BOARD_COSTS) as BoardMaterial[];
```

Remove this line. Remove the `BoardMaterial` import if nothing else in the file needs it (check: `exteriorMaterial` state's type annotation, see Step 3 below, is being removed too) — change:

```ts
import type { BoardMaterial, HardwareFinish, ZocaloMaterial } from "@/types/kitchen";
```

to:

```ts
import type { HardwareFinish, ZocaloMaterial } from "@/types/kitchen";
```

Remove `BOARD_COSTS` from the `kitchenData` import (already holding `COUNTERTOP_MODELS, mergeCountertopModels` from Task 5 — drop `BOARD_COSTS`, keeping the other two).

- [ ] **Step 3: Source the exterior-material picker from the store**

Change:

```tsx
export function GlobalMaterialsModal({ onClose }: { onClose: () => void }) {
  const { applyExteriorToAll, applyExteriorToBand, applyCountertopToAll, applyHardwareToAll, applyZocaloMaterialToAll } = useKitchenStore();

  const [exteriorMaterial, setExteriorMaterial] = useState<BoardMaterial>("MDF 18mm");
```

to:

```tsx
export function GlobalMaterialsModal({ onClose }: { onClose: () => void }) {
  const { applyExteriorToAll, applyExteriorToBand, applyCountertopToAll, applyHardwareToAll, applyZocaloMaterialToAll, boardOptions } = useKitchenStore();

  const [exteriorMaterial, setExteriorMaterial] = useState<string>("MDF 18mm");
```

Change the `<SelectInput>` call:

```tsx
              <SelectInput value={exteriorMaterial} onChange={setExteriorMaterial} options={BOARD_OPTIONS} />
```

to:

```tsx
              <SelectInput value={exteriorMaterial} onChange={setExteriorMaterial} options={boardOptions.map((b) => b.name)} />
```

(This file's local `SelectInput` — unlike `ModuleInspector.tsx`'s — takes a plain `T[]` of strings, not `{value,label}[]`; confirm this by re-checking the `SelectInput` definition in this same file before making the change, since the two files' helper components of the same name have different prop shapes.)

- [ ] **Step 4: Run the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual check**

Add a new `Tablero` material in `/materials` with a distinctive name (e.g. "Melamina azul 18mm"), make it the floor default (Task 7's fix) or just leave it non-default, then open "Prueba Materiales" → "Materiales globales" and confirm it appears in the "Tablero exterior" dropdown, and in a module's own "Tablero exterior" section in the inspector. Apply it and confirm the quote breakdown's board cost updates to that material's price.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/kitchen/ModuleInspector.tsx frontend/components/kitchen/GlobalMaterialsModal.tsx
git commit -m "Board substrate pickers read active Tablero materials from the catalog"
```

---

## Task 9: End-to-end verification (no code changes)

**Files:** none — this task is a manual verification pass over everything landed in Tasks 1-8, specifically the backward-compatibility requirement called out as a Global Constraint.

- [ ] **Step 1: Full frontend type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS with zero errors, across the whole codebase (not just the files touched).

- [ ] **Step 2: Full backend test suite**

Run: `cd backend && php artisan test`
Expected: PASS, including every pre-existing test (not just `MaterialControllerTest`) — confirms nothing in Task 1's validation changes broke an unrelated controller/model test.

- [ ] **Step 3: Old-project regression check**

Open a kitchen or closet project that was saved **before** this plan's changes (any project created prior to today, or — if none exists — create one now, save it, note its total and note a screenshot/description of its rendered countertop and board colors, then proceed as if it were "before"). Reload it after all 8 tasks are deployed and confirm:
- The quoted total in the Cotización tab is unchanged to the peso.
- The countertop and every board surface render the same color/texture as before.

- [ ] **Step 4: New-material end-to-end check ("Prueba Materiales")**

In the "Prueba Materiales" project:
1. Confirm the "Kober Yule" `Cubierta` material (or a newly created one, if it needs re-creating) appears in the countertop picker.
2. Select it on a module with a countertop; confirm the quote breakdown shows "Kober Yule" with its catalog cost.
3. In `/finishes`, attach (or confirm already attached) a photo/color to it as a `cubierta` or `ambos` finish; link it via the material's "Acabado" field (Task 2); confirm the 3D view renders it.
4. Add a new `Tablero` material with a new name; confirm it's selectable as exterior board substrate and, once made a floor/wall default, drives a brand-new module's interior board too.

- [ ] **Step 5: Deactivation safety check**

Deactivate the Kober Yule material from `/materials`. Confirm:
- It disappears from the countertop picker for **new** selections.
- The project from Step 4 that already selected it still shows the same cost in its quote (matches the existing hardware-role deactivation precedent — cost/name lookups stay populated for inactive materials, only new picking is blocked).

- [ ] **Step 6: Final commit (if Step 3-5 surfaced any fix)**

If any of the manual checks above required a code fix, commit it now with a message describing what regression it closes. If everything passed as-is, this task needs no commit — it's verification-only.

---

## Self-Review Notes

- **Spec coverage**: every section of the revised design doc (finish_code column, additive countertop options, board-substrate guard removal, no compatibility migration needed) maps to a task above (1, 2-6, 7-8, and the "no migration" claim is directly exercised by Task 9's regression check).
- **Type consistency checked**: `countertopOptions`'s shape (`{code, name, cost, finishCode?}`) is identical across Task 3 (producer), Task 4 (`mergeCountertopModels`'s first parameter, `getCountertopModel`'s second parameter — a structurally-compatible subset), and Task 5 (consumer). `boardOptions`'s shape (`{name, cost}`) is identical across Task 3, Task 7 (mentioned), and Task 8 (consumer).
- **No placeholders**: every step above shows the literal before/after code; no step says "add validation" or "similar to Task N" without the actual diff.

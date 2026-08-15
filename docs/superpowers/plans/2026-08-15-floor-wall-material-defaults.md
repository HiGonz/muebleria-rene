# Floor/Wall Material Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin mark one active "Tablero" material as the default
board for floor cabinets and one as the default for wall cabinets, so
newly added kitchen modules pick up the right board automatically instead
of a single hardcoded material.

**Architecture:** Two new boolean flags on the existing `materials`
table, enforced exclusive per-flag in the controller (not a DB
constraint). The frontend's one existing materials fetch
(`loadMaterialCosts`) derives the two active defaults' names alongside
the prices it already reads. `buildNewModule` gains two optional
trailing parameters consumed only by the store's module-creation call
sites, reusing the existing `placementBandFor` floor/wall grouping to
decide which default applies.

**Tech Stack:** Laravel 11 (`backend/`), Next.js 16 + TypeScript
(`frontend/`, Zustand store). No frontend unit-test runner (verify via
`npx tsc --noEmit` + reasoning); backend has a real Feature-test suite
(`php artisan test`).

**Spec:** `docs/superpowers/specs/2026-08-15-floor-wall-material-defaults-design.md`

## Global Constraints

- Only `ModuleOptions.boardMaterial` is affected by this feature — no
  other option field (`exteriorMaterial`, `countertopMaterial`,
  `hardwareFinish`, etc.) changes its defaulting behavior.
- Floor vs. wall is exactly the existing `placementBandFor` grouping
  (lower/tower/corner/appliance → "floor", upper → "wall",
  accessory/countertop/opening → neither) — no new grouping is invented.
- Default-flag exclusivity is enforced in the Laravel controller inside a
  DB transaction, not a database constraint: setting `default_floor:
  true` (or `default_wall: true`) on one row unsets that same flag on
  every other row; a single row may legitimately hold both flags at once
  (they're independent).
- `default_floor`/`default_wall` may only be set `true` on a row whose
  `type` is exactly `"Tablero"` — validated server-side, rejected with a
  422 otherwise.
- Zero breakage: every existing `materials` row starts with both flags
  `false` (migration default, no backfill); until an admin explicitly
  sets one, every new kitchen module defaults exactly as it does today.
  No existing saved kitchen project is touched.
- `buildNewModule`'s two new parameters (`floorBoardMaterial?: string`,
  `wallBoardMaterial?: string`) are trailing and optional — every
  existing call site not touched by this plan (the dev-thumbnail-export
  page, `buildSampleKitchen`'s internal `makeModuleAdder`) must keep
  compiling and behaving byte-for-byte identically without modification.
- Never `git add -A`/`git add .` — only the exact files each task names.

---

## File Structure

- `backend/database/migrations/2026_08_15_140000_add_default_floor_wall_to_materials.php` — new additive migration.
- `backend/app/Models/Material.php` — fillable/casts for the two new columns.
- `backend/app/Http/Controllers/MaterialController.php` — validation + exclusivity logic.
- `backend/tests/Feature/MaterialControllerTest.php` — new coverage for the above.
- `frontend/services/api.ts` — `BackendMaterial`/`listMaterials`/`MaterialInput`/`mapMaterial`/`createMaterial`/`updateMaterial` extended with the two new fields.
- `frontend/services/kitchenData.ts` — `buildNewModule` gains two optional params and applies the per-band board default.
- `frontend/store/useKitchenStore.ts` — two new state fields, `loadMaterialCosts` derives them, `addModule`/`placeAccessoryInNiche` pass them through.
- `frontend/app/materials/page.tsx` — two new per-row actions on Tablero-type rows.

---

### Task 1: Backend — default flags, exclusivity, validation

**Files:**
- Create: `backend/database/migrations/2026_08_15_140000_add_default_floor_wall_to_materials.php`
- Modify: `backend/app/Models/Material.php`
- Modify: `backend/app/Http/Controllers/MaterialController.php`
- Test: `backend/tests/Feature/MaterialControllerTest.php`

**Interfaces:**
- Produces: `materials.default_floor: boolean`, `materials.default_wall: boolean` (both `not null default false`); `MaterialController@store`/`@update` accept `default_floor`/`default_wall` in the request body, enforcing single-row exclusivity per flag and rejecting either flag on a non-`"Tablero"` row with a 422.

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
            $table->boolean('default_floor')->default(false)->after('active');
            $table->boolean('default_wall')->default(false)->after('default_floor');
        });
    }

    public function down(): void
    {
        Schema::table('materials', function (Blueprint $table) {
            $table->dropColumn(['default_floor', 'default_wall']);
        });
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && php artisan migrate`
Expected: `add_default_floor_wall_to_materials` migration runs, no errors.

- [ ] **Step 3: Update the Material model**

Find (`backend/app/Models/Material.php`):

```php
    protected $fillable = ['name', 'code', 'type', 'unit', 'cost_per_unit', 'stock', 'active'];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'cost_per_unit' => 'float',
            'stock' => 'float',
        ];
    }
```

Replace with:

```php
    protected $fillable = ['name', 'code', 'type', 'unit', 'cost_per_unit', 'stock', 'active', 'default_floor', 'default_wall'];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'cost_per_unit' => 'float',
            'stock' => 'float',
            'default_floor' => 'boolean',
            'default_wall' => 'boolean',
        ];
    }
```

- [ ] **Step 4: Rewrite the controller's `store`/`update`, add the two private helpers**

Find (`backend/app/Http/Controllers/MaterialController.php`), the entire file body from the `use` statements through the closing brace:

```php
<?php

namespace App\Http\Controllers;

use App\Models\Material;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MaterialController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Material::query()->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $material = Material::create($request->validate([
            'name' => ['required', 'string'],
            'code' => ['nullable', 'string', 'max:255', 'unique:materials,code'],
            'type' => ['required', 'string'],
            'unit' => ['required', 'string'],
            'cost_per_unit' => ['required', 'numeric'],
            'stock' => ['required', 'numeric'],
            'active' => ['required', 'boolean'],
        ]));

        return response()->json($material, 201);
    }

    public function update(Request $request, Material $material): JsonResponse
    {
        $material->update($request->validate([
            'name' => ['sometimes', 'string'],
            'code' => ['sometimes', 'nullable', 'string', 'max:255', Rule::unique('materials', 'code')->ignore($material->id)],
            'type' => ['sometimes', 'string'],
            'unit' => ['sometimes', 'string'],
            'cost_per_unit' => ['sometimes', 'numeric'],
            'stock' => ['sometimes', 'numeric'],
            'active' => ['sometimes', 'boolean'],
        ]));

        return response()->json($material);
    }

    public function destroy(Material $material): JsonResponse
    {
        $material->delete();

        return response()->json([], 204);
    }
}
```

Replace with:

```php
<?php

namespace App\Http\Controllers;

use App\Models\Material;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MaterialController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Material::query()->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string'],
            'code' => ['nullable', 'string', 'max:255', 'unique:materials,code'],
            'type' => ['required', 'string'],
            'unit' => ['required', 'string'],
            'cost_per_unit' => ['required', 'numeric'],
            'stock' => ['required', 'numeric'],
            'active' => ['required', 'boolean'],
            'default_floor' => ['sometimes', 'boolean'],
            'default_wall' => ['sometimes', 'boolean'],
        ]);
        $this->guardDefaultFlagsAgainstType($validated, $validated['type']);

        $material = DB::transaction(function () use ($validated) {
            $this->clearOtherDefaults($validated, null);
            return Material::create($validated);
        });

        return response()->json($material, 201);
    }

    public function update(Request $request, Material $material): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string'],
            'code' => ['sometimes', 'nullable', 'string', 'max:255', Rule::unique('materials', 'code')->ignore($material->id)],
            'type' => ['sometimes', 'string'],
            'unit' => ['sometimes', 'string'],
            'cost_per_unit' => ['sometimes', 'numeric'],
            'stock' => ['sometimes', 'numeric'],
            'active' => ['sometimes', 'boolean'],
            'default_floor' => ['sometimes', 'boolean'],
            'default_wall' => ['sometimes', 'boolean'],
        ]);
        $this->guardDefaultFlagsAgainstType($validated, $validated['type'] ?? $material->type);

        DB::transaction(function () use ($validated, $material) {
            $this->clearOtherDefaults($validated, $material->id);
            $material->update($validated);
        });

        return response()->json($material->fresh());
    }

    public function destroy(Material $material): JsonResponse
    {
        $material->delete();

        return response()->json([], 204);
    }

    // A board default only ever makes sense on a "Tablero" row — a piston
    // or hardware row can never become the floor/wall board default.
    private function guardDefaultFlagsAgainstType(array $validated, string $effectiveType): void
    {
        $settingEitherFlag = ($validated['default_floor'] ?? false) || ($validated['default_wall'] ?? false);
        if ($settingEitherFlag && $effectiveType !== 'Tablero') {
            throw ValidationException::withMessages([
                'default_floor' => ['Solo un material de tipo "Tablero" puede ser el predeterminado de piso o pared.'],
            ]);
        }
    }

    // Exactly one row can hold default_floor=true at a time, and
    // separately exactly one row can hold default_wall=true at a time (a
    // single row may legitimately hold both). Only runs when the incoming
    // request actually sets a flag to true — clearing a flag to false
    // never needs to touch any other row.
    private function clearOtherDefaults(array $validated, ?int $exceptId): void
    {
        if (($validated['default_floor'] ?? false) === true) {
            Material::where('default_floor', true)
                ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
                ->update(['default_floor' => false]);
        }
        if (($validated['default_wall'] ?? false) === true) {
            Material::where('default_wall', true)
                ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
                ->update(['default_wall' => false]);
        }
    }
}
```

- [ ] **Step 5: Add test coverage**

Find (`backend/tests/Feature/MaterialControllerTest.php`), the final closing brace preceded by the last existing test method:

```php
        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['code']);
        $this->assertDatabaseHas('materials', ['id' => $other->id, 'code' => 'MEL-NEG-18']);
    }
}
```

Replace with:

```php
        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['code']);
        $this->assertDatabaseHas('materials', ['id' => $other->id, 'code' => 'MEL-NEG-18']);
    }

    public function test_setting_default_floor_unsets_it_on_another_material(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $current = $this->createMaterial(['name' => 'Melamina blanca 18mm', 'type' => 'Tablero', 'default_floor' => true]);
        $incoming = $this->createMaterial(['name' => 'Melamina roble 18mm', 'type' => 'Tablero']);

        $response = $this->putJson("/api/materials/{$incoming->id}", [
            'default_floor' => true,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', ['id' => $incoming->id, 'default_floor' => true]);
        $this->assertDatabaseHas('materials', ['id' => $current->id, 'default_floor' => false]);
    }

    public function test_default_floor_and_default_wall_are_independent_on_the_same_material(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['type' => 'Tablero']);

        $this->putJson("/api/materials/{$material->id}", ['default_floor' => true])->assertStatus(200);
        $response = $this->putJson("/api/materials/{$material->id}", ['default_wall' => true]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'default_floor' => true, 'default_wall' => true]);
    }

    public function test_setting_default_floor_fails_when_type_is_not_tablero(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['type' => 'Herraje']);

        $response = $this->putJson("/api/materials/{$material->id}", [
            'default_floor' => true,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['default_floor']);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'default_floor' => false]);
    }

    public function test_toggling_active_alone_does_not_touch_default_flags(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['type' => 'Tablero', 'default_floor' => true, 'active' => true]);

        $response = $this->putJson("/api/materials/{$material->id}", [
            'active' => false,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'active' => false, 'default_floor' => true]);
    }
}
```

- [ ] **Step 6: Run the full backend test suite**

Run: `php artisan test`
Expected: all tests pass, including the 4 new ones (32 total, up from 28).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_08_15_140000_add_default_floor_wall_to_materials.php app/Models/Material.php app/Http/Controllers/MaterialController.php tests/Feature/MaterialControllerTest.php
git commit -m "$(cat <<'EOF'
Add default_floor/default_wall flags to materials, Tablero-only, exclusive per flag

An admin can now mark one active Tablero row as the floor default and
one as the wall default. Exclusivity (at most one row per flag) is
enforced in the controller inside a transaction, not a DB constraint;
either flag is rejected on a non-Tablero row.
EOF
)"
```

---

### Task 2: Frontend API client — carry the two new fields

**Files:**
- Modify: `frontend/services/api.ts`

**Interfaces:**
- Consumes: `materials.default_floor`/`default_wall` (Task 1, backend response shape).
- Produces: `listMaterials()` rows gain `defaultFloor: boolean`, `defaultWall: boolean`; `MaterialInput` gains `defaultFloor?: boolean`, `defaultWall?: boolean`; `updateMaterial`/`createMaterial` forward them.

- [ ] **Step 1: Extend `BackendMaterial`**

Find:

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
}
```

Replace with:

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
}
```

- [ ] **Step 2: Extend `listMaterials()`**

Find:

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
  }));
}
```

Replace with:

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
  }));
}
```

- [ ] **Step 3: Extend `MaterialInput`**

Find:

```ts
export interface MaterialInput {
  name: string;
  code?: string | null;
  type: string;
  unit: string;
  cost: number;
  stock: number;
  active: boolean;
}
```

Replace with:

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
}
```

- [ ] **Step 4: Extend `mapMaterial`**

Find:

```ts
function mapMaterial(m: BackendMaterial) {
  return { id: m.id, name: m.name, code: m.code, type: m.type, unit: m.unit, cost: Number(m.cost_per_unit), stock: Number(m.stock), active: m.active };
}
```

Replace with:

```ts
function mapMaterial(m: BackendMaterial) {
  return { id: m.id, name: m.name, code: m.code, type: m.type, unit: m.unit, cost: Number(m.cost_per_unit), stock: Number(m.stock), active: m.active, defaultFloor: m.default_floor, defaultWall: m.default_wall };
}
```

- [ ] **Step 5: Extend `createMaterial`**

Find:

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
  });
  return mapMaterial(material);
}
```

Replace with:

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
  });
  return mapMaterial(material);
}
```

- [ ] **Step 6: Extend `updateMaterial`**

Find:

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
  const material = await http.put<BackendMaterial>(`/materials/${id}`, body);
  return mapMaterial(material);
}
```

Replace with:

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
  const material = await http.put<BackendMaterial>(`/materials/${id}`, body);
  return mapMaterial(material);
}
```

- [ ] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 8: Commit**

```bash
git add services/api.ts
git commit -m "$(cat <<'EOF'
Carry default_floor/default_wall through the materials API client

listMaterials/createMaterial/updateMaterial now read and write the two
new flags, following the same field-mapping convention already used
for cost_per_unit <-> cost.
EOF
)"
```

---

### Task 3: `buildNewModule` — per-band board default

**Files:**
- Modify: `frontend/services/kitchenData.ts:1509-1528`

**Interfaces:**
- Produces: `buildNewModule(type, x?, z?, rotation?, floorBoardMaterial?: string, wallBoardMaterial?: string): KitchenModule` — two new optional trailing parameters.
- Consumes: `placementBandFor` (already defined later in this same file as a hoisted `function` declaration, callable here regardless of source order).

- [ ] **Step 1: Add the two parameters and the per-band default**

Find:

```ts
export function buildNewModule(type: KitchenModuleType, x = 0, z = 0, rotation: KitchenModule["rotation"] = 0): KitchenModule {
  const entry = getCatalogEntry(type)!;
  // A countertop only makes sense at counter height: wall-mounted (aéreo)
  // pieces and floor-to-ceiling towers don't have a sensible "top" for one,
  // so they default it off — while still letting a catalog entry's own
  // explicit includesCountertop (spread after this) win either way.
  const smartDefaults: Partial<ModuleOptions> =
    entry.category === "upper" || entry.defaultDimensions.height > 120 ? { includesCountertop: false } : {};
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: entry.category,
    type,
    label: entry.label,
    dimensions: { ...entry.defaultDimensions },
    options: { ...DEFAULT_OPTIONS, ...smartDefaults, ...entry.defaultOptions },
    x,
    z,
    rotation,
  };
}
```

Replace with:

```ts
export function buildNewModule(type: KitchenModuleType, x = 0, z = 0, rotation: KitchenModule["rotation"] = 0, floorBoardMaterial?: string, wallBoardMaterial?: string): KitchenModule {
  const entry = getCatalogEntry(type)!;
  // A countertop only makes sense at counter height: wall-mounted (aéreo)
  // pieces and floor-to-ceiling towers don't have a sensible "top" for one,
  // so they default it off — while still letting a catalog entry's own
  // explicit includesCountertop (spread after this) win either way.
  const smartDefaults: Partial<ModuleOptions> =
    entry.category === "upper" || entry.defaultDimensions.height > 120 ? { includesCountertop: false } : {};
  // Admin-configured board default, per floor/wall band (see
  // placementBandFor below — the same "muebles bajos" vs "muebles altos"
  // grouping it already uses for placement). Placed after smartDefaults
  // but before entry.defaultOptions, so a catalog entry with its own
  // explicit boardMaterial (the 3 decorative accessory panels) still wins.
  const band = placementBandFor({ category: entry.category, type });
  const boardDefault: Partial<ModuleOptions> =
    band === "floor" && floorBoardMaterial ? { boardMaterial: floorBoardMaterial }
    : band === "wall" && wallBoardMaterial ? { boardMaterial: wallBoardMaterial }
    : {};
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: entry.category,
    type,
    label: entry.label,
    dimensions: { ...entry.defaultDimensions },
    options: { ...DEFAULT_OPTIONS, ...smartDefaults, ...boardDefault, ...entry.defaultOptions },
    x,
    z,
    rotation,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 3: Verify the band/default logic with a differential script**

No test runner exists for this file — verify the exact logic added in Step 1 directly:

```js
function placementBandFor(category) {
  if (category === "upper") return "wall";
  if (["lower", "tower", "corner", "appliance"].includes(category)) return "floor";
  return null;
}
function boardDefaultFor(category, floorMat, wallMat) {
  const band = placementBandFor(category);
  if (band === "floor" && floorMat) return { boardMaterial: floorMat };
  if (band === "wall" && wallMat) return { boardMaterial: wallMat };
  return {};
}

// Case A: floor-band category, both defaults configured -> floor default wins
console.assert(JSON.stringify(boardDefaultFor("lower", "MDF15", "MDF18")) === JSON.stringify({ boardMaterial: "MDF15" }), "A failed");

// Case B: wall-band category, both defaults configured -> wall default wins
console.assert(JSON.stringify(boardDefaultFor("upper", "MDF15", "MDF18")) === JSON.stringify({ boardMaterial: "MDF18" }), "B failed");

// Case C: neither band (accessory) -> no override regardless of configured defaults
console.assert(JSON.stringify(boardDefaultFor("accessory", "MDF15", "MDF18")) === JSON.stringify({}), "C failed");

// Case D: floor-band category, but no floor default configured (undefined) -> no override, falls through to DEFAULT_OPTIONS
console.assert(JSON.stringify(boardDefaultFor("lower", undefined, "MDF18")) === JSON.stringify({}), "D failed");

console.log("all cases passed");
```

Run it with `node` and confirm `"all cases passed"` — this is the exact band/default logic added in Step 1 (`placementBandFor`'s real implementation already exists and is unchanged; this script re-derives its documented behavior for the 4 categories this task cares about).

- [ ] **Step 4: Commit**

```bash
git add services/kitchenData.ts
git commit -m "$(cat <<'EOF'
Add optional per-band board material params to buildNewModule

New floorBoardMaterial/wallBoardMaterial trailing params, both
optional — every existing call site keeps compiling and behaving
unchanged. When provided, the matching placementBandFor band's default
is applied before entry.defaultOptions, so an explicit catalog default
still wins.
EOF
)"
```

---

### Task 4: Store wiring — defaults state + module-creation call sites

**Files:**
- Modify: `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `buildNewModule`'s new `floorBoardMaterial?`/`wallBoardMaterial?` params (Task 3); `listMaterials()` rows' `defaultFloor`/`defaultWall` (Task 2).
- Produces: `KitchenStore.defaultFloorBoardMaterial: string | null`, `KitchenStore.defaultWallBoardMaterial: string | null`.

- [ ] **Step 1: Add the two state fields to the store interface**

Find:

```ts
  // Material catalog prices, keyed by code (hardware) or name (boards) —
  // see loadMaterialCosts. null until the first successful load; every
  // cost read in calculateKitchenMaterials falls back to its hardcoded
  // constant when a key is missing, so this being null/incomplete never
  // breaks pricing, just means it isn't dynamic yet for that item.
  materialCosts: Map<string, number> | null;
```

Replace with:

```ts
  // Material catalog prices, keyed by code (hardware) or name (boards) —
  // see loadMaterialCosts. null until the first successful load; every
  // cost read in calculateKitchenMaterials falls back to its hardcoded
  // constant when a key is missing, so this being null/incomplete never
  // breaks pricing, just means it isn't dynamic yet for that item.
  materialCosts: Map<string, number> | null;
  // Admin-configured default board material per floor/wall band (see
  // loadMaterialCosts, and buildNewModule's floorBoardMaterial/
  // wallBoardMaterial params) — null when no material is flagged as the
  // default yet, in which case buildNewModule falls back to its own
  // hardcoded default exactly as before this field existed.
  defaultFloorBoardMaterial: string | null;
  defaultWallBoardMaterial: string | null;
```

- [ ] **Step 2: Initialize both to `null`**

Find:

```ts
      materialCosts: null,
```

Replace with:

```ts
      materialCosts: null,
      defaultFloorBoardMaterial: null,
      defaultWallBoardMaterial: null,
```

- [ ] **Step 3: Derive both in `loadMaterialCosts`**

Find:

```ts
      loadMaterialCosts: async () => {
        try {
          const materials = await listMaterials();
          const costs = new Map<string, number>();
          for (const m of materials) {
            if (!m.active) continue;
            costs.set(m.code ?? m.name, m.cost);
          }
          set({ materialCosts: costs });
        } catch {
          // Network/API failure — leave materialCosts as-is (null on
          // first load), pricing keeps working off hardcoded fallbacks.
        }
      },
```

Replace with:

```ts
      loadMaterialCosts: async () => {
        try {
          const materials = await listMaterials();
          const costs = new Map<string, number>();
          let defaultFloorBoardMaterial: string | null = null;
          let defaultWallBoardMaterial: string | null = null;
          for (const m of materials) {
            if (!m.active) continue;
            costs.set(m.code ?? m.name, m.cost);
            if (m.defaultFloor) defaultFloorBoardMaterial = m.name;
            if (m.defaultWall) defaultWallBoardMaterial = m.name;
          }
          set({ materialCosts: costs, defaultFloorBoardMaterial, defaultWallBoardMaterial });
        } catch {
          // Network/API failure — leave materialCosts/defaults as-is
          // (null on first load), pricing and new-module defaults keep
          // working off hardcoded fallbacks.
        }
      },
```

- [ ] **Step 4: Wire `addModule`**

Find:

```ts
      addModule: (type) =>
        set((s) => {
          const entry = buildNewModule(type);
```

Replace with:

```ts
      addModule: (type) =>
        set((s) => {
          const entry = buildNewModule(type, 0, 0, 0, s.defaultFloorBoardMaterial ?? undefined, s.defaultWallBoardMaterial ?? undefined);
```

- [ ] **Step 5: Wire `placeAccessoryInNiche`**

Find:

```ts
      placeAccessoryInNiche: (nicheId, accessoryType) =>
        set((s) => {
          const niche = s.draft.modules.find((m) => m.id === nicheId);
          if (!niche) return {};
          const entry = buildNewModule(accessoryType, niche.x, niche.z, niche.rotation);
```

Replace with:

```ts
      placeAccessoryInNiche: (nicheId, accessoryType) =>
        set((s) => {
          const niche = s.draft.modules.find((m) => m.id === nicheId);
          if (!niche) return {};
          const entry = buildNewModule(accessoryType, niche.x, niche.z, niche.rotation, s.defaultFloorBoardMaterial ?? undefined, s.defaultWallBoardMaterial ?? undefined);
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 7: Reasoning check**

No test runner for this file — verify by reading: (a) both new fields start `null`, matching `materialCosts`'s own "nothing loaded yet" convention, so a session before the first `loadMaterialCosts()` call behaves exactly as before this task (both `?? undefined` calls collapse to `undefined`, `buildNewModule`'s new params are unset, falls through to `DEFAULT_OPTIONS.boardMaterial`). (b) `loadMaterialCosts`'s new scan only considers `active` rows (same `if (!m.active) continue` guard already used for `costs`), so a deactivated default row is silently treated as "no default configured" rather than crashing or returning a stale/invalid material name. (c) Both `addModule` and `placeAccessoryInNiche` read `s.defaultFloorBoardMaterial`/`s.defaultWallBoardMaterial` from the same state snapshot `set((s) => ...)` already provides — no extra `get()` call needed, no risk of a stale read.

- [ ] **Step 8: Commit**

```bash
git add store/useKitchenStore.ts
git commit -m "$(cat <<'EOF'
Wire floor/wall board defaults into module creation

loadMaterialCosts now also derives the active floor/wall default
material names from the same materials fetch it already makes.
addModule and placeAccessoryInNiche pass them into buildNewModule, so
newly created modules pick up the admin-configured default for their
band instead of the single hardcoded constant.
EOF
)"
```

---

### Task 5: UI — set-as-default row actions

**Files:**
- Modify: `frontend/app/materials/page.tsx`

**Interfaces:**
- Consumes: `MaterialRow.defaultFloor`/`defaultWall` (Task 2, via the existing `MaterialRow = Awaited<ReturnType<typeof listMaterials>>[number]` type alias — no local type change needed), `updateMaterial(id, { defaultFloor?: boolean; defaultWall?: boolean })` (Task 2).

- [ ] **Step 1: Add the handler**

Find:

```tsx
  const handleToggle = async (material: MaterialRow) => {
    await updateMaterial(material.id, { active: !material.active });
    reload();
  };
```

Replace with:

```tsx
  const handleToggle = async (material: MaterialRow) => {
    await updateMaterial(material.id, { active: !material.active });
    reload();
  };

  const handleSetDefault = async (material: MaterialRow, band: "defaultFloor" | "defaultWall") => {
    await updateMaterial(material.id, { [band]: true });
    reload();
  };
```

- [ ] **Step 2: Add the two row actions, Tablero rows only**

Find:

```tsx
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Button variant="secondary" className="h-9" onClick={() => setEditing(material)}>Editar</Button>
                        <Button variant="ghost" className="h-9" onClick={() => handleToggle(material)}>{material.active ? "Desactivar" : "Activar"}</Button>
                        <Button variant="danger" className="h-9" onClick={() => handleDelete(material)}>Eliminar</Button>
                      </div>
                    </td>
```

Replace with:

```tsx
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="h-9" onClick={() => setEditing(material)}>Editar</Button>
                        <Button variant="ghost" className="h-9" onClick={() => handleToggle(material)}>{material.active ? "Desactivar" : "Activar"}</Button>
                        <Button variant="danger" className="h-9" onClick={() => handleDelete(material)}>Eliminar</Button>
                        {material.type === "Tablero" && (
                          material.defaultFloor
                            ? <Badge tone="indigo">Predeterminado piso</Badge>
                            : <Button variant="ghost" className="h-9" onClick={() => handleSetDefault(material, "defaultFloor")}>Predeterminado piso</Button>
                        )}
                        {material.type === "Tablero" && (
                          material.defaultWall
                            ? <Badge tone="indigo">Predeterminado pared</Badge>
                            : <Button variant="ghost" className="h-9" onClick={() => handleSetDefault(material, "defaultWall")}>Predeterminado pared</Button>
                        )}
                      </div>
                    </td>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Reasoning check**

No test runner for this file — verify by reading: (a) both new actions are gated on `material.type === "Tablero"`, matching the backend's own validation (Task 1) that rejects either flag on a non-Tablero row — the UI can never attempt a request the server would reject. (b) A row currently holding a flag renders a `Badge` (non-interactive) instead of a `Button` for that flag, so it's never possible to click "make default" on the row that already is the default. (c) `handleSetDefault`'s computed-property `{ [band]: true }` sends exactly one of `{ defaultFloor: true }` / `{ defaultWall: true }` to `updateMaterial`, matching `MaterialInput`'s two optional fields (Task 2) — never both in one call, matching how the two actions are independent buttons.

- [ ] **Step 5: Commit**

```bash
git add app/materials/page.tsx
git commit -m "$(cat <<'EOF'
Add set-as-default row actions for floor/wall board materials

Two new actions, shown only on Tablero-type rows: the current default
renders as a badge, any other Tablero row gets a clickable action that
makes it the new default (unsetting whoever held it before, via the
backend's own exclusivity logic).
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** §1 backend (Task 1) · §2 API/store (Tasks 2 & 4) ·
  §3 `buildNewModule` (Task 3) · §4 store wiring (Task 4) · §5 UI
  (Task 5). Backward compatibility and testing sections are covered
  throughout — no dedicated task needed since every task's own
  steps already verify zero-breakage behavior (default `null`/`false`
  states, unchanged call sites).
- **Placeholder scan:** none — every step has complete, literal code.
- **Type consistency:** `defaultFloor`/`defaultWall` (camelCase,
  frontend) map 1:1 to `default_floor`/`default_wall` (snake_case,
  backend) identically across Tasks 1, 2, 4, and 5 — same naming
  convention already established for `cost_per_unit` ↔ `cost`.
  `floorBoardMaterial`/`wallBoardMaterial` (Task 3's `buildNewModule`
  params) are consumed with matching names in Task 4's two call sites.
  `defaultFloorBoardMaterial`/`defaultWallBoardMaterial` (Task 4's store
  fields) are distinct from `defaultFloor`/`defaultWall` (Task 2's
  per-row booleans) by design — the store fields hold a *material name*
  derived from whichever row has the boolean flag set, not the flag
  itself; Task 4 Step 3 is the only place this derivation happens.
- **Scope check:** single cohesive plan; each task touches a disjoint
  file (backend files only in Task 1, `api.ts` only in Task 2,
  `kitchenData.ts` only in Task 3, `useKitchenStore.ts` only in Task 4,
  `materials/page.tsx` only in Task 5) — no two tasks share a file, so
  ordering is for narrative flow (backend → shared types → pure logic →
  store wiring → UI), not a hard dependency chain, except that Task 4
  genuinely consumes both Task 2's types and Task 3's new parameters,
  and Task 5 genuinely consumes Task 2's types.
- **Ambiguity check:** the exclusivity model (one row per flag,
  independently) is stated identically in the spec, the Global
  Constraints, and Task 1's docblock comment — not left for the
  implementer to infer. The "Tablero-only" restriction is enforced in
  two independent places (Task 1's server-side validation, Task 5's
  UI gating) rather than relying on only one layer to get it right.

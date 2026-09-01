# Hardware Materials Costing & Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `switch`/ternary dispatch for hinge, drawer
slide, piston, push-to-open, and edge-banding costs with a real
materials-catalog category (`hardware_role` + `is_default`), so an
admin can add/reprice/select these SKUs from the Materials CRUD without
a code change, and can never silently break a price by deactivating or
deleting a material still in use.

**Architecture:** Two new columns on the existing `materials` table
(`hardware_role`, `is_default`) generalize the `default_floor`/
`default_wall` pattern already shipped. The frontend's one existing
materials fetch (`loadMaterialCosts`) derives per-role option lists and
default codes alongside the prices it already reads. A new top-level
`resolveHardwareCost` helper replaces every hardcoded fallback in
`calculateKitchenMaterials`; a missing/misconfigured default surfaces
as a visible warning instead of a wrong number. A Zustand `persist`
migration (and the separate server-load path) translates old literal
option values (`"Soft-close"`, etc.) into material codes so every
existing saved draft keeps computing the same numbers.

**Tech Stack:** Laravel 11 (`backend/`), Next.js 16 + TypeScript
(`frontend/`, Zustand store). Most frontend files touched here have no
dedicated unit tests (verify via `npx tsc --noEmit` + reasoning, this
project's established convention for those files) — but a real Vitest
suite exists for `closetTower.ts` (`frontend/services/closetTower.test.ts`,
run via `npx vitest run`), which this plan's Task 7 must keep green.
Backend has a real Feature-test suite (`php artisan test`).

**Spec:** `docs/superpowers/specs/2026-09-01-hardware-materials-costing-design.md`

## Global Constraints

- Five hardware roles only: `bisagra`, `corredera`, `piston`,
  `push_to_open`, `canto`. No other cost item (boards, countertops,
  zócalo, lambrín, rod, mirror, backsplash, accessories) is touched.
- `hardware_role` may only be set on a material whose `type` is **not**
  `"Tablero"` — validated server-side (422 otherwise), mirroring the
  existing inverse rule for `default_floor`/`default_wall`.
- `is_default` exclusivity is scoped **per `hardware_role`** (setting
  it on one `bisagra` row unsets it only on other `bisagra` rows, never
  on `corredera`/`piston`/etc. rows) — enforced in the Laravel
  controller inside a `DB::transaction`, not a database constraint,
  matching the existing `default_floor`/`default_wall` precedent.
- A material cannot be deactivated (`active: false`) or deleted while
  it holds `is_default: true` (any role) or `default_floor`/
  `default_wall: true` — rejected with a 422/error message; the admin
  must reassign the default first. This also closes the same
  previously-unguarded gap for `default_floor`/`default_wall`.
- No hardcoded fallback constant is consulted for these five roles
  once this ships — a missing active default produces a visible
  warning in the quote breakdown, never a silently-substituted number.
- Every existing saved kitchen draft (local `persist` or a server
  `KitchenProject`) must compute byte-for-byte the same numbers after
  this ships as before, via an in-memory compatibility mapping — no
  database migration of saved project data.
- The edge-profile per-module selector is **not** revived — it has no
  reachable UI today (dead code). Only the edge-banding *price* is
  fixed to track the `canto` role's default material.
- Piston and push-to-open stay single-default-driven (no per-door SKU
  picker) — only bisagra and corredera get real per-module selectors.
- Never `git add -A`/`git add .` — only the exact files each task
  names.

---

## File Structure

- `backend/database/migrations/2026_09_01_000100_add_hardware_role_to_materials.php` — new additive migration + backfill.
- `backend/app/Models/Material.php` — fillable/casts for the two new columns.
- `backend/app/Http/Controllers/MaterialController.php` — validation, role-scoped exclusivity, deactivation/deletion guard.
- `backend/tests/Feature/MaterialControllerTest.php` — new coverage for the above.
- `frontend/types/kitchen.ts` — `HardwareRole`/`HardwareCatalog` types; `hingeMaterial` field; `drawerSystem`/`edgeProfile` type changes; `KitchenMaterialLine.materialId`.
- `frontend/services/api.ts` — `BackendMaterial`/`listMaterials`/`MaterialInput`/`mapMaterial`/`createMaterial`/`updateMaterial` extended with `hardware_role`/`is_default`.
- `frontend/services/kitchenData.ts` — `resolveHardwareCost` replaces `resolveDrawerSlideCode`; every hinge/corredera/piston/push-to-open/canto cost call site rewired; `calculateKitchenMaterials` gains a `hardwareCatalog` param and a `warnings` return field.
- `frontend/store/useKitchenStore.ts` — `hardwareOptionsByRole`/`hardwareCatalog` derived in `loadMaterialCosts`; `migrate` bumped to version 5; `loadProject` gains the same normalization.
- `frontend/components/kitchen/ModuleInspector.tsx` — "Sistema de cajón" options sourced dynamically; new "Bisagra" selector.
- `frontend/types/closetTower.ts` — `TowerSection.drawerSystem` type changed to `string`.
- `frontend/components/kitchen/TowerDialog.tsx` — its own independent "Sistema de cajón" picker sourced dynamically too.
- `frontend/services/closetTower.test.ts` — 3 existing assertions updated to the new material-code values.
- `frontend/components/kitchen/KitchenSummary.tsx` — warnings banner.
- `frontend/components/materials/MaterialFormModal.tsx` — `TYPE_OPTIONS` fix; new "Rol de hardware" select.
- `frontend/app/materials/page.tsx` — "Rol" column, generalized "Predeterminado (rol)" action, error handling on toggle/delete.

---

### Task 1: Backend — `hardware_role` + `is_default`, role-scoped exclusivity, deactivation/deletion guard

**Files:**
- Create: `backend/database/migrations/2026_09_01_000100_add_hardware_role_to_materials.php`
- Modify: `backend/app/Models/Material.php`
- Modify: `backend/app/Http/Controllers/MaterialController.php`
- Test: `backend/tests/Feature/MaterialControllerTest.php`

**Interfaces:**
- Produces: `materials.hardware_role: string|null` (one of `bisagra`,
  `corredera`, `piston`, `push_to_open`, `canto`), `materials.is_default:
  boolean` (`not null default false`). `MaterialController@store`/
  `@update`/`@destroy` accept/enforce them: `hardware_role` rejected on
  a `"Tablero"` row; `is_default` requires a non-null `hardware_role`;
  `is_default: true` unsets it on every other row sharing that same
  `hardware_role`; deactivating or deleting a material that is (or
  would remain) `is_default`/`default_floor`/`default_wall` is
  rejected with a 422.

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('materials', function (Blueprint $table) {
            $table->string('hardware_role')->nullable()->after('default_wall');
            $table->boolean('is_default')->default(false)->after('hardware_role');
        });

        // Backfill the existing hardcoded lookup keys so pricing behaves
        // identically immediately after this migration runs. is_default
        // picks whichever row today's DEFAULT_OPTIONS (kitchenData.ts)
        // effectively resolves to for a brand-new module: drawerSystem
        // defaults to "Soft-close" -> corredera_softclose, and the hinge
        // ternary's "Soft-close" branch -> bisagra_amortiguada.
        $roleByCode = [
            'bisagra_amortiguada' => ['bisagra', true],
            'bisagra_simple' => ['bisagra', false],
            'corredera_softclose' => ['corredera', true],
            'corredera_simple' => ['corredera', false],
            'corredera_self_close' => ['corredera', false],
            'corredera_extraccion' => ['corredera', false],
            'corredera_push_to_open' => ['corredera', false],
            'piston_arriba' => ['piston', true],
            'push_to_open_puerta' => ['push_to_open', true],
            'canto_pvc_04' => ['canto', true],
            'canto_pvc_2mm' => ['canto', false],
        ];
        foreach ($roleByCode as $code => [$role, $isDefault]) {
            DB::table('materials')->where('code', $code)->update([
                'hardware_role' => $role,
                'is_default' => $isDefault,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('materials', function (Blueprint $table) {
            $table->dropColumn(['hardware_role', 'is_default']);
        });
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && php artisan migrate`
Expected: `add_hardware_role_to_materials` migration runs, no errors.

- [ ] **Step 3: Update the Material model**

Find (`backend/app/Models/Material.php`):

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

Replace with:

```php
    protected $fillable = ['name', 'code', 'type', 'unit', 'cost_per_unit', 'stock', 'active', 'default_floor', 'default_wall', 'hardware_role', 'is_default'];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'cost_per_unit' => 'float',
            'stock' => 'float',
            'default_floor' => 'boolean',
            'default_wall' => 'boolean',
            'is_default' => 'boolean',
        ];
    }
```

- [ ] **Step 4: Rewrite the controller**

Find (`backend/app/Http/Controllers/MaterialController.php`), the entire file body:

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
        $effectiveType = $validated['type'] ?? $material->type;
        $this->guardDefaultFlagsAgainstType($validated, $effectiveType);

        // A type change away from "Tablero" invalidates any default flag the
        // row was already holding, even if this request never touches those
        // fields (e.g. the standard edit form only sends name/type/etc).
        if ($effectiveType !== 'Tablero') {
            $validated['default_floor'] = false;
            $validated['default_wall'] = false;
        }

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
    private const HARDWARE_ROLES = ['bisagra', 'corredera', 'piston', 'push_to_open', 'canto'];

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
            'hardware_role' => ['sometimes', 'nullable', 'string', Rule::in(self::HARDWARE_ROLES)],
            'is_default' => ['sometimes', 'boolean'],
        ]);
        $this->guardDefaultFlagsAgainstType($validated, $validated['type']);
        $this->guardHardwareRoleAgainstType($validated, $validated['type']);
        $effectiveRole = $validated['hardware_role'] ?? null;
        $this->guardIsDefaultRequiresRole($validated, $effectiveRole);
        $this->guardActiveDefaultCombination(
            $validated['active'],
            $validated['default_floor'] ?? false,
            $validated['default_wall'] ?? false,
            $validated['is_default'] ?? false,
        );

        $material = DB::transaction(function () use ($validated, $effectiveRole) {
            $this->clearOtherDefaults($validated, null, $effectiveRole);
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
            'hardware_role' => ['sometimes', 'nullable', 'string', Rule::in(self::HARDWARE_ROLES)],
            'is_default' => ['sometimes', 'boolean'],
        ]);
        $effectiveType = $validated['type'] ?? $material->type;
        $this->guardDefaultFlagsAgainstType($validated, $effectiveType);
        $this->guardHardwareRoleAgainstType($validated, $effectiveType);

        // A type change away from "Tablero" invalidates any default flag the
        // row was already holding, even if this request never touches those
        // fields (e.g. the standard edit form only sends name/type/etc).
        if ($effectiveType !== 'Tablero') {
            $validated['default_floor'] = false;
            $validated['default_wall'] = false;
        }
        // Symmetric case: a type change TO "Tablero" invalidates any
        // hardware role/default the row was already holding — a board can
        // never be "the bisagra."
        if ($effectiveType === 'Tablero') {
            $validated['hardware_role'] = null;
            $validated['is_default'] = false;
        }

        $effectiveRole = array_key_exists('hardware_role', $validated) ? $validated['hardware_role'] : $material->hardware_role;
        $this->guardIsDefaultRequiresRole($validated, $effectiveRole);
        $this->guardActiveDefaultCombination(
            $validated['active'] ?? $material->active,
            $validated['default_floor'] ?? $material->default_floor,
            $validated['default_wall'] ?? $material->default_wall,
            $validated['is_default'] ?? $material->is_default,
        );

        DB::transaction(function () use ($validated, $material, $effectiveRole) {
            $this->clearOtherDefaults($validated, $material->id, $effectiveRole);
            $material->update($validated);
        });

        return response()->json($material->fresh());
    }

    public function destroy(Material $material): JsonResponse
    {
        if ($material->default_floor || $material->default_wall || $material->is_default) {
            throw ValidationException::withMessages([
                'id' => ['No se puede eliminar un material predeterminado. Asigna otro material como predeterminado antes.'],
            ]);
        }

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

    // A hardware role only ever makes sense on a non-"Tablero" row — a
    // board can never be "the bisagra"/"the corredera"/etc.
    private function guardHardwareRoleAgainstType(array $validated, string $effectiveType): void
    {
        $settingRole = array_key_exists('hardware_role', $validated) && $validated['hardware_role'] !== null;
        if ($settingRole && $effectiveType === 'Tablero') {
            throw ValidationException::withMessages([
                'hardware_role' => ['Un material de tipo "Tablero" no puede tener un rol de hardware.'],
            ]);
        }
    }

    // is_default only makes sense paired with a hardware_role — nothing for
    // it to be "the default" of otherwise.
    private function guardIsDefaultRequiresRole(array $validated, ?string $effectiveRole): void
    {
        if (($validated['is_default'] ?? false) === true && $effectiveRole === null) {
            throw ValidationException::withMessages([
                'is_default' => ['Un material solo puede ser predeterminado si tiene un rol de hardware asignado.'],
            ]);
        }
    }

    // Deactivating (or deleting, see destroy()) a material that is
    // currently — or would remain — a default (is_default for its role, or
    // default_floor/default_wall) would silently degrade pricing for
    // whoever reads that default. The admin must reassign the default to a
    // different material first.
    private function guardActiveDefaultCombination(bool $active, bool $defaultFloor, bool $defaultWall, bool $isDefault): void
    {
        if (!$active && ($defaultFloor || $defaultWall || $isDefault)) {
            throw ValidationException::withMessages([
                'active' => ['No se puede desactivar un material predeterminado. Asigna otro material como predeterminado antes.'],
            ]);
        }
    }

    // Exactly one row can hold default_floor=true at a time, separately
    // exactly one row can hold default_wall=true at a time, and separately
    // exactly one row per hardware_role can hold is_default=true at a time
    // (a single row may legitimately hold several of these independently).
    // Only runs when the incoming request actually sets a flag to true —
    // clearing a flag to false never needs to touch any other row.
    private function clearOtherDefaults(array $validated, ?int $exceptId, ?string $effectiveRole): void
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
        if (($validated['is_default'] ?? false) === true && $effectiveRole !== null) {
            Material::where('hardware_role', $effectiveRole)
                ->where('is_default', true)
                ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
                ->update(['is_default' => false]);
        }
    }
}
```

- [ ] **Step 5: Add test coverage**

Find (`backend/tests/Feature/MaterialControllerTest.php`), the final closing brace preceded by the last existing test method:

```php
        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'active' => false, 'default_floor' => true]);
    }
}
```

Replace with:

```php
        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'active' => false, 'default_floor' => true]);
    }

    public function test_hardware_role_rejected_on_tablero_type(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['type' => 'Tablero']);

        $response = $this->putJson("/api/materials/{$material->id}", [
            'hardware_role' => 'bisagra',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['hardware_role']);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'hardware_role' => null]);
    }

    public function test_is_default_requires_hardware_role(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['type' => 'sheet']);

        $response = $this->putJson("/api/materials/{$material->id}", [
            'is_default' => true,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['is_default']);
    }

    public function test_setting_is_default_unsets_it_only_within_the_same_hardware_role(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $currentHinge = $this->createMaterial(['name' => 'Bisagra A', 'hardware_role' => 'bisagra', 'is_default' => true]);
        $incomingHinge = $this->createMaterial(['name' => 'Bisagra B', 'hardware_role' => 'bisagra']);
        $unrelatedSlide = $this->createMaterial(['name' => 'Corredera A', 'hardware_role' => 'corredera', 'is_default' => true]);

        $response = $this->putJson("/api/materials/{$incomingHinge->id}", [
            'is_default' => true,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', ['id' => $incomingHinge->id, 'is_default' => true]);
        $this->assertDatabaseHas('materials', ['id' => $currentHinge->id, 'is_default' => false]);
        $this->assertDatabaseHas('materials', ['id' => $unrelatedSlide->id, 'is_default' => true]);
    }

    public function test_deactivating_a_default_hardware_material_is_rejected(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['hardware_role' => 'piston', 'is_default' => true, 'active' => true]);

        $response = $this->putJson("/api/materials/{$material->id}", [
            'active' => false,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['active']);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'active' => true]);
    }

    public function test_deactivating_a_non_default_material_still_succeeds(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['hardware_role' => 'piston', 'is_default' => false, 'active' => true]);

        $response = $this->putJson("/api/materials/{$material->id}", [
            'active' => false,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', ['id' => $material->id, 'active' => false]);
    }

    public function test_deleting_a_default_material_is_rejected(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['hardware_role' => 'canto', 'is_default' => true]);

        $response = $this->deleteJson("/api/materials/{$material->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('materials', ['id' => $material->id]);
    }

    public function test_deleting_a_non_default_material_still_succeeds(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['hardware_role' => 'canto', 'is_default' => false]);

        $response = $this->deleteJson("/api/materials/{$material->id}");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('materials', ['id' => $material->id]);
    }

    public function test_type_change_to_tablero_clears_hardware_role_and_is_default(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($user);
        $material = $this->createMaterial(['type' => 'sheet', 'hardware_role' => 'bisagra', 'is_default' => true]);

        $response = $this->putJson("/api/materials/{$material->id}", [
            'type' => 'Tablero',
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('materials', [
            'id' => $material->id,
            'type' => 'Tablero',
            'hardware_role' => null,
            'is_default' => false,
        ]);
    }
}
```

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && php artisan test`
Expected: all tests pass, including the 8 new ones.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_09_01_000100_add_hardware_role_to_materials.php app/Models/Material.php app/Http/Controllers/MaterialController.php tests/Feature/MaterialControllerTest.php
git commit -m "$(cat <<'EOF'
Add hardware_role/is_default to materials, role-scoped exclusivity, deactivation guard

An admin can now tag a material with a hardware role (bisagra,
corredera, piston, push_to_open, canto) and mark one active row per
role as the default. Exclusivity is scoped per role, not global. A
material cannot be deactivated or deleted while it is a default (any
role, or default_floor/default_wall) — closes a pre-existing silent-
degradation gap for the board defaults too.
EOF
)"
```

---

### Task 2: Shared types + frontend API client

**Files:**
- Modify: `frontend/types/kitchen.ts`
- Modify: `frontend/services/api.ts`

**Interfaces:**
- Consumes: `materials.hardware_role`/`is_default` (Task 1, backend response shape).
- Produces: `HardwareRole` type; `listMaterials()` rows gain `hardwareRole: HardwareRole | null`, `isDefault: boolean`; `MaterialInput` gains `hardwareRole?: HardwareRole | null`, `isDefault?: boolean`; `updateMaterial`/`createMaterial` forward them.

- [ ] **Step 1: Add the `HardwareRole` type**

Find (`frontend/types/kitchen.ts`):

```ts
export type HardwareFinish = "Acero inoxidable" | "Negro mate" | "Dorado" | "Bronce" | "Cromo" | "Sin jaladores";
```

Replace with:

```ts
export type HardwareFinish = "Acero inoxidable" | "Negro mate" | "Dorado" | "Bronce" | "Cromo" | "Sin jaladores";

/** Which cost/selection slot a materials-catalog row fills for
 *  hardware-only pricing — see MaterialController's hardware_role
 *  column. null on every non-hardware material (boards, finishes,
 *  etc.). */
export type HardwareRole = "bisagra" | "corredera" | "piston" | "push_to_open" | "canto";
```

- [ ] **Step 2: Extend `BackendMaterial`**

Find (`frontend/services/api.ts`):

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
  hardware_role: HardwareRole | null;
  is_default: boolean;
}
```

- [ ] **Step 3: Import `HardwareRole`**

Find:

```ts
import type { CameraView, KitchenDraft, KitchenModule, ModuleCategory, KitchenModuleType, WallOpening, ProjectType } from "@/types/kitchen";
```

Replace with:

```ts
import type { CameraView, HardwareRole, KitchenDraft, KitchenModule, ModuleCategory, KitchenModuleType, WallOpening, ProjectType } from "@/types/kitchen";
```

- [ ] **Step 4: Extend `listMaterials()`**

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
    defaultFloor: m.default_floor,
    defaultWall: m.default_wall,
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
    hardwareRole: m.hardware_role,
    isDefault: m.is_default,
  }));
}
```

- [ ] **Step 5: Extend `MaterialInput`**

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
  defaultFloor?: boolean;
  defaultWall?: boolean;
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
  hardwareRole?: HardwareRole | null;
  isDefault?: boolean;
}
```

- [ ] **Step 6: Extend `mapMaterial`**

Find:

```ts
function mapMaterial(m: BackendMaterial) {
  return { id: m.id, name: m.name, code: m.code, type: m.type, unit: m.unit, cost: Number(m.cost_per_unit), stock: Number(m.stock), active: m.active, defaultFloor: m.default_floor, defaultWall: m.default_wall };
}
```

Replace with:

```ts
function mapMaterial(m: BackendMaterial) {
  return { id: m.id, name: m.name, code: m.code, type: m.type, unit: m.unit, cost: Number(m.cost_per_unit), stock: Number(m.stock), active: m.active, defaultFloor: m.default_floor, defaultWall: m.default_wall, hardwareRole: m.hardware_role, isDefault: m.is_default };
}
```

- [ ] **Step 7: Extend `createMaterial`**

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
    default_floor: input.defaultFloor,
    default_wall: input.defaultWall,
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
    hardware_role: input.hardwareRole,
    is_default: input.isDefault,
  });
  return mapMaterial(material);
}
```

- [ ] **Step 8: Extend `updateMaterial`**

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
  if (patch.defaultFloor !== undefined) body.default_floor = patch.defaultFloor;
  if (patch.defaultWall !== undefined) body.default_wall = patch.defaultWall;
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
  if (patch.hardwareRole !== undefined) body.hardware_role = patch.hardwareRole;
  if (patch.isDefault !== undefined) body.is_default = patch.isDefault;
  const material = await http.put<BackendMaterial>(`/materials/${id}`, body);
  return mapMaterial(material);
}
```

- [ ] **Step 9: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 10: Commit**

```bash
git add types/kitchen.ts services/api.ts
git commit -m "$(cat <<'EOF'
Add HardwareRole type, carry hardware_role/is_default through the materials API client

listMaterials/createMaterial/updateMaterial now read and write the two
new fields, following the same field-mapping convention already used
for cost_per_unit <-> cost and default_floor <-> defaultFloor.
EOF
)"
```

---

### Task 3: Store — per-role option lists and defaults

**Files:**
- Modify: `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `listMaterials()` rows' `hardwareRole`/`isDefault`/`code`/`name` (Task 2).
- Produces: `KitchenStore.hardwareOptionsByRole: Record<HardwareRole, { code: string; name: string }[]>` (for UI dropdowns, Task 6); `KitchenStore.hardwareCatalog: HardwareCatalog | null` (for the cost engine, Task 4), where `HardwareCatalog = { defaultCodeByRole: Partial<Record<HardwareRole, string>>; nameByCode: Map<string, string>; idByCode: Map<string, number> }`.

- [ ] **Step 1: Add the `HardwareCatalog` type**

Find (`frontend/types/kitchen.ts`):

```ts
export type HardwareRole = "bisagra" | "corredera" | "piston" | "push_to_open" | "canto";
```

Replace with:

```ts
export type HardwareRole = "bisagra" | "corredera" | "piston" | "push_to_open" | "canto";

/** Everything calculateKitchenMaterials needs to resolve a hardware
 *  role's cost by code, without re-deriving it from the raw materials
 *  list on every call — built once in useKitchenStore.loadMaterialCosts
 *  alongside materialCosts itself. */
export interface HardwareCatalog {
  defaultCodeByRole: Partial<Record<HardwareRole, string>>;
  nameByCode: Map<string, string>;
  idByCode: Map<string, number>;
}
```

- [ ] **Step 2: Add the two state fields**

Find (`frontend/store/useKitchenStore.ts`):

```ts
  // Admin-configured default board material per floor/wall band (see
  // loadMaterialCosts, and buildNewModule's floorBoardMaterial/
  // wallBoardMaterial params) — null when no material is flagged as the
  // default yet, in which case buildNewModule falls back to its own
  // hardcoded default exactly as before this field existed.
  defaultFloorBoardMaterial: string | null;
  defaultWallBoardMaterial: string | null;
```

Replace with:

```ts
  // Admin-configured default board material per floor/wall band (see
  // loadMaterialCosts, and buildNewModule's floorBoardMaterial/
  // wallBoardMaterial params) — null when no material is flagged as the
  // default yet, in which case buildNewModule falls back to its own
  // hardcoded default exactly as before this field existed.
  defaultFloorBoardMaterial: string | null;
  defaultWallBoardMaterial: string | null;
  // Active materials grouped by hardware_role, for the per-module
  // bisagra/corredera selectors (ModuleInspector.tsx) — empty array for a
  // role with no active materials yet.
  hardwareOptionsByRole: Record<HardwareRole, { code: string; name: string }[]>;
  // Cost-engine-facing view of the same fetch — see calculateKitchenMaterials's
  // hardwareCatalog param. null until the first successful load.
  hardwareCatalog: HardwareCatalog | null;
```

- [ ] **Step 3: Import `HardwareRole`/`HardwareCatalog`**

Find the `import type { ... } from "@/types/kitchen"` line in `useKitchenStore.ts` (its exact existing member list varies — locate it by searching for `"@/types/kitchen"`) and add `HardwareRole, HardwareCatalog` to its named imports, matching the file's existing multi-line or single-line import style.

- [ ] **Step 4: Initialize both fields**

Find:

```ts
      defaultFloorBoardMaterial: null,
      defaultWallBoardMaterial: null,
```

Replace with:

```ts
      defaultFloorBoardMaterial: null,
      defaultWallBoardMaterial: null,
      hardwareOptionsByRole: { bisagra: [], corredera: [], piston: [], push_to_open: [], canto: [] },
      hardwareCatalog: null,
```

- [ ] **Step 5: Derive both in `loadMaterialCosts`**

Find:

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

Replace with:

```ts
      loadMaterialCosts: async () => {
        try {
          const materials = await listMaterials();
          const costs = new Map<string, number>();
          let defaultFloorBoardMaterial: string | null = null;
          let defaultWallBoardMaterial: string | null = null;
          const hardwareOptionsByRole: Record<HardwareRole, { code: string; name: string }[]> = {
            bisagra: [], corredera: [], piston: [], push_to_open: [], canto: [],
          };
          const defaultCodeByRole: Partial<Record<HardwareRole, string>> = {};
          const nameByCode = new Map<string, string>();
          const idByCode = new Map<string, number>();
          for (const m of materials) {
            if (!m.active) continue;
            costs.set(m.code ?? m.name, m.cost);
            if (m.defaultFloor) defaultFloorBoardMaterial = m.name;
            if (m.defaultWall) defaultWallBoardMaterial = m.name;
            if (m.code) {
              nameByCode.set(m.code, m.name);
              idByCode.set(m.code, m.id);
            }
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
        } catch {
          // Network/API failure — leave materialCosts/defaults as-is
          // (null on first load), pricing and new-module defaults keep
          // working off hardcoded fallbacks.
        }
      },
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly (the new fields are unused by any reader yet — that's Tasks 4 and 6 — but must compile).

- [ ] **Step 7: Reasoning check**

No test runner for this file — verify by reading: (a) both new fields
start at their "nothing loaded / no default configured" state
(`hardwareOptionsByRole` all-empty-arrays, `hardwareCatalog: null`),
matching `materialCosts`'s own convention, so a session before the
first `loadMaterialCosts()` call is unaffected. (b) The loop only
considers `active` materials (same `if (!m.active) continue` guard
already used for `costs`), so a deactivated hardware material silently
drops out of both its role's option list and (if it held it) that
role's default code. (c) A material with a `hardwareRole` but no
`code` is skipped for `hardwareOptionsByRole`/`defaultCodeByRole`
(`m.code` must be truthy) — this can't currently happen given Task 1's
backend guard couples `hardware_role` to non-Tablero types, but the
guard costs nothing and avoids ever pushing an unusable `undefined`
code into a selector.

- [ ] **Step 8: Commit**

```bash
git add ../frontend/types/kitchen.ts store/useKitchenStore.ts
git commit -m "$(cat <<'EOF'
Derive per-hardware-role option lists and defaults from the existing materials fetch

loadMaterialCosts now also groups active materials by hardware_role
(for per-module selectors) and records each role's default code, name,
and material id (for cost resolution and traceability) — no new
network call.
EOF
)"
```

(Adjust the `git add` path prefix to match whichever directory the
executing shell is rooted in — `frontend/types/kitchen.ts` if run from
the repo root, `types/kitchen.ts` if run from inside `frontend/`, same
as `store/useKitchenStore.ts`.)

---

### Task 4: Cost engine — `resolveHardwareCost` replaces hardcoded dispatch

**Files:**
- Modify: `frontend/types/kitchen.ts:191,230,327,331` (`DrawerSystem`/`EdgeProfile` usage sites — `ModuleOptions` and `DrawerDef` fields)
- Modify: `frontend/services/kitchenData.ts`
- Modify: `frontend/components/kitchen/FaceEditor.tsx` (constructs a `DrawerDef` literal — breaks otherwise, see Step 2)

**Interfaces:**
- Consumes: `HardwareCatalog` (Task 3).
- Produces: `ModuleOptions.hingeMaterial: string` (new field, a material code); `ModuleOptions.drawerSystem: string` and `DrawerDef.drawerSystem: string` (both type-changed from the closed `DrawerSystem` union to a material code — both must change together, see Step 1); `calculateKitchenMaterials(modules, materialCosts?, finishes?, hardwareCatalog?: HardwareCatalog | null): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary; warnings: string[] }` (new 4th param, new `warnings` field).

- [ ] **Step 1: Change both `drawerSystem` fields' type to `string`, add `hingeMaterial`**

`DrawerDef.drawerSystem` (`DrawerDef` is the per-drawer detailed-face-layout
type) must change type **together with** `ModuleOptions.drawerSystem`, not be
left alone: `ModulePreview3D.tsx:99,1539` and `FaceEditor.tsx:90,122`
construct `DrawerDef` objects by copying `ModuleOptions.drawerSystem`
straight into `DrawerDef.drawerSystem` — once the source becomes a
`string` (a material code), the target field must accept `string` too or
every one of those assignments fails to compile.

Find (`frontend/types/kitchen.ts`):

```ts
  drawerSystem: DrawerSystem;
```

This exact line appears twice — `DrawerDef.drawerSystem` (inside the
`DrawerDef` interface, preceded by `offsetPct: number;` and followed by
`orientation?: "horizontal" | "vertical";`) and `ModuleOptions.drawerSystem`
(inside the `ModuleOptions` interface, preceded by `doorStyle: DoorStyle;`
and followed by `// Hardware` / `hardwareFinish: HardwareFinish;`). Both
occurrences change in this step.

Find (the `DrawerDef` occurrence, with surrounding context):

```ts
  widthPct: number;        // percentage of interior width, 0-100 (default 100)
  offsetPct: number;       // left-offset percentage, 0-100 (default 0)
  drawerSystem: DrawerSystem;
  orientation?: "horizontal" | "vertical";  // handle orientation (default "horizontal")
```

Replace with:

```ts
  widthPct: number;        // percentage of interior width, 0-100 (default 100)
  offsetPct: number;       // left-offset percentage, 0-100 (default 0)
  // Corredera material code — copied straight from the owning module's
  // ModuleOptions.drawerSystem (see resolveDrawers/ModulePreview3D). Not
  // actually read back for costing today (calculateKitchenMaterials always
  // costs off the module-level value, a pre-existing gap out of scope
  // here) — kept as its own field only because FaceEditor's per-drawer
  // detailed layout already lets a seller set one, cosmetically, per drawer.
  drawerSystem: string;
  orientation?: "horizontal" | "vertical";  // handle orientation (default "horizontal")
```

Find (the `ModuleOptions` occurrence, with surrounding context):

```ts
  // Door & drawer style
  doorStyle: DoorStyle;
  drawerSystem: DrawerSystem;
  // Hardware
  hardwareFinish: HardwareFinish;
```

Replace with:

```ts
  // Door & drawer style
  doorStyle: DoorStyle;
  // Corredera material code (materials.hardware_role = "corredera") —
  // was a closed DrawerSystem union; now a materials-catalog code so a
  // new corredera SKU becomes selectable without a code change. See
  // useKitchenStore's compatibility migration for how an old literal
  // value ("Soft-close", etc.) is translated into a code.
  drawerSystem: string;
  // Bisagra material code (materials.hardware_role = "bisagra") —
  // decoupled from drawerSystem, which used to double as the hinge's
  // implicit selector via a "=== Soft-close" ternary.
  hingeMaterial: string;
  // Hardware
  hardwareFinish: HardwareFinish;
```

- [ ] **Step 2: Fix `FaceEditor.tsx`'s now-broken `DrawerDef` construction**

`FaceEditor.tsx` is the one place besides `resolveDrawers`/
`ModulePreview3D.tsx` that builds a `DrawerDef` object literal by hand,
and the only one that references the `DrawerSystem` type name directly
(a type assertion) — both need fixing now that the field is `string`.

Find:

```tsx
import type { KitchenModule, DrawerDef, DoorDef, DrawerSystem, DoorStyle } from "@/types/kitchen";
```

Replace with:

```tsx
import type { KitchenModule, DrawerDef, DoorDef, DoorStyle } from "@/types/kitchen";
```

Find:

```tsx
        drawerSystem: (draft.drawerSystem as DrawerSystem) ?? options.drawerSystem,
```

Replace with:

```tsx
        drawerSystem: (draft.drawerSystem as string) ?? options.drawerSystem,
```

`ModulePreview3D.tsx:99,1539` need no change — both already do a plain
`drawerSystem: mod.options.drawerSystem` / `module.options.drawerSystem`
assignment with no type assertion, which now type-checks as a
`string`-to-`string` assignment instead of `DrawerSystem`-to-`DrawerSystem`.

- [ ] **Step 3: Update `DEFAULT_OPTIONS`**

Find (`frontend/services/kitchenData.ts`):

```ts
  doorStyle: "Lisa",
  drawerSystem: "Soft-close",
  hardwareFinish: "Acero inoxidable",
```

Replace with:

```ts
  doorStyle: "Lisa",
  // Matches materials seed data's corredera_softclose/bisagra_amortiguada
  // rows — the same effective default a brand-new module got before
  // these became materials-catalog codes (see the migration in
  // 2026_09_01_000100_add_hardware_role_to_materials.php).
  drawerSystem: "corredera_softclose",
  hingeMaterial: "bisagra_amortiguada",
  hardwareFinish: "Acero inoxidable",
```

- [ ] **Step 4: Replace `resolveDrawerSlideCode` with `resolveHardwareCost`, trim `HARDWARE_COSTS`**

Find:

```ts
// Cost per unit for hardware
export const HARDWARE_COSTS = {
  bisagra_simple: 35,
  bisagra_amortiguada: 65,
  corredera_simple: 95,
  corredera_extraccion: 145,
  corredera_softclose: 130,
  // Fallback only — the real price comes from the materials catalog (code:
  // "corredera_self_close"/"corredera_push_to_open", seeded by
  // backend/database/migrations/2026_08_23_120000_add_drawer_and_push_to_open_materials.php).
  // Kept in agreement with that seed's cost_per_unit intentionally.
  corredera_self_close: 110,
  corredera_push_to_open: 150,
  jaladera_barra_acero: 85,
  jaladera_gota: 75,
  pata_metalica: 140,
  tornillo_confirmat: 2.5,
  canto_pvc_04: 12,
  canto_pvc_2mm: 18,
  // Fallback only — the real price comes from the materials catalog
  // (code: "piston_arriba", seeded by
  // backend/database/migrations/2026_08_15_130000_add_piston_material.php).
  // Kept in agreement with that seed's cost_per_unit intentionally.
  piston_arriba: 180,
  // Fallback only — same convention as piston_arriba/corredera_self_close
  // above (code: "push_to_open_puerta", same 2026_08_23 seed).
  push_to_open_puerta: 60,
};

// One slide-rail cost tier per DrawerSystem value — resolveDrawerSlideCode
// is the single place that decides which HARDWARE_COSTS/materials-catalog
// code a module's chosen system bills as, so the drawer-slide cost line and
// any other reader agree by construction rather than by two copies of the
// same mapping staying in sync by hand.
function resolveDrawerSlideCode(system: DrawerSystem): keyof typeof HARDWARE_COSTS {
  switch (system) {
    case "Simple": return "corredera_simple";
    case "Self-close": return "corredera_self_close";
    case "Soft-close": return "corredera_softclose";
    case "Push to open": return "corredera_push_to_open";
    case "Extracción total": return "corredera_extraccion";
  }
}
```

Replace with:

```ts
// Cost per unit for hardware NOT driven by a materials-catalog role.
// bisagra/corredera/piston/push_to_open/canto now resolve entirely
// through resolveHardwareCost below — never this record. These four
// keys are pre-existing, currently-unread entries (confirmed no call
// site in this file reads them); left as-is, out of scope here.
export const HARDWARE_COSTS = {
  jaladera_barra_acero: 85,
  jaladera_gota: 75,
  pata_metalica: 140,
  tornillo_confirmat: 2.5,
};

const HARDWARE_ROLE_LABELS: Record<HardwareRole, string> = {
  bisagra: "bisagras",
  corredera: "correderas",
  piston: "pistones",
  push_to_open: "push to open",
  canto: "canto",
};

// The single place that resolves a hardware role's cost: prefer the
// module's own chosen code (bisagra/corredera only — piston/push_to_open/
// canto never pass one, see call sites below), falling back to the
// role's current is_default material. No hardcoded price fallback — a
// role with no resolvable cost returns `missing`, surfaced as a visible
// warning by the caller (see calculateKitchenMaterials's costForRole)
// instead of a silently wrong number.
function resolveHardwareCost(
  code: string | undefined,
  role: HardwareRole,
  materialCosts: Map<string, number> | null | undefined,
  hardwareCatalog: HardwareCatalog | null | undefined,
): { cost: number; code: string } | { missing: true } {
  const resolvedCode = code ?? hardwareCatalog?.defaultCodeByRole[role];
  const cost = resolvedCode ? materialCosts?.get(resolvedCode) : undefined;
  return cost !== undefined && resolvedCode ? { cost, code: resolvedCode } : { missing: true };
}
```

- [ ] **Step 5: Import `HardwareCatalog`/`HardwareRole`**

Find the `import type { ... } from "@/types/kitchen"` (or relative
equivalent) line at the top of `kitchenData.ts` and add
`HardwareCatalog, HardwareRole` to its named type imports.

- [ ] **Step 6: Extend `calculateKitchenMaterials`'s signature, add `warnings`/`costForRole`**

Find:

```ts
export function calculateKitchenMaterials(modules: KitchenModule[], materialCosts?: Map<string, number> | null, finishes?: Finish[] | null): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary } {
```

Replace with:

```ts
export function calculateKitchenMaterials(modules: KitchenModule[], materialCosts?: Map<string, number> | null, finishes?: Finish[] | null, hardwareCatalog?: HardwareCatalog | null): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary; warnings: string[] } {
```

Find:

```ts
  const lines: KitchenMaterialLine[] = [];
```

Replace with:

```ts
  const lines: KitchenMaterialLine[] = [];
  // Populated whenever a hardware role has no resolvable cost (no active
  // is_default material configured for it) — surfaced by the quote UI
  // instead of silently falling back to a hardcoded number. Deduplicated
  // by message since the same missing role can be hit by many modules.
  const warnings: string[] = [];
  const costForRole = (code: string | undefined, role: HardwareRole): { cost: number; code: string } | null => {
    const resolved = resolveHardwareCost(code, role, materialCosts, hardwareCatalog);
    if ("missing" in resolved) {
      const message = `Falta un material predeterminado para: ${HARDWARE_ROLE_LABELS[role]}. Configúralo en Materiales.`;
      if (!warnings.includes(message)) warnings.push(message);
      return null;
    }
    return resolved;
  };
```

- [ ] **Step 7: Rewire the `aereo_hueco_inferior` bisagra call site**

Find:

```ts
        addHardware("bisagra", "Bisagras", 2, "pares", o.drawerSystem === "Soft-close" ? 65 : 35);
```

Replace with:

```ts
        const aereoHinge = costForRole(o.hingeMaterial, "bisagra");
        if (aereoHinge) addHardware("bisagra", "Bisagras", 2, "pares", aereoHinge.cost);
```

- [ ] **Step 8: Rewire the generic door hinge, piston, and push-to-open call sites**

Find:

```ts
      if (doors.length > 0) {
        const hingeCode = o.drawerSystem === "Soft-close" ? "bisagra_amortiguada" : "bisagra_simple";
        const hingeCost = materialCosts?.get(hingeCode) ?? (o.drawerSystem === "Soft-close" ? 65 : 35);
        addHardware("bisagra", "Bisagras", doors.length, "pares", hingeCost);
      }
```

Replace with:

```ts
      if (doors.length > 0) {
        const hinge = costForRole(o.hingeMaterial, "bisagra");
        if (hinge) addHardware("bisagra", "Bisagras", doors.length, "pares", hinge.cost);
      }
```

Find:

```ts
      if (pistonCount > 0) {
        const pistonCost = materialCosts?.get("piston_arriba") ?? HARDWARE_COSTS.piston_arriba;
        addHardware("piston", "Pistones", pistonCount, "pzas", pistonCost);
      }
```

Replace with:

```ts
      if (pistonCount > 0) {
        const piston = costForRole(undefined, "piston");
        if (piston) addHardware("piston", "Pistones", pistonCount, "pzas", piston.cost);
      }
```

Find:

```ts
      if (pushToOpenCount > 0) {
        const pushToOpenCost = materialCosts?.get("push_to_open_puerta") ?? HARDWARE_COSTS.push_to_open_puerta;
        addHardware("push_to_open", "Push to open", pushToOpenCount, "pzas", pushToOpenCost);
      }
```

Replace with:

```ts
      if (pushToOpenCount > 0) {
        const pushToOpen = costForRole(undefined, "push_to_open");
        if (pushToOpen) addHardware("push_to_open", "Push to open", pushToOpenCount, "pzas", pushToOpen.cost);
      }
```

- [ ] **Step 9: Rewire the back-door hinge call site**

Find:

```ts
      if (backDoors.length > 0) {
        const hingeCode = o.drawerSystem === "Soft-close" ? "bisagra_amortiguada" : "bisagra_simple";
        const hingeCost = materialCosts?.get(hingeCode) ?? (o.drawerSystem === "Soft-close" ? 65 : 35);
        addHardware("bisagra", "Bisagras", backDoors.length, "pares", hingeCost);
      }
```

Replace with:

```ts
      if (backDoors.length > 0) {
        const backHinge = costForRole(o.hingeMaterial, "bisagra");
        if (backHinge) addHardware("bisagra", "Bisagras", backDoors.length, "pares", backHinge.cost);
      }
```

- [ ] **Step 10: Rewire the corredera call site**

Find:

```ts
      if (realDrawers.length > 0) {
        const correderaCode = resolveDrawerSlideCode(o.drawerSystem);
        const correderaCost = materialCosts?.get(correderaCode) ?? HARDWARE_COSTS[correderaCode];
        // Keyed (and labeled) per system, not one flat "corredera" bucket —
        // a project mixing Soft-close and Push to open drawers used to
        // merge into one "Correderas" line at an AVERAGED price, so
        // switching one module's system only nudged that average by a few
        // pesos instead of showing up as its own visible line. This is
        // exactly what made a seller's system change look like it did
        // nothing in the summary.
        addHardware(`corredera_${correderaCode}`, `Correderas (${o.drawerSystem})`, realDrawers.length, "pares", correderaCost);
      }
```

Replace with:

```ts
      if (realDrawers.length > 0) {
        const slide = costForRole(o.drawerSystem, "corredera");
        if (slide) {
          // Keyed (and labeled) per resolved code, not one flat "corredera"
          // bucket — a project mixing several corredera SKUs used to merge
          // into one "Correderas" line at an AVERAGED price, so switching
          // one module's SKU only nudged that average by a few pesos
          // instead of showing up as its own visible line.
          const slideName = hardwareCatalog?.nameByCode.get(slide.code) ?? slide.code;
          addHardware(`corredera_${slide.code}`, `Correderas (${slideName})`, realDrawers.length, "pares", slide.cost);
        }
      }
```

- [ ] **Step 11: Rewire the canto call site**

Find:

```ts
  // ── Edge banding — one consolidated line per profile; expandable into a
  // sub-line per module once more than one module uses that profile.
  const EDGE_UNIT_COST = 12;
  for (const [profile, { quantity, perModule }] of edgeAgg) {
    const subLines = Array.from(perModule.entries()).map(([label, ml]) => ({
      label,
      quantity: parseFloat(ml.toFixed(3)),
      unit: "ml",
      unitCost: EDGE_UNIT_COST,
      subtotal: parseFloat((ml * EDGE_UNIT_COST).toFixed(2)),
    }));
    addLine(`Canto ${profile}`, quantity, "ml", EDGE_UNIT_COST, {
      category: "edge",
      subLines: subLines.length > 1 ? subLines : undefined,
    });
  }
```

Replace with (this task does **not** yet set `materialId` — that field
is added in Task 10, which extends this exact block again once it
exists on the type; adding it here would fail this task's own
type-check in Step 14):

```ts
  // ── Edge banding — one consolidated line per profile; expandable into a
  // sub-line per module once more than one module uses that profile. The
  // `profile` label is cosmetic grouping only (edgeProfile has no reachable
  // UI selector — see design spec) — cost always comes from the canto
  // role's default material, never a per-profile rate.
  const canto = costForRole(undefined, "canto");
  if (canto) {
    for (const [profile, { quantity, perModule }] of edgeAgg) {
      const subLines = Array.from(perModule.entries()).map(([label, ml]) => ({
        label,
        quantity: parseFloat(ml.toFixed(3)),
        unit: "ml",
        unitCost: canto.cost,
        subtotal: parseFloat((ml * canto.cost).toFixed(2)),
      }));
      addLine(`Canto ${profile}`, quantity, "ml", canto.cost, {
        category: "edge",
        subLines: subLines.length > 1 ? subLines : undefined,
      });
    }
  }
```

- [ ] **Step 12: Update the return statement**

Find:

```ts
  return {
    lines,
    summary: { materialLines: lines, subtotalMaterials: subtotal, laborCost, profitCost, total, laborPct, profitPct, categoryBreakdown },
  };
}
```

Replace with:

```ts
  return {
    lines,
    summary: { materialLines: lines, subtotalMaterials: subtotal, laborCost, profitCost, total, laborPct, profitPct, categoryBreakdown },
    warnings,
  };
}
```

- [ ] **Step 13: Update `useKitchenStore`'s call site**

Find (`frontend/store/useKitchenStore.ts`):

```ts
      getMaterials: () => calculateKitchenMaterials(get().draft.modules, get().materialCosts, get().finishes),
```

Replace with:

```ts
      getMaterials: () => calculateKitchenMaterials(get().draft.modules, get().materialCosts, get().finishes, get().hardwareCatalog),
```

- [ ] **Step 14: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly. If it doesn't, the most likely cause is a
missed `DrawerSystem`/`resolveDrawerSlideCode` reference elsewhere in
the file — search for both strings and confirm no other call site was
missed.

- [ ] **Step 15: Reasoning check**

No test runner for this file — verify by reading: (a) every one of the
5 roles now routes through `resolveHardwareCost`/`costForRole` — no
`HARDWARE_COSTS[...]`/hardcoded-ternary fallback remains for
bisagra/corredera/piston/push_to_open/canto (confirm via a search for
`HARDWARE_COSTS\.` and `"Soft-close"` in this file — both should have
zero remaining hits outside the deleted code). (b) `DEFAULT_OPTIONS`'s
new `drawerSystem`/`hingeMaterial` values match the migration's
backfilled `is_default` rows exactly (`corredera_softclose`,
`bisagra_amortiguada`) — a brand-new module costs the same immediately
after this ships as it did before. (c) `costForRole`'s warning
deduplication (`if (!warnings.includes(message))`) means a kitchen
with, say, 10 modules all missing the same role's default produces one
warning, not ten.

- [ ] **Step 16: Commit**

```bash
git add types/kitchen.ts services/kitchenData.ts store/useKitchenStore.ts
git commit -m "$(cat <<'EOF'
Route bisagra/corredera/piston/push_to_open/canto costs through the materials catalog

resolveHardwareCost replaces every hardcoded switch/ternary/fallback-
constant for these five roles. hingeMaterial is a new field, decoupled
from drawerSystem (which itself changes from a closed DrawerSystem
union to a material code). A role with no resolvable cost produces a
warning instead of a silently wrong number.
EOF
)"
```

---

### Task 5: Compatibility layer — existing drafts keep computing the same numbers

**Files:**
- Modify: `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `ModuleOptions.drawerSystem`/`hingeMaterial` (Task 4).
- Produces: `normalizeLegacyHardwareOptions(opt: ModuleOptions): ModuleOptions`, applied inside the `persist` `migrate` function and inside `loadProject`.

- [ ] **Step 1: Add the mapping table and normalization function**

Find (`frontend/store/useKitchenStore.ts`), locate the file's top-level
helper functions (near `applyTowers`/`GLOBAL_MATERIAL_FIELDS`, before
the `create(...)` call that defines the store) and add, immediately
before the store's `create(...)persist(...)` block:

```ts
// Pre-Task-4 saved drafts (local persist or a server KitchenProject)
// stored drawerSystem as one of 5 closed-union literal labels and had
// no hingeMaterial field at all — see the design spec's compatibility
// section. Both call sites below (persist's migrate, and loadProject)
// apply this before the draft ever reaches calculateKitchenMaterials,
// so a reopened old draft/quote computes exactly the same numbers it
// did before hingeMaterial/the corredera code change existed.
const LEGACY_DRAWER_SYSTEM_TO_CODE: Record<string, string> = {
  "Simple": "corredera_simple",
  "Self-close": "corredera_self_close",
  "Soft-close": "corredera_softclose",
  "Push to open": "corredera_push_to_open",
  "Extracción total": "corredera_extraccion",
};

function normalizeLegacyHardwareOptions(opt: KitchenModule["options"]): KitchenModule["options"] {
  const legacyDrawerSystem = opt.drawerSystem;
  const hingeMaterial = opt.hingeMaterial
    ?? (legacyDrawerSystem === "Soft-close" ? "bisagra_amortiguada" : "bisagra_simple");
  const drawerSystem = LEGACY_DRAWER_SYSTEM_TO_CODE[legacyDrawerSystem] ?? legacyDrawerSystem;
  return { ...opt, drawerSystem, hingeMaterial };
}

function normalizeLegacyHardwareInDraft(draft: KitchenDraft): KitchenDraft {
  return { ...draft, modules: draft.modules.map((m) => ({ ...m, options: normalizeLegacyHardwareOptions(m.options) })) };
}
```

- [ ] **Step 2: Apply it in the `persist` migration**

Find:

```ts
      version: 4,
      migrate: (persistedState) => {
        const state = persistedState as Partial<PersistedKitchenState> | undefined;
        if (!state?.draft) return { draft: initialDraft, projectId: null };
        return { draft: { ...initialDraft, ...state.draft }, projectId: state.projectId ?? null };
      },
```

Replace with:

```ts
      // Bumped 4->5: normalizeLegacyHardwareInDraft needs to run on every
      // already-persisted draft once, translating drawerSystem's old
      // literal values into material codes and backfilling hingeMaterial —
      // see normalizeLegacyHardwareOptions above. Idempotent, so re-running
      // it on an already-migrated draft (e.g. after a second version bump
      // in the future) is always safe.
      version: 5,
      migrate: (persistedState) => {
        const state = persistedState as Partial<PersistedKitchenState> | undefined;
        if (!state?.draft) return { draft: initialDraft, projectId: null };
        const draft = normalizeLegacyHardwareInDraft({ ...initialDraft, ...state.draft });
        return { draft, projectId: state.projectId ?? null };
      },
```

- [ ] **Step 3: Apply it in `loadProject`**

Find:

```ts
      loadProject: (projectId, draft) =>
        set({ draft, projectId, showSelector: false, activeTab: "3d", undoStack: [], redoStack: [] }),
```

Replace with:

```ts
      loadProject: (projectId, draft) =>
        set({ draft: normalizeLegacyHardwareInDraft(draft), projectId, showSelector: false, activeTab: "3d", undoStack: [], redoStack: [] }),
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 5: Verify the mapping logic with a differential script**

No test runner for this file — verify the exact logic added in Step 1
directly:

```js
const LEGACY_DRAWER_SYSTEM_TO_CODE = {
  "Simple": "corredera_simple",
  "Self-close": "corredera_self_close",
  "Soft-close": "corredera_softclose",
  "Push to open": "corredera_push_to_open",
  "Extracción total": "corredera_extraccion",
};
function normalize(opt) {
  const legacyDrawerSystem = opt.drawerSystem;
  const hingeMaterial = opt.hingeMaterial
    ?? (legacyDrawerSystem === "Soft-close" ? "bisagra_amortiguada" : "bisagra_simple");
  const drawerSystem = LEGACY_DRAWER_SYSTEM_TO_CODE[legacyDrawerSystem] ?? legacyDrawerSystem;
  return { ...opt, drawerSystem, hingeMaterial };
}

// Case A: old literal "Soft-close", no hingeMaterial yet -> corredera_softclose + bisagra_amortiguada
console.assert(JSON.stringify(normalize({ drawerSystem: "Soft-close" })) === JSON.stringify({ drawerSystem: "corredera_softclose", hingeMaterial: "bisagra_amortiguada" }), "A failed");

// Case B: old literal "Simple", no hingeMaterial yet -> corredera_simple + bisagra_simple (non-Soft-close branch)
console.assert(JSON.stringify(normalize({ drawerSystem: "Simple" })) === JSON.stringify({ drawerSystem: "corredera_simple", hingeMaterial: "bisagra_simple" }), "B failed");

// Case C: already-migrated module (drawerSystem already a code, hingeMaterial already set) -> untouched
console.assert(JSON.stringify(normalize({ drawerSystem: "corredera_softclose", hingeMaterial: "bisagra_simple" })) === JSON.stringify({ drawerSystem: "corredera_softclose", hingeMaterial: "bisagra_simple" }), "C failed");

// Case D: idempotent re-run of case A's output -> unchanged
console.assert(JSON.stringify(normalize(normalize({ drawerSystem: "Soft-close" }))) === JSON.stringify(normalize({ drawerSystem: "Soft-close" })), "D failed");

console.log("all cases passed");
```

Run it with `node` and confirm `"all cases passed"`.

- [ ] **Step 6: Commit**

```bash
git add store/useKitchenStore.ts
git commit -m "$(cat <<'EOF'
Add compatibility mapping for pre-existing drawerSystem/hingeMaterial values

normalizeLegacyHardwareOptions translates the 5 old DrawerSystem
literals into corredera material codes and backfills hingeMaterial
using the exact same logic the deleted hinge ternary used — applied on
persist rehydration (version bumped 4->5) and on loadProject, so every
existing saved draft or reopened project computes the same numbers it
did before this change.
EOF
)"
```

---

### Task 6: ModuleInspector UI — dynamic corredera options, new Bisagra selector

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx`

**Interfaces:**
- Consumes: `KitchenStore.hardwareOptionsByRole` (Task 3), `ModuleOptions.hingeMaterial` (Task 4).

- [ ] **Step 1: Destructure `hardwareOptionsByRole` from the store**

Find:

```ts
  const {
    draft, getEditingModule, updateModule, setEditingModule, removeModule, duplicateModule, rotateModule, toggleModuleLock,
    applyExteriorToAll, applyExteriorToBand, applyHardwareToAll, applyCountertopToAll, applyZocaloMaterialToAll, placeAccessoryInNiche,
    setIslandModeManual, updateSharedMaletero,
  } = useKitchenStore();
```

Replace with:

```ts
  const {
    draft, getEditingModule, updateModule, setEditingModule, removeModule, duplicateModule, rotateModule, toggleModuleLock,
    applyExteriorToAll, applyExteriorToBand, applyHardwareToAll, applyCountertopToAll, applyZocaloMaterialToAll, placeAccessoryInNiche,
    setIslandModeManual, updateSharedMaletero, hardwareOptionsByRole,
  } = useKitchenStore();
```

- [ ] **Step 2: Make "Sistema de cajón"'s options dynamic**

Find:

```tsx
              {!isFixedDrawerHueco && opt.drawers > 0 && (
                <FieldGroup label="Sistema de cajón">
                  <SelectInput
                    value={opt.drawerSystem}
                    onChange={(v) => updateOpt("drawerSystem", v)}
                    options={[
                      { value: "Simple", label: "Simple" },
                      { value: "Self-close", label: "Self-close" },
                      { value: "Soft-close", label: "Soft-close" },
                      { value: "Push to open", label: "Push to open" },
                      { value: "Extracción total", label: "Extracción total" },
                    ]}
                  />
                </FieldGroup>
              )}
```

Replace with:

```tsx
              {!isFixedDrawerHueco && opt.drawers > 0 && (
                <FieldGroup label="Sistema de cajón">
                  <SelectInput
                    value={opt.drawerSystem}
                    onChange={(v) => updateOpt("drawerSystem", v)}
                    options={hardwareOptionsByRole.corredera.map((m) => ({ value: m.code, label: m.name }))}
                  />
                </FieldGroup>
              )}
              {opt.doors > 0 && (
                <FieldGroup label="Bisagra">
                  <SelectInput
                    value={opt.hingeMaterial}
                    onChange={(v) => updateOpt("hingeMaterial", v)}
                    options={hardwareOptionsByRole.bisagra.map((m) => ({ value: m.code, label: m.name }))}
                  />
                </FieldGroup>
              )}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Reasoning check**

No test runner for this file — verify by reading: (a) if
`hardwareOptionsByRole.corredera`/`.bisagra` is empty (materials not
loaded yet, or no active material with that role exists), the
`SelectInput` renders with zero `<option>`s and an unchanged-but-now-
unlisted `value` — this is a pre-existing `<select>` browser behavior,
not a crash; the underlying `opt.drawerSystem`/`hingeMaterial` string
value is untouched until the user interacts with the dropdown. (b) The
new "Bisagra" field is gated on `opt.doors > 0`, matching exactly the
condition the cost engine uses (`doors.length > 0` in
`calculateKitchenMaterials`, Task 4 Step 8) — never shown for a
drawers-only module that has no hinge cost to control. (c)
`updateOpt("hingeMaterial", v)` uses the exact same generic
`updateOpt` helper already used for `drawerSystem` and every other
option field — no special-casing needed since `hingeMaterial` is just
another `keyof ModOptions`.

- [ ] **Step 5: Commit**

```bash
git add components/kitchen/ModuleInspector.tsx
git commit -m "$(cat <<'EOF'
Source corredera options dynamically, add independent Bisagra selector

"Sistema de cajón" now lists whatever materials are active under
hardware_role=corredera instead of 5 hardcoded literals. A new
"Bisagra" field, shown whenever the module has doors, lets the hinge be
picked independently instead of being implicitly derived from the
drawer system.
EOF
)"
```

---

### Task 7: Closet tower builder — dynamic corredera selection

**Files:**
- Modify: `frontend/types/closetTower.ts`
- Modify: `frontend/components/kitchen/TowerDialog.tsx`
- Modify: `frontend/services/closetTower.test.ts`

**Interfaces:**
- Consumes: `KitchenStore.hardwareOptionsByRole` (Task 3).
- Produces: `TowerSection.drawerSystem?: string` (type changed from the
  closed `DrawerSystem` union — this file has its own independent
  "Sistema de cajón" picker, entirely separate from
  `ModuleInspector.tsx`'s, discovered during this plan's own
  cross-check of every `.drawerSystem` usage in the codebase).

- [ ] **Step 1: Change `TowerSection.drawerSystem`'s type, drop the now-unused import**

Find (`frontend/types/closetTower.ts`):

```ts
import type { DrawerSystem } from "@/types/kitchen";

export type TowerContent = "cajones" | "repisas" | "hueco" | "colgar" | "zapatera";
```

Replace with:

```ts
export type TowerContent = "cajones" | "repisas" | "hueco" | "colgar" | "zapatera";
```

Find:

```ts
  // Only meaningful for content "cajones" — the drawer-slide mechanism this
  // section's drawers use. Omitted = the catalog default (Soft-close).
  drawerSystem?: DrawerSystem;
```

Replace with:

```ts
  // Only meaningful for content "cajones" — the drawer-slide mechanism this
  // section's drawers use (a materials-catalog corredera code). Omitted =
  // the catalog default (corredera_softclose).
  drawerSystem?: string;
```

- [ ] **Step 2: Make `TowerDialog`'s picker dynamic**

Find (`frontend/components/kitchen/TowerDialog.tsx`):

```tsx
import { useKitchenStore } from "@/store/useKitchenStore";
import { Input, NumberInput } from "@/components/ui/input";
import { placeNewTower, resolveTowerHeights, sectionLabel, TOWER_CONTENT_DEFAULTS } from "@/services/closetTower";
import type { TowerPlacementKind } from "@/services/closetTower";
import type { TowerContent, TowerRecipe, TowerSection } from "@/types/closetTower";
import type { DrawerSystem } from "@/types/kitchen";
```

Replace with:

```tsx
import { useKitchenStore } from "@/store/useKitchenStore";
import { Input, NumberInput } from "@/components/ui/input";
import { placeNewTower, resolveTowerHeights, sectionLabel, TOWER_CONTENT_DEFAULTS } from "@/services/closetTower";
import type { TowerPlacementKind } from "@/services/closetTower";
import type { TowerContent, TowerRecipe, TowerSection } from "@/types/closetTower";
```

Find:

```tsx
// Only meaningful for content "cajones" — every other content has no
// drawers to slide.
const DRAWER_SYSTEM_OPTIONS: DrawerSystem[] = ["Simple", "Self-close", "Soft-close", "Push to open", "Extracción total"];
```

Replace with:

```tsx
// Only meaningful for content "cajones" — every other content has no
// drawers to slide. Options come from the same active corredera-role
// materials as ModuleInspector's "Sistema de cajón" selector (see
// hardwareOptionsByRole below) — no hardcoded list.
```

Find:

```tsx
  const { draft, addTower, updateTower } = useKitchenStore();
```

Replace with:

```tsx
  const { draft, addTower, updateTower, hardwareOptionsByRole } = useKitchenStore();
```

Find:

```tsx
                  {selectedSection.content === "cajones" && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-warmgray">Sistema de cajón</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {DRAWER_SYSTEM_OPTIONS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => patchSection(selectedSection.id, { drawerSystem: s })}
                            aria-pressed={(selectedSection.drawerSystem ?? "Soft-close") === s}
                            className={toggleButtonClass((selectedSection.drawerSystem ?? "Soft-close") === s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
```

Replace with:

```tsx
                  {selectedSection.content === "cajones" && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-warmgray">Sistema de cajón</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {hardwareOptionsByRole.corredera.map((m) => (
                          <button
                            key={m.code}
                            type="button"
                            onClick={() => patchSection(selectedSection.id, { drawerSystem: m.code })}
                            aria-pressed={(selectedSection.drawerSystem ?? "corredera_softclose") === m.code}
                            className={toggleButtonClass((selectedSection.drawerSystem ?? "corredera_softclose") === m.code)}
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Fix the 3 breaking test assertions**

Find (`frontend/services/closetTower.test.ts`):

```ts
  it("passes a cajones section's drawerSystem through, without touching the catalog default when unset", () => {
    const chosen = generateTowerModules(recipe({ sections: [section({ id: "a", content: "cajones", drawerSystem: "Push to open" })] }));
    expect(chosen[0].options.drawerSystem).toBe("Push to open");

    const unset = generateTowerModules(recipe({ sections: [section({ id: "a", content: "cajones" })] }));
    expect(unset[0].options.drawerSystem).toBe("Soft-close"); // cajonera_closet's own catalog default
  });

  it("ignores drawerSystem on a non-cajones section", () => {
    const mods = generateTowerModules(recipe({ sections: [section({ id: "a", content: "repisas", drawerSystem: "Simple" })] }));
    expect(mods[0].options.drawerSystem).toBe("Soft-close"); // nicho_closet's own catalog default, untouched
  });
```

Replace with:

```ts
  it("passes a cajones section's drawerSystem through, without touching the catalog default when unset", () => {
    const chosen = generateTowerModules(recipe({ sections: [section({ id: "a", content: "cajones", drawerSystem: "corredera_push_to_open" })] }));
    expect(chosen[0].options.drawerSystem).toBe("corredera_push_to_open");

    const unset = generateTowerModules(recipe({ sections: [section({ id: "a", content: "cajones" })] }));
    expect(unset[0].options.drawerSystem).toBe("corredera_softclose"); // cajonera_closet's own catalog default
  });

  it("ignores drawerSystem on a non-cajones section", () => {
    const mods = generateTowerModules(recipe({ sections: [section({ id: "a", content: "repisas", drawerSystem: "corredera_simple" })] }));
    expect(mods[0].options.drawerSystem).toBe("corredera_softclose"); // nicho_closet's own catalog default, untouched
  });
```

Find:

```ts
    // Catalog defaults survive: doorStyle/drawerSystem/includesCountertop
    expect(mods[0].options.doorStyle).toBe("Sin puerta");
    expect(mods[0].options.drawerSystem).toBe("Soft-close");
    expect(mods[0].options.includesCountertop).toBe(false);
```

Replace with:

```ts
    // Catalog defaults survive: doorStyle/drawerSystem/includesCountertop
    expect(mods[0].options.doorStyle).toBe("Sin puerta");
    expect(mods[0].options.drawerSystem).toBe("corredera_softclose");
    expect(mods[0].options.includesCountertop).toBe(false);
```

- [ ] **Step 5: Run the existing test suite**

Run: `cd frontend && npx vitest run closetTower.test.ts`
Expected: all tests pass, including the 3 updated assertions.

- [ ] **Step 6: Manual verification**

Run the dev server, open the closet tower builder ("Torres"), add a
"Cajones" section, and confirm the "Sistema de cajón" toggle buttons
now show material names from the catalog instead of the old 5 fixed
labels, and that selecting one generates a module whose corredera cost
resolves correctly (no "Cotización incompleta" warning) in the
summary.

- [ ] **Step 7: Commit**

```bash
git add types/closetTower.ts components/kitchen/TowerDialog.tsx services/closetTower.test.ts
git commit -m "$(cat <<'EOF'
Source the closet tower builder's corredera picker from the materials catalog too

TowerDialog had its own independent "Sistema de cajón" selector with
the same 5 hardcoded literals ModuleInspector used to have before this
plan's Task 6. TowerSection.drawerSystem changes from the closed
DrawerSystem union to a material code, matching ModuleOptions.drawerSystem
(Task 4) — a tower section generated through this builder now costs its
corredera correctly instead of writing a stale literal value. Updates
the 3 existing closetTower.test.ts assertions that asserted the old
literals.
EOF
)"
```

---

### Task 8: KitchenSummary UI — visible warning banner

**Files:**
- Modify: `frontend/components/kitchen/KitchenSummary.tsx`

**Interfaces:**
- Consumes: `calculateKitchenMaterials`'s `warnings: string[]` (Task 4, via `getMaterials()`).

- [ ] **Step 1: Destructure `warnings`**

Find:

```ts
  const { draft, getMaterials, materialCosts } = useKitchenStore();
  const { lines, summary } = useMemo(() => getMaterials(), [draft.modules, materialCosts]);
```

Replace with:

```ts
  const { draft, getMaterials, materialCosts } = useKitchenStore();
  const { lines, summary, warnings } = useMemo(() => getMaterials(), [draft.modules, materialCosts]);
```

- [ ] **Step 2: Render the banner above the material lines table**

Find:

```tsx
        <div className="mt-6 min-w-0 flex-1 space-y-6 md:mt-0">
          {/* Material lines */}
          {lines.length > 0 && (
            <div ref={materialsSectionRef} className="scroll-mt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Desglose de materiales</p>
```

Replace with:

```tsx
        <div className="mt-6 min-w-0 flex-1 space-y-6 md:mt-0">
          {!hidePricing && warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              <p className="mb-1 font-semibold">Cotización incompleta</p>
              <ul className="list-inside list-disc space-y-0.5">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          {/* Material lines */}
          {lines.length > 0 && (
            <div ref={materialsSectionRef} className="scroll-mt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Desglose de materiales</p>
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Commit**

```bash
git add components/kitchen/KitchenSummary.tsx
git commit -m "$(cat <<'EOF'
Surface hardware-role warnings as a visible banner in the quote breakdown

A missing/misconfigured default (no active is_default material for a
role) now shows a clear "Cotización incompleta" banner instead of the
line silently disappearing or reverting to a stale number.
EOF
)"
```

---

### Task 9: CRUD completeness — `/materials`

**Files:**
- Modify: `frontend/components/materials/MaterialFormModal.tsx`
- Modify: `frontend/app/materials/page.tsx`

**Interfaces:**
- Consumes: `MaterialInput.hardwareRole`/`isDefault` (Task 2), `MaterialRow.hardwareRole`/`isDefault` (Task 2, via the existing `MaterialRow` type alias).

- [ ] **Step 1: Fix `TYPE_OPTIONS`, add the "Rol de hardware" field**

Find (`frontend/components/materials/MaterialFormModal.tsx`):

```tsx
import { createMaterial, updateMaterial, type MaterialInput } from "@/services/api";

const TYPE_OPTIONS = ["Tablero", "Herraje", "Acabado", "Fijación", "Cubierta", "Pistón", "Otro"];

interface EditableMaterial {
  id: number;
  name: string;
  code: string | null;
  type: string;
  unit: string;
  cost: number;
  stock: number;
  active: boolean;
}
```

Replace with:

```tsx
import { createMaterial, updateMaterial, type MaterialInput } from "@/services/api";
import type { HardwareRole } from "@/types/kitchen";

const TYPE_OPTIONS = ["Tablero", "Herraje", "Acabado", "Fijación", "Cubierta", "Pistón", "Corredera", "Push to open", "Otro"];
const HARDWARE_ROLE_OPTIONS: { value: HardwareRole | ""; label: string }[] = [
  { value: "", label: "— Ninguno —" },
  { value: "bisagra", label: "Bisagra" },
  { value: "corredera", label: "Corredera" },
  { value: "piston", label: "Pistón" },
  { value: "push_to_open", label: "Push to open" },
  { value: "canto", label: "Canto" },
];

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

- [ ] **Step 2: Add `hardwareRole` state, submit it**

Find:

```tsx
  const [active, setActive] = useState(material?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const parsedCost = cost.trim() === "" ? NaN : Number(cost);
    const parsedStock = stock.trim() === "" ? NaN : Number(stock);
    if (!name.trim() || !unit.trim() || Number.isNaN(parsedCost) || Number.isNaN(parsedStock)) {
      setError("Nombre, unidad, costo y stock son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: MaterialInput = { name: name.trim(), code: code.trim() || null, type, unit: unit.trim(), cost: parsedCost, stock: parsedStock, active };
```

Replace with:

```tsx
  const [active, setActive] = useState(material?.active ?? true);
  const [hardwareRole, setHardwareRole] = useState<HardwareRole | "">(material?.hardwareRole ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const parsedCost = cost.trim() === "" ? NaN : Number(cost);
    const parsedStock = stock.trim() === "" ? NaN : Number(stock);
    if (!name.trim() || !unit.trim() || Number.isNaN(parsedCost) || Number.isNaN(parsedStock)) {
      setError("Nombre, unidad, costo y stock son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: MaterialInput = { name: name.trim(), code: code.trim() || null, type, unit: unit.trim(), cost: parsedCost, stock: parsedStock, active, hardwareRole: type === "Tablero" ? null : (hardwareRole || null) };
```

- [ ] **Step 3: Render the select, disabled for Tablero**

Find:

```tsx
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Categoría</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white">
              {TYPE_OPTIONS.map((t) => <option key={t} value={t} className="bg-zinc-900">{t}</option>)}
            </select>
          </div>
```

Replace with:

```tsx
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Categoría</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white">
              {TYPE_OPTIONS.map((t) => <option key={t} value={t} className="bg-zinc-900">{t}</option>)}
            </select>
          </div>
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

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 5: Add the "Rol" column, generalized default action, error handling**

Find (`frontend/app/materials/page.tsx`):

```tsx
  const handleSetDefault = async (material: MaterialRow, band: "defaultFloor" | "defaultWall") => {
    if (!(material.name in BOARD_COSTS)) {
      window.alert(`"${material.name}" no coincide con ningún tipo de tablero reconocido. Solo un material cuyo nombre coincida exactamente con un tipo de tablero existente (ej. "MDF 18mm", "Melamina blanca 15mm") puede ser el predeterminado.`);
      return;
    }
    await updateMaterial(material.id, { [band]: true });
    reload();
  };

  const handleDelete = async (material: MaterialRow) => {
    if (!window.confirm(`¿Eliminar "${material.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteMaterial(material.id);
    reload();
  };
```

Replace with:

```tsx
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSetDefault = async (material: MaterialRow, band: "defaultFloor" | "defaultWall") => {
    if (!(material.name in BOARD_COSTS)) {
      window.alert(`"${material.name}" no coincide con ningún tipo de tablero reconocido. Solo un material cuyo nombre coincida exactamente con un tipo de tablero existente (ej. "MDF 18mm", "Melamina blanca 15mm") puede ser el predeterminado.`);
      return;
    }
    await updateMaterial(material.id, { [band]: true });
    reload();
  };

  const handleSetHardwareDefault = async (material: MaterialRow) => {
    setActionError(null);
    try {
      await updateMaterial(material.id, { isDefault: true });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No fue posible marcar el material como predeterminado.");
    }
  };

  const handleDelete = async (material: MaterialRow) => {
    if (!window.confirm(`¿Eliminar "${material.name}"? Esta acción no se puede deshacer.`)) return;
    setActionError(null);
    try {
      await deleteMaterial(material.id);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No fue posible eliminar el material.");
    }
  };
```

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
    setActionError(null);
    try {
      await updateMaterial(material.id, { active: !material.active });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No fue posible cambiar el estado del material.");
    }
  };
```

Find:

```tsx
            <h3 className="text-xl font-semibold">CRUD de materiales</h3>
            <p className="text-sm text-zinc-400">Vista lista para alta, edición y activación de catálogo.</p>
          </div>
          <Button onClick={() => setEditing("new")}>Nuevo material</Button>
        </div>
```

Replace with:

```tsx
            <h3 className="text-xl font-semibold">CRUD de materiales</h3>
            <p className="text-sm text-zinc-400">Vista lista para alta, edición y activación de catálogo.</p>
          </div>
          <Button onClick={() => setEditing("new")}>Nuevo material</Button>
        </div>
        {actionError && <p className="mb-4 text-sm text-rose-400">{actionError}</p>}
```

Find:

```tsx
                <tr>{['Nombre', 'Tipo', 'Unidad', 'Costo unitario', 'Stock', 'Estado', 'Acciones'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
```

Replace with:

```tsx
                <tr>{['Nombre', 'Tipo', 'Rol', 'Unidad', 'Costo unitario', 'Stock', 'Estado', 'Acciones'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
```

Find:

```tsx
                    <td className="px-4 py-4"><Badge tone={material.type === 'Tablero' ? 'indigo' : material.type === 'Herraje' ? 'amber' : 'emerald'}>{material.type}</Badge></td>
                    <td className="px-4 py-4 text-zinc-400">{material.unit}</td>
```

Replace with:

```tsx
                    <td className="px-4 py-4"><Badge tone={material.type === 'Tablero' ? 'indigo' : material.type === 'Herraje' ? 'amber' : 'emerald'}>{material.type}</Badge></td>
                    <td className="px-4 py-4">{material.hardwareRole ? <Badge tone="amber">{material.hardwareRole}</Badge> : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-4 py-4 text-zinc-400">{material.unit}</td>
```

Find:

```tsx
                        {material.type === "Tablero" && (
                          material.defaultWall
                            ? <Badge tone="indigo">Predeterminado pared</Badge>
                            : <Button variant="ghost" className="h-9" onClick={() => handleSetDefault(material, "defaultWall")}>Predeterminado pared</Button>
                        )}
                      </div>
                    </td>
```

Replace with:

```tsx
                        {material.type === "Tablero" && (
                          material.defaultWall
                            ? <Badge tone="indigo">Predeterminado pared</Badge>
                            : <Button variant="ghost" className="h-9" onClick={() => handleSetDefault(material, "defaultWall")}>Predeterminado pared</Button>
                        )}
                        {material.hardwareRole && (
                          material.isDefault
                            ? <Badge tone="indigo">Predeterminado ({material.hardwareRole})</Badge>
                            : <Button variant="ghost" className="h-9" onClick={() => handleSetHardwareDefault(material)}>Predeterminado ({material.hardwareRole})</Button>
                        )}
                      </div>
                    </td>
```

- [ ] **Step 6: Import `useState` if not already**

Check the top of `frontend/app/materials/page.tsx` — it already has
`import { useEffect, useState } from "react";` (confirmed in the
current file), so no import change is needed for the new
`actionError` state.

- [ ] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 8: Manual browser verification**

Run the dev server (`cd frontend && npm run dev`), open `/materials`,
and verify: (a) creating/editing a "Herraje" material shows the "Rol
de hardware" select; switching type to "Tablero" disables it and shows
the disabled-state hint text. (b) A material with `hardware_role` set
shows a "Rol" badge and, if not yet `is_default`, a clickable
"Predeterminado (<rol>)" button; clicking it and reloading shows the
badge flip to the previous default row. (c) Attempting to deactivate
or delete a material currently marked as a default (any role, or
floor/wall) shows the backend's rejection message as a red banner
instead of silently doing nothing.

- [ ] **Step 9: Commit**

```bash
git add components/materials/MaterialFormModal.tsx app/materials/page.tsx
git commit -m "$(cat <<'EOF'
Add hardware-role field to Materials CRUD, fix TYPE_OPTIONS, surface backend errors

TYPE_OPTIONS now includes "Corredera"/"Push to open" (existing seed
data already used these but the dropdown never offered them). A new
"Rol de hardware" select lets an admin tag any non-Tablero material;
the list page gains a "Rol" column, a generalized "Predeterminado
(<rol>)" action, and now surfaces backend validation errors (e.g. the
deactivation guard) instead of silently swallowing them.
EOF
)"
```

---

### Task 10: Traceability — `materialId` on the canto quote line

**Files:**
- Modify: `frontend/types/kitchen.ts`
- Modify: `frontend/services/kitchenData.ts`

**Interfaces:**
- Consumes: `HardwareCatalog.idByCode` (Task 3), `resolveHardwareCost`'s returned `code` (Task 4).
- Produces: `KitchenMaterialLine.materialId?: number`.

- [ ] **Step 1: Add `materialId` to `KitchenMaterialLine`**

Find:

```ts
export interface KitchenMaterialLine {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  subtotal: number;
  category?: KitchenCostCategory;
```

Replace with:

```ts
export interface KitchenMaterialLine {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  subtotal: number;
  category?: KitchenCostCategory;
  /** The materials-catalog row this line's cost came from, when
   *  unambiguous (a single-SKU role, e.g. canto). Informational only —
   *  no FK, never rewritten once a quote is saved (see KitchenQuote's
   *  frozen material_lines snapshot). A line that blends multiple SKUs
   *  (e.g. mixed bisagra/corredera choices across modules) omits it
   *  rather than attribute the line to just one of them. */
  materialId?: number;
```

- [ ] **Step 2: Extend `addLine`'s `extra` parameter type**

Find (`frontend/services/kitchenData.ts`):

```ts
  const addLine = (
    desc: string,
    qty: number,
    unit: string,
    unitCost: number,
    extra?: Partial<Pick<KitchenMaterialLine, "category" | "cutDetails" | "cutLayout" | "subLines">>,
  ) => {
```

Replace with:

```ts
  const addLine = (
    desc: string,
    qty: number,
    unit: string,
    unitCost: number,
    extra?: Partial<Pick<KitchenMaterialLine, "category" | "cutDetails" | "cutLayout" | "subLines" | "materialId">>,
  ) => {
```

- [ ] **Step 3: Pass `materialId` at the canto call site**

Find (the canto block from Task 4 Step 11):

```ts
      addLine(`Canto ${profile}`, quantity, "ml", canto.cost, {
        category: "edge",
        subLines: subLines.length > 1 ? subLines : undefined,
      });
```

Replace with:

```ts
      addLine(`Canto ${profile}`, quantity, "ml", canto.cost, {
        category: "edge",
        subLines: subLines.length > 1 ? subLines : undefined,
        materialId: hardwareCatalog?.idByCode.get(canto.code),
      });
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 5: Reasoning check**

No test runner for this file — verify by reading: (a) `materialId` is
only populated for the canto line, the one role whose cost line is
built via a single direct `addLine` call with an unambiguous single
resolved `code` — bisagra/corredera/piston/push_to_open all flow
through `addHardware`'s `hardwareAgg` aggregation-then-flush path
(kitchenData.ts:~2910-2930), which can blend multiple distinct
material codes into one displayed line (e.g. two modules using
different bisagra SKUs) and has no per-entry code tracking today;
deliberately left without `materialId` in this pass rather than
attribute a blended line to one arbitrary SKU. (b) `KitchenQuote.
material_lines` (backend) needs no schema change — `materialId` rides
the same `array`-cast JSON column every other `KitchenMaterialLine`
field already does, exactly like `category`/`cutDetails` before it.

- [ ] **Step 6: Commit**

```bash
git add types/kitchen.ts services/kitchenData.ts
git commit -m "$(cat <<'EOF'
Add materialId to the canto quote line for traceability

KitchenMaterialLine.materialId records which catalog row an
unambiguous single-SKU line's cost came from (canto only, for now —
bisagra/corredera/piston/push_to_open aggregate through a path that
can blend multiple SKUs into one line, deliberately left unattributed
rather than pick one arbitrarily). Informational only; no FK, and
already-saved quotes are unaffected since it's an additive JSON field.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** §1 backend (Task 1) · §2 API/store (Tasks 2 & 3) ·
  §3 cost engine (Task 4) · §4 compatibility (Task 5) · §5 error
  handling (Task 8) · §6 CRUD completeness (Task 9) · §7 traceability
  (Task 10) · UI dynamic selection for bisagra/corredera (Task 6).
  Every numbered section of the design spec has a corresponding task.
  Task 7 (closet tower builder) is an addition discovered while writing
  this plan — a second, independent hardcoded corredera picker
  (`TowerDialog.tsx`) the spec's own research pass missed entirely; see
  its own rationale note at the top of that task.
- **Placeholder scan:** none — every step has complete, literal code;
  Task 4 Step 11 explicitly calls out and resolves its own
  forward-reference ambiguity (the `materialId` field not existing
  until Task 10) by specifying the exact version to use at that point
  in the sequence.
- **Type consistency:** `hardwareRole`/`isDefault` (camelCase,
  frontend) map 1:1 to `hardware_role`/`is_default` (snake_case,
  backend) identically across Tasks 1, 2, 3, and 9 — the same
  convention already established for `cost_per_unit` ↔ `cost`.
  `HardwareRole`/`HardwareCatalog` (Task 2/3's types) are consumed with
  matching names and shapes in Task 4's `resolveHardwareCost`/
  `costForRole`, Tasks 6 & 7's `hardwareOptionsByRole` usage (the same
  store field feeds both the module inspector and the tower builder),
  and Task 10's `idByCode` lookup. `ModuleOptions.hingeMaterial`/
  `drawerSystem` (Task 4) — and `TowerSection.drawerSystem` (Task 7),
  which must hold the same kind of value since `closetTower.ts` copies
  it straight across — are consumed with matching names in Task 5's
  compatibility function, Tasks 6 & 7's selectors, and every cost-engine
  call site.
- **Scope check:** ten tasks, each touching a narrow, mostly-disjoint
  file set — Task 1 is backend-only; Tasks 2–3 and 4–5 build directly
  on each other in sequence (types → store → cost engine →
  compatibility) since each genuinely consumes the previous task's new
  exports; Tasks 6–10 (UI, closet tower, warnings, CRUD, traceability)
  each consume earlier tasks' outputs but don't depend on each other
  and could be reordered or parallelized by a reviewer if desired.
- **Ambiguity check:** the "why is `is_default` never a fallback
  price" rule (no `HARDWARE_COSTS[...]` fallback survives for these 5
  roles) is stated identically in the spec, the Global Constraints, and
  Task 4's `resolveHardwareCost` docblock — not left for the
  implementer to infer. The materialId traceability scope limitation
  (canto only, not bisagra/corredera/piston/push_to_open) is stated
  explicitly in Task 10 rather than silently under-delivering against
  the spec's broader-sounding "traceability" goal. Task 7's existence
  is itself the product of an ambiguity check on the *spec* — every
  `.drawerSystem` reference in the codebase was searched for and
  cross-checked against the spec's claims before this plan was
  finalized, rather than trusting the spec's Current State section at
  face value.

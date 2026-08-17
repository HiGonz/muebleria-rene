# User Roles (Admin / Vendedor / Taller) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a real (backend + frontend) role matrix for `admin`/`seller`(Vendedor)/`taller`(Taller), add an admin-only user-management screen, and show project ownership everywhere a project list already renders.

**Architecture:** Backend: plain Laravel Gates reading the existing `users.role` string column (no new tables, not adopting the already-installed-but-unused `spatie/laravel-permission`), applied as route middleware plus one in-controller branch for `KitchenProjectController::update` (taller's status-only path can't be expressed as route middleware alone). Frontend: widen the already-existing `AuthUser.role` type, filter the sidebar and gate each page by role, add an owner column to the two project list pages, and hide taller from every design/pricing surface inside the kitchen builder itself.

**Tech Stack:** Laravel 12 (Gates, Sanctum), Next.js 16 + Zustand, existing CRUD-page conventions (Materials/Finishes).

**Spec:** `docs/superpowers/specs/2026-08-17-user-roles-design.md`

## Global Constraints

- Valid `role` values: `admin`, `seller`, `taller` — validated via `Rule::in([...])` everywhere a role is written, never a DB enum.
- Not adopting `spatie/laravel-permission` — plain `Gate::define` closures reading `$user->role` directly.
- Vendedor (`seller`) sees **every** project regardless of creator — this spec's Task 3 explicitly **removes** the existing `where('user_id', ...)` scope from `KitchenProjectController::index` (today every user, including two `seller` accounts, only sees their own — that's the one piece of current behavior this plan changes, not just adds to).
- Taller never receives pricing data over the wire (not just hidden client-side) — `KitchenQuote`, `Material`, `Finish` data must actually be absent from responses reachable by a `taller` token, not merely un-rendered.
- Taller may change a `KitchenProject`'s `status` to `Aprobado`/`En producción`/`Entregado` only, and may send **no other field** in that same request.
- `DELETE` on a user must deactivate (`active = false`), never hard-delete — `users.id` is the FK target of every project/quote a person ever created.
- An admin cannot deactivate their own account.

---

## File Structure

**Backend (new):**
- `app/Http/Controllers/UserController.php`
- `tests/Feature/UserControllerTest.php`
- `tests/Feature/KitchenProjectRoleAccessTest.php`
- `tests/Feature/CatalogAndOldProjectRoleAccessTest.php`

**Backend (modified):**
- `app/Providers/AppServiceProvider.php` — Gate definitions
- `database/seeders/DemoUserSeeder.php` — add `taller@demo.com`
- `routes/api.php` — role middleware on every existing group
- `app/Http/Controllers/KitchenProjectController.php` — remove per-user scoping + `authorizeProject`, add owner eager-load, strip pricing for taller, taller status-only branch in `update`

**Frontend (new):**
- `app/users/page.tsx`
- `components/users/UserFormModal.tsx`
- `lib/roleAccess.ts` — the page-guard hook + the sidebar's per-item role list

**Frontend (modified):**
- `store/useAuthStore.ts` — widen `AuthUser.role`
- `services/api.ts` — widen login's role type, add `User`/user CRUD functions, add `ownerName` to `listKitchenProjects`/old-projects list mapping
- `components/layout/Sidebar.tsx` — role filtering
- `app/kitchen/projects/page.tsx`, `app/projects/page.tsx` — owner column
- `components/kitchen/KitchenBuilder.tsx` — taller-specific read-only/no-pricing view
- Every restricted page (`app/materials/page.tsx`, `app/finishes/page.tsx`, `app/quotes/page.tsx`, `app/projects/new/page.tsx`, `app/kitchen/page.tsx`, `app/closet/page.tsx`) — wrap with the new page guard

---

### Task 1: Backend — Gates + third role seeded

**Files:**
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Modify: `backend/database/seeders/DemoUserSeeder.php`
- Test: `backend/tests/Unit/RoleGatesTest.php`

**Interfaces:**
- Produces: Gates `manage-catalog`, `manage-users`, `design-projects`, `view-pricing`, `view-projects` — consumed by Tasks 2-5 as route middleware (`can:<gate-name>`).

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Unit;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class RoleGatesTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role]);
    }

    public function test_manage_catalog_is_admin_only(): void
    {
        $this->assertTrue(Gate::forUser($this->user('admin'))->allows('manage-catalog'));
        $this->assertFalse(Gate::forUser($this->user('seller'))->allows('manage-catalog'));
        $this->assertFalse(Gate::forUser($this->user('taller'))->allows('manage-catalog'));
    }

    public function test_manage_users_is_admin_only(): void
    {
        $this->assertTrue(Gate::forUser($this->user('admin'))->allows('manage-users'));
        $this->assertFalse(Gate::forUser($this->user('seller'))->allows('manage-users'));
        $this->assertFalse(Gate::forUser($this->user('taller'))->allows('manage-users'));
    }

    public function test_design_projects_is_admin_and_seller(): void
    {
        $this->assertTrue(Gate::forUser($this->user('admin'))->allows('design-projects'));
        $this->assertTrue(Gate::forUser($this->user('seller'))->allows('design-projects'));
        $this->assertFalse(Gate::forUser($this->user('taller'))->allows('design-projects'));
    }

    public function test_view_pricing_is_admin_and_seller(): void
    {
        $this->assertTrue(Gate::forUser($this->user('admin'))->allows('view-pricing'));
        $this->assertTrue(Gate::forUser($this->user('seller'))->allows('view-pricing'));
        $this->assertFalse(Gate::forUser($this->user('taller'))->allows('view-pricing'));
    }

    public function test_view_projects_allows_all_three_roles(): void
    {
        $this->assertTrue(Gate::forUser($this->user('admin'))->allows('view-projects'));
        $this->assertTrue(Gate::forUser($this->user('seller'))->allows('view-projects'));
        $this->assertTrue(Gate::forUser($this->user('taller'))->allows('view-projects'));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=RoleGatesTest`
Expected: FAIL — gates not defined, `Gate::forUser(...)->allows(...)` returns `false` for everything (undefined gates deny by default), so the `admin`-should-be-`true` assertions fail.

- [ ] **Step 3: Define the gates**

In `backend/app/Providers/AppServiceProvider.php`:

```php
<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
        }

        // Materiales/Acabados — admin-only catalog management.
        Gate::define('manage-catalog', fn (User $user) => $user->role === 'admin');

        // Usuarios — admin-only.
        Gate::define('manage-users', fn (User $user) => $user->role === 'admin');

        // Creating/editing a design (kitchen or old-Project system) — not taller.
        Gate::define('design-projects', fn (User $user) => in_array($user->role, ['admin', 'seller'], true));

        // Cotizaciones + any quote/cost totals — not taller.
        Gate::define('view-pricing', fn (User $user) => in_array($user->role, ['admin', 'seller'], true));

        // Read-only project access — all three roles (taller needs this for
        // cut lists/dimensions; the pricing itself is stripped separately,
        // see KitchenProjectController).
        Gate::define('view-projects', fn (User $user) => in_array($user->role, ['admin', 'seller', 'taller'], true));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=RoleGatesTest`
Expected: `PASS` (5 tests)

- [ ] **Step 5: Seed the third demo account**

In `backend/database/seeders/DemoUserSeeder.php`:

```php
<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoUserSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'admin@demo.com'],
            ['name' => 'Administrador', 'password' => Hash::make('password'), 'role' => 'admin', 'active' => true],
        );

        User::updateOrCreate(
            ['email' => 'seller@demo.com'],
            ['name' => 'Vendedor', 'password' => Hash::make('password'), 'role' => 'seller', 'active' => true],
        );

        User::updateOrCreate(
            ['email' => 'taller@demo.com'],
            ['name' => 'Taller', 'password' => Hash::make('password'), 'role' => 'taller', 'active' => true],
        );
    }
}
```

- [ ] **Step 6: Re-seed locally and verify**

Run: `cd backend && php artisan db:seed --class=DemoUserSeeder`
Expected: no errors; `php artisan tinker --execute="echo App\Models\User::where('email','taller@demo.com')->first()->role;"` prints `taller`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Providers/AppServiceProvider.php backend/database/seeders/DemoUserSeeder.php backend/tests/Unit/RoleGatesTest.php
git commit -m "feat(backend): define role gates, seed a taller demo account"
```

---

### Task 2: Backend — gate Materiales/Acabados/Cotizaciones routes

**Files:**
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/CatalogAndOldProjectRoleAccessTest.php` (created here, Task 5 adds more cases to the same file)

**Interfaces:**
- Consumes: `manage-catalog`, `view-pricing` gates (Task 1).

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CatalogAndOldProjectRoleAccessTest extends TestCase
{
    use RefreshDatabase;

    private function actingAs(string $role): User
    {
        $user = User::factory()->create(['role' => $role]);
        Sanctum::actingAs($user);
        return $user;
    }

    public function test_seller_cannot_list_materials(): void
    {
        $this->actingAs('seller');
        $this->getJson('/api/materials')->assertStatus(403);
    }

    public function test_taller_cannot_list_materials(): void
    {
        $this->actingAs('taller');
        $this->getJson('/api/materials')->assertStatus(403);
    }

    public function test_admin_can_list_materials(): void
    {
        $this->actingAs('admin');
        $this->getJson('/api/materials')->assertStatus(200);
    }

    public function test_seller_cannot_list_finishes(): void
    {
        $this->actingAs('seller');
        $this->getJson('/api/finishes')->assertStatus(403);
    }

    public function test_taller_cannot_list_quotes(): void
    {
        $this->actingAs('taller');
        $this->getJson('/api/quotes')->assertStatus(403);
    }

    public function test_seller_can_list_quotes(): void
    {
        $this->actingAs('seller');
        $this->getJson('/api/quotes')->assertStatus(200);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=CatalogAndOldProjectRoleAccessTest`
Expected: FAIL — every route currently accepts any authenticated user, so the `assertStatus(403)` cases get `200` instead.

- [ ] **Step 3: Add the middleware**

In `backend/routes/api.php`, change:

```php
    Route::get('/quotes', [QuoteController::class, 'index']);
    Route::get('/quotes/{quote}', [QuoteController::class, 'show']);
    Route::put('/quotes/{quote}/status', [QuoteController::class, 'updateStatus']);

    Route::apiResource('materials', MaterialController::class)->except(['show']);
    Route::apiResource('finishes', FinishController::class)->except(['show']);
```

to:

```php
    Route::middleware('can:view-pricing')->group(function (): void {
        Route::get('/quotes', [QuoteController::class, 'index']);
        Route::get('/quotes/{quote}', [QuoteController::class, 'show']);
        Route::put('/quotes/{quote}/status', [QuoteController::class, 'updateStatus']);
    });

    Route::middleware('can:manage-catalog')->group(function (): void {
        Route::apiResource('materials', MaterialController::class)->except(['show']);
        Route::apiResource('finishes', FinishController::class)->except(['show']);
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=CatalogAndOldProjectRoleAccessTest`
Expected: `PASS` (6 tests)

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: all tests pass, including every pre-existing `MaterialControllerTest`/`FinishControllerTest` case (those already act as `admin` via `Sanctum::actingAs(User::factory()->create())` — confirm the factory's default `role` is `seller` per the migration default, so double-check those existing tests still pass; if any pre-existing test relied on a non-admin user hitting these routes, it needs a `role: 'admin'` override added as part of this task, not left broken).

- [ ] **Step 6: Commit**

```bash
git add backend/routes/api.php backend/tests/Feature/CatalogAndOldProjectRoleAccessTest.php
git commit -m "feat(backend): gate Materiales/Acabados to admin, Cotizaciones off taller"
```

---

### Task 3: Backend — KitchenProjectController: everyone sees every project, taller gets no pricing

**Files:**
- Modify: `backend/app/Http/Controllers/KitchenProjectController.php`
- Test: `backend/tests/Feature/KitchenProjectRoleAccessTest.php`

**Interfaces:**
- Produces: `kitchen-projects.index`/`.show` responses gain a `user: {id, name}` field (the owner); a `taller`-requested `.index`/`.show` never includes a `quote` key.
- Consumes: `view-projects` gate (Task 1).

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenProjectRoleAccessTest extends TestCase
{
    use RefreshDatabase;

    private function project(User $owner): KitchenProject
    {
        return KitchenProject::create([
            'user_id' => $owner->id, 'project_name' => 'Cocina', 'room_width' => 400,
            'room_depth' => 300, 'ceiling_height' => 240, 'openings' => [],
        ]);
    }

    public function test_a_seller_sees_a_project_created_by_a_different_seller(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);
        $viewer = User::factory()->create(['role' => 'seller']);
        $this->project($owner);
        Sanctum::actingAs($viewer);

        $response = $this->getJson('/api/kitchen-projects');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
    }

    public function test_index_includes_the_owner_name(): void
    {
        $owner = User::factory()->create(['role' => 'seller', 'name' => 'Ana Vendedora']);
        $this->project($owner);
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $response = $this->getJson('/api/kitchen-projects');

        $response->assertStatus(200)->assertJsonPath('data.0.user.name', 'Ana Vendedora');
    }

    public function test_taller_can_view_the_project_list(): void
    {
        $this->project(User::factory()->create(['role' => 'seller']));
        Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $this->getJson('/api/kitchen-projects')->assertStatus(200);
    }

    public function test_taller_response_never_includes_the_quote(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);
        $project = $this->project($owner);
        $project->quote()->create([
            'subtotal_materials' => 1000, 'labor_percentage' => 10, 'profit_percentage' => 20,
            'labor_cost' => 100, 'profit_cost' => 200, 'total' => 1300,
            'material_lines' => [], 'folio' => 'KIT-00001',
        ]);
        Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $indexResponse = $this->getJson('/api/kitchen-projects');
        $indexResponse->assertStatus(200)->assertJsonMissingPath('data.0.quote');

        $showResponse = $this->getJson("/api/kitchen-projects/{$project->id}");
        $showResponse->assertStatus(200)->assertJsonMissing(['quote']);
    }

    public function test_a_sellers_response_still_includes_the_quote(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);
        $project = $this->project($owner);
        $project->quote()->create([
            'subtotal_materials' => 1000, 'labor_percentage' => 10, 'profit_percentage' => 20,
            'labor_cost' => 100, 'profit_cost' => 200, 'total' => 1300,
            'material_lines' => [], 'folio' => 'KIT-00001',
        ]);
        Sanctum::actingAs($owner);

        $this->getJson('/api/kitchen-projects')->assertStatus(200)->assertJsonPath('data.0.quote.total', '1300.00');
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=KitchenProjectRoleAccessTest`
Expected: FAIL on the cross-user visibility test (currently scoped to `user_id`, a different seller sees 0 projects) and the owner-name/quote-stripping tests (fields don't exist yet).

- [ ] **Step 3: Rewrite `index`/`show`**

In `backend/app/Http/Controllers/KitchenProjectController.php`, replace:

```php
    // ── List ──────────────────────────────────────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        $projects = KitchenProject::where('user_id', $request->user()->id)
            ->withCount('modules')
            ->with('quote:id,kitchen_project_id,total,status,folio')
            ->latest()
            ->paginate(15);

        return response()->json($projects);
    }
```

with:

```php
    // ── List ──────────────────────────────────────────────────────────────────
    // Every role that can reach this route (view-projects: admin/seller/
    // taller) sees every project, not just their own — vendedores need to
    // see each other's clients, and this is the one place that used to
    // scope by user_id. taller's quote relation is dropped below, at the
    // JSON-shaping step, not here — the query stays identical for every role
    // so there's one query path to reason about.
    public function index(Request $request): JsonResponse
    {
        $projects = KitchenProject::withCount('modules')
            ->with(['user:id,name', 'quote:id,kitchen_project_id,total,status,folio'])
            ->latest()
            ->paginate(15);

        if ($request->user()->role === 'taller') {
            $projects->getCollection()->each(fn (KitchenProject $p) => $p->unsetRelation('quote'));
        }

        return response()->json($projects);
    }
```

And replace:

```php
    // ── Show ──────────────────────────────────────────────────────────────────
    public function show(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);
        return response()->json($kitchenProject->load('modules', 'quote'));
    }
```

with:

```php
    // ── Show ──────────────────────────────────────────────────────────────────
    public function show(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $kitchenProject->load(['modules', 'user:id,name']);
        if ($request->user()->role !== 'taller') {
            $kitchenProject->load('quote');
        }

        return response()->json($kitchenProject);
    }
```

(`unsetRelation`/simply-not-loading `quote` means the key is entirely absent from the JSON response for taller — Eloquent only serializes relations that were actually loaded — matching the spec's "omit, don't redact" approach.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=KitchenProjectRoleAccessTest`
Expected: `PASS` (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/KitchenProjectController.php backend/tests/Feature/KitchenProjectRoleAccessTest.php
git commit -m "feat(backend): kitchen-projects list/show are shop-wide, strip quote for taller"
```

---

### Task 4: Backend — route-gate the rest of kitchen-projects, taller's status-only update

**Files:**
- Modify: `backend/routes/api.php`
- Modify: `backend/app/Http/Controllers/KitchenProjectController.php`
- Test: `backend/tests/Feature/KitchenProjectRoleAccessTest.php` (same file as Task 3, more cases)

**Interfaces:**
- Consumes: `design-projects`, `view-projects` gates (Task 1).
- Produces: `KitchenProjectController::update` now branches on role; the `authorizeProject` private method and every call to it are removed (see Global Constraints — ownership no longer gates access, roles do).

- [ ] **Step 1: Write the failing tests (append to `KitchenProjectRoleAccessTest.php`)**

```php
    public function test_taller_cannot_create_a_kitchen_project(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $this->postJson('/api/kitchen-projects', [
            'project_name' => 'X', 'room_width' => 400, 'room_depth' => 300, 'ceiling_height' => 240,
        ])->assertStatus(403);
    }

    public function test_taller_cannot_sync_modules(): void
    {
        $project = $this->project(User::factory()->create(['role' => 'seller']));
        Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $this->postJson("/api/kitchen-projects/{$project->id}/modules/sync", ['modules' => []])
            ->assertStatus(403);
    }

    public function test_taller_can_advance_status_to_an_allowed_value(): void
    {
        $project = $this->project(User::factory()->create(['role' => 'seller']));
        $project->update(['status' => 'Aprobado']);
        Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $response = $this->putJson("/api/kitchen-projects/{$project->id}", ['status' => 'En producción']);

        $response->assertStatus(200);
        $this->assertSame('En producción', $project->fresh()->status);
    }

    public function test_taller_cannot_set_a_design_phase_status(): void
    {
        $project = $this->project(User::factory()->create(['role' => 'seller']));
        Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $this->putJson("/api/kitchen-projects/{$project->id}", ['status' => 'Cotizado'])
            ->assertStatus(422);
    }

    public function test_taller_cannot_send_any_field_besides_status(): void
    {
        $project = $this->project(User::factory()->create(['role' => 'seller']));
        Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $this->putJson("/api/kitchen-projects/{$project->id}", ['status' => 'Aprobado', 'project_name' => 'Hacked'])
            ->assertStatus(422);
        $this->assertSame('Cocina', $project->fresh()->project_name);
    }

    public function test_seller_can_still_fully_edit_any_project(): void
    {
        $project = $this->project(User::factory()->create(['role' => 'seller']));
        Sanctum::actingAs(User::factory()->create(['role' => 'seller']));

        $this->putJson("/api/kitchen-projects/{$project->id}", ['project_name' => 'Renombrada'])
            ->assertStatus(200);
        $this->assertSame('Renombrada', $project->fresh()->project_name);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=KitchenProjectRoleAccessTest`
Expected: FAIL — every route still accepts taller today.

- [ ] **Step 3: Gate the routes**

In `backend/routes/api.php`, replace:

```php
    // Kitchen projects (modular builder)
    Route::apiResource('kitchen-projects', KitchenProjectController::class);
    Route::post('/kitchen-projects/{kitchenProject}/modules/sync', [KitchenProjectController::class, 'syncModules']);
    Route::post('/kitchen-projects/{kitchenProject}/quote', [KitchenProjectController::class, 'quote']);
    Route::post('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'createShare']);
    Route::delete('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'revokeShare']);
```

with:

```php
    // Kitchen projects (modular builder). index/show/update are reachable by
    // all three roles (view-projects) — update itself branches on role
    // inside the controller, since taller's "status only" rule can't be
    // expressed as route middleware. Everything else needs design-projects.
    Route::middleware('can:view-projects')->group(function (): void {
        Route::get('/kitchen-projects', [KitchenProjectController::class, 'index']);
        Route::get('/kitchen-projects/{kitchenProject}', [KitchenProjectController::class, 'show']);
        Route::put('/kitchen-projects/{kitchenProject}', [KitchenProjectController::class, 'update']);
    });
    Route::middleware('can:design-projects')->group(function (): void {
        Route::post('/kitchen-projects', [KitchenProjectController::class, 'store']);
        Route::delete('/kitchen-projects/{kitchenProject}', [KitchenProjectController::class, 'destroy']);
        Route::post('/kitchen-projects/{kitchenProject}/modules/sync', [KitchenProjectController::class, 'syncModules']);
        Route::post('/kitchen-projects/{kitchenProject}/quote', [KitchenProjectController::class, 'quote']);
        Route::post('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'createShare']);
        Route::delete('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'revokeShare']);
    });
```

- [ ] **Step 4: Branch `update()` on role, remove `authorizeProject`**

Find (around line 104-132):

```php
    // ── Update ────────────────────────────────────────────────────────────────
    public function update(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);

        $validated = $request->validate([
            'client_name'    => 'sometimes|nullable|string|max:120',
            'client_phone'   => 'nullable|string|max:30',
            'project_name'   => 'sometimes|string|max:120',
            'notes'          => 'nullable|string|max:1000',
            'room_width'     => 'sometimes|integer|min:100|max:2000',
            'room_depth'     => 'sometimes|integer|min:100|max:2000',
            'ceiling_height' => 'sometimes|integer|min:200|max:400',
            'autosave_enabled' => 'sometimes|boolean',
            'openings'                 => 'nullable|array',
            'openings.*.id'            => 'required|string|max:60',
            'openings.*.type'          => ['required', Rule::in(['window', 'door'])],
            'openings.*.wall'          => ['required', Rule::in(['north', 'south', 'east', 'west'])],
            'openings.*.offset'        => 'required|numeric|min:0',
            'openings.*.width'         => 'required|numeric|min:0',
            'openings.*.height'        => 'required|numeric|min:0',
            'openings.*.sillHeight'    => 'required|numeric|min:0',
            'status'         => ['sometimes', Rule::in(['Borrador', 'En diseño', 'Cotizado', 'Aprobado', 'En producción', 'Entregado'])],
        ]);

        $kitchenProject->update($validated);

        return response()->json($kitchenProject->fresh('modules'));
    }
```

Replace with:

```php
    // ── Update ────────────────────────────────────────────────────────────────
    // taller's status transitions — separate from Global Constraints' full
    // status list because taller is only allowed to move a project FORWARD
    // through the production tail end, never back into a design-phase status.
    private const TALLER_ALLOWED_STATUSES = ['Aprobado', 'En producción', 'Entregado'];

    public function update(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        if ($request->user()->role === 'taller') {
            if (array_keys($request->all()) !== ['status']) {
                return response()->json(['message' => 'Taller solo puede cambiar el estado del proyecto.'], 422);
            }
            $validated = $request->validate([
                'status' => ['required', Rule::in(self::TALLER_ALLOWED_STATUSES)],
            ]);
            $kitchenProject->update($validated);

            return response()->json($kitchenProject->fresh('modules'));
        }

        $validated = $request->validate([
            'client_name'    => 'sometimes|nullable|string|max:120',
            'client_phone'   => 'nullable|string|max:30',
            'project_name'   => 'sometimes|string|max:120',
            'notes'          => 'nullable|string|max:1000',
            'room_width'     => 'sometimes|integer|min:100|max:2000',
            'room_depth'     => 'sometimes|integer|min:100|max:2000',
            'ceiling_height' => 'sometimes|integer|min:200|max:400',
            'autosave_enabled' => 'sometimes|boolean',
            'openings'                 => 'nullable|array',
            'openings.*.id'            => 'required|string|max:60',
            'openings.*.type'          => ['required', Rule::in(['window', 'door'])],
            'openings.*.wall'          => ['required', Rule::in(['north', 'south', 'east', 'west'])],
            'openings.*.offset'        => 'required|numeric|min:0',
            'openings.*.width'         => 'required|numeric|min:0',
            'openings.*.height'        => 'required|numeric|min:0',
            'openings.*.sillHeight'    => 'required|numeric|min:0',
            'status'         => ['sometimes', Rule::in(['Borrador', 'En diseño', 'Cotizado', 'Aprobado', 'En producción', 'Entregado'])],
        ]);

        $kitchenProject->update($validated);

        return response()->json($kitchenProject->fresh('modules'));
    }
```

Then remove every remaining `$this->authorizeProject($request, $kitchenProject);` call — `destroy`, `syncModules`, `quote`, `createShare`, `revokeShare` (grep to find all of them: `grep -n authorizeProject app/Http/Controllers/KitchenProjectController.php`) — and delete the now-unused private method itself:

```php
    private function authorizeProject(Request $request, KitchenProject $project): void
    {
        abort_if($project->user_id !== $request->user()->id, 403, 'No autorizado.');
    }
```

(Route-level `can:design-projects`/`can:view-projects` middleware is what gates these now — per-row ownership was the old single-tenant model, superseded by "every seller/admin can act on every project.")

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=KitchenProjectRoleAccessTest`
Expected: `PASS` (11 tests total across both steps of this file)

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: all tests pass. Pay attention to `KitchenProjectShareTest.php`/`KitchenProjectDraftAutosaveTest.php`/`KitchenProjectDeletionTest.php` — these pre-existing tests call kitchen-project routes and may assume the old ownership-based 403 behavior (e.g. "a user cannot revoke another user's share") — if any such test now fails because ownership is no longer enforced, that test's assumption is exactly what this task intentionally changed; update it to assert the new role-based behavior instead of reverting the code.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/api.php backend/app/Http/Controllers/KitchenProjectController.php backend/tests/Feature/KitchenProjectRoleAccessTest.php
git commit -m "feat(backend): route-gate kitchen-projects by role, taller status-only update"
```

---

### Task 5: Backend — gate the old Project system

**Files:**
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/CatalogAndOldProjectRoleAccessTest.php` (same file as Task 2, more cases)

**Interfaces:**
- Consumes: `design-projects`, `view-projects` gates (Task 1).

- [ ] **Step 1: Write the failing tests (append to the Task 2 test file)**

```php
    public function test_taller_can_view_old_projects(): void
    {
        $this->actingAs('taller');
        $this->getJson('/api/projects')->assertStatus(200);
    }

    public function test_taller_cannot_create_an_old_project(): void
    {
        $this->actingAs('taller');
        $this->postJson('/api/projects', [])->assertStatus(403);
    }

    public function test_seller_can_create_an_old_project(): void
    {
        $this->actingAs('seller');
        $response = $this->postJson('/api/projects', [
            'client_name' => 'C', 'client_phone' => '555', 'project_name' => 'P',
            'furniture_type' => 'closet', 'material' => 'MDF',
            'dimensions' => ['height' => 200, 'width' => 100, 'depth' => 60],
        ]);
        $response->assertStatus(201);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=CatalogAndOldProjectRoleAccessTest`
Expected: FAIL — `/api/projects` currently accepts any role for every method.

- [ ] **Step 3: Add the middleware**

In `backend/routes/api.php`, replace:

```php
    Route::apiResource('projects', ProjectController::class);
    Route::post('/projects/{project}/calculate', [ProjectController::class, 'calculate']);
    Route::post('/projects/{project}/quote', [ProjectController::class, 'quote']);
```

with:

```php
    Route::middleware('can:view-projects')->group(function (): void {
        Route::get('/projects', [ProjectController::class, 'index']);
        Route::get('/projects/{project}', [ProjectController::class, 'show']);
    });
    Route::middleware('can:design-projects')->group(function (): void {
        Route::post('/projects', [ProjectController::class, 'store']);
        Route::put('/projects/{project}', [ProjectController::class, 'update']);
        Route::patch('/projects/{project}', [ProjectController::class, 'update']);
        Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);
        Route::post('/projects/{project}/calculate', [ProjectController::class, 'calculate']);
        Route::post('/projects/{project}/quote', [ProjectController::class, 'quote']);
    });
```

(Splitting `Route::apiResource` into explicit `get`/`post`/`put`/`patch`/`delete` calls is required here — `apiResource` registers all 5 actions as one unit and can't have different middleware per action without this expansion.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=CatalogAndOldProjectRoleAccessTest`
Expected: `PASS` (9 tests total across Task 2 + this task)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: all tests pass — no regressions in the old Project system's own existing tests (if any reference the exact route list, confirm they still resolve; the URL paths themselves are unchanged, only which middleware wraps them).

- [ ] **Step 6: Commit**

```bash
git add backend/routes/api.php backend/tests/Feature/CatalogAndOldProjectRoleAccessTest.php
git commit -m "feat(backend): gate the old Project system by role"
```

---

### Task 6: Backend — Usuarios CRUD

**Files:**
- Create: `backend/app/Http/Controllers/UserController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/UserControllerTest.php`

**Interfaces:**
- Consumes: `manage-users` gate (Task 1).
- Produces: `GET/POST /api/users`, `PUT/DELETE /api/users/{user}` (auth:sanctum + can:manage-users), JSON shape `{id, name, email, role, active}` — consumed by Task 11's frontend page.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserControllerTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);
        return $admin;
    }

    public function test_non_admin_cannot_list_users(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'seller']));
        $this->getJson('/api/users')->assertStatus(403);
    }

    public function test_admin_creates_a_taller_user(): void
    {
        $this->admin();

        $response = $this->postJson('/api/users', [
            'name' => 'Nuevo Taller', 'email' => 'nuevo.taller@demo.com',
            'role' => 'taller', 'password' => 'password123', 'active' => true,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('users', ['email' => 'nuevo.taller@demo.com', 'role' => 'taller']);
    }

    public function test_store_fails_with_an_invalid_role(): void
    {
        $this->admin();

        $this->postJson('/api/users', [
            'name' => 'X', 'email' => 'x@demo.com', 'role' => 'ceo', 'password' => 'password123',
        ])->assertStatus(422);
    }

    public function test_update_without_a_password_keeps_the_existing_one(): void
    {
        $admin = $this->admin();
        $target = User::create(['name' => 'T', 'email' => 't@demo.com', 'password' => Hash::make('original'), 'role' => 'seller', 'active' => true]);

        $this->putJson("/api/users/{$target->id}", ['name' => 'Renombrado'])->assertStatus(200);

        $this->assertTrue(Hash::check('original', $target->fresh()->password));
    }

    public function test_destroy_deactivates_instead_of_deleting(): void
    {
        $this->admin();
        $target = User::create(['name' => 'T', 'email' => 't2@demo.com', 'password' => Hash::make('x'), 'role' => 'seller', 'active' => true]);

        $response = $this->deleteJson("/api/users/{$target->id}");

        $response->assertStatus(200);
        $this->assertDatabaseHas('users', ['id' => $target->id]);
        $this->assertFalse($target->fresh()->active);
    }

    public function test_admin_cannot_deactivate_themselves(): void
    {
        $admin = $this->admin();

        $this->deleteJson("/api/users/{$admin->id}")->assertStatus(422);
        $this->assertTrue($admin->fresh()->active);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=UserControllerTest`
Expected: FAIL — route/controller don't exist yet.

- [ ] **Step 3: Write the controller**

```php
<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(User::query()->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'unique:users,email'],
            'role' => ['required', Rule::in(['admin', 'seller', 'taller'])],
            'password' => ['required', 'string', 'min:8'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'role' => $validated['role'],
            'password' => Hash::make($validated['password']),
            'active' => $validated['active'] ?? true,
        ]);

        return response()->json($user, 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'role' => ['sometimes', Rule::in(['admin', 'seller', 'taller'])],
            'password' => ['sometimes', 'nullable', 'string', 'min:8'],
            'active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('password', $validated)) {
            $validated['password'] = $validated['password'] ? Hash::make($validated['password']) : $user->password;
        }

        $user->update($validated);

        return response()->json($user->fresh());
    }

    // Deactivates rather than deletes — see Global Constraints: a user row
    // is the FK target of every project/quote they ever created.
    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'No puedes desactivar tu propia cuenta.'], 422);
        }

        $user->update(['active' => false]);

        return response()->json($user->fresh());
    }
}
```

- [ ] **Step 4: Register the route**

In `backend/routes/api.php`, add the import next to the other controller imports:

```php
use App\Http\Controllers\UserController;
```

And inside the `auth:sanctum` group:

```php
    Route::middleware('can:manage-users')->group(function (): void {
        Route::apiResource('users', UserController::class)->except(['show']);
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=UserControllerTest`
Expected: `PASS` (6 tests)

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: all tests pass, no regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Http/Controllers/UserController.php backend/routes/api.php backend/tests/Feature/UserControllerTest.php
git commit -m "feat(backend): add Usuarios CRUD, admin-only, deactivate not delete"
```

---

### Task 7: Frontend — widen role type, add user API client

**Files:**
- Modify: `frontend/store/useAuthStore.ts`
- Modify: `frontend/services/api.ts`

**Interfaces:**
- Produces: `AuthUser.role: "admin" | "seller" | "taller"`; `export interface User { id: number; name: string; email: string; role: "admin" | "seller" | "taller"; active: boolean }`; `listUsers/createUser/updateUser/deactivateUser`.

- [ ] **Step 1: Widen the role type in both places**

In `frontend/store/useAuthStore.ts`:

```typescript
interface AuthUser {
  name: string;
  email: string;
  role: "admin" | "seller" | "taller";
}
```

In `frontend/services/api.ts`, find the `login` function's inline response type (around line 186):

```typescript
  const data = await http.post<{ token: string; user: { name: string; email: string; role: "admin" | "seller" } }>("/login", { email, password });
```

Replace with:

```typescript
  const data = await http.post<{ token: string; user: { name: string; email: string; role: "admin" | "seller" | "taller" } }>("/login", { email, password });
```

- [ ] **Step 2: Add the Users API client**

In `frontend/services/api.ts`, add a new section (place it near the Materials/Finishes sections, matching their exact shape):

```typescript
// ─── Users ───────────────────────────────────────────────────────────────────
interface BackendUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "seller" | "taller";
  active: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "seller" | "taller";
  active: boolean;
}

function mapUser(u: BackendUser): User {
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active };
}

export async function listUsers(): Promise<User[]> {
  const users = await http.get<BackendUser[]>("/users");
  return users.map(mapUser);
}

export interface UserInput {
  name: string;
  email: string;
  role: "admin" | "seller" | "taller";
  password?: string;
  active?: boolean;
}

export async function createUser(input: UserInput): Promise<User> {
  const user = await http.post<BackendUser>("/users", input);
  return mapUser(user);
}

export async function updateUser(id: number, patch: Partial<UserInput>): Promise<User> {
  const user = await http.put<BackendUser>(`/users/${id}`, patch);
  return mapUser(user);
}

export async function deactivateUser(id: number): Promise<User> {
  const user = await http.delete<BackendUser>(`/users/${id}`);
  return mapUser(user);
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/store/useAuthStore.ts frontend/services/api.ts
git commit -m "feat(frontend): widen role type to include taller, add users API client"
```

---

### Task 8: Frontend — role-based sidebar + page guard

**Files:**
- Create: `frontend/lib/roleAccess.ts`
- Modify: `frontend/components/layout/Sidebar.tsx`

**Interfaces:**
- Produces: `PAGE_ROLES: Record<string, AuthUser["role"][]>` (keyed by pathname), `useRoleGuard(allowedRoles: AuthUser["role"][]): void` — a hook that redirects to `/dashboard` with a toast if the signed-in user's role isn't allowed. Consumed by Task 10 (kitchen builder) and every restricted page.

- [ ] **Step 1: Write the guard + the matrix**

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/store/useAuthStore";

export type Role = "admin" | "seller" | "taller";

// Mirrors the backend's route-gate matrix exactly (Gate::define in
// AppServiceProvider.php) — this is a UI convenience (hide the nav link,
// bounce a direct URL hit) layered on top of the real enforcement, not a
// substitute for it.
export const PAGE_ROLES: Record<string, Role[]> = {
  "/dashboard": ["admin", "seller", "taller"],
  "/projects/new": ["admin", "seller"],
  "/kitchen": ["admin", "seller"],
  "/kitchen/projects": ["admin", "seller", "taller"],
  "/closet": ["admin", "seller"],
  "/materials": ["admin"],
  "/finishes": ["admin"],
  "/quotes": ["admin", "seller"],
  "/projects": ["admin", "seller", "taller"],
  "/users": ["admin"],
};

// Redirects away from a page the signed-in user's role can't access. Must
// be called from a page component (not the Sidebar, which only hides the
// nav link — this covers someone typing the URL directly). No-ops while
// the auth store hasn't hydrated yet (user is null very briefly on a fresh
// load) so it doesn't bounce a legitimate user before their session loads.
export function useRoleGuard(allowedRoles: Role[]): void {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (!role) return;
    if (!allowedRoles.includes(role)) {
      toast.error("No tienes acceso a esa sección.");
      router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
}
```

- [ ] **Step 2: Filter the sidebar**

In `frontend/components/layout/Sidebar.tsx`, add the import:

```typescript
import { useAuthStore } from "@/store/useAuthStore";
import { PAGE_ROLES } from "@/lib/roleAccess";
```

Add `{ href: "/users", label: "Usuarios", icon: Users }` to the `items` array (with `Users` added to the `lucide-react` import line), placed after `/finishes`:

```typescript
import { BarChart3, Boxes, FileText, LayoutDashboard, Palette, PlusSquare, Shirt, UtensilsCrossed, Users, X } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects/new", label: "Nuevo diseño", icon: PlusSquare },
  { href: "/kitchen", label: "Diseñar cocina", icon: UtensilsCrossed },
  { href: "/kitchen/projects", label: "Cocinas", icon: BarChart3 },
  { href: "/closet", label: "Diseñar closet", icon: Shirt },
  { href: "/materials", label: "Materiales", icon: Boxes },
  { href: "/finishes", label: "Acabados", icon: Palette },
  { href: "/quotes", label: "Cotizaciones", icon: FileText },
  { href: "/projects", label: "Proyectos", icon: BarChart3 },
  { href: "/users", label: "Usuarios", icon: Users },
];
```

Inside the component, filter before rendering:

```typescript
export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const resetKitchenDraft = useKitchenStore((s) => s.resetDraft);
  const role = useAuthStore((s) => s.user?.role);
  const visibleItems = items.filter((item) => !role || (PAGE_ROLES[item.href]?.includes(role) ?? true));
```

And change the `{items.map((item) => {` render loop to `{visibleItems.map((item) => {`.

(`!role || ...` keeps every item visible before the auth store hydrates, avoiding a flash-then-shrink on load; `?? true` is a safe default for any href not listed in `PAGE_ROLES`, so a future nav item added without updating the matrix doesn't silently disappear for everyone.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (the `/users` page doesn't exist until Task 11, but the Sidebar only references it as a string href, not an import — no error from that alone).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/roleAccess.ts frontend/components/layout/Sidebar.tsx
git commit -m "feat(frontend): role-filtered sidebar + page-guard hook"
```

---

### Task 9: Frontend — apply the page guard to every restricted page

**Files:**
- Modify: `frontend/app/materials/page.tsx`
- Modify: `frontend/app/finishes/page.tsx`
- Modify: `frontend/app/quotes/page.tsx`
- Modify: `frontend/app/projects/new/page.tsx`
- Modify: `frontend/app/kitchen/page.tsx`
- Modify: `frontend/app/closet/page.tsx`

**Interfaces:**
- Consumes: `useRoleGuard`, `PAGE_ROLES` (Task 8).

- [ ] **Step 1: Add the guard call to each page's top-level component**

For each file, add the import and a single call at the top of the default-exported component function, using that page's own path as the `PAGE_ROLES` key. Pattern (shown for `materials/page.tsx`; repeat identically for the other five, swapping only the path):

```typescript
import { useRoleGuard, PAGE_ROLES } from "@/lib/roleAccess";
```

```typescript
export default function MaterialsPage() {
  useRoleGuard(PAGE_ROLES["/materials"]);
  // ...rest of the existing component body, unchanged
```

Apply the same two changes to:
- `finishes/page.tsx` → `PAGE_ROLES["/finishes"]`
- `quotes/page.tsx` → `PAGE_ROLES["/quotes"]`
- `projects/new/page.tsx` → `PAGE_ROLES["/projects/new"]`
- `kitchen/page.tsx` → `PAGE_ROLES["/kitchen"]`
- `closet/page.tsx` → `PAGE_ROLES["/closet"]`

(`kitchen/projects/page.tsx` and `projects/page.tsx` are NOT touched here — all three roles can view both, so there's nothing to guard. `dashboard/page.tsx` likewise allows all three.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Log in as `taller@demo.com`/`password`, confirm navigating directly to `/materials` (typed URL, not a nav click) redirects to `/dashboard` with a toast. Log in as `seller@demo.com`, confirm the same for `/users`. Log in as `admin@demo.com`, confirm every page still loads normally.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/materials/page.tsx frontend/app/finishes/page.tsx frontend/app/quotes/page.tsx frontend/app/projects/new/page.tsx frontend/app/kitchen/page.tsx frontend/app/closet/page.tsx
git commit -m "feat(frontend): apply the role guard to every restricted page"
```

---

### Task 10: Frontend — owner column on the two project lists

**Files:**
- Modify: `frontend/services/api.ts`
- Modify: `frontend/app/kitchen/projects/page.tsx`
- Modify: `frontend/app/projects/page.tsx`

**Interfaces:**
- Produces: `listKitchenProjects()` rows and the old-projects list rows both gain `ownerName: string`.

- [ ] **Step 1: Map the owner field**

In `frontend/services/api.ts`, find `listKitchenProjects` and add `ownerName` to its mapped shape (the backend's `index` already eager-loads `user:id,name` as of Task 3):

```typescript
export async function listKitchenProjects() {
  const page = await http.get<Paginated<BackendKitchenProject>>("/kitchen-projects");
  return page.data.map((p) => ({
    id: p.id,
    projectName: p.project_name,
    clientName: p.client_name ?? "",
    clientPhone: p.client_phone ?? "",
    roomWidth: p.room_width,
    roomDepth: p.room_depth,
    status: p.status as KitchenProjectStatus,
    modulesCount: p.modules_count ?? 0,
    total: p.quote?.total != null ? Number(p.quote.total) : null,
    ownerName: p.user?.name ?? "—",
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}
```

Add `user?: { id: number; name: string } | null;` to the `BackendKitchenProject` interface near its other fields.

Find the old system's project-list mapping function (search for where `/projects` GET responses get mapped — same file, look for the function backing `app/projects/page.tsx`'s data) and add the equivalent `ownerName` field the same way, sourced from that response's own `user` relation (the old `ProjectController::index` already eager-loads `dimensions/materials/quote` but not `user` — add `'user:id,name'` to that controller's `with([...])` call as part of this step too, in `backend/app/Http/Controllers/ProjectController.php`).

- [ ] **Step 2: Render the column**

In `frontend/app/kitchen/projects/page.tsx`, add `"Dueño"` to the header array and a matching `<td>` reading `p.ownerName`, placed right after the "Cliente" column (find the exact current header array and `<tr>` structure and insert consistently with the existing cell styling, e.g. `<td className="px-5 py-3 text-zinc-300">{p.ownerName}</td>`).

Apply the equivalent change to `frontend/app/projects/page.tsx`'s own table.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/services/api.ts frontend/app/kitchen/projects/page.tsx frontend/app/projects/page.tsx backend/app/Http/Controllers/ProjectController.php
git commit -m "feat: show project owner on both project list pages"
```

---

### Task 11: Frontend — Taller's kitchen builder view

**Files:**
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx`

**Interfaces:**
- Consumes: `useAuthStore().user?.role`, `updateKitchenProjectStatus` (already exists).

- [ ] **Step 1: Gate the Resumen tab and every design/pricing action**

In `frontend/components/kitchen/KitchenBuilder.tsx`, add the import and read the role near the component's other hooks:

```typescript
import { useAuthStore } from "@/store/useAuthStore";
```

```typescript
  const role = useAuthStore((s) => s.user?.role);
  const isTaller = role === "taller";
```

Find the `TABS` array (`{ id: "3d", label: "Vista 3D", ... }, { id: "summary", label: "Resumen", ... }`) and change its usage at render time to filter out `"summary"` for taller — wrap wherever `TABS.map(...)` renders the tab buttons with `(isTaller ? TABS.filter((t) => t.id !== "3d") ? TABS.filter((t) => t.id !== "summary") : TABS)` — more simply, define:

```typescript
  const visibleTabs = isTaller ? TABS.filter((t) => t.id !== "summary") : TABS;
```

and use `visibleTabs.map(...)` in place of `TABS.map(...)` at both tab-bar render sites (desktop header and mobile header).

Guard the "Guardar", "Nuevo", "Habitación", "Materiales", "Compartir" header buttons and the "Auto" autosave checkbox — wrap each in `{!isTaller && (...)}` at their existing JSX locations (do not remove taller's ability to see the project name/client header text, only the action buttons).

In the 3D tab's own content (`{activeTab === "3d" && (...)}` block), pass `readOnly={isTaller}` to `<KitchenAssemblyScene>` — it already supports this prop (used identically by the public viewer, Task-independent, already shipped).

- [ ] **Step 2: Add taller's status control**

Still inside the header (desktop and mobile variants), where the existing `{!isTaller && (...)}`-wrapped "Guardar" button sits, add an always-visible (for taller specifically) status `<select>` reusing the exact pattern already on `kitchen/projects/page.tsx`'s list (`KITCHEN_PROJECT_STATUS_COLORS`, `updateKitchenProjectStatus`), restricted to the 3 statuses the backend allows taller to set:

```typescript
{isTaller && projectId !== null && (
  <select
    value={draft.status ?? "Borrador"}
    onChange={async (e) => {
      try {
        await updateKitchenProjectStatus(projectId, e.target.value as KitchenProjectStatus);
        toast.success("Estado actualizado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No fue posible actualizar el estado.");
      }
    }}
    className="h-8 rounded-full border-0 bg-ivory/8 px-3 text-xs font-medium text-ivory"
  >
    {(["Aprobado", "En producción", "Entregado"] as const).map((s) => (
      <option key={s} value={s} className="bg-[#111118]">{s}</option>
    ))}
  </select>
)}
```

(Add `KitchenProjectStatus` and `updateKitchenProjectStatus` to this file's existing `@/services/api` import if not already present; check first — `KitchenBuilder.tsx` may not currently import either.)

Note: `draft.status` — verify this field actually exists on the `KitchenDraft`/store draft shape (check `types/kitchen.ts`'s `KitchenDraft` interface and `useKitchenStore`'s draft handling); if `status` isn't currently tracked in the frontend draft at all (the backend has it, but the frontend might not read it back into the draft), add it to `KitchenDraft` and to `mapKitchenResponseToDraft`/`saveKitchenProject`'s payload mapping in `services/api.ts` as part of this step — this is a real gap to verify, not an assumption to skip.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Log in as `taller@demo.com`, open an existing kitchen project (one seeded/created as `seller`, status `Aprobado`), confirm: only "Vista 3D" tab shows, no Guardar/Nuevo/Habitación/Materiales/Compartir buttons, the 3D view is orbitable but modules can't be dragged/edited (no FAB cluster on tap), and the status dropdown is present and successfully moves the project to `En producción`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/kitchen/KitchenBuilder.tsx frontend/types/kitchen.ts frontend/services/api.ts
git commit -m "feat(frontend): taller's kitchen builder view — read-only, no pricing, status-only"
```

---

### Task 12: Frontend — Usuarios admin page

**Files:**
- Create: `frontend/app/users/page.tsx`
- Create: `frontend/components/users/UserFormModal.tsx`

**Interfaces:**
- Consumes: `listUsers/createUser/updateUser/deactivateUser`, `type User`, `type UserInput` (Task 7); `useRoleGuard`, `PAGE_ROLES` (Task 8).

- [ ] **Step 1: Write the form modal**

```typescript
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createUser, updateUser, type User, type UserInput } from "@/services/api";

const ROLE_OPTIONS: { value: UserInput["role"]; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "seller", label: "Vendedor" },
  { value: "taller", label: "Taller" },
];

export function UserFormModal({ user, onClose, onSaved }: {
  user?: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserInput["role"]>(user?.role ?? "seller");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(user?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || (!user && !password.trim())) {
      setError("Nombre, email y contraseña (para un usuario nuevo) son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: UserInput = { name: name.trim(), email: email.trim(), role, active };
    if (password.trim()) input.password = password.trim();
    try {
      if (user) {
        await updateUser(user.id, input);
      } else {
        await createUser(input);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible guardar el usuario.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">{user ? "Editar usuario" : "Nuevo usuario"}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserInput["role"])} className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white">
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value} className="bg-zinc-900">{r.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Contraseña{user ? " (opcional, deja vacío para no cambiarla)" : ""}
            </label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
            Activo
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
        <div className="shrink-0 border-t border-white/10 p-4">
          <Button className="w-full" disabled={saving} onClick={handleSubmit}>
            {saving ? "Guardando..." : user ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Write the list page**

```typescript
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deactivateUser, listUsers, type User } from "@/services/api";
import { UserFormModal } from "@/components/users/UserFormModal";
import { useAuthStore } from "@/store/useAuthStore";
import { useRoleGuard, PAGE_ROLES } from "@/lib/roleAccess";

const ROLE_LABELS: Record<User["role"], string> = { admin: "Admin", seller: "Vendedor", taller: "Taller" };

export default function UsersPage() {
  useRoleGuard(PAGE_ROLES["/users"]);
  const currentUserEmail = useAuthStore((s) => s.user?.email);
  const [users, setUsers] = useState<User[] | null>(null);
  const [editing, setEditing] = useState<User | "new" | null>(null);

  const reload = () => listUsers().then(setUsers);

  useEffect(() => {
    reload();
  }, []);

  const handleSaved = () => {
    setEditing(null);
    reload();
  };

  const handleDeactivate = async (user: User) => {
    if (!window.confirm(`¿Desactivar a "${user.name}"? Podrás reactivarlo después editándolo.`)) return;
    await deactivateUser(user.id);
    reload();
  };

  return (
    <AppShell title="Usuarios" subtitle="Administra quién tiene acceso y con qué rol">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">Cuentas del equipo</h3>
            <p className="text-sm text-zinc-400">Admin, Vendedor y Taller — cada uno ve y puede hacer solo lo que le corresponde.</p>
          </div>
          <Button onClick={() => setEditing("new")}>Nuevo usuario</Button>
        </div>
        {!users ? (
          <p className="text-sm text-zinc-400">Cargando...</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-zinc-400">
                <tr>{['Nombre', 'Email', 'Rol', 'Estado', 'Acciones'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-white/6">
                    <td className="px-4 py-4 font-medium text-white">{user.name}</td>
                    <td className="px-4 py-4 text-zinc-400">{user.email}</td>
                    <td className="px-4 py-4"><Badge tone={user.role === 'admin' ? 'indigo' : user.role === 'seller' ? 'amber' : 'emerald'}>{ROLE_LABELS[user.role]}</Badge></td>
                    <td className="px-4 py-4"><Badge tone={user.active ? 'emerald' : 'rose'}>{user.active ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="h-9" onClick={() => setEditing(user)}>Editar</Button>
                        {user.email !== currentUserEmail && (
                          <Button variant="danger" className="h-9" onClick={() => handleDeactivate(user)}>Desactivar</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <UserFormModal
          user={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Log in as admin, go to `/users`, create a `taller` account, edit it (change name, leave password blank, confirm the password didn't change by logging in with the old one), confirm your own row has no "Desactivar" button, confirm another admin/seller/taller row does and deactivating it flips its badge to "Inactivo" without removing the row. Log in as the newly-created taller account, confirm the sidebar only shows Dashboard/Cocinas/Proyectos.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/users/page.tsx frontend/components/users/UserFormModal.tsx
git commit -m "feat(frontend): add Usuarios admin CRUD page"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (role widening, Task 1/7), backend Gates + full route matrix (Tasks 1-6), Usuarios CRUD (Task 6/12), frontend sidebar/page gating (Tasks 8-9), owner display (Task 10), taller's price-free read-only kitchen view + status control (Task 11) — every spec section has a task.
- **Placeholder scan:** no TBD/TODO. Task 11's `draft.status` existence is flagged as "verify, don't assume" rather than glossed over — that's an honest unresolved-until-implementation-time detail, not a placeholder.
- **Type consistency:** `Role`/`"admin" | "seller" | "taller"` used identically across `useAuthStore.ts`, `services/api.ts` (login + `User`/`UserInput`), `roleAccess.ts`, and every gate name (`manage-catalog`, `manage-users`, `design-projects`, `view-pricing`, `view-projects`) matches between Task 1's definitions and every later task's route middleware string.

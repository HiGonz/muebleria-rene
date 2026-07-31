# Kitchen Client Sharing (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin generate a read-only, no-login link for a saved kitchen project that a client can open to view the 3D design (orbit/zoom/open doors/switch views) without any editing affordance.

**Architecture:** A new `kitchen_project_shares` table holds opaque tokens (never the numeric project id), each pointing at a `kitchen_project`. Two authenticated endpoints (create-or-reuse, revoke) live on the existing `KitchenProjectController`; one new public endpoint (`PublicKitchenShareController`, outside `auth:sanctum`) serves a deliberately thin read-only payload. The frontend reuses the existing `KitchenAssemblyScene` 3D engine unchanged except for one new `readOnly` prop that hides the module list — no parallel viewer component, no capability-flag plumbing, because every editing callback in that component is already optional and already gates the affordance that depends on it (drag needs `onModuleMove`, the gear button needs `onModuleActivate`, etc).

**Tech Stack:** Laravel 11 + Sanctum + PHPUnit (backend), Next.js 16 App Router + Zustand + react-three-fiber/drei + sonner + framer-motion (frontend). No new dependencies in either.

## Global Constraints

- The public share endpoint must never be added inside the `auth:sanctum` middleware group — it lives in its own controller (`PublicKitchenShareController`) specifically so a future edit to `KitchenProjectController` can't accidentally drag it into that group.
- The public payload returned by `GET /api/public/kitchen-shares/{token}` must only ever contain `projectName, roomWidth, roomDepth, ceilingHeight, openings, modules` — never `client_phone`, `notes`, `user_id`, `status`, or the numeric `kitchen_project_id`.
- A dead link (unknown token, revoked, expired) always responds `404` with no distinguishing detail about *why* — never leak revoked-vs-missing.
- The public viewer page (`app/viewer/[token]/page.tsx`) must never redirect to `/login` or imply the visitor needs an account, even on a dead link.
- `KitchenAssemblyScene` gains exactly one new prop (`readOnly?: boolean`); no other prop or internal behavior changes, since every editing capability already depends on an optional callback that the viewer page simply won't pass.
- No new npm or composer dependencies.

---

### Task 1: `kitchen_project_shares` schema + model + `KitchenProject` relations

**Files:**
- Create: `backend/database/migrations/2026_07_30_000100_create_kitchen_project_shares_table.php`
- Create: `backend/app/Models/KitchenProjectShare.php`
- Modify: `backend/app/Models/KitchenProject.php`
- Test: `backend/tests/Feature/KitchenProjectShareModelTest.php`

**Interfaces:**
- Produces: `KitchenProjectShare` model with `belongsTo(KitchenProject::class)` as `kitchenProject()`, and `isActive(): bool`.
- Produces: `KitchenProject::shares(): HasMany` and `KitchenProject::activeShare(): HasOne` (latest non-revoked share), consumed by Task 2's controller methods.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\KitchenProjectShare;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KitchenProjectShareModelTest extends TestCase
{
    use RefreshDatabase;

    private function createProject(User $user): KitchenProject
    {
        return KitchenProject::create([
            'user_id' => $user->id,
            'client_name' => 'Cliente de prueba',
            'project_name' => 'Cocina de prueba',
            'room_width' => 400,
            'room_depth' => 300,
            'ceiling_height' => 240,
            'openings' => [],
        ]);
    }

    public function test_a_kitchen_project_can_have_shares(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);

        $share = $project->shares()->create(['token' => 'abc123']);

        $this->assertSame($share->id, $project->fresh()->activeShare->id);
        $this->assertSame($project->id, $share->kitchenProject->id);
    }

    public function test_is_active_is_false_once_revoked(): void
    {
        $share = new KitchenProjectShare(['revoked_at' => now()]);
        $this->assertFalse($share->isActive());
    }

    public function test_is_active_is_true_with_no_revocation_or_expiration(): void
    {
        $share = new KitchenProjectShare();
        $this->assertTrue($share->isActive());
    }

    public function test_active_share_ignores_revoked_shares(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->shares()->create(['token' => 'revoked-one', 'revoked_at' => now()]);
        $active = $project->shares()->create(['token' => 'active-one']);

        $this->assertSame($active->id, $project->fresh()->activeShare->id);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=KitchenProjectShareModelTest`
Expected: FAIL — `Class "App\Models\KitchenProjectShare" not found`

- [ ] **Step 3: Create the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kitchen_project_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_project_id')->constrained()->cascadeOnDelete();

            // Opaque, never the numeric kitchen_project_id — see PublicKitchenShareController.
            $table->string('token', 48)->unique();

            // Unused in Phase 1 — a form field + an `if` in
            // PublicKitchenShareController@show turns these on later without
            // a new migration.
            $table->string('password_hash')->nullable();
            $table->timestamp('expires_at')->nullable();

            // The "stop sharing" switch — set instead of deleting the row, so
            // "who was this shared with, when" survives even though there's
            // no UI for that history in Phase 1.
            $table->timestamp('revoked_at')->nullable();

            $table->unsignedInteger('view_count')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen_project_shares');
    }
};
```

- [ ] **Step 4: Create the `KitchenProjectShare` model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenProjectShare extends Model
{
    protected $fillable = [
        'kitchen_project_id',
        'token',
        'password_hash',
        'expires_at',
        'revoked_at',
        'view_count',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
        'view_count' => 'integer',
    ];

    public function kitchenProject(): BelongsTo
    {
        return $this->belongsTo(KitchenProject::class);
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null
            && ($this->expires_at === null || $this->expires_at->isFuture());
    }
}
```

- [ ] **Step 5: Add `shares()` / `activeShare()` to `KitchenProject`**

Modify `backend/app/Models/KitchenProject.php` — add the `HasMany` import already present is reused; the file currently ends with:

```php
    public function modules(): HasMany
    {
        return $this->hasMany(KitchenModule::class);
    }

    public function quote(): HasOne
    {
        return $this->hasOne(KitchenQuote::class);
    }
}
```

Replace with:

```php
    public function modules(): HasMany
    {
        return $this->hasMany(KitchenModule::class);
    }

    public function quote(): HasOne
    {
        return $this->hasOne(KitchenQuote::class);
    }

    public function shares(): HasMany
    {
        return $this->hasMany(KitchenProjectShare::class);
    }

    public function activeShare(): HasOne
    {
        return $this->hasOne(KitchenProjectShare::class)->whereNull('revoked_at')->latestOfMany();
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=KitchenProjectShareModelTest`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
cd backend
git add database/migrations/2026_07_30_000100_create_kitchen_project_shares_table.php app/Models/KitchenProjectShare.php app/Models/KitchenProject.php tests/Feature/KitchenProjectShareModelTest.php
git commit -m "Add kitchen_project_shares table, model, and KitchenProject relations"
```

---

### Task 2: Share API — create, revoke, public viewer endpoint

**Files:**
- Create: `backend/app/Http/Controllers/PublicKitchenShareController.php`
- Modify: `backend/app/Http/Controllers/KitchenProjectController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/KitchenProjectShareTest.php`

**Interfaces:**
- Consumes: `KitchenProject::shares()`/`activeShare()`, `KitchenProjectShare::isActive()` from Task 1.
- Produces: `POST /api/kitchen-projects/{kitchenProject}/share` → `{ token, url, viewCount, createdAt }`; `DELETE /api/kitchen-projects/{kitchenProject}/share`; `GET /api/public/kitchen-shares/{token}` → `{ projectName, roomWidth, roomDepth, ceilingHeight, openings, modules }`. These three response shapes are consumed by Task 3's `publicApi.ts` and `api.ts`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\KitchenProjectShare;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenProjectShareTest extends TestCase
{
    use RefreshDatabase;

    private function createProject(User $user): KitchenProject
    {
        return KitchenProject::create([
            'user_id' => $user->id,
            'client_name' => 'Cliente de prueba',
            'project_name' => 'Cocina de prueba',
            'room_width' => 400,
            'room_depth' => 300,
            'ceiling_height' => 240,
            'openings' => [],
        ]);
    }

    public function test_creates_a_share_link_for_a_kitchen_project(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $response = $this->postJson("/api/kitchen-projects/{$project->id}/share");

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'url', 'viewCount', 'createdAt']);
        $this->assertDatabaseCount('kitchen_project_shares', 1);
    }

    public function test_reuses_the_existing_active_share_instead_of_creating_a_new_one(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $first = $this->postJson("/api/kitchen-projects/{$project->id}/share")->json();
        $second = $this->postJson("/api/kitchen-projects/{$project->id}/share")->json();

        $this->assertSame($first['token'], $second['token']);
        $this->assertDatabaseCount('kitchen_project_shares', 1);
    }

    public function test_a_user_cannot_share_another_users_kitchen_project(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $project = $this->createProject($owner);

        Sanctum::actingAs($intruder);

        $this->postJson("/api/kitchen-projects/{$project->id}/share")->assertStatus(403);
    }

    public function test_public_viewer_endpoint_returns_the_thin_project_payload(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->modules()->create([
            'module_type' => 'cajonera',
            'category' => 'lower',
            'label' => 'Cajonera',
            'height' => 82,
            'width' => 60,
            'depth' => 60,
            'x' => 10,
            'z' => 10,
            'rotation' => 0,
            'options' => [],
        ]);
        $share = $project->shares()->create(['token' => 'test-token-123']);

        $response = $this->getJson('/api/public/kitchen-shares/test-token-123');

        $response->assertStatus(200)
            ->assertJson([
                'projectName' => 'Cocina de prueba',
                'roomWidth' => 400,
                'roomDepth' => 300,
                'ceilingHeight' => 240,
            ])
            ->assertJsonMissingPath('client_phone')
            ->assertJsonMissingPath('notes')
            ->assertJsonMissingPath('user_id')
            ->assertJsonMissingPath('status');
        $this->assertSame(1, $share->fresh()->view_count);
    }

    public function test_public_viewer_endpoint_404s_for_an_unknown_token(): void
    {
        $this->getJson('/api/public/kitchen-shares/does-not-exist')->assertStatus(404);
    }

    public function test_public_viewer_endpoint_404s_for_a_revoked_share(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->shares()->create(['token' => 'revoked-token', 'revoked_at' => now()]);

        $this->getJson('/api/public/kitchen-shares/revoked-token')->assertStatus(404);
    }

    public function test_revoking_a_share_makes_it_inactive(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $this->postJson("/api/kitchen-projects/{$project->id}/share");
        $this->deleteJson("/api/kitchen-projects/{$project->id}/share")->assertStatus(200);

        $this->assertNotNull(KitchenProjectShare::first()->revoked_at);
    }

    public function test_revoking_when_no_active_share_exists_returns_404(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $this->deleteJson("/api/kitchen-projects/{$project->id}/share")->assertStatus(404);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=KitchenProjectShareTest`
Expected: FAIL — routes don't exist yet (404 on all requests instead of the expected assertions matching)

- [ ] **Step 3: Create `PublicKitchenShareController`**

```php
<?php

namespace App\Http\Controllers;

use App\Models\KitchenProjectShare;
use Illuminate\Http\JsonResponse;

class PublicKitchenShareController extends Controller
{
    public function show(string $token): JsonResponse
    {
        $share = KitchenProjectShare::where('token', $token)->first();

        if (!$share || !$share->isActive()) {
            abort(404);
        }

        $share->increment('view_count');

        $project = $share->kitchenProject()->with('modules')->firstOrFail();

        return response()->json([
            'projectName' => $project->project_name,
            'roomWidth' => $project->room_width,
            'roomDepth' => $project->room_depth,
            'ceilingHeight' => $project->ceiling_height,
            'openings' => $project->openings,
            'modules' => $project->modules,
        ]);
    }
}
```

- [ ] **Step 4: Add `createShare` / `revokeShare` to `KitchenProjectController`**

Modify `backend/app/Http/Controllers/KitchenProjectController.php`. First add the model import — the top of the file currently reads:

```php
use App\Models\KitchenProject;
use App\Models\KitchenModule;
use App\Models\KitchenQuote;
```

Replace with:

```php
use App\Models\KitchenProject;
use App\Models\KitchenModule;
use App\Models\KitchenProjectShare;
use App\Models\KitchenQuote;
```

Then add the two new methods right before the closing `authorizeProject` section — the file currently ends with:

```php
    // ─────────────────────────────────────────────────────────────────────────
    private function authorizeProject(Request $request, KitchenProject $project): void
    {
        abort_if($project->user_id !== $request->user()->id, 403, 'No autorizado.');
    }
}
```

Replace with:

```php
    // ── Share ─────────────────────────────────────────────────────────────────
    public function createShare(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);

        $share = $kitchenProject->activeShare()->first();

        if (!$share) {
            $share = $kitchenProject->shares()->create([
                'token' => Str::random(40),
            ]);
        }

        $origin = rtrim(config('cors.allowed_origins')[0] ?? 'http://localhost:3000', '/');

        return response()->json([
            'token' => $share->token,
            'url' => "{$origin}/viewer/{$share->token}",
            'viewCount' => $share->view_count,
            'createdAt' => $share->created_at,
        ]);
    }

    public function revokeShare(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->authorizeProject($request, $kitchenProject);

        $share = $kitchenProject->activeShare()->first();
        abort_if(!$share, 404, 'Este proyecto no tiene un enlace activo.');

        $share->update(['revoked_at' => now()]);

        return response()->json(['message' => 'Enlace de compartir revocado.']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    private function authorizeProject(Request $request, KitchenProject $project): void
    {
        abort_if($project->user_id !== $request->user()->id, 403, 'No autorizado.');
    }
}
```

- [ ] **Step 5: Register the routes**

Modify `backend/routes/api.php`. The current full file:

```php
<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\KitchenProjectController;
use App\Http\Controllers\MaterialController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\QuoteController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/dashboard/stats', [DashboardController::class, 'index']);

    Route::apiResource('projects', ProjectController::class);
    Route::post('/projects/{project}/calculate', [ProjectController::class, 'calculate']);
    Route::post('/projects/{project}/quote', [ProjectController::class, 'quote']);

    Route::get('/quotes', [QuoteController::class, 'index']);
    Route::get('/quotes/{quote}', [QuoteController::class, 'show']);
    Route::put('/quotes/{quote}/status', [QuoteController::class, 'updateStatus']);

    Route::apiResource('materials', MaterialController::class)->except(['show']);

    // Kitchen projects (modular builder)
    Route::apiResource('kitchen-projects', KitchenProjectController::class);
    Route::post('/kitchen-projects/{kitchenProject}/modules/sync', [KitchenProjectController::class, 'syncModules']);
    Route::post('/kitchen-projects/{kitchenProject}/quote', [KitchenProjectController::class, 'quote']);
});
```

Replace it in full with:

```php
<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\KitchenProjectController;
use App\Http\Controllers\MaterialController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\PublicKitchenShareController;
use App\Http\Controllers\QuoteController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

// Public — no auth:sanctum, serves the read-only client viewer. Kept in its
// own controller (never inside the group below) so it can never accidentally
// end up behind auth:sanctum.
Route::get('/public/kitchen-shares/{token}', [PublicKitchenShareController::class, 'show']);

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);

    Route::get('/dashboard/stats', [DashboardController::class, 'index']);

    Route::apiResource('projects', ProjectController::class);
    Route::post('/projects/{project}/calculate', [ProjectController::class, 'calculate']);
    Route::post('/projects/{project}/quote', [ProjectController::class, 'quote']);

    Route::get('/quotes', [QuoteController::class, 'index']);
    Route::get('/quotes/{quote}', [QuoteController::class, 'show']);
    Route::put('/quotes/{quote}/status', [QuoteController::class, 'updateStatus']);

    Route::apiResource('materials', MaterialController::class)->except(['show']);

    // Kitchen projects (modular builder)
    Route::apiResource('kitchen-projects', KitchenProjectController::class);
    Route::post('/kitchen-projects/{kitchenProject}/modules/sync', [KitchenProjectController::class, 'syncModules']);
    Route::post('/kitchen-projects/{kitchenProject}/quote', [KitchenProjectController::class, 'quote']);
    Route::post('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'createShare']);
    Route::delete('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'revokeShare']);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=KitchenProjectShareTest`
Expected: PASS (8 tests)

- [ ] **Step 7: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS (all tests, including `KitchenProjectShareModelTest` from Task 1 and the pre-existing `ExampleTest`)

- [ ] **Step 8: Commit**

```bash
cd backend
git add app/Http/Controllers/PublicKitchenShareController.php app/Http/Controllers/KitchenProjectController.php routes/api.php tests/Feature/KitchenProjectShareTest.php
git commit -m "Add kitchen project share create/revoke endpoints and public viewer endpoint"
```

---

### Task 3: Frontend API layer — `publicApi.ts` + `api.ts` additions

**Files:**
- Create: `frontend/services/publicApi.ts`
- Modify: `frontend/services/api.ts`

**Interfaces:**
- Consumes: `KitchenModule`, `WallOpening`, `ModuleCategory`, `KitchenModuleType` from `@/types/kitchen`.
- Produces: `getPublicKitchenShare(token: string): Promise<PublicKitchenView>` (consumed by Task 5's viewer page). `createKitchenShare(id: number): Promise<KitchenShare>` and `revokeKitchenShare(id: number): Promise<void>` (consumed by Task 4's `ShareModal.tsx`).

- [ ] **Step 1: Create `frontend/services/publicApi.ts`**

This deliberately does NOT use `services/http.ts` — that helper attaches a Bearer token from `useAuthStore` and redirects to `/login` on 401, both wrong for an anonymous public page (a dead share link must 404 quietly, never imply the visitor should log in).

```ts
import type { KitchenModule, ModuleCategory, KitchenModuleType, WallOpening } from "@/types/kitchen";

interface PublicKitchenModule {
  id: number;
  module_type: string;
  category: ModuleCategory;
  label: string;
  height: number;
  width: number;
  depth: number;
  x: number;
  z: number;
  rotation: number;
  options: KitchenModule["options"];
}

interface PublicKitchenSharePayload {
  projectName: string;
  roomWidth: number;
  roomDepth: number;
  ceilingHeight: number;
  openings: WallOpening[] | null;
  modules: PublicKitchenModule[];
}

export interface PublicKitchenView {
  projectName: string;
  roomWidth: number;
  roomDepth: number;
  ceilingHeight: number;
  openings: WallOpening[];
  modules: KitchenModule[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function getPublicKitchenShare(token: string): Promise<PublicKitchenView> {
  const response = await fetch(`${API_URL}/public/kitchen-shares/${token}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) throw new Error("share_not_found");

  const json: PublicKitchenSharePayload = await response.json();

  return {
    projectName: json.projectName,
    roomWidth: json.roomWidth,
    roomDepth: json.roomDepth,
    ceilingHeight: json.ceilingHeight,
    openings: json.openings ?? [],
    modules: json.modules.map((m) => ({
      id: String(m.id),
      category: m.category,
      type: m.module_type as KitchenModuleType,
      label: m.label,
      dimensions: { height: m.height, width: m.width, depth: m.depth },
      options: m.options,
      x: m.x,
      z: m.z,
      rotation: (m.rotation as 0 | 90 | 180 | 270) ?? 0,
    })),
  };
}
```

- [ ] **Step 2: Add share functions to `frontend/services/api.ts`**

The file currently ends with:

```ts
export async function saveKitchenProject(draft: KitchenDraft, projectId: number | null): Promise<number> {
  const payload = mapKitchenPayload(draft);
  if (projectId === null) {
    const created = await http.post<BackendKitchenProject>("/kitchen-projects", payload);
    return created.id;
  }
  const { modules, ...meta } = payload;
  await http.put(`/kitchen-projects/${projectId}`, meta);
  await http.post(`/kitchen-projects/${projectId}/modules/sync`, { modules });
  return projectId;
}
```

Add this immediately after it:

```ts

export interface KitchenShare {
  token: string;
  url: string;
  viewCount: number;
  createdAt: string;
}

export async function createKitchenShare(id: number): Promise<KitchenShare> {
  return http.post<KitchenShare>(`/kitchen-projects/${id}/share`);
}

export async function revokeKitchenShare(id: number): Promise<void> {
  await http.delete(`/kitchen-projects/${id}/share`);
}
```

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd frontend
git add services/publicApi.ts services/api.ts
git commit -m "Add frontend API functions for kitchen project sharing"
```

---

### Task 4: `ShareModal.tsx` + `KitchenBuilder.tsx` wiring

**Files:**
- Create: `frontend/components/kitchen/ShareModal.tsx`
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx`

**Interfaces:**
- Consumes: `createKitchenShare(id: number): Promise<KitchenShare>`, `revokeKitchenShare(id: number): Promise<void>` from Task 3.
- Produces: `<ShareModal kitchenProjectId={number} onClose={() => void} />`, mounted from `KitchenBuilder.tsx`.

- [ ] **Step 1: Create `frontend/components/kitchen/ShareModal.tsx`**

Mirrors the existing modal shell in `GlobalHeightsModal.tsx` (fixed dark overlay, `motion.div` card, header with title/subtitle + `X` close button).

The create endpoint is idempotent — it returns the existing active share instead of minting a new one — so this modal fetches it immediately on open instead of waiting for a manual "Generar enlace" click. That avoids a stale "not shared yet" flash every time an admin reopens the modal for a project that's already shared. The one case that still needs an explicit button is right after "Dejar de compartir": at that point there truly is no active share, and generating the next one is a deliberate action.

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createKitchenShare, revokeKitchenShare } from "@/services/api";

interface ShareModalProps {
  kitchenProjectId: number;
  onClose: () => void;
}

export function ShareModal({ kitchenProjectId, onClose }: ShareModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    createKitchenShare(kitchenProjectId)
      .then((share) => setUrl(share.url))
      .catch(() => toast.error("No fue posible generar el enlace de compartir."))
      .finally(() => setLoading(false));
  }, [kitchenProjectId]);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async () => {
    setRevoking(true);
    try {
      await revokeKitchenShare(kitchenProjectId);
      setUrl(null);
      toast.success("Se dejó de compartir este proyecto.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible dejar de compartir.");
    } finally {
      setRevoking(false);
    }
  };

  const generate = async () => {
    setLoading(true);
    try {
      const share = await createKitchenShare(kitchenProjectId);
      setUrl(share.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible generar el enlace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-ivory/10 bg-surface-raised shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-ivory/8 px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-ivory">Compartir con cliente</h2>
            <p className="mt-0.5 text-xs text-warmgray">
              Enlace de solo lectura — el cliente puede ver la cocina en 3D sin poder editarla
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {loading ? (
            <p className="text-xs text-warmgray">Generando enlace...</p>
          ) : url ? (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-ivory/10 bg-ivory/4 px-3 py-2.5">
                <span className="flex-1 truncate text-xs text-ivory/80">{url}</span>
                <button
                  onClick={copy}
                  aria-label="Copiar enlace"
                  title="Copiar enlace"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-warmgray transition-colors hover:bg-ivory/10 hover:text-ivory"
                >
                  {copied ? <Check size={14} className="text-sage" /> : <Copy size={14} />}
                </button>
              </div>
              <Button variant="danger" className="h-9 w-full text-xs" disabled={revoking} onClick={revoke}>
                {revoking ? "Revocando..." : "Dejar de compartir"}
              </Button>
            </>
          ) : (
            <Button variant="primary" className="h-9 w-full text-xs" onClick={generate}>
              Generar enlace
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the share button into `KitchenBuilder.tsx`**

Add the `Share2` icon and `ShareModal` import. The current import block:

```tsx
import { Settings, Sparkles, Palette, Ruler, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { SampleKitchenVariant } from "@/services/kitchenData";
import { getKitchenProject, saveKitchenProject } from "@/services/api";
import { useKitchenStore } from "@/store/useKitchenStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { ModuleSelector } from "./ModuleSelector";
import { ModuleInspector } from "./ModuleInspector";
import { KitchenSummary } from "./KitchenSummary";
import { BuilderFab } from "./BuilderFab";
import { GlobalMaterialsModal } from "./GlobalMaterialsModal";
import { GlobalHeightsModal } from "./GlobalHeightsModal";
import { RoomSettingsModal } from "./RoomSettingsModal";
```

Replace with:

```tsx
import { Settings, Sparkles, Palette, Ruler, ChevronDown, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { SampleKitchenVariant } from "@/services/kitchenData";
import { getKitchenProject, saveKitchenProject } from "@/services/api";
import { useKitchenStore } from "@/store/useKitchenStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { ModuleSelector } from "./ModuleSelector";
import { ModuleInspector } from "./ModuleInspector";
import { KitchenSummary } from "./KitchenSummary";
import { BuilderFab } from "./BuilderFab";
import { GlobalMaterialsModal } from "./GlobalMaterialsModal";
import { GlobalHeightsModal } from "./GlobalHeightsModal";
import { RoomSettingsModal } from "./RoomSettingsModal";
import { ShareModal } from "./ShareModal";
```

Add a `showShareModal` state next to the other modal states. Current:

```tsx
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showGlobalMaterials, setShowGlobalMaterials] = useState(false);
  const [showGlobalHeights, setShowGlobalHeights] = useState(false);
  const [showSampleMenu, setShowSampleMenu] = useState(false);
```

Replace with:

```tsx
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showGlobalMaterials, setShowGlobalMaterials] = useState(false);
  const [showGlobalHeights, setShowGlobalHeights] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSampleMenu, setShowSampleMenu] = useState(false);
```

Add the button in the header, right before "Guardar". Current:

```tsx
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={resetDraft}>Nuevo</Button>
          <Button
            variant="primary"
            className="h-8 px-3 text-xs"
            disabled={saving}
```

Replace with:

```tsx
          <Button variant="secondary" className="h-8 px-3 text-xs" onClick={resetDraft}>Nuevo</Button>
          {projectId !== null && (
            <Button
              variant="ghost"
              className="h-8 w-8 px-0 text-xs sm:w-auto sm:px-3"
              onClick={() => setShowShareModal(true)}
              title="Compartir con cliente"
              aria-label="Compartir con cliente"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline sm:ml-1.5">Compartir</span>
            </Button>
          )}
          <Button
            variant="primary"
            className="h-8 px-3 text-xs"
            disabled={saving}
```

Mount the modal alongside the others. Current:

```tsx
      {showRoomSettings && <RoomSettingsModal onClose={() => setShowRoomSettings(false)} />}
      {showGlobalMaterials && <GlobalMaterialsModal onClose={() => setShowGlobalMaterials(false)} />}
      {showGlobalHeights && <GlobalHeightsModal onClose={() => setShowGlobalHeights(false)} />}
    </div>
  );
}
```

Replace with:

```tsx
      {showRoomSettings && <RoomSettingsModal onClose={() => setShowRoomSettings(false)} />}
      {showGlobalMaterials && <GlobalMaterialsModal onClose={() => setShowGlobalMaterials(false)} />}
      {showGlobalHeights && <GlobalHeightsModal onClose={() => setShowGlobalHeights(false)} />}
      {showShareModal && projectId !== null && (
        <ShareModal kitchenProjectId={projectId} onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd frontend
git add components/kitchen/ShareModal.tsx components/kitchen/KitchenBuilder.tsx
git commit -m "Add share-with-client modal to the kitchen builder"
```

---

### Task 5: `KitchenAssemblyScene` `readOnly` prop + public viewer page

**Files:**
- Modify: `frontend/components/3d/KitchenAssemblyScene.tsx`
- Create: `frontend/app/viewer/[token]/page.tsx`

**Interfaces:**
- Consumes: `getPublicKitchenShare(token: string): Promise<PublicKitchenView>` from Task 3.
- Produces: `<KitchenAssemblyScene readOnly ... />` — the `readOnly` prop is new; every other prop is unchanged from the existing signature.

- [ ] **Step 1: Add the `readOnly` prop to `KitchenAssemblyScene`**

The props interface currently ends with:

```tsx
  onModuleRemove?: (id: string) => void;
  onOpeningMove?: (id: string, offset: number) => void;
  onUndo?: () => void;
  undoCount?: number;
}
```

Replace with:

```tsx
  onModuleRemove?: (id: string) => void;
  onOpeningMove?: (id: string, offset: number) => void;
  onUndo?: () => void;
  undoCount?: number;
  // The public "share with client" viewer passes this and nothing else —
  // every editing prop above is already optional and simply omitted there,
  // so this is the only new capability flag needed: it hides the module
  // list (isolate/hide/delete controls), which has no editing callback of
  // its own to gate on.
  readOnly?: boolean;
}
```

The function signature currently reads:

```tsx
export function KitchenAssemblyScene({
  modules, roomWidth, roomDepth, ceilingHeight, openings = [], onModuleMove, onModuleActivate, onModuleNudge, onModuleRemove, onOpeningMove, onUndo, undoCount = 0,
}: KitchenAssemblySceneProps) {
```

Replace with:

```tsx
export function KitchenAssemblyScene({
  modules, roomWidth, roomDepth, ceilingHeight, openings = [], onModuleMove, onModuleActivate, onModuleNudge, onModuleRemove, onOpeningMove, onUndo, undoCount = 0, readOnly = false,
}: KitchenAssemblySceneProps) {
```

- [ ] **Step 2: Hide the module list panel when `readOnly`**

The module list panel currently starts with:

```tsx
      {/* Module list — always bottom-left. Used to move to bottom-right on
          desktop, which is exactly where the module inspector/selector panel
          (right-anchored) slides in from and blocked it while configuring a
          module — pinned left on every breakpoint now instead. */}
      <div className={`absolute bottom-3 left-3 z-10 flex flex-col rounded-xl border border-ivory/8 bg-black/60 backdrop-blur-sm text-xs text-warmgray ${listCollapsed ? "" : "w-60"}`}>
```

Replace with:

```tsx
      {/* Module list — always bottom-left. Used to move to bottom-right on
          desktop, which is exactly where the module inspector/selector panel
          (right-anchored) slides in from and blocked it while configuring a
          module — pinned left on every breakpoint now instead. Not rendered
          at all in the read-only public viewer — there's no editing
          callback to gate isolate/hide/delete on in there. */}
      {!readOnly && (
      <div className={`absolute bottom-3 left-3 z-10 flex flex-col rounded-xl border border-ivory/8 bg-black/60 backdrop-blur-sm text-xs text-warmgray ${listCollapsed ? "" : "w-60"}`}>
```

And the panel currently closes right before the `<Canvas`:

```tsx
        )}
      </div>

      <Canvas
```

Replace with:

```tsx
        )}
      </div>
      )}

      <Canvas
```

- [ ] **Step 3: Create the public viewer page**

Mirrors `app/projects/[id]/page.tsx` for the `params: Promise<...>` pattern and `app/kitchen/page.tsx` for the `dynamic(..., { ssr: false })` import of the 3D scene (three.js can't run server-side).

```tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getPublicKitchenShare, type PublicKitchenView } from "@/services/publicApi";

const KitchenAssemblyScene = dynamic(() => import("@/components/3d/KitchenAssemblyScene").then((m) => m.KitchenAssemblyScene), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-ink">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brass border-t-transparent" />
    </div>
  ),
});

export default function PublicKitchenViewerPage({ params }: { params: Promise<{ token: string }> }) {
  const [view, setView] = useState<PublicKitchenView | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    params
      .then(({ token }) => getPublicKitchenShare(token))
      .then(setView)
      .catch(() => setNotFound(true));
  }, [params]);

  if (notFound) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-ink px-4 text-center text-ivory">
        <p className="text-4xl">🔒</p>
        <h1 className="font-display text-lg font-semibold">Este enlace ya no está disponible</h1>
        <p className="max-w-sm text-sm text-warmgray">Pide al diseñador que te comparta un enlace nuevo.</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brass border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-ivory">
      <header className="flex shrink-0 items-center gap-3 border-b border-ivory/8 px-5 py-3">
        <h1 className="truncate font-display text-base font-semibold text-ivory">{view.projectName}</h1>
      </header>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <KitchenAssemblyScene
          readOnly
          modules={view.modules}
          roomWidth={view.roomWidth}
          roomDepth={view.roomDepth}
          ceilingHeight={view.ceilingHeight}
          openings={view.openings}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Manual end-to-end verification**

With both dev servers running (`cd backend && php artisan serve`, `cd frontend && npm run dev`):

1. Open a saved kitchen project at `/kitchen?projectId=<id>`.
2. Click "Compartir" in the header — the modal should show a generated `http://localhost:.../viewer/<token>` link within ~1 second.
3. Click the copy icon — a checkmark should briefly replace it.
4. Open the copied URL in a new incognito window (no session) — the kitchen should render with camera controls (orbit/zoom/presets/wireframe/labels/dimensions) but no module list, no FAB, no inspector, and right-click/double-tap should still open doors/drawers.
5. Back in the original tab, click "Dejar de compartir".
6. Reload the incognito tab — it should show "Este enlace ya no está disponible", not a login redirect.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add components/3d/KitchenAssemblyScene.tsx "app/viewer/[token]/page.tsx"
git commit -m "Add readOnly mode to KitchenAssemblyScene and the public viewer page"
```

---

## Self-Review

**Spec coverage:**
- `kitchen_project_shares` table, `KitchenProjectShare` model, `isActive()`, `KitchenProject::shares()`/`activeShare()` → Task 1.
- `POST`/`DELETE .../share`, `GET /api/public/kitchen-shares/{token}` (thin payload, 404 on dead link, view_count increment, `PublicKitchenShareController` kept separate from `auth:sanctum`) → Task 2.
- `publicApi.ts` (plain fetch, no Bearer/redirect), `api.ts` share functions → Task 3.
- "Compartir con cliente" button + modal (generate, copy, revoke) → Task 4.
- `KitchenAssemblyScene` `readOnly` prop, `app/viewer/[token]/page.tsx`, no `AppShell`/login gate, "enlace ya no disponible" state → Task 5.
- Out-of-scope reminders (Taller role, photo storage, password/expiration) are intentionally not addressed by this plan — they're separate future specs per the design doc.

**Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code; no "similar to Task N" references.

**Type consistency:** `KitchenShare` (api.ts) matches the object `ShareModal.tsx` reads (`share.url`). `PublicKitchenView`/`getPublicKitchenShare` (publicApi.ts) matches what the viewer page destructures (`view.projectName`, `.roomWidth`, `.roomDepth`, `.ceilingHeight`, `.modules`, `.openings`). `KitchenAssemblyScene`'s new `readOnly` prop name and default (`false`) match its usage in the viewer page (`readOnly` shorthand for `true`). `createShare`/`revokeShare` method names in `KitchenProjectController` match the route definitions in `api.php`.

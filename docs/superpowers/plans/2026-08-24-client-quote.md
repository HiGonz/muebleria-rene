# Client-Facing Quote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff type a manual, client-facing quote (amount + curated "incluye" list + styled notes) per project, versioned, editable from the projects table, and shown as a floating panel on the existing client share link — entirely separate from the internally computed materials total.

**Architecture:** A new backend table/model/controller (`kitchen_client_quotes`) stores an append-only version history per project, exposed via two authenticated endpoints (list, create) plus one new key on the existing public share endpoint (latest version only). The frontend gets a new modal (mirroring the existing `ShareModal` pattern) reachable from the projects table, a small pure function that derives "incluye" suggestions from the project's own already-configured module options, a lightweight markdown-lite editor (toolbar + textarea + live preview, no new rich-text editor dependency), and a floating collapsible panel on the public viewer page.

**Tech Stack:** Next.js 16 / React 19 / TypeScript (frontend), Laravel 12 / Sanctum (backend), Vitest (frontend unit tests), PHPUnit feature tests (backend), one new frontend dependency: `react-markdown`.

**Spec:** `docs/superpowers/specs/2026-08-24-client-quote-design.md`

## Global Constraints

- The internal computed total (`calculateKitchenMaterials`, the admin table's "Cotización" column, `KitchenSummary`, the PDF export) is never touched by this plan.
- The existing `kitchen_quotes` table/`KitchenQuote` model (currently unused/dead) is left alone — this plan adds a separate, differently-shaped table, not a repurposing of that one.
- Every save creates a new, immutable version row — no editing or deleting past versions.
- The public share payload only ever includes the *latest* client-quote version, never the full history.
- Markdown support is limited to bold, bullet lists, and one heading level (`##`) — no tables, links, images, or nested lists.
- Follow existing snake_case (backend) → camelCase (frontend) mapping conventions exactly as done for `StatusHistoryEntry`/`KitchenShare` in `services/api.ts`.

---

### Task 1: Backend — client quote data model + CRUD endpoints

**Files:**
- Create: `backend/database/migrations/2026_08_24_000100_create_kitchen_client_quotes_table.php`
- Create: `backend/app/Models/KitchenClientQuote.php`
- Create: `backend/app/Http/Controllers/Concerns/AssertsKitchenProjectVisibility.php`
- Create: `backend/app/Http/Controllers/KitchenClientQuoteController.php`
- Modify: `backend/app/Models/KitchenProject.php` (add `clientQuotes()`/`currentClientQuote()` relations)
- Modify: `backend/app/Http/Controllers/KitchenProjectController.php` (use the extracted trait instead of its own private `assertVisible`)
- Modify: `backend/routes/api.php` (register the two new routes)
- Test: `backend/tests/Feature/KitchenClientQuoteTest.php`

**Interfaces:**
- Produces: `KitchenClientQuote` model with `belongsTo(KitchenProject)`/`belongsTo(User)`; `KitchenProject::clientQuotes()` (`HasMany`, newest-first) and `KitchenProject::currentClientQuote()` (`HasOne`, latest). `GET /kitchen-projects/{id}/client-quotes` → array of `{id, amount, includes, notes, created_at, user: {id, name} | null}`. `POST /kitchen-projects/{id}/client-quotes` body `{amount?: number|null, includes?: string[], notes?: string|null}` → same shape, single object.

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
        Schema::create('kitchen_client_quotes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('kitchen_project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // The manually-typed, client-facing amount — independent of the
            // internally computed materials total, which is never persisted
            // here or anywhere (see kitchenData.ts's calculateKitchenMaterials).
            $table->decimal('amount', 10, 2)->nullable();

            // Short "incluye" strings, e.g. ["Tablero: Melamina blanca 15mm"].
            // Always written explicitly by the controller (defaults to []),
            // so no DB-level default is needed.
            $table->json('includes');

            // Markdown source (bold/bullets/one heading level only).
            $table->text('notes')->nullable();

            // Append-only history — no updated_at, rows are never edited.
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kitchen_client_quotes');
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && php artisan migrate`
Expected: `Migrating: ..._create_kitchen_client_quotes_table` then `Migrated:` with no errors. Confirm with `php artisan migrate:status` that it shows as `Ran`.

- [ ] **Step 3: Write the model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KitchenClientQuote extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'kitchen_project_id',
        'user_id',
        'amount',
        'includes',
        'notes',
        'created_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'includes' => 'array',
        'created_at' => 'datetime',
    ];

    public function kitchenProject(): BelongsTo
    {
        return $this->belongsTo(KitchenProject::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Step 4: Add the relations to `KitchenProject`**

In `backend/app/Models/KitchenProject.php`, add right after the existing `quote()` method:

```php
    public function clientQuotes(): HasMany
    {
        return $this->hasMany(KitchenClientQuote::class)->orderByDesc('created_at')->orderByDesc('id');
    }

    public function currentClientQuote(): HasOne
    {
        // Explicit column — KitchenClientQuote disables Eloquent's automatic
        // timestamps ($timestamps = false, since versions are immutable and
        // have no updated_at), so don't rely on latestOfMany()'s default
        // column inference; say "order by created_at" outright.
        return $this->hasOne(KitchenClientQuote::class)->latestOfMany('created_at');
    }
```

`HasMany` and `HasOne` are already imported in this file (used by `modules()`/`shares()` and `quote()`/`activeShare()` respectively) — no new imports needed.

- [ ] **Step 5: Extract the shared visibility check into a trait**

`KitchenProjectController` already has a private `assertVisible(Request, KitchenProject)` method (role-based project visibility: a `seller` only sees their own projects, a `taller` only sees projects in production/delivered status). The new controller needs the identical check — extract it once now rather than duplicating it, since this is the second consumer.

Create `backend/app/Http/Controllers/Concerns/AssertsKitchenProjectVisibility.php`:

```php
<?php

namespace App\Http\Controllers\Concerns;

use App\Models\KitchenProject;
use Illuminate\Http\Request;

trait AssertsKitchenProjectVisibility
{
    private function assertVisible(Request $request, KitchenProject $kitchenProject): void
    {
        $user = $request->user();

        abort_if($user->role === 'seller' && $kitchenProject->user_id !== $user->id, 404);
        abort_if($user->role === 'taller' && !in_array($kitchenProject->status, ['En producción', 'Entregado'], true), 404);
    }
}
```

In `backend/app/Http/Controllers/KitchenProjectController.php`:
1. Add `use App\Http\Controllers\Concerns\AssertsKitchenProjectVisibility;` to the imports.
2. Add `use AssertsKitchenProjectVisibility;` as the first line inside the `class KitchenProjectController extends Controller { ... }` body.
3. Delete the now-duplicate private `assertVisible` method (the one at line ~158 found via `grep -n "function assertVisible" app/Http/Controllers/KitchenProjectController.php`).

- [ ] **Step 6: Write the controller**

```php
<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AssertsKitchenProjectVisibility;
use App\Models\KitchenProject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KitchenClientQuoteController extends Controller
{
    use AssertsKitchenProjectVisibility;

    public function index(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->assertVisible($request, $kitchenProject);

        return response()->json(
            $kitchenProject->clientQuotes()->with('user:id,name')->get()
        );
    }

    public function store(Request $request, KitchenProject $kitchenProject): JsonResponse
    {
        $this->assertVisible($request, $kitchenProject);

        $validated = $request->validate([
            'amount' => 'nullable|numeric|min:0',
            'includes' => 'nullable|array',
            'includes.*' => 'string|max:255',
            'notes' => 'nullable|string|max:5000',
        ]);

        // empty() would wrongly treat a legitimate amount of exactly 0 as
        // "nothing provided" — check for null explicitly instead.
        if (($validated['amount'] ?? null) === null && empty($validated['includes']) && empty($validated['notes'])) {
            return response()->json([
                'message' => 'La cotización necesita al menos un monto, un material incluido o una nota.',
            ], 422);
        }

        $quote = $kitchenProject->clientQuotes()->create([
            'user_id' => $request->user()->id,
            'amount' => $validated['amount'] ?? null,
            'includes' => $validated['includes'] ?? [],
            'notes' => $validated['notes'] ?? null,
            'created_at' => now(),
        ]);

        return response()->json($quote->load('user:id,name'));
    }
}
```

- [ ] **Step 7: Register the routes**

In `backend/routes/api.php`, add the import `use App\Http\Controllers\KitchenClientQuoteController;` directly above the existing `use App\Http\Controllers\KitchenProjectController;` line, keeping the two `Kitchen*` controller imports grouped together.

Add the GET route inside the existing `Route::middleware('can:view-projects')->group(...)` block (same group as `status-history`, so every role that can view a project can see its client-quote history):

```php
        Route::get('/kitchen-projects/{kitchenProject}/client-quotes', [KitchenClientQuoteController::class, 'index']);
```

Add the POST route inside the existing `Route::middleware('can:design-projects')->group(...)` block (same group as `share`/`quote`/`modules/sync`):

```php
        Route::post('/kitchen-projects/{kitchenProject}/client-quotes', [KitchenClientQuoteController::class, 'store']);
```

- [ ] **Step 8: Write the failing feature tests**

```php
<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenClientQuoteTest extends TestCase
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

    public function test_creates_a_client_quote_version(): void
    {
        $user = User::factory()->create(['role' => 'seller']);
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $response = $this->postJson("/api/kitchen-projects/{$project->id}/client-quotes", [
            'amount' => 15000,
            'includes' => ['Tablero: Melamina blanca 15mm', 'Herrajes: Soft-close'],
            'notes' => "## Incluye\n\n- Instalación",
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('amount', '15000.00')
            ->assertJsonPath('includes', ['Tablero: Melamina blanca 15mm', 'Herrajes: Soft-close'])
            ->assertJsonPath('user.name', $user->name);
        $this->assertDatabaseCount('kitchen_client_quotes', 1);
    }

    public function test_rejects_a_completely_empty_version(): void
    {
        $user = User::factory()->create(['role' => 'seller']);
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $this->postJson("/api/kitchen-projects/{$project->id}/client-quotes", [])
            ->assertStatus(422);
        $this->assertDatabaseCount('kitchen_client_quotes', 0);
    }

    public function test_every_save_creates_a_new_version_instead_of_editing(): void
    {
        $user = User::factory()->create(['role' => 'seller']);
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $this->postJson("/api/kitchen-projects/{$project->id}/client-quotes", ['amount' => 10000]);
        $this->postJson("/api/kitchen-projects/{$project->id}/client-quotes", ['amount' => 12000]);

        $this->assertDatabaseCount('kitchen_client_quotes', 2);
    }

    public function test_history_is_returned_newest_first_with_user_name(): void
    {
        $user = User::factory()->create(['role' => 'seller', 'name' => 'Rene']);
        Sanctum::actingAs($user);
        $project = $this->createProject($user);

        $this->postJson("/api/kitchen-projects/{$project->id}/client-quotes", ['amount' => 10000]);
        $this->postJson("/api/kitchen-projects/{$project->id}/client-quotes", ['amount' => 12000]);

        $response = $this->getJson("/api/kitchen-projects/{$project->id}/client-quotes");

        $response->assertStatus(200);
        $entries = $response->json();
        $this->assertCount(2, $entries);
        $this->assertSame('12000.00', $entries[0]['amount']);
        $this->assertSame('10000.00', $entries[1]['amount']);
        $this->assertSame('Rene', $entries[0]['user']['name']);
    }

    public function test_a_seller_cannot_see_another_sellers_project_client_quotes(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);
        $otherSeller = User::factory()->create(['role' => 'seller']);
        $project = $this->createProject($owner);

        Sanctum::actingAs($otherSeller);

        $this->getJson("/api/kitchen-projects/{$project->id}/client-quotes")->assertStatus(404);
        $this->postJson("/api/kitchen-projects/{$project->id}/client-quotes", ['amount' => 1000])->assertStatus(404);
    }
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd backend && php artisan test --filter=KitchenClientQuoteTest`
Expected: all 5 tests PASS.

- [ ] **Step 10: Run the full backend test suite to confirm no regressions**

Run: `cd backend && php artisan test`
Expected: all tests PASS (in particular `KitchenProjectShareTest`, `KitchenProjectStatusWorkflowTest`, and any test touching `KitchenProjectController` — the trait extraction must not have changed behavior).

- [ ] **Step 11: Commit**

```bash
cd backend
git add database/migrations/2026_08_24_000100_create_kitchen_client_quotes_table.php app/Models/KitchenClientQuote.php app/Models/KitchenProject.php app/Http/Controllers/Concerns/AssertsKitchenProjectVisibility.php app/Http/Controllers/KitchenClientQuoteController.php app/Http/Controllers/KitchenProjectController.php routes/api.php tests/Feature/KitchenClientQuoteTest.php
git commit -m "feat: add versioned client-facing quote model and CRUD endpoints"
```

---

### Task 2: Backend — include the latest client quote in the public share payload

**Files:**
- Modify: `backend/app/Http/Controllers/PublicKitchenShareController.php`
- Test: `backend/tests/Feature/KitchenProjectShareTest.php` (add new test cases)

**Interfaces:**
- Consumes: `KitchenProject::currentClientQuote()` from Task 1.
- Produces: `GET /public/kitchen-shares/{token}` response gains a `clientQuote` key: `{amount: string|null, includes: string[], notes: string|null} | null`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/Feature/KitchenProjectShareTest.php` (inside the existing `KitchenProjectShareTest` class, anywhere after `test_public_viewer_endpoint_returns_the_thin_project_payload`):

```php
    public function test_public_viewer_endpoint_includes_the_latest_client_quote(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $project->clientQuotes()->create([
            'amount' => 10000,
            'includes' => ['Tablero: Melamina blanca 15mm'],
            'notes' => 'Primera versión',
            'created_at' => now()->subDay(),
        ]);
        $project->clientQuotes()->create([
            'amount' => 12000,
            'includes' => ['Herrajes: Soft-close'],
            'notes' => 'Versión más reciente',
            'created_at' => now(),
        ]);
        $share = $project->shares()->create(['token' => 'client-quote-share-token']);

        $response = $this->getJson('/api/public/kitchen-shares/client-quote-share-token');

        $response->assertStatus(200)
            ->assertJsonPath('clientQuote.amount', '12000.00')
            ->assertJsonPath('clientQuote.includes', ['Herrajes: Soft-close'])
            ->assertJsonPath('clientQuote.notes', 'Versión más reciente');
    }

    public function test_public_viewer_endpoint_returns_null_client_quote_when_none_was_ever_saved(): void
    {
        $user = User::factory()->create();
        $project = $this->createProject($user);
        $share = $project->shares()->create(['token' => 'no-client-quote-token']);

        $response = $this->getJson('/api/public/kitchen-shares/no-client-quote-token');

        $response->assertStatus(200)->assertJsonPath('clientQuote', null);
    }
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && php artisan test --filter=KitchenProjectShareTest`
Expected: FAIL — `clientQuote` key missing from the response.

- [ ] **Step 3: Update the controller**

In `backend/app/Http/Controllers/PublicKitchenShareController.php`, change the eager-load and add the new response key:

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

        $project = $share->kitchenProject()->with(['modules', 'currentClientQuote'])->first();

        if (!$project) {
            abort(404);
        }

        $share->increment('view_count');

        return response()->json([
            'projectName' => $project->project_name,
            'roomWidth' => $project->room_width,
            'roomDepth' => $project->room_depth,
            'ceilingHeight' => $project->ceiling_height,
            'openings' => $project->openings,
            'modules' => $project->modules->map(fn ($module) => [
                'module_type' => $module->module_type,
                'category' => $module->category,
                'label' => $module->label,
                'height' => $module->height,
                'width' => $module->width,
                'depth' => $module->depth,
                'x' => $module->x,
                'z' => $module->z,
                'rotation' => $module->rotation,
                'options' => $module->options,
            ]),
            'clientQuote' => $project->currentClientQuote ? [
                'amount' => $project->currentClientQuote->amount,
                'includes' => $project->currentClientQuote->includes,
                'notes' => $project->currentClientQuote->notes,
            ] : null,
        ]);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && php artisan test --filter=KitchenProjectShareTest`
Expected: all tests PASS, including the two new ones and every pre-existing one (in particular `test_public_viewer_endpoint_returns_the_thin_project_payload`'s `assertSame` on `array_keys($response->json('modules.0'))` is about the `modules.0` sub-array, not the top-level payload, so it's unaffected by adding `clientQuote` at the top level).

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/Http/Controllers/PublicKitchenShareController.php tests/Feature/KitchenProjectShareTest.php
git commit -m "feat: include the latest client quote in the public share payload"
```

---

### Task 3: Frontend — "incluye" suggestion derivation (pure function)

**Files:**
- Create: `frontend/services/clientQuoteSuggestions.ts`
- Test: `frontend/services/clientQuoteSuggestions.test.ts`

**Interfaces:**
- Consumes: `MODULE_CATALOG` (exported from `frontend/services/kitchenData.ts`), `KitchenModule`/`ModuleOptions` types from `frontend/types/kitchen.ts`.
- Produces: `deriveIncludeSuggestions(modules: KitchenModule[]): string[]` — deduplicated, ordered by first occurrence.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { buildNewModule } from "./kitchenData";
import { deriveIncludeSuggestions } from "./clientQuoteSuggestions";

describe("deriveIncludeSuggestions", () => {
  it("suggests a module's configured board material and hardware finish", () => {
    const mod = buildNewModule("gabinete_bajo_puerta_simple", 0, 0, 0);
    mod.options.boardMaterial = "Melamina blanca 15mm";
    mod.options.hardwareFinish = "Cromo";
    const suggestions = deriveIncludeSuggestions([mod]);
    expect(suggestions).toContain("Tablero: Melamina blanca 15mm");
    expect(suggestions).toContain("Herrajes: Cromo");
  });

  it("skips fields the module's catalog entry never lists as configurable", () => {
    // corona_luz's configurableFields is ["height", "width", "mountHeight",
    // "lightMode", "lightStripWidth", "bulbCount", "lightColor",
    // "leftSidePanel", "rightSidePanel", "wallOffset"] — none of the 6
    // material/hardware fields this function looks at.
    const mod = buildNewModule("corona_luz", 0, 0, 0);
    expect(deriveIncludeSuggestions([mod])).toEqual([]);
  });

  it("dedupes identical suggestions across multiple modules", () => {
    const a = buildNewModule("gabinete_bajo_puerta_simple", 0, 0, 0);
    const b = buildNewModule("gabinete_bajo_puertas", 100, 0, 0);
    a.options.boardMaterial = "Melamina blanca 15mm";
    b.options.boardMaterial = "Melamina blanca 15mm";
    const suggestions = deriveIncludeSuggestions([a, b]);
    expect(suggestions.filter((s) => s === "Tablero: Melamina blanca 15mm")).toHaveLength(1);
  });

  it("returns an empty array for an empty module list", () => {
    expect(deriveIncludeSuggestions([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run services/clientQuoteSuggestions.test.ts`
Expected: FAIL — `clientQuoteSuggestions.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
import { MODULE_CATALOG } from "./kitchenData";
import type { KitchenModule, ModuleOptions } from "@/types/kitchen";

const MATERIAL_FIELDS: { key: keyof ModuleOptions; label: string }[] = [
  { key: "boardMaterial", label: "Tablero" },
  { key: "hardwareFinish", label: "Herrajes" },
  { key: "drawerSystem", label: "Corredera" },
  { key: "countertopMaterial", label: "Cubierta" },
  { key: "doorStyle", label: "Puerta" },
  { key: "sinkMaterial", label: "Tarja" },
];

// "Incluye" quick-add suggestions for the client quote modal — derived
// straight from what THIS project's modules are already configured with,
// via each catalog entry's own configurableFields, so a field only counts
// when it's actually relevant to that module type (e.g. doorStyle is
// skipped for a module whose catalog entry never exposes it, not just
// present-with-a-default). No separate suggestion catalog is maintained —
// this is always in sync with the project and needs no upkeep as new
// module types or material options are added.
export function deriveIncludeSuggestions(modules: KitchenModule[]): string[] {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const mod of modules) {
    const entry = MODULE_CATALOG.find((e) => e.type === mod.type);
    if (!entry) continue;
    for (const { key, label } of MATERIAL_FIELDS) {
      if (!entry.configurableFields.includes(key)) continue;
      const value = mod.options[key];
      if (typeof value !== "string" || !value) continue;
      const suggestion = `${label}: ${value}`;
      if (seen.has(suggestion)) continue;
      seen.add(suggestion);
      suggestions.push(suggestion);
    }
  }
  return suggestions;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run services/clientQuoteSuggestions.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Run the full frontend test suite to confirm no regressions**

Run: `cd frontend && npx vitest run`
Expected: all tests PASS (should now show 5 test files, 105 tests).

- [ ] **Step 6: Commit**

```bash
cd frontend
git add services/clientQuoteSuggestions.ts services/clientQuoteSuggestions.test.ts
git commit -m "feat: derive client-quote include suggestions from a project's own modules"
```

---

### Task 4: Frontend — API client, react-markdown dependency, shared markdown renderer

**Files:**
- Modify: `frontend/services/api.ts` (add `ClientQuoteVersion` type + `getClientQuoteHistory`/`createClientQuoteVersion`)
- Modify: `frontend/package.json` (new dependency)
- Create: `frontend/components/shared/QuoteMarkdown.tsx`

**Interfaces:**
- Produces: `getClientQuoteHistory(id: number): Promise<ClientQuoteVersion[]>`, `createClientQuoteVersion(id: number, data: {amount: number|null; includes: string[]; notes: string|null}): Promise<ClientQuoteVersion>`, `ClientQuoteVersion = {id, amount: number|null, includes: string[], notes: string|null, createdAt: string, userName: string}`, and `<QuoteMarkdown>{markdownSource}</QuoteMarkdown>` (renders bold/bullets/one heading level).

- [ ] **Step 1: Install the dependency**

Run: `cd frontend && npm install react-markdown`
Expected: `package.json`/`package-lock.json` updated, install succeeds with no peer-dependency errors (react-markdown supports React 19).

- [ ] **Step 2: Add the API client functions**

In `frontend/services/api.ts`, add this block right after the existing `getKitchenProjectStatusHistory` function (end of the "Status history" section):

```typescript
// ─── Client-facing quote (versioned) ─────────────────────────────────────────
interface BackendClientQuote {
  id: number;
  amount: string | null;
  includes: string[];
  notes: string | null;
  created_at: string;
  user: { id: number; name: string } | null;
}

export interface ClientQuoteVersion {
  id: number;
  amount: number | null;
  includes: string[];
  notes: string | null;
  createdAt: string;
  userName: string;
}

function mapClientQuote(q: BackendClientQuote): ClientQuoteVersion {
  return {
    id: q.id,
    amount: q.amount != null ? Number(q.amount) : null,
    includes: q.includes,
    notes: q.notes,
    createdAt: q.created_at,
    userName: q.user?.name ?? "—",
  };
}

export async function getClientQuoteHistory(id: number): Promise<ClientQuoteVersion[]> {
  const entries = await http.get<BackendClientQuote[]>(`/kitchen-projects/${id}/client-quotes`);
  return entries.map(mapClientQuote);
}

export async function createClientQuoteVersion(
  id: number,
  data: { amount: number | null; includes: string[]; notes: string | null },
): Promise<ClientQuoteVersion> {
  const created = await http.post<BackendClientQuote>(`/kitchen-projects/${id}/client-quotes`, data);
  return mapClientQuote(created);
}
```

- [ ] **Step 3: Write the shared markdown renderer**

```tsx
import ReactMarkdown from "react-markdown";

// Shared between the staff-facing editor's live preview and the public
// client-quote panel, so both render identically. Deliberately unstyled
// beyond these overrides — no tables/links/images support is needed since
// the editor toolbar only ever produces bold, bullet lists, and one
// heading level.
export function QuoteMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm text-ivory/90 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ivory [&_strong]:text-ivory [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-5">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Verify the frontend still typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add package.json package-lock.json services/api.ts components/shared/QuoteMarkdown.tsx
git commit -m "feat: add client-quote API client and shared markdown renderer"
```

---

### Task 5: Frontend — markdown-lite toolbar editor

**Files:**
- Create: `frontend/components/kitchen/MarkdownLiteEditor.tsx`

**Interfaces:**
- Consumes: `QuoteMarkdown` from Task 4 (`@/components/shared/QuoteMarkdown`).
- Produces: `<MarkdownLiteEditor value={string} onChange={(v: string) => void} />`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef } from "react";
import { Bold, List, Heading2 } from "lucide-react";
import { QuoteMarkdown } from "@/components/shared/QuoteMarkdown";

interface MarkdownLiteEditorProps {
  value: string;
  onChange: (value: string) => void;
}

// Wraps the current selection (or inserts at the cursor if nothing is
// selected) with a before/after pair — used for bold. Keeps the selection
// on just the originally-selected text afterward, so hitting the button
// again toggles it back off in the same spot.
function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string, value: string, onChange: (v: string) => void) {
  const { selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart + before.length, selectionStart + before.length + selected.length);
  });
}

// Prefixes the CURRENT LINE (found by walking back to the last newline
// before the cursor) — used for bullets and the heading, since both are
// line-level markdown, not selection-wrapping ones.
function prefixLine(textarea: HTMLTextAreaElement, prefix: string, value: string, onChange: (v: string) => void) {
  const { selectionStart } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length);
  });
}

export function MarkdownLiteEditor({ value, onChange }: MarkdownLiteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyBold = () => textareaRef.current && wrapSelection(textareaRef.current, "**", "**", value, onChange);
  const applyList = () => textareaRef.current && prefixLine(textareaRef.current, "- ", value, onChange);
  const applyHeading = () => textareaRef.current && prefixLine(textareaRef.current, "## ", value, onChange);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <button type="button" onClick={applyBold} title="Negrita" aria-label="Negrita" className="flex h-8 w-8 items-center justify-center rounded-lg text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
          <Bold size={14} />
        </button>
        <button type="button" onClick={applyList} title="Lista" aria-label="Lista" className="flex h-8 w-8 items-center justify-center rounded-lg text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
          <List size={14} />
        </button>
        <button type="button" onClick={applyHeading} title="Título" aria-label="Título" className="flex h-8 w-8 items-center justify-center rounded-lg text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
          <Heading2 size={14} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Incluye: repisas de melamina, herrajes soft-close..."
        className="min-h-32 w-full rounded-xl border border-ivory/10 bg-ivory/5 px-4 py-3 text-sm text-ivory placeholder:text-warmgray/70 focus:border-brass focus:ring-2 focus:ring-brass/30"
      />
      {value.trim() && (
        <div className="rounded-xl border border-ivory/10 bg-ivory/4 px-4 py-3">
          <QuoteMarkdown>{value}</QuoteMarkdown>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the frontend still typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add components/kitchen/MarkdownLiteEditor.tsx
git commit -m "feat: add the markdown-lite toolbar editor for client-quote notes"
```

---

### Task 6: Frontend — the "incluye" chip input, the modal, and the projects-table trigger

**Files:**
- Create: `frontend/components/kitchen/IncludesChipInput.tsx`
- Create: `frontend/components/kitchen/ClientQuoteModal.tsx`
- Modify: `frontend/app/projects/page.tsx` (new button + modal wiring)

**Interfaces:**
- Consumes: `deriveIncludeSuggestions` (Task 3), `getKitchenProject`/`getClientQuoteHistory`/`createClientQuoteVersion`/`ClientQuoteVersion` (Task 4), `MarkdownLiteEditor` (Task 5).
- Produces: `<IncludesChipInput value={string[]} onChange={(v: string[]) => void} suggestions={string[]} />`, `<ClientQuoteModal kitchenProjectId={number} onClose={() => void} />`.

- [ ] **Step 1: Write the chip input component**

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface IncludesChipInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: string[];
}

export function IncludesChipInput({ value, onChange, suggestions }: IncludesChipInputProps) {
  const [text, setText] = useState("");

  const available = suggestions.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(text.toLowerCase()),
  );

  const add = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setText("");
  };

  const remove = (item: string) => onChange(value.filter((v) => v !== item));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full bg-ivory/8 px-2.5 py-1 text-xs text-ivory">
              {item}
              <button type="button" onClick={() => remove(item)} aria-label={`Quitar ${item}`} className="text-warmgray transition-colors hover:text-terracotta">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            }
          }}
          placeholder="Repisas de melamina, herrajes soft-close..."
          className="h-10 w-full rounded-xl border border-ivory/10 bg-ivory/5 px-3 text-sm text-ivory placeholder:text-warmgray/70 focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
        {text && available.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border border-ivory/10 bg-surface-raised shadow-lg">
            {available.slice(0, 8).map((s) => (
              <li key={s}>
                <button type="button" onClick={() => add(s)} className="block w-full px-3 py-2 text-left text-xs text-ivory/80 hover:bg-ivory/8">
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the modal**

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getKitchenProject, getClientQuoteHistory, createClientQuoteVersion, type ClientQuoteVersion } from "@/services/api";
import { deriveIncludeSuggestions } from "@/services/clientQuoteSuggestions";
import { formatDate } from "@/lib/utils";
import { IncludesChipInput } from "./IncludesChipInput";
import { MarkdownLiteEditor } from "./MarkdownLiteEditor";

interface ClientQuoteModalProps {
  kitchenProjectId: number;
  onClose: () => void;
}

const fmtMXN = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export function ClientQuoteModal({ kitchenProjectId, onClose }: ClientQuoteModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ClientQuoteVersion[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [amountText, setAmountText] = useState("");
  const [includes, setIncludes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getKitchenProject(kitchenProjectId), getClientQuoteHistory(kitchenProjectId)])
      .then(([draft, entries]) => {
        if (cancelled) return;
        setSuggestions(deriveIncludeSuggestions(draft.modules));
        setHistory(entries);
        const current = entries[0];
        if (current) {
          setAmountText(current.amount != null ? String(current.amount) : "");
          setIncludes(current.includes);
          setNotes(current.notes ?? "");
        }
      })
      .catch(() => toast.error("No fue posible cargar la cotización del cliente."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kitchenProjectId]);

  const save = async () => {
    const amount = amountText.trim() === "" ? null : Number(amountText);
    if (amount != null && (Number.isNaN(amount) || amount < 0)) {
      toast.error("El monto no es válido.");
      return;
    }
    if (amount == null && includes.length === 0 && !notes.trim()) {
      toast.error("Escribe al menos un monto, un material incluido o una nota.");
      return;
    }
    setSaving(true);
    try {
      const created = await createClientQuoteVersion(kitchenProjectId, { amount, includes, notes: notes.trim() || null });
      setHistory((cur) => [created, ...cur]);
      toast.success("Cotización del cliente guardada.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible guardar la cotización.");
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
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ivory/10 bg-surface-raised shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-ivory/8 px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-ivory">Cotización cliente</h2>
            <p className="mt-0.5 text-xs text-warmgray">Lo que se le dice al cliente — separado del cálculo interno.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loading ? (
            <p className="text-xs text-warmgray">Cargando...</p>
          ) : (
            <>
              {history.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warmgray">Historial</p>
                  <ul className="space-y-1.5">
                    {history.map((v) => (
                      <li key={v.id} className="flex items-center justify-between rounded-lg bg-ivory/4 px-3 py-1.5 text-xs">
                        <span className="text-ivory/80">{fmtMXN(v.amount)}</span>
                        <span className="text-warmgray">{v.userName} · {formatDate(v.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-warmgray">Monto</label>
                <input
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="h-11 w-full rounded-xl border border-ivory/10 bg-ivory/5 px-4 text-sm text-ivory placeholder:text-warmgray/70 focus:border-brass focus:ring-2 focus:ring-brass/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-warmgray">Incluye</label>
                <IncludesChipInput value={includes} onChange={setIncludes} suggestions={suggestions} />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-warmgray">Notas</label>
                <MarkdownLiteEditor value={notes} onChange={setNotes} />
              </div>
            </>
          )}
        </div>

        <div className="border-t border-ivory/8 p-5">
          <Button variant="primary" className="h-10 w-full text-xs" disabled={loading || saving} onClick={save}>
            {saving ? "Guardando..." : "Guardar nueva cotización"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the trigger button into the projects table**

In `frontend/app/projects/page.tsx`:

1. Add to the imports: `Receipt` to the existing `lucide-react` import (making it `import { LayoutGrid, List, History, Receipt, Trash2 } from "lucide-react";`), and a new import `import { ClientQuoteModal } from "@/components/kitchen/ClientQuoteModal";`.

2. Add new state right after `const [historyProject, setHistoryProject] = useState<KitchenProjectRow | null>(null);`:

```typescript
  const [quotingProject, setQuotingProject] = useState<KitchenProjectRow | null>(null);
```

3. In the row actions `<td>` (the one containing the History button, "Abrir →" link, and delete button), add a new button right after the History button — gated the same way the "Cotización" column already is (`role !== "taller"`), since this is a sales-facing feature, not a workshop one:

```tsx
                      {role !== "taller" && (
                        <button
                          type="button"
                          onClick={() => setQuotingProject(p)}
                          aria-label="Cotización cliente"
                          title="Cotización cliente"
                          className="text-zinc-500 transition-colors hover:text-zinc-300"
                        >
                          <Receipt size={14} />
                        </button>
                      )}
```

4. Render the modal at the bottom, alongside the other modals (right after the `{historyProject && (...)}` block, before `<NewProjectModal .../>`):

```tsx
      {quotingProject && (
        <ClientQuoteModal
          kitchenProjectId={quotingProject.id}
          onClose={() => setQuotingProject(null)}
        />
      )}
```

- [ ] **Step 4: Verify the frontend still typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify with the dev server**

Run: `cd frontend && npm run dev` (and the backend: `cd backend && php artisan serve`)

Open `/projects`, click the new receipt icon on any project row, confirm: the modal opens, shows "Cargando..." then the form, the "Incluye" input suggests items derived from that project's actual modules when typed into, typing something not suggested and pressing Enter still adds it as a chip, the notes toolbar buttons (bold/list/heading) insert markdown and the live preview below updates, and clicking "Guardar nueva cotización" with at least one field filled succeeds with a success toast and closes the modal. Reopening the modal shows the just-saved version in "Historial" and pre-fills the form with it.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add components/kitchen/IncludesChipInput.tsx components/kitchen/ClientQuoteModal.tsx app/projects/page.tsx
git commit -m "feat: add the client-quote modal and its trigger in the projects table"
```

---

### Task 7: Frontend — the floating panel on the public viewer

**Files:**
- Modify: `frontend/services/publicApi.ts` (extend types + mapping)
- Create: `frontend/components/kitchen/ClientQuotePanel.tsx`
- Modify: `frontend/app/viewer/[token]/page.tsx` (render the panel)

**Interfaces:**
- Consumes: `QuoteMarkdown` (Task 4).
- Produces: `PublicKitchenView.clientQuote: PublicClientQuote | null`, `PublicClientQuote = {amount: number|null, includes: string[], notes: string|null}`, `<ClientQuotePanel quote={PublicClientQuote | null} />`.

- [ ] **Step 1: Extend `publicApi.ts`**

In `frontend/services/publicApi.ts`, add a raw payload type and the public-facing type, extend the existing interfaces, and map the new field. The full updated file:

```typescript
import type { KitchenModule, ModuleCategory, KitchenModuleType, WallOpening } from "@/types/kitchen";

interface PublicKitchenModule {
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

interface PublicClientQuoteRaw {
  amount: string | null;
  includes: string[];
  notes: string | null;
}

export interface PublicClientQuote {
  amount: number | null;
  includes: string[];
  notes: string | null;
}

interface PublicKitchenSharePayload {
  projectName: string;
  roomWidth: number;
  roomDepth: number;
  ceilingHeight: number;
  openings: WallOpening[] | null;
  modules: PublicKitchenModule[];
  clientQuote: PublicClientQuoteRaw | null;
}

export interface PublicKitchenView {
  projectName: string;
  roomWidth: number;
  roomDepth: number;
  ceilingHeight: number;
  openings: WallOpening[];
  modules: KitchenModule[];
  clientQuote: PublicClientQuote | null;
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
    modules: json.modules.map((m, i) => ({
      id: String(i),
      category: m.category,
      type: m.module_type as KitchenModuleType,
      label: m.label,
      dimensions: { height: m.height, width: m.width, depth: m.depth },
      options: m.options,
      x: m.x,
      z: m.z,
      rotation: (m.rotation as 0 | 90 | 180 | 270) ?? 0,
    })),
    clientQuote: json.clientQuote ? {
      amount: json.clientQuote.amount != null ? Number(json.clientQuote.amount) : null,
      includes: json.clientQuote.includes,
      notes: json.clientQuote.notes,
    } : null,
  };
}
```

- [ ] **Step 2: Write the panel component**

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PublicClientQuote } from "@/services/publicApi";
import { QuoteMarkdown } from "@/components/shared/QuoteMarkdown";

const fmtMXN = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export function ClientQuotePanel({ quote }: { quote: PublicClientQuote | null }) {
  const [expanded, setExpanded] = useState(true);

  if (!quote) return null;
  const hasContent = quote.amount != null || quote.includes.length > 0 || Boolean(quote.notes?.trim());
  if (!hasContent) return null;

  return (
    <div className="absolute bottom-4 right-4 z-10 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ivory/10 bg-surface-raised/95 shadow-2xl backdrop-blur">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-display text-sm font-semibold text-ivory">Cotización</span>
        {expanded ? <ChevronDown size={16} className="text-warmgray" /> : <ChevronUp size={16} className="text-warmgray" />}
      </button>
      {expanded && (
        <div className="max-h-[50vh] space-y-3 overflow-y-auto border-t border-ivory/8 px-4 py-3">
          {quote.amount != null && (
            <p className="text-lg font-semibold text-brass">{fmtMXN(quote.amount)}</p>
          )}
          {quote.includes.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warmgray">Incluye</p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-ivory/80">
                {quote.includes.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {quote.notes && quote.notes.trim() && <QuoteMarkdown>{quote.notes}</QuoteMarkdown>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render the panel on the viewer page**

In `frontend/app/viewer/[token]/page.tsx`, add the import `import { ClientQuotePanel } from "@/components/kitchen/ClientQuotePanel";` and render it inside the existing `relative` wrapper, right after `<KitchenAssemblyScene .../>` closes:

```tsx
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <KitchenAssemblyScene
          readOnly
          modules={view.modules}
          roomWidth={view.roomWidth}
          roomDepth={view.roomDepth}
          ceilingHeight={view.ceilingHeight}
          openings={view.openings}
          cameraPersistKey={token}
        />
        <ClientQuotePanel quote={view.clientQuote} />
      </div>
```

- [ ] **Step 4: Verify the frontend still typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify end-to-end**

With both dev servers running: in `/projects`, save a client quote for a project via the new modal (Task 6), then open that project in the kitchen builder and use the existing "Compartir" button to generate/copy its share link, then open that link in a new tab. Confirm the floating panel appears bottom-right with the amount, the "Incluye" list, and the rendered notes; confirm clicking the header collapses it to just the header bar and clicking again re-expands it. Then, on a DIFFERENT project that has never had a client quote saved, generate and open its share link and confirm no panel appears at all.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add services/publicApi.ts components/kitchen/ClientQuotePanel.tsx app/viewer/[token]/page.tsx
git commit -m "feat: show the client quote as a floating panel on the public viewer"
```

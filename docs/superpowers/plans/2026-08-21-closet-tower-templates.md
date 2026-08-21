# Closet Tower Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A salesperson stars a tower they built, names it, and it becomes a reusable tile in the Torres group for the whole shop.

**Architecture:** A template is a `TowerRecipe` minus its placement, stored server-side in a new `closet_tower_templates` table and served by a small CRUD controller modelled on `FinishController`. The Torres group lists the shop's templates alongside the existing "Torre personalizada" tile; picking one opens the composer pre-filled. Nothing about generation, the recipe shape, or the store's regeneration changes.

**Tech Stack:** Laravel 12 + PHPUnit (SQLite `:memory:`), Next.js 16 App Router, React 19, Zustand 5, Tailwind 4, Vitest (Node environment, framework-free modules only).

**Spec:** `docs/superpowers/specs/2026-08-20-closet-tower-design.md` — §6 *Starred templates* is what this plan implements. §§1–5 shipped on `feat/closet-tower-generator`.

## Global Constraints

- A template stores the recipe **without** `x`, `y`, `z` or `rotation`. Placement belongs to a placed tower, never to a template.
- Section `content` values are exactly `cajones` | `repisas` | `hueco` | `colgar` — lowercase, unaccented, in code. Spanish UI copy keeps its accents.
- Templates are **shop-wide readable**: any admin or vendedor sees every template. Creating and updating sit behind the existing `can:design-projects` gate, so taller has no access at all. Deleting is limited to the template's owner or an admin.
- Vitest stays Node-environment and framework-free. No jsdom, no React Testing Library, no component tests.
- Nothing is renamed. `services/closetTower.ts`'s generation functions are not modified by this plan.
- Backend tests: `php artisan test` from `backend/`. Frontend unit tests: `npm test` from `frontend/`.
- **Verify the typecheck by running `npx tsc --noEmit` and reading its complete raw output.** On the previous branch three real errors sat at HEAD for four tasks while everyone reported "clean". Never filter or summarise that output.

## File Structure

**Created (backend)**
- `database/migrations/2026_08_22_120000_create_closet_tower_templates_table.php`
- `app/Models/ClosetTowerTemplate.php`
- `app/Http/Controllers/ClosetTowerTemplateController.php`
- `tests/Feature/ClosetTowerTemplateTest.php`

**Modified (backend)** — `routes/api.php`

**Created (frontend)**
- `lib/towerTemplate.ts` — the pure recipe↔template conversion, the only unit-tested surface here
- `lib/towerTemplate.test.ts`

**Modified (frontend)** — `services/api.ts` (client + types), `components/kitchen/ModuleInspector.tsx` (the star), `components/kitchen/ModuleSelector.tsx` (the tiles), `components/kitchen/TowerDialog.tsx` (accept a seed recipe; plus the parked edge fix)

Task 1 is an independent bug fix that ships value on its own. Tasks 2–3 build and test the backend, 4–5 the pure conversion and the client, 6–7 the two interface points.

---

### Task 1: Fix the parked edge case — a new tower beside one already at the wall

**Files:**
- Modify: `frontend/components/kitchen/TowerDialog.tsx` (the new-recipe defaults, ~line 139)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Self-contained bug fix.

**Background.** A new tower is placed flush beside the last one at `last.x + last.widthCm`, then clamped inside the room. When the last tower already sits against the room's edge, the clamp pulls the proposal back to exactly `last.x` — the new tower lands coincident with the last one, which breaks `findTowerChain` for both (each section's same-footprint neighbour becomes the duplicate at the same `mountHeight`, failing the touch test) and stacks two maleteros on top of each other. This is the residual of finding I4 from the previous branch's final review, parked at the time.

- [ ] **Step 1: Try the other side before giving up**

Replace the placement expression for a new tower with a helper defined above the component. It tries flush-right, then flush-left, and only falls back to the clamped room centre if neither fits:

```ts
// A new tower goes flush beside the last one so a run merges on the first
// try. If that side is against the wall the clamp would slide it back on
// top of its neighbour — coincident towers break findTowerChain for BOTH,
// so try the other side before settling for the room's centre.
function placeBesideLast(
  last: TowerRecipe | undefined,
  widthCm: number, depthCm: number, rotation: TowerRecipe["rotation"],
  roomWidth: number, roomDepth: number,
): { x: number; z: number } {
  const centre = clampTowerPosition(roomWidth / 2, roomDepth / 2, widthCm, depthCm, rotation, roomWidth, roomDepth);
  if (!last) return centre;

  const alongX = rotation === 0 || rotation === 180;
  const gap = (last.widthCm + widthCm) / 2;
  for (const proposal of [gap, -gap]) {
    const wanted = alongX
      ? { x: last.x + proposal, z: last.z }
      : { x: last.x, z: last.z + proposal };
    const landed = clampTowerPosition(wanted.x, wanted.z, widthCm, depthCm, rotation, roomWidth, roomDepth);
    // The clamp moved it — that side has no room. Coincident is the one
    // outcome worse than the room's centre, so reject and try the other.
    if (Math.abs(landed.x - wanted.x) < 0.01 && Math.abs(landed.z - wanted.z) < 0.01) return landed;
  }
  return centre;
}
```

Note the gap is `(last.widthCm + widthCm) / 2`, not `last.widthCm` — positions are centres, so flush means half of each width apart. The existing code's `last.x + last.widthCm` is only correct when both towers are the same width, which is the common case but not guaranteed once templates can carry a different width.

Then use it:

```ts
    const { x, z } = placeBesideLast(last, widthCm, depthCm, rotation, draft.roomWidth, draft.roomDepth);
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output, exit 0. Read the whole output; do not filter it.

- [ ] **Step 3: Commit**

```bash
git add components/kitchen/TowerDialog.tsx
git commit -m "fix(frontend): place a new tower on the free side when its neighbour is against the wall"
```

---

### Task 2: Backend — the templates table and model

**Files:**
- Create: `backend/database/migrations/2026_08_22_120000_create_closet_tower_templates_table.php`
- Create: `backend/app/Models/ClosetTowerTemplate.php`
- Test: `backend/tests/Feature/ClosetTowerTemplateTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `ClosetTowerTemplate` with `$fillable = ['user_id', 'name', 'recipe']`, `recipe` cast to array and defaulting to `[]`, and a `user()` belongsTo.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/ClosetTowerTemplateTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\ClosetTowerTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClosetTowerTemplateTest extends TestCase
{
    use RefreshDatabase;

    public static function recipe(): array
    {
        return [
            'label' => 'Torre perfumero',
            'widthCm' => 40,
            'depthCm' => 60,
            'totalHeightCm' => 240,
            'sections' => [
                ['id' => 'a', 'content' => 'cajones', 'doors' => 0, 'count' => 4],
                ['id' => 'b', 'content' => 'hueco', 'doors' => 2, 'heightCm' => 25],
                ['id' => 'c', 'content' => 'repisas', 'doors' => 0, 'flex' => true],
            ],
            'maletero' => ['heightCm' => 40, 'doorCount' => 1],
        ];
    }

    public function test_the_recipe_round_trips_through_the_model(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);

        $template = ClosetTowerTemplate::create([
            'user_id' => $owner->id,
            'name' => 'Torre perfumero',
            'recipe' => self::recipe(),
        ]);

        $fresh = $template->fresh();
        $this->assertSame('Torre perfumero', $fresh->recipe['label']);
        $this->assertCount(3, $fresh->recipe['sections']);
        // The three fields the previous branch's backend silently stripped.
        $this->assertSame(4, $fresh->recipe['sections'][0]['count']);
        $this->assertSame(25, $fresh->recipe['sections'][1]['heightCm']);
        $this->assertTrue($fresh->recipe['sections'][2]['flex']);
        $this->assertSame(40, $fresh->recipe['maletero']['heightCm']);
    }

    public function test_recipe_defaults_to_an_empty_array(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);

        $template = ClosetTowerTemplate::create(['user_id' => $owner->id, 'name' => 'Vacía']);

        $this->assertSame([], $template->fresh()->recipe);
    }

    public function test_it_belongs_to_its_owner(): void
    {
        $owner = User::factory()->create(['role' => 'seller', 'name' => 'Vendedora']);

        $template = ClosetTowerTemplate::create([
            'user_id' => $owner->id, 'name' => 'Torre', 'recipe' => self::recipe(),
        ]);

        $this->assertSame('Vendedora', $template->fresh()->user->name);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && php artisan test --filter=ClosetTowerTemplateTest`
Expected: FAIL — the model and table do not exist.

- [ ] **Step 3: Write the migration**

Create `backend/database/migrations/2026_08_22_120000_create_closet_tower_templates_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('closet_tower_templates', function (Blueprint $table) {
            $table->id();
            // The creator. Templates are readable shop-wide — a tower design
            // is shop knowledge — but only the owner or an admin may delete.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            // A TowerRecipe minus its placement: no x/z/rotation. See the
            // closet-tower design spec §6.
            $table->json('recipe');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('closet_tower_templates');
    }
};
```

- [ ] **Step 4: Write the model**

Create `backend/app/Models/ClosetTowerTemplate.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClosetTowerTemplate extends Model
{
    protected $fillable = ['user_id', 'name', 'recipe'];

    // Laravel's castAttribute short-circuits on null before an `array` cast
    // runs, so a null column would read back as null rather than []. The
    // attribute default keeps every read an array — same guard the towers
    // column on kitchen_projects needed.
    protected $attributes = ['recipe' => '[]'];

    protected function casts(): array
    {
        return ['recipe' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && php artisan test --filter=ClosetTowerTemplateTest`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_08_22_120000_create_closet_tower_templates_table.php app/Models/ClosetTowerTemplate.php tests/Feature/ClosetTowerTemplateTest.php
git commit -m "feat(backend): closet tower template model and table"
```

---

### Task 3: Backend — the CRUD endpoints and their gates

**Files:**
- Create: `backend/app/Http/Controllers/ClosetTowerTemplateController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/ClosetTowerTemplateTest.php` (append)

**Interfaces:**
- Consumes: `ClosetTowerTemplate` (Task 2).
- Produces: `GET /api/closet-tower-templates`, `POST /api/closet-tower-templates`, `PUT /api/closet-tower-templates/{closetTowerTemplate}`, `DELETE /api/closet-tower-templates/{closetTowerTemplate}`. Every response carries `id`, `name`, `recipe`, `user_id`, `user: {id, name}` and timestamps.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/Feature/ClosetTowerTemplateTest.php`, inside the class:

```php
    private function payload(array $over = []): array
    {
        return array_merge(['name' => 'Torre perfumero', 'recipe' => self::recipe()], $over);
    }

    public function test_a_seller_creates_a_template_and_it_records_the_owner(): void
    {
        $seller = User::factory()->create(['role' => 'seller']);
        \Laravel\Sanctum\Sanctum::actingAs($seller);

        $response = $this->postJson('/api/closet-tower-templates', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('name', 'Torre perfumero')
            ->assertJsonPath('recipe.sections.0.count', 4);

        $this->assertDatabaseHas('closet_tower_templates', [
            'id' => $response->json('id'), 'user_id' => $seller->id,
        ]);
    }

    public function test_templates_are_visible_shop_wide(): void
    {
        $other = User::factory()->create(['role' => 'seller']);
        ClosetTowerTemplate::create(['user_id' => $other->id, 'name' => 'De otra', 'recipe' => self::recipe()]);

        \Laravel\Sanctum\Sanctum::actingAs(User::factory()->create(['role' => 'seller']));

        $this->getJson('/api/closet-tower-templates')
            ->assertStatus(200)
            ->assertJsonPath('0.name', 'De otra')
            ->assertJsonPath('0.user.name', $other->name);
    }

    public function test_taller_cannot_list_or_create_templates(): void
    {
        \Laravel\Sanctum\Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $this->getJson('/api/closet-tower-templates')->assertStatus(403);
        $this->postJson('/api/closet-tower-templates', $this->payload())->assertStatus(403);
    }

    public function test_a_template_requires_a_name_and_at_least_one_section(): void
    {
        \Laravel\Sanctum\Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $this->postJson('/api/closet-tower-templates', $this->payload(['name' => '']))
            ->assertStatus(422)->assertJsonValidationErrors('name');

        $bad = self::recipe();
        $bad['sections'] = [];
        $this->postJson('/api/closet-tower-templates', $this->payload(['recipe' => $bad]))
            ->assertStatus(422)->assertJsonValidationErrors('recipe.sections');
    }

    public function test_placement_is_rejected_rather_than_silently_stored(): void
    {
        \Laravel\Sanctum\Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $withPlacement = self::recipe();
        $withPlacement['x'] = 100;

        $this->postJson('/api/closet-tower-templates', $this->payload(['recipe' => $withPlacement]))
            ->assertStatus(422)->assertJsonValidationErrors('recipe.x');
    }

    public function test_an_owner_renames_their_template(): void
    {
        $seller = User::factory()->create(['role' => 'seller']);
        \Laravel\Sanctum\Sanctum::actingAs($seller);
        $t = ClosetTowerTemplate::create(['user_id' => $seller->id, 'name' => 'Vieja', 'recipe' => self::recipe()]);

        $this->putJson("/api/closet-tower-templates/{$t->id}", ['name' => 'Nueva'])->assertStatus(200);

        $this->assertSame('Nueva', $t->fresh()->name);
    }

    public function test_only_the_owner_or_an_admin_may_delete(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);
        $t = ClosetTowerTemplate::create(['user_id' => $owner->id, 'name' => 'Torre', 'recipe' => self::recipe()]);

        \Laravel\Sanctum\Sanctum::actingAs(User::factory()->create(['role' => 'seller']));
        $this->deleteJson("/api/closet-tower-templates/{$t->id}")->assertStatus(403);
        $this->assertDatabaseHas('closet_tower_templates', ['id' => $t->id]);

        \Laravel\Sanctum\Sanctum::actingAs($owner);
        $this->deleteJson("/api/closet-tower-templates/{$t->id}")->assertStatus(200);
        $this->assertDatabaseMissing('closet_tower_templates', ['id' => $t->id]);
    }

    public function test_an_admin_deletes_someone_elses_template(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);
        $t = ClosetTowerTemplate::create(['user_id' => $owner->id, 'name' => 'Torre', 'recipe' => self::recipe()]);

        \Laravel\Sanctum\Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->deleteJson("/api/closet-tower-templates/{$t->id}")->assertStatus(200);
        $this->assertDatabaseMissing('closet_tower_templates', ['id' => $t->id]);
    }
```

Add `use Laravel\Sanctum\Sanctum;` to the file's imports and drop the fully-qualified `\Laravel\Sanctum\Sanctum::` prefixes if you prefer — either is fine, just be consistent.

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && php artisan test --filter=ClosetTowerTemplateTest`
Expected: FAIL — the routes 404.

- [ ] **Step 3: Write the controller**

Create `backend/app/Http/Controllers/ClosetTowerTemplateController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\ClosetTowerTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClosetTowerTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            ClosetTowerTemplate::with('user:id,name')->latest()->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());

        $template = ClosetTowerTemplate::create([
            'user_id' => $request->user()->id,
            'name' => $validated['name'],
            'recipe' => $validated['recipe'],
        ]);

        return response()->json($template->load('user:id,name'), 201);
    }

    public function update(Request $request, ClosetTowerTemplate $closetTowerTemplate): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'min:1', 'max:120'],
        ] + $this->recipeRules('sometimes'));

        $closetTowerTemplate->update($validated);

        return response()->json($closetTowerTemplate->fresh()->load('user:id,name'));
    }

    public function destroy(Request $request, ClosetTowerTemplate $closetTowerTemplate): JsonResponse
    {
        $user = $request->user();
        // A template is shop knowledge to read, but removing one is the
        // owner's call — or an admin's, for cleanup.
        abort_if($user->role !== 'admin' && $closetTowerTemplate->user_id !== $user->id, 403);

        $closetTowerTemplate->delete();

        return response()->json(['deleted' => true]);
    }

    private function rules(): array
    {
        return ['name' => ['required', 'string', 'min:1', 'max:120']] + $this->recipeRules('required');
    }

    // Every leaf gets its own rule on purpose. Laravel's validated() returns
    // ONLY explicitly-ruled leaves of a nested array, so a field listed here
    // is a field that survives the save — and one omitted is silently
    // dropped. That exact omission cost the towers column three fields on
    // the previous branch; do not shorten this list.
    private function recipeRules(string $presence): array
    {
        return [
            'recipe' => [$presence, 'array'],
            'recipe.label' => ['required_with:recipe', 'string', 'max:120'],
            'recipe.widthCm' => ['required_with:recipe', 'numeric', 'min:1'],
            'recipe.depthCm' => ['required_with:recipe', 'numeric', 'min:1'],
            'recipe.totalHeightCm' => ['required_with:recipe', 'numeric', 'min:1'],
            'recipe.sections' => ['required_with:recipe', 'array', 'min:1'],
            'recipe.sections.*.id' => ['required', 'string', 'max:60'],
            'recipe.sections.*.content' => ['required', Rule::in(['cajones', 'repisas', 'hueco', 'colgar'])],
            'recipe.sections.*.doors' => ['required', 'integer', 'min:0', 'max:2'],
            'recipe.sections.*.count' => ['nullable', 'integer', 'min:0'],
            'recipe.sections.*.heightCm' => ['nullable', 'numeric', 'min:1'],
            'recipe.sections.*.flex' => ['nullable', 'boolean'],
            'recipe.maletero' => ['nullable', 'array'],
            'recipe.maletero.heightCm' => ['required_with:recipe.maletero', 'numeric', 'min:1'],
            'recipe.maletero.doorCount' => ['required_with:recipe.maletero', 'integer', 'min:1'],
            // Placement belongs to a placed tower, never to a template.
            // Rejecting loudly beats storing a coordinate nobody will use.
            'recipe.x' => ['prohibited'],
            'recipe.z' => ['prohibited'],
            'recipe.rotation' => ['prohibited'],
            'recipe.id' => ['prohibited'],
        ];
    }
}
```

- [ ] **Step 4: Register the routes**

In `backend/routes/api.php`, inside the existing `Route::middleware('can:design-projects')` group if there is one, or otherwise as its own group beside the `can:manage-catalog` group:

```php
    Route::middleware('can:design-projects')->group(function (): void {
        Route::apiResource('closet-tower-templates', ClosetTowerTemplateController::class)->except(['show']);
    });
```

Add the controller's `use` statement at the top of the file, matching how the others are imported.

- [ ] **Step 5: Run the tests**

Run: `cd backend && php artisan test --filter=ClosetTowerTemplateTest`
Expected: PASS, 11 tests.

- [ ] **Step 6: Full suite**

Run: `cd backend && php artisan test`
Expected: PASS. Nothing pre-existing should change.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/ClosetTowerTemplateController.php routes/api.php tests/Feature/ClosetTowerTemplateTest.php
git commit -m "feat(backend): closet tower template CRUD behind the design-projects gate"
```

---

### Task 4: The pure recipe↔template conversion

**Files:**
- Create: `frontend/lib/towerTemplate.ts`, `frontend/lib/towerTemplate.test.ts`

**Interfaces:**
- Consumes: `TowerRecipe`, `TowerSection` from `@/types/closetTower`.
- Produces:
  - `type TowerTemplateRecipe = Omit<TowerRecipe, "id" | "x" | "z" | "rotation">`
  - `recipeToTemplate(recipe: TowerRecipe): TowerTemplateRecipe`
  - `templateToRecipe(template: TowerTemplateRecipe, newId: string, sectionId: (i: number) => string): TowerRecipe`

Both are pure, which is why they live in `lib/` and get tests: `vitest.config.ts` already includes `lib/**/*.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/towerTemplate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recipeToTemplate, templateToRecipe } from "@/lib/towerTemplate";
import type { TowerRecipe } from "@/types/closetTower";

const recipe = (): TowerRecipe => ({
  id: "original-id",
  label: "Torre perfumero",
  widthCm: 40,
  depthCm: 60,
  totalHeightCm: 240,
  sections: [
    { id: "a", content: "cajones", doors: 0, count: 4 },
    { id: "b", content: "hueco", doors: 2, heightCm: 25 },
    { id: "c", content: "repisas", doors: 0, flex: true },
  ],
  maletero: { heightCm: 40, doorCount: 1 },
  x: 120,
  z: 30,
  rotation: 90,
});

describe("recipeToTemplate", () => {
  it("drops the identity and the placement", () => {
    const t = recipeToTemplate(recipe()) as Record<string, unknown>;
    expect(t.id).toBeUndefined();
    expect(t.x).toBeUndefined();
    expect(t.z).toBeUndefined();
    expect(t.rotation).toBeUndefined();
  });

  it("keeps everything that describes the furniture", () => {
    const t = recipeToTemplate(recipe());
    expect(t.label).toBe("Torre perfumero");
    expect(t.widthCm).toBe(40);
    expect(t.depthCm).toBe(60);
    expect(t.totalHeightCm).toBe(240);
    expect(t.maletero).toEqual({ heightCm: 40, doorCount: 1 });
    expect(t.sections).toHaveLength(3);
    // The three optional fields a save has silently dropped before.
    expect(t.sections[0].count).toBe(4);
    expect(t.sections[1].heightCm).toBe(25);
    expect(t.sections[2].flex).toBe(true);
  });

  it("does not alias the original's sections", () => {
    const original = recipe();
    const t = recipeToTemplate(original);
    t.sections[0].count = 99;
    expect(original.sections[0].count).toBe(4);
  });
});

describe("templateToRecipe", () => {
  it("gives the recipe a fresh identity and fresh section ids", () => {
    const t = recipeToTemplate(recipe());
    const r = templateToRecipe(t, "new-id", (i) => `s${i}`);
    expect(r.id).toBe("new-id");
    expect(r.sections.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
  });

  it("starts unplaced at the origin, for the caller to position", () => {
    const r = templateToRecipe(recipeToTemplate(recipe()), "new-id", (i) => `s${i}`);
    expect(r.x).toBe(0);
    expect(r.z).toBe(0);
    expect(r.rotation).toBe(0);
  });

  it("round-trips the furniture unchanged", () => {
    const original = recipe();
    const r = templateToRecipe(recipeToTemplate(original), "new-id", (i) => `s${i}`);
    expect(r.label).toBe(original.label);
    expect(r.widthCm).toBe(original.widthCm);
    expect(r.totalHeightCm).toBe(original.totalHeightCm);
    expect(r.maletero).toEqual(original.maletero);
    expect(r.sections.map((s) => s.content)).toEqual(["cajones", "hueco", "repisas"]);
    expect(r.sections[0].count).toBe(4);
    expect(r.sections[1].heightCm).toBe(25);
    expect(r.sections[2].flex).toBe(true);
  });

  it("does not alias the template, so applying one twice yields independent recipes", () => {
    const t = recipeToTemplate(recipe());
    const first = templateToRecipe(t, "one", (i) => `a${i}`);
    const second = templateToRecipe(t, "two", (i) => `b${i}`);
    first.sections[0].count = 99;
    expect(second.sections[0].count).toBe(4);
    expect(t.sections[0].count).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `lib/towerTemplate.ts` does not exist. The 35 existing tests must still pass.

- [ ] **Step 3: Implement the conversion**

Create `frontend/lib/towerTemplate.ts`:

```ts
import type { TowerRecipe, TowerSection } from "@/types/closetTower";

// A template is a tower's shape without its identity or its place in a
// room. Two towers built from one template are different towers; only the
// furniture is shared. See the closet-tower design spec §6.
export type TowerTemplateRecipe = Omit<TowerRecipe, "id" | "x" | "z" | "rotation">;

export function recipeToTemplate(recipe: TowerRecipe): TowerTemplateRecipe {
  return {
    label: recipe.label,
    widthCm: recipe.widthCm,
    depthCm: recipe.depthCm,
    totalHeightCm: recipe.totalHeightCm,
    // Cloned, not aliased: a template outlives the tower it was starred
    // from, and editing that tower afterwards must not rewrite the template.
    sections: recipe.sections.map((s) => ({ ...s })),
    maletero: recipe.maletero ? { ...recipe.maletero } : null,
  };
}

export function templateToRecipe(
  template: TowerTemplateRecipe,
  newId: string,
  sectionId: (index: number) => string,
): TowerRecipe {
  return {
    id: newId,
    label: template.label,
    widthCm: template.widthCm,
    depthCm: template.depthCm,
    totalHeightCm: template.totalHeightCm,
    // Fresh ids per section: generated module ids are derived from
    // `${recipe.id}__${section.id}`, so two towers from one template would
    // otherwise collide on every module id.
    sections: template.sections.map((s: TowerSection, i) => ({ ...s, id: sectionId(i) })),
    maletero: template.maletero ? { ...template.maletero } : null,
    // Unplaced. The caller positions it — the dialog does this so a template
    // lands beside the last tower exactly like a hand-built one.
    x: 0,
    z: 0,
    rotation: 0,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npm test`
Expected: PASS, 43 tests (35 existing + 8 new).

- [ ] **Step 5: Typecheck and commit**

Run: `cd frontend && npx tsc --noEmit` — read the complete output, expect none.

```bash
git add lib/towerTemplate.ts lib/towerTemplate.test.ts
git commit -m "feat(frontend): pure recipe/template conversion"
```

---

### Task 5: The API client

**Files:**
- Modify: `frontend/services/api.ts`

**Interfaces:**
- Consumes: `TowerTemplateRecipe` (Task 4); the endpoints from Task 3.
- Produces:
  - `interface TowerTemplate { id: number; name: string; recipe: TowerTemplateRecipe; ownerId: number; ownerName: string; }`
  - `listTowerTemplates(): Promise<TowerTemplate[]>`
  - `createTowerTemplate(name: string, recipe: TowerTemplateRecipe): Promise<TowerTemplate>`
  - `deleteTowerTemplate(id: number): Promise<void>`

- [ ] **Step 1: Add the types and functions**

In `frontend/services/api.ts`, following the shape of the existing `Finish` block (a `Backend*` interface, a `map*` function, then the calls):

```ts
interface BackendTowerTemplate {
  id: number;
  name: string;
  recipe: TowerTemplateRecipe;
  user_id: number;
  user?: { id: number; name: string } | null;
}

export interface TowerTemplate {
  id: number;
  name: string;
  recipe: TowerTemplateRecipe;
  ownerId: number;
  ownerName: string;
}

function mapTowerTemplate(t: BackendTowerTemplate): TowerTemplate {
  return {
    id: t.id,
    name: t.name,
    recipe: t.recipe,
    ownerId: t.user_id,
    ownerName: t.user?.name ?? "—",
  };
}

export async function listTowerTemplates(): Promise<TowerTemplate[]> {
  const rows = await http.get<BackendTowerTemplate[]>("/closet-tower-templates");
  return rows.map(mapTowerTemplate);
}

export async function createTowerTemplate(name: string, recipe: TowerTemplateRecipe): Promise<TowerTemplate> {
  const created = await http.post<BackendTowerTemplate>("/closet-tower-templates", { name, recipe });
  return mapTowerTemplate(created);
}

export async function deleteTowerTemplate(id: number): Promise<void> {
  await http.delete(`/closet-tower-templates/${id}`);
}
```

Import `TowerTemplateRecipe` as a type from `@/lib/towerTemplate`. If `http` has no `delete` helper, use whatever verb helper the file already exposes for deletions — check how `deleteKitchenProject` or the finishes destroy call does it and match that exactly rather than inventing one.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output. Read the whole thing.

- [ ] **Step 3: Commit**

```bash
git add services/api.ts
git commit -m "feat(frontend): tower template API client"
```

---

### Task 6: The star — saving a placed tower as a template

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx` (the `GeneratedTowerPanel` component, ~line 140, and its call site ~line 469)

**Interfaces:**
- Consumes: `recipeToTemplate` (Task 4), `createTowerTemplate` (Task 5).
- Produces: nothing further.

**Background.** Selecting a module generated by a tower shows `GeneratedTowerPanel` instead of the normal inspector fields. It currently offers **Editar torre** and **Quitar torre**, and withholds editing for a maletero shared across several towers (`isSharedMaletero`). The star belongs here: this is the one screen that knows which tower you are looking at.

- [ ] **Step 1: Add the save affordance**

In `GeneratedTowerPanel`, add a third action below the existing two: a **⭐ Guardar como plantilla** button, enabled under exactly the same condition as Editar (`recipe !== null && !isSharedMaletero` — a shared maletero has no single recipe to save, and a missing recipe has nothing to save).

Clicking it reveals an inline name field pre-filled with `recipe.label`, plus Guardar and Cancelar. On Guardar:

```tsx
await createTowerTemplate(name.trim(), recipeToTemplate(recipe));
```

then collapse the field and `toast.success("Plantilla guardada")`. Disable Guardar while the name is empty or over 120 characters — the backend rule is `min:1|max:120` and a rejected save should never be reachable. On a rejected promise, `toast.error` with the error's message and keep the field open so the seller does not lose what they typed.

Follow the panel's existing button styling and Spanish copy conventions. `toast` comes from `sonner`, already used across this file.

The state and the save path, which are the load-bearing parts — the markup follows the panel's existing buttons:

```tsx
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = recipe !== null && !isSharedMaletero;
  const nameOk = name.trim().length > 0 && name.trim().length <= 120;

  const startNaming = () => {
    if (!recipe) return;
    setName(recipe.label);
    setNaming(true);
  };

  const save = async () => {
    if (!recipe || !nameOk) return;
    setSaving(true);
    try {
      await createTowerTemplate(name.trim(), recipeToTemplate(recipe));
      setNaming(false);
      toast.success("Plantilla guardada");
    } catch (error) {
      // Keep the field open — the seller should not have to retype a name
      // because the network blinked.
      toast.error(error instanceof Error ? error.message : "No fue posible guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/kitchen/ModuleInspector.tsx
git commit -m "feat(frontend): star a tower to save it as a shop template"
```

---

### Task 7: Template tiles in the Torres group

**Files:**
- Modify: `frontend/components/kitchen/ModuleSelector.tsx` (the `TORRES_GROUP_ID` branch, ~line 137), `frontend/components/kitchen/TowerDialog.tsx` (accept a seed recipe)

**Interfaces:**
- Consumes: `listTowerTemplates`, `deleteTowerTemplate` (Task 5), `templateToRecipe` (Task 4), `placeBesideLast` (Task 1).
- Produces: nothing further.

- [ ] **Step 1: Let the dialog open from a seed**

`TowerDialog`'s props are `{ open, recipe, onClose }`, where `recipe: TowerRecipe | null` and `null` means "new tower". A template is a third case: a new tower whose starting shape comes from somewhere other than the last tower placed.

Add an optional `seed?: TowerRecipe | null` prop. When `recipe` is null and `seed` is set, initialise the working draft from `seed` — but **place it with `placeBesideLast` exactly like any other new tower**, so a template lands beside its neighbour and a run merges on the first try. `isEdit` stays `recipe !== null`, so accepting a seeded tower calls `addTower`, not `updateTower`.

- [ ] **Step 2: List the templates in the Torres group**

In `ModuleSelector`, the `group?.id === TORRES_GROUP_ID` branch currently renders one tile. Load templates with `listTowerTemplates()` in an effect when that branch first opens — not on every selector mount — and render, above the existing "Torre personalizada" tile:

- a tile per template showing 🏗️, its `name`, and a small grey line reading `${sections} secciones · ${widthCm}×${totalHeightCm} cm`, plus "con maletero" when it has one;
- a small delete control on each tile, shown only when the signed-in user is the owner or an admin (`useAuthStore` exposes the user; the owner is `template.ownerId`). Confirm before deleting — reuse whatever confirmation pattern the file's neighbours use, or a `window.confirm` if there is none — then `deleteTowerTemplate` and drop it from local state.

Clicking a template tile opens the dialog with `seed={templateToRecipe(template.recipe, crypto.randomUUID(), () => crypto.randomUUID())}`.

While loading show a short "Cargando plantillas…"; on a failed load show the "Torre personalizada" tile anyway with a small "No se pudieron cargar las plantillas" note. A dead network must never block composing a tower by hand.

The loading and seeding wiring, which is the load-bearing part — the tile markup mirrors the group tiles already in this file:

```tsx
  const [templates, setTemplates] = useState<TowerTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [seed, setSeed] = useState<TowerRecipe | null>(null);
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);

  // Loaded when the Torres group is first opened, not on every selector
  // mount — most visits to this panel never reach Torres.
  useEffect(() => {
    if (group?.id !== TORRES_GROUP_ID || templates !== null || templatesFailed) return;
    listTowerTemplates()
      .then(setTemplates)
      .catch(() => setTemplatesFailed(true));
  }, [group?.id, templates, templatesFailed]);

  const applyTemplate = (t: TowerTemplate) => {
    setSeed(templateToRecipe(t.recipe, crypto.randomUUID(), () => crypto.randomUUID()));
    towersAtOpen.current = draft.towers.length;
    setShowTowerDialog(true);
  };

  const canDelete = (t: TowerTemplate) => role === "admin" || t.ownerId === userId;
```

The existing `<TowerDialog>` render in this file gains `seed={seed}`, and its `onClose` must reset `setSeed(null)` so the next "Torre personalizada" click does not reopen the last template.

- [ ] **Step 3: Typecheck and test**

Run: `cd frontend && npx tsc --noEmit` — read the complete output, expect none.
Run: `cd frontend && npm test` — expect 43 still passing.

- [ ] **Step 4: Commit**

```bash
git add components/kitchen/ModuleSelector.tsx components/kitchen/TowerDialog.tsx
git commit -m "feat(frontend): browse and apply saved tower templates"
```

---

## Verification (controller, after Task 7)

Not a task — I run this myself in the browser, as on the previous branch:

1. Build a tower, star it, name it, confirm the toast.
2. Reopen the Torres group: the template is listed with the right section count and dimensions.
3. Apply it in a **different** project: the tower generates identically and lands beside its neighbour, not on top of it.
4. Apply it twice in one project: two independent towers, no module-id collisions, and their maleteros merge into one wide lid.
5. Star a tower with a pinned section height and a non-default drawer count; apply the template; confirm both survived — that is the `count`/`heightCm`/`flex` round trip the previous branch lost.
6. Sign in as taller: the Torres group is unreachable (closet projects are already gated), and the endpoints 403.
7. Delete a template as its owner; confirm another seller cannot delete one they do not own.

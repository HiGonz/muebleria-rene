# Project Type (Cocina / Clóset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project declares itself `cocina` or `closet` at creation, and that choice scopes which modules its catalog offers and which the store will accept.

**Architecture:** One new immutable column on `kitchen_projects`, threaded into `KitchenDraft`. A new framework-free module, `lib/projectCatalog.ts`, owns the selector groups (moved out of `ModuleSelector.tsx`) plus the per-type scoping helpers, so the browsing UI and the store's guard read the same declaration. Nothing is renamed and no view changes.

**Tech Stack:** Laravel 12 + PHPUnit (SQLite `:memory:`), Next.js App Router, Zustand with `persist`, Tailwind, sonner for toasts.

**Spec:** `docs/superpowers/specs/2026-08-20-project-type-cocina-closet-design.md`

## Global Constraints

- Enum values are exactly `cocina` and `closet` — lowercase, unaccented — in the database, the API payloads and the TypeScript union. User-facing copy uses "Cocina" and "Clóset" (accented).
- The type is immutable after creation: `store` accepts it, and no update path ever writes it.
- Nothing is renamed. `kitchen_projects`, `KitchenProject`, `KitchenProjectController`, `useKitchenStore`, `KitchenDraft` and the `/kitchen` route all keep their names and serve both types.
- Existing rows default to `cocina` and keep every module they already hold. Stored modules are never retro-validated.
- **The frontend has no unit-test runner** — only Playwright e2e (`npm run test:e2e`). Do not add one. Frontend tasks verify with `npx tsc --noEmit` plus the manual check written into each task.
- Backend tests run with `php artisan test` from `backend/`.

---

### Task 1: Backend — `project_type` column, validated on create, immutable on update

**Files:**
- Create: `backend/database/migrations/2026_08_20_120000_add_project_type_to_kitchen_projects.php`
- Modify: `backend/app/Models/KitchenProject.php` (the `$fillable` array)
- Modify: `backend/app/Http/Controllers/KitchenProjectController.php` (the `store` validate block at ~line 49 and the create array at ~line 82)
- Test: `backend/tests/Feature/KitchenProjectTypeTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `kitchen_projects.project_type` (string, `cocina`|`closet`), present on every `index` and `show` JSON response because the controller returns the model directly with no `$hidden` list. `POST /api/kitchen-projects` requires `project_type`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/KitchenProjectTypeTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenProjectTypeTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'project_name'   => 'Clóset recámara',
            'room_width'     => 400,
            'room_depth'     => 300,
            'ceiling_height' => 240,
            'project_type'   => 'closet',
        ], $overrides);
    }

    public function test_store_persists_the_project_type(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $response = $this->postJson('/api/kitchen-projects', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('project_type', 'closet');

        $this->assertDatabaseHas('kitchen_projects', [
            'id'           => $response->json('id'),
            'project_type' => 'closet',
        ]);
    }

    public function test_store_requires_a_project_type(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $payload = $this->payload();
        unset($payload['project_type']);

        $this->postJson('/api/kitchen-projects', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors('project_type');
    }

    public function test_store_rejects_an_unknown_project_type(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $this->postJson('/api/kitchen-projects', $this->payload(['project_type' => 'recamara']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('project_type');
    }

    public function test_update_cannot_change_the_project_type(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        $project = KitchenProject::create([
            'user_id' => $admin->id, 'project_name' => 'Clóset', 'room_width' => 400,
            'room_depth' => 300, 'ceiling_height' => 240, 'openings' => [],
            'project_type' => 'closet',
        ]);

        $this->putJson("/api/kitchen-projects/{$project->id}", [
            'project_name' => 'Clóset renombrado',
            'project_type' => 'cocina',
        ])->assertStatus(200);

        $this->assertDatabaseHas('kitchen_projects', [
            'id'           => $project->id,
            'project_name' => 'Clóset renombrado',
            'project_type' => 'closet',
        ]);
    }

    public function test_a_row_created_without_a_type_defaults_to_cocina(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $project = KitchenProject::create([
            'user_id' => $admin->id, 'project_name' => 'Proyecto viejo', 'room_width' => 400,
            'room_depth' => 300, 'ceiling_height' => 240, 'openings' => [],
        ]);

        $this->assertSame('cocina', $project->fresh()->project_type);
    }

    public function test_show_exposes_the_project_type(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        $project = KitchenProject::create([
            'user_id' => $admin->id, 'project_name' => 'Clóset', 'room_width' => 400,
            'room_depth' => 300, 'ceiling_height' => 240, 'openings' => [],
            'project_type' => 'closet',
        ]);

        $this->getJson("/api/kitchen-projects/{$project->id}")
            ->assertStatus(200)
            ->assertJsonPath('project_type', 'closet');
    }

    public function test_index_exposes_the_project_type(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        KitchenProject::create([
            'user_id' => $admin->id, 'project_name' => 'Clóset', 'room_width' => 400,
            'room_depth' => 300, 'ceiling_height' => 240, 'openings' => [],
            'project_type' => 'closet',
        ]);

        $this->getJson('/api/kitchen-projects')
            ->assertStatus(200)
            ->assertJsonPath('data.0.project_type', 'closet');
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && php artisan test --filter=KitchenProjectTypeTest`
Expected: FAIL — the column does not exist, so `project_type` is not mass-assignable and the assertions on it error out.

- [ ] **Step 3: Write the migration**

Create `backend/database/migrations/2026_08_20_120000_add_project_type_to_kitchen_projects.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kitchen_projects', function (Blueprint $table) {
            // Every existing row is a kitchen — the default covers the whole
            // backfill, so no data migration is needed. Immutable once set:
            // the type decides which catalog a project's modules came from.
            $table->enum('project_type', ['cocina', 'closet'])
                ->default('cocina')
                ->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('kitchen_projects', function (Blueprint $table) {
            $table->dropColumn('project_type');
        });
    }
};
```

- [ ] **Step 4: Add the column to the model**

In `backend/app/Models/KitchenProject.php`, add `'project_type',` to `$fillable`, right after `'notes',`:

```php
    protected $fillable = [
        'user_id',
        'client_name',
        'client_phone',
        'project_name',
        'notes',
        'project_type',
        'room_width',
        'room_depth',
        'ceiling_height',
        'openings',
        'status',
        'autosave_enabled',
    ];
```

No cast — the column enum plus the request validation already constrain it.

- [ ] **Step 5: Validate and persist it in `store`**

In `KitchenProjectController::store`, add to the `$request->validate([...])` array, right after the `'notes'` rule:

```php
            'project_type'   => ['required', Rule::in(['cocina', 'closet'])],
```

and to the `KitchenProject::create([...])` array, right after `'notes'`:

```php
                'project_type'     => $validated['project_type'],
```

Do **not** touch `update`. Immutability is automatic: `project_type` is absent from both of `update`'s validate arrays, so a payload carrying it has the field dropped. `Rule` is already imported in this controller.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && php artisan test --filter=KitchenProjectTypeTest`
Expected: PASS, 7 tests.

- [ ] **Step 7: Run the whole backend suite for regressions**

Run: `cd backend && php artisan test`
Expected: PASS. The role-access, status-workflow, share and autosave suites all create projects through the model (not the endpoint), so the column default covers them.

- [ ] **Step 8: Commit**

```bash
git add app/Models/KitchenProject.php app/Http/Controllers/KitchenProjectController.php database/migrations/2026_08_20_120000_add_project_type_to_kitchen_projects.php tests/Feature/KitchenProjectTypeTest.php
git commit -m "feat(backend): immutable project_type (cocina/closet) on kitchen projects"
```

---

### Task 2: Frontend — `projectType` through the types and the API layer

**Files:**
- Modify: `frontend/types/kitchen.ts` (new `ProjectType` union; `KitchenDraft`)
- Modify: `frontend/services/api.ts` (`BackendKitchenProject`, `mapKitchenResponseToDraft`, `saveKitchenProject`, `KitchenProjectListItem`, `listKitchenProjects`)
- Modify: `frontend/services/kitchenData.ts` (the three sample-kitchen builders at ~lines 1442, 1483, 1557)

**Interfaces:**
- Consumes: `kitchen_projects.project_type` from Task 1.
- Produces:
  - `type ProjectType = "cocina" | "closet"` exported from `@/types/kitchen`
  - `KitchenDraft.projectType: ProjectType`
  - `KitchenProjectListItem.projectType: ProjectType`

- [ ] **Step 1: Add the union and the draft field**

In `frontend/types/kitchen.ts`, above the `KitchenDraft` interface:

```ts
// ─── Project Type ─────────────────────────────────────────────────────────────
// What kind of furniture this project holds. Chosen at creation and never
// changed afterwards — it decides which catalog the project's modules came
// from, so flipping it would strand pieces its own catalog disallows.
// Lives here (not in lib/projectCatalog.ts) so the types module stays the
// bottom of the import graph.
export type ProjectType = "cocina" | "closet";
```

and inside `KitchenDraft`, right after `notes: string;`:

```ts
  // See ProjectType — fixed at creation, never sent on an update.
  projectType: ProjectType;
```

- [ ] **Step 2: Read it off the backend response**

In `frontend/services/api.ts`, add to `interface BackendKitchenProject`, after `notes: string | null;`:

```ts
  project_type: ProjectType;
```

and in `mapKitchenResponseToDraft`, after `notes: json.notes ?? "",`:

```ts
    projectType: json.project_type ?? "cocina",
```

The `?? "cocina"` is not dead code — a share/viewer payload built before this column existed can still be replayed from a cached response.

Add `ProjectType` to the existing `import type { ... } from "@/types/kitchen"` at the top of the file.

- [ ] **Step 3: Send it on create only**

In `saveKitchenProject`, change the create branch so the type rides the POST and never the PUT:

```ts
export async function saveKitchenProject(draft: KitchenDraft, projectId: number | null): Promise<number> {
  const payload = mapKitchenPayload(draft);
  if (projectId === null) {
    // project_type is create-only: update() drops it, and including it in a
    // PUT would also count as an "other field" against the taller's
    // status-only guard in KitchenProjectController::update.
    const created = await http.post<BackendKitchenProject>("/kitchen-projects", { ...payload, project_type: draft.projectType });
    return created.id;
  }
  const { modules, ...meta } = payload;
  await http.put(`/kitchen-projects/${projectId}`, meta);
  await http.post(`/kitchen-projects/${projectId}/modules/sync`, { modules });
  return projectId;
}
```

Leave `mapKitchenPayload` itself untouched — it feeds both verbs.

- [ ] **Step 4: Default the project name by type**

In `mapKitchenPayload`, replace the `project_name` line so a closet does not get named "Cocina nueva":

```ts
    project_name: draft.projectName.trim() || (draft.projectType === "closet" ? "Clóset nuevo" : "Cocina nueva"),
```

- [ ] **Step 5: Expose it on the list item**

In `frontend/services/api.ts`, add to `interface KitchenProjectListItem`, after `clientPhone: string;`:

```ts
  projectType: ProjectType;
```

and in `listKitchenProjects`'s mapper, after `clientPhone: p.client_phone ?? "",`:

```ts
    projectType: p.project_type ?? "cocina",
```

- [ ] **Step 6: Keep the sample kitchens kitchen-only**

`buildSampleKitchenNormal`, `buildSampleKitchenIsla` and `buildSampleKitchenCorona` in `frontend/services/kitchenData.ts` each return a `KitchenDraft` literal, so each now needs the field. In all three, add it next to `notes:`:

```ts
    projectType: "cocina",
```

That is the whole of the spec's "buildSampleKitchen stays kitchen-only" — the demo drafts are kitchens by construction, and `loadSampleKitchen` in the store replaces the draft wholesale, carrying the type with it.

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: the only remaining error is `initialDraft` in `store/useKitchenStore.ts`, fixed in Task 4. If anything else appears, it is another `KitchenDraft` literal — give it `projectType: "cocina"` too and note it here.

- [ ] **Step 8: Commit**

```bash
git add types/kitchen.ts services/api.ts services/kitchenData.ts
git commit -m "feat(frontend): thread projectType through the draft and API layer"
```

---

### Task 3: Frontend — `lib/projectCatalog.ts`, one declaration for both consumers

**Files:**
- Create: `frontend/lib/projectCatalog.ts`
- Modify: `frontend/components/kitchen/ModuleSelector.tsx` (delete the moved constants, import them instead)

**Interfaces:**
- Consumes: `ProjectType` from Task 2; `MODULE_CATALOG` and `ModuleCatalogEntry` from the existing code.
- Produces:
  - `SelectorGroup` — `{ id, label, icon, projectTypes, match }`
  - `groupsForProjectType(projectType): SelectorGroup[]`
  - `catalogForProjectType(projectType): ModuleCatalogEntry[]`
  - `isModuleTypeAllowedIn(projectType, type): boolean`
  - `CLOSET_ONLY_TYPES: KitchenModuleType[]`

- [ ] **Step 1: Create the module**

Create `frontend/lib/projectCatalog.ts`. The three type lists and `SELECTOR_GROUPS` are moved verbatim out of `ModuleSelector.tsx` (with their comments) and then extended:

```ts
import { MODULE_CATALOG } from "@/services/kitchenData";
import type { KitchenModuleType, ModuleCatalogEntry, ProjectType } from "@/types/kitchen";

// Moved here from ModuleSelector.tsx: the store needs the same declaration
// to decide what a project may hold, and it must not import a component.
const APPLIANCE_ITEM_TYPES: KitchenModuleType[] = [
  "tarja", "parrilla", "estufa", "refrigerador", "microondas", "lavavajillas", "campana_extractora", "campana_extractora_compacta",
];
const OTHER_ACCESSORY_TYPES: KitchenModuleType[] = [
  "herrajes", "panel_lateral", "panel_remate", "panel_decorativo", "organizador_especias", "cubertero", "especiero_aluminio",
];
// Category "upper" but not part of the generic configurable-cabinet catalog
// — each solves something specific that doesn't reduce to "box with doors
// and shelves", so they're parked in their own browsing group.
const UNCATEGORIZED_UPPER_TYPES: KitchenModuleType[] = [
  "campanero", "corona_luz", "gabinete_microondas", "aereo_hueco_inferior", "cava_vinos",
];

// Types a kitchen must stop offering. librero_giratorio_espejo is
// `category: "tower"`, so the kitchen's "Armarios altos" group would sweep
// it up on category alone — it needs subtracting explicitly, the same way
// UNCATEGORIZED_UPPER_TYPES is subtracted from "Armario de pared". Its
// stored category does not change; only which group surfaces it does.
export const CLOSET_ONLY_TYPES: KitchenModuleType[] = ["librero_giratorio_espejo"];

// Types shared by both catalogs, listed here so the closet groups can name
// them without inheriting the kitchen's category-wide matches.
const CLOSET_PANEL_TYPES: KitchenModuleType[] = ["panel_lateral", "panel_remate", "panel_decorativo", "herrajes"];
const CLOSET_LIGHT_MIRROR_TYPES: KitchenModuleType[] = ["librero_giratorio_espejo", "corona_luz"];

export interface SelectorGroup {
  id: string;
  label: string;
  icon: string;
  // Which project types browse this group. A group can belong to both.
  projectTypes: ProjectType[];
  match: (entry: ModuleCatalogEntry) => boolean;
}

export const SELECTOR_GROUPS: SelectorGroup[] = [
  // ── Cocina ────────────────────────────────────────────────────────────────
  { id: "armario_bajo", label: "Armario Bajo", icon: "🗄️", projectTypes: ["cocina"], match: (e) => e.category === "lower" },
  { id: "armario_pared", label: "Armario de pared", icon: "📦", projectTypes: ["cocina"], match: (e) => e.category === "upper" && !UNCATEGORIZED_UPPER_TYPES.includes(e.type) },
  { id: "armario_esquina", label: "Armario de Esquina", icon: "📐", projectTypes: ["cocina"], match: (e) => e.category === "corner" },
  { id: "armarios_altos", label: "Armarios altos", icon: "🏗️", projectTypes: ["cocina"], match: (e) => e.category === "tower" && !CLOSET_ONLY_TYPES.includes(e.type) },
  { id: "electrodomestico", label: "Electrodoméstico", icon: "⚡", projectTypes: ["cocina"], match: (e) => e.category === "appliance" || APPLIANCE_ITEM_TYPES.includes(e.type) },
  { id: "mesas_sillas", label: "Mesas y sillas", icon: "🍽️", projectTypes: ["cocina"], match: () => false },
  { id: "otros", label: "Otros", icon: "🔩", projectTypes: ["cocina"], match: (e) => e.category === "countertop" || OTHER_ACCESSORY_TYPES.includes(e.type) },
  { id: "sin_categoria", label: "Sin categoría", icon: "❔", projectTypes: ["cocina"], match: (e) => UNCATEGORIZED_UPPER_TYPES.includes(e.type) },

  // ── Clóset ────────────────────────────────────────────────────────────────
  { id: "closet_cajoneras", label: "Cajoneras", icon: "🗄️", projectTypes: ["closet"], match: (e) => e.type === "cajonera_closet" },
  { id: "closet_nichos", label: "Nichos y repisas", icon: "🖼️", projectTypes: ["closet"], match: (e) => e.type === "nicho_closet" || e.type === "nicho_doble_puerta_closet" },
  { id: "closet_colgar", label: "Colgar ropa", icon: "👕", projectTypes: ["closet"], match: (e) => e.type === "tubo_ropa_closet" },
  { id: "closet_torres", label: "Torres", icon: "🏗️", projectTypes: ["closet"], match: () => false },
  { id: "closet_paneles", label: "Paneles y remates", icon: "🔩", projectTypes: ["closet"], match: (e) => CLOSET_PANEL_TYPES.includes(e.type) },
  { id: "closet_espejos", label: "Espejos e iluminación", icon: "🪞", projectTypes: ["closet"], match: (e) => CLOSET_LIGHT_MIRROR_TYPES.includes(e.type) },

  // ── Compartido ────────────────────────────────────────────────────────────
  { id: "puertas_ventanas", label: "Puertas y ventanas", icon: "🚪", projectTypes: ["cocina", "closet"], match: (e) => e.category === "opening" },
];

export function groupsForProjectType(projectType: ProjectType): SelectorGroup[] {
  return SELECTOR_GROUPS.filter((g) => g.projectTypes.includes(projectType));
}

export function catalogForProjectType(projectType: ProjectType): ModuleCatalogEntry[] {
  const groups = groupsForProjectType(projectType);
  if (projectType === "cocina") {
    // Deliberately NOT derived from the groups: a kitchen must keep being
    // able to add everything it can add today, and deriving from group
    // matches would silently drop any catalog type no group happens to
    // cover. Subtract exactly what moved out instead.
    return MODULE_CATALOG.filter((e) => e.category !== "closet" && !CLOSET_ONLY_TYPES.includes(e.type));
  }
  return MODULE_CATALOG.filter((e) => groups.some((g) => g.match(e)));
}

export function isModuleTypeAllowedIn(projectType: ProjectType, type: KitchenModuleType): boolean {
  return catalogForProjectType(projectType).some((e) => e.type === type);
}
```

- [ ] **Step 2: Delete the moved constants from the selector**

In `frontend/components/kitchen/ModuleSelector.tsx`, delete `APPLIANCE_ITEM_TYPES`, `OTHER_ACCESSORY_TYPES`, `UNCATEGORIZED_UPPER_TYPES`, the local `interface SelectorGroup` and the local `SELECTOR_GROUPS` array (roughly lines 25–61, including the comment block above `UNCATEGORIZED_UPPER_TYPES`, which moved with them). Replace the `MODULE_CATALOG` import line with:

```ts
import { catalogForProjectType, groupsForProjectType, type SelectorGroup } from "@/lib/projectCatalog";
```

`ModuleChip` at the bottom of the file still types its prop as `typeof MODULE_CATALOG[number]`. Change that annotation to the equivalent named type, which the file already imports:

```tsx
function ModuleChip({ entry, thumb, onAdd }: { entry: ModuleCatalogEntry; thumb?: string; onAdd: () => void }) {
```

Those are the only two references. Expect a temporary compile error inside the component body until Task 5 rewires it; if you prefer a green tree at every step, do Task 5's Step 1 before typechecking.

- [ ] **Step 3: Verify the kitchen catalog did not shrink**

Run: `cd frontend && npx tsc --noEmit`

Then read `catalogForProjectType` once more against the spec: for `cocina` the only things subtracted are `category === "closet"` (4 types) and `librero_giratorio_espejo` (1 type). 73 − 5 = 68 kitchen types. Confirm the count claim by eye against `MODULE_CATALOG`; do not add a script for it.

- [ ] **Step 4: Commit**

```bash
git add lib/projectCatalog.ts components/kitchen/ModuleSelector.tsx
git commit -m "refactor(frontend): move selector groups to lib/projectCatalog with per-type scoping"
```

---

### Task 4: Frontend — store default, typed `resetDraft`, and the real guard

**Files:**
- Modify: `frontend/store/useKitchenStore.ts` (`initialDraft` ~line 78, the `resetDraft` signature ~line 172 and body ~line 277, `addModule` ~line 293, `placeAccessoryInNiche` ~line 320)
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx` (the two `resetDraft()` call sites, lines ~327 and ~424)

**Interfaces:**
- Consumes: `isModuleTypeAllowedIn` from Task 3; `KitchenDraft.projectType` from Task 2.
- Produces: `resetDraft(projectType: ProjectType): void` — the signature every caller must now satisfy.

- [ ] **Step 1: Default the initial draft**

In `initialDraft`, after `notes: "",`:

```ts
  projectType: "cocina",
```

This also covers the `persist` merge at the bottom of the file, which spreads `initialDraft` under the stored draft — anyone with a draft saved before this change is backfilled to `cocina`.

- [ ] **Step 2: Make `resetDraft` take the type**

Change the declaration in the store's interface from `resetDraft: () => void;` to:

```ts
  // The type is chosen before the draft exists (the Nuevo proyecto modal),
  // or carried over from the project being replaced (the builder's "Nuevo"
  // button) — there is no default, because guessing wrong strands modules.
  resetDraft: (projectType: ProjectType) => void;
```

and the implementation:

```ts
      resetDraft: (projectType) =>
        set({ draft: { ...initialDraft, projectType }, projectId: null, showSelector: false, activeTab: "3d", undoStack: [], redoStack: [] }),
```

Add `ProjectType` to the existing `import type { ... } from "@/types/kitchen"` block.

- [ ] **Step 3: Guard `addModule`**

At the very top of the `set` callback in `addModule`:

```ts
      addModule: (type) =>
        set((s) => {
          // The selector already hides what this project can't hold; this is
          // the rule itself, covering a persisted draft, a stale selector, or
          // any future caller that doesn't go through the panel.
          if (!isModuleTypeAllowedIn(s.draft.projectType, type)) {
            toast.error("Ese módulo no pertenece a este tipo de proyecto.");
            return {};
          }
          const entry = buildNewModule(type, 0, 0, 0, s.defaultFloorBoardMaterial ?? undefined, s.defaultWallBoardMaterial ?? undefined);
```

...leaving the rest of the body unchanged. `toast` is already imported in this file.

- [ ] **Step 4: Guard `placeAccessoryInNiche`**

Same check, right after the existing niche lookup:

```ts
      placeAccessoryInNiche: (nicheId, accessoryType) =>
        set((s) => {
          const niche = s.draft.modules.find((m) => m.id === nicheId);
          if (!niche) return {};
          if (!isModuleTypeAllowedIn(s.draft.projectType, accessoryType)) {
            toast.error("Ese accesorio no pertenece a este tipo de proyecto.");
            return {};
          }
```

Add the import at the top of the store:

```ts
import { isModuleTypeAllowedIn } from "@/lib/projectCatalog";
```

**Do not guard `duplicateModule`.** It copies a module that is already in the draft, so its type is allowed by construction — a check there could only ever be dead code. This is a deliberate narrowing of the spec's §6, which named all three.

- [ ] **Step 5: Fix the builder's two callers**

In `frontend/components/kitchen/KitchenBuilder.tsx`, "Nuevo" starts a fresh project of the same kind as the one on screen. Line ~327:

```tsx
            <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => resetDraft(draft.projectType)}>Nuevo</Button>
```

and the mobile menu item at line ~424:

```tsx
                <button role="menuitem" onClick={() => { resetDraft(draft.projectType); setShowMobileMenu(false); }} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-ivory transition-colors hover:bg-ivory/8">
```

`draft` is already destructured from the store at line ~46.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: the only remaining errors are the two `onClick={resetDraft}` call sites in `app/projects/page.tsx` — which is correct and important. Passing the handler bare used to hand `resetDraft` a click event as its argument; with a typed parameter the compiler now catches it. Task 6 replaces both.

- [ ] **Step 7: Commit**

```bash
git add store/useKitchenStore.ts components/kitchen/KitchenBuilder.tsx
git commit -m "feat(frontend): scope the kitchen store's module adds to the project type"
```

---

### Task 5: Frontend — the selector browses only its project's catalog

**Files:**
- Modify: `frontend/components/kitchen/ModuleSelector.tsx` (the component body, ~lines 69–140 and the landing grid below)

**Interfaces:**
- Consumes: `catalogForProjectType`, `groupsForProjectType`, `SelectorGroup` from Task 3; `draft.projectType` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Scope the catalog before grouping or searching**

Inside `ModuleSelector`, replace the `scopedModules`/`filtered` derivation:

```ts
  const searching = search.trim().length > 0;
  const showLanding = !searching && !group;
  // Everything below browses this project's catalog, never the whole one —
  // search included. Searching MODULE_CATALOG directly would let "tarja"
  // surface a kitchen module inside a closet project even with the kitchen
  // groups hidden.
  const catalog = catalogForProjectType(draft.projectType);
  const groups = groupsForProjectType(draft.projectType);
  const scopedModules = group ? catalog.filter(group.match) : catalog;
  const filtered = searching
    ? scopedModules.filter((m) => m.label.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase()))
    : scopedModules;
```

- [ ] **Step 2: Render the project's groups on the landing screen**

In the landing grid, swap both references from the module-level constant to the scoped list:

```tsx
            {groups.map((g) => {
              const count = catalog.filter(g.match).length;
```

- [ ] **Step 3: Verify the empty Torres group — no code change**

The spec asks for a "Próximamente" placeholder instead of an empty grid. **This already exists.** The grid renders:

```tsx
            {filtered.length === 0 && (
              <p className="col-span-2 py-8 text-center text-sm text-warmgray">
                {group && scopedModules.length === 0 ? "Próximamente" : "No se encontraron módulos"}
              </p>
            )}
```

`closet_torres` matches nothing, so `scopedModules` is empty and the existing branch says "Próximamente" on its own. Write no new markup. Just confirm by opening the group once Task 6 lets you create a closet project.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors from this file.

- [ ] **Step 5: Manual check**

Run: `cd frontend && npm run dev`, then with a kitchen project open, click **+ Añadir Módulo**:
- 8 groups, no "Closets", and **Armarios altos** no longer lists *Librero giratorio con espejo*.
- Searching "espejo" returns nothing.

Leave the closet half of this check for Task 6, which is what first lets you create one.

- [ ] **Step 6: Commit**

```bash
git add components/kitchen/ModuleSelector.tsx
git commit -m "feat(frontend): scope the module selector to the project type"
```

---

### Task 6: Frontend — the Nuevo proyecto modal

**Files:**
- Create: `frontend/components/projects/NewProjectModal.tsx`
- Modify: `frontend/app/projects/page.tsx` (both `+ Nuevo proyecto` call sites, lines ~77 and ~90)

**Interfaces:**
- Consumes: `resetDraft(projectType)` from Task 4.
- Produces: `<NewProjectModal open onClose />` — on pick it resets the draft with the chosen type and routes to `/kitchen`.

- [ ] **Step 1: Create the modal**

Create `frontend/components/projects/NewProjectModal.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useKitchenStore } from "@/store/useKitchenStore";
import type { ProjectType } from "@/types/kitchen";

const OPTIONS: { type: ProjectType; icon: string; label: string; blurb: string }[] = [
  { type: "cocina", icon: "🍳", label: "Cocina", blurb: "Módulos de cocina, cubiertas, electrodomésticos" },
  { type: "closet", icon: "👕", label: "Clóset", blurb: "Cajoneras, nichos, colgar ropa, paneles" },
];

// The type can't be changed later (see the design spec), so this is the one
// moment it's decided. A modal rather than a route: the seller stays on the
// list, and cancelling costs nothing.
export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const resetDraft = useKitchenStore((s) => s.resetDraft);

  if (!open) return null;

  const pick = (type: ProjectType) => {
    resetDraft(type);
    router.replace("/kitchen");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo proyecto"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white">¿Qué vas a diseñar?</h2>
        <p className="mt-1 text-sm text-zinc-400">Esto define qué muebles vas a poder agregar. No se puede cambiar después.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <button
              key={o.type}
              type="button"
              onClick={() => pick(o.type)}
              className="flex flex-col items-start gap-2 rounded-xl border border-white/10 bg-white/4 p-5 text-left transition-colors hover:border-white/25 hover:bg-white/8"
            >
              <span className="text-4xl">{o.icon}</span>
              <span className="text-base font-semibold text-white">{o.label}</span>
              <span className="text-xs leading-relaxed text-zinc-400">{o.blurb}</span>
            </button>
          ))}
        </div>

        <button type="button" onClick={onClose} className="mt-5 text-xs text-zinc-500 transition-colors hover:text-zinc-300">
          Cancelar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire both call sites**

In `frontend/app/projects/page.tsx`, add the state and the import:

```tsx
import { NewProjectModal } from "@/components/projects/NewProjectModal";
```

```tsx
  const [creating, setCreating] = useState(false);
```

Replace the header link (line ~77):

```tsx
          <Button variant="primary" onClick={() => setCreating(true)}>+ Nuevo proyecto</Button>
```

and the empty-state link (line ~90):

```tsx
          <Button variant="primary" onClick={() => setCreating(true)}>Diseñar primer proyecto</Button>
```

Render the modal once, just before `</AppShell>`:

```tsx
      <NewProjectModal open={creating} onClose={() => setCreating(false)} />
```

The `resetDraft` selector and the `Link` import are now unused in this file if nothing else uses them — remove whichever the compiler flags.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean. The two bad `onClick={resetDraft}` sites from Task 4's Step 6 are gone.

- [ ] **Step 4: Manual check**

With `npm run dev`: **+ Nuevo proyecto** → **Clóset** → the builder opens empty → **+ Añadir Módulo** shows exactly 7 groups (Cajoneras, Nichos y repisas, Colgar ropa, Torres, Paneles y remates, Espejos e iluminación, Puertas y ventanas), Torres shows "Próximamente", and searching "tarja" returns nothing. Save it, and confirm it lands in `/projects`.

- [ ] **Step 5: Commit**

```bash
git add components/projects/NewProjectModal.tsx app/projects/page.tsx
git commit -m "feat(frontend): pick cocina or closet when creating a project"
```

---

### Task 7: Frontend — type badge and filter on the projects list

**Files:**
- Modify: `frontend/app/projects/page.tsx` (filter state, the filter control, the table row)
- Modify: `frontend/components/projects/KanbanCard.tsx` (the badge)
- Create: `frontend/lib/projectTypeLabels.ts`

**Interfaces:**
- Consumes: `KitchenProjectListItem.projectType` from Task 2.
- Produces: `PROJECT_TYPE_LABELS: Record<ProjectType, { icon: string; label: string }>`

- [ ] **Step 1: Create the label map**

Create `frontend/lib/projectTypeLabels.ts` so the table and the Kanban card can't drift:

```ts
import type { ProjectType } from "@/types/kitchen";

export const PROJECT_TYPE_LABELS: Record<ProjectType, { icon: string; label: string }> = {
  cocina: { icon: "🍳", label: "Cocina" },
  closet: { icon: "👕", label: "Clóset" },
};
```

- [ ] **Step 2: Add the filter**

In `frontend/app/projects/page.tsx`:

```tsx
  const [typeFilter, setTypeFilter] = useState<ProjectType | "todos">("todos");
```

```tsx
  const visibleProjects = projects?.filter((p) => typeFilter === "todos" || p.projectType === typeFilter) ?? null;
```

Render the control next to the Tabla/Kanban toggle, matching its styling:

```tsx
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
            {(["todos", "cocina", "closet"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${typeFilter === t ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                {t === "todos" ? "Todos" : t === "cocina" ? "Cocinas" : "Clósets"}
              </button>
            ))}
          </div>
```

Then swap `projects` for `visibleProjects` everywhere the list is *rendered* — the table body, the `KanbanBoard` `projects` prop, and the count line. Leave `projects` itself as the source of truth for `changeStatus`'s optimistic update, which patches by id.

Import `ProjectType` from `@/types/kitchen`.

- [ ] **Step 3: Add the badge to the table row**

In the row, beside the status chip:

```tsx
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-zinc-300">
                      {PROJECT_TYPE_LABELS[p.projectType].icon} {PROJECT_TYPE_LABELS[p.projectType].label}
                    </span>
```

- [ ] **Step 4: Add the badge to the Kanban card**

In `frontend/components/projects/KanbanCard.tsx`, import the map and render the same span next to the project name.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual check**

With a kitchen project and a closet project saved: both rows show their badge, **Cocinas** hides the closet, **Clósets** hides the kitchen, **Todos** shows both, and the Kanban cards carry the same badge.

- [ ] **Step 7: Run the e2e suite**

Run: `cd frontend && npm run test:e2e`
Expected: PASS. `kitchen-flow.spec.ts` navigates straight to `/kitchen` without going through the modal, and `initialDraft.projectType` is `cocina`, so its module add still resolves against the kitchen catalog.

- [ ] **Step 8: Commit**

```bash
git add lib/projectTypeLabels.ts app/projects/page.tsx components/projects/KanbanCard.tsx
git commit -m "feat(frontend): project type badge and filter on the projects list"
```

---

## Deviations from the spec

Two, both deliberate, both explained at the point of change:

1. **`duplicateModule` is not guarded** (Task 4, Step 4). The spec's §6 named it alongside `addModule` and `placeAccessoryInNiche`, but it copies a module already present in the draft, so the check could only ever be dead code.
2. **The `cocina` allowed-set is not derived from its groups** (Task 3, Step 1). The spec calls the group declaration the single source of truth. For closets it is. For kitchens the allowed set subtracts exactly what moved out (`category === "closet"` plus `CLOSET_ONLY_TYPES`) rather than intersecting with group matches, so that any catalog type no group happens to cover keeps working exactly as it does today.

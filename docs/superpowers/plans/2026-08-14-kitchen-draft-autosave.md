# Kitchen Draft Projects + Autosave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a kitchen project be saved without a client (shown as a "Borrador" everywhere), autosave changes to the backend on a debounce+max-wait timer, and make the autosave on/off state itself part of the saved project.

**Architecture:** Backend: one additive migration makes `kitchen_projects.client_name` nullable and adds `autosave_enabled` (boolean, default true); controller validation and the model's `$fillable`/`$casts` follow. Frontend: delete the `"Cliente por asignar"` placeholder-string hack in `services/api.ts` in favor of a real `null` client name; add a pure, framework-agnostic debounce-with-maxWait scheduler (`services/autosaveScheduler.ts`) driving a new `useKitchenAutosave` hook that calls the exact same `saveKitchenProject()` the manual Guardar button already uses; wire a status label, an autosave toggle, a one-time notice banner, and a list-page "Borrador" badge into the existing kitchen UI.

**Tech Stack:** Laravel 11 + Sanctum (backend), Next.js 16 App Router + Zustand + TypeScript (frontend), PHPUnit (`php artisan test`), `npx tsc --noEmit` for frontend type-checking (no frontend unit-test runner is installed in this repo — see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-08-14-kitchen-draft-autosave-design.md`

## Global Constraints

- Never edit the original migration (`2026_06_03_000100_create_kitchen_tables.php`) — this plan's schema change is a new, additive migration file only.
- No `clients` table / real client entity — out of scope.
- Autosave reuses the existing destructive `POST /kitchen-projects/{id}/modules/sync` (replace-all) endpoint — no incremental/diffed module sync.
- No cross-tab conflict resolution — last-write-wins, same as today's manual save.
- The closet builder is untouched by this plan.
- Debounce window is ~2.5s of no changes; the max-wait cap that forces a save under continuous editing is ~20s.
- `npx tsc --noEmit` (run from `frontend/`) must stay clean after every frontend task.
- The frontend has no Jest/Vitest/RTL installed — do not add one. The one piece of pure, timing-sensitive logic (the debounce+maxWait scheduler) is verified with a throwaway `npx tsx` script, deleted before committing, the same ad-hoc way `closetData.ts` helpers were previously verified in this repo. Everything else is verified by `tsc` + the user's own manual pass in the browser (per this project's standing preference: do not browser-screenshot every change yourself).
- Autosave toggle defaults to ON (`autosaveEnabled: true`) for every new draft.
- Exact required UI copy (Spanish, verbatim):
  - Status label: `Guardando…` / `Guardado hace {N}s` or `Guardado hace {N} min` / `Error al guardar` / `Guardado automático desactivado`.
  - Notice banner (autosave-on part): `Guardado automático activado — este proyecto se guardará automáticamente mientras trabajas. Puedes desactivarlo desde la configuración del proyecto.`
  - Notice banner (draft part): `Proyecto borrador — este proyecto todavía no tiene un cliente asignado. Tus cambios se guardarán automáticamente.`
  - List badge: `Borrador`.

---

## Task 1: Backend — nullable `client_name` + `autosave_enabled` column

**Files:**
- Create: `backend/database/migrations/2026_08_14_120000_make_kitchen_client_name_nullable_add_autosave.php`
- Modify: `backend/app/Models/KitchenProject.php:16-34`
- Modify: `backend/app/Http/Controllers/KitchenProjectController.php:30-93` (`store`), `:103-129` (`update`)
- Test: `backend/tests/Feature/KitchenProjectDraftAutosaveTest.php`

**Interfaces:**
- Produces: `POST /kitchen-projects` accepts `client_name` omitted/null and an optional `autosave_enabled` boolean (default `true`); `PUT /kitchen-projects/{id}` accepts `client_name: null` and `autosave_enabled`. Both endpoints return `client_name` (string or `null`) and `autosave_enabled` (boolean) on the JSON resource — this is the contract Task 2's frontend mapping layer consumes.

- [ ] **Step 1: Write the failing feature test**

Create `backend/tests/Feature/KitchenProjectDraftAutosaveTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenProjectDraftAutosaveTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_a_kitchen_project_without_a_client_as_a_draft(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/kitchen-projects', [
            'project_name'   => 'Cocina sin cliente',
            'room_width'     => 400,
            'room_depth'     => 300,
            'ceiling_height' => 240,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('client_name', null)
            ->assertJsonPath('autosave_enabled', true);

        $this->assertDatabaseHas('kitchen_projects', [
            'project_name' => 'Cocina sin cliente',
            'client_name'  => null,
        ]);
    }

    public function test_updates_client_name_from_null_to_a_value_and_back_to_null(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $project = KitchenProject::create([
            'user_id'        => $user->id,
            'project_name'   => 'Cocina de prueba',
            'room_width'     => 400,
            'room_depth'     => 300,
            'ceiling_height' => 240,
            'openings'       => [],
        ]);

        $this->assertNull($project->client_name);

        $this->putJson("/api/kitchen-projects/{$project->id}", ['client_name' => 'Ana Ruiz'])
            ->assertStatus(200)
            ->assertJsonPath('client_name', 'Ana Ruiz');

        $this->putJson("/api/kitchen-projects/{$project->id}", ['client_name' => null])
            ->assertStatus(200)
            ->assertJsonPath('client_name', null);
    }

    public function test_autosave_enabled_round_trips_through_create_and_update(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $created = $this->postJson('/api/kitchen-projects', [
            'project_name'     => 'Cocina autosave',
            'room_width'       => 400,
            'room_depth'       => 300,
            'ceiling_height'   => 240,
            'autosave_enabled' => false,
        ])->assertStatus(201)->json();

        $this->assertFalse($created['autosave_enabled']);

        $this->putJson("/api/kitchen-projects/{$created['id']}", ['autosave_enabled' => true])
            ->assertStatus(200)
            ->assertJsonPath('autosave_enabled', true);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && php artisan test --filter=KitchenProjectDraftAutosaveTest`
Expected: FAIL — `client_name` is currently `required` (first test fails validation with a 422), and `autosave_enabled` doesn't exist as a column/field yet (third test fails on the missing key).

- [ ] **Step 3: Write the migration**

Create `backend/database/migrations/2026_08_14_120000_make_kitchen_client_name_nullable_add_autosave.php`:

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
        Schema::table('kitchen_projects', function (Blueprint $table) {
            $table->string('client_name')->nullable()->change();
            $table->boolean('autosave_enabled')->default(true)->after('status');
        });

        // The placeholder was always a stand-in for "no client yet" — converting
        // existing rows to a real NULL is what makes old and new drafts behave
        // identically from here on (list badge, validation, etc.).
        DB::table('kitchen_projects')
            ->where('client_name', 'Cliente por asignar')
            ->update(['client_name' => null]);
    }

    public function down(): void
    {
        Schema::table('kitchen_projects', function (Blueprint $table) {
            $table->dropColumn('autosave_enabled');
            $table->string('client_name')->nullable(false)->change();
        });
    }
};
```

- [ ] **Step 4: Apply the migration to the local dev database**

Run: `cd backend && php artisan migrate`
Expected: `make_kitchen_client_name_nullable_add_autosave ... DONE`. (PHPUnit's `RefreshDatabase` will apply it independently for the test run in Step 2/7 — this step is only so the running local dev backend picks it up too.)

- [ ] **Step 5: Update the model**

In `backend/app/Models/KitchenProject.php`, add `'autosave_enabled'` to `$fillable` (line 16-27) and `'autosave_enabled' => 'boolean'` to `$casts` (line 29-34):

```php
    protected $fillable = [
        'user_id',
        'client_name',
        'client_phone',
        'project_name',
        'notes',
        'room_width',
        'room_depth',
        'ceiling_height',
        'openings',
        'status',
        'autosave_enabled',
    ];

    protected $casts = [
        'room_width' => 'integer',
        'room_depth' => 'integer',
        'ceiling_height' => 'integer',
        'openings' => 'array',
        'autosave_enabled' => 'boolean',
    ];
```

- [ ] **Step 6: Update the controller**

In `backend/app/Http/Controllers/KitchenProjectController.php`:

In `store()` (line 32-59), change the `client_name` rule and add `autosave_enabled`:

```php
            'client_name'    => 'nullable|string|max:120',
```

(replacing the `'client_name' => 'required|string|max:120',` line), and add right after the `ceiling_height` rule:

```php
            'autosave_enabled' => 'sometimes|boolean',
```

Then in the `KitchenProject::create([...])` call (line 62-72), change the `client_name` line and add `autosave_enabled`:

```php
            $project = KitchenProject::create([
                'user_id'          => $request->user()->id,
                'client_name'      => $validated['client_name'] ?? null,
                'client_phone'     => $validated['client_phone'] ?? null,
                'project_name'     => $validated['project_name'],
                'notes'            => $validated['notes'] ?? null,
                'room_width'       => $validated['room_width'],
                'room_depth'       => $validated['room_depth'],
                'ceiling_height'   => $validated['ceiling_height'],
                'openings'         => $validated['openings'] ?? [],
                'autosave_enabled' => $validated['autosave_enabled'] ?? true,
            ]);
```

In `update()` (line 107-124), change the `client_name` rule and add `autosave_enabled`:

```php
            'client_name'    => 'sometimes|nullable|string|max:120',
```

and add, next to the `status` rule:

```php
            'autosave_enabled' => 'sometimes|boolean',
```

`update()`'s body (`$kitchenProject->update($validated)`) needs no other change — it mass-assigns whatever `$validated` contains, and `autosave_enabled` is now fillable.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && php artisan test --filter=KitchenProjectDraftAutosaveTest`
Expected: PASS (3 tests).

- [ ] **Step 8: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS — in particular `KitchenProjectShareTest`/`KitchenProjectShareModelTest`, which create projects with an explicit `client_name`, must be unaffected.

- [ ] **Step 9: Commit**

```bash
git add backend/database/migrations/2026_08_14_120000_make_kitchen_client_name_nullable_add_autosave.php backend/app/Models/KitchenProject.php backend/app/Http/Controllers/KitchenProjectController.php backend/tests/Feature/KitchenProjectDraftAutosaveTest.php
git commit -m "feat(kitchen): allow draft projects with no client, add autosave_enabled column"
```

---

## Task 2: Frontend — types & API mapping (remove the placeholder hack)

**Files:**
- Modify: `frontend/types/kitchen.ts:484-500`
- Modify: `frontend/services/api.ts:69-170`, `:289-325`

**Interfaces:**
- Consumes: Task 1's backend contract (`client_name: string | null`, `autosave_enabled: boolean` on the kitchen project resource).
- Produces: `KitchenDraft.autosaveEnabled: boolean`; `mapKitchenPayload`/`mapKitchenResponseToDraft`/`listKitchenProjects` round-trip `clientName` as a plain empty-string-or-value with no sentinel; new `updateKitchenAutosaveEnabled(id: number, autosaveEnabled: boolean): Promise<void>`. Task 3 (store) and Task 4 (autosave hook) both consume `KitchenDraft.autosaveEnabled` and `saveKitchenProject`.

- [ ] **Step 1: Add `autosaveEnabled` to `KitchenDraft`**

In `frontend/types/kitchen.ts`, in the `KitchenDraft` interface (line 484-500), add the field after `notes`:

```typescript
export interface KitchenDraft {
  // Project metadata
  clientName: string;
  clientPhone: string;
  projectName: string;
  notes: string;
  // Autosave-to-backend on/off — survives across browsers/devices because
  // it's saved on the project row itself, not a local UI setting.
  autosaveEnabled: boolean;
  // Kitchen configuration — a free rectangular room, modules placed freely inside it
  roomWidth: number;     // cm
  roomDepth: number;     // cm
  ceilingHeight: number; // cm
  // Modules
  modules: KitchenModule[];
  // Windows & doors — rendered as flat markers on the perimeter walls in the 3D view
  openings: WallOpening[];
  // UI state
  editingModuleId: string | null;
}
```

- [ ] **Step 2: Update `BackendKitchenProject` and delete the placeholder**

In `frontend/services/api.ts`, update the `BackendKitchenProject` interface (line 69-85):

```typescript
interface BackendKitchenProject {
  id: number;
  client_name: string | null;
  client_phone: string | null;
  project_name: string;
  notes: string | null;
  room_width: number;
  room_depth: number;
  ceiling_height: number;
  openings: WallOpening[] | null;
  status: string;
  autosave_enabled: boolean;
  created_at: string;
  updated_at: string;
  modules?: BackendKitchenModule[];
  modules_count?: number;
  quote?: { total: string | number; status: string; folio: string } | null;
}
```

Delete the `export const KITCHEN_DRAFT_CLIENT_PLACEHOLDER = "Cliente por asignar";` line (line 91).

- [ ] **Step 3: Update the mappers**

Replace `mapKitchenPayload` (line 115-144):

```typescript
function mapKitchenPayload(draft: KitchenDraft) {
  const clientName = draft.clientName.trim();
  return {
    client_name: clientName || null,
    client_phone: draft.clientPhone || null,
    project_name: draft.projectName.trim() || "Cocina nueva",
    notes: draft.notes || null,
    room_width: draft.roomWidth,
    room_depth: draft.roomDepth,
    ceiling_height: draft.ceilingHeight,
    autosave_enabled: draft.autosaveEnabled,
    openings: draft.openings,
    modules: draft.modules.map((m) => ({
      module_type: m.type,
      category: m.category,
      label: m.label,
      height: m.dimensions.height,
      width: m.dimensions.width,
      depth: m.dimensions.depth,
      x: Math.round(m.x * 100) / 100,
      z: Math.round(m.z * 100) / 100,
      rotation: m.rotation,
      options: m.options,
    })),
  };
}
```

Replace `mapKitchenResponseToDraft` (line 146-170):

```typescript
function mapKitchenResponseToDraft(json: BackendKitchenProject): KitchenDraft {
  return {
    clientName: json.client_name ?? "",
    clientPhone: json.client_phone ?? "",
    projectName: json.project_name,
    notes: json.notes ?? "",
    autosaveEnabled: json.autosave_enabled,
    roomWidth: json.room_width,
    roomDepth: json.room_depth,
    ceilingHeight: json.ceiling_height,
    modules: (json.modules ?? []).map((m) => ({
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
    openings: json.openings ?? [],
    editingModuleId: null,
  };
}
```

- [ ] **Step 4: Fix `listKitchenProjects`**

In `listKitchenProjects` (line 289-304), replace the `clientName` line:

```typescript
    clientName: p.client_name ?? "",
```

(replacing `clientName: p.client_name === KITCHEN_DRAFT_CLIENT_PLACEHOLDER ? "" : p.client_name,`).

- [ ] **Step 5: Add `updateKitchenAutosaveEnabled`**

Add right after `updateKitchenProjectStatus` (after line 308) in `frontend/services/api.ts`:

```typescript
export async function updateKitchenAutosaveEnabled(id: number, autosaveEnabled: boolean): Promise<void> {
  await http.put(`/kitchen-projects/${id}`, { autosave_enabled: autosaveEnabled });
}
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors at every remaining reference to `KitchenDraft.autosaveEnabled`/`initialDraft` not yet updated (Task 3) — confirm the *only* errors are about the not-yet-updated `initialDraft` object missing the new required field, nothing else. (If `tsc` is fully clean already, that's fine too — it means `initialDraft`'s object literal doesn't get strictly checked against the interface at this point; proceed regardless.)

- [ ] **Step 7: Commit**

```bash
git add frontend/types/kitchen.ts frontend/services/api.ts
git commit -m "feat(kitchen): replace client-name placeholder with real null, add autosave_enabled mapping"
```

---

## Task 3: Frontend — store support for `autosaveEnabled`

**Files:**
- Modify: `frontend/store/useKitchenStore.ts:77-88` (`initialDraft`), `:122-198` (`KitchenStore` interface), `:200-226` (implementation)

**Interfaces:**
- Consumes: `KitchenDraft.autosaveEnabled` (Task 2).
- Produces: `initialDraft.autosaveEnabled = true`; new store action `setAutosaveEnabled: (enabled: boolean) => void`. Task 5 (UI wiring) calls this action; Task 4 (autosave hook) reads `draft.autosaveEnabled` as its `enabled` input.

- [ ] **Step 1: Add the field to `initialDraft`**

In `frontend/store/useKitchenStore.ts`, update `initialDraft` (line 77-88):

```typescript
const initialDraft: KitchenDraft = {
  clientName: "",
  clientPhone: "",
  projectName: "Cocina nueva",
  notes: "",
  autosaveEnabled: true,
  roomWidth: 400,
  roomDepth: 300,
  ceilingHeight: 240,
  modules: [],
  openings: [],
  editingModuleId: null,
};
```

- [ ] **Step 2: Add the action to the store interface**

In the `KitchenStore` interface (line 122-198), add right after `adoptSavedProjectId` (line 139):

```typescript
  adoptSavedProjectId: (projectId: number) => void;
  setAutosaveEnabled: (enabled: boolean) => void;
```

- [ ] **Step 3: Implement the action**

In the store body, add right after `adoptSavedProjectId: (projectId) => set({ projectId }),` (line 224-225):

```typescript
      adoptSavedProjectId: (projectId) =>
        set({ projectId }),

      setAutosaveEnabled: (enabled) =>
        set((s) => ({ draft: { ...s.draft, autosaveEnabled: enabled } })),
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/store/useKitchenStore.ts
git commit -m "feat(kitchen): add autosaveEnabled to the kitchen draft store"
```

---

## Task 4: Frontend — debounce+maxWait scheduler and the `useKitchenAutosave` hook

**Files:**
- Create: `frontend/services/autosaveScheduler.ts`
- Create: `frontend/hooks/useKitchenAutosave.ts`
- Temporary (deleted before commit): `frontend/scripts/_verify-autosave-scheduler.ts`

**Interfaces:**
- Consumes: `saveKitchenProject(draft, projectId)` (existing, `frontend/services/api.ts:315-325`), `KitchenDraft` (Task 2).
- Produces: `createDebouncedMaxWaitScheduler(run: () => void, debounceMs: number, maxWaitMs: number): { trigger(): void; flushNow(): void; cancel(): void }`; `useKitchenAutosave({ draft, projectId, enabled, onProjectCreated }): AutosaveStatus`, and the exported type `AutosaveStatus = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: number } | { kind: "error"; message: string }`. Task 5 consumes both `AutosaveStatus` and the hook.

- [ ] **Step 1: Write the failing verification script**

Create `frontend/scripts/_verify-autosave-scheduler.ts`:

```typescript
import { createDebouncedMaxWaitScheduler } from "../services/autosaveScheduler";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

async function main() {
  let runs = 0;
  const scheduler = createDebouncedMaxWaitScheduler(() => { runs++; }, 200, 700);

  // 1. A single trigger fires once, after ~debounceMs, not immediately.
  scheduler.trigger();
  await wait(50);
  check(runs === 0, "fired before debounce elapsed");
  await wait(200);
  check(runs === 1, "did not fire after debounce elapsed");

  // 2. flushNow with nothing pending is a no-op.
  scheduler.flushNow();
  await wait(10);
  check(runs === 1, "flushNow fired with nothing pending");

  // 3. Repeated triggers within debounceMs keep resetting it.
  runs = 0;
  scheduler.trigger();
  await wait(120);
  scheduler.trigger();
  await wait(120);
  scheduler.trigger();
  check(runs === 0, "fired despite continuous triggering under debounceMs");
  await wait(250);
  check(runs === 1, `should settle to exactly one run after quiet, got ${runs}`);

  // 4. Continuous triggering faster than debounceMs still fires via maxWait.
  runs = 0;
  const burst = setInterval(() => scheduler.trigger(), 100);
  await wait(750);
  clearInterval(burst);
  check(runs === 1, `expected exactly 1 maxWait-forced run, got ${runs}`);

  // 5. flushNow with something pending fires immediately and cancels the timers.
  runs = 0;
  scheduler.trigger();
  await wait(20);
  scheduler.flushNow();
  check(runs === 1, "flushNow did not fire immediately");
  await wait(250);
  check(runs === 1, "debounce timer fired again after flushNow should have cancelled it");

  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx tsx scripts/_verify-autosave-scheduler.ts`
Expected: FAIL — module not found (`frontend/services/autosaveScheduler.ts` doesn't exist yet).

- [ ] **Step 3: Implement the scheduler**

Create `frontend/services/autosaveScheduler.ts`:

```typescript
export interface DebouncedMaxWaitScheduler {
  trigger: () => void;
  flushNow: () => void;
  cancel: () => void;
}

// Hand-rolled debounce-with-maxWait, same shape as createDebouncedLocalStorage
// (useKitchenStore.ts) but parameterized instead of hardcoded to localStorage.
// `trigger()` (re)arms a debounce timer that runs `run` after `debounceMs` of
// no further triggers; a separate non-resetting maxWait timer, armed on the
// FIRST trigger of a burst, guarantees `run` fires at least once every
// `maxWaitMs` even under continuous triggering (e.g. dragging a module for
// 30s straight). Whichever timer fires first runs `run` once and clears the
// other. `flushNow()` runs `run` immediately if something is pending, and is
// a no-op otherwise.
export function createDebouncedMaxWaitScheduler(run: () => void, debounceMs: number, maxWaitMs: number): DebouncedMaxWaitScheduler {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
  };

  const fire = () => {
    cancel();
    run();
  };

  const trigger = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fire, debounceMs);
    if (!maxWaitTimer) maxWaitTimer = setTimeout(fire, maxWaitMs);
  };

  const flushNow = () => {
    if (!debounceTimer && !maxWaitTimer) return;
    fire();
  };

  return { trigger, flushNow, cancel };
}
```

- [ ] **Step 4: Run the verification script to confirm it passes**

Run: `cd frontend && npx tsx scripts/_verify-autosave-scheduler.ts`
Expected: `ALL CHECKS PASSED`, exit code 0.

- [ ] **Step 5: Delete the throwaway script**

Run: `rm frontend/scripts/_verify-autosave-scheduler.ts` (bash) or `Remove-Item frontend/scripts/_verify-autosave-scheduler.ts` (PowerShell) — this file must not be committed.

- [ ] **Step 6: Implement the React hook**

Create `frontend/hooks/useKitchenAutosave.ts`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { saveKitchenProject } from "@/services/api";
import { createDebouncedMaxWaitScheduler } from "@/services/autosaveScheduler";
import type { KitchenDraft } from "@/types/kitchen";

const DEBOUNCE_MS = 2500;
const MAX_WAIT_MS = 20000;

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

interface UseKitchenAutosaveArgs {
  draft: KitchenDraft;
  projectId: number | null;
  enabled: boolean;
  onProjectCreated: (id: number) => void;
}

// Autosaves `draft` to the backend on the same debounce+maxWait schedule the
// design doc calls for, using the exact same saveKitchenProject() the manual
// Guardar button uses — no parallel save path. Also doubles as "lazy backend
// creation": since saveKitchenProject(draft, null) already POSTs a brand-new
// project, the very first real change on an unsaved draft creates its
// backend row as a side effect of the normal autosave schedule, with no
// special-cased "first save" code path.
export function useKitchenAutosave({ draft, projectId, enabled, onProjectCreated }: UseKitchenAutosaveArgs): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });

  // Refs so the scheduler's callback (captured once, see below) always reads
  // the latest values instead of the ones from the render it was created in.
  const draftRef = useRef(draft);
  const projectIdRef = useRef(projectId);
  const enabledRef = useRef(enabled);
  const onProjectCreatedRef = useRef(onProjectCreated);
  draftRef.current = draft;
  projectIdRef.current = projectId;
  enabledRef.current = enabled;
  onProjectCreatedRef.current = onProjectCreated;

  const pendingRef = useRef(false);
  const savingRef = useRef(false);
  const schedulerRef = useRef<ReturnType<typeof createDebouncedMaxWaitScheduler> | null>(null);

  const flush = () => {
    if (!pendingRef.current || !enabledRef.current) return;
    if (savingRef.current) {
      // A save is already in flight — retry shortly instead of losing this edit.
      schedulerRef.current?.trigger();
      return;
    }
    pendingRef.current = false;
    savingRef.current = true;
    setStatus({ kind: "saving" });
    saveKitchenProject(draftRef.current, projectIdRef.current)
      .then((savedId) => {
        if (projectIdRef.current === null) {
          projectIdRef.current = savedId;
          onProjectCreatedRef.current(savedId);
        }
        setStatus({ kind: "saved", at: Date.now() });
      })
      .catch((error: unknown) => {
        // Leave the edit unflushed so the next change or flush retries it,
        // instead of silently dropping it. No toast here — that's the loud
        // version the manual Guardar button already covers; this is the
        // persistent quiet one (see the status indicator in the UI).
        pendingRef.current = true;
        setStatus({ kind: "error", message: error instanceof Error ? error.message : "No fue posible guardar." });
      })
      .finally(() => {
        savingRef.current = false;
      });
  };

  useEffect(() => {
    schedulerRef.current = createDebouncedMaxWaitScheduler(flush, DEBOUNCE_MS, MAX_WAIT_MS);
    return () => schedulerRef.current?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fires on every real draft mutation. Two cases must NOT count as a user
  // edit: the initial mount, and a fresh loadProject()-style swap (draft and
  // projectId change together when navigating to a different saved project)
  // — both are guarded against here instead of scheduling a spurious save
  // right after a project loads.
  const hasMountedRef = useRef(false);
  const lastProjectIdRef = useRef(projectId);
  useEffect(() => {
    const isFirstRun = !hasMountedRef.current;
    hasMountedRef.current = true;
    const projectSwapped = projectId !== lastProjectIdRef.current;
    lastProjectIdRef.current = projectId;

    if (isFirstRun || projectSwapped) return;
    if (!enabledRef.current) return;

    pendingRef.current = true;
    schedulerRef.current?.trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, projectId]);

  // visibilitychange is the primary leave-the-page signal — fires reliably
  // on tab switch, minimize, and mobile backgrounding, and fires before most
  // browsers' unload sequence. beforeunload is a best-effort backup only; a
  // multi-request authenticated save can't be guaranteed to complete once
  // the page is actually torn down.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") schedulerRef.current?.flushNow();
    };
    const onBeforeUnload = () => { schedulerRef.current?.flushNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return status;
}
```

- [ ] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Confirm the scratch script is gone**

Run: `git status --short frontend/scripts/`
Expected: no output (the `_verify-autosave-scheduler.ts` file must not appear as untracked).

- [ ] **Step 9: Commit**

```bash
git add frontend/services/autosaveScheduler.ts frontend/hooks/useKitchenAutosave.ts
git commit -m "feat(kitchen): add debounce+maxWait scheduler and useKitchenAutosave hook"
```

---

## Task 5: Frontend — status indicator + autosave toggle in the builder header

**Files:**
- Create: `frontend/components/kitchen/AutosaveStatusLabel.tsx`
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx:1-20` (imports), `:38-42` (store destructure), `:179-192` (add hook + toggle handler), `:236-273` (desktop header), `:325-351` (mobile menu)

**Interfaces:**
- Consumes: `useKitchenAutosave`/`AutosaveStatus` (Task 4), `setAutosaveEnabled` (Task 3), `updateKitchenAutosaveEnabled` (Task 2).
- Produces: visible status text + a working autosave toggle in both the desktop header and the mobile overflow menu.

- [ ] **Step 1: Create the status label component**

Create `frontend/components/kitchen/AutosaveStatusLabel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { AutosaveStatus } from "@/hooks/useKitchenAutosave";

function relativeLabel(atMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (seconds < 60) return `Guardado hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `Guardado hace ${minutes} min`;
}

export function AutosaveStatusLabel({ status, autosaveEnabled }: { status: AutosaveStatus; autosaveEnabled: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status.kind !== "saved") return;
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [status]);

  if (!autosaveEnabled) {
    return <span className="text-[11px] text-amber-300/80 whitespace-nowrap">Guardado automático desactivado</span>;
  }
  if (status.kind === "saving") return <span className="text-[11px] text-warmgray whitespace-nowrap">Guardando…</span>;
  if (status.kind === "saved") return <span className="text-[11px] text-warmgray whitespace-nowrap">{relativeLabel(status.at, now)}</span>;
  if (status.kind === "error") return <span className="text-[11px] text-rose-300 whitespace-nowrap">Error al guardar</span>;
  return null;
}
```

- [ ] **Step 2: Wire the hook and toggle handler into `KitchenBuilder`**

In `frontend/components/kitchen/KitchenBuilder.tsx`, add imports (near line 8-18):

```typescript
import { getKitchenProject, saveKitchenProject, updateKitchenAutosaveEnabled } from "@/services/api";
import { useKitchenAutosave } from "@/hooks/useKitchenAutosave";
import { AutosaveStatusLabel } from "./AutosaveStatusLabel";
```

Extend the store destructure (line 39-42) to also pull `adoptSavedProjectId` and `setAutosaveEnabled`:

```typescript
  const {
    draft, projectId, activeTab, showSelector, setActiveTab, resetDraft, loadProject, updateModulePosition, nudgeModule,
    openSelector, closeSelector, setEditingModule, undoStack, redoStack, undo, redo, updateOpening, removeModule, toggleModuleLock,
    adoptSavedProjectId, setAutosaveEnabled,
  } = useKitchenStore();
```

Right after the `handleSave` function (after line 192), add:

```typescript
  const autosaveStatus = useKitchenAutosave({
    draft,
    projectId,
    enabled: draft.autosaveEnabled,
    onProjectCreated: adoptSavedProjectId,
  });

  const handleAutosaveToggle = (value: boolean) => {
    setAutosaveEnabled(value);
    if (projectId !== null) {
      updateKitchenAutosaveEnabled(projectId, value).catch(() =>
        toast.error("No fue posible actualizar el guardado automático.")
      );
    }
  };
```

Note: `useKitchenAutosave` is a hook, so it must be called unconditionally on every render — it's placed here, before the `if (projectLoading) return (...)` block (line 194-200), same as every other hook in this component.

- [ ] **Step 3: Add the status label + toggle to the desktop header**

In the desktop header's action group (line 236-273), insert the status label and toggle right before the Guardar `<Button>` (before line 270):

```tsx
          <AutosaveStatusLabel status={autosaveStatus} autosaveEnabled={draft.autosaveEnabled} />
          <label className="flex items-center gap-1.5 text-[11px] text-warmgray cursor-pointer select-none" title="Guardado automático">
            <input
              type="checkbox"
              checked={draft.autosaveEnabled}
              onChange={(e) => handleAutosaveToggle(e.target.checked)}
              className="accent-indigo-500"
            />
            Auto
          </label>
          <Button variant="primary" className="h-8 px-3 text-xs" disabled={saving} onClick={handleSave}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
```

(This replaces just the final `<Button variant="primary" ...>Guardar</Button>` block at line 270-272 — keep that Button, only add the two new elements before it.)

- [ ] **Step 4: Add the same controls to the mobile overflow menu**

In the mobile menu (line 315-350), insert right before the Guardar button block (before line 339):

```tsx
              <div className="mt-1 flex items-center justify-between border-t border-ivory/8 px-3 pt-2">
                <AutosaveStatusLabel status={autosaveStatus} autosaveEnabled={draft.autosaveEnabled} />
                <label className="flex items-center gap-1.5 text-[11px] text-warmgray cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={draft.autosaveEnabled}
                    onChange={(e) => handleAutosaveToggle(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  Auto
                </label>
              </div>
```

(Placed as its own row above the existing `<div className="mt-1 border-t border-ivory/8 pt-1">` Guardar-button wrapper at line 339-348 — both `border-t` rows stack fine.)

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual verification (user)**

This is a UI behavior change in the 3D builder — per this project's standing preference, the user verifies it manually rather than via automated browser screenshots. Note for the user: open `/kitchen`, add a module, wait ~3s, and confirm the header shows "Guardando…" then "Guardado hace Xs"; toggle "Auto" off and confirm the label switches to "Guardado automático desactivado" and stays off after a refresh.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/kitchen/AutosaveStatusLabel.tsx frontend/components/kitchen/KitchenBuilder.tsx
git commit -m "feat(kitchen): wire autosave status indicator and on/off toggle into the builder header"
```

---

## Task 6: Frontend — one-time autosave/draft notice banner

**Files:**
- Create: `frontend/components/kitchen/AutosaveNotice.tsx`
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx` (render the banner)

**Interfaces:**
- Consumes: `draft.autosaveEnabled` (Task 3), `draft.clientName` (existing).
- Produces: a dismissible banner shown once per project per tab session.

- [ ] **Step 1: Create the notice component**

Create `frontend/components/kitchen/AutosaveNotice.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface AutosaveNoticeProps {
  // "new" for a not-yet-saved draft, otherwise the numeric project id as a
  // string — keeps the sessionStorage key stable per actual project.
  projectKey: string;
  autosaveEnabled: boolean;
  isDraft: boolean;
}

// Shown once per project per tab session (sessionStorage-keyed), not on
// every autosave tick — reappears in a genuinely new tab but not on every
// render/autosave within the same visit.
export function AutosaveNotice({ projectKey, autosaveEnabled, isDraft }: AutosaveNoticeProps) {
  const storageKey = `kitchen-autosave-notice:${projectKey}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
    setVisible(true);
  }, [storageKey]);

  if (!visible || (!autosaveEnabled && !isDraft)) return null;

  const parts: string[] = [];
  if (autosaveEnabled) {
    parts.push(
      "Guardado automático activado — este proyecto se guardará automáticamente mientras trabajas. Puedes desactivarlo desde la configuración del proyecto."
    );
  }
  if (isDraft) {
    parts.push(
      "Proyecto borrador — este proyecto todavía no tiene un cliente asignado. Tus cambios se guardarán automáticamente."
    );
  }

  return (
    <div className="flex items-start gap-3 border-b border-brass/25 bg-brass/8 px-4 py-2.5 text-xs text-ivory/90">
      <p className="flex-1">{parts.join(" ")}</p>
      <button onClick={() => setVisible(false)} aria-label="Cerrar aviso" className="shrink-0 text-warmgray hover:text-ivory">
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Render it in `KitchenBuilder`**

Add the import near the other kitchen component imports:

```typescript
import { AutosaveNotice } from "./AutosaveNotice";
```

Add a computed value right after `const modulesCount = draft.modules.length;` (line 175):

```typescript
  const isDraftProject = draft.clientName.trim() === "";
  const noticeProjectKey = projectId !== null ? String(projectId) : "new";
```

Render the banner right after the mobile header block and before `{/* ── Main content ── */}` (before line 354), so it shows above both the 3D and Summary tabs:

```tsx
      <AutosaveNotice projectKey={noticeProjectKey} autosaveEnabled={draft.autosaveEnabled} isDraft={isDraftProject} />
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual verification (user)**

Note for the user: open a brand-new `/kitchen` draft and confirm the banner appears once at the top (autosave-on + draft-project text combined), dismiss it, refresh — it should stay gone for that tab; open `/kitchen` in a new tab to see it reappear.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/kitchen/AutosaveNotice.tsx frontend/components/kitchen/KitchenBuilder.tsx
git commit -m "feat(kitchen): show a one-time autosave/draft notice banner"
```

---

## Task 7: Frontend — "Borrador" badge on the kitchen projects list

**Files:**
- Modify: `frontend/app/kitchen/projects/page.tsx:1-10` (imports), `:89-92` (client-name cell)

**Interfaces:**
- Consumes: `listKitchenProjects()`'s `clientName: string` field (Task 2 — now `""` instead of the placeholder string for draft projects).
- Produces: a "Borrador" chip visible in the projects table wherever `clientName` is empty.

- [ ] **Step 1: Add the Badge import**

In `frontend/app/kitchen/projects/page.tsx`, add to the imports (near line 6-10):

```typescript
import { Badge } from "@/components/ui/badge";
```

- [ ] **Step 2: Render the badge in the Cliente cell**

Replace the client-name cell (line 89-92):

```tsx
                  <td className="px-5 py-3">
                    {p.clientName ? (
                      <p className="text-zinc-200">{p.clientName}</p>
                    ) : (
                      <Badge tone="amber">Borrador</Badge>
                    )}
                    <p className="text-xs text-zinc-500">{p.clientPhone}</p>
                  </td>
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual verification (user)**

Note for the user: open `/kitchen/projects` and confirm any project with no client shows the "Borrador" chip instead of a blank cell.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/kitchen/projects/page.tsx
git commit -m "feat(kitchen): show a Borrador badge for kitchen projects with no client"
```

---

## Self-Review Notes

- **Spec coverage:** §1 Data model → Task 1. §2 Frontend types/mapping → Task 2. §3 Draft = derived → Task 6/7 (`clientName.trim() === ""` computed inline, never stored). §4 Lazy backend creation → achieved by Task 4's hook (first real change schedules a debounce save; `saveKitchenProject(draft, null)` already POSTs, no separate code path). §5 Autosave scheduling → Task 4. §6 Leaving the page → Task 4 (`visibilitychange` + `beforeunload`). §7 UI (status indicator, toggle, notice banner, list badge) → Tasks 5, 6, 7. Testing section's "verify the debounce+maxWait timer logic with `npx tsx`" → Task 4, Steps 1-5.
- **Type consistency checked:** `AutosaveStatus` (Task 4) used identically in `AutosaveStatusLabel` (Task 5) and returned by `useKitchenAutosave`. `setAutosaveEnabled`/`adoptSavedProjectId` names match between the store (Task 3) and their call sites in `KitchenBuilder.tsx` (Task 5). `updateKitchenAutosaveEnabled(id, autosaveEnabled)` signature matches its Task 2 definition and Task 5 call site.
- **No placeholders:** every step has literal, complete code — no "add validation"-style stubs.

# Door Pistons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any door with `doorHingeSides[i] === "arriba"` optionally get
a piston (gas strut), priced from the phase-1 materials catalog and
summed automatically into the project's quote — no 3D geometry, no
hardcoded price.

**Architecture:** One new per-door boolean array on `ModuleOptions`
(`doorPistons`), reset to `false` whenever a door's hinge changes away
from `"arriba"`. One new hardware cost site in
`calculateKitchenMaterials`, reading through the same
`materialCosts?.get(code) ?? fallback` pattern every other cost site
already uses. One new seeded `materials` row (backend) so the catalog
price is real and admin-editable from the start.

**Tech Stack:** Laravel 11 (`backend/`), Next.js 16 + TypeScript
(`frontend/`). No unit-test runner exists for the frontend (verify with
`npx tsc --noEmit` + reasoning); backend has a real Feature-test suite
(`php artisan test`), established in phase 1.

**Spec:** `docs/superpowers/specs/2026-08-15-door-pistons-design.md`

## Global Constraints

- All frontend commands run from `frontend/`, backend commands from
  `backend/`.
- No 3D geometry for pistons — matches the established precedent that
  no hardware fitting (hinges included) is ever visually rendered in
  this codebase.
- `doorPistons[i]` is only ever meaningful when `doorHingeSides[i] ===
  "arriba"` — every write site must reset it to `false` the moment a
  door's hinge side changes away from `"arriba"`, in the same handler,
  not a separate effect.
- Piston price must come from the materials catalog
  (`materialCosts?.get("piston_arriba")`), with the hardcoded constant
  used only as a fallback when the catalog hasn't loaded/synced —
  never the primary source.
- `git status` in both `backend/` and `frontend/` may show unrelated
  in-progress work in other files — never stage anything outside the
  exact files each task names, never `git add -A`/`git add .`.

---

## File Structure

- `frontend/types/kitchen.ts` — `ModuleOptions` gains `doorPistons?: boolean[]`.
- `backend/database/migrations/2026_08_15_130000_add_piston_material.php` —
  new additive migration, one seeded `materials` row.
- `frontend/services/kitchenData.ts` — `HARDWARE_COSTS.piston_arriba`
  constant, new cost site in `calculateKitchenMaterials`.
- `frontend/components/kitchen/ModuleInspector.tsx` — new per-door
  "Pistones" control in the existing "Apertura de puertas" section,
  reset-on-hinge-change logic.

---

### Task 1: Data model — `doorPistons` field

**Files:**
- Modify: `frontend/types/kitchen.ts:385` (`ModuleOptions`, right after
  `doorPullOut`)

**Interfaces:**
- Produces: `ModuleOptions.doorPistons?: boolean[]`.

- [ ] **Step 1: Add the field**

Find:

```ts
  doorPullOut?: boolean[];
```

Replace with:

```ts
  doorPullOut?: boolean[];
  // Per-door: true = this door has an optional gas-strut piston helping
  // hold it open (index-aligned with door order, same convention as
  // doorHingeSides). Only meaningful when doorHingeSides[i] === "arriba"
  // — every write site (ModuleInspector.tsx) resets the corresponding
  // entry to false the moment a door's hinge changes away from "arriba",
  // so a stale true can never persist on a door that can't have one.
  doorPistons?: boolean[];
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly — purely additive optional field, nothing reads
it yet.

- [ ] **Step 3: Commit**

```bash
git add types/kitchen.ts
git commit -m "$(cat <<'EOF'
Add doorPistons field to the kitchen module data model

Purely additive optional field — nothing reads it yet. Only meaningful
when the same-indexed doorHingeSides entry is "arriba".
EOF
)"
```

---

### Task 2: Backend — seed a real "Pistón" catalog row

**Files:**
- Create: `backend/database/migrations/2026_08_15_130000_add_piston_material.php`

**Interfaces:**
- Produces: one `materials` row with `code: "piston_arriba"`,
  `type: "Pistón"`, `cost_per_unit: 180` — Task 3's frontend fallback
  constant is seeded from this exact same value, so the two never
  silently disagree.

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Additive seed only — no schema change, the `code` column and
        // free-text `type` field already exist from the materials CRUD
        // phase (2026_08_15_120000_add_code_to_materials.php). Price
        // mirrors the frontend fallback constant
        // (HARDWARE_COSTS.piston_arriba in services/kitchenData.ts) so
        // the seed and the code-level fallback start in agreement — an
        // admin can reprice this row from the materials CRUD afterward
        // without touching code.
        DB::table('materials')->insert([
            'name' => 'Pistón hidráulico para puerta abatible',
            'code' => 'piston_arriba',
            'type' => 'Pistón',
            'unit' => 'pzas',
            'cost_per_unit' => 180,
            'stock' => 0,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('materials')->where('code', 'piston_arriba')->delete();
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && php artisan migrate`
Expected: `add_piston_material` migration runs, no errors.

- [ ] **Step 3: Verify**

Run: `php artisan tinker --execute="echo App\Models\Material::where('code', 'piston_arriba')->first()?->cost_per_unit;"`
Expected: `180`

- [ ] **Step 4: Run the backend test suite**

Run: `php artisan test`
Expected: all tests pass (this migration adds no new validated
behavior, just seed data — confirming the full suite still passes is
sufficient, no new test file needed for this task).

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_08_15_130000_add_piston_material.php
git commit -m "$(cat <<'EOF'
Seed a real "Pistón" catalog row for door pistons

Additive migration, no schema change — the code column and Pistón
category already exist from the materials CRUD phase. Price mirrors
the frontend fallback constant so the two start in agreement; an admin
can reprice from the materials CRUD afterward.
EOF
)"
```

---

### Task 3: Cost calc — piston hardware line

**Files:**
- Modify: `frontend/services/kitchenData.ts:390` (`HARDWARE_COSTS`),
  `:1959-1963` (front-door hinge cost site)

**Interfaces:**
- Consumes: `ModuleOptions.doorPistons` (Task 1).
- Produces: a new `"piston"` hardware line in
  `calculateKitchenMaterials`'s output whenever any module has at least
  one door with both `doorHingeSides[i] === "arriba"` and
  `doorPistons[i] === true`.

- [ ] **Step 1: Add the fallback constant**

Find:

```ts
  canto_pvc_2mm: 18,
};
```

Replace with:

```ts
  canto_pvc_2mm: 18,
  // Fallback only — the real price comes from the materials catalog
  // (code: "piston_arriba", seeded by
  // backend/database/migrations/2026_08_15_130000_add_piston_material.php).
  // Kept in agreement with that seed's cost_per_unit intentionally.
  piston_arriba: 180,
};
```

- [ ] **Step 2: Add the piston cost site**

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
        const hingeCode = o.drawerSystem === "Soft-close" ? "bisagra_amortiguada" : "bisagra_simple";
        const hingeCost = materialCosts?.get(hingeCode) ?? (o.drawerSystem === "Soft-close" ? 65 : 35);
        addHardware("bisagra", "Bisagras", doors.length, "pares", hingeCost);
      }
      // Pistons — only meaningful on doors whose hinge is "arriba";
      // counted directly from the flat, index-aligned option arrays
      // (not from `doors`/resolveDoors' output) since that's the same
      // source ModuleInspector.tsx reads/writes, and a door's index in
      // that flat array is stable regardless of how resolveDoors groups
      // or reorders entries for rendering.
      let pistonCount = 0;
      for (let i = 0; i < o.doors; i++) {
        if (o.doorHingeSides?.[i] === "arriba" && o.doorPistons?.[i]) pistonCount++;
      }
      if (pistonCount > 0) {
        const pistonCost = materialCosts?.get("piston_arriba") ?? HARDWARE_COSTS.piston_arriba;
        addHardware("piston", "Pistones", pistonCount, "pzas", pistonCost);
      }
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Verify with a differential script**

No test runner exists for this file, and this touches real pricing —
verify the counting logic directly:

```js
function countPistons(doors, hingeSides, pistons) {
  let count = 0;
  for (let i = 0; i < doors; i++) {
    if (hingeSides?.[i] === "arriba" && pistons?.[i]) count++;
  }
  return count;
}

// Case A: 2 doors, both "arriba", both pistoned -> 2
console.assert(countPistons(2, ["arriba", "arriba"], [true, true]) === 2, "A failed");

// Case B: 2 doors, one "arriba" with piston, one "izquierda" -> 1 (side-hinged door's piston flag, if any, must not count)
console.assert(countPistons(2, ["arriba", "izquierda"], [true, true]) === 1, "B failed");

// Case C: no doorPistons set at all (undefined) -> 0, no crash
console.assert(countPistons(2, ["arriba", "arriba"], undefined) === 0, "C failed");

// Case D: doorHingeSides undefined (defaults elsewhere apply, but this loop sees no "arriba") -> 0
console.assert(countPistons(2, undefined, [true, true]) === 0, "D failed");

console.log("all cases passed");
```

Run it with `node` and confirm `"all cases passed"` — this is the exact
counting logic added in Step 2.

- [ ] **Step 5: Commit**

```bash
git add services/kitchenData.ts
git commit -m "$(cat <<'EOF'
Add piston hardware cost line, catalog-priced

Counts doors with both doorHingeSides[i] === "arriba" and
doorPistons[i] === true from the flat option arrays (same source
ModuleInspector reads/writes), prices through
materialCosts?.get("piston_arriba") with the HARDWARE_COSTS constant
as fallback only.
EOF
)"
```

---

### Task 4: UI — per-door piston toggle

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx:820-829`
  (the per-door hinge-side `SelectInput`), add a new `FieldGroup` after
  `:854` (end of the existing "frente"/glass `FieldGroup`)

**Interfaces:**
- Consumes: `ModuleOptions.doorPistons` (Task 1).

- [ ] **Step 1: Reset `doorPistons[i]` when a door's hinge side changes away from "arriba"**

Find:

```tsx
                    <FieldGroup label={`Puerta ${i + 1}`}>
                      <SelectInput
                        value={current}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorHingeSides?.[j] ?? (j % 2 === 0 ? "izquierda" : "derecha"));
                          next[i] = v;
                          updateOpt("doorHingeSides", next);
                        }}
                        options={isUpper ? DOOR_HINGE_OPTIONS_UPPER : DOOR_HINGE_OPTIONS}
                      />
                    </FieldGroup>
```

Replace with:

```tsx
                    <FieldGroup label={`Puerta ${i + 1}`}>
                      <SelectInput
                        value={current}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorHingeSides?.[j] ?? (j % 2 === 0 ? "izquierda" : "derecha"));
                          next[i] = v;
                          updateModule(module.id, { options: { ...opt, doorHingeSides: next, doorPistons: v === "arriba" ? opt.doorPistons : (Array.from({ length: opt.doors }, (_, j) => (j === i ? false : opt.doorPistons?.[j] ?? false))) } });
                        }}
                        options={isUpper ? DOOR_HINGE_OPTIONS_UPPER : DOOR_HINGE_OPTIONS}
                      />
                    </FieldGroup>
```

- [ ] **Step 2: Add the piston toggle, shown only when this door's hinge is "arriba"**

Find:

```tsx
                    <FieldGroup label={`Puerta ${i + 1}: frente`}>
                      <SelectInput
                        value={currentGlass}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorGlass?.[j] ?? false);
                          next[i] = v === "cristal";
                          updateOpt("doorGlass", next);
                        }}
                        options={[
                          { value: "normal", label: "Tablero sólido" },
                          { value: "cristal", label: "Cristal (marco + panel de vidrio)" },
                        ]}
                      />
                    </FieldGroup>
                  </Fragment>
                );
              })}
```

Replace with:

```tsx
                    <FieldGroup label={`Puerta ${i + 1}: frente`}>
                      <SelectInput
                        value={currentGlass}
                        onChange={(v) => {
                          const next = Array.from({ length: opt.doors }, (_, j) => opt.doorGlass?.[j] ?? false);
                          next[i] = v === "cristal";
                          updateOpt("doorGlass", next);
                        }}
                        options={[
                          { value: "normal", label: "Tablero sólido" },
                          { value: "cristal", label: "Cristal (marco + panel de vidrio)" },
                        ]}
                      />
                    </FieldGroup>
                    {current === "arriba" && (
                      <FieldGroup label={`Puerta ${i + 1}: pistón`}>
                        <SelectInput
                          value={opt.doorPistons?.[i] ? "si" : "no"}
                          onChange={(v) => {
                            const next = Array.from({ length: opt.doors }, (_, j) => opt.doorPistons?.[j] ?? false);
                            next[i] = v === "si";
                            updateOpt("doorPistons", next);
                          }}
                          options={[
                            { value: "no", label: "Sin pistones" },
                            { value: "si", label: "Con pistones" },
                          ]}
                        />
                      </FieldGroup>
                    )}
                  </Fragment>
                );
              })}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Reasoning check**

No test runner or browser testing for this — verify by reading. (a)
Setting door `i`'s hinge to `"arriba"` leaves `doorPistons` unchanged
(the ternary's true branch: `v === "arriba" ? opt.doorPistons : ...`),
so a previously-set piston flag survives switching back to "arriba".
(b) Setting door `i`'s hinge to anything else forces index `i`'s
`doorPistons` entry to `false` while preserving every other door's
entry (the false branch rebuilds the full array, only overriding index
`i`). (c) The new "Puerta N: pistón" field only renders when `current
=== "arriba"` for that specific door, matching Task 3's cost-counting
condition exactly — a door that can't show the toggle also can't be
billed for a piston.

- [ ] **Step 5: Commit**

```bash
git add components/kitchen/ModuleInspector.tsx
git commit -m "$(cat <<'EOF'
Add per-door piston toggle for "arriba"-hinged doors

Shown only when that door's hinge side is "arriba", matching the cost
engine's counting condition exactly. Changing a door's hinge away from
"arriba" resets its doorPistons entry to false in the same handler, so
a stale flag can never persist on a door that can't have one.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1) · backend seed (Task 2) · cost
  calc (Task 3) · UI (Task 4). All 6 spec sections have a task or are
  explicitly non-goals (§1 non-goals: no 3D, respected — no task
  touches `ModulePreview3D.tsx`).
- **Placeholder scan:** none — every step has complete, literal code.
- **Type consistency:** `doorPistons?: boolean[]` (Task 1) is read
  identically in Task 3's cost-counting loop (`o.doorPistons?.[i]`) and
  Task 4's UI (`opt.doorPistons?.[i]`) — same optional-chained,
  index-aligned convention as `doorGlass`/`doorPullOut`. `"piston_arriba"`
  is spelled identically across Task 2 (migration `code`), Task 3
  (`HARDWARE_COSTS.piston_arriba` key and `materialCosts?.get(...)`
  call), matching exactly.
- **Scope check:** single cohesive plan; Task 1 is a prerequisite for
  Tasks 3-4, Task 2 is independent (separate repo) but logically
  precedes Task 3 since Task 3's fallback constant is seeded from
  Task 2's migration value, Task 4 depends on Task 1 only (UI writes
  the field, doesn't need Task 3's cost logic to exist first — but
  sequenced last to match this plan's established task order).
- **Ambiguity check:** the piston price (180) is pinned to one exact
  value used identically in both the migration (Task 2) and the
  frontend fallback constant (Task 3), rather than left for the
  implementer to pick independently in each.

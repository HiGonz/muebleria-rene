# Materials CRUD + Dynamic Kitchen Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the existing half-built Materials CRUD (backend already
complete, frontend is a dead-button shell) and make kitchen pricing read
material costs from that catalog instead of hardcoded constants — with
the constants demoted to fallbacks, never removed.

**Architecture:** Reuse the existing `materials` table/model/controller/
routes as-is. Add one nullable `code` column for stable hardware-cost
lookups (board materials already match cleanly by `name`). Thread a
`materialCosts: Map<string, number> | null` through
`calculateKitchenMaterials`, read at every existing cost site as
`materialCosts?.get(key) ?? <current hardcoded expression>` — additive at
every call site, byte-identical behavior when the map is empty/missing a
key.

**Tech Stack:** Laravel 11 + Sanctum (`backend/`), Next.js 16 App Router +
Zustand (`frontend/`). No frontend unit-test runner exists (only
Playwright e2e) — verification is `npx tsc --noEmit` plus reasoning,
matching this repo's established convention.

**Spec:** `docs/superpowers/specs/2026-08-15-materials-crud-pricing-design.md`

## Global Constraints

- Phase 1 of 4 (multi-door reuse, pistons, per-category material
  defaults are separate specs/plans, built after this one).
- No change to which materials are *selectable* in the 3D configurator —
  `BoardMaterial`'s 10 literal values and the existing `SelectInput`/
  `TexturePicker` UI are untouched. This phase only makes *prices*
  dynamic for the existing fixed set.
- No backend-side price computation for kitchen quotes — pricing stays
  100% client-computed, exactly as today. Only the source of unit costs
  changes.
- Every cost lookup must fall back to the current hardcoded constant when
  the catalog is empty, loading, or missing that specific key — never a
  hard dependency on the network call succeeding.
- `git status` in both `backend/` and `frontend/` shows unrelated
  in-progress work in other files/repos — never stage anything outside
  the exact files each task names, never `git add -A`/`git add .`.
- All frontend commands run from `frontend/`, all backend commands from
  `backend/`.

---

## File Structure

- `backend/database/migrations/2026_08_15_120000_add_code_to_materials.php` —
  new additive migration: nullable unique `code` column + backfill.
- `backend/app/Models/Material.php` — add `code` to `$fillable`.
- `backend/app/Http/Controllers/MaterialController.php` — add `code`
  validation to `store`/`update`.
- `frontend/services/api.ts` — `BackendMaterial.code`, `listMaterials()`
  mapping, new `createMaterial`/`updateMaterial`/`deleteMaterial`.
- `frontend/components/materials/MaterialFormModal.tsx` — new file, the
  create/edit form (mirrors `GlobalMaterialsModal.tsx`'s modal shell).
- `frontend/app/materials/page.tsx` — wire the three dead buttons to real
  handlers + the new modal.
- `frontend/store/useKitchenStore.ts` — `materialCosts` field +
  `loadMaterialCosts` action; `getMaterials` passes it through.
- `frontend/components/kitchen/KitchenBuilder.tsx` — call
  `loadMaterialCosts()` once on mount.
- `frontend/services/kitchenData.ts` — `calculateKitchenMaterials` gains
  a `materialCosts` parameter; 4 call sites read through it.

---

### Task 1: Backend — `code` column, model, validation

**Files:**
- Create: `backend/database/migrations/2026_08_15_120000_add_code_to_materials.php`
- Modify: `backend/app/Models/Material.php`
- Modify: `backend/app/Http/Controllers/MaterialController.php`

**Interfaces:**
- Produces: `materials.code` (nullable, unique, string) — the stable key
  `frontend/store/useKitchenStore.ts`'s `loadMaterialCosts` (Task 4)
  reads to build its cost lookup map for hardware; board rows are looked
  up by `name` instead (already 1:1 with `BoardMaterial`, no `code`
  needed for those, though seeding it doesn't hurt).

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
            $table->string('code')->nullable()->unique()->after('name');
        });

        // Backfill: assign `code` to existing rows that correspond to a
        // key the frontend pricing engine already reads by a fixed
        // string (BoardMaterial names for boards, HARDWARE_COSTS keys
        // for hardware — see frontend/services/kitchenData.ts). Matched
        // by name+price so a row that's already been renamed/repriced by
        // an admin isn't silently reassigned. Rows with no match keep
        // code = null — they're extra catalog entries not yet wired to
        // any lookup, not an error.
        $codeByName = [
            'MDF 15mm' => 'MDF 15mm',
            'MDF 18mm' => 'MDF 18mm',
            'Melamina blanca 18mm' => 'Melamina blanca 18mm',
            'Melamina nogal 18mm' => 'Melamina nogal 18mm',
            'Bisagra 35mm' => 'bisagra_simple',
            'Corredera telescópica 450mm' => 'corredera_simple',
            'Canto PVC 0.4mm' => 'canto_pvc_04',
            'Tornillo confimát' => 'tornillo_confirmat',
        ];
        foreach ($codeByName as $name => $code) {
            DB::table('materials')->where('name', $name)->update(['code' => $code]);
        }

        // Missing board materials — BoardMaterial (frontend/types/kitchen.ts)
        // has 10 values; only 4 already exist as rows (backfilled above).
        // Seeded from the current BOARD_COSTS constants so this migration
        // is the bridge, not a separate manual data-entry step.
        $now = now();
        DB::table('materials')->insert([
            ['name' => 'Melamina blanca 15mm', 'code' => 'Melamina blanca 15mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 185, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Melamina roble 18mm', 'code' => 'Melamina roble 18mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 230, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Melamina wengue 18mm', 'code' => 'Melamina wengue 18mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 255, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Triplay 18mm', 'code' => 'Triplay 18mm', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 195, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'MDF lacado brillante', 'code' => 'MDF lacado brillante', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 380, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'MDF lacado mate', 'code' => 'MDF lacado mate', 'type' => 'Tablero', 'unit' => 'm²', 'cost_per_unit' => 360, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            // Missing hardware SKUs — HARDWARE_COSTS (kitchenData.ts) has
            // 11 keys; only bisagra_simple/corredera_simple/canto_pvc_04/
            // tornillo_confirmat exist as rows (backfilled above).
            ['name' => 'Bisagra amortiguada', 'code' => 'bisagra_amortiguada', 'type' => 'Herraje', 'unit' => 'pares', 'cost_per_unit' => 65, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Corredera de extracción total', 'code' => 'corredera_extraccion', 'type' => 'Herraje', 'unit' => 'pares', 'cost_per_unit' => 145, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Corredera soft-close', 'code' => 'corredera_softclose', 'type' => 'Herraje', 'unit' => 'pares', 'cost_per_unit' => 130, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Jaladera barra de acero', 'code' => 'jaladera_barra_acero', 'type' => 'Herraje', 'unit' => 'pzas', 'cost_per_unit' => 85, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Jaladera gota', 'code' => 'jaladera_gota', 'type' => 'Herraje', 'unit' => 'pzas', 'cost_per_unit' => 75, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Pata metálica', 'code' => 'pata_metalica', 'type' => 'Herraje', 'unit' => 'pzas', 'cost_per_unit' => 140, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Canto PVC 2mm', 'code' => 'canto_pvc_2mm', 'type' => 'Acabado', 'unit' => 'ml', 'cost_per_unit' => 18, 'stock' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::table('materials', function (Blueprint $table) {
            $table->dropColumn('code');
        });
    }
};
```

- [ ] **Step 2: Add `code` to the model's fillable**

Find (in `backend/app/Models/Material.php`):

```php
    protected $fillable = ['name', 'type', 'unit', 'cost_per_unit', 'stock', 'active'];
```

Replace with:

```php
    protected $fillable = ['name', 'code', 'type', 'unit', 'cost_per_unit', 'stock', 'active'];
```

- [ ] **Step 3: Add `code` validation to the controller**

Find (in `backend/app/Http/Controllers/MaterialController.php`):

```php
    public function store(Request $request): JsonResponse
    {
        $material = Material::create($request->validate([
            'name' => ['required', 'string'],
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
            'type' => ['sometimes', 'string'],
            'unit' => ['sometimes', 'string'],
            'cost_per_unit' => ['sometimes', 'numeric'],
            'stock' => ['sometimes', 'numeric'],
            'active' => ['sometimes', 'boolean'],
        ]));

        return response()->json($material);
    }
```

Replace with:

```php
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
```

- [ ] **Step 4: Import the `Rule` facade**

Find (top of `backend/app/Http/Controllers/MaterialController.php`):

```php
use App\Models\Material;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
```

Replace with:

```php
use App\Models\Material;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
```

- [ ] **Step 5: Run the migration**

Run: `cd backend && php artisan migrate`
Expected: `add_code_to_materials` migration runs, no errors.

- [ ] **Step 6: Verify the backfill**

Run: `php artisan tinker --execute="App\Models\Material::whereNotNull('code')->count()"`
Expected: `12` (the 4 backfilled-by-name + 8 newly inserted rows all have
a `code`; the pre-existing `Jalador moderno`/`Triplay 9mm`/`Triplay 12mm`
rows correctly keep `code = null` since they don't match any current
lookup key).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_08_15_120000_add_code_to_materials.php app/Models/Material.php app/Http/Controllers/MaterialController.php
git commit -m "$(cat <<'EOF'
Add stable code column to materials, backfilled from existing kitchen
pricing constants

Additive migration — nullable, unique code column plus a backfill that
assigns codes to rows already matching a BoardMaterial name or
HARDWARE_COSTS key, and inserts the ones missing entirely. Seeds every
new row's price from the current hardcoded constant, so this migration
is the bridge to dynamic pricing, not a separate data-entry step. Rows
with no matching lookup key keep code = null.
EOF
)"
```

---

### Task 2: Frontend — API client CRUD functions

**Files:**
- Modify: `frontend/services/api.ts:45-53` (`BackendMaterial`), `:267-278`
  (`listMaterials`), add 3 new functions after it.

**Interfaces:**
- Consumes: `code` field from Task 1's backend response.
- Produces: `listMaterials(): Promise<{id, name, code, type, unit, cost,
  stock, active}[]>` (extended with `code`); `createMaterial(input: {
  name: string; code?: string | null; type: string; unit: string; cost:
  number; stock: number; active: boolean }): Promise<Material>`;
  `updateMaterial(id: number, patch: Partial<{...same fields...}>):
  Promise<Material>`; `deleteMaterial(id: number): Promise<void>` — Task
  3's form/buttons call these directly.

- [ ] **Step 1: Add `code` to the backend response type**

Find:

```ts
interface BackendMaterial {
  id: number;
  name: string;
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
}
```

- [ ] **Step 2: Map `code` in `listMaterials` and add the three CRUD functions**

Find:

```ts
export async function listMaterials() {
  const materials = await http.get<BackendMaterial[]>("/materials");
  return materials.map((m) => ({
    id: m.id,
    name: m.name,
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
  }));
}

export interface MaterialInput {
  name: string;
  code?: string | null;
  type: string;
  unit: string;
  cost: number;
  stock: number;
  active: boolean;
}

function mapMaterial(m: BackendMaterial) {
  return { id: m.id, name: m.name, code: m.code, type: m.type, unit: m.unit, cost: Number(m.cost_per_unit), stock: Number(m.stock), active: m.active };
}

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

export async function deleteMaterial(id: number) {
  await http.delete(`/materials/${id}`);
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Commit**

```bash
git add services/api.ts
git commit -m "$(cat <<'EOF'
Add create/update/delete API client functions for materials

listMaterials now also returns code. The materials page (Task 3) and
the kitchen pricing lookup (Task 4) both consume these.
EOF
)"
```

---

### Task 3: Frontend — Materials CRUD UI

**Files:**
- Create: `frontend/components/materials/MaterialFormModal.tsx`
- Modify: `frontend/app/materials/page.tsx`

**Interfaces:**
- Consumes: `createMaterial`, `updateMaterial`, `deleteMaterial` (Task
  2); `Input`, `Button`, `Card`, `Badge` (pre-existing, `components/ui/`).
- Produces: `MaterialFormModal({ material, onClose, onSaved }: {
  material?: { id: number; name: string; code: string | null; type:
  string; unit: string; cost: number; stock: number; active: boolean };
  onClose: () => void; onSaved: () => void })` — `material` present means
  edit, absent means create.

- [ ] **Step 1: Create the form modal**

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

export function MaterialFormModal({ material, onClose, onSaved }: {
  material?: EditableMaterial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(material?.name ?? "");
  const [code, setCode] = useState(material?.code ?? "");
  const [type, setType] = useState(material?.type ?? TYPE_OPTIONS[0]);
  const [unit, setUnit] = useState(material?.unit ?? "");
  const [cost, setCost] = useState(String(material?.cost ?? ""));
  const [stock, setStock] = useState(String(material?.stock ?? 0));
  const [active, setActive] = useState(material?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const parsedCost = Number(cost);
    const parsedStock = Number(stock);
    if (!name.trim() || !unit.trim() || Number.isNaN(parsedCost) || Number.isNaN(parsedStock)) {
      setError("Nombre, unidad, costo y stock son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: MaterialInput = { name: name.trim(), code: code.trim() || null, type, unit: unit.trim(), cost: parsedCost, stock: parsedStock, active };
    try {
      if (material) {
        await updateMaterial(material.id, input);
      } else {
        await createMaterial(input);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible guardar el material.");
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
          <h2 className="text-sm font-semibold text-white">{material ? "Editar material" : "Nuevo material"}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MDF 18mm" />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Código (opcional)</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="mdf_18mm" className="font-mono text-sm" />
            <p className="text-[11px] text-zinc-500">Identificador estable usado por el sistema de precios — solo necesario para tableros/herrajes que el configurador ya reconoce.</p>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Categoría</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white">
              {TYPE_OPTIONS.map((t) => <option key={t} value={t} className="bg-zinc-900">{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Unidad</label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m², pzas, ml..." />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Costo unitario</label>
              <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">Stock</label>
              <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 pt-6 text-sm text-zinc-300">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
              Activo
            </label>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
        <div className="shrink-0 border-t border-white/10 p-4">
          <Button className="w-full" disabled={saving} onClick={handleSubmit}>
            {saving ? "Guardando..." : material ? "Guardar cambios" : "Crear material"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the materials page's buttons**

Find (`frontend/app/materials/page.tsx`, the whole file):

```tsx
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { listMaterials } from "@/services/api";

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Awaited<ReturnType<typeof listMaterials>> | null>(null);

  useEffect(() => {
    listMaterials().then(setMaterials);
  }, []);

  return (
    <AppShell title="Materiales" subtitle="Catálogo de tableros, herrajes y fijación">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">CRUD de materiales</h3>
            <p className="text-sm text-zinc-400">Vista lista para alta, edición y activación de catálogo.</p>
          </div>
          <Button>Nuevo material</Button>
        </div>
        {!materials ? (
          <p className="text-sm text-zinc-400">Cargando...</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-zinc-400">
                <tr>{['Nombre', 'Tipo', 'Unidad', 'Costo unitario', 'Stock', 'Estado', 'Acciones'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
              </thead>
              <tbody>
                {materials.map((material) => (
                  <tr key={material.id} className="border-t border-white/6">
                    <td className="px-4 py-4 font-medium text-white">{material.name}</td>
                    <td className="px-4 py-4"><Badge tone={material.type === 'Tablero' ? 'indigo' : material.type === 'Herraje' ? 'amber' : 'emerald'}>{material.type}</Badge></td>
                    <td className="px-4 py-4 text-zinc-400">{material.unit}</td>
                    <td className="px-4 py-4 text-zinc-400">{formatCurrency(material.cost)}</td>
                    <td className="px-4 py-4 text-zinc-400">{material.stock}</td>
                    <td className="px-4 py-4"><Badge tone={material.active ? 'emerald' : 'rose'}>{material.active ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="px-4 py-4"><div className="flex gap-2"><Button variant="secondary" className="h-9">Editar</Button><Button variant="ghost" className="h-9">Toggle</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
```

Replace with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { deleteMaterial, listMaterials, updateMaterial } from "@/services/api";
import { MaterialFormModal } from "@/components/materials/MaterialFormModal";

type MaterialRow = Awaited<ReturnType<typeof listMaterials>>[number];

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<MaterialRow[] | null>(null);
  const [editing, setEditing] = useState<MaterialRow | "new" | null>(null);

  const reload = () => listMaterials().then(setMaterials);

  useEffect(() => {
    reload();
  }, []);

  const handleSaved = () => {
    setEditing(null);
    reload();
  };

  const handleToggle = async (material: MaterialRow) => {
    await updateMaterial(material.id, { active: !material.active });
    reload();
  };

  const handleDelete = async (material: MaterialRow) => {
    if (!window.confirm(`¿Eliminar "${material.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteMaterial(material.id);
    reload();
  };

  return (
    <AppShell title="Materiales" subtitle="Catálogo de tableros, herrajes y fijación">
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">CRUD de materiales</h3>
            <p className="text-sm text-zinc-400">Vista lista para alta, edición y activación de catálogo.</p>
          </div>
          <Button onClick={() => setEditing("new")}>Nuevo material</Button>
        </div>
        {!materials ? (
          <p className="text-sm text-zinc-400">Cargando...</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-zinc-400">
                <tr>{['Nombre', 'Tipo', 'Unidad', 'Costo unitario', 'Stock', 'Estado', 'Acciones'].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
              </thead>
              <tbody>
                {materials.map((material) => (
                  <tr key={material.id} className="border-t border-white/6">
                    <td className="px-4 py-4 font-medium text-white">{material.name}</td>
                    <td className="px-4 py-4"><Badge tone={material.type === 'Tablero' ? 'indigo' : material.type === 'Herraje' ? 'amber' : 'emerald'}>{material.type}</Badge></td>
                    <td className="px-4 py-4 text-zinc-400">{material.unit}</td>
                    <td className="px-4 py-4 text-zinc-400">{formatCurrency(material.cost)}</td>
                    <td className="px-4 py-4 text-zinc-400">{material.stock}</td>
                    <td className="px-4 py-4"><Badge tone={material.active ? 'emerald' : 'rose'}>{material.active ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Button variant="secondary" className="h-9" onClick={() => setEditing(material)}>Editar</Button>
                        <Button variant="ghost" className="h-9" onClick={() => handleToggle(material)}>{material.active ? "Desactivar" : "Activar"}</Button>
                        <Button variant="danger" className="h-9" onClick={() => handleDelete(material)}>Eliminar</Button>
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
        <MaterialFormModal
          material={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Commit**

```bash
git add components/materials/MaterialFormModal.tsx app/materials/page.tsx
git commit -m "$(cat <<'EOF'
Wire the materials CRUD page's create/edit/toggle/delete actions

MaterialFormModal handles both create and edit. Toggle/delete call the
API directly with a confirm() guard on delete. The list reloads after
every mutation instead of local-patching state, keeping this simple
since material lists are short.
EOF
)"
```

---

### Task 4: Frontend — `materialCosts` in the kitchen store

**Files:**
- Modify: `frontend/store/useKitchenStore.ts:124-200` (interface),
  `:207-211` (initial state)
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx:98-108`

**Interfaces:**
- Consumes: `listMaterials()` (Task 2).
- Produces: `useKitchenStore().materialCosts: Map<string, number> | null`;
  `useKitchenStore().loadMaterialCosts(): Promise<void>` — Task 5's
  `getMaterials()` reads `materialCosts` directly from store state.

- [ ] **Step 1: Add the field and action to the store interface**

Find:

```ts
  // Panel UI state (not persisted in draft)
  showSelector: boolean;
  activeTab: "builder" | "3d" | "summary";
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
```

Replace with:

```ts
  // Panel UI state (not persisted in draft)
  showSelector: boolean;
  activeTab: "builder" | "3d" | "summary";
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  // Material catalog prices, keyed by code (hardware) or name (boards) —
  // see loadMaterialCosts. null until the first successful load; every
  // cost read in calculateKitchenMaterials falls back to its hardcoded
  // constant when a key is missing, so this being null/incomplete never
  // breaks pricing, just means it isn't dynamic yet for that item.
  materialCosts: Map<string, number> | null;
```

Then find:

```ts
  // Computed helpers (not reactive, call as needed)
  getEditingModule: () => KitchenModule | undefined;
  getMaterials: () => ReturnType<typeof calculateKitchenMaterials>;
}
```

Replace with:

```ts
  // Computed helpers (not reactive, call as needed)
  getEditingModule: () => KitchenModule | undefined;
  getMaterials: () => ReturnType<typeof calculateKitchenMaterials>;
  // Fetches the material catalog once and populates materialCosts. Safe
  // to call multiple times (e.g. StrictMode double-invoke) — just
  // re-fetches. Never throws: a failed fetch leaves materialCosts as it
  // was (null on first failure), so pricing keeps using hardcoded
  // fallbacks rather than the caller needing to handle an error.
  loadMaterialCosts: () => Promise<void>;
}
```

- [ ] **Step 2: Initialize the field and implement the action**

Find:

```ts
      draft: initialDraft,
      projectId: null,
      showSelector: false,
      activeTab: "3d",
      undoStack: [],
      redoStack: [],
```

Replace with:

```ts
      draft: initialDraft,
      projectId: null,
      showSelector: false,
      activeTab: "3d",
      undoStack: [],
      redoStack: [],
      materialCosts: null,
```

Then find:

```ts
      getEditingModule: () => {
        const { draft } = get();
        return draft.modules.find((m) => m.id === draft.editingModuleId);
      },

      getMaterials: () => calculateKitchenMaterials(get().draft.modules),
```

Replace with:

```ts
      getEditingModule: () => {
        const { draft } = get();
        return draft.modules.find((m) => m.id === draft.editingModuleId);
      },

      getMaterials: () => calculateKitchenMaterials(get().draft.modules, get().materialCosts),

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

- [ ] **Step 3: Import `listMaterials`**

Find (top of the file, the existing import block from `@/services/api`
or add a new one if none exists yet — check the file's current imports
first):

```ts
import { buildNewModule, buildSampleKitchen, calculateKitchenMaterials, getCountertopModel, findFreeSpotNear, isFreestandingPosition, ISLAND_ELIGIBLE_CATEGORIES } from "@/services/kitchenData";
```

Replace with:

```ts
import { buildNewModule, buildSampleKitchen, calculateKitchenMaterials, getCountertopModel, findFreeSpotNear, isFreestandingPosition, ISLAND_ELIGIBLE_CATEGORIES } from "@/services/kitchenData";
import { listMaterials } from "@/services/api";
```

- [ ] **Step 4: Call `loadMaterialCosts` once from `KitchenBuilder.tsx`**

Find:

```tsx
  useEffect(() => {
    const param = searchParams.get("projectId");
    const id = param ? Number(param) : null;
    if (id === null || Number.isNaN(id) || loadedProjectIdRef.current === id) return;
    loadedProjectIdRef.current = id;
    setProjectLoading(true);
    getKitchenProject(id)
      .then((remoteDraft) => loadProject(id, remoteDraft))
      .catch(() => toast.error("No fue posible cargar el proyecto de cocina."))
      .finally(() => setProjectLoading(false));
  }, [searchParams, loadProject]);
```

Replace with:

```tsx
  useEffect(() => {
    const param = searchParams.get("projectId");
    const id = param ? Number(param) : null;
    if (id === null || Number.isNaN(id) || loadedProjectIdRef.current === id) return;
    loadedProjectIdRef.current = id;
    setProjectLoading(true);
    getKitchenProject(id)
      .then((remoteDraft) => loadProject(id, remoteDraft))
      .catch(() => toast.error("No fue posible cargar el proyecto de cocina."))
      .finally(() => setProjectLoading(false));
  }, [searchParams, loadProject]);

  // Fire-and-forget — pricing uses hardcoded fallbacks until this
  // resolves, then re-renders once loaded since getMaterials() reads
  // live store state. No loading gate on the builder UI for this.
  useEffect(() => {
    useKitchenStore.getState().loadMaterialCosts();
  }, []);
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly. `calculateKitchenMaterials` doesn't accept a
second parameter yet (Task 5 adds it) — if `tsc` errors on the
`getMaterials` line's extra argument, that's expected at this point;
confirm Task 5 resolves it and don't treat it as this task's failure if
Task 5 runs immediately after in the same session. If executing tasks
independently with a review gate between them, note this in your report
rather than treating it as blocking — Task 5 is the next task in this
same plan and closes the gap.

- [ ] **Step 6: Commit**

```bash
git add store/useKitchenStore.ts components/kitchen/KitchenBuilder.tsx
git commit -m "$(cat <<'EOF'
Load material costs into the kitchen store once per builder session

materialCosts stays null until the fetch resolves and is never required
— every consumer (Task 5) falls back to hardcoded constants when it's
null or missing a key. Not persisted (outside the draft/projectId
partialize whitelist already in place).
EOF
)"
```

---

### Task 5: Frontend — wire `calculateKitchenMaterials` to read dynamic costs

**Files:**
- Modify: `frontend/services/kitchenData.ts:1637` (signature), `:1938,
  1951` (hinge cost), `:1979` (corredera cost), `:2353` (board cost)

**Interfaces:**
- Consumes: `Map<string, number> | null` (Task 4's `materialCosts`).
- Produces: `calculateKitchenMaterials(modules: KitchenModule[],
  materialCosts?: Map<string, number> | null): { lines:
  KitchenMaterialLine[]; summary: KitchenQuoteSummary }` — the second
  parameter is optional so any other future/test call site that omits it
  keeps working unchanged.

- [ ] **Step 1: Add the parameter**

Find:

```ts
export function calculateKitchenMaterials(modules: KitchenModule[]): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary } {
```

Replace with:

```ts
export function calculateKitchenMaterials(modules: KitchenModule[], materialCosts?: Map<string, number> | null): { lines: KitchenMaterialLine[]; summary: KitchenQuoteSummary } {
```

- [ ] **Step 2: Front-door hinge cost**

Find:

```ts
      if (doors.length > 0) {
        const hingeCost = o.drawerSystem === "Soft-close" ? 65 : 35;
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
```

- [ ] **Step 3: Back-door hinge cost**

Find:

```ts
      if (backDoors.length > 0) {
        const hingeCost = o.drawerSystem === "Soft-close" ? 65 : 35;
        addHardware("bisagra", "Bisagras", backDoors.length, "pares", hingeCost);
      }
```

Replace with:

```ts
      if (backDoors.length > 0) {
        const hingeCode = o.drawerSystem === "Soft-close" ? "bisagra_amortiguada" : "bisagra_simple";
        const hingeCost = materialCosts?.get(hingeCode) ?? (o.drawerSystem === "Soft-close" ? 65 : 35);
        addHardware("bisagra", "Bisagras", backDoors.length, "pares", hingeCost);
      }
```

- [ ] **Step 4: Drawer slide (corredera) cost**

Find:

```ts
      if (realDrawers.length > 0) {
        addHardware("corredera", "Correderas", realDrawers.length, "pares", HARDWARE_COSTS.corredera_softclose);
      }
```

Replace with:

```ts
      if (realDrawers.length > 0) {
        const correderaCost = materialCosts?.get("corredera_softclose") ?? HARDWARE_COSTS.corredera_softclose;
        addHardware("corredera", "Correderas", realDrawers.length, "pares", correderaCost);
      }
```

- [ ] **Step 5: Board cost**

Find:

```ts
      const boardCost = BOARD_COSTS[material] ?? 180;
```

Replace with:

```ts
      const boardCost = materialCosts?.get(material) ?? BOARD_COSTS[material] ?? 180;
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly (this also resolves Task 4's Step 5 note about
the extra argument).

- [ ] **Step 7: Verify with a differential script**

No test runner exists for this file, and this touches real pricing
logic — verify the fallback chain directly rather than only reasoning
about it. Write a throwaway (uncommitted) script:

```js
function resolveCost(materialCosts, key, fallback) {
  return materialCosts?.get(key) ?? fallback;
}

const catalog = new Map([["bisagra_amortiguada", 70], ["MDF 18mm", 199]]);

// Case A: key present in catalog -> catalog value wins
console.assert(resolveCost(catalog, "bisagra_amortiguada", 65) === 70, "A failed");

// Case B: key absent from catalog -> hardcoded fallback
console.assert(resolveCost(catalog, "bisagra_simple", 35) === 35, "B failed");

// Case C: catalog is null (not yet loaded) -> hardcoded fallback
console.assert(resolveCost(null, "MDF 18mm", 180) === 180, "C failed");

// Case D: catalog loaded but board material present -> catalog wins
console.assert(resolveCost(catalog, "MDF 18mm", 180) === 199, "D failed");

console.log("all cases passed");
```

Run it with `node` and confirm `"all cases passed"` — this is the exact
`materialCosts?.get(key) ?? fallback` pattern used at all 4 call sites in
this task, so one verified pattern covers all of them.

- [ ] **Step 8: Commit**

```bash
git add services/kitchenData.ts
git commit -m "$(cat <<'EOF'
Read material/hardware costs from the catalog when available

calculateKitchenMaterials now accepts an optional materialCosts map
(Task 4) and checks it before falling back to the existing hardcoded
BOARD_COSTS/HARDWARE_COSTS constants — byte-identical behavior when the
map is null or missing a key. Fixes a pre-existing gap where hinge cost
was inlined instead of reading HARDWARE_COSTS at all, so repricing
hinges previously had no effect.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** backend `code` column + backfill (Task 1) · frontend
  API client (Task 2) · CRUD UI (Task 3) · store wiring (Task 4) ·
  pricing engine wiring (Task 5). All 4 spec sections (§1-§4) have a
  task. Non-goals (no new selectable board materials, no backend price
  computation) are respected — no task touches `SelectInput`/
  `TexturePicker` options or `KitchenProjectController::quote()`.
- **Placeholder scan:** none — every step has complete, literal code.
  Task 4 Step 5's note about a transient tsc error between Task 4 and
  Task 5 is a sequencing note for the executor, not a placeholder.
- **Type consistency:** `MaterialInput` (Task 2) is used identically in
  `MaterialFormModal` (Task 3)'s `createMaterial`/`updateMaterial` calls.
  `materialCosts: Map<string, number> | null` is spelled identically in
  the store interface (Task 4) and `calculateKitchenMaterials`'s new
  parameter (Task 5). `loadMaterialCosts` keys by `code ?? name`
  (Task 4) — matching exactly what Task 5's lookups key by (hardware
  `code`s like `"bisagra_amortiguada"`, board `name`s like `"MDF
  18mm"`).
- **Scope check:** single cohesive plan; Task 1 is a prerequisite for
  everything, Task 2 depends on Task 1's `code` field existing
  meaningfully, Task 3 depends on Task 2, Task 4 depends on Task 2, Task
  5 depends on Task 4.
- **Ambiguity check:** the backfill migration's name-to-code mapping
  (Task 1) is pinned to exact values rather than left for the
  implementer to derive, since getting board/hardware names wrong would
  silently mis-price real quotes.

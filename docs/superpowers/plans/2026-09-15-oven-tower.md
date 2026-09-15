# Oven/Microwave Tower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller composes an oven/microwave tower bottom-to-top from any mix of door/drawer/open/oven/microwave sections, in any order and any count, each a fully-configurable real module — and can save the result as a shop-wide favorite.

**Architecture:** An `OvenTowerRecipe` (own type, own store slice, own `services/ovenTower.ts` — deliberately NOT sharing the closet tower's engine, see the spec's Non-goals) is the source of truth. `generateOvenTowerModules` turns it into real `gabinete_bajo_puertas`/`gabinete_bajo_cajones`/`hueco_bajo_repisa`/`hueco_horno`/`hueco_microondas` modules, tagged `options.ovenTowerGroupId`. The one genuinely new mechanism: `updateModule` now writes an edit made on a tower-generated module back into its recipe section BEFORE regenerating, so a hinge/material choice made in the normal Inspector survives the tower's next regeneration — closet's own tower system has no such write-back and is untouched by this plan.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand 5, TypeScript 6, Tailwind 4, Vitest (Node environment, framework-free modules — already configured), Laravel 12 + PHPUnit (SQLite `:memory:`).

**Spec:** `docs/superpowers/specs/2026-09-15-oven-tower-design.md`

## Global Constraints

- Content values are exactly `puertas` | `cajones` | `abierto` | `horno` | `microondas` — lowercase unaccented in code; Spanish UI copy keeps accents.
- Typical heights (spec §2): `puertas`/`cajones`/`abierto` 90cm, `horno` 60cm, `microondas` 38cm. Minimum any section may resolve to: **15cm** (reuse `TOWER_MIN_SECTION_HEIGHT_CM` from `services/closetTower.ts` — it is a generic "still furniture" floor, not closet-specific, so it is imported, not redefined).
- Generated module ids are deterministic: `` `${recipe.id}__${section.id}` ``.
- A section's own module type: `puertas`→`gabinete_bajo_puertas`, `cajones`→`gabinete_bajo_cajones`, `abierto`→`hueco_bajo_repisa`, `horno`→`hueco_horno` (new), `microondas`→`hueco_microondas` (new).
- The option key is `ovenTowerGroupId` — **never** `towerGroupId` (that key belongs exclusively to closet's own system; reusing it would make `ModuleInspector`'s closet-only `GeneratedTowerPanel` fire for an oven-tower module too).
- Only a section's `heightCm`/`flex`/`options` are edited per-section; `widthCm`/`depthCm`/`x`/`z`/`rotation` are tower-wide, edited only through `OvenTowerDialog`'s header.
- `services/closetTower.ts` and `services/ovenTower.ts` share nothing beyond the imported `TOWER_MIN_SECTION_HEIGHT_CM` constant. Do not add a shared "tower engine" module — see the spec's Non-goals.
- Vitest stays Node-environment, framework-free modules only — no jsdom, no React Testing Library, no component tests for this plan either.
- Backend tests: `php artisan test` from `backend/`. Frontend unit tests: `npm test` from `frontend/`.
- **Verify the typecheck by running `npx tsc --noEmit` from `frontend/` and reading its complete raw output — never filtered or summarized.**
- Nothing is renamed. `torre_horno_microondas`/`torre_horno_empotrado`'s existing types, meshes and cost-calculation branches are left completely alone — only their catalog entries (the thing that lets a seller add a *new* one) are removed.

## File Structure

**Created (frontend)**
- `types/ovenTower.ts` — `OvenTowerContent`, `OvenTowerSection`, `OvenTowerRecipe`
- `services/ovenTower.ts` — height resolution, module generation, placement. Framework-free, the only frontend unit-tested surface for this feature.
- `services/ovenTower.test.ts`
- `lib/ovenTowerTemplate.ts` — recipe↔template conversion
- `lib/ovenTowerTemplate.test.ts`
- `components/kitchen/OvenTowerDialog.tsx` — the bottom-to-top composer (content + height only; per-section deep options are edited in the normal Inspector, not here)

**Modified (frontend)**
- `types/kitchen.ts` — `ModuleOptions.ovenTowerGroupId`, `KitchenDraft.ovenTowers`, `TowerModuleType` gains `hueco_horno`/`hueco_microondas`
- `services/kitchenData.ts` — catalog entries for the two new types; removal of `torre_horno_microondas`/`torre_horno_empotrado` catalog entries
- `services/kitchenData.test.ts` — catalog assertions for the two new types
- `components/3d/ModulePreview3D.tsx` — export `OvenNicheFront`/`MicrowaveNicheFront`; two new mesh functions; two new `CabinetMesh` dispatch branches
- `store/useKitchenStore.ts` — `draft.ovenTowers`, `addOvenTower`/`updateOvenTower`/`removeOvenTower`, `applyOvenTowers`, and the write-back branches in `updateModule`/`updateModulePosition`/`removeModule`
- `services/api.ts` — `oven_towers` on the backend project shape + payload/draft mapping; `listOvenTowerTemplates`/`createOvenTowerTemplate`/`deleteOvenTowerTemplate`/`OvenTowerTemplate`
- `components/kitchen/TowerElevation.tsx` — oven-content drawing, selected by a new `system` prop
- `components/kitchen/ModuleInspector.tsx` — the oven-tower section panel (coexists with the normal fields, unlike closet's replacing panel) + dialog mount
- `lib/projectCatalog.ts` — new `cocina_torres` selector group
- `components/kitchen/ModuleSelector.tsx` — Torres tiles/composer entry point for `cocina_torres`

**Created (backend)**
- `database/migrations/2026_09_16_120000_add_oven_towers_to_kitchen_projects.php`
- `database/migrations/2026_09_16_121000_create_oven_tower_templates_table.php`
- `app/Models/OvenTowerTemplate.php`
- `app/Http/Controllers/OvenTowerTemplateController.php`
- `tests/Feature/OvenTowerTemplateTest.php`
- `tests/Feature/KitchenProjectOvenTowersTest.php`

**Modified (backend)**
- `app/Models/KitchenProject.php`
- `app/Http/Controllers/KitchenProjectController.php`
- `routes/api.php`

Task 1 builds the pure recipe/height core. Task 2 adds the two new catalog module types that Tasks 3 (module generation) and 5 (3D meshes) both depend on; Task 4 (placement) has no such dependency but sits between them since it's part of the same pure-core group. Tasks 6–7 wire the store, including the write-back mechanism that lets an Inspector edit survive regeneration. Task 8 is the template conversion, Task 9 the frontend API client. Tasks 10–11 are the backend (project column, then templates). Tasks 12–14 are the composer dialog, its elevation drawing, and the Inspector panel. Task 15 is the cocina catalog entry point. Task 16 retires the old fixed catalog entries. Task 17 is the final integration pass.

---

### Task 1: Recipe types and height resolution

**Files:**
- Create: `frontend/types/ovenTower.ts`, `frontend/services/ovenTower.ts`, `frontend/services/ovenTower.test.ts`

**Interfaces:**
- Consumes: `TOWER_MIN_SECTION_HEIGHT_CM` from `@/services/closetTower`.
- Produces: `OvenTowerContent`, `OvenTowerSection`, `OvenTowerRecipe` from `@/types/ovenTower`; `OVEN_TOWER_CONTENT_DEFAULTS: Record<OvenTowerContent, { heightCm: number; label: string }>`, `ovenSectionHeightCm(section): number`, `ovenSectionLabel(section): string`, `resolveOvenTowerHeights(recipe): OvenTowerResolution`, and the `OvenResolvedSection`/`OvenTowerResolution` types, all from `@/services/ovenTower`.

- [ ] **Step 1: Write the recipe types**

Create `frontend/types/ovenTower.ts`:

```ts
// An oven/microwave tower's recipe — the source of truth for a generated
// tower. Deliberately separate from types/closetTower.ts: an
// OvenTowerSection carries a full per-module `options` bag that is edited
// (and persisted) through the normal Inspector, unlike a closet
// TowerSection's small fixed vocabulary edited only in its own dialog. See
// docs/superpowers/specs/2026-09-15-oven-tower-design.md.
import type { ModuleOptions } from "@/types/kitchen";

export type OvenTowerContent = "puertas" | "cajones" | "abierto" | "horno" | "microondas";

export interface OvenTowerSection {
  id: string;
  content: OvenTowerContent;
  // Omitted = the content's typical height (see OVEN_TOWER_CONTENT_DEFAULTS).
  // Set = pinned, either by the seller typing an Alto in the composer or by
  // editing the generated module's own Alto in the normal Inspector.
  heightCm?: number;
  // Absorbs whatever height is left over. At most one per tower; none set
  // = the topmost section absorbs it instead.
  flex?: boolean;
  // Full per-section module options — hinge side, drawerSystem,
  // boardMaterial, color, shelves, doors, etc. Meaningless (left `{}`) for
  // "horno"/"microondas", which have no configurable fields. This is what
  // makes an Inspector edit on a generated section survive the tower's
  // next regeneration — see updateModule in store/useKitchenStore.ts.
  options: Partial<ModuleOptions>;
}

export interface OvenTowerRecipe {
  id: string;                    // also written to every generated module
  label: string;
  widthCm: number;
  depthCm: number;
  totalHeightCm: number;
  sections: OvenTowerSection[];   // bottom → top
  x: number;
  z: number;
  rotation: 0 | 90 | 180 | 270;
}
```

- [ ] **Step 2: Write the failing height-resolution tests**

Create `frontend/services/ovenTower.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveOvenTowerHeights, ovenSectionHeightCm, OVEN_TOWER_CONTENT_DEFAULTS } from "./ovenTower";
import type { OvenTowerRecipe, OvenTowerSection } from "@/types/ovenTower";

const section = (over: Partial<OvenTowerSection> & { id: string; content: OvenTowerSection["content"] }): OvenTowerSection => ({
  options: {},
  ...over,
});

const recipe = (over: Partial<OvenTowerRecipe> = {}): OvenTowerRecipe => ({
  id: "r1", label: "Torre", widthCm: 60, depthCm: 60, totalHeightCm: 240,
  sections: [section({ id: "a", content: "puertas" })],
  x: 0, z: 0, rotation: 0,
  ...over,
});

describe("ovenSectionHeightCm", () => {
  it("falls back to the content's typical height when none is pinned", () => {
    expect(ovenSectionHeightCm(section({ id: "a", content: "horno" }))).toBe(60);
    expect(ovenSectionHeightCm(section({ id: "b", content: "microondas" }))).toBe(38);
  });

  it("uses the pinned height when set", () => {
    expect(ovenSectionHeightCm(section({ id: "a", content: "puertas", heightCm: 72 }))).toBe(72);
  });
});

describe("resolveOvenTowerHeights", () => {
  it("rejects an empty tower", () => {
    const r = resolveOvenTowerHeights(recipe({ sections: [] }));
    expect(r.ok).toBe(false);
  });

  it("with no flex section, the topmost section absorbs the remainder", () => {
    const r = resolveOvenTowerHeights(recipe({
      totalHeightCm: 200,
      sections: [
        section({ id: "a", content: "horno" }),       // 60, fixed
        section({ id: "b", content: "puertas" }),      // flex by default -> 140
      ],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sections[0].heightCm).toBe(60);
    expect(r.sections[0].fromBottomCm).toBe(0);
    expect(r.sections[1].heightCm).toBe(140);
    expect(r.sections[1].fromBottomCm).toBe(60);
  });

  it("an explicit flex section absorbs the remainder even if it isn't topmost", () => {
    const r = resolveOvenTowerHeights(recipe({
      totalHeightCm: 200,
      sections: [
        section({ id: "a", content: "cajones", flex: true }),
        section({ id: "b", content: "horno" }), // 60, fixed
      ],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sections[0].heightCm).toBe(140);
    expect(r.sections[1].heightCm).toBe(60);
  });

  it("rejects more than one flex section", () => {
    const r = resolveOvenTowerHeights(recipe({
      sections: [
        section({ id: "a", content: "puertas", flex: true }),
        section({ id: "b", content: "cajones", flex: true }),
      ],
    }));
    expect(r.ok).toBe(false);
  });

  it("rejects a tower whose flex remainder would fall under the 15cm floor", () => {
    const r = resolveOvenTowerHeights(recipe({
      totalHeightCm: 130,
      sections: [
        section({ id: "a", content: "horno" }),   // 60
        section({ id: "b", content: "horno" }),   // 60
        section({ id: "c", content: "puertas" }), // flex -> 10, under the floor
      ],
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("15");
  });

  it("rejects a pinned section under the 15cm floor", () => {
    const r = resolveOvenTowerHeights(recipe({
      sections: [section({ id: "a", content: "puertas", heightCm: 10 })],
    }));
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `frontend/`: `npx vitest run services/ovenTower.test.ts`
Expected: FAIL — `services/ovenTower.ts` does not exist yet.

- [ ] **Step 4: Implement height resolution**

Create `frontend/services/ovenTower.ts`:

```ts
import { TOWER_MIN_SECTION_HEIGHT_CM } from "@/services/closetTower";
import type { OvenTowerContent, OvenTowerRecipe, OvenTowerSection } from "@/types/ovenTower";

export { TOWER_MIN_SECTION_HEIGHT_CM };

// Typical height per content — horno/microondas match DEFAULT_OPTIONS'
// ovenHeight/microwaveHeight (kitchenData.ts); the other three match a
// standard lower cabinet's own default height.
export const OVEN_TOWER_CONTENT_DEFAULTS: Record<OvenTowerContent, { heightCm: number; label: string }> = {
  puertas: { heightCm: 90, label: "Puertas" },
  cajones: { heightCm: 90, label: "Cajones" },
  abierto: { heightCm: 90, label: "Abierto" },
  horno: { heightCm: 60, label: "Horno" },
  microondas: { heightCm: 38, label: "Microondas" },
};

export function ovenSectionHeightCm(section: OvenTowerSection): number {
  return section.heightCm ?? OVEN_TOWER_CONTENT_DEFAULTS[section.content].heightCm;
}

export function ovenSectionLabel(section: OvenTowerSection): string {
  return OVEN_TOWER_CONTENT_DEFAULTS[section.content].label;
}

export interface OvenResolvedSection {
  section: OvenTowerSection;
  heightCm: number;
  fromBottomCm: number;
}

export type OvenTowerResolution =
  | { ok: true; sections: OvenResolvedSection[] }
  | { ok: false; error: string };

export function resolveOvenTowerHeights(recipe: OvenTowerRecipe): OvenTowerResolution {
  if (recipe.sections.length === 0) {
    return { ok: false, error: "La torre necesita al menos una sección." };
  }

  const flagged = recipe.sections.reduce<number[]>((acc, s, i) => (s.flex ? [...acc, i] : acc), []);
  if (flagged.length > 1) {
    return { ok: false, error: "Solo una sección puede ser flexible." };
  }
  const flexIndex = flagged.length === 1 ? flagged[0] : recipe.sections.length - 1;

  let fixedSum = 0;
  for (let i = 0; i < recipe.sections.length; i++) {
    if (i === flexIndex) continue;
    const h = ovenSectionHeightCm(recipe.sections[i]);
    if (h < TOWER_MIN_SECTION_HEIGHT_CM) {
      return { ok: false, error: `"${ovenSectionLabel(recipe.sections[i])}" no puede medir menos de ${TOWER_MIN_SECTION_HEIGHT_CM} cm.` };
    }
    fixedSum += h;
  }

  const flexHeight = recipe.totalHeightCm - fixedSum;
  if (flexHeight < TOWER_MIN_SECTION_HEIGHT_CM) {
    const label = ovenSectionLabel(recipe.sections[flexIndex]);
    return {
      ok: false,
      error: `No queda espacio para "${label}": necesita al menos ${TOWER_MIN_SECTION_HEIGHT_CM} cm y solo quedan ${Math.max(flexHeight, 0)} cm.`,
    };
  }

  const sections: OvenResolvedSection[] = [];
  let cursor = 0;
  for (let i = 0; i < recipe.sections.length; i++) {
    const heightCm = i === flexIndex ? flexHeight : ovenSectionHeightCm(recipe.sections[i]);
    sections.push({ section: recipe.sections[i], heightCm, fromBottomCm: cursor });
    cursor += heightCm;
  }

  return { ok: true, sections };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run from `frontend/`: `npx vitest run services/ovenTower.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/types/ovenTower.ts frontend/services/ovenTower.ts frontend/services/ovenTower.test.ts
git commit -m "Add oven tower recipe types and height resolution"
```

---

### Task 2: New catalog module types — `hueco_horno`/`hueco_microondas`

**Files:**
- Modify: `frontend/types/kitchen.ts`, `frontend/services/kitchenData.ts`, `frontend/services/kitchenData.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `"hueco_horno" | "hueco_microondas"` added to `TowerModuleType` (and thus `KitchenModuleType`) in `@/types/kitchen`; two new catalog entries in `KITCHEN_MODULE_CATALOG` (`services/kitchenData.ts`), each with `defaultOptions.includesCountertop: false`.

- [ ] **Step 1: Add the two module types**

In `frontend/types/kitchen.ts`, find:

```ts
export type TowerModuleType =
  | "torre_horno_microondas"
  | "torre_horno_empotrado"
  | "torre_despensa"
  | "torre_despensa_jalable"
  | "torre_refrigerador"
  | "torre_almacenamiento"
  | "librero_giratorio_espejo";
```

Replace with:

```ts
export type TowerModuleType =
  | "torre_horno_microondas"
  | "torre_horno_empotrado"
  | "torre_despensa"
  | "torre_despensa_jalable"
  | "torre_refrigerador"
  | "torre_almacenamiento"
  | "librero_giratorio_espejo"
  // Standalone oven/microwave niches — one per module, so an oven tower
  // (services/ovenTower.ts) can stack any number of either in any order.
  // Each is also a perfectly ordinary module on its own, outside a tower.
  | "hueco_horno"
  | "hueco_microondas";
```

- [ ] **Step 2: Write the failing catalog tests**

Append to `frontend/services/kitchenData.test.ts`:

```ts
import { getCatalogEntry } from "./kitchenData";

describe("hueco_horno / hueco_microondas catalog entries", () => {
  it("hueco_horno defaults to the oven's typical height and no countertop", () => {
    const entry = getCatalogEntry("hueco_horno");
    expect(entry).toBeDefined();
    expect(entry!.category).toBe("tower");
    expect(entry!.defaultDimensions.height).toBe(60);
    expect(entry!.defaultOptions.includesCountertop).toBe(false);
    expect(entry!.defaultOptions.doors).toBe(0);
  });

  it("hueco_microondas defaults to the microwave's typical height and no countertop", () => {
    const entry = getCatalogEntry("hueco_microondas");
    expect(entry).toBeDefined();
    expect(entry!.category).toBe("tower");
    expect(entry!.defaultDimensions.height).toBe(38);
    expect(entry!.defaultOptions.includesCountertop).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `frontend/`: `npx vitest run services/kitchenData.test.ts`
Expected: FAIL — `getCatalogEntry("hueco_horno")` returns `undefined`.

- [ ] **Step 4: Add the catalog entries**

In `frontend/services/kitchenData.ts`, find the `torre_horno_empotrado` entry (it ends just before the `torre_despensa` entry) and insert the two new entries immediately after it:

```ts
  {
    type: "hueco_horno",
    category: "tower",
    label: "Hueco para horno",
    description: "Nicho independiente para un horno empotrado — pieza de una torre configurable, o puede colocarse solo",
    icon: "🔥",
    defaultDimensions: { height: 60, width: 60, depth: 60 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 0, includesCountertop: false },
    configurableFields: ["height", "width", "depth", "boardMaterial", "color"],
  },
  {
    type: "hueco_microondas",
    category: "tower",
    label: "Hueco para microondas",
    description: "Nicho independiente para un microondas empotrado — pieza de una torre configurable, o puede colocarse solo",
    icon: "📻",
    defaultDimensions: { height: 38, width: 60, depth: 60 },
    defaultOptions: { drawers: 0, doors: 0, shelves: 0, includesCountertop: false },
    configurableFields: ["height", "width", "depth", "boardMaterial", "color"],
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run services/kitchenData.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors. Read the full output.

- [ ] **Step 7: Commit**

```bash
git add frontend/types/kitchen.ts frontend/services/kitchenData.ts frontend/services/kitchenData.test.ts
git commit -m "Add hueco_horno/hueco_microondas catalog entries"
```

---

### Task 3: Module generation

**Files:**
- Modify: `frontend/services/ovenTower.ts`, `frontend/services/ovenTower.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_OPTIONS`, `getCatalogEntry` from `@/services/kitchenData`; `KitchenModule`, `ModuleOptions`, `KitchenModuleType` from `@/types/kitchen`; `resolveOvenTowerHeights` (Task 1); the `hueco_horno`/`hueco_microondas` catalog entries (Task 2, just landed above).
- Produces: `generateOvenTowerModules(recipe): KitchenModule[]`, added to `@/services/ovenTower`.

- [ ] **Step 1: Write the failing generation tests**

Append to `frontend/services/ovenTower.test.ts`:

```ts
import { generateOvenTowerModules } from "./ovenTower";

describe("generateOvenTowerModules", () => {
  it("maps each content to its module type, bottom to top, with the tower's shared width/depth", () => {
    const mods = generateOvenTowerModules(recipe({
      widthCm: 60, depthCm: 60, totalHeightCm: 200, x: 10, z: 20, rotation: 90,
      sections: [
        section({ id: "a", content: "cajones" }),
        section({ id: "b", content: "horno" }),
        section({ id: "c", content: "puertas" }),
      ],
    }));

    expect(mods.map((m) => m.type)).toEqual(["gabinete_bajo_cajones", "hueco_horno", "gabinete_bajo_puertas"]);
    for (const m of mods) {
      expect(m.dimensions.width).toBe(60);
      expect(m.dimensions.depth).toBe(60);
      expect(m.x).toBe(10);
      expect(m.z).toBe(20);
      expect(m.rotation).toBe(90);
      expect(m.options.ovenTowerGroupId).toBe("r1");
    }
  });

  it("stacks mountHeight as the sum of every section below it", () => {
    const mods = generateOvenTowerModules(recipe({
      totalHeightCm: 200,
      sections: [
        section({ id: "a", content: "horno" }),       // 60cm, mountHeight 0
        section({ id: "b", content: "microondas" }),   // 38cm, mountHeight 60
        section({ id: "c", content: "puertas" }),      // flex, mountHeight 98
      ],
    }));
    expect(mods[0].options.mountHeight).toBe(0);
    expect(mods[1].options.mountHeight).toBe(60);
    expect(mods[2].options.mountHeight).toBe(98);
  });

  it("only the bottom-most section keeps its toe-kick", () => {
    const mods = generateOvenTowerModules(recipe({
      sections: [section({ id: "a", content: "puertas" }), section({ id: "b", content: "cajones" })],
    }));
    expect(mods[0].options.hasToeKick).toBe(true);
    expect(mods[1].options.hasToeKick).toBe(false);
  });

  it("returns an empty array for a tower that doesn't resolve", () => {
    expect(generateOvenTowerModules(recipe({ sections: [] }))).toEqual([]);
  });

  it("a section's own options merge onto the generated module, surviving alongside catalog defaults", () => {
    const mods = generateOvenTowerModules(recipe({
      sections: [section({ id: "a", content: "cajones", options: { drawerSystem: "corredera_push_to_open", color: "#123456" } })],
    }));
    expect(mods[0].options.drawerSystem).toBe("corredera_push_to_open");
    expect(mods[0].options.color).toBe("#123456");
    // Catalog default for gabinete_bajo_cajones still applies where the
    // section didn't override it.
    expect(mods[0].options.doorStyle).toBeDefined();
  });

  it("generated module ids are deterministic — recipe id + section id", () => {
    const mods = generateOvenTowerModules(recipe({
      id: "torreX",
      sections: [section({ id: "sec1", content: "puertas" })],
    }));
    expect(mods[0].id).toBe("torreX__sec1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run services/ovenTower.test.ts`
Expected: FAIL — `generateOvenTowerModules` is not exported yet.

- [ ] **Step 3: Implement the generator**

Append to `frontend/services/ovenTower.ts`:

```ts
import { DEFAULT_OPTIONS, getCatalogEntry } from "@/services/kitchenData";
import type { KitchenModule, KitchenModuleType, ModuleOptions } from "@/types/kitchen";

const OVEN_CONTENT_MODULE_TYPE: Record<OvenTowerContent, KitchenModuleType> = {
  puertas: "gabinete_bajo_puertas",
  cajones: "gabinete_bajo_cajones",
  abierto: "hueco_bajo_repisa",
  horno: "hueco_horno",
  microondas: "hueco_microondas",
};

// Turns a recipe into the modules that make it. Returns [] when the recipe
// doesn't resolve — callers validate with resolveOvenTowerHeights first and
// show its message; generating a half-tower is never the right answer.
export function generateOvenTowerModules(recipe: OvenTowerRecipe, opts?: Partial<ModuleOptions>): KitchenModule[] {
  const resolution = resolveOvenTowerHeights(recipe);
  if (!resolution.ok) return [];

  const finish: Partial<ModuleOptions> = opts ?? {};

  return resolution.sections.map(({ section, heightCm, fromBottomCm }) => {
    const type = OVEN_CONTENT_MODULE_TYPE[section.content];
    const entry = getCatalogEntry(type)!;
    return {
      // Deterministic, so a section keeps its module identity across
      // regenerations — an Inspector edit on it survives (see updateModule
      // in store/useKitchenStore.ts, which finds this same id to write the
      // edit back into section.options before regenerating).
      id: `${recipe.id}__${section.id}`,
      category: entry.category,
      type,
      label: `${ovenSectionLabel(section)} · ${recipe.label}`,
      dimensions: { height: heightCm, width: recipe.widthCm, depth: recipe.depthCm },
      x: recipe.x,
      z: recipe.z,
      rotation: recipe.rotation,
      options: {
        ...DEFAULT_OPTIONS,
        ...entry.defaultOptions,
        ...finish,
        ...section.options,
        mountHeight: fromBottomCm,
        // Only the section actually resting on the floor gets a zócalo —
        // everything stacked above it sits on the section below, not the
        // floor. Placed AFTER section.options so a stale saved value can't
        // reintroduce a floating toe-kick on a non-bottom section.
        hasToeKick: fromBottomCm === 0,
        ovenTowerGroupId: recipe.id,
      },
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run services/ovenTower.test.ts`
Expected: PASS, all tests in the file (including Task 1's height-resolution tests, still present above these).

- [ ] **Step 5: Commit**

```bash
git add frontend/services/ovenTower.ts frontend/services/ovenTower.test.ts
git commit -m "Add oven tower module generation"
```

---

### Task 4: Placement (collision avoidance against other oven towers)

**Files:**
- Modify: `frontend/services/ovenTower.ts`, `frontend/services/ovenTower.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `placeNewOvenTower(towers, widthCm, depthCm, rotation, roomWidth, roomDepth): OvenTowerPlacement`, `OvenTowerPlacementKind`, added to `@/services/ovenTower`.

**Background.** Straight port of `services/closetTower.ts`'s placement section (`clampTowerPosition`/`overlapsAnyTower`/`besideCandidates`/`findFreeGap`/`placeNewTower`), renamed and typed against `OvenTowerRecipe` instead of `TowerRecipe`, checked only against `draft.ovenTowers` (an oven tower has no reason to specifically avoid a closet tower any more than any other hand-placed module already doesn't).

- [ ] **Step 1: Write the failing placement tests**

Append to `frontend/services/ovenTower.test.ts`:

```ts
import { placeNewOvenTower } from "./ovenTower";

describe("placeNewOvenTower", () => {
  it("the first tower in an empty room goes at the room's centre", () => {
    const p = placeNewOvenTower([], 60, 60, 0, 400, 300);
    expect(p.kind).toBe("besideNeighbour");
    expect(p.x).toBe(200);
    expect(p.z).toBe(150);
  });

  it("a second tower lands flush beside the first", () => {
    const first = recipe({ id: "t1", widthCm: 60, x: 200, z: 150, rotation: 0 });
    const p = placeNewOvenTower([first], 60, 60, 0, 400, 300);
    expect(p.kind).toBe("besideNeighbour");
    expect(p.x).toBe(260); // 200 + (60+60)/2
    expect(p.z).toBe(150);
  });

  it("falls back to a free gap when neither side of every tower is open", () => {
    // Two towers already flush against both room edges along X, at z=150 —
    // nothing beside them is free, and the room's centre already coincides
    // with one of them, so this must find open floor elsewhere in the room.
    const left = recipe({ id: "t1", widthCm: 400, x: 200, z: 150, rotation: 0 });
    const p = placeNewOvenTower([left], 60, 60, 0, 400, 300);
    expect(["freeGap", "roomCentre", "noSpaceFound"]).toContain(p.kind);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run services/ovenTower.test.ts`
Expected: FAIL — `placeNewOvenTower` is not exported yet.

- [ ] **Step 3: Implement placement**

Append to `frontend/services/ovenTower.ts`:

```ts
function alongIsX(rotation: OvenTowerRecipe["rotation"]): boolean {
  return !(rotation === 90 || rotation === 270);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), Math.max(min, max));
}

export function clampOvenTowerPosition(
  x: number, z: number, widthCm: number, depthCm: number,
  rotation: OvenTowerRecipe["rotation"], roomWidth: number, roomDepth: number,
): { x: number; z: number } {
  const alongX = alongIsX(rotation);
  const halfWidth = widthCm / 2;
  const halfDepth = depthCm / 2;
  return alongX
    ? { x: clamp(x, halfWidth, roomWidth - halfWidth), z: clamp(z, halfDepth, roomDepth - halfDepth) }
    : { x: clamp(x, halfDepth, roomWidth - halfDepth), z: clamp(z, halfWidth, roomDepth - halfWidth) };
}

interface OvenFootprintBox { minX: number; maxX: number; minZ: number; maxZ: number }

function ovenTowerFootprint(t: { x: number; z: number; widthCm: number; depthCm: number; rotation: OvenTowerRecipe["rotation"] }): OvenFootprintBox {
  const alongX = alongIsX(t.rotation);
  const halfW = (alongX ? t.widthCm : t.depthCm) / 2;
  const halfD = (alongX ? t.depthCm : t.widthCm) / 2;
  return { minX: t.x - halfW, maxX: t.x + halfW, minZ: t.z - halfD, maxZ: t.z + halfD };
}

const OVEN_PLACEMENT_TOLERANCE_CM = 1;

function ovenBoxesOverlap(a: OvenFootprintBox, b: OvenFootprintBox): boolean {
  return (
    a.minX < b.maxX - OVEN_PLACEMENT_TOLERANCE_CM &&
    a.maxX > b.minX + OVEN_PLACEMENT_TOLERANCE_CM &&
    a.minZ < b.maxZ - OVEN_PLACEMENT_TOLERANCE_CM &&
    a.maxZ > b.minZ + OVEN_PLACEMENT_TOLERANCE_CM
  );
}

function overlapsAnyOvenTower(
  candidate: { x: number; z: number; widthCm: number; depthCm: number; rotation: OvenTowerRecipe["rotation"] },
  towers: OvenTowerRecipe[],
): boolean {
  const box = ovenTowerFootprint(candidate);
  return towers.some((t) => ovenBoxesOverlap(box, ovenTowerFootprint(t)));
}

export type OvenTowerPlacementKind = "besideNeighbour" | "roomCentre" | "freeGap" | "noSpaceFound";
export interface OvenTowerPlacement { x: number; z: number; kind: OvenTowerPlacementKind }

function ovenBesideCandidates(
  t: OvenTowerRecipe, widthCm: number, depthCm: number, rotation: OvenTowerRecipe["rotation"],
): { x: number; z: number }[] {
  const alongX = alongIsX(rotation);
  const gap = (t.widthCm + widthCm) / 2;
  return [gap, -gap].map((proposal) =>
    alongX ? { x: t.x + proposal, z: t.z } : { x: t.x, z: t.z + proposal },
  );
}

const OVEN_FREE_GAP_STEP_CM = 20;

function findOvenFreeGap(
  widthCm: number, depthCm: number, rotation: OvenTowerRecipe["rotation"],
  towers: OvenTowerRecipe[], roomWidth: number, roomDepth: number,
): { x: number; z: number } | null {
  const alongX = alongIsX(rotation);
  const halfW = (alongX ? widthCm : depthCm) / 2;
  const halfD = (alongX ? depthCm : widthCm) / 2;
  if (halfW * 2 > roomWidth || halfD * 2 > roomDepth) return null;
  for (let z = halfD; z <= roomDepth - halfD; z += OVEN_FREE_GAP_STEP_CM) {
    for (let x = halfW; x <= roomWidth - halfW; x += OVEN_FREE_GAP_STEP_CM) {
      if (!overlapsAnyOvenTower({ x, z, widthCm, depthCm, rotation }, towers)) return { x, z };
    }
  }
  return null;
}

// Where a brand-new oven tower lands: flush beside whichever existing oven
// tower offers a genuinely free spot (last placed tried first), then the
// room's centre, then any free gap, then the centre again (flagged) if the
// room turns out to have no space at all. Mirrors placeNewTower in
// services/closetTower.ts exactly — see that function for the full
// rationale; kept as its own copy rather than a shared helper because the
// two recipe shapes differ and a shared generic would need to be
// parameterized over both anyway.
export function placeNewOvenTower(
  towers: OvenTowerRecipe[], widthCm: number, depthCm: number, rotation: OvenTowerRecipe["rotation"],
  roomWidth: number, roomDepth: number,
): OvenTowerPlacement {
  if (towers.length === 0) {
    return { ...clampOvenTowerPosition(roomWidth / 2, roomDepth / 2, widthCm, depthCm, rotation, roomWidth, roomDepth), kind: "besideNeighbour" };
  }

  const last = towers[towers.length - 1];
  const ordered = [last, ...towers.filter((t) => t !== last)];

  for (const anchor of ordered) {
    for (const candidate of ovenBesideCandidates(anchor, widthCm, depthCm, rotation)) {
      const landed = clampOvenTowerPosition(candidate.x, candidate.z, widthCm, depthCm, rotation, roomWidth, roomDepth);
      if (Math.abs(landed.x - candidate.x) > 0.01 || Math.abs(landed.z - candidate.z) > 0.01) continue;
      if (overlapsAnyOvenTower({ ...landed, widthCm, depthCm, rotation }, towers)) continue;
      return { ...landed, kind: "besideNeighbour" };
    }
  }

  const centre = clampOvenTowerPosition(roomWidth / 2, roomDepth / 2, widthCm, depthCm, rotation, roomWidth, roomDepth);
  if (!overlapsAnyOvenTower({ ...centre, widthCm, depthCm, rotation }, towers)) {
    return { ...centre, kind: "roomCentre" };
  }

  const gap = findOvenFreeGap(widthCm, depthCm, rotation, towers, roomWidth, roomDepth);
  if (gap) return { ...gap, kind: "freeGap" };

  return { ...centre, kind: "noSpaceFound" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run services/ovenTower.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the full frontend suite to check nothing else broke**

Run: `npm test` (from `frontend/`)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/services/ovenTower.ts frontend/services/ovenTower.test.ts
git commit -m "Add oven tower placement/collision avoidance"
```

---

### Task 5: 3D meshes for the two new niche types

**Files:**
- Modify: `frontend/components/3d/ModulePreview3D.tsx`

**Interfaces:**
- Consumes: nothing new (uses existing `Carcass`, `ToeKick`, `SideFiller`, `TopFiller`, `getFinishTexture`, `getFinishRoughness`, `T` already in this file).
- Produces: `OvenNicheFront`/`MicrowaveNicheFront` now `export`ed; `CabinetMesh` renders `hueco_horno`/`hueco_microondas`.

- [ ] **Step 1: Export the two existing niche-front components**

In `frontend/components/3d/ModulePreview3D.tsx`, change:

```ts
function OvenNicheFront({ W, D, toeKick, fromBottomCm, heightCm, wireframe = false }: {
```
to:
```ts
export function OvenNicheFront({ W, D, toeKick, fromBottomCm, heightCm, wireframe = false }: {
```

and change:
```ts
function MicrowaveNicheFront({ W, D, toeKick, fromBottomCm, heightCm, wireframe = false }: {
```
to:
```ts
export function MicrowaveNicheFront({ W, D, toeKick, fromBottomCm, heightCm, wireframe = false }: {
```

- [ ] **Step 2: Add the two standalone niche meshes**

Immediately above the `CabinetMesh` function (search for `export function CabinetMesh`), add:

```ts
// ─── Standalone oven/microwave niche — one appliance front filling the
// whole module, no doors/drawers/shelves of its own. Built from the exact
// same reusable pieces (Carcass/fillers/toe-kick) every lower/tower cabinet
// uses, so it costs and finishes identically to one; only the front is
// different. Used both standalone (a seller can drop one on its own) and
// as an oven-tower section (see services/ovenTower.ts).
function ApplianceNicheMesh({ module, wireframe = false, front }: {
  module: KitchenModule; wireframe?: boolean;
  front: (args: { W: number; D: number; toeKick: number; heightCm: number; wireframe: boolean }) => React.ReactNode;
}) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const color = module.options.color || "#d4c5b0";
  const exteriorColor = module.options.exteriorColor || color;
  const exteriorMap = getFinishTexture(module.options.exteriorTexture);
  const exteriorRoughness = getFinishRoughness(module.options.exteriorTexture);
  const toeKick = module.options.hasToeKick ? module.options.toeKickHeight / 100 : 0;
  const topMarginH = TOP_FACE_MARGIN_CM / 100;
  const facesTop = Math.max(H - topMarginH, toeKick);

  return (
    <group>
      <Carcass W={W} H={H} D={D} color={color} leftColor={exteriorColor} rightColor={exteriorColor} leftMap={exteriorMap} rightMap={exteriorMap} topBottomColor={color} wireframe={wireframe} />
      {front({ W, D, toeKick, heightCm: module.dimensions.height - module.options.toeKickHeight * (module.options.hasToeKick ? 1 : 0), wireframe })}
      <TopFiller W={W} D={D} yCenter={facesTop + topMarginH / 2} marginH={topMarginH} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      <ToeKick W={W} D={D} height={toeKick} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} />
    </group>
  );
}

function HuecoHornoMesh({ module, wireframe = false }: { module: KitchenModule; wireframe?: boolean }) {
  return (
    <ApplianceNicheMesh
      module={module}
      wireframe={wireframe}
      front={({ W, D, toeKick, heightCm, wireframe: wf }) => (
        <OvenNicheFront W={W} D={D} toeKick={toeKick} fromBottomCm={0} heightCm={heightCm} wireframe={wf} />
      )}
    />
  );
}

function HuecoMicroondasMesh({ module, wireframe = false }: { module: KitchenModule; wireframe?: boolean }) {
  return (
    <ApplianceNicheMesh
      module={module}
      wireframe={wireframe}
      front={({ W, D, toeKick, heightCm, wireframe: wf }) => (
        <MicrowaveNicheFront W={W} D={D} toeKick={toeKick} fromBottomCm={0} heightCm={heightCm} wireframe={wf} />
      )}
    />
  );
}
```

- [ ] **Step 3: Dispatch to them from `CabinetMesh`**

In `frontend/components/3d/ModulePreview3D.tsx`, find the `torre_horno_microondas`/`torre_horno_empotrado` branch inside `CabinetMesh` (~line 2615) and add immediately after it:

```ts
  // Standalone oven/microwave niche — see HuecoHornoMesh/HuecoMicroondasMesh
  // above. Used both standalone and as an oven-tower section.
  if (module.type === "hueco_horno") {
    return <HuecoHornoMesh module={module} wireframe={wireframe} />;
  }
  if (module.type === "hueco_microondas") {
    return <HuecoMicroondasMesh module={module} wireframe={wireframe} />;
  }
```

- [ ] **Step 4: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors. Read the full output.

- [ ] **Step 5: Manual verification**

Run the dev server (`npm run dev` from `frontend/`), open a Cocina project, use the module selector's search to add a "Hueco para horno" and a "Hueco para microondas" directly (not through a tower yet — that comes in Task 12). Confirm each renders as a cabinet-shaped niche with the oven/microwave front graphic filling its whole face, sits on the floor with a toe-kick, and its Materiales tab lets you change color/board material like any other module.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/3d/ModulePreview3D.tsx
git commit -m "Add standalone hueco_horno/hueco_microondas meshes"
```

---

### Task 6: Store — `draft.ovenTowers` and its CRUD actions

**Files:**
- Modify: `frontend/types/kitchen.ts`, `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `generateOvenTowerModules` (Task 3), `OvenTowerRecipe` (Task 1).
- Produces: `KitchenDraft.ovenTowers: OvenTowerRecipe[]`; `ModuleOptions.ovenTowerGroupId?: string`; store actions `addOvenTower(recipe)`, `updateOvenTower(recipe)`, `removeOvenTower(id)`; internal `applyOvenTowers(s, towers)` helper (not exported from the store, mirrors `applyTowers`'s own visibility).

- [ ] **Step 1: Add the two new fields to `types/kitchen.ts`**

Find `towerRunIds?: string[];` inside the `ModuleOptions` interface and add immediately after it:

```ts
  // The oven/microwave tower this module was generated from (see
  // services/ovenTower.ts) — a SEPARATE key from towerGroupId, which
  // belongs exclusively to the closet tower system. A module carries at
  // most one of the two, never both. Absent on every hand-placed module.
  ovenTowerGroupId?: string;
```

Find `towers: TowerRecipe[];` inside `KitchenDraft` and add immediately after it:

```ts
  // Oven/microwave tower recipes — the source of truth the generated
  // modules are rebuilt from. See types/ovenTower.ts. Independent of
  // `towers` (closet) — the two systems never interact.
  ovenTowers: OvenTowerRecipe[];
```

Add the import at the top of the file, alongside the existing `TowerRecipe` import:

```ts
import type { OvenTowerRecipe } from "@/types/ovenTower";
```

(Check the existing import line for `TowerRecipe` — likely `import type { TowerRecipe } from "@/types/closetTower";` near the top — add the new import right after it, same style.)

- [ ] **Step 2: Wire the store's state, actions, and `applyOvenTowers`**

In `frontend/store/useKitchenStore.ts`:

Add to the imports (alongside the existing `generateAllTowerModules` import):
```ts
import { generateOvenTowerModules } from "@/services/ovenTower";
import type { OvenTowerRecipe } from "@/types/ovenTower";
```

In `initialDraft`, add `ovenTowers: [],` right after `towers: [],`.

After the `applyTowers` function, add:

```ts
// Every oven-tower change regenerates every oven tower's modules — same
// "the recipe is the source of truth, modules are rebuilt from it"
// approach as applyTowers, but scoped to ovenTowerGroupId so the two
// systems never touch each other's modules.
function applyOvenTowers(s: { draft: KitchenDraft; defaultFloorBoardMaterial?: string | null }, ovenTowers: OvenTowerRecipe[]) {
  const handPlaced = s.draft.modules.filter((m) => !m.options.ovenTowerGroupId);
  const finish: Partial<ModuleOptions> = {
    ...(s.draft.modules[0] ? pickGlobalMaterial(s.draft.modules[0].options) : {}),
    ...(s.defaultFloorBoardMaterial ? { boardMaterial: s.defaultFloorBoardMaterial } : {}),
  };
  return {
    draft: { ...s.draft, ovenTowers, modules: [...handPlaced, ...ovenTowers.flatMap((t) => generateOvenTowerModules(t, finish))] },
    undoStack: [],
    redoStack: [],
  };
}
```

Add to the store's type interface (find `updateSharedMaletero: (runIds: string[], patch: Partial<TowerMaletero>) => void;` and add after it):

```ts
  addOvenTower: (recipe: OvenTowerRecipe) => void;
  updateOvenTower: (recipe: OvenTowerRecipe) => void;
  removeOvenTower: (towerId: string) => void;
```

After the `updateSharedMaletero` action implementation (before `toggleModuleLock`), add:

```ts
      // ── Oven tower actions ──────────────────────────────────────────────
      addOvenTower: (recipe) =>
        set((s) => applyOvenTowers(s, [...s.draft.ovenTowers, recipe])),

      updateOvenTower: (recipe) =>
        set((s) => applyOvenTowers(s, s.draft.ovenTowers.map((t) => (t.id === recipe.id ? recipe : t)))),

      removeOvenTower: (towerId) =>
        set((s) => applyOvenTowers(s, s.draft.ovenTowers.filter((t) => t.id !== towerId))),

```

- [ ] **Step 3: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors (the store's type interface must be fully implemented, or TypeScript will flag the missing methods). Read the full output.

- [ ] **Step 4: Manual verification**

In the browser console on an open Cocina project (dev server running), run:
```js
useKitchenStore.getState().addOvenTower({ id: "test1", label: "Prueba", widthCm: 60, depthCm: 60, totalHeightCm: 200, sections: [{ id: "a", content: "horno", options: {} }, { id: "b", content: "puertas", options: {} }], x: 100, z: 100, rotation: 0 });
```
Confirm two new modules appear in the 3D view stacked at x=100,z=100 — a `hueco_horno` at the bottom, a `gabinete_bajo_puertas` on top of it. Then run `useKitchenStore.getState().removeOvenTower("test1")` and confirm both disappear.

- [ ] **Step 5: Commit**

```bash
git add frontend/types/kitchen.ts frontend/store/useKitchenStore.ts
git commit -m "Wire draft.ovenTowers and its store actions"
```

---

### Task 7: Store — editing a generated section writes back into the recipe

**Files:**
- Modify: `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `applyOvenTowers` (Task 6).
- Produces: nothing new exported — this task changes the BEHAVIOR of the existing `updateModule`, `updateModulePosition` and `removeModule` actions for any module carrying `ovenTowerGroupId`.

**Background.** This is the mechanism the spec's §3 calls out as the actual novel part: `updateModule`/`updateModulePosition` today patch `s.draft.modules` directly with no notion of tower lineage (closet's own tower sections never reach this code path because `ModuleInspector`'s `GeneratedTowerPanel` never renders the fields that would call it — see Task 13). An oven-tower section's fields DO stay visible, so this store-level interception is what makes an edit survive the tower regenerating when another section changes.

- [ ] **Step 1: Add the write-back branch to `updateModule`**

Find `updateModule: (id, patch) =>` in `frontend/store/useKitchenStore.ts` (the implementation reads `existing`, builds `updated`, then returns the new `draft.modules`). Replace its body with:

```ts
      updateModule: (id, patch) =>
        set((s) => {
          const existing = s.draft.modules.find((m) => m.id === id);
          if (!existing || existing.options.locked) return {};

          // A generated oven-tower section: its own options/height must
          // persist into the recipe (see services/ovenTower.ts), or the
          // next unrelated edit anywhere in the tower would regenerate
          // this section back to its catalog defaults. Width/depth/x/z/
          // rotation belong to the whole tower, not one section — ignored
          // here; they're edited via updateOvenTower from the composer.
          const ovenGroupId = existing.options.ovenTowerGroupId;
          if (ovenGroupId) {
            const recipe = s.draft.ovenTowers.find((t) => t.id === ovenGroupId);
            if (!recipe) return {};
            const sectionId = id.slice(ovenGroupId.length + 2); // strip "${groupId}__"
            const patchedRecipe = {
              ...recipe,
              sections: recipe.sections.map((sec) =>
                sec.id === sectionId
                  ? {
                      ...sec,
                      options: patch.options ? { ...sec.options, ...patch.options } : sec.options,
                      // Editing Alto pins the section — same semantics as
                      // typing a height in the tower composer.
                      heightCm: patch.dimensions?.height ?? sec.heightCm,
                    }
                  : sec,
              ),
            };
            return applyOvenTowers(s, s.draft.ovenTowers.map((t) => (t.id === ovenGroupId ? patchedRecipe : t)));
          }

          const updated: KitchenModule = {
            ...existing, ...patch,
            dimensions: patch.dimensions ? { ...existing.dimensions, ...patch.dimensions } : existing.dimensions,
            options: patch.options ? { ...existing.options, ...patch.options } : existing.options,
          };
          return {
            draft: {
              ...s.draft,
              modules: s.draft.modules.map((m) => (m.id === id ? updated : m)),
            },
            undoStack: pushUndoEntry(s.undoStack, existing, updated),
            redoStack: [],
          };
        }),
```

- [ ] **Step 2: Add the same guard to `updateModulePosition`**

Find `updateModulePosition: (id, x, z, rotation, mountHeightCm, islandMode) =>` and, right after the existing `towerRole === "maletero"` guard (closet-specific) and the closet `groupId` branch, add an oven-tower equivalent. The function already looks like:

```ts
      updateModulePosition: (id, x, z, rotation, mountHeightCm, islandMode) =>
        set((s) => {
          const current = s.draft.modules.find((m) => m.id === id);
          if (!current || current.options.locked) return {};
          if (current.options.towerRole === "maletero") {
            toast(`"${current.label}" sigue a sus torres`, {
              description: "Mueve una de las torres del conjunto para reubicar el maletero.",
              duration: 2200,
            });
            return {};
          }
          const groupId = current.options.towerGroupId;
          if (groupId) {
            return applyTowers(
              s,
              s.draft.towers.map((t) =>
                t.id === groupId ? { ...t, x, z, rotation: rotation ?? t.rotation } : t,
              ),
            );
          }
          // ... existing hand-placed-module logic continues below
```

Insert a new branch between the `towerRole === "maletero"` check and the closet `groupId` check:

```ts
          const ovenGroupId = current.options.ovenTowerGroupId;
          if (ovenGroupId) {
            return applyOvenTowers(
              s,
              s.draft.ovenTowers.map((t) =>
                t.id === ovenGroupId ? { ...t, x, z, rotation: rotation ?? t.rotation } : t,
              ),
            );
          }
```

- [ ] **Step 3: Add the removal branch to `removeModule`**

Find `removeModule: (id) =>` and, right after the closet `towerGroupId` block closes (the `return applyTowers(s, s.draft.towers.filter(...))` line, before the final fallback `return { draft: { ...s.draft, modules: s.draft.modules.filter(...) } }`), add:

```ts
          // A generated oven-tower section: remove just this ONE section
          // and regenerate the rest — unlike closet ("half a tower is not
          // a thing"), an oven tower's sections are independent enough
          // (each is a real, separately-configured cabinet) that removing
          // one is a normal edit, not a reason to delete the whole tower.
          // If that empties the recipe, drop the recipe too — nothing left
          // to generate.
          if (existing.options.ovenTowerGroupId) {
            const groupId = existing.options.ovenTowerGroupId;
            const sectionId = id.slice(groupId.length + 2);
            const recipe = s.draft.ovenTowers.find((t) => t.id === groupId);
            if (!recipe) return {};
            const remainingSections = recipe.sections.filter((sec) => sec.id !== sectionId);
            return applyOvenTowers(
              s,
              remainingSections.length === 0
                ? s.draft.ovenTowers.filter((t) => t.id !== groupId)
                : s.draft.ovenTowers.map((t) => (t.id === groupId ? { ...t, sections: remainingSections } : t)),
            );
          }
```

- [ ] **Step 4: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors. Read the full output.

- [ ] **Step 5: Manual verification**

Using the same console-driven tower from Task 6's Step 4 (recreate it if needed), select the generated `gabinete_bajo_puertas` module in the 3D view, open its Inspector, change its color and toggle a door setting — confirm the change shows immediately. Then run `useKitchenStore.getState().updateOvenTower({ ...useKitchenStore.getState().draft.ovenTowers[0], sections: [...useKitchenStore.getState().draft.ovenTowers[0].sections, { id: "c", content: "cajones", options: {} }] })` (adds a third section) and confirm the door module's color/door edit is STILL there after this unrelated regeneration. Then remove just the `puertas` section via `removeModule` on its id and confirm only that one module disappears, not the whole tower.

- [ ] **Step 6: Commit**

```bash
git add frontend/store/useKitchenStore.ts
git commit -m "Persist oven-tower section edits back into the recipe"
```

---

### Task 8: Template conversion (`lib/ovenTowerTemplate.ts`)

**Files:**
- Create: `frontend/lib/ovenTowerTemplate.ts`, `frontend/lib/ovenTowerTemplate.test.ts`

**Interfaces:**
- Consumes: `OvenTowerRecipe` (Task 1).
- Produces: `OvenTowerTemplateRecipe` (= `Omit<OvenTowerRecipe, "id"|"x"|"z"|"rotation">`), `recipeToTemplate(recipe)`, `templateToRecipe(template, newId, sectionId)`.

- [ ] **Step 1: Write the failing conversion tests**

Create `frontend/lib/ovenTowerTemplate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recipeToTemplate, templateToRecipe } from "./ovenTowerTemplate";
import type { OvenTowerRecipe } from "@/types/ovenTower";

const recipe: OvenTowerRecipe = {
  id: "r1", label: "Torre", widthCm: 60, depthCm: 60, totalHeightCm: 200,
  sections: [
    { id: "a", content: "horno", options: { color: "#111" } },
    { id: "b", content: "puertas", heightCm: 140, options: {} },
  ],
  x: 100, z: 50, rotation: 90,
};

describe("recipeToTemplate", () => {
  it("drops id/x/z/rotation, keeps everything else, and clones sections", () => {
    const t = recipeToTemplate(recipe);
    expect(t).not.toHaveProperty("id");
    expect(t).not.toHaveProperty("x");
    expect(t.label).toBe("Torre");
    expect(t.sections).toHaveLength(2);
    expect(t.sections[0].options.color).toBe("#111");

    // Cloned, not aliased — mutating the source recipe afterward must not
    // reach the template.
    recipe.sections[0].options.color = "#999";
    expect(t.sections[0].options.color).toBe("#111");
  });
});

describe("templateToRecipe", () => {
  it("assigns a new id, fresh section ids, and lands unplaced", () => {
    const t = recipeToTemplate(recipe);
    const rebuilt = templateToRecipe(t, "new-id", (i) => `sec-${i}`);
    expect(rebuilt.id).toBe("new-id");
    expect(rebuilt.sections.map((s) => s.id)).toEqual(["sec-0", "sec-1"]);
    expect(rebuilt.sections[1].heightCm).toBe(140);
    expect(rebuilt.x).toBe(0);
    expect(rebuilt.z).toBe(0);
    expect(rebuilt.rotation).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ovenTowerTemplate.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the conversion**

Create `frontend/lib/ovenTowerTemplate.ts`:

```ts
import type { OvenTowerRecipe, OvenTowerSection } from "@/types/ovenTower";

// A template is an oven tower's shape without its identity or its place in
// a room. Two towers built from one template are different towers; only
// the furniture is shared. Mirrors lib/towerTemplate.ts (closet).
export type OvenTowerTemplateRecipe = Omit<OvenTowerRecipe, "id" | "x" | "z" | "rotation">;

export function recipeToTemplate(recipe: OvenTowerRecipe): OvenTowerTemplateRecipe {
  return {
    label: recipe.label,
    widthCm: recipe.widthCm,
    depthCm: recipe.depthCm,
    totalHeightCm: recipe.totalHeightCm,
    // Cloned, not aliased — a template outlives the tower it was starred
    // from, and editing that tower afterwards must not rewrite the template.
    sections: recipe.sections.map((s) => ({ ...s, options: { ...s.options } })),
  };
}

export function templateToRecipe(
  template: OvenTowerTemplateRecipe,
  newId: string,
  sectionId: (index: number) => string,
): OvenTowerRecipe {
  return {
    id: newId,
    label: template.label,
    widthCm: template.widthCm,
    depthCm: template.depthCm,
    totalHeightCm: template.totalHeightCm,
    // Fresh ids per section: generated module ids are derived from
    // `${recipe.id}__${section.id}`, so two towers from one template would
    // otherwise collide on every module id.
    sections: template.sections.map((s: OvenTowerSection, i) => ({ ...s, id: sectionId(i), options: { ...s.options } })),
    // Unplaced. The caller positions it — the dialog does this so a
    // template lands beside the last tower exactly like a hand-built one.
    x: 0,
    z: 0,
    rotation: 0,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/ovenTowerTemplate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/ovenTowerTemplate.ts frontend/lib/ovenTowerTemplate.test.ts
git commit -m "Add oven tower template conversion"
```

---

### Task 9: Frontend API client — oven tower templates + project round-trip

**Files:**
- Modify: `frontend/services/api.ts`

**Interfaces:**
- Consumes: `OvenTowerRecipe` (Task 1), `OvenTowerTemplateRecipe` (Task 8).
- Produces: `OvenTowerTemplate` type, `listOvenTowerTemplates()`, `createOvenTowerTemplate(name, recipe)`, `deleteOvenTowerTemplate(id)`; `KitchenDraft.ovenTowers` now round-trips through `mapKitchenPayload`/`mapKitchenResponseToDraft`.

- [ ] **Step 1: Add the import and the backend project field**

At the top of `frontend/services/api.ts`, alongside `import type { TowerTemplateRecipe } from "@/lib/towerTemplate";`, add:
```ts
import type { OvenTowerTemplateRecipe } from "@/lib/ovenTowerTemplate";
import type { OvenTowerRecipe } from "@/types/ovenTower";
```

In `interface BackendKitchenProject`, add right after `towers: TowerRecipe[] | null;`:
```ts
  oven_towers: OvenTowerRecipe[] | null;
```

- [ ] **Step 2: Round-trip through the draft mappers**

In `mapKitchenPayload`, add right after `towers: draft.towers,`:
```ts
    oven_towers: draft.ovenTowers,
```

In `mapKitchenResponseToDraft`, add right after `towers: json.towers ?? [],`:
```ts
    ovenTowers: json.oven_towers ?? [],
```

- [ ] **Step 3: Add the template CRUD client**

Find the "─── Closet Tower Templates ───" section (interfaces `BackendTowerTemplate`/`TowerTemplate`, `mapTowerTemplate`, `listTowerTemplates`/`createTowerTemplate`/`deleteTowerTemplate`). Immediately after that whole section, add its oven-tower counterpart:

```ts
// ─── Oven Tower Templates ─────────────────────────────────────────────────
interface BackendOvenTowerTemplate {
  id: number;
  name: string;
  recipe: OvenTowerTemplateRecipe;
  user?: { id: number; name: string } | null;
  can_delete: boolean;
}

export interface OvenTowerTemplate {
  id: number;
  name: string;
  recipe: OvenTowerTemplateRecipe;
  ownerName: string;
  canDelete: boolean;
}

function mapOvenTowerTemplate(t: BackendOvenTowerTemplate): OvenTowerTemplate {
  return {
    id: t.id,
    name: t.name,
    recipe: t.recipe,
    ownerName: t.user?.name ?? "—",
    canDelete: t.can_delete ?? false,
  };
}

export async function listOvenTowerTemplates(): Promise<OvenTowerTemplate[]> {
  const rows = await http.get<BackendOvenTowerTemplate[]>("/oven-tower-templates");
  return rows.map(mapOvenTowerTemplate);
}

export async function createOvenTowerTemplate(name: string, recipe: OvenTowerTemplateRecipe): Promise<OvenTowerTemplate> {
  const created = await http.post<BackendOvenTowerTemplate>("/oven-tower-templates", { name, recipe });
  return mapOvenTowerTemplate(created);
}

export async function deleteOvenTowerTemplate(id: number): Promise<void> {
  await http.delete(`/oven-tower-templates/${id}`);
}
```

- [ ] **Step 4: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors (this will fail until Task 6's `KitchenDraft.ovenTowers` field exists — Task 6 must land before this task, which the plan's ordering already guarantees). Read the full output.

- [ ] **Step 5: Commit**

```bash
git add frontend/services/api.ts
git commit -m "Add oven tower template API client and project round-trip"
```

---

### Task 10: Backend — `oven_towers` project column

**Files:**
- Create: `backend/database/migrations/2026_09_16_120000_add_oven_towers_to_kitchen_projects.php`, `backend/tests/Feature/KitchenProjectOvenTowersTest.php`
- Modify: `backend/app/Models/KitchenProject.php`, `backend/app/Http/Controllers/KitchenProjectController.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `kitchen_projects.oven_towers` (nullable json, cast to array, defaults to `[]`), persisted by `KitchenProjectController::store`/`update`.

- [ ] **Step 1: Write the migration**

Create `backend/database/migrations/2026_09_16_120000_add_oven_towers_to_kitchen_projects.php`:

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
            // Oven/microwave tower recipes — the source of truth the
            // generated modules are rebuilt from. Same shape of column as
            // `towers` (closet), deliberately its own field: the two tower
            // systems never share a recipe.
            $table->json('oven_towers')->nullable()->after('towers');
        });

        DB::table('kitchen_projects')->whereNull('oven_towers')->update(['oven_towers' => '[]']);
    }

    public function down(): void
    {
        Schema::table('kitchen_projects', function (Blueprint $table) {
            $table->dropColumn('oven_towers');
        });
    }
};
```

- [ ] **Step 2: Update the model**

In `backend/app/Models/KitchenProject.php`, add `'oven_towers' => '[]',` to `$attributes` (after `'towers' => '[]',`), add `'oven_towers',` to `$fillable` (after `'towers',`), and add `'oven_towers' => 'array',` to `$casts` (after `'towers' => 'array',`).

- [ ] **Step 3: Write the failing controller tests**

Create `backend/tests/Feature/KitchenProjectOvenTowersTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenProjectOvenTowersTest extends TestCase
{
    use RefreshDatabase;

    private function recipe(): array
    {
        return [
            'id' => 'ot1',
            'label' => 'Torre horno',
            'widthCm' => 60,
            'depthCm' => 60,
            'totalHeightCm' => 200,
            'sections' => [
                ['id' => 'a', 'content' => 'horno', 'options' => ['color' => '#111111']],
                ['id' => 'b', 'content' => 'puertas', 'heightCm' => 140, 'options' => []],
            ],
            'x' => 100,
            'z' => 30,
            'rotation' => 0,
        ];
    }

    public function test_store_persists_oven_towers(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $response = $this->postJson('/api/kitchen-projects', [
            'project_name' => 'Cocina', 'project_type' => 'cocina',
            'room_width' => 400, 'room_depth' => 300, 'ceiling_height' => 240,
            'oven_towers' => [$this->recipe()],
        ])->assertStatus(201);

        $project = KitchenProject::find($response->json('id'));
        $this->assertCount(1, $project->oven_towers);
        $this->assertSame('Torre horno', $project->oven_towers[0]['label']);
        // An arbitrary ModuleOptions leaf on a section survives unenumerated
        // — same precedent as modules.*.options, see the design spec §Current-state.
        $this->assertSame('#111111', $project->oven_towers[0]['sections'][0]['options']['color']);
        $this->assertSame(140, $project->oven_towers[0]['sections'][1]['heightCm']);
    }

    public function test_oven_towers_default_to_an_empty_list(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $response = $this->postJson('/api/kitchen-projects', [
            'project_name' => 'Cocina', 'project_type' => 'cocina',
            'room_width' => 400, 'room_depth' => 300, 'ceiling_height' => 240,
        ])->assertStatus(201);

        $this->assertSame([], KitchenProject::find($response->json('id'))->oven_towers);
    }

    public function test_update_replaces_oven_towers(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        $project = KitchenProject::create([
            'user_id' => $admin->id, 'project_name' => 'Cocina', 'room_width' => 400,
            'room_depth' => 300, 'ceiling_height' => 240, 'oven_towers' => [$this->recipe()],
        ]);

        $replacement = $this->recipe();
        $replacement['label'] = 'Torre horno editada';

        $this->putJson("/api/kitchen-projects/{$project->id}", ['oven_towers' => [$replacement]])
            ->assertStatus(200);

        $this->assertSame('Torre horno editada', $project->fresh()->oven_towers[0]['label']);
    }
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run from `backend/`: `php artisan test --filter=KitchenProjectOvenTowersTest`
Expected: FAIL — `oven_towers` is not a recognized field yet.

- [ ] **Step 5: Add validation and persistence to the controller**

In `backend/app/Http/Controllers/KitchenProjectController.php`, in the `store` method's validation array, add right after the `'towers.*.rotation' => ...` line:

```php
            'oven_towers' => 'nullable|array',
            'oven_towers.*.id' => 'required|string|max:60',
            'oven_towers.*.label' => 'required|string|max:120',
            'oven_towers.*.widthCm' => 'required|numeric|min:1',
            'oven_towers.*.depthCm' => 'required|numeric|min:1',
            'oven_towers.*.totalHeightCm' => 'required|numeric|min:1',
            'oven_towers.*.sections' => 'required|array|min:1',
            'oven_towers.*.sections.*.id' => 'required|string|max:60',
            'oven_towers.*.sections.*.content' => ['required', Rule::in(['puertas', 'cajones', 'abierto', 'horno', 'microondas'])],
            'oven_towers.*.sections.*.heightCm' => 'nullable|numeric|min:1',
            'oven_towers.*.sections.*.flex' => 'nullable|boolean',
            // Arbitrary ModuleOptions, same precedent as modules.*.options
            // below — never enumerated leaf by leaf, see the design spec.
            'oven_towers.*.sections.*.options' => 'nullable|array',
            'oven_towers.*.x' => 'required|numeric',
            'oven_towers.*.z' => 'required|numeric',
            'oven_towers.*.rotation' => ['required', Rule::in([0, 90, 180, 270])],
```

Then, in the `KitchenProject::create([...])` call, add right after `'towers' => $validated['towers'] ?? [],`:
```php
                'oven_towers' => $validated['oven_towers'] ?? [],
```

Do the identical thing in the `update` method: add the same 15 validation lines (right after its own `'towers.*.rotation' => ...` line), and `$kitchenProject->update($validated);` already persists whatever `oven_towers` came through validation — no further change needed there since `update()` writes every validated key generically.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `php artisan test --filter=KitchenProjectOvenTowersTest`
Expected: PASS, all 3 tests.

- [ ] **Step 7: Run the full backend suite**

Run from `backend/`: `php artisan test`
Expected: PASS (confirms nothing in the existing `towers`/`modules` validation was disturbed).

- [ ] **Step 8: Commit**

```bash
git add backend/database/migrations/2026_09_16_120000_add_oven_towers_to_kitchen_projects.php backend/app/Models/KitchenProject.php backend/app/Http/Controllers/KitchenProjectController.php backend/tests/Feature/KitchenProjectOvenTowersTest.php
git commit -m "Add oven_towers column and persistence to kitchen projects"
```

---

### Task 11: Backend — oven tower templates

**Files:**
- Create: `backend/database/migrations/2026_09_16_121000_create_oven_tower_templates_table.php`, `backend/app/Models/OvenTowerTemplate.php`, `backend/app/Http/Controllers/OvenTowerTemplateController.php`, `backend/tests/Feature/OvenTowerTemplateTest.php`
- Modify: `backend/routes/api.php`

**Interfaces:**
- Consumes: `App\Models\User`, the `design-projects` gate (already defined).
- Produces: `GET/POST /api/oven-tower-templates`, `PUT/DELETE /api/oven-tower-templates/{id}`.

- [ ] **Step 1: Write the migration**

Create `backend/database/migrations/2026_09_16_121000_create_oven_tower_templates_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oven_tower_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 120);
            // An OvenTowerRecipe minus its placement — see the closet
            // tower template migration this mirrors.
            $table->json('recipe');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('oven_tower_templates');
    }
};
```

- [ ] **Step 2: Write the model**

Create `backend/app/Models/OvenTowerTemplate.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OvenTowerTemplate extends Model
{
    protected $fillable = ['user_id', 'name', 'recipe'];

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

- [ ] **Step 3: Write the failing controller tests**

Create `backend/tests/Feature/OvenTowerTemplateTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\OvenTowerTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OvenTowerTemplateTest extends TestCase
{
    use RefreshDatabase;

    public static function recipe(): array
    {
        return [
            'label' => 'Torre horno doble',
            'widthCm' => 60,
            'depthCm' => 60,
            'totalHeightCm' => 220,
            'sections' => [
                ['id' => 'a', 'content' => 'cajones', 'options' => ['drawerSystem' => 'corredera_softclose']],
                ['id' => 'b', 'content' => 'horno', 'options' => []],
                ['id' => 'c', 'content' => 'horno', 'options' => []],
                ['id' => 'd', 'content' => 'abierto', 'flex' => true, 'options' => []],
            ],
        ];
    }

    private function payload(array $over = []): array
    {
        return array_merge(['name' => 'Torre horno doble', 'recipe' => self::recipe()], $over);
    }

    public function test_a_seller_creates_a_template_and_it_records_the_owner(): void
    {
        $seller = User::factory()->create(['role' => 'seller']);
        Sanctum::actingAs($seller);

        $response = $this->postJson('/api/oven-tower-templates', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('name', 'Torre horno doble')
            ->assertJsonPath('recipe.sections.0.options.drawerSystem', 'corredera_softclose');

        $this->assertDatabaseHas('oven_tower_templates', [
            'id' => $response->json('id'), 'user_id' => $seller->id,
        ]);
    }

    public function test_templates_are_visible_shop_wide(): void
    {
        $other = User::factory()->create(['role' => 'seller']);
        OvenTowerTemplate::create(['user_id' => $other->id, 'name' => 'De otra', 'recipe' => self::recipe()]);

        Sanctum::actingAs(User::factory()->create(['role' => 'seller']));

        $this->getJson('/api/oven-tower-templates')
            ->assertStatus(200)
            ->assertJsonPath('0.name', 'De otra')
            ->assertJsonPath('0.user.name', $other->name);
    }

    public function test_taller_cannot_list_or_create_templates(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'taller']));

        $this->getJson('/api/oven-tower-templates')->assertStatus(403);
        $this->postJson('/api/oven-tower-templates', $this->payload())->assertStatus(403);
    }

    public function test_a_template_requires_a_name_and_at_least_one_section(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $this->postJson('/api/oven-tower-templates', $this->payload(['name' => '']))
            ->assertStatus(422)->assertJsonValidationErrors('name');

        $bad = self::recipe();
        $bad['sections'] = [];
        $this->postJson('/api/oven-tower-templates', $this->payload(['recipe' => $bad]))
            ->assertStatus(422)->assertJsonValidationErrors('recipe.sections');
    }

    public function test_an_arbitrary_options_leaf_survives_unenumerated(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $recipe = self::recipe();
        $recipe['sections'][0]['options'] = ['boardMaterial' => 'MDF 18mm', 'hingeSide' => 'izquierda', 'color' => '#abcdef'];

        $response = $this->postJson('/api/oven-tower-templates', $this->payload(['recipe' => $recipe]))
            ->assertStatus(201);

        $this->assertSame('MDF 18mm', $response->json('recipe.sections.0.options.boardMaterial'));
        $this->assertSame('#abcdef', $response->json('recipe.sections.0.options.color'));
    }

    public function test_placement_is_rejected_rather_than_silently_stored(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $withPlacement = self::recipe();
        $withPlacement['x'] = 100;

        $this->postJson('/api/oven-tower-templates', $this->payload(['recipe' => $withPlacement]))
            ->assertStatus(422)->assertJsonValidationErrors('recipe.x');
    }

    public function test_only_the_owner_or_an_admin_may_delete(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);
        $t = OvenTowerTemplate::create(['user_id' => $owner->id, 'name' => 'Torre', 'recipe' => self::recipe()]);

        Sanctum::actingAs(User::factory()->create(['role' => 'seller']));
        $this->deleteJson("/api/oven-tower-templates/{$t->id}")->assertStatus(403);
        $this->assertDatabaseHas('oven_tower_templates', ['id' => $t->id]);

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/oven-tower-templates/{$t->id}")->assertStatus(200);
        $this->assertDatabaseMissing('oven_tower_templates', ['id' => $t->id]);
    }

    public function test_the_list_says_who_may_delete_each_template(): void
    {
        $owner = User::factory()->create(['role' => 'seller']);
        OvenTowerTemplate::create(['user_id' => $owner->id, 'name' => 'Suya', 'recipe' => self::recipe()]);

        Sanctum::actingAs($owner);
        $this->getJson('/api/oven-tower-templates')->assertJsonPath('0.can_delete', true);

        Sanctum::actingAs(User::factory()->create(['role' => 'seller']));
        $this->getJson('/api/oven-tower-templates')->assertJsonPath('0.can_delete', false);

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->getJson('/api/oven-tower-templates')->assertJsonPath('0.can_delete', true);
    }
}
```

- [ ] **Step 4: Run the tests to verify they fail**

Run from `backend/`: `php artisan test --filter=OvenTowerTemplateTest`
Expected: FAIL — controller/route/table don't exist yet.

- [ ] **Step 5: Write the controller**

Create `backend/app/Http/Controllers/OvenTowerTemplateController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\OvenTowerTemplate;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OvenTowerTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(
            OvenTowerTemplate::with('user:id,name')->latest()->get()
                ->map(fn (OvenTowerTemplate $t) => $t->setAttribute(
                    'can_delete',
                    $this->canManage($t, $user),
                ))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate($this->rules());

        $template = OvenTowerTemplate::create([
            'user_id' => $user->id,
            'name' => $validated['name'],
            'recipe' => $validated['recipe'],
        ]);

        $template->load('user:id,name')->setAttribute('can_delete', $this->canManage($template, $user));

        return response()->json($template, 201);
    }

    public function update(Request $request, OvenTowerTemplate $ovenTowerTemplate): JsonResponse
    {
        $user = $request->user();
        abort_if(!$this->canManage($ovenTowerTemplate, $user), 403);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'min:1', 'max:120'],
        ] + $this->recipeRules('sometimes'));

        $ovenTowerTemplate->update($validated);

        $ovenTowerTemplate = $ovenTowerTemplate->fresh()->load('user:id,name')->setAttribute('can_delete', $this->canManage($ovenTowerTemplate, $user));

        return response()->json($ovenTowerTemplate);
    }

    public function destroy(Request $request, OvenTowerTemplate $ovenTowerTemplate): JsonResponse
    {
        $user = $request->user();
        abort_if(!$this->canManage($ovenTowerTemplate, $user), 403);

        $ovenTowerTemplate->delete();

        return response()->json(['deleted' => true]);
    }

    private function rules(): array
    {
        return ['name' => ['required', 'string', 'min:1', 'max:120']] + $this->recipeRules('required');
    }

    // Every leaf here gets its own rule EXCEPT recipe.sections.*.options,
    // which is deliberately left as a loose array — it holds arbitrary
    // ModuleOptions, the same reason modules.*.options is never enumerated
    // either (see the design spec's Current State notes). Every other
    // recipe field IS enumerated, same rigor as ClosetTowerTemplateController.
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
            'recipe.sections.*.content' => ['required', Rule::in(['puertas', 'cajones', 'abierto', 'horno', 'microondas'])],
            'recipe.sections.*.heightCm' => ['nullable', 'numeric', 'min:1'],
            'recipe.sections.*.flex' => ['nullable', 'boolean'],
            'recipe.sections.*.options' => ['nullable', 'array'],
            // Placement belongs to a placed tower, never to a template.
            'recipe.x' => ['prohibited'],
            'recipe.z' => ['prohibited'],
            'recipe.rotation' => ['prohibited'],
            'recipe.id' => ['prohibited'],
        ];
    }

    private function canManage(OvenTowerTemplate $t, User $user): bool
    {
        return $user->role === 'admin' || $t->user_id === $user->id;
    }
}
```

- [ ] **Step 6: Register the routes**

In `backend/routes/api.php`, add the import alongside `use App\Http\Controllers\ClosetTowerTemplateController;`:
```php
use App\Http\Controllers\OvenTowerTemplateController;
```

Add the route inside the existing `can:design-projects` group, right after `Route::apiResource('closet-tower-templates', ClosetTowerTemplateController::class)->except(['show']);`:
```php
        Route::apiResource('oven-tower-templates', OvenTowerTemplateController::class)->except(['show']);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `php artisan test --filter=OvenTowerTemplateTest`
Expected: PASS, all 7 tests.

- [ ] **Step 8: Run the full backend suite**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/database/migrations/2026_09_16_121000_create_oven_tower_templates_table.php backend/app/Models/OvenTowerTemplate.php backend/app/Http/Controllers/OvenTowerTemplateController.php backend/routes/api.php backend/tests/Feature/OvenTowerTemplateTest.php
git commit -m "Add oven tower templates backend"
```

---

### Task 12: The composer dialog — `OvenTowerDialog.tsx`

**Files:**
- Create: `frontend/components/kitchen/OvenTowerDialog.tsx`

**Interfaces:**
- Consumes: `OvenTowerRecipe`, `OvenTowerSection`, `OvenTowerContent` (Task 1); `resolveOvenTowerHeights`, `ovenSectionLabel`, `OVEN_TOWER_CONTENT_DEFAULTS` (Task 1); `placeNewOvenTower` (Task 4); `addOvenTower`/`updateOvenTower` (Task 6).
- Produces: `<OvenTowerDialog open recipe={OvenTowerRecipe | null} seed={OvenTowerRecipe | null} onClose={() => void} />`, mounted by Task 14 (Inspector) and Task 15 (Selector).

**Background.** Visually the same shape as `TowerDialog.tsx` (vertical strip, tap a row to open its controls above the footer), but with a much smaller per-row editor: only content + optional pinned height. No hinge/material/drawer controls here — those live in the normal Inspector once the section is a real generated module (Task 14).

- [ ] **Step 1: Write the component**

Create `frontend/components/kitchen/OvenTowerDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, ChevronUp, X } from "lucide-react";
import { toast } from "sonner";
import { useKitchenStore } from "@/store/useKitchenStore";
import { Input, NumberInput } from "@/components/ui/input";
import { placeNewOvenTower, resolveOvenTowerHeights, ovenSectionLabel } from "@/services/ovenTower";
import type { OvenTowerPlacementKind } from "@/services/ovenTower";
import type { OvenTowerContent, OvenTowerRecipe, OvenTowerSection } from "@/types/ovenTower";

const NEW_OVEN_SECTION = (content: OvenTowerContent): OvenTowerSection => ({
  id: crypto.randomUUID(),
  content,
  options: {},
});

const CONTENT_OPTIONS: OvenTowerContent[] = ["puertas", "cajones", "abierto", "horno", "microondas"];
const CONTENT_LABEL: Record<OvenTowerContent, string> = {
  puertas: "Puertas", cajones: "Cajones", abierto: "Abierto", horno: "Horno", microondas: "Microondas",
};

function notifyOvenPlacement(kind: OvenTowerPlacementKind) {
  if (kind === "roomCentre" || kind === "freeGap") {
    toast.info("No había espacio junto a otra torre; se colocó en un espacio libre.");
  } else if (kind === "noSpaceFound") {
    toast.error("No se encontró espacio libre en la habitación — revisa dónde quedó la torre.");
  }
}

function toggleButtonClass(active: boolean): string {
  return `flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-colors ${
    active ? "border-brass bg-brass/15 text-brass-soft" : "border-ivory/10 bg-ivory/3 text-ivory/70 hover:border-ivory/25"
  }`;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-warmgray uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

// A section's altura is optional — empty means "let resolveOvenTowerHeights
// pick it automatically". Mirrors TowerDialog's AlturaInput exactly.
function AlturaInput({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <div className="relative">
      <input
        type="number"
        value={text}
        placeholder="Automática"
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw === "") {
            onChange(undefined);
            return;
          }
          if (raw === "-") return;
          const num = Number(raw);
          if (!Number.isNaN(num)) onChange(num);
        }}
        onBlur={() => {
          if (text !== "" && Number.isNaN(Number(text))) {
            setText("");
            onChange(undefined);
          }
        }}
        className="h-10 w-full rounded-xl border border-ivory/10 bg-ivory/5 px-3 pr-9 text-sm text-ivory placeholder:text-warmgray/50 focus:border-brass focus:ring-2 focus:ring-brass/30"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-warmgray">cm</span>
    </div>
  );
}

function RowIcon({ kind }: { kind: OvenTowerContent }) {
  switch (kind) {
    case "puertas":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1" />
        </svg>
      );
    case "cajones":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="2" y="7.5" width="12" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <line x1="6.5" y1="4.25" x2="9.5" y2="4.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="6.5" y1="9.75" x2="9.5" y2="9.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "abierto":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.2 2.2" />
          <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1" />
        </svg>
      );
    case "horno":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="4.5" y="4.5" width="7" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      );
    case "microondas":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="3.5" y="4" width="6" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
          <line x1="11.5" y1="4" x2="11.5" y2="12" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      );
  }
}

// The oven/microwave tower composer: content + optional pinned height only
// (see the design spec §4 — deep per-section options are edited in the
// normal Inspector once the section is a real generated module, not here).
export function OvenTowerDialog({ open, recipe, seed = null, onClose }: {
  open: boolean;
  recipe: OvenTowerRecipe | null; // null = new tower
  seed?: OvenTowerRecipe | null;
  onClose: () => void;
}) {
  const { draft, addOvenTower, updateOvenTower } = useKitchenStore();
  const isEdit = recipe !== null;

  const last = draft.ovenTowers[draft.ovenTowers.length - 1];
  const [work, setWork] = useState<OvenTowerRecipe>(() => {
    if (recipe) return recipe;

    if (seed) {
      const rotation = last?.rotation ?? 0;
      const placement = placeNewOvenTower(draft.ovenTowers, seed.widthCm, seed.depthCm, rotation, draft.roomWidth, draft.roomDepth);
      notifyOvenPlacement(placement.kind);
      return { ...seed, x: placement.x, z: placement.z, rotation };
    }

    const widthCm = 60;
    const depthCm = last?.depthCm ?? 60;
    const rotation = last?.rotation ?? 0;
    const placement = placeNewOvenTower(draft.ovenTowers, widthCm, depthCm, rotation, draft.roomWidth, draft.roomDepth);
    notifyOvenPlacement(placement.kind);
    const { x, z } = placement;
    return {
      id: crypto.randomUUID(),
      label: `Torre ${draft.ovenTowers.length + 1}`,
      widthCm,
      depthCm,
      totalHeightCm: last?.totalHeightCm ?? 200,
      sections: [NEW_OVEN_SECTION("puertas")],
      x, z, rotation,
    };
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const resolution = resolveOvenTowerHeights(work);

  const labelError =
    work.label.trim().length === 0
      ? "La torre necesita un nombre."
      : work.label.length > 120
        ? "El nombre no puede tener más de 120 caracteres."
        : null;

  const ceilingError =
    work.totalHeightCm > draft.ceilingHeight
      ? `La torre mide ${work.totalHeightCm} cm y el techo mide ${draft.ceilingHeight} cm; no cabe.`
      : null;

  const canAccept = resolution.ok && !labelError && !ceilingError;

  if (!open) return null;

  const patch = (over: Partial<OvenTowerRecipe>) => setWork((w) => ({ ...w, ...over }));
  const patchSection = (id: string, over: Partial<OvenTowerSection>) =>
    patch({ sections: work.sections.map((s) => (s.id === id ? { ...s, ...over } : s)) });
  const removeSection = (id: string) => {
    patch({ sections: work.sections.filter((s) => s.id !== id) });
    setSelectedId(null);
  };
  const addSection = () => {
    const section = NEW_OVEN_SECTION("puertas");
    patch({ sections: [...work.sections, section] });
    setSelectedId(section.id);
  };

  const accept = () => {
    if (!canAccept) return;
    if (isEdit) updateOvenTower(work);
    else addOvenTower(work);
    onClose();
  };

  const orderedSections = [...work.sections].reverse();
  const selectedSection = work.sections.find((s) => s.id === selectedId) ?? null;
  const drawerOpen = selectedSection !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={isEdit ? "Editar torre" : "Nueva torre"}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-ivory/10 bg-surface-raised shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ivory/8 px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-ivory">{isEdit ? "Editar torre" : "Nueva torre de horno/microondas"}</h2>
            <p className="mt-0.5 text-xs text-warmgray">Compón la torre de abajo hacia arriba — bisagras, jaladeras y material se ajustan después, por sección, en el panel normal.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <FieldGroup label="Nombre de la torre">
            <Input value={work.label} onChange={(e) => patch({ label: e.target.value })} />
            {labelError && <p className="mt-1 text-xs font-medium text-terracotta">{labelError}</p>}
          </FieldGroup>

          <div className="grid grid-cols-3 gap-3">
            <FieldGroup label="Ancho">
              <NumberInput value={work.widthCm} onChange={(v) => patch({ widthCm: v })} min={30} max={120} unit="cm" />
            </FieldGroup>
            <FieldGroup label="Fondo">
              <NumberInput value={work.depthCm} onChange={(v) => patch({ depthCm: v })} min={30} max={100} unit="cm" />
            </FieldGroup>
            <FieldGroup label="Alto total">
              <NumberInput value={work.totalHeightCm} onChange={(v) => patch({ totalHeightCm: v })} min={60} max={300} unit="cm" />
            </FieldGroup>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Composición (de abajo hacia arriba)</p>
              <button type="button" onClick={addSection} className="text-xs font-semibold text-brass-soft transition-colors hover:text-brass">
                + Agregar sección
              </button>
            </div>

            <div className="flex flex-col overflow-hidden rounded-xl border border-ivory/10">
              {orderedSections.map((section) => {
                const resolved = resolution.ok ? resolution.sections.find((s) => s.section.id === section.id) : undefined;
                const isSelected = selectedId === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : section.id)}
                    className={`flex min-h-[52px] items-center gap-3 border-b border-ivory/8 px-4 text-left transition-colors last:border-b-0 ${
                      isSelected ? "bg-brass/15" : "bg-ivory/3 hover:bg-ivory/6"
                    }`}
                  >
                    <span className="shrink-0 text-brass-soft"><RowIcon kind={section.content} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ivory">{ovenSectionLabel(section)}</span>
                      <span className="block text-[11px] text-warmgray">{resolved ? `${Math.round(resolved.heightCm)} cm` : "—"}</span>
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-warmgray" />
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-xs">
              {!resolution.ok ? (
                <span className="font-medium text-terracotta">{resolution.error}</span>
              ) : ceilingError ? (
                <span className="font-medium text-terracotta">{ceilingError}</span>
              ) : (
                <span className="text-warmgray">Alto asignado: {work.totalHeightCm} cm</span>
              )}
            </p>
          </div>
        </div>

        {drawerOpen && selectedSection && (
          <div className="shrink-0 border-t border-brass/30 bg-brass/5">
            <div className="flex items-center justify-between border-b border-ivory/8 px-5 py-3">
              <span className="flex items-center gap-2">
                <span className="text-brass-soft"><RowIcon kind={selectedSection.content} /></span>
                <span className="text-sm font-medium text-ivory">{ovenSectionLabel(selectedSection)}</span>
              </span>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Ocultar controles de esta sección" className="rounded-lg p-1.5 text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
                <ChevronUp size={16} />
              </button>
            </div>
            <div className="max-h-[240px] space-y-3 overflow-y-auto p-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-warmgray">Contenido</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {CONTENT_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => patchSection(selectedSection.id, { content: c, heightCm: undefined, options: {} })}
                      aria-pressed={selectedSection.content === c}
                      className={toggleButtonClass(selectedSection.content === c)}
                    >
                      {CONTENT_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
              <FieldGroup label="Alto de esta sección">
                <AlturaInput value={selectedSection.heightCm} onChange={(v) => patchSection(selectedSection.id, { heightCm: v })} />
              </FieldGroup>
              <button
                type="button"
                onClick={() => removeSection(selectedSection.id)}
                className="w-full rounded-xl px-3 py-2 text-xs font-semibold text-terracotta transition-colors hover:bg-terracotta/10"
              >
                Quitar sección
              </button>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-ivory/8 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-ivory/10 px-4 py-2.5 text-sm font-semibold text-ivory/80 transition-colors hover:border-ivory/25">
            Cancelar
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={!canAccept}
            className="rounded-xl bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aceptar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors (this component isn't mounted anywhere yet, so it must still compile standalone — check especially that `Input`/`NumberInput` from `@/components/ui/input` match the props used, matching `TowerDialog.tsx`'s own usage). Read the full output.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/kitchen/OvenTowerDialog.tsx
git commit -m "Add the oven tower composer dialog"
```

---

### Task 13: Elevation drawing for oven-tower content

**Files:**
- Modify: `frontend/components/kitchen/TowerElevation.tsx`

**Interfaces:**
- Consumes: `OvenTowerRecipe`, `OvenTowerContent`, `resolveOvenTowerHeights` (Task 1).
- Produces: `<TowerElevation recipe={...} system="closet" | "oven" .../>` — the `system` prop defaults to `"closet"` so every existing call site (which never passes it) keeps behaving exactly as before.

- [ ] **Step 1: Add the oven content vocabulary and drawing map**

In `frontend/components/kitchen/TowerElevation.tsx`, add the imports and a second recipe shape near the top (alongside the existing `ElevationRecipe` type):

```ts
import { resolveOvenTowerHeights } from "@/services/ovenTower";
import type { OvenTowerContent, OvenTowerRecipe, OvenTowerSection } from "@/types/ovenTower";

type OvenElevationRecipe = Pick<OvenTowerRecipe, "label" | "widthCm" | "depthCm" | "totalHeightCm" | "sections">;
```

Add a drawing map for the oven vocabulary, right after the existing `CONTENT_DRAWERS` map. `puertas` reuses the closet map's own `DoorPanel` (already defined further down in this file); `cajones` reuses the same drawer-bank drawing; `abierto` is the open-shelf look with no shelves drawn (an oven tower's "abierto" content has no shelf count of its own — it maps to `hueco_bajo_repisa`, whose shelf count is a section option edited in the Inspector, not something this elevation can read generically); `horno`/`microondas` get a small appliance glyph, mirroring `RowIcon`'s icons in `OvenTowerDialog.tsx` at box scale:

```ts
function ApplianceGlyph({ box, key }: { box: BandBox; key: string }) {
  const pad = Math.min(box.w, box.h) * 0.18;
  return (
    <g key={key}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} className={FILL.closed} />
      <rect x={box.x + pad} y={box.y + pad} width={box.w - pad * 2} height={box.h - pad * 2} fill="none" stroke="currentColor" strokeWidth={0.9} className="text-ivory/50" />
    </g>
  );
}

const OVEN_CONTENT_DRAWERS: Record<OvenTowerContent, (box: BandBox, key: string) => React.ReactNode> = {
  puertas: (box, key) => <DoorPanel box={box} doors={2} key={key} />,
  cajones: (box, key) => (
    <g key={key}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} className={FILL.drawer} />
      <Dividers box={box} count={3} />
      <DrawerHandles box={box} count={3} />
    </g>
  ),
  abierto: (box, key) => <rect key={key} x={box.x} y={box.y} width={box.w} height={box.h} className={FILL.open} />,
  horno: (box, key) => <ApplianceGlyph box={box} key={key} />,
  microondas: (box, key) => <ApplianceGlyph box={box} key={key} />,
};
```

- [ ] **Step 2: Add the `system` prop and branch the render**

Change the `TowerElevation` component's signature and body from:

```tsx
export function TowerElevation({ recipe, width = 72, height = 96 }: { recipe: ElevationRecipe; width?: number; height?: number }) {
  const resolution = resolveTowerHeights(recipe as TowerRecipe);
  if (!resolution.ok) return null;
  // ... existing body building `boxes`/`maleteroBox` from `resolution.sections` and `recipe.maletero`
```

to:

```tsx
export function TowerElevation({ recipe, system = "closet", width = 72, height = 96 }: {
  recipe: ElevationRecipe | OvenElevationRecipe; system?: "closet" | "oven"; width?: number; height?: number;
}) {
  if (system === "oven") {
    const resolution = resolveOvenTowerHeights(recipe as OvenTowerRecipe);
    if (!resolution.ok) return null;

    const pad = 4;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    const scale = innerH / recipe.totalHeightCm;
    const boxes = resolution.sections.map(({ section, heightCm, fromBottomCm }) => ({
      section,
      box: { x: pad, y: pad + innerH - (fromBottomCm + heightCm) * scale, w: innerW, h: heightCm * scale } as BandBox,
    }));

    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Alzado de ${recipe.label}`}>
        {boxes.map(({ section, box }) => OVEN_CONTENT_DRAWERS[section.content](box, section.id))}
        {boxes.map(({ box }, i) => (
          <line key={`div-${i}`} x1={pad} y1={box.y} x2={pad + innerW} y2={box.y} stroke="currentColor" strokeWidth={1} className="text-ivory/70" />
        ))}
        <rect x={pad} y={pad} width={innerW} height={innerH} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-ivory/75" />
      </svg>
    );
  }

  const resolution = resolveTowerHeights(recipe as TowerRecipe);
  if (!resolution.ok) return null;
  // ... existing closet body is unchanged from here down
```

Everything from the original `const pad = 4;` line to the end of the function stays exactly as it is today — only reachable now when `system !== "oven"` (the default), so every existing closet call site is untouched.

- [ ] **Step 3: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors. Read the full output.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/kitchen/TowerElevation.tsx
git commit -m "Draw oven-tower content in TowerElevation"
```

---

### Task 14: Inspector — the oven-tower section panel

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx`

**Interfaces:**
- Consumes: `OvenTowerDialog` (Task 12), `TowerElevation` with `system="oven"` (Task 13), `recipeToTemplate`/`createOvenTowerTemplate` (Tasks 8–9), `draft.ovenTowers`, `removeModule` (all existing/Task 6-7).
- Produces: nothing new exported — this is the UI wiring that makes a generated oven-tower section editable via the normal fields plus a small extra panel, per the spec's §5 (the one deliberate difference from `GeneratedTowerPanel`, which REPLACES the fields for closet).

- [ ] **Step 1: Add the imports**

Alongside `import { recipeToTemplate } from "@/lib/towerTemplate";` and `import { createTowerTemplate } from "@/services/api";`, add:

```ts
import { recipeToTemplate as ovenRecipeToTemplate } from "@/lib/ovenTowerTemplate";
import { createOvenTowerTemplate } from "@/services/api";
import { OvenTowerDialog } from "./OvenTowerDialog";
import { TowerElevation } from "./TowerElevation";
```

(If `TowerElevation` is already imported in this file — it is, for the closet panel — do not duplicate the import; just reuse it, since Task 13 already made it accept `system="oven"`.)

- [ ] **Step 2: Write the section panel component**

Add this new component right after `GeneratedTowerPanel` (the closet one):

```tsx
// The oven-tower counterpart of GeneratedTowerPanel — but it does NOT
// replace the normal fields below it (see the render site in Step 4):
// an oven-tower section is edited exactly like any other gabinete_bajo_*/
// hueco_horno/hueco_microondas module, through its own Materiales/
// Estructura/Frentes tabs. This panel only adds the three things those
// tabs can't: which tower this belongs to, a way back into the composer,
// and starring it as a template.
function OvenTowerSectionPanel({ recipe, onEdit, onRemoveSection, onSaveTemplate }: {
  recipe: OvenTowerRecipe;
  onEdit: () => void;
  onRemoveSection: () => void;
  onSaveTemplate: (name: string) => Promise<void>;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameOk = name.trim().length > 0 && name.trim().length <= 120;

  return (
    <div className="shrink-0 space-y-3 border-b border-ivory/8 bg-ivory/3 p-4">
      <div className="flex items-center gap-3">
        <TowerElevation recipe={recipe} system="oven" width={32} height={72} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-warmgray">Sección de torre</p>
          <p className="truncate text-sm text-ivory">{recipe.label}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onEdit} className="flex-1 rounded-xl bg-brass px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-brass-soft">
          Editar torre
        </button>
        <button type="button" onClick={onRemoveSection} className="flex-1 rounded-xl border border-terracotta/40 px-3 py-2 text-xs font-semibold text-terracotta transition-colors hover:bg-terracotta/10">
          Quitar de la torre
        </button>
      </div>
      {!naming ? (
        <button
          type="button"
          onClick={() => { setName(recipe.label); setNaming(true); }}
          className="w-full rounded-xl border border-ivory/10 bg-ivory/3 px-3 py-2 text-xs font-semibold text-ivory/80 transition-colors hover:border-brass/40 hover:text-brass-soft"
        >
          ⭐ Guardar como plantilla
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-ivory/10 bg-ivory/3 p-3">
          <label className="block text-xs font-medium uppercase tracking-wider text-warmgray">Nombre de la plantilla</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!nameOk || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSaveTemplate(name.trim());
                  setNaming(false);
                } finally {
                  setSaving(false);
                }
              }}
              className="flex-1 rounded-xl bg-brass px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-brass-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={() => setNaming(false)} disabled={saving} className="flex-1 rounded-xl border border-ivory/10 px-3 py-2 text-xs font-semibold text-ivory/80 transition-colors hover:border-ivory/25 disabled:cursor-not-allowed disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Add the import for `OvenTowerRecipe` alongside the file's existing `TowerRecipe`/`TowerMaletero` type import:
```ts
import type { OvenTowerRecipe } from "@/types/ovenTower";
```

- [ ] **Step 3: Read the module's oven-tower lineage**

Find where the component reads `towerGroupId`/`towerRecipe` (search for `const towerGroupId = opt.towerGroupId;`). Add right after that whole block:

```ts
  const ovenTowerGroupId = opt.ovenTowerGroupId;
  const ovenTowerRecipe = ovenTowerGroupId ? draft.ovenTowers.find((t) => t.id === ovenTowerGroupId) ?? null : null;
  const [showOvenTowerDialog, setShowOvenTowerDialog] = useState(false);
```

- [ ] **Step 4: Render the panel ABOVE the normal fields, not instead of them**

Find the render site for closet's panel:
```tsx
      {towerGroupId ? (
        <GeneratedTowerPanel
          ...
        />
      ) : (
      <>
      {/* ── Tabs ── */}
      ...
```

Change it to:

```tsx
      {ovenTowerRecipe && (
        <OvenTowerSectionPanel
          recipe={ovenTowerRecipe}
          onEdit={() => setShowOvenTowerDialog(true)}
          onRemoveSection={() => removeModule(module.id)}
          onSaveTemplate={async (name) => {
            await createOvenTowerTemplate(name, ovenRecipeToTemplate({ ...ovenTowerRecipe, label: name }));
            toast.success("Plantilla guardada");
          }}
        />
      )}
      {towerGroupId ? (
        <GeneratedTowerPanel
          ...
        />
      ) : (
      <>
      {/* ── Tabs ── */}
      ...
```

(Only the new `{ovenTowerRecipe && (...)}` block is added, immediately before the existing `{towerGroupId ? (...` — the rest of that conditional, and everything below it rendering the normal tabbed fields, is untouched. Since a module can never carry both `towerGroupId` and `ovenTowerGroupId`, at most one of the two panels ever renders, and the normal tabbed fields always render for an oven-tower section because `towerGroupId` is falsy for it.)

- [ ] **Step 5: Hide Ancho/Fondo for an oven-tower section**

Find the generic "Ancho" `FieldGroup` (unconditional today) inside the Medidas tab and wrap both it and the "Fondo" one with `{!ovenTowerGroupId && (...)}`:

```tsx
            {!ovenTowerGroupId && (
            <FieldGroup label="Ancho">
              {isMobile ? (
                <StepperInput value={dim.width} onChange={(v) => updateDim("width", v)} min={10} max={500} unit="cm" />
              ) : (
                <NumInput value={dim.width} onChange={(v) => updateDim("width", v)} min={10} max={500} unit="cm" />
              )}
            </FieldGroup>
            )}
            {!ovenTowerGroupId && (
            <FieldGroup label="Fondo">
              {isMobile ? (
                <StepperInput value={dim.depth} onChange={(v) => updateDim("depth", v)} min={10} max={200} unit="cm" />
              ) : (
                <NumInput value={dim.depth} onChange={(v) => updateDim("depth", v)} min={10} max={200} unit="cm" />
              )}
            </FieldGroup>
            )}
```

- [ ] **Step 6: Mount the dialog**

Find where `TowerDialog` is mounted (search for `{showTowerDialog && towerRecipe && (`). Add right after that block:

```tsx
      {showOvenTowerDialog && ovenTowerRecipe && (
        <OvenTowerDialog open recipe={ovenTowerRecipe} onClose={() => setShowOvenTowerDialog(false)} />
      )}
```

- [ ] **Step 7: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors. Read the full output.

- [ ] **Step 8: Manual verification**

Recreate the console test tower from Task 6/7. Select a generated `gabinete_bajo_cajones` section: confirm you see the small "Sección de torre" panel at the top (with the mini elevation), AND below it the full normal Medidas/Estructura/Frentes/Materiales tabs with Ancho/Fondo hidden but Alto, materials, hinges, etc. all present and editable. Click "Editar torre" and confirm `OvenTowerDialog` opens pre-filled with this recipe. Click "⭐ Guardar como plantilla", name it, save, and confirm the success toast (requires the backend from Tasks 10–11 running).

- [ ] **Step 9: Commit**

```bash
git add frontend/components/kitchen/ModuleInspector.tsx
git commit -m "Wire the oven-tower section panel into the Inspector"
```

---

### Task 15: Catalog entry point — "Torres" for cocina

**Files:**
- Modify: `frontend/lib/projectCatalog.ts`, `frontend/components/kitchen/ModuleSelector.tsx`

**Interfaces:**
- Consumes: `listOvenTowerTemplates`/`deleteOvenTowerTemplate` (Task 9), `templateToRecipe` (Task 8), `OvenTowerDialog` (Task 12), `TowerElevation` with `system="oven"` (Task 13), `placeNewOvenTower` (Task 4).
- Produces: nothing new exported — a new browsable "Torres" tile for cocina projects, mirroring the closet one exactly but on its own independent state.

- [ ] **Step 1: Add the selector group**

In `frontend/lib/projectCatalog.ts`, add right after the `otros`/`sin_categoria` cocina groups (before the "── Clóset ──" comment):

```ts
  // Cocina's own Torres group — no catalog entries to browse (content is
  // saved templates + the composer entry point), same shape as closet's
  // own closet_torres below, just its own independent list.
  { id: "cocina_torres", label: "Torres", icon: "🏗️", projectTypes: ["cocina"], match: () => false },
```

- [ ] **Step 2: Wire the group in `ModuleSelector.tsx`**

Add the imports alongside the existing closet-tower ones:

```ts
import { OvenTowerDialog } from "./OvenTowerDialog";
import { listOvenTowerTemplates, deleteOvenTowerTemplate, type OvenTowerTemplate } from "@/services/api";
import { templateToRecipe as ovenTemplateToRecipe } from "@/lib/ovenTowerTemplate";
import { placeNewOvenTower } from "@/services/ovenTower";
import type { OvenTowerRecipe } from "@/types/ovenTower";
```

Add the constant alongside `const TORRES_GROUP_ID = "closet_torres";`:
```ts
const OVEN_TORRES_GROUP_ID = "cocina_torres";
```

Add the parallel state alongside the existing `showTowerDialog`/`templates`/`templatesFailed`/`seed`/`towersAtOpen`:
```ts
  const [showOvenTowerDialog, setShowOvenTowerDialog] = useState(false);
  const [ovenTemplates, setOvenTemplates] = useState<OvenTowerTemplate[] | null>(null);
  const [ovenTemplatesFailed, setOvenTemplatesFailed] = useState(false);
  const [ovenSeed, setOvenSeed] = useState<OvenTowerRecipe | null>(null);
  const ovenTowersAtOpen = useRef(0);
```

Add the parallel load effect alongside the existing one:
```ts
  useEffect(() => {
    if (group?.id !== OVEN_TORRES_GROUP_ID || ovenTemplates !== null || ovenTemplatesFailed) return;
    listOvenTowerTemplates()
      .then(setOvenTemplates)
      .catch(() => setOvenTemplatesFailed(true));
  }, [group?.id, ovenTemplates, ovenTemplatesFailed]);

  const applyOvenTemplate = (t: OvenTowerTemplate) => {
    setOvenSeed(ovenTemplateToRecipe(t.recipe, crypto.randomUUID(), () => crypto.randomUUID()));
    ovenTowersAtOpen.current = draft.ovenTowers.length;
    setShowOvenTowerDialog(true);
  };

  const handleDeleteOvenTemplate = async (t: OvenTowerTemplate) => {
    if (!window.confirm(`¿Eliminar la plantilla "${t.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteOvenTowerTemplate(t.id);
      setOvenTemplates((prev) => (prev ? prev.filter((x) => x.id !== t.id) : prev));
    } catch {
      toast.error("No se pudo eliminar la plantilla.");
    }
  };
```

Add the render branch right after the existing `group?.id === TORRES_GROUP_ID ? (...)` block, as a new `: group?.id === OVEN_TORRES_GROUP_ID ? (...)` branch before the final generic `else`:

```tsx
        ) : group?.id === OVEN_TORRES_GROUP_ID ? (
          <div className="space-y-3 pt-2">
            {ovenTemplates === null && !ovenTemplatesFailed && (
              <p className="py-2 text-center text-xs text-warmgray">Cargando plantillas…</p>
            )}
            {ovenTemplatesFailed && (
              <p className="py-2 text-center text-xs text-warmgray">No se pudieron cargar las plantillas.</p>
            )}
            {ovenTemplates && ovenTemplates.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {ovenTemplates.map((t) => (
                  <div key={t.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => applyOvenTemplate(t)}
                      className="flex w-full flex-col items-center gap-2 rounded-xl border border-ivory/8 bg-ivory/4 px-3 py-4 text-center transition-all hover:border-brass/50 hover:bg-brass/8 active:scale-[0.97]"
                    >
                      <TowerElevation recipe={t.recipe} system="oven" width={28} height={72} />
                      <span className="text-xs font-semibold text-ivory leading-tight">{t.name}</span>
                      <span className="text-[10px] text-warmgray/70">{t.recipe.widthCm}×{t.recipe.totalHeightCm} cm</span>
                    </button>
                    {t.canDelete && (
                      <button
                        type="button"
                        aria-label={`Eliminar plantilla ${t.name}`}
                        title="Eliminar plantilla"
                        onClick={(e) => { e.stopPropagation(); void handleDeleteOvenTemplate(t); }}
                        className="absolute right-1.5 top-1.5 rounded-lg p-1 text-warmgray/50 opacity-0 transition-opacity hover:bg-terracotta/15 hover:text-terracotta group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                ovenTowersAtOpen.current = draft.ovenTowers.length;
                setShowOvenTowerDialog(true);
              }}
              className="group flex w-full flex-col items-center gap-2 rounded-xl border border-ivory/8 bg-ivory/4 px-4 py-10 text-center transition-all hover:border-brass/50 hover:bg-brass/8 active:scale-[0.97]"
            >
              <span className="text-3xl">🏗️</span>
              <span className="text-sm font-semibold text-ivory">Torre personalizada</span>
              <span className="max-w-[220px] text-xs text-warmgray">
                Compón puertas, cajones, abierto, horno y microondas a la medida, sección por sección.
              </span>
            </button>
          </div>
```

Add the dialog mount right after the existing `{showTowerDialog && (...)}` block:

```tsx
      {showOvenTowerDialog && (
        <OvenTowerDialog
          open
          recipe={null}
          seed={ovenSeed}
          onClose={() => {
            setShowOvenTowerDialog(false);
            setOvenSeed(null);
            if (useKitchenStore.getState().draft.ovenTowers.length > ovenTowersAtOpen.current) {
              closeSelector();
            }
          }}
        />
      )}
```

- [ ] **Step 3: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors. Read the full output.

- [ ] **Step 4: Manual verification**

Open a **Cocina** project (not closet), click "+ Añadir módulo", confirm a "Torres" tile now appears on the landing screen. Open it, confirm "Torre personalizada" shows, click it, compose a tower with a horno + a puertas section, accept, confirm it's placed in the room. Reopen the selector's Torres group and confirm the tower you just starred (Task 14, Step 8) shows as a tile with its elevation; click it and confirm a new tower is placed from that template.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/projectCatalog.ts frontend/components/kitchen/ModuleSelector.tsx
git commit -m "Add the cocina Torres entry point for oven towers"
```

---

### Task 16: Retire the fixed catalog entries

**Files:**
- Modify: `frontend/services/kitchenData.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing exported — `torre_horno_microondas`/`torre_horno_empotrado` no longer appear in `KITCHEN_MODULE_CATALOG`, so `ModuleSelector`'s "Armarios altos" group (and any search) no longer offers them for a *new* module. Their types, meshes (`TorreHornoMicroondasMesh`/`TorreHornoEmpotradoMesh`), and cost-calculation branches are untouched — an existing project with one placed keeps rendering, editing and costing exactly as before.

- [ ] **Step 1: Remove the two catalog entries**

In `frontend/services/kitchenData.ts`, delete the `torre_horno_microondas` and `torre_horno_empotrado` object literals from `KITCHEN_MODULE_CATALOG` (they sit right before/after the two new `hueco_horno`/`hueco_microondas` entries added in Task 2 — leave those two, remove only these two). Leave a short comment in their place so a future reader knows why the gap:

```ts
  // torre_horno_microondas/torre_horno_empotrado's catalog entries were
  // removed here — the oven-tower composer (services/ovenTower.ts) replaces
  // them for new modules. Their KitchenModuleType, cost-calculation
  // branches (resolveMicroondasZonePlan/resolveEmpotradoZonePlan) and
  // meshes (ModulePreview3D.tsx) are untouched: an existing project that
  // already placed one keeps rendering/costing identically, unmigrated.
```

- [ ] **Step 2: Confirm nothing else references them for "new module" purposes**

Run: `grep -rn "torre_horno_microondas\|torre_horno_empotrado" frontend/lib/projectCatalog.ts frontend/components/kitchen/ModuleSelector.tsx`
Expected: no matches (neither file singles these types out — they were only ever reachable through the generic "Armarios altos" catalog listing, which now simply has two fewer entries).

- [ ] **Step 3: Typecheck**

Run from `frontend/`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full frontend test suite**

Run: `npm test`
Expected: PASS. If `kitchenData.test.ts` has any test that asserted `getCatalogEntry("torre_horno_microondas")` is defined (check for one before this step), that assertion now correctly fails and must be removed — this plan did not add such a test, so none should exist, but confirm.

- [ ] **Step 5: Manual verification**

Open a Cocina project, browse "Armarios altos" — confirm the two torre_horno entries are gone from the list. Open a project (or seed one manually) that already has a `torre_horno_microondas` placed from BEFORE this change — confirm it still renders, its Inspector fields still work, and it still appears correctly in the cost summary.

- [ ] **Step 6: Commit**

```bash
git add frontend/services/kitchenData.ts
git commit -m "Retire torre_horno_microondas/torre_horno_empotrado from the catalog"
```

---

### Task 17: Final integration pass

**Files:** none created; verification only.

**Interfaces:** none.

- [ ] **Step 1: Full frontend verification**

From `frontend/`, run in order and read every line of output:
```bash
npx tsc --noEmit
npm test
```
Expected: both clean.

- [ ] **Step 2: Full backend verification**

From `backend/`, run:
```bash
php artisan test
```
Expected: clean, including the new `KitchenProjectOvenTowersTest` and `OvenTowerTemplateTest` suites alongside every pre-existing test (in particular `KitchenProjectTowersTest`/`ClosetTowerTemplateTest`, confirming the closet tower system is untouched).

- [ ] **Step 3: End-to-end manual walkthrough**

With both dev servers running:
1. In a Cocina project, build a tower via "Torres": `horno` → `microondas` → `cajones` → `horno` (two ovens on purpose, per the original request). Accept.
2. Select the `cajones` section, set its `drawerSystem` to a different value and its color to something distinctive in the normal Inspector.
3. Reopen "Editar torre", add a fifth section (`abierto`) at the top, accept.
4. Reselect the `cajones` section — confirm the `drawerSystem`/color set in step 2 are still there.
5. Star the tower as a template; open the Torres group again and confirm it appears with a correct-looking elevation (2 oven glyphs, a microwave glyph, a drawer bank, an open box, in that bottom-to-top order).
6. Check the cost summary (Resumen tab) includes real line items for every generated module (board cuts, hinges/correderas for the `cajones`/`puertas` sections) — exactly as if each had been hand-placed.
7. Refresh the page (or reopen the project from the list) — confirm the tower, its templates, and the per-section edits all survive a reload (backend round-trip).

- [ ] **Step 4: Final commit**

If Step 3 surfaced no fixes, there is nothing to commit — the plan is complete. If it did, fix inline, re-run Steps 1–2, and commit the fix with a message describing what integration issue it closes.

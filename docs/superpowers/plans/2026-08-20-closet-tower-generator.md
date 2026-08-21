# Closet Tower Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller composes a closet tower bottom-to-top in a dialog, never typing a height, and the app generates the real closet modules that make it.

**Architecture:** A `TowerRecipe` is the source of truth, stored on the project. A framework-free `services/closetTower.ts` resolves section heights and turns a recipe into `KitchenModule[]`; the store writes those modules into the draft. Nothing in the 3D scene or the cut list changes — `findTowerChain` already recognises the generated stack and joins its panels for free.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand 5 with `persist`, TypeScript 6, Tailwind 4, Laravel 12 + PHPUnit, **Vitest (added by this plan)**.

**Spec:** `docs/superpowers/specs/2026-08-20-closet-tower-design.md`

## Global Constraints

- Content values are exactly `cajones` | `repisas` | `hueco` | `colgar`, lowercase unaccented, in code. Spanish UI copy keeps accents ("Colgar ropa", "Sección", "Maletero").
- Typical heights, from the spec's §2 table and not to be re-derived: `cajones` 90cm / 4 drawers, `repisas` 40cm / 2 shelves, `hueco` 25cm, `colgar` 100cm / 1 rod. Minimum any section or maletero may resolve to: **15 cm**.
- Generated module ids are deterministic — `` `${recipe.id}__${section.id}` `` — so regenerating a tower keeps identities stable.
- The generator **never emits `nicho_doble_puerta_closet`**. A niche with doors is a section with `doors: 1 | 2`.
- `findTowerChain` is not modified and not removed.
- **Vitest is scoped to Node-environment tests over framework-free modules.** No jsdom, no React Testing Library, no component tests. Everything else keeps verifying with `npx tsc --noEmit` plus manual checks; Playwright keeps owning end-to-end.
- Backend tests: `php artisan test` from `backend/`. Frontend unit tests: `npm test` from `frontend/`.
- Nothing is renamed.

## File Structure

**Created (frontend)**
- `vitest.config.ts` — runner config, Node env, `@/` alias
- `types/closetTower.ts` — `TowerContent`, `TowerSection`, `TowerMaletero`, `TowerRecipe`
- `services/closetTower.ts` — height resolution, module generation, maletero runs. Framework-free, the only unit-tested surface.
- `services/closetTower.test.ts` — the Vitest suite
- `components/kitchen/TowerDialog.tsx` — the bottom-to-top composer

**Modified (frontend)** — `package.json`, `types/kitchen.ts`, `services/api.ts`, `store/useKitchenStore.ts`, `components/kitchen/ModuleSelector.tsx`

**Modified/created (backend)** — one migration, `KitchenProject.php`, `KitchenProjectController.php`, `tests/Feature/KitchenProjectTowersTest.php`

Tasks 1–3 build and test the pure core before any UI exists; 4–6 persist and wire it; 7–8 are the interface.

---

### Task 1: Vitest, the recipe types, and height resolution

**Files:**
- Create: `frontend/vitest.config.ts`, `frontend/types/closetTower.ts`, `frontend/services/closetTower.ts`, `frontend/services/closetTower.test.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `TowerRecipe`/`TowerSection`/`TowerMaletero`/`TowerContent` from `@/types/closetTower`; and from `@/services/closetTower`: `TOWER_CONTENT_DEFAULTS`, `TOWER_MIN_SECTION_HEIGHT_CM`, `sectionHeightCm(section)`, `resolveTowerHeights(recipe): TowerResolution`, plus the `ResolvedSection` and `TowerResolution` types.

- [ ] **Step 1: Install Vitest**

Run from `frontend/`: `npm install -D vitest`

- [ ] **Step 2: Add the runner config and script**

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately narrow: Node environment, framework-free modules only — no
// jsdom, no component tests. See the closet-tower spec §7 for why the runner
// exists and why it stops here. Widening it is a separate decision.
export default defineConfig({
  test: {
    environment: "node",
    include: ["services/**/*.test.ts", "lib/**/*.test.ts"],
  },
  resolve: {
    // Mirrors tsconfig's "@/*": ["./*"] so tested modules can use the same
    // import paths the app uses.
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

In `frontend/package.json`, add to `"scripts"`, after `"test:e2e"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Add the recipe types**

Create `frontend/types/closetTower.ts`:

```ts
// A closet tower's recipe — the source of truth for a generated tower.
// See docs/superpowers/specs/2026-08-20-closet-tower-design.md.

export type TowerContent = "cajones" | "repisas" | "hueco" | "colgar";

export interface TowerSection {
  id: string;
  content: TowerContent;
  // Doors on the section itself. Lift-up doors are a maletero concept — a
  // mid-tower section never gets one.
  doors: 0 | 1 | 2;
  // Drawers / shelves / rods, by content. Omitted = the content's default.
  count?: number;
  // Omitted = the content's typical height. Set = the seller pinned it.
  heightCm?: number;
  // Absorbs the leftover height. At most one per tower; with none set, the
  // topmost section absorbs it instead.
  flex?: boolean;
}

export interface TowerMaletero {
  heightCm: number;
  // Doors across the whole opening, however wide the merged run is.
  doorCount: number;
}

export interface TowerRecipe {
  id: string;              // also written to every generated module
  label: string;
  widthCm: number;
  depthCm: number;
  totalHeightCm: number;   // floor to the top of the maletero
  sections: TowerSection[]; // bottom → top
  maletero: TowerMaletero | null;
  x: number;
  z: number;
  rotation: 0 | 90 | 180 | 270;
}
```

- [ ] **Step 4: Write the failing tests**

Create `frontend/services/closetTower.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveTowerHeights, TOWER_MIN_SECTION_HEIGHT_CM } from "@/services/closetTower";
import type { TowerRecipe, TowerSection } from "@/types/closetTower";

function section(over: Partial<TowerSection> & Pick<TowerSection, "id" | "content">): TowerSection {
  return { doors: 0, ...over };
}

function recipe(over: Partial<TowerRecipe> = {}): TowerRecipe {
  return {
    id: "t1",
    label: "Torre",
    widthCm: 40,
    depthCm: 60,
    totalHeightCm: 240,
    sections: [
      section({ id: "a", content: "cajones" }),
      section({ id: "b", content: "hueco" }),
      section({ id: "c", content: "repisas" }),
    ],
    maletero: null,
    x: 0,
    z: 0,
    rotation: 0,
    ...over,
  };
}

describe("resolveTowerHeights", () => {
  it("closes exactly against the opening, topmost section absorbing the remainder", () => {
    const res = resolveTowerHeights(recipe());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sections.map((s) => s.heightCm)).toEqual([90, 25, 125]);
    expect(res.sections.map((s) => s.fromBottomCm)).toEqual([0, 90, 115]);
    const total = res.sections.reduce((n, s) => n + s.heightCm, 0);
    expect(total).toBe(240);
    expect(res.maleteroFromBottomCm).toBeNull();
  });

  it("takes the maletero off the top before distributing", () => {
    const res = resolveTowerHeights(recipe({ maletero: { heightCm: 40, doorCount: 1 } }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sections.map((s) => s.heightCm)).toEqual([90, 25, 85]);
    expect(res.maleteroFromBottomCm).toBe(200);
  });

  it("lets an explicitly flexible middle section absorb the remainder", () => {
    const res = resolveTowerHeights(
      recipe({
        sections: [
          section({ id: "a", content: "cajones" }),
          section({ id: "b", content: "colgar", flex: true }),
          section({ id: "c", content: "repisas" }),
        ],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sections.map((s) => s.heightCm)).toEqual([90, 110, 40]);
  });

  it("honours a pinned height on a fixed section", () => {
    const res = resolveTowerHeights(
      recipe({
        sections: [
          section({ id: "a", content: "cajones", heightCm: 70 }),
          section({ id: "b", content: "repisas" }),
        ],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sections.map((s) => s.heightCm)).toEqual([70, 170]);
  });

  it("lands the implicit flex on its own pinned height when everything sums exactly", () => {
    const res = resolveTowerHeights(
      recipe({
        totalHeightCm: 200,
        sections: [
          section({ id: "a", content: "cajones", heightCm: 90 }),
          section({ id: "b", content: "repisas", heightCm: 110 }),
        ],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sections.map((s) => s.heightCm)).toEqual([90, 110]);
  });

  it("refuses when the remainder falls under the floor, naming the squeezed section", () => {
    // 100 total minus the 90cm drawer bank leaves 10cm for the flex section,
    // under the 15cm floor. Do not raise this to a number that leaves 15cm or
    // more: a remainder above the floor is a VALID tower, and the flex
    // section is allowed to resolve below its typical height. That is the
    // whole point of flex.
    const res = resolveTowerHeights(
      recipe({
        totalHeightCm: 100,
        sections: [
          section({ id: "a", content: "cajones" }),
          section({ id: "b", content: "colgar" }),
        ],
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Colgar ropa");
    expect(res.error).toContain(String(TOWER_MIN_SECTION_HEIGHT_CM));
  });

  it("refuses two flexible sections", () => {
    const res = resolveTowerHeights(
      recipe({
        sections: [
          section({ id: "a", content: "cajones", flex: true }),
          section({ id: "b", content: "repisas", flex: true }),
        ],
      }),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("flexible");
  });

  it("refuses a tower with no sections", () => {
    const res = resolveTowerHeights(recipe({ sections: [] }));
    expect(res.ok).toBe(false);
  });

  it("refuses a maletero under the floor", () => {
    const res = resolveTowerHeights(recipe({ maletero: { heightCm: 10, doorCount: 1 } }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("maletero");
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `services/closetTower.ts` does not exist, so the import cannot resolve.

- [ ] **Step 6: Implement height resolution**

Create `frontend/services/closetTower.ts`:

```ts
import type { TowerContent, TowerRecipe, TowerSection } from "@/types/closetTower";

// Typical height and count per content, taken from the catalog defaults each
// one generates — except `hueco`, which is 25cm rather than nicho_closet's
// 40: a perfume nook is shallower than a shelf bay, and a taller open gap is
// better expressed as a `repisas` section with zero shelves.
export const TOWER_CONTENT_DEFAULTS: Record<TowerContent, { heightCm: number; count: number; label: string }> = {
  cajones: { heightCm: 90, count: 4, label: "Cajones" },
  repisas: { heightCm: 40, count: 2, label: "Repisas" },
  hueco: { heightCm: 25, count: 0, label: "Hueco" },
  colgar: { heightCm: 100, count: 1, label: "Colgar ropa" },
};

// Below this a section stops being furniture. Refusing here is what keeps a
// squeezed tower from silently generating a 3cm drawer bank.
export const TOWER_MIN_SECTION_HEIGHT_CM = 15;

export interface ResolvedSection {
  section: TowerSection;
  heightCm: number;
  fromBottomCm: number;
}

export type TowerResolution =
  | { ok: true; sections: ResolvedSection[]; maleteroFromBottomCm: number | null }
  | { ok: false; error: string };

export function sectionHeightCm(section: TowerSection): number {
  return section.heightCm ?? TOWER_CONTENT_DEFAULTS[section.content].heightCm;
}

export function sectionLabel(section: TowerSection): string {
  return TOWER_CONTENT_DEFAULTS[section.content].label;
}

export function resolveTowerHeights(recipe: TowerRecipe): TowerResolution {
  if (recipe.sections.length === 0) {
    return { ok: false, error: "La torre necesita al menos una sección." };
  }

  const maleteroH = recipe.maletero?.heightCm ?? 0;
  if (recipe.maletero && maleteroH < TOWER_MIN_SECTION_HEIGHT_CM) {
    return { ok: false, error: `El maletero no puede medir menos de ${TOWER_MIN_SECTION_HEIGHT_CM} cm.` };
  }

  const available = recipe.totalHeightCm - maleteroH;
  if (available < TOWER_MIN_SECTION_HEIGHT_CM) {
    return { ok: false, error: "El alto total no alcanza para el maletero y una sección." };
  }

  const flagged = recipe.sections.reduce<number[]>((acc, s, i) => (s.flex ? [...acc, i] : acc), []);
  if (flagged.length > 1) {
    return { ok: false, error: "Solo una sección puede ser flexible." };
  }
  // With no explicit flex the topmost section absorbs the remainder. That is
  // what guarantees the tower always closes exactly against its opening, and
  // it degrades to "nothing moved" when the pinned heights already sum right.
  const flexIndex = flagged.length === 1 ? flagged[0] : recipe.sections.length - 1;

  let fixedSum = 0;
  for (let i = 0; i < recipe.sections.length; i++) {
    if (i === flexIndex) continue;
    const h = sectionHeightCm(recipe.sections[i]);
    if (h < TOWER_MIN_SECTION_HEIGHT_CM) {
      return { ok: false, error: `"${sectionLabel(recipe.sections[i])}" no puede medir menos de ${TOWER_MIN_SECTION_HEIGHT_CM} cm.` };
    }
    fixedSum += h;
  }

  const flexHeight = available - fixedSum;
  if (flexHeight < TOWER_MIN_SECTION_HEIGHT_CM) {
    const label = sectionLabel(recipe.sections[flexIndex]);
    return {
      ok: false,
      error: `No queda espacio para "${label}": necesita al menos ${TOWER_MIN_SECTION_HEIGHT_CM} cm y solo quedan ${Math.max(flexHeight, 0)} cm.`,
    };
  }

  const sections: ResolvedSection[] = [];
  let cursor = 0;
  for (let i = 0; i < recipe.sections.length; i++) {
    const heightCm = i === flexIndex ? flexHeight : sectionHeightCm(recipe.sections[i]);
    sections.push({ section: recipe.sections[i], heightCm, fromBottomCm: cursor });
    cursor += heightCm;
  }

  return { ok: true, sections, maleteroFromBottomCm: recipe.maletero ? cursor : null };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS, 9 tests.

- [ ] **Step 8: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean. Ignore any error whose path starts with `.next/` — those are dev-server-generated files, not source.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts types/closetTower.ts services/closetTower.ts services/closetTower.test.ts
git commit -m "feat(frontend): add Vitest and the closet tower height resolver"
```

---

### Task 2: Recipe → modules

**Files:**
- Modify: `frontend/services/closetTower.ts`, `frontend/services/closetTower.test.ts`
- Modify: `frontend/types/kitchen.ts` (one new optional field on `ModuleOptions`)

**Interfaces:**
- Consumes: `resolveTowerHeights`, `TOWER_CONTENT_DEFAULTS` (Task 1); `DEFAULT_OPTIONS` and `getCatalogEntry` from `@/services/kitchenData`.
- Produces: `generateTowerModules(recipe, opts?): KitchenModule[]`, and `ModuleOptions.towerGroupId?: string`.

- [ ] **Step 1: Add the group marker to module options**

In `frontend/types/kitchen.ts`, inside `ModuleOptions`, right after the `locked` field:

```ts
  // The TowerRecipe this module was generated from (see types/closetTower.ts).
  // Lives in options — not as a top-level KitchenModule field — so it rides
  // the existing free-form JSON persistence with no backend migration, the
  // same trick `locked` uses. Absent on every hand-placed module.
  towerGroupId?: string;
```

- [ ] **Step 2: Write the failing tests**

Append to `frontend/services/closetTower.test.ts`:

```ts
import { generateTowerModules } from "@/services/closetTower";

describe("generateTowerModules", () => {
  it("emits one module per section, stacked bottom to top", () => {
    const mods = generateTowerModules(recipe({ maletero: { heightCm: 40, doorCount: 1 } }));
    expect(mods.map((m) => m.type)).toEqual(["cajonera_closet", "nicho_closet", "nicho_closet"]);
    expect(mods.map((m) => m.options.mountHeight)).toEqual([0, 90, 115]);
    expect(mods.map((m) => m.dimensions.height)).toEqual([90, 25, 85]);
    for (const m of mods) {
      expect(m.dimensions.width).toBe(40);
      expect(m.dimensions.depth).toBe(60);
      expect(m.category).toBe("closet");
      expect(m.options.towerGroupId).toBe("t1");
    }
  });

  it("gives every section a deterministic id so regeneration is stable", () => {
    const first = generateTowerModules(recipe());
    const again = generateTowerModules(recipe());
    expect(first.map((m) => m.id)).toEqual(again.map((m) => m.id));
    expect(first[0].id).toBe("t1__a");
  });

  it("maps each content to its module type and count option", () => {
    const mods = generateTowerModules(
      recipe({
        // 280, not the 240 default: these four sections' typical heights sum
        // to 255 (90+40+100+25), so at 240 the flex section would be squeezed
        // to 10cm, the recipe would refuse to resolve, and the generator would
        // correctly return [] — leaving this test asserting against nothing.
        totalHeightCm: 280,
        sections: [
          section({ id: "a", content: "cajones", count: 3 }),
          section({ id: "b", content: "repisas", count: 5 }),
          section({ id: "c", content: "colgar", count: 2 }),
          section({ id: "d", content: "hueco" }),
        ],
      }),
    );
    expect(mods[0].options.drawers).toBe(3);
    expect(mods[1].options.shelves).toBe(5);
    expect(mods[2].type).toBe("tubo_ropa_closet");
    expect(mods[2].options.rods).toBe(2);
    expect(mods[3].options.shelves).toBe(0);
  });

  it("puts doors on a section that asked for them, and never emits the two-zone type", () => {
    const mods = generateTowerModules(
      recipe({
        sections: [
          section({ id: "a", content: "repisas", doors: 2 }),
          section({ id: "b", content: "hueco" }),
        ],
      }),
    );
    expect(mods[0].options.doors).toBe(2);
    expect(mods[1].options.doors).toBe(0);
    expect(mods.some((m) => m.type === "nicho_doble_puerta_closet")).toBe(false);
  });

  it("emits nothing when the recipe does not resolve", () => {
    expect(generateTowerModules(recipe({ sections: [] }))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `generateTowerModules` is not exported.

- [ ] **Step 4: Implement the generator**

Append to `frontend/services/closetTower.ts`:

```ts
import { DEFAULT_OPTIONS, getCatalogEntry } from "@/services/kitchenData";
import type { BoardMaterial, KitchenModule, KitchenModuleType, ModuleOptions } from "@/types/kitchen";

const CONTENT_MODULE_TYPE: Record<TowerContent, KitchenModuleType> = {
  cajones: "cajonera_closet",
  repisas: "nicho_closet",
  hueco: "nicho_closet",
  colgar: "tubo_ropa_closet",
};

function countOptionsFor(section: TowerSection): Partial<ModuleOptions> {
  const count = section.count ?? TOWER_CONTENT_DEFAULTS[section.content].count;
  switch (section.content) {
    case "cajones":
      return { drawers: count };
    case "repisas":
      return { shelves: count };
    case "hueco":
      return { shelves: 0 };
    case "colgar":
      return { rods: count };
  }
}

// Turns a recipe into the modules that make it. Returns [] when the recipe
// doesn't resolve — callers validate with resolveTowerHeights first and show
// its message; generating a half-tower is never the right answer.
export function generateTowerModules(recipe: TowerRecipe, opts?: { boardMaterial?: string }): KitchenModule[] {
  const resolution = resolveTowerHeights(recipe);
  if (!resolution.ok) return [];

  const board: Partial<ModuleOptions> = opts?.boardMaterial
    ? { boardMaterial: opts.boardMaterial as BoardMaterial }
    : {};

  return resolution.sections.map(({ section, heightCm, fromBottomCm }) => {
    const type = CONTENT_MODULE_TYPE[section.content];
    const entry = getCatalogEntry(type)!;
    return {
      // Deterministic, so a section keeps its module identity across
      // regenerations — the seller's selection survives an edit, and only
      // what actually changed churns.
      id: `${recipe.id}__${section.id}`,
      category: "closet",
      type,
      label: `${sectionLabel(section)} · ${recipe.label}`,
      dimensions: { height: heightCm, width: recipe.widthCm, depth: recipe.depthCm },
      x: recipe.x,
      z: recipe.z,
      rotation: recipe.rotation,
      options: {
        ...DEFAULT_OPTIONS,
        ...entry.defaultOptions,
        ...board,
        ...countOptionsFor(section),
        doors: section.doors,
        mountHeight: fromBottomCm,
        towerGroupId: recipe.id,
      },
    };
  });
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS, 14 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `cd frontend && npx tsc --noEmit` (ignore `.next/` paths). Then:

```bash
git add types/kitchen.ts services/closetTower.ts services/closetTower.test.ts
git commit -m "feat(frontend): generate closet modules from a tower recipe"
```

---

### Task 3: Maletero runs

**Files:**
- Modify: `frontend/services/closetTower.ts`, `frontend/services/closetTower.test.ts`

**Interfaces:**
- Consumes: `resolveTowerHeights`, `generateTowerModules` (Tasks 1–2).
- Produces: `generateMaleteroModules(recipes: TowerRecipe[], opts?): KitchenModule[]` and `generateAllTowerModules(recipes, opts): KitchenModule[]` — the one the store calls.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/services/closetTower.test.ts`:

```ts
import { generateAllTowerModules, generateMaleteroModules } from "@/services/closetTower";

const withMaletero = (over: Partial<TowerRecipe>) =>
  recipe({ maletero: { heightCm: 40, doorCount: 1 }, ...over });

describe("generateMaleteroModules", () => {
  it("emits one wide module across two adjacent towers", () => {
    const a = withMaletero({ id: "a", x: 0, z: 0, widthCm: 40 });
    const b = withMaletero({ id: "b", x: 40, z: 0, widthCm: 40 });
    const mods = generateMaleteroModules([a, b]);
    expect(mods).toHaveLength(1);
    expect(mods[0].dimensions.width).toBe(80);
    expect(mods[0].x).toBe(20);
    expect(mods[0].options.mountHeight).toBe(200);
    expect(mods[0].options.doors).toBe(1);
    expect(mods[0].options.doorHingeSides).toEqual(["arriba"]);
  });

  it("keeps separate maleteros for towers that are not adjacent", () => {
    const a = withMaletero({ id: "a", x: 0, widthCm: 40 });
    const b = withMaletero({ id: "b", x: 300, widthCm: 40 });
    expect(generateMaleteroModules([a, b])).toHaveLength(2);
  });

  it("does not merge towers whose stacks end at different heights", () => {
    const a = withMaletero({ id: "a", x: 0, widthCm: 40, totalHeightCm: 240 });
    const b = withMaletero({ id: "b", x: 40, widthCm: 40, totalHeightCm: 200 });
    expect(generateMaleteroModules([a, b])).toHaveLength(2);
  });

  it("splits a run when the middle tower loses its maletero", () => {
    const a = withMaletero({ id: "a", x: 0, widthCm: 40 });
    const b = recipe({ id: "b", x: 40, widthCm: 40, maletero: null });
    const c = withMaletero({ id: "c", x: 80, widthCm: 40 });
    const mods = generateMaleteroModules([a, b, c]);
    expect(mods).toHaveLength(2);
    expect(mods.every((m) => m.dimensions.width === 40)).toBe(true);
  });

  it("spreads the requested door count across the merged opening", () => {
    const a = withMaletero({ id: "a", x: 0, widthCm: 40, maletero: { heightCm: 40, doorCount: 2 } });
    const b = withMaletero({ id: "b", x: 40, widthCm: 40, maletero: { heightCm: 40, doorCount: 2 } });
    const mods = generateMaleteroModules([a, b]);
    expect(mods[0].options.doors).toBe(2);
    expect(mods[0].options.doorHingeSides).toEqual(["arriba", "arriba"]);
    expect(mods[0].options.doorPistons).toEqual([true, true]);
  });

  it("emits nothing when no tower has a maletero", () => {
    expect(generateMaleteroModules([recipe({ maletero: null })])).toEqual([]);
  });
});

describe("generateAllTowerModules", () => {
  it("returns the sections of every tower plus the merged maleteros", () => {
    const a = withMaletero({ id: "a", x: 0, widthCm: 40 });
    const b = withMaletero({ id: "b", x: 40, widthCm: 40 });
    const mods = generateAllTowerModules([a, b]);
    expect(mods).toHaveLength(7); // 3 sections × 2 towers + 1 merged maletero
    expect(mods.filter((m) => m.options.doorHingeSides?.[0] === "arriba")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — neither function is exported.

- [ ] **Step 3: Implement the run resolver**

Append to `frontend/services/closetTower.ts`:

```ts
// Two towers count as touching when their edges are this close (cm).
const TOWER_ADJACENCY_TOLERANCE_CM = 1;

// The stack top a tower's maletero rests on — everything below the maletero.
function stackTopCm(recipe: TowerRecipe): number {
  return recipe.totalHeightCm - (recipe.maletero?.heightCm ?? 0);
}

// Rotation decides which world axis runs along a module's own width — the
// same convention the 3D scene's footprint math uses.
function alongIsX(rotation: TowerRecipe["rotation"]): boolean {
  return !(rotation === 90 || rotation === 270);
}

// Contiguous groups of towers whose maleteros form one opening: same
// rotation, depth, stack top and maletero height, edge to edge along their
// width. Anything else stays its own run, which is also physically true —
// two stacks of different heights cannot share one flat lid.
function maleteroRuns(recipes: TowerRecipe[]): TowerRecipe[][] {
  const withMaletero = recipes.filter((r) => r.maletero !== null);
  const runs: TowerRecipe[][] = [];

  // The numeric parts of the key are quantised to the same resolution the
  // adjacency test uses. Membership in a run must not hinge on exact float
  // equality when the adjacency check beside it already does not — two
  // towers meant for the same row whose across-coordinate drifted by a
  // rounding error would otherwise split into two maleteros.
  const q = (n: number) => Math.round(n / TOWER_ADJACENCY_TOLERANCE_CM);
  for (const group of groupBy(withMaletero, (r) =>
    [r.rotation, r.depthCm, q(stackTopCm(r)), q(r.maletero!.heightCm), q(alongIsX(r.rotation) ? r.z : r.x)].join("|"),
  )) {
    const sorted = [...group].sort((a, b) => alongCoord(a) - alongCoord(b));
    let current: TowerRecipe[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = current[current.length - 1];
      const gap = alongCoord(sorted[i]) - sorted[i].widthCm / 2 - (alongCoord(prev) + prev.widthCm / 2);
      if (Math.abs(gap) <= TOWER_ADJACENCY_TOLERANCE_CM) current.push(sorted[i]);
      else {
        runs.push(current);
        current = [sorted[i]];
      }
    }
    runs.push(current);
  }
  return runs;
}

function alongCoord(r: TowerRecipe): number {
  return alongIsX(r.rotation) ? r.x : r.z;
}

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return [...map.values()];
}

// One module per run — never one per tower. A wide module with N doors is an
// ordinary module in this codebase, which is what makes "one lid, or two, or
// N" free instead of new geometry. See the spec's §4.
export function generateMaleteroModules(recipes: TowerRecipe[], opts?: { boardMaterial?: string }): KitchenModule[] {
  const entry = getCatalogEntry("nicho_closet")!;
  const board: Partial<ModuleOptions> = opts?.boardMaterial
    ? { boardMaterial: opts.boardMaterial as BoardMaterial }
    : {};

  return maleteroRuns(recipes).map((run) => {
    const first = run[0];
    const totalWidth = run.reduce((n, r) => n + r.widthCm, 0);
    const min = alongCoord(first) - first.widthCm / 2;
    const centerAlong = min + totalWidth / 2;
    const across = alongIsX(first.rotation) ? first.z : first.x;
    // Max, not the first tower's: a run's door count must not depend on
    // which tower happens to sort leftmost, or dragging two towers past
    // each other would silently change how many lids the merged opening
    // gets. A wider opening also never wants fewer doors than the
    // narrowest declaration in it.
    const doorCount = Math.max(1, ...run.map((r) => r.maletero!.doorCount));

    return {
      id: `${run.map((r) => r.id).join("+")}__maletero`,
      category: "closet",
      type: "nicho_closet",
      label: run.length > 1 ? "Maletero" : `Maletero · ${first.label}`,
      dimensions: { height: first.maletero!.heightCm, width: totalWidth, depth: first.depthCm },
      x: alongIsX(first.rotation) ? centerAlong : across,
      z: alongIsX(first.rotation) ? across : centerAlong,
      rotation: first.rotation,
      options: {
        ...DEFAULT_OPTIONS,
        ...entry.defaultOptions,
        ...board,
        shelves: 0,
        doors: doorCount,
        // A lift-up lid this size needs the strut; the seller can turn an
        // individual one off in the inspector afterwards.
        doorHingeSides: Array.from({ length: doorCount }, () => "arriba" as const),
        doorPistons: Array.from({ length: doorCount }, () => true),
        mountHeight: stackTopCm(first),
        towerGroupId: first.id,
      },
    };
  });
}

// What the store writes into the draft: every tower's sections, plus the
// merged maleteros across them.
export function generateAllTowerModules(recipes: TowerRecipe[], opts?: { boardMaterial?: string }): KitchenModule[] {
  return [...recipes.flatMap((r) => generateTowerModules(r, opts)), ...generateMaleteroModules(recipes, opts)];
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS, 21 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `cd frontend && npx tsc --noEmit` (ignore `.next/`). Then:

```bash
git add services/closetTower.ts services/closetTower.test.ts
git commit -m "feat(frontend): merge adjacent tower maleteros into one module"
```

---

### Task 4: Backend — persist the recipes

**Files:**
- Create: `backend/database/migrations/2026_08_21_120000_add_towers_to_kitchen_projects.php`
- Modify: `backend/app/Models/KitchenProject.php`, `backend/app/Http/Controllers/KitchenProjectController.php`
- Test: `backend/tests/Feature/KitchenProjectTowersTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `kitchen_projects.towers` (nullable json, cast to array), accepted on `store` and on the full-design `update`, returned by `index`/`show`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/KitchenProjectTowersTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\KitchenProject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KitchenProjectTowersTest extends TestCase
{
    use RefreshDatabase;

    private function recipe(): array
    {
        return [
            'id' => 't1',
            'label' => 'Torre recámara',
            'widthCm' => 40,
            'depthCm' => 60,
            'totalHeightCm' => 240,
            'sections' => [
                ['id' => 'a', 'content' => 'cajones', 'doors' => 0],
                ['id' => 'b', 'content' => 'repisas', 'doors' => 2],
            ],
            'maletero' => ['heightCm' => 40, 'doorCount' => 1],
            'x' => 100,
            'z' => 30,
            'rotation' => 0,
        ];
    }

    public function test_store_persists_towers(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $response = $this->postJson('/api/kitchen-projects', [
            'project_name' => 'Clóset', 'project_type' => 'closet',
            'room_width' => 400, 'room_depth' => 300, 'ceiling_height' => 240,
            'towers' => [$this->recipe()],
        ])->assertStatus(201);

        $project = KitchenProject::find($response->json('id'));
        $this->assertCount(1, $project->towers);
        $this->assertSame('Torre recámara', $project->towers[0]['label']);
        $this->assertCount(2, $project->towers[0]['sections']);
        $this->assertSame(40, $project->towers[0]['maletero']['heightCm']);
    }

    public function test_towers_default_to_an_empty_list(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/kitchen-projects', [
            'project_name' => 'Cocina', 'project_type' => 'cocina',
            'room_width' => 400, 'room_depth' => 300, 'ceiling_height' => 240,
        ])->assertStatus(201);

        $this->assertSame([], KitchenProject::find($response->json('id'))->towers);
    }

    public function test_update_replaces_towers(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        $project = KitchenProject::create([
            'user_id' => $admin->id, 'project_name' => 'Clóset', 'room_width' => 400,
            'room_depth' => 300, 'ceiling_height' => 240, 'openings' => [],
            'project_type' => 'closet', 'towers' => [$this->recipe()],
        ]);

        $this->putJson("/api/kitchen-projects/{$project->id}", ['towers' => []])
            ->assertStatus(200);

        $this->assertSame([], $project->fresh()->towers);
    }

    public function test_a_tower_needs_an_id_and_sections(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $bad = $this->recipe();
        unset($bad['id']);

        $this->postJson('/api/kitchen-projects', [
            'project_name' => 'Clóset', 'project_type' => 'closet',
            'room_width' => 400, 'room_depth' => 300, 'ceiling_height' => 240,
            'towers' => [$bad],
        ])->assertStatus(422)->assertJsonValidationErrors('towers.0.id');
    }

    public function test_show_returns_towers(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);

        $project = KitchenProject::create([
            'user_id' => $admin->id, 'project_name' => 'Clóset', 'room_width' => 400,
            'room_depth' => 300, 'ceiling_height' => 240, 'openings' => [],
            'project_type' => 'closet', 'towers' => [$this->recipe()],
        ]);

        $this->getJson("/api/kitchen-projects/{$project->id}")
            ->assertStatus(200)
            ->assertJsonPath('towers.0.id', 't1');
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && php artisan test --filter=KitchenProjectTowersTest`
Expected: FAIL — the column does not exist.

- [ ] **Step 3: Write the migration**

Create `backend/database/migrations/2026_08_21_120000_add_towers_to_kitchen_projects.php`:

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
            // Closet tower recipes — the source of truth the generated
            // modules are rebuilt from. Same shape of column as `openings`.
            $table->json('towers')->nullable()->after('openings');
        });
    }

    public function down(): void
    {
        Schema::table('kitchen_projects', function (Blueprint $table) {
            $table->dropColumn('towers');
        });
    }
};
```

- [ ] **Step 4: Model**

In `backend/app/Models/KitchenProject.php`, add `'towers',` to `$fillable` after `'openings',`, and to `$casts` after the `openings` line:

```php
        'towers' => 'array',
```

- [ ] **Step 5: Controller**

In `KitchenProjectController::store`, add to the validate array after the `openings.*` rules:

```php
            'towers'                     => 'nullable|array',
            'towers.*.id'                => 'required|string|max:60',
            'towers.*.label'             => 'required|string|max:120',
            'towers.*.widthCm'           => 'required|numeric|min:1',
            'towers.*.depthCm'           => 'required|numeric|min:1',
            'towers.*.totalHeightCm'     => 'required|numeric|min:1',
            'towers.*.sections'          => 'required|array|min:1',
            'towers.*.sections.*.id'     => 'required|string|max:60',
            'towers.*.sections.*.content' => ['required', Rule::in(['cajones', 'repisas', 'hueco', 'colgar'])],
            'towers.*.sections.*.doors'  => 'required|integer|min:0|max:2',
            'towers.*.maletero'          => 'nullable|array',
            'towers.*.maletero.heightCm' => 'required_with:towers.*.maletero|numeric|min:1',
            'towers.*.maletero.doorCount' => 'required_with:towers.*.maletero|integer|min:1',
            'towers.*.x'                 => 'required|numeric',
            'towers.*.z'                 => 'required|numeric',
            'towers.*.rotation'          => ['required', Rule::in([0, 90, 180, 270])],
```

and to the `KitchenProject::create([...])` array, after `'openings'`:

```php
                'towers'           => $validated['towers'] ?? [],
```

Add the **same block of rules** to `update`'s full-design validate array (the second one, not the status-only path), and make sure `towers` reaches the model update the same way the other validated fields do. A tower recipe is design data, so it follows `openings`, not `project_type`: replaceable on update, gated by `design-projects`.

- [ ] **Step 6: Run the tests**

Run: `cd backend && php artisan test --filter=KitchenProjectTowersTest`
Expected: PASS, 5 tests.

- [ ] **Step 7: Full suite**

Run: `cd backend && php artisan test`
Expected: PASS. If `test_towers_default_to_an_empty_list` fails because a row created straight through the model returns `null` rather than `[]`, set the column default in the migration with `->default(new Expression("('[]')"))`, or normalise in an accessor — pick the one that keeps the other tests green and say which in your report.

- [ ] **Step 8: Commit**

```bash
git add database/migrations/2026_08_21_120000_add_towers_to_kitchen_projects.php app/Models/KitchenProject.php app/Http/Controllers/KitchenProjectController.php tests/Feature/KitchenProjectTowersTest.php
git commit -m "feat(backend): persist closet tower recipes on kitchen projects"
```

---

### Task 5: Frontend — carry `towers` through the draft and the API

**Files:**
- Modify: `frontend/types/kitchen.ts`, `frontend/services/api.ts`, `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `TowerRecipe` (Task 1); `towers` on the API (Task 4).
- Produces: `KitchenDraft.towers: TowerRecipe[]`, round-tripped through the API and defaulted in `initialDraft`.

- [ ] **Step 1: Add the draft field**

In `frontend/types/kitchen.ts`, inside `KitchenDraft` after `openings`:

```ts
  // Closet tower recipes — the source of truth the generated closet modules
  // are rebuilt from. See types/closetTower.ts.
  towers: TowerRecipe[];
```

Add `import type { TowerRecipe } from "@/types/closetTower";` at the top of the file.

- [ ] **Step 2: Round-trip it through the API**

In `frontend/services/api.ts`:
- add `towers: TowerRecipe[] | null;` to `interface BackendKitchenProject`, after `openings`
- add `towers: json.towers ?? [],` to `mapKitchenResponseToDraft`, after the `openings` line
- add `towers: draft.towers,` to `mapKitchenPayload`, after `openings`

Import `TowerRecipe` as a type from `@/types/closetTower`.

- [ ] **Step 3: Default it in the store**

In `frontend/store/useKitchenStore.ts`, add `towers: [],` to `initialDraft` after `openings: [],`.

The persist `migrate` already backfills any missing draft field via `{ ...initialDraft, ...state.draft }`, **but it only runs when the stored version differs**. Bump `version` from `2` to `3` and extend the comment above it the way the v2 bump did, or a returning user's draft comes back with `towers` undefined and the tower list crashes on `.map`.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit` (ignore `.next/`).
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add types/kitchen.ts services/api.ts store/useKitchenStore.ts
git commit -m "feat(frontend): carry tower recipes through the draft and API"
```

---

### Task 6: Store actions — add, edit, remove a tower

**Files:**
- Modify: `frontend/store/useKitchenStore.ts`

**Interfaces:**
- Consumes: `generateAllTowerModules` (Task 3); `draft.towers` (Task 5).
- Produces: `addTower(recipe)`, `updateTower(recipe)`, `removeTower(towerId)` on the store.

- [ ] **Step 1: Declare the actions**

In the store's interface, after `duplicateModule`:

```ts
  // A tower's recipe is the source of truth; its modules are regenerated
  // from the whole recipe list every time any of them changes, because a
  // maletero can span several towers (see services/closetTower.ts).
  addTower: (recipe: TowerRecipe) => void;
  updateTower: (recipe: TowerRecipe) => void;
  removeTower: (towerId: string) => void;
```

- [ ] **Step 2: Implement them**

```ts
      addTower: (recipe) =>
        set((s) => applyTowers(s, [...s.draft.towers, recipe])),

      updateTower: (recipe) =>
        set((s) => applyTowers(s, s.draft.towers.map((t) => (t.id === recipe.id ? recipe : t)))),

      removeTower: (towerId) =>
        set((s) => applyTowers(s, s.draft.towers.filter((t) => t.id !== towerId))),
```

and above the store's `create(...)` call, the shared helper:

```ts
// Every tower change regenerates every tower's modules, not just the one
// that changed: a maletero spans a run of adjacent towers, so adding or
// removing one tower can widen, narrow or split a neighbour's maletero.
// Hand-placed modules (no towerGroupId) are untouched.
function applyTowers(s: { draft: KitchenDraft }, towers: TowerRecipe[]) {
  const handPlaced = s.draft.modules.filter((m) => !m.options.towerGroupId);
  return {
    draft: { ...s.draft, towers, modules: [...handPlaced, ...generateAllTowerModules(towers)] },
    // Regeneration replaces a whole set of modules at once; the undo stack
    // is per-module, so it is cleared rather than left describing modules
    // that no longer exist.
    undoStack: [],
    redoStack: [],
  };
}
```

Import `generateAllTowerModules` from `@/services/closetTower` and `TowerRecipe` as a type.

- [ ] **Step 3: Delete a tower when its modules are deleted**

In `removeModule`, before removing: if the module carries `options.towerGroupId`, call the same regeneration path with that tower dropped from `draft.towers` — half a tower is not a thing (spec §5). Implement it as an early branch:

```ts
      removeModule: (id) =>
        set((s) => {
          const target = s.draft.modules.find((m) => m.id === id);
          if (target?.options.towerGroupId) {
            return applyTowers(s, s.draft.towers.filter((t) => t.id !== target.options.towerGroupId));
          }
          // ...existing body unchanged...
```

- [ ] **Step 4: Keep the recipe in sync when a tower is dragged**

Without this the feature has a real defect: dragging a generated module moves
the module but not `recipe.x/z`, so the next regeneration teleports the tower
back to where the recipe still thinks it is.

In `updateModulePosition`, when the moved module carries a `towerGroupId`,
write the new `x`/`z`/`rotation` onto that recipe and regenerate instead of
running the normal single-module path:

```ts
      updateModulePosition: (id, x, z, rotation, mountHeightCm, islandMode) =>
        set((s) => {
          const current = s.draft.modules.find((m) => m.id === id);
          if (!current || current.options.locked) return {};
          // A generated tower moves as a whole and its recipe is what
          // remembers where it is — regenerate from the moved recipe rather
          // than nudging one module out of a set that will be rebuilt.
          const groupId = current.options.towerGroupId;
          if (groupId) {
            return applyTowers(
              s,
              s.draft.towers.map((t) =>
                t.id === groupId ? { ...t, x, z, rotation: rotation ?? t.rotation } : t,
              ),
            );
          }
          // ...existing body unchanged...
```

**This makes merging automatic and removes the need for the spec's "Unir
maleteros" button.** Because `applyTowers` regenerates over the whole recipe
list, pushing two towers together re-runs the run computation and their
maleteros fuse on the spot; pulling them apart splits them again. The spec
said merging would only ever happen at configuration time and offered an
explicit action instead — this is better, and the spec has been amended to
match. Do not build the button.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit` (ignore `.next/`).
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add store/useKitchenStore.ts
git commit -m "feat(frontend): add, edit, move and remove closet towers in the store"
```

---

### Task 7: The tower dialog

**Files:**
- Create: `frontend/components/kitchen/TowerDialog.tsx`

**Interfaces:**
- Consumes: `TOWER_CONTENT_DEFAULTS`, `resolveTowerHeights`, `sectionLabel` (Task 1); `addTower`/`updateTower` (Task 6).
- Produces: `<TowerDialog open recipe onClose />` — `recipe` null means "new tower".

- [ ] **Step 1: Build the dialog**

Create `frontend/components/kitchen/TowerDialog.tsx`. Requirements, all of them load-bearing:

- **Header fields:** ancho, fondo, alto total (cm). A new tower starts at 40 / 60 / 240, or copies the last tower in `draft.towers` if there is one.
- **The strip**, rendered bottom-to-top *visually* (so the array's first element draws at the bottom): one band per section, its flex-basis proportional to the height `resolveTowerHeights` gave it, so the strip reads as the closet's front. Each band shows its label, its resolved height in small grey text, and its door state.
- **Tapping a band** opens its controls inline: contenido (4 buttons), puerta (sin · 1 · 2), cantidad (only for `cajones`/`repisas`/`colgar`), altura in cm (empty = automatic), and Quitar.
- **+ Agregar sección arriba** appends to the end of the array.
- **Maletero** toggle above the strip with height (default 40) and door count (default 1).
- **Live validation:** call `resolveTowerHeights` on every change. When it returns `ok: false`, show `error` in place of the strip's total and **disable Aceptar** — never generate an unresolvable tower.
- **Aceptar** calls `addTower` for a new recipe or `updateTower` for an existing one, then closes. **Cancelar** closes and writes nothing.
- Generate section ids with `crypto.randomUUID()`; the recipe id likewise for a new tower.
- Editing an existing tower shows a one-time notice that accepting replaces the tower's modules, so inspector tweaks made to a generated module are lost.
- Follow `NewProjectModal.tsx` for the overlay/panel/backdrop-click structure and `ModuleInspector.tsx` for field styling; Spanish copy with accents throughout.

The state and the accept/validate wiring, which are the load-bearing parts — the markup follows the two reference components above:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useKitchenStore } from "@/store/useKitchenStore";
import { resolveTowerHeights, sectionLabel, TOWER_CONTENT_DEFAULTS } from "@/services/closetTower";
import type { TowerContent, TowerRecipe, TowerSection } from "@/types/closetTower";

const NEW_SECTION = (content: TowerContent): TowerSection => ({
  id: crypto.randomUUID(),
  content,
  doors: 0,
});

export function TowerDialog({ open, recipe, onClose }: {
  open: boolean;
  recipe: TowerRecipe | null;   // null = new tower
  onClose: () => void;
}) {
  const { draft, addTower, updateTower } = useKitchenStore();
  const isEdit = recipe !== null;

  // A new tower copies the last one placed in this project, so the second
  // tower of a run doesn't have to be re-measured.
  const last = draft.towers[draft.towers.length - 1];
  const [work, setWork] = useState<TowerRecipe>(
    () =>
      recipe ?? {
        id: crypto.randomUUID(),
        label: `Torre ${draft.towers.length + 1}`,
        widthCm: last?.widthCm ?? 40,
        depthCm: last?.depthCm ?? 60,
        totalHeightCm: last?.totalHeightCm ?? 240,
        sections: [NEW_SECTION("cajones")],
        maletero: null,
        x: draft.roomWidth / 2,
        z: draft.roomDepth / 2,
        rotation: 0,
      },
  );

  // Recomputed on every edit: it drives the strip's proportions AND whether
  // Aceptar is enabled. A tower that doesn't resolve is never generated.
  const resolution = useMemo(() => resolveTowerHeights(work), [work]);

  if (!open) return null;

  const patch = (over: Partial<TowerRecipe>) => setWork((w) => ({ ...w, ...over }));
  const patchSection = (id: string, over: Partial<TowerSection>) =>
    patch({ sections: work.sections.map((s) => (s.id === id ? { ...s, ...over } : s)) });
  const removeSection = (id: string) =>
    patch({ sections: work.sections.filter((s) => s.id !== id) });
  const addSection = () => patch({ sections: [...work.sections, NEW_SECTION("repisas")] });

  const accept = () => {
    if (!resolution.ok) return;
    if (isEdit) updateTower(work);
    else addTower(work);
    onClose();
  };

  // Render, bottom-to-top: the array's first element is the bottom section,
  // so the strip reverses it for display while every edit still addresses
  // sections by id.
  const bands = resolution.ok ? [...resolution.sections].reverse() : [];

  return null; // replace with the markup described above
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit` (ignore `.next/`).
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/kitchen/TowerDialog.tsx
git commit -m "feat(frontend): closet tower composer dialog"
```

---

### Task 8: Wire the Torres group and the edit entry point

**Files:**
- Modify: `frontend/components/kitchen/ModuleSelector.tsx`, `frontend/components/kitchen/ModuleInspector.tsx`

**Interfaces:**
- Consumes: `<TowerDialog>` (Task 7); `draft.towers` (Task 5).
- Produces: nothing further.

- [ ] **Step 1: Make the Torres group open the dialog**

`closet_torres` matches no catalog entry, so its group view currently renders the "Próximamente" empty state. Special-case it: when the open group's id is `closet_torres`, render a single **Torre personalizada** tile instead of the module grid, and clicking it opens `<TowerDialog recipe={null}>`. Leave every other group's rendering untouched.

Templates land here in the follow-up plan; this task deliberately ships the group with one tile.

- [ ] **Step 2: Add "Editar torre"**

In `ModuleInspector`, when the selected module has `options.towerGroupId`, replace the normal dimension/option fields with a short panel: the tower's label, a line saying this module is part of a generated tower, and two buttons — **Editar torre** (opens `<TowerDialog>` on that recipe, looked up in `draft.towers`) and **Quitar torre** (calls `removeTower`).

Hiding the normal fields is the point: hand-editing a generated module's height would be silently discarded on the next regeneration.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit` (ignore `.next/`).
Expected: clean.

- [ ] **Step 4: Manual verification**

Start the app (`npm run dev` in `frontend/`, `php artisan serve` in `backend/`) and, in a **closet** project:

1. Torres → Torre personalizada → build cajones + hueco + repisas, maletero on → Aceptar. Three modules plus a maletero appear, stacked, and the 3D view shows them as one tower with joined panels.
2. Resumen lists one shared cut list for the tower, not four independent boxes.
3. Add a second tower beside the first, both with maletero: **one** wide maletero, not two.
4. Remove the middle tower of a three-tower run: the maletero splits in two.
5. Select a generated module → Editar torre → turn the maletero off → Aceptar: the maletero module disappears, the rest of the tower is unchanged.
6. Save, reload the page, reopen the project: the towers are still there and still editable.
7. Set a tower's alto total to 100 with cajones + colgar: Aceptar is disabled and the error names the squeezed section.

- [ ] **Step 5: Commit**

```bash
git add components/kitchen/ModuleSelector.tsx components/kitchen/ModuleInspector.tsx
git commit -m "feat(frontend): open the tower composer from the Torres group"
```

---

## Follow-up plan (not this one)

Starred templates — spec §6 — are a separate plan: a `closet_tower_templates` table, a controller under `can:design-projects`, a star button on a placed tower, and template tiles in the Torres group. This plan deliberately ships the tower first, because a tower you can build is worth something on its own and a template of nothing is not.

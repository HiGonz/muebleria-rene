# Torre de Horno/Microondas Configurable — Design

## Problem

`torre_horno_microondas` and `torre_horno_empotrado` are each a single
fixed-shape module: one oven niche, optionally a microwave niche, and
exactly two configurable "zones" (above and below the appliances), each
independently `puerta`/`cajones`/`abierto`. A seller who wants, say, two
ovens stacked, or a bank of drawers between the oven and the microwave,
or three sections instead of two, cannot do it — the shape is baked into
`resolveMicroondasZonePlan`/`resolveEmpotradoZonePlan` and their matching
meshes in `ModulePreview3D.tsx`.

The closet tower composer already solved exactly this class of problem —
compose a vertical column from an ordered list of sections, resolve
heights automatically, generate real modules, save a favorite — for
`cajones`/`repisas`/`hueco`/`colgar`/`zapatera`. This spec extends the
same idea to a kitchen tower whose sections can also be an oven or a
microwave niche, with no fixed shape and no section-count limit.

## Goals

- A seller composes an oven/microwave tower bottom to top, in any order,
  with any number of sections — including zero, one, or several ovens
  and/or microwaves mixed with door/drawer/open sections.
- Each generated section is a **real, fully-configurable module** —
  hinge, corredera, board material, color, shelf/drawer count, all of
  it — edited through the normal Inspector, exactly like a hand-placed
  `gabinete_bajo_puertas` would be. This is the one point where this
  design deliberately departs from the closet tower: closet sections are
  edited only inside the tower dialog and any hand-edit is discarded on
  the next regeneration; here the hand-edit is what persists.
- The recipe survives every edit — adding a section elsewhere in the
  tower must never erase a hinge/material choice already made on another
  section.
- Starring a tower saves it as a reusable template, shop-wide, the same
  way a closet tower template works — including a live-redrawn elevation
  ("el SVG") as its thumbnail, not a stored image.
- `torre_horno_microondas` and `torre_horno_empotrado` come out of the
  module catalog (no longer offered for a *new* module) — existing
  projects that already used them keep rendering and costing exactly as
  they do today, unmigrated.

## Non-goals

- **Editing width/depth/position per section.** A tower is one column —
  every section shares the tower's own `widthCm`/`depthCm`, edited only
  in the tower dialog's header, exactly like closet.
- **A maletero, or any closet-specific content** (`colgar`, `zapatera`,
  `hueco`). This is a kitchen-only composer; closet's own tower system is
  untouched.
- **Merging two adjacent oven towers into one wider module.** That
  behavior is specific to a closet maletero's shared lid; there is
  nothing analogous here — two towers placed side by side just stay two
  independent towers/recipes.
- **Migrating existing `torre_horno_microondas`/`torre_horno_empotrado`
  modules into the new recipe shape.** They keep working unchanged (same
  precedent as the closet tower spec's own non-goals).
- **A generalized "any tower" engine shared between closet and oven
  towers.** The two now genuinely diverge (closet: minimal per-section
  fields, edited only in-dialog, regenerate-discards-edits; oven:
  full per-section `ModuleOptions`, edited in the normal Inspector,
  regenerate-preserves-edits) — sharing an engine would mean branching
  that behavior inside one abstraction instead of two straightforward,
  independently-readable modules. Building a second copy of a proven
  ~500-line pattern is worth it here; see `services/closetTower.ts` for
  the one being mirrored.

## Current state (verified against the code)

- `services/closetTower.ts` / `types/closetTower.ts` / `TowerDialog.tsx`
  / `TowerElevation.tsx` / `lib/towerTemplate.ts` implement the pattern
  being mirrored — recipe → `resolveTowerHeights` →
  `generateTowerModules` → real modules tagged
  `options.towerGroupId`/`towerRole`, regenerated wholesale on every
  recipe change via `useKitchenStore.ts`'s `applyTowers`. Full rationale
  in `docs/superpowers/specs/2026-08-20-closet-tower-design.md`.
- `ModuleInspector.tsx`'s `GeneratedTowerPanel` (around line 155)
  **replaces** the normal tabs/fields entirely whenever
  `module.options.towerGroupId` is set — this is precisely the behavior
  this spec's sections must NOT have; oven-tower sections keep the
  normal fields and get a small additional panel instead (see §4).
- `updateModule` (`store/useKitchenStore.ts` ~line 533) currently patches
  a module directly with no notion of tower lineage — the only reason a
  closet section's hand-edit doesn't stick today is that the Inspector
  never lets one be made (the fields are replaced). There is no existing
  interception point; §3 adds one.
- The oven/microwave niche visuals already exist and are reusable:
  `OvenNicheFront`/`MicrowaveNicheFront` in `ModulePreview3D.tsx` (~line
  1506/1550) draw a fixed, non-hinged appliance front sized by
  `heightCm`/`fromBottomCm`/`toeKick`, independent of whatever carcass
  they sit in. Neither is currently `export`ed.
- `gabinete_bajo_puertas` (1 or 2 doors, `defaultDimensions: {height:90,
  width:60, depth:60}`, `defaultOptions: {drawers:0, doors:2, shelves:1,
  doorStyle:"Lisa"}`), `gabinete_bajo_cajones` (`defaultOptions:
  {drawers:2, doors:2, shelves:1, drawerSystem:"corredera_softclose"}`)
  and `hueco_bajo_repisa` (`defaultOptions: {drawers:0, doors:0,
  shelves:1}`) already exist in the "lower" catalog and already render
  and cost correctly as ordinary standalone modules — no new module type
  needed for the `puertas`/`cajones`/`abierto` contents.
- `DEFAULT_OPTIONS.ovenHeight`/`microwaveHeight` default to 60/38 —
  reused as the new `horno`/`microondas` contents' typical heights.
- `CabinetMesh` in `ModulePreview3D.tsx` (~line 2477) is the dispatcher
  every "lower"/"upper"/"tower"/"corner"/"closet" module's mesh goes
  through; `torre_horno_microondas`/`torre_horno_empotrado` branch there
  (~line 2615) alongside other fixed-shape one-offs (`cava_vinos`,
  `corona_luz`, `cajon_hueco_superior`) — the same place the two new
  niche types' branches get added.
- `kitchen_projects.towers` is a nullable `json` column, validated at the
  project level as a loose `'nullable|array'`
  (`KitchenProjectController.php`), while the separate
  `closet-tower-templates` endpoint validates every recipe leaf
  explicitly (`ClosetTowerTemplateController::recipeRules`) because a
  closet section's vocabulary is small and fixed. An oven-tower
  section's `options` is meant to hold arbitrary `ModuleOptions` —
  the exact shape `modules.*.options` already persists with a loose
  `'array'` rule, never enumerated leaf by leaf. The new
  `oven-tower-templates` endpoint follows that looser precedent for
  `recipe.sections.*.options`, while still validating the recipe's own
  shape (label, dimensions, section content enum, structure).

## 1. The recipe

```ts
// types/ovenTower.ts
export type OvenTowerContent = "puertas" | "cajones" | "abierto" | "horno" | "microondas";

export interface OvenTowerSection {
  id: string;
  content: OvenTowerContent;
  // Omitted = the content's typical height (see §2). Set = pinned.
  heightCm?: number;
  // Absorbs the leftover height. At most one per tower; none set = the
  // topmost section absorbs it — same rule as closet.
  flex?: boolean;
  // Full per-section module options — whatever `gabinete_bajo_puertas`/
  // `gabinete_bajo_cajones`/`hueco_bajo_repisa` (or the two new niche
  // types) would carry: hinge side, drawerSystem, boardMaterial, color,
  // shelves, doors, etc. This is the field that makes a section's
  // configuration durable across regeneration — see §3. Meaningless
  // (left `{}`) for "horno"/"microondas": those two have no configurable
  // fields today, same as the current fixed towers.
  options: Partial<ModuleOptions>;
}

export interface OvenTowerRecipe {
  id: string;              // also written to every generated module
  label: string;
  widthCm: number;
  depthCm: number;
  totalHeightCm: number;
  sections: OvenTowerSection[]; // bottom → top
  x: number; z: number;
  rotation: 0 | 90 | 180 | 270;
}
```

**Where it lives.** `draft.ovenTowers: OvenTowerRecipe[]`, persisted
through a new nullable `oven_towers` json column on `kitchen_projects`
(same shape of change as `towers`, validated the same loose way). Every
generated module carries `options.ovenTowerGroupId = recipe.id` — a
*different* option key from closet's `towerGroupId`, deliberately: a
module must unambiguously belong to at most one of the two systems, and
reusing the same key would make `GeneratedTowerPanel`'s "replace the
whole Inspector" behavior fire for an oven-tower module too, which is
exactly the behavior §4 must avoid.

## 2. Heights resolve themselves

Same rule as closet's `resolveTowerHeights`, reimplemented in
`services/ovenTower.ts` as `resolveOvenTowerHeights` (own module: the
content vocabulary and the min-height floor are different enough that
sharing the function would mean threading a content-defaults map through
it as a parameter for a five-line body):

| Content | Typical height |
| --- | --- |
| `puertas` | 90 cm |
| `cajones` | 90 cm |
| `abierto` | 90 cm |
| `horno` | 60 cm (matches `DEFAULT_OPTIONS.ovenHeight`) |
| `microondas` | 38 cm (matches `DEFAULT_OPTIONS.microwaveHeight`) |

Fixed sections are summed; the flex section takes the remainder; under a
15cm floor is rejected with a message naming the squeezed section — same
`TOWER_MIN_SECTION_HEIGHT_CM` floor closet uses, reused as-is (it's a
generic "still furniture" floor, not closet-specific).

## 3. What the generator emits, and how edits survive it

`services/ovenTower.ts`'s `generateOvenTowerModules(recipe)`:

| Content | Module type | Options written |
| --- | --- | --- |
| `puertas` | `gabinete_bajo_puertas` | `...section.options` (doors/hingeSide/etc. come from there) |
| `cajones` | `gabinete_bajo_cajones` | `...section.options` |
| `abierto` | `hueco_bajo_repisa` | `...section.options` |
| `horno` | **new** `hueco_horno` | none beyond the shared finish |
| `microondas` | **new** `hueco_microondas` | none beyond the shared finish |

Every module gets `width: recipe.widthCm`, `depth: recipe.depthCm`, the
resolved section height, the recipe's `x/z/rotation`, `mountHeight` = the
sum of heights below it, `hasToeKick` only on the bottom-most section
(mirrors closet's identical rule), and a deterministic id
(`${recipe.id}__${section.id}`) so a section keeps its module identity
across regenerations.

**The persistence mechanism (the actual novel part of this spec).**
`useKitchenStore.ts`'s `updateModule(id, patch)` gains one branch: when
the existing module's `options.ovenTowerGroupId` is set, instead of
patching `s.draft.modules` directly it:

1. Finds that recipe in `draft.ovenTowers`.
2. Finds the section whose id matches (derived from the module's own id,
   `${groupId}__${sectionId}` — same trick `generateOvenTowerModules`
   used to build it).
3. Merges `patch.options` into that section's `options`, and
   `patch.dimensions?.height` into the section's `heightCm` (turning it
   from automatic into pinned — same semantics as typing a height in the
   closet dialog). `patch.dimensions?.width`/`depth`/`x`/`z`/`rotation`
   are ignored here (a section has no independent footprint or place —
   see the Non-goals); `updateModulePosition` already special-cases
   tower-group modules for closet and gets the same `ovenTowerGroupId`
   branch for the same reason.
4. Calls the oven-tower equivalent of `applyTowers` (`applyOvenTowers`)
   with the patched recipe, which regenerates every oven-tower module —
   the touched section now carries the merged options, so the edit
   reads back exactly as set.

This is one code path for every section edit, whether it comes from the
tower dialog (§4) or the normal Inspector (§5): both ultimately call
`updateModule`/`updateOpt`, which now always round-trips through the
recipe. Nothing about `ModuleInspector`'s per-type field rendering for
`gabinete_bajo_puertas`/`gabinete_bajo_cajones`/`hueco_bajo_repisa`
changes — they already render their full normal fields for any ordinary
module; an oven-tower section is, to that rendering code, an ordinary
module.

**`hueco_horno`/`hueco_microondas`.** New `TowerModuleType` entries
(category `"tower"`, same category `torre_horno_microondas`/
`torre_horno_empotrado` already use — `CabinetMesh`'s dispatch is keyed
by `module.type`, not category, so this choice only affects
catalog/selector grouping and floor-collision banding, both of which
already treat `"tower"` identically to `"lower"`), each a thin `Carcass`
(reusing the same piece `CabinetMesh` already builds for every lower/
tower cabinet: sides, top, bottom, back, toe-kick, top filler) with no
doors/drawers/shelves at all — the entire front face is
`OvenNicheFront`/`MicrowaveNicheFront` (now `export`ed) sized to the
module's own height. `defaultDimensions: {height: 60|38, width: 60,
depth: 60}`, `defaultOptions: {drawers: 0, doors: 0, shelves: 0,
includesCountertop: false}` (an appliance niche never gets a countertop
by default — `DEFAULT_OPTIONS.includesCountertop` is `true`, so this
must be set explicitly, same as every other fixed-purpose tower/lower
catalog entry does), `configurableFields: ["height", "width", "depth",
"boardMaterial", "color"]` — a seller can still drop one standalone
outside a tower (useful on its own, same as any other module), in which
case it behaves like a completely ordinary module with no tower lineage
at all.

## 4. The dialog

`OvenTowerDialog.tsx` — visually the same composer shape as
`TowerDialog.tsx` (vertical strip, bottom to top, tap a row to open its
controls above the footer, Cancelar/Aceptar always visible), with two
differences that follow directly from §3:

- **Content picker only** — `puertas`(1 or 2)/`cajones`/`abierto`/
  `horno`/`microondas`, plus the optional pinned height. No
  hinge/corredera/material controls here at all: those live in the
  normal Inspector once the section exists as a real module (§5), not
  duplicated into a second editor inside this dialog.
- **No maletero row.** Not applicable to a kitchen tower — see
  Non-goals.

Reopening ("Editar torre") behaves like closet's: it lets the seller
reorder/add/remove sections and repin heights; it does **not** wipe
per-section options on Aceptar, since accepting only ever regenerates
from the CURRENT recipe (which already carries whatever the Inspector
last wrote into it) — there is nothing to warn about here, unlike
closet's own "hand-edits are lost" banner.

`services/ovenTower.ts` also exports `placeNewOvenTower`, a straight
copy of closet's `placeNewTower`/`overlapsAnyTower` collision-avoidance
logic against `draft.ovenTowers` (own list — an oven tower must not
overlap another oven tower, but has no reason to specifically avoid a
closet tower any more than any other hand-placed module already
doesn't).

## 5. Editing a generated section

`ModuleInspector.tsx`: a module with `options.ovenTowerGroupId` set
renders its **normal** category fields (tabs, materials, hinges, the
works — whatever `gabinete_bajo_puertas`/etc. already show for any
instance), plus one small fixed panel above them — not instead of them,
which is the one-line difference from the `towerGroupId` (closet)
branch at the top of the component:

> "Sección de torre: *{recipe.label}*" — **Editar torre** (opens
> `OvenTowerDialog` on this recipe) · **Quitar de la torre** (removes
> just this section — regenerates the rest) · **⭐ Guardar como
> plantilla** (same flow as closet's, §6).

Ancho/Fondo are hidden for these modules (tower-wide, edited only in
"Editar torre" — see the Non-goals), exactly mirroring how a closet
section's Alto is normally not independently meaningful, just inverted:
here Alto stays editable (pins the section) and Ancho/Fondo do not.

`hueco_horno`/`hueco_microondas` sections get the same treatment, just
with fewer fields to show (their own `configurableFields` from §3).

## 6. Starred templates

Mirrors the closet flow exactly, on its own backend table:

- **Backend.** `oven_tower_templates` — `id`, `user_id`, `name`,
  `recipe` (json), timestamps; model + `OvenTowerTemplateController`
  copying `ClosetTowerTemplateController`'s shape (`index`/`store`/
  `update`/`destroy`, same `design-projects` gate, same
  owner-or-admin `canManage` delete rule, templates readable shop-wide).
  Per the Current State note, `recipe.sections.*.options` is validated
  as a loose `'array'` rather than enumerated — the one deliberate
  deviation from `ClosetTowerTemplateController::recipeRules`'s style,
  justified because this field's whole point is to hold arbitrary
  `ModuleOptions`, the same reason `modules.*.options` is never
  enumerated either. Every other recipe field (label, widthCm, depthCm,
  totalHeightCm, section id/content/heightCm/flex, and rejecting
  x/z/rotation/id on a template) is validated explicitly, same as
  closet.
- **Frontend.** `lib/ovenTowerTemplate.ts` (`recipeToTemplate`/
  `templateToRecipe`, straight copies of the closet versions), new
  `services/api.ts` functions `listOvenTowerTemplates`/
  `createOvenTowerTemplate`/`deleteOvenTowerTemplate`. The star button
  lives in §5's Inspector panel.
- **Elevation ("el SVG").** `TowerElevation.tsx`'s `CONTENT_DRAWERS` map
  is keyed by `TowerContent` today; it gains a sibling
  `OVEN_CONTENT_DRAWERS` keyed by `OvenTowerContent` in the same file
  (`puertas`→`DoorPanel`, `cajones`→the existing drawer-bank drawing,
  `abierto`→open+`ShelfLines`, `horno`/`microondas`→ a new small drawn
  glyph: a filled rect with a centered small square "window", enough to
  read as "appliance" at thumbnail size without importing 3D code into
  an SVG component). `TowerElevation` itself takes a `content: "closet" |
  "oven"` discriminant (or simply two thin wrapper components sharing
  the box-layout math) and picks the matching map — no image is ever
  stored; every place this renders (catalog template tile, generated
  module's own Inspector preview) redraws live from whichever recipe
  it's given, exactly like closet's already does.

## 7. Catalog

`torre_horno_microondas`/`torre_horno_empotrado` entries are removed
from `KITCHEN_MODULE_CATALOG` in `services/kitchenData.ts` (their
`KitchenModuleType` union members, mesh branches, and cost-calculation
branches stay — untouched code paths for whatever projects already used
them; see Non-goals). `lib/projectCatalog.ts` gains an oven-tower
counterpart to `closet_torres`: a new selector group (e.g.
`cocina_torres`, `projectTypes: ["cocina"]`, `match: () => false`,
special-cased in `ModuleSelector.tsx` the same way `TORRES_GROUP_ID`
is) showing the shop's saved oven-tower templates plus a "Torre
personalizada" tile that opens `OvenTowerDialog` with a single `puertas`
section, never empty — same UX shape as closet's Torres group,
independent list.

## 8. Testing

**Backend.** Template CRUD; the `design-projects` gate; recipe json
round-tripping (including an arbitrary `options` bag surviving a
round-trip unenumerated); the new `oven_towers` column defaulting to an
empty list on existing projects.

**Frontend (Vitest, same runner/scope closet added).**
`resolveOvenTowerHeights` (fixed+flex+15cm-floor arithmetic, mirroring
closet's own test list) and `generateOvenTowerModules` (right module
type per content, options round-trip onto the generated module, mount
heights stack correctly, id is deterministic per section). A dedicated
`updateModule`-writes-back-into-the-recipe test: patch a generated
section's options, regenerate via a second recipe change, assert the
first section's patch is still present on its regenerated module.

Manual checks: an oven tower with 3 `horno` sections looks and costs
like 3 real `hueco_horno` modules; editing a `cajones` section's
`drawerSystem` in the normal Inspector, then adding an unrelated section
to the same tower, still shows the edited `drawerSystem` afterward;
`torre_horno_microondas` no longer appears in the module selector but an
existing project that has one placed still opens, renders and quotes
identically; starring a tower and reopening the project on another
device shows the template in the Torres group for cocina.

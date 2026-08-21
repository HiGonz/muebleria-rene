# Closet Tower (Torre de Clóset) — Design

## Problem

There is no way to build a closet tower. The drag-to-stack snap
(`findClosetSupportRun`) was removed, and `mountHeight` was never exposed
in the inspector for closet modules — only for aéreos, campanas and
`ventana_decorativa`. So today every closet module sits on the floor, and
the 🏗️ **Torres** group reserved in the closet catalog renders
"Próximamente".

Before the removal, a tower like the one this design targets — drawers,
then a perfume nook, then a niche with a shelf, a hanging section beside
it, and a maletero bridging the two — took about six separate placements
and a height calculation per piece, done by hand in the inspector. The
system inferred the tower afterwards from matching footprints. That is
backwards: the seller carried the arithmetic and the software guessed the
intent. A slow seller cannot do it with a client watching.

## Goals

- A seller composes a tower in a dedicated dialog, bottom to top, and
  never types a height.
- The tower **generates real closet modules**, so the 3D scene, the cut
  list, the quote and the PDF keep working with no changes to any of
  them.
- The recipe persists alongside the generated modules, so a tower can be
  reopened, edited and regenerated — in particular the maletero can be
  added or removed after the closet is already modelled.
- Two adjacent towers form **one continuous maletero** whose door count
  is configurable, defaulting to a single lift-up door across the run.
- The shop builds its own catalog: starring a tower saves it as a
  reusable template that shows up in the Torres group.

## Non-goals

- **`torre_closet` as a real nested module.** A module carrying a
  variable-length `sections[]` array, rendered by its own mesh branch and
  costed by its own branch in `calculateKitchenMaterials`, is the
  long-term shape. It is deliberately deferred: it means new branches in
  two files of 2,700 and 3,400 lines before we know the selling flow
  works. The recipe defined here is designed so that migration later
  changes the consumer, not the model.
- **Removing `findTowerChain`.** It stays. Three saved projects hold
  hand-stacked closet modules, and dropping the chain would change their
  render and their quoted cut list. It also does real work for this
  feature (see §3).
- **Migrating those three projects** into tower groups. They keep working
  exactly as they do now.
- **A 2D elevation as the closet builder's main view.** The tower dialog
  has its own elevation preview; the builder keeps its 3D + Resumen tabs.
- **A composite maletero door.** The lid belongs to one wide module, not
  to a group of modules (see §4).

## Current state (verified against the code)

The closet catalog holds four types:

| Type | Default h×w×d (cm) | Key defaults |
| --- | --- | --- |
| `cajonera_closet` | 90 × 40 × 60 | `drawers: 4`, no countertop |
| `nicho_closet` | 40 × 40 × 60 | `shelves: 0`, `doors: 0` |
| `tubo_ropa_closet` | 100 × 40 × 60 | `rods: 1` |
| `nicho_doble_puerta_closet` | 180 × 40 × 60 | `doors: 2`, `zoneSplitCm`, `shelvesTop/Bottom` |

- All four share a 40×60 footprint by default, which is what let them
  stack at all.
- `nicho_closet` has `doors: 0` and no `"doors"` in its
  `configurableFields`, so the inspector cannot add doors to one. The
  generator writes `options` directly and is not bound by that list.
- **A `nicho_closet` carrying doors renders with no new code — verified.**
  `getEffectiveDoors` derives door panels from `options.doors` for any
  module that is neither a two-zone type nor using a detailed layout, and
  `CabinetMesh` renders them. `nicho_closet` has no mesh of its own, so it
  takes that generic path. This is what makes §4's maletero a plain wide
  module instead of new geometry.
- Closet doors already support `doorHingeSides: "arriba"` (lift-up) and
  `doorPistons` — `ModuleInspector` offers "arriba" for closet doors
  precisely because a maletero needs it.
- `findTowerChain` groups closet modules that share x/z/rotation/width/
  depth and whose heights touch within `TOWER_JOINT_TOLERANCE_CM`. It
  drives joined panels in the 3D render, the shared cut list in
  `calculateKitchenMaterials`, and carrying stacked modules along on a
  drag.
- `ModuleOptions.locked` establishes the precedent for putting a new
  per-module field in `options`: it rides the existing free-form JSON
  persistence with no backend migration.
- `kitchen_projects.openings` is a nullable `json` column cast to array —
  the established pattern for a list-shaped project attribute.
- Project types exist: a closet project's catalog is scoped, and the
  Torres group is declared with `match: () => false`.

## 1. The recipe

```ts
export type TowerContent = "cajones" | "repisas" | "hueco" | "colgar";

export interface TowerSection {
  id: string;
  content: TowerContent;
  // Doors on the section itself: none, one, or a pair. Lift-up doors are
  // a maletero concept — a mid-tower section never gets one.
  doors: 0 | 1 | 2;
  // Drawers / shelves / rods, depending on content. Omitted = the
  // content's default (see §2).
  count?: number;
  // Omitted = the content's typical height. Set = the seller overrode it.
  heightCm?: number;
  // Absorbs whatever height is left over. Exactly one per tower.
  flex?: boolean;
}

export interface TowerMaletero {
  heightCm: number;
  // Doors across the whole merged opening. 1 by default, whatever the
  // run's total width.
  doorCount: number;
}

export interface TowerRecipe {
  id: string;                 // also written to each generated module
  label: string;
  widthCm: number;
  depthCm: number;
  totalHeightCm: number;      // floor to the top of the maletero
  sections: TowerSection[];   // bottom → top
  maletero: TowerMaletero | null;
  x: number; z: number;       // placement, same coordinates as a module
  rotation: 0 | 90 | 180 | 270;
}
```

**Where it lives.** `draft.towers: TowerRecipe[]`, persisted through a new
nullable `towers` json column on `kitchen_projects`, cast to array —
exactly like `openings`. Every generated module carries
`options.towerGroupId = recipe.id`, riding the free-form options JSON the
way `locked` does, so no module-table migration is needed.

**Why not derive the recipe from the modules.** The modules record what
was built, not what was meant: which section was flexible, whether a
40cm nicho is a perfume nook or a shelf bay, and which towers share a
maletero run are all intent that cannot be read back reliably. Storing
the recipe is what makes "remove the maletero later" a two-click edit
instead of a reconstruction.

## 2. Heights resolve themselves

Each content has a typical height, taken from the catalog defaults it
generates:

| Content | Typical height | Default count |
| --- | --- | --- |
| `cajones` | 90 cm | 4 drawers |
| `repisas` | 40 cm | 2 shelves |
| `hueco` | 25 cm | — |
| `colgar` | 100 cm | 1 rod |

`hueco` is the one that departs from its module's 40cm default: a perfume
nook is shallower than a shelf bay, and a taller open gap is better
expressed as a `repisas` section with zero shelves.

**The rule.** Fixed sections plus the maletero are summed; the flex
section takes `totalHeightCm` minus that sum. Exactly one section is
flex — if the seller marks none, the topmost non-maletero section is
flex implicitly. The dialog blocks acceptance when the remainder would be
under a floor of 15cm, with a message naming which section is being
squeezed, rather than silently generating a 3cm drawer bank.

The seller can pin any section's height by typing it, which turns it into
a fixed section. Pinning every section is allowed only if the total then
matches `totalHeightCm` exactly.

## 3. What the generator emits

One module per section, bottom to top:

| Content | Module type | Options written |
| --- | --- | --- |
| `cajones` | `cajonera_closet` | `drawers: count` |
| `repisas` | `nicho_closet` | `shelves: count` |
| `hueco` | `nicho_closet` | `shelves: 0` |
| `colgar` | `tubo_ropa_closet` | `rods: count` |

A section with `doors: 1 | 2` adds `doors` plus the default alternating
hinge sides. That composition is what replaces `nicho_doble_puerta_closet`
— **the generator never emits it**. A "nicho doble con puerta" is two
sections, each with its own door, which is the whole point of treating the
door as a property of a section rather than as a distinct product.

Every emitted module takes `width: recipe.widthCm`,
`depth: recipe.depthCm`, the resolved section height, the recipe's
`x/z/rotation`, and `mountHeight` = the sum of the heights below it.

**`findTowerChain` then works for free.** Every section shares the
tower's footprint and each touches the one below, which is exactly its
matching condition — so a generated tower gets joined panels in the 3D
render and a shared cut list without a line of new geometry or costing
code. This is the single biggest reason the generator is worth doing
before the composite module.

## 4. The maletero

**One module for the whole run, not one per tower.** The maletero is
emitted as a `nicho_closet` with `shelves: 0`, `doors: maletero.doorCount`,
every entry of `doorHingeSides` set to `"arriba"`, and `doorPistons` all
true — a lift-up door of this size needs the strut, and the seller can
turn it off per door in the inspector afterwards.

Its width is the combined width of the contiguous run of towers whose
recipes have a maletero; its `x` is centred on that run; its
`mountHeight` is the run's shared section-stack top.

**Merging is regeneration, not detection.** Every change to any recipe —
adding a tower, editing one, switching a maletero off, or **dragging a
tower to a new position** — regenerates the modules for the whole recipe
list, and the run computation runs again from scratch. Push two towers
together and their maleteros fuse into one wider module; pull them apart
and it splits. Nothing watches positions at runtime; the regeneration is
what notices.

Dragging a generated module moves its whole tower and writes the new
position onto the recipe. The recipe is where a tower's position lives —
without that write, the next regeneration would teleport the tower back.

This is what makes "default one door, optionally 2 or N" free: a wide
module with N doors is an ordinary module in the current model, so the
door count is just a number on it. The horizontal counterpart of
`findTowerChain` — detecting adjacency and fusing openings live — is not
needed and is not built.

**Two towers merge only when** they are adjacent along their width, at
the same depth, same rotation, and their section stacks reach the same
top height. Different heights mean two separate maleteros, which is also
physically true.

**Revised during planning.** This section originally said merging would
never happen on drag, and offered an explicit "Unir maleteros" action
instead. Writing the plan showed that dragging has to write back to the
recipe anyway — otherwise a dragged tower snaps back on the next
regeneration — and once it does, merging on drag falls out for free.
There is no "Unir maleteros" button.

## 5. The dialog

The Torres group in the module selector shows the shop's starred
templates as tiles, plus a **Torre personalizada** tile. Picking a
template opens the dialog pre-filled; picking Torre personalizada opens
it with a single `cajones` section, never empty.

The dialog is a **vertical strip built bottom to top**:

- Header: ancho, fondo, alto total. Prefilled from the last tower placed
  in this project, or from the catalog defaults for the first one.
- The strip: one proportional band per section, drawn to scale so it
  reads as the closet's front. Tapping a band opens a short menu —
  contenido, puerta (sin · 1 · 2), cantidad, altura (opcional), quitar.
- **+ Agregar sección arriba** under the strip.
- A maletero toggle above the strip, with its height and door count.
- Accept generates; Cancel writes nothing.

Selecting any module belonging to a tower group offers **Editar torre**,
which reopens this dialog on that recipe. Accepting replaces the group's
modules wholesale — the recipe is the source of truth, so hand-edits made
to a generated module in the inspector are lost on regeneration. The
dialog warns about that the first time it happens on a given tower.

Deleting any module of a group deletes the group and its recipe: half a
tower is not a thing.

## 6. Starred templates

A **star button** on a placed tower saves its recipe, minus placement, as
a reusable template. This replaces the idea of shipping a fixed set of
pre-made towers: the catalog is whatever the shop actually sells, seeded
by their own work.

**Backend.** A `closet_tower_templates` table — `id`, `user_id`, `name`,
`recipe` (json), timestamps — with a model and controller following the
`Finish` / `FinishController` shape. Routes sit under the existing
`can:design-projects` gate, so admin and vendedor can create and use
them and taller cannot. Templates are readable shop-wide: a tower design
is shop knowledge, not personal. Deleting is limited to the template's
owner or an admin.

**Frontend.** The star prompts for a name, POSTs the recipe, and the
template appears in the Torres group for everyone. A template stores no
`x`/`z`/`rotation`; the width, depth and height come along and are
editable before accepting.

## 7. Testing

**Backend.** Template CRUD; the `design-projects` gate rejecting taller;
recipe json round-tripping unchanged; the new `towers` column persisting
and defaulting to an empty list on existing projects.

**Frontend.** The repo had no unit-test runner; **this feature adds
Vitest**, decided at spec review. The reason is §2: the height-resolution
rule is real arithmetic that decides whether a generated tower closes
exactly against its opening, and it will be wrong in edge cases nobody
clicks through by hand — a pinned section plus a maletero plus the 15cm
floor, say.

Scope of the runner, deliberately narrow: Vitest runs in a Node
environment over framework-free modules only. No jsdom, no React Testing
Library, no component tests. The two modules under test are
`services/closetTower.ts` (height resolution) and the generator that
turns a recipe into modules. Everything else in the repo keeps verifying
by `npx tsc --noEmit` plus manual checks, and Playwright keeps owning
end-to-end. Widening the runner later is a separate decision.

Manual checks either way: a generated tower shows joined panels in the 3D
view and a single shared cut list in Resumen; adding a second tower beside
one with a maletero produces one wide maletero, not two; removing the
middle tower of a three-tower run splits the maletero into two; toggling
a maletero off and back on leaves the rest of the tower untouched.

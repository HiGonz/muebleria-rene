# Project Type (Cocina / Clóset) — Design

## Problem

Every project in the system is a kitchen project. The closet work rides
inside that same shell: four `category: "closet"` module types
(`cajonera_closet`, `nicho_closet`, `tubo_ropa_closet`,
`nicho_doble_puerta_closet`) live in the one shared catalog, so a
"closet" today is a kitchen project that happens to only contain closet
modules — by convention, not by construction.

Two things follow from that. A seller building a closet browses a
catalog that offers `bajo_tarja`, `estufa` and `cubierta` alongside the
pieces they actually need, and nothing stops those from being added. And
the projects list gives no way to tell a kitchen apart from a closet, or
to filter to one kind.

## Goals

- A project declares what it is at creation: `cocina` or `closet`.
- One shared `/projects` list, one shared builder, one shared quote and
  PDF pipeline — the type changes *what the catalog offers*, nothing
  else.
- A closet project cannot receive kitchen-only modules, and the block is
  real (rejected in the store), not merely a hidden selector group.
- A kitchen project no longer sees closet-only pieces.
- The projects list shows each project's type and can filter by it.
- Zero disruption: every existing project becomes `cocina`, keeps
  working, and keeps every module it already holds.

## Current state (verified against the code)

- `kitchen_projects` has no type column. `KitchenProject::$fillable`
  covers client/room/status/autosave only.
- `+ Nuevo proyecto` on `app/projects/page.tsx` (two call sites, lines
  ~77 and ~90) is a plain `<Link href="/kitchen" replace>` with an
  `onClick={resetDraft}`. There is no creation step at all — the builder
  opens empty. An existing project opens at `/kitchen?projectId=N`.
- `KitchenBuilder` has exactly two tabs, `Vista 3D` and `Resumen`, plus
  the Habitación modal. A project is room + modules + openings; none of
  that is kitchen-specific.
- `SELECTOR_GROUPS` in `components/kitchen/ModuleSelector.tsx` is a flat
  array of 10 groups, each with a `match: (entry) => boolean` predicate
  over the catalog. One group is `closets` (`e.category === "closet"`).
  `mesas_sillas` matches nothing (`() => false`) and renders empty.
- The file already has the precedent this design needs:
  `UNCATEGORIZED_UPPER_TYPES` is an explicit type list subtracted from a
  category-based group (`armario_pared`) so specific types can be pulled
  out of an otherwise category-wide match.
- `addModule(type)` in `store/useKitchenStore.ts` takes any
  `KitchenModuleType` and calls `buildNewModule` — no validation of
  whether the type belongs in this project.
- `KitchenProjectController::store` validates client/room/openings and
  writes the row inside a transaction; `update` handles a status-only
  path (via `KitchenProjectStateMachine`) separately from the full
  design update.
- The catalog holds 72 module types across 9 categories.

## Non-goals

- **Renaming anything.** `kitchen_projects`, `KitchenProject`,
  `KitchenProjectController`, `useKitchenStore`, `KitchenDraft` and the
  `/kitchen` route all keep their names and serve both types. The
  rename would be a large mechanical refactor across backend, frontend
  and tests for no functional gain — the seller never sees a table name
  or a URL.
- **The closet tower.** A dedicated `torre_closet` module with a dynamic
  section-based configurator is a separate design. This spec only
  reserves an empty "Torres" group for it to land in.
- **Removing the manual stacking.** Dropping `findTowerChain` and the
  by-hand `mountHeight` closet workflow belongs with the tower, not
  here.
- **The legacy `/closet` designer.** Orphaned (no nav link, its own
  parallel data model) and untouched by this work.
- **A distinct closet UI.** Same tabs, same 3D room, same summary. A
  closet-specific main view (2D elevation) may come later with the
  tower; it is explicitly not part of this change.

## 1. Data model

`kitchen_projects.project_type` — `enum('cocina','closet')`, `NOT NULL`,
`default 'cocina'`, placed after `notes`. The migration needs no data
backfill: the default covers every existing row.

Added to `KitchenProject::$fillable`. No cast — a plain string is
enough; the enum is enforced by the column and by validation.

**The type is immutable after creation.** It is accepted on `store` and
ignored on every update path. Rationale: the type decides which catalog
the project's modules came from, so changing it on a project that
already holds modules would leave pieces behind that its own catalog
disallows. A seller who picks wrong on a two-card modal loses nothing by
starting over.

Frontend: `projectType: "cocina" | "closet"` on `KitchenDraft`, next to
`status`, mapped in both directions by `mapKitchenResponseToDraft` and
the save payload in `services/api.ts`. A draft that was never saved
carries the type chosen in the creation modal.

## 2. Backend

- **Migration** — add the column as described above.
- **`store`** — validate `project_type` as `required|in:cocina,closet`,
  and persist it.
- **`update`** — never writes `project_type`, on either the status-only
  path or the full design path. A payload containing it is not an error;
  the field is simply dropped.
- **`index` / `show`** — return `project_type` so the list can render
  the badge and the builder can scope its catalog.

No changes to gates or the state machine: the status flow, the role
matrix and the pricing rules are identical for both types.

## 3. Creating a project

`+ Nuevo proyecto` stops being a link and opens a **modal with two
cards**:

| | |
| --- | --- |
| 🍳 **Cocina** | Módulos de cocina, cubiertas, electrodomésticos |
| 👕 **Clóset** | Cajoneras, nichos, colgar ropa, paneles |

Picking one resets the draft, sets `projectType`, and navigates to
`/kitchen`. A modal rather than a route so the seller stays on the list
— one click instead of a page transition, and cancelling costs nothing.

Both call sites of the current link (the header button and the empty
state) open the same modal.

## 4. Projects list

- A type badge per row (🍳 / 👕 plus the word), next to the status
  chip.
- A **Todos · Cocinas · Clósets** filter beside the existing status
  filter, applied client-side over the already-fetched list, the same
  way the status filter works today.
- The Kanban view shows the same badge on `KanbanCard`. No separate
  boards — a closet moves through the identical status flow.

## 5. Catalog scoping

`SelectorGroup` gains `projectTypes: ProjectType[]`. One list, each
group declaring where it belongs, instead of two divergent arrays that
would have to be kept in sync.

**Clóset** gets:

| Group | Types |
| --- | --- |
| 🗄️ Cajoneras | `cajonera_closet` |
| 🖼️ Nichos y repisas | `nicho_closet`, `nicho_doble_puerta_closet` |
| 👕 Colgar ropa | `tubo_ropa_closet` |
| 🏗️ Torres | *(empty — reserved for `torre_closet`)* |
| 🔩 Paneles y remates | `panel_lateral`, `panel_remate`, `panel_decorativo`, `herrajes` |
| 🪞 Espejos e iluminación | `librero_giratorio_espejo`, `corona_luz` |
| 🚪 Puertas y ventanas | `category === "opening"` |

**Cocina** keeps its current 10 groups minus `closets`, and minus
`librero_giratorio_espejo` (see below).

Confirmed with the shop:

- `corona_luz` is **shared** — a closet can carry a light crown, and it
  stays in the kitchen catalog too.
- `librero_giratorio_espejo` is **closet-only** — it moves out of the
  kitchen catalog entirely. It is `category: "tower"`, so today it is
  swept up by the kitchen `armarios_altos` group; it now needs an
  explicit exclusion there, following the existing
  `UNCATEGORIZED_UPPER_TYPES` pattern — a `CLOSET_ONLY_TYPES` list
  subtracted from the category-wide kitchen matches. Its underlying
  `category` does not change; only which group surfaces it does.
- **Closets never take a countertop.** `cubierta` and every other
  `category === "countertop"` type is excluded, consistent with the
  existing note on `cajonera_closet` ("closets never need one at all").

The empty Torres group renders as a placeholder ("Próximamente") rather
than an empty grid, so it reads as reserved rather than broken.

## 6. Enforcement

Hiding a selector group is presentation. The real rule lives in the
store: `addModule(type)` resolves the project's allowed type set from
`draft.projectType` and refuses anything outside it, with a toast. Same
check in `placeAccessoryInNiche`, which can introduce a type without
going through the selector.

`duplicateModule` is deliberately **not** guarded. It copies a module
already present in the draft, so it cannot introduce a disallowed type —
and guarding it would break duplicating a pre-existing module on a
legacy project, which the "never retro-validate" rule below explicitly
protects.

Both consumers read the same `projectTypes` declaration, so browsing and
enforcement cannot drift apart. The derivation is asymmetric on purpose:
`closet`'s allowed set is the union of its groups' matches, while
`cocina`'s is the whole catalog minus what moved out (`category ===
"closet"` plus `CLOSET_ONLY_TYPES`). Deriving kitchens from group
matches instead would silently drop any catalog type no group happens to
cover, which is a regression risk the closet side does not have —
nothing was ever browsable as a closet before. `cocina` is also the
fall-through for any unrecognised value, so a draft persisted before
this change behaves exactly as it did.

`buildSampleKitchen` (the demo project) stays kitchen-only; the closet
path starts empty.

Modules already stored on a project are never retro-validated. An
existing kitchen project that holds closet modules — or a
`librero_giratorio_espejo`, which was legal to add until now — keeps
them, and keeps rendering and quoting them exactly as today.

## 7. Testing

**Backend**

- `store` persists `project_type`; omitting it fails validation; a value
  outside the enum fails validation.
- `update` cannot change `project_type`, on both the status-only and
  full-design paths.
- `index` and `show` expose `project_type`.
- Rows created before the migration read back as `cocina`.
- The role-access and status-workflow suites still pass unchanged.

**Frontend**

- The selector for a `closet` project offers no kitchen group; for a
  `cocina` project it offers neither the Closets groups nor
  `librero_giratorio_espejo`.
- `addModule` rejects a kitchen-only type on a closet project and leaves
  the module list untouched.
- The projects list filter narrows to each type.

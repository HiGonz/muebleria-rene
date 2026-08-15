# Kitchen Configurator Panel Redesign — Design

## Problem

The kitchen builder's right-hand panel (`ModuleInspector.tsx`, 940 lines) is
a single long scroll with no internal structure — every field group (size,
structure, doors/hinges, materials) is stacked vertically with only section
labels to separate them. On mobile, selecting a module or opening the
catalog (`ModuleSelector.tsx`) both render as a **full-screen** overlay that
completely covers the 3D viewport, so the user loses all visual context of
the kitchen while configuring it. There's no lightweight, thumb-reachable
way to glance at the model while adjusting a module on a phone.

## Goals

- Desktop (≥768px): keep the existing mutually-exclusive panel behavior
  (catalog vs. inspector, never stacked), but give the inspector a 4-tab
  structure (Medidas / Estructura / Frentes & Herrajes / Materiales) so a
  user configuring one module doesn't have to scroll past unrelated fields.
- Mobile (<768px): replace the full-screen overlay with a Vaul-based bottom
  sheet that has a collapsed state (~80px, 3D view fully visible) and an
  expanded state (50-85% of viewport height), hosting the same
  catalog/inspector content the desktop panel uses.
- No behavior change to any existing field, computed value, or store
  action — this is a **layout and navigation** redesign, not a data-model
  or 3D-rendering change.
- No visual/functional change to the existing 3D viewport toolbar or
  dimension overlay (`KitchenAssemblyScene.tsx`) — confirmed already
  correct, out of scope.

## Current state (verified against the code)

- `useKitchenStore` already models the two panel modes as
  `showSelector: boolean` and `editingModuleId: string | null`.
  `KitchenBuilder.tsx`'s 3D-tab block wraps both in one `AnimatePresence`
  and renders **at most one** of `<ModuleSelector />` / `<ModuleInspector />`
  at a time, each as a `motion.div` sliding in from the right
  (`className="... w-full sm:w-96"`). This already satisfies "never shown
  simultaneously" — desktop is functionally correct today, just not tabbed
  internally and not pinned to an explicit width.
- `ModuleSelector.tsx` already renders a 2-column category grid
  (`SELECTOR_GROUPS`, 9 groups with icon + label) as its landing screen,
  and a 2-column card grid (`ModuleChip`, thumbnail/icon + label +
  description + dimensions) once a category or search is active, with a
  "← Volver a categorías" back button. This already satisfies the
  catalog-grid requirement — only copy/context polish is needed (see §3).
- `ModuleInspector.tsx` has no tabs or section-level navigation
  (`grep` for `Tab|activeSection` returns nothing) — it's field groups
  wrapped in a local `Section` helper, rendered one after another in a
  single scroll. Field groups map cleanly onto the 4 target tabs (see §2).
- `KitchenAssemblyScene.tsx` already renders a floating toolbar (Home,
  Eye/EyeOff, Move, Tag, Ruler, zoom in/out, undo/redo — `lucide-react`
  icons, positioned top area) and a dimension/cotas overlay on the 3D
  model. Matches the requested "toolbar + cotas" behavior already —
  confirmed with the user, left untouched.
- `useIsMobile()` (`lib/useIsMobile.ts`) already exists and is imported in
  `KitchenBuilder.tsx`, but **is not actually called anywhere** — dead
  import today. Its breakpoint (`max-width: 1023px`, Tailwind `lg`) also
  doesn't match the header's own mobile/desktop split, which uses
  Tailwind's `md:`/`hidden md:flex` classes (768px) directly. Corrected
  during planning (verified against code, not assumed): the plan fixes
  `useIsMobile`'s query to 767px (matching `md`/768px, the spec's own
  breakpoint) and actually wires it up as the mount gate for the new
  bottom sheet vs. the existing desktop panel — the first real use of
  this hook.
- `NumberInput` (`components/ui/input.tsx`) is a plain numeric text input
  (typed value, no +/- stepper UI) — the mobile Medidas tab needs a new
  stepper affordance around it, not a replacement of its logic.
- `framer-motion@12.40.0` is already a dependency (used by `BuilderFab`
  and the existing slide-in panels). `vaul` is **not** currently a
  dependency; `npm view vaul peerDependencies` confirms React 19 support
  (`^19.0.0`), so it installs cleanly against this project's React
  19.2.4/Next 16.2.6 — no `--legacy-peer-deps` needed.

## Non-goals

- No changes to `KitchenAssemblyScene.tsx` (toolbar, cotas, camera
  controls) — confirmed matching spec already.
- No changes to any field's underlying logic, validation, or the
  `useKitchenStore` actions that back them (`updateModule`,
  `applyExteriorToAll`, etc.) — purely regrouping existing JSX under tabs.
- No changes to the closet builder — unrelated, and has unrelated
  in-progress uncommitted work on this branch that must not be touched or
  committed as part of this effort.
- No redesign of `ModuleSelector`'s category taxonomy (`SELECTOR_GROUPS`,
  `APPLIANCE_ITEM_TYPES`, etc.) — only the back-button copy changes (§3).
- No changes to desktop's `BuilderFab` placement/behavior — only mobile's
  entry point changes (folded into the bottom sheet's collapsed state).

## 1. Desktop panel (≥768px) — minimal change

- Pin the panel width explicitly: `md:w-[400px]` (currently the implicit
  `sm:w-96` = 384px; within spec range either way, made explicit for
  clarity and so both breakpoints agree on one constant instead of two
  slightly different Tailwind widths).
- No change to the `showSelector`/`editingModule` exclusivity logic in
  `KitchenBuilder.tsx` — it already does the right thing.
- `ModuleInspector` internals restructured per §2 (tabs apply on both
  desktop and mobile, since the sheet reuses the same component).

## 2. `ModuleInspector` tab structure

Add a small tab bar (styled like the existing `TABS` nav in
`KitchenBuilder.tsx`'s header, for visual consistency) directly below the
module name/close/delete header row, above the scrollable field area.
Four tabs, each rendering a subset of the existing `Section` blocks —
field JSX and the `updateDim`/`updateOpt` handlers are unchanged, only
their grouping and conditional visibility (`activeTab === "..."`) is new:

- **Medidas**: `dim.width/height/depth` inputs, mount height (upper
  modules). `DOOR_HINGE_OPTIONS`/`DOOR_HINGE_OPTIONS_UPPER` (hinge side —
  the closest existing equivalent to the spec's "Orientación
  Izquierda/Derecha") move to Frentes & Herrajes with the rest of the
  door/hinge fields, not Medidas — they're about which way a door swings,
  not the module's footprint.
- **Estructura**: `SIDE_PANEL_OPTIONS`, `BACK_PANEL_OPTIONS`,
  `ZOCALO_MATERIAL_OPTIONS`, countertop overhang, `setIslandModeManual`
  toggle. Long explanatory text (there's some inline today) becomes a
  small `ⓘ` tooltip trigger instead of always-visible prose.
- **Frentes & Herrajes**: door/drawer counts (`QuickCountButtons`),
  `DOOR_HINGE_OPTIONS(_UPPER)`, `DOOR_HINGE_TYPE_OPTIONS`,
  `DOOR_ACCESSORY_OPTIONS`, `FRONT_FILLER_OPTIONS`.
- **Materiales**: `TexturePicker` (exterior/interior), `CountertopModelPicker`,
  hardware/board material select (`BOARD_OPTIONS`).

Tabs that have nothing to show for the current module's `category`/`type`
(e.g. Frentes & Herrajes for a countertop-only module) render a short
"No aplica a este módulo" placeholder rather than being hidden/disabled —
simpler than per-module tab visibility logic, and keeps tab position
stable while switching between modules.

Mobile-only inside the Medidas tab: wrap each dimension `NumberInput` in a
new small `StepperField` (adds `[-]`/`[+]` buttons flanking the existing
input, using the same `onChange`) so touch users aren't forced into the
virtual numeric keyboard for every adjustment. Desktop keeps the plain
`NumberInput` as today. `StepperField` is presentation-only — no new
store logic.

## 3. `ModuleSelector` polish

- Back-button label becomes context-aware: "← Volver a configuración" when
  `editingModuleId` was set before the selector opened (i.e. the user came
  from an existing module and will return to it), "← Volver" otherwise
  (net-new module, nothing to return to). Needs a way for `ModuleSelector`
  to know which case it's in — simplest is reading `editingModuleId`
  (already nullable) from the store directly rather than threading a new
  prop.
- No other changes — grid layout, categories, search, and `ModuleChip`
  stay as-is.

## 4. Mobile bottom sheet (`vaul`)

New component `components/kitchen/KitchenBottomSheet.tsx`, built on
`vaul`'s `Drawer` with `snapPoints` (two: a small pixel/`fraction` value
for collapsed, `0.8` — tunable within the 0.5-0.85 range — for expanded).
Mounted in `KitchenBuilder.tsx`'s 3D-tab block **only when
`useIsMobile()`**, replacing today's `motion.div` full-screen overlay for
both `showSelector` and `editingModule` cases; desktop keeps the current
`motion.div` panel unchanged.

- **Collapsed** (`snapPoints[0]`): one row — module name +
  edit-affordance when `editingModule` is set, else "Configurador de
  Cocina" + a `+ Añadir Módulo` CTA. This CTA replaces mobile's current
  standalone `BuilderFab` (desktop's `BuilderFab` is untouched — out of
  scope per the approved design). Background 3D view fully visible and
  interactive above this row.
- **Expanded** (`snapPoints[1]`): renders `<ModuleSelector />` or
  `<ModuleInspector />` — the same components desktop uses, so tab
  structure (§2) and catalog polish (§3) apply identically on both
  breakpoints, no duplicated content.
- Tapping the collapsed row's CTA/edit-affordance opens the sheet to the
  expanded snap point; closing (swipe-down, backdrop tap, or the
  selector/inspector's own close action) returns it to collapsed rather
  than unmounting — collapsed is the sheet's resting state whenever a
  module is selected or the catalog isn't open, matching desktop's
  "nothing shown" resting state conceptually.
- New dependency: `vaul` (latest, confirmed React 19-compatible above).

## 5. Testing

- `npx tsc --noEmit` in `frontend/` after each unit of work (tabs, sheet,
  selector polish) — per [[feedback_no_visual_validation]], no browser
  screenshot loop; the user reviews visually themselves with the dev
  server running.
- Manual smoke check is the user's, not part of this plan's verification
  steps — implementation stops at "type-checks, reasoned through, matches
  spec."

## Open implementation detail (left to the plan/implementation phase)

Exact Tailwind values for the two Vaul snap points, and whether
`StepperField` is a new file under `components/ui/` or a local helper
inside `ModuleInspector.tsx` — both are small enough to resolve during
implementation rather than needing to be pinned here.

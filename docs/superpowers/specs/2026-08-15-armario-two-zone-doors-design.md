# Armario Alto Two-Zone Door System — Design

## Problem

`armario_alto_media_puerta` and its 4 siblings (`armario_alto_2_puertas`,
`_cristal`, `_combinado`, `_combinado_invertido`) share one physical
shape — a fixed divider splitting an upper cabinet into a top zone and a
bottom zone — but today it's implemented two incompatible, non-reusable
ways:

- `armario_alto_media_puerta` has its own dedicated mesh
  (`ArmarioAltoMediaPuertaMesh`) with a live-computed 50/50 split, but a
  single hardcoded door with no configurability (count, hinge side,
  hinge type, glass, up-opening are all fixed).
- The 4 siblings use `useDetailedLayout: true` + a frozen `doorDefs`
  array with fixed `fromBottomCm`/`heightCm` values computed once for
  the 90cm default height (`44.7`/`45.3`). Resizing the cabinet's height
  does not rescale these doors — a real, currently-shipping bug.

Neither path routes through the generic per-door option UI
(`doorHingeSides`/`doorHingeType`/`doorGlass`), so none of these 5 types
can have door hinge side, hinge type, "abre hacia arriba", or glass
configured today — despite that machinery already existing and working
for every other cabinet type.

This is phase 3 of a larger 4-phase effort (materials CRUD — done;
per-category material defaults and pistons follow as separate specs).
Pistons (phase 4) will attach to up-opening doors, so this phase needs
"arriba" opening to actually be reachable on these 5 types first.

## Goals

- All 5 types get a live-computed (never frozen) top/bottom zone split.
- Each zone's door count is independently configurable (0 = open/hueco,
  1, or 2 doors), reusing the exact width-splitting math the generic
  single-zone door system already has — not a second implementation.
- Every door on these 5 types gets the same hinge-side (including
  "arriba"), hinge-type, and glass options every other cabinet's doors
  already have, via the exact same option arrays
  (`doorHingeSides`/`doorHingeType`/`doorGlass`), not new parallel
  fields.
- The frozen-door-height bug on the 4 siblings is fixed as a direct
  consequence of the live-computation, for both new and existing saved
  instances of these types (see Backward compatibility).
- Cost calculation for all 5 types reflects the same live geometry the
  3D view shows — no separate/inconsistent costing path.

## Current state (verified against the code)

- **Catalog entries**: `armario_alto_2_puertas`/`_cristal`/`_combinado`/
  `_combinado_invertido` (`frontend/services/kitchenData.ts:698-752`) —
  all four set `defaultOptions: { doors: 2, shelves: 1, useDetailedLayout:
  true, doorDefs: [...] }` with two hardcoded `DoorDef`s
  (`fromBottomCm: 0/45.3`, `heightCm: 44.7` each), differing only in
  which door(s) have `glass: true`. `armario_alto_media_puerta`
  (`kitchenData.ts:764-781`) sets `defaultOptions: { doors: 1, shelves:
  0, mountHeight: 144 }` — no `useDetailedLayout`, no `doorDefs`.
- **3D rendering**: the 4 siblings render through the generic
  `CabinetMesh` (`ModulePreview3D.tsx:1912+`), which reads whatever
  `getEffectiveDoors` returns — and `getEffectiveDoors`
  (`ModulePreview3D.tsx:99-135`) returns `mod.options.doorDefs` verbatim
  whenever `useDetailedLayout && doorDefs?.length`, before ever reaching
  its own live width-splitting logic. `armario_alto_media_puerta` instead
  has a fully separate dedicated mesh, `ArmarioAltoMediaPuertaMesh`
  (`ModulePreview3D.tsx:1236-1286`), which computes its own single
  `DoorDef` live from `dimensions.height * ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT`
  (0.5) every render — already correct, just not reusable or
  configurable beyond that one hardcoded shape.
- **Cost calculation**: `resolveDoors` (`kitchenData.ts:70-95`) is
  `getEffectiveDoors`'s cost-engine twin (same `useDetailedLayout`-first
  check, same width-splitting fallback) — deliberately duplicated rather
  than shared, since `kitchenData.ts` has no dependency on the 3D/UI
  layer (confirmed by an existing comment on the back-face equivalent,
  `resolveBackDoors`, at `kitchenData.ts:97-103`). The 4 siblings flow
  through `resolveDoors` normally (return their frozen `doorDefs`, same
  bug). `armario_alto_media_puerta` is explicitly excluded from the
  generic call (`kitchenData.ts:1932`: `mod.type === "aereo_hueco_inferior"
  || mod.type === "armario_alto_media_puerta"` → `doors = []`) and
  costed by its own dedicated branch (`kitchenData.ts:1840-1848`,
  mirroring the mesh's live 50%-height derivation).
- **UI gating**: `ModuleInspector.tsx`'s door-hinge-side section
  (`:774`) and per-door accessory/pull-out section (`:833`) are both
  gated on `!opt.useDetailedLayout && opt.doors > 0`. The 4 siblings
  have `useDetailedLayout: true` by catalog default, so these sections
  are hidden for them today. `armario_alto_media_puerta` has
  `useDetailedLayout` unset (falsy), so the gate condition alone would
  already let it through — but it's rendered by a dedicated mesh
  disconnected from `opt.doors`-driven logic entirely, so configuring
  "doors" for it today has no visible effect.
- **Backward-compat mechanism already established**: new modules get
  `{ ...DEFAULT_OPTIONS, ...smartDefaults, ...entry.defaultOptions }`
  merged at creation (`buildNewModule`, `kitchenData.ts:1481-1500`).
  Modules loaded from a saved project use whatever is in that project's
  stored JSON as-is — no re-merge with current catalog defaults. Every
  existing optional field in `ModuleOptions` is read with an inline
  `opt.field ?? fallback` at each use site (established pattern
  throughout `ModuleInspector.tsx`/`kitchenData.ts`) — this is how a
  newly-added optional field stays safe for old saved data, and is the
  mechanism this phase also uses (see §3).

## Non-goals

- No change to any *other* module type's door system — this phase
  touches exactly these 5 catalog types.
- No new door-opening mechanism beyond what already exists (hinge side
  including "arriba", hinge type, glass, pull-out) — this phase makes
  the existing mechanism reachable on these 5 types, it doesn't add a
  new one.
- No pistons yet — that's phase 4, and depends on this phase making
  "arriba" opening reachable on these types, but piston UI/pricing
  itself is out of scope here.
- No change to `useDetailedLayout`/`doorDefs` as a mechanism — it stays
  exactly as-is for every module type that still legitimately uses it
  for genuinely asymmetric, one-off manual layouts (e.g. `FaceEditor`).
  This phase just stops these specific 5 catalog types from defaulting
  into it.

## 1. Data model — one new field

`ModuleOptions` gains one new optional field: `doorZoneSplit?: number`.
For the 5 two-zone types, `opt.doors` is the cabinet's *total* door
count across both zones (as it already conceptually is for every other
cabinet type); `doorZoneSplit` says how many of those doors belong to
the top zone — the remainder belongs to the bottom zone.
`doorHingeSides`/`doorHingeType`/`doorGlass`/`doorPullOut` stay exactly
what they are today: flat, index-aligned arrays, where indices
`0..doorZoneSplit-1` are the top zone's doors (in left-to-right order)
and the rest are the bottom zone's.

New catalog defaults: `armario_alto_media_puerta` → `doors: 1,
doorZoneSplit: 1` (all 1 door on top, 0 implied below = open/hueco,
matching today's shape exactly). The 4 siblings → `doors: 2,
doorZoneSplit: 1` (1 top + 1 bottom, matching today's shape exactly) —
`doorDefs`/`useDetailedLayout` are removed from these 4 catalog
entries; `doorGlass` (index-aligned) replaces the per-variant hardcoded
`glass: true` placement (e.g. `_cristal` defaults `doorGlass: [true,
true]`, `_combinado` defaults `doorGlass: [false, true]`).

## 2. Rendering & cost calculation

Both `getEffectiveDoors` and `resolveDoors` gain a small zone-aware
branch, reached only when `mod.type` is one of the 5 two-zone types —
checked *before* the existing `useDetailedLayout && doorDefs?.length`
check, so these 5 types never take the frozen-`doorDefs` path even for
old saved data that still has one stored (see §3). The branch runs the
same width-splitting loop each function already has for its
single-zone case, twice — once for the top zone's door count
(clamped to `min(doors, max(0, doorZoneSplit ?? 1))`, so a `doors`
count reduced below the stored/default split never produces a negative
bottom-zone count), once for the bottom zone's (the remainder), each
confined to its own live-computed height
band (top zone: `usableH * ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT`-style
percentage of the module's current height; bottom zone: the remainder)
instead of the module's full usable height. A zone with a door count of
0 contributes no `DoorDef`s and is rendered/costed as open space —
`ArmarioAltoMediaPuertaMesh`'s existing divider-plus-open-cavity
handling generalizes directly to "bottom zone with 0 doors," so
`armario_alto_media_puerta`'s current visual is reproduced exactly by
the new mechanism with its default options, not approximated.

This mirrors the existing `getEffectiveDoors`/`resolveDoors` duplication
pattern (same logic, two files, deliberate no-cross-dependency
boundary) — the zone-splitting addition follows that same boundary
rather than introducing a new shared module across it.

Mesh rendering collapses toward fewer dedicated functions: the same
divider-plus-two-door-zones shape serves all 5 types, differing only in
each zone's live-derived door count/hinge/glass — `ArmarioAltoMediaPuertaMesh`
and the (currently mesh-less, generic-`CabinetMesh`-rendered) 4 siblings
converge on one mesh path once both read zone-derived `DoorDef[]`s the
same way `CabinetMesh` already consumes `getEffectiveDoors`'s output today.

## 3. Backward compatibility

`doorZoneSplit ?? 1` is a safe universal fallback for **all 5 types**
without needing a per-type lookup: an old `armario_alto_media_puerta`
(`doors: 1`) with `doorZoneSplit` undefined resolves to 1 door top / 0
bottom — its current shape exactly. An old sibling (`doors: 2`) with
`doorZoneSplit` undefined resolves to 1 top / 1 bottom — its current
shape exactly, *at whatever height it happens to be stored at* (unlike
today, correctly rescaled). Because the 3 already-existing option
fields this phase relies on (`doors`, `doorHingeSides`, `doorGlass`)
are already present and populated with sensible values in every
existing saved instance of these 5 types (they're set by the current
catalog defaults already), no migration or backfill of any kind is
needed — this is a pure logic change plus one new optional field with
a safe fallback.

The one deliberate behavior change for **existing saved projects**: a
sibling cabinet that was previously resized away from 90cm height will
visually correct itself (doors rescale to match the divider) the next
time that project is opened, since old saved data's frozen `doorDefs`
is no longer read for these 5 types. This is a bug fix, not a
regression — the corrected geometry is what the cabinet should have
shown all along; only cabinets that were actually resized (and were
therefore already visibly broken) are affected, and only by becoming
correct.

## 4. UI

Once the 4 siblings' catalog defaults stop setting `useDetailedLayout:
true`, `ModuleInspector.tsx`'s existing hinge-side/type/glass/pull-out
sections (`:774`, `:833`) already become reachable for them with no
gating changes needed — they're gated on `!opt.useDetailedLayout &&
opt.doors > 0`, which is now true by default for all 5 types. One new
control is added to the Frentes & Herrajes tab, visible only for these
5 types: how many of the total doors are "arriba" vs. "abajo" — a small
segmented/stepper control bound to `doorZoneSplit`, clamped to `[0,
opt.doors]`.

## 5. Testing

`npx tsc --noEmit` plus reasoning, per this repo's established
convention (no frontend unit-test runner). Given this touches real
geometry and cost calculations, a differential/reasoning check comparing
the new zone-splitting function's output against
`ArmarioAltoMediaPuertaMesh`'s current hardcoded 50%-split math (for the
default `doors:1, doorZoneSplit:1` case) is appropriate at implementation
time, matching how prior pricing-logic changes in this project were
verified without a test runner.

# Island edge toggle — design

Status: approved, ready for implementation planning
Scope: a manual per-module override that forces island behavior (free rotation,
configurable back face) on a cabinet even when it's positioned at or near a wall —
extending the automatic-only island detection shipped in
`docs/superpowers/specs/2026-08-11-island-cabinets-design.md`.

Explicitly out of scope for this spec:
- Any change to the automatic position-based detection itself (`isFreestandingPosition`,
  the 0.85m/0.55m hysteresis thresholds) — this spec only adds a way to bypass it, not
  change how it works when not bypassed.
- Any change to island-mode rendering, costing, or the "Panel trasero" inspector section's
  own contents — those already key off `options.islandMode`, which this feature continues
  to populate exactly as before.
- The 6 other work items from this session's roadmap (door-height bug, melamine sheet
  margins, performance audit, undo/redo, camera persistence) — separate specs.

## Why this shape

Real usage surfaced a case the automatic-only model (>0.85m from every wall) can't reach:
a peninsula-style or corner-adjacent island piece that's legitimately meant to behave like
an island (free rotation, a real back face facing the room) but sits close to one wall by
design. Rather than loosening the distance threshold (which would make ordinary wall
cabinets start flickering into island mode near corners), this adds an explicit,
per-module manual override — the same shape as the existing `options.locked` (a manual
per-module flag toggled from the UI, checked by the interaction code) and `moveMode.fixed`
("Dirección fija", a manual override that suppresses the automatic
`nearestWallRotation` for a drag gesture).

## Data model

One new optional field on `ModuleOptions` (`types/kitchen.ts`), alongside the existing
`islandMode?`, `backDoors?`, `backShelves?`:

```ts
// User-forced island mode — bypasses isFreestandingPosition entirely while true, so a
// module can behave like an island (free rotation, configurable back face) even close
// to a wall. Purely additive: while false/undefined, islandMode continues to follow
// automatic position detection exactly as before this field existed. Set together with
// islandMode itself (see setIslandModeManual in useKitchenStore.ts) so every existing
// consumer of options.islandMode (CabinetMesh, calculateKitchenMaterials, the inspector's
// "Panel trasero" gate) keeps reading a single, already-correct boolean — none of them
// need to know this override exists.
islandModeManual?: boolean;
```

`options.islandMode` remains the *only* field every downstream consumer reads — the mesh,
the cost engine, and the inspector's existing gates are untouched by this feature.
`islandModeManual` is purely the memory of *why* `islandMode` is currently true, consulted
only at the handful of write-sites that decide whether to keep recomputing it.

## Store action: `setIslandModeManual`

New action in `useKitchenStore.ts`, called only from the inspector's toggle (not from the
generic `updateOpt` path other inspector fields use, since this one has to touch two
fields atomically and, when turning off, re-derive `islandMode` from the module's current
position rather than just clearing it):

```
setIslandModeManual(id: string, forced: boolean): void
```

- `forced = true`: sets `options.islandModeManual = true` and `options.islandMode = true`
  in the same update. Effective immediately — the "Panel trasero" section appears in the
  inspector without requiring a drag first.
- `forced = false`: sets `options.islandModeManual = false`, then recomputes
  `options.islandMode` via the *same* `isFreestandingPosition` call the automatic paths
  already use, from the module's current `x`/`z` and the draft's current room dimensions.
  This means turning the override off doesn't necessarily turn `islandMode` off — a module
  that happens to already be far from every wall stays an island, exactly as if it had
  just been dragged there; one that's close to a wall reverts to normal.
- Fires the same transition toast (`"<label>" ahora es isla` / `"<label>" ya no es isla`)
  the drag and nudge paths already fire, only when `islandMode`'s value actually changes as
  a result — so toggling the override off on a module that was already far from every wall
  (and therefore stays an island either way) doesn't fire a spurious toast.

## Eligibility and gating

The toggle is offered under the same conditions the "Panel trasero" section already uses
for island-eligible types: `ISLAND_ELIGIBLE_CATEGORIES` (`lower`/`tower`/`corner`) —
reusing the existing constant, not a new one. Rendered in `ModuleInspector.tsx` as a
labeled switch, "Forzar modo isla", positioned immediately above the "Panel trasero"
section so activating it and seeing that section appear reads as one connected action.

## Interaction with drag and nudge

The three existing write-sites that recompute `islandMode` today —
`KitchenAssemblyScene.tsx`'s `handleMove` and `handleUp`, and
`useKitchenStore.ts`'s `nudgeModule` — each gain a short-circuit ahead of their existing
`isFreestandingPosition` call:

```
const islandMode = mod.options.islandModeManual
  ? true
  : islandEligible && isFreestandingPosition(...);
```

While the override is on, dragging or nudging the module never re-evaluates position —
it stays an island, flush against a wall if that's where the user puts it, with rotation
frozen exactly the way automatic island mode already freezes it (`liveRotation` instead of
`nearestWallRotation`). Turning the override off (via the inspector toggle only — there is
no drag-time way to turn it off, matching how "Dirección fija" itself is inspector/toolbar-
only) hands the module back to automatic detection on its *next* drag or nudge, in
addition to the immediate recompute `setIslandModeManual` already performs when the toggle
is switched off.

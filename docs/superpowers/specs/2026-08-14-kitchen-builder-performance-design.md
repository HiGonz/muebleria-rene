# Kitchen builder performance fixes — design

Status: approved, ready for implementation planning
Scope: the 4 findings from the 2026-08-14 performance audit — per-module re-render
during drag, unmemoized quote engine, unscoped Zustand subscriptions on the drag/render
critical path, and undebounced localStorage persistence.

Explicitly out of scope for this spec (deferred):
- Zustand selectors for the other ~8 components the audit found (modals, forms) — not on
  the reported freeze's critical path.
- The dimension-label overlay's per-frame cost (audit finding 5) — already correctly
  gated behind "Mostrar medidas" and inherently needs to run every frame while active;
  not a bug.
- Any of the other 6 roadmap items (undo/redo, camera persistence, etc.).

## Why this shape

The audit (read-only investigation, no code changed) traced the freeze to a specific,
confirmed mechanism: `KitchenAssemblyScene.tsx`'s drag handler calls `setDragPreview`
(local `useState`) on every `pointermove`, which re-renders the whole module list and
re-invokes every module's mesh — because `ModulePreview3D.tsx` has zero memoization
anywhere, and because the per-module JSX block passes freshly-allocated objects/closures
(`drag`, `selectThis`) that would defeat `React.memo`'s default shallow comparison even
if applied naively. Three other findings compound the same underlying pattern (missing
memoization boundaries) at different scopes: the quote engine, the store subscription
model, and disk persistence.

## Fix 1 — Per-module mesh memoization (the primary freeze cause)

Extract the per-module block currently inlined in `AssemblyContent`'s `modules.map(...)`
(`KitchenAssemblyScene.tsx`, the `<group key={mod.id}>...</group>` block that renders
`ModuleMesh`, `ModuleLabel`, `ModuleDimensionsLabel`, `ModuleHighlight`,
`ModuleFabCluster`) into its own component, `ModuleSceneItem`, wrapped in
`React.memo(ModuleSceneItem, arePropsEqual)` with a **custom comparator** — not the
default shallow-equal.

The comparator only checks what actually determines this module's rendered output:
`mod` (reference equality — already stable per-module in the store, see below),
whether THIS module is the live drag target (`dragPreview?.id === mod.id`, plus if so
the drag preview's own x/z/rotation/mountHeightCm), `wireframe`, `showLabels`,
`showDimensions`, `hoveredId === mod.id`, `selectedId === mod.id`, and the relevant
slice of `moveMode` (`moveMode?.id === mod.id`, and if so `moveMode.fixed`). It
deliberately does NOT compare `drag`/`onSelect`/the double-click handler by reference —
those are freshly constructed on every parent render regardless, but they're pure
functions of the already-compared inputs (`mod`, `onModuleMove`, `mod.options.locked`),
so their identity changing doesn't mean the module's actual behavior changed. This is
safer than chasing `useCallback` through every closure in the chain: one correct
comparator function is easier to verify and to keep correct than a dozen scattered
memoization hooks.

This works because `useKitchenStore`'s update actions (`updateModulePosition`,
`nudgeModule`, `updateModule`, etc.) build the new `modules` array via
`modules.map(m => m.id === id ? {...} : m)` — every module OTHER than the one being
edited keeps its exact object reference. So `mod` is already reference-stable for the
39 untouched modules during any single module's drag; the fix only needs to stop
*discarding* that stability at the render layer.

`KitchenAssemblyScene.tsx`'s own `applyWallOffset(mod)` already returns `mod` itself
unchanged when `wallOffset` is falsy (the common case) — already reference-stable,
confirmed by reading it, no change needed there.

## Fix 2 — Memoize the quote engine's call site

In `KitchenSummary.tsx`, wrap the `getMaterials()` call in `useMemo`, keyed on
`draft.modules`:

```ts
const { lines, summary } = useMemo(() => getMaterials(), [draft.modules]);
```

`draft.modules` is the same reference-stable array described above, so this recomputes
only when a module actually changes — not when the summary screen's own local UI state
(accordion expand/collapse, hover/selection highlighting, PDF export in progress)
changes.

## Fix 3 — Scoped Zustand selectors + memoize the scene component

Scoped to the drag/render critical path only (`KitchenBuilder.tsx` and
`KitchenAssemblyScene.tsx`), not the ~8 other components the audit flagged:

1. Wrap `KitchenAssemblyScene`'s component definition in `React.memo` (default shallow
   comparison is sufficient here — its props are already either primitives
   (`roomWidth`, `roomDepth`, `ceilingHeight`), reference-stable arrays (`modules`,
   `openings`), or callbacks, addressed next).
2. In `KitchenBuilder.tsx`, four of the seven callback props passed to
   `KitchenAssemblyScene` are wrapped in a fresh inline arrow function on every render
   even though the underlying Zustand action is itself already stable:
   `onModuleMove={(id, x, z, rotation, mountHeightCm, islandMode) => updateModulePosition(...)}`,
   `onModuleActivate={(id) => setEditingModule(id)}`, and
   `onModuleNudge={(id, dx, dz, dMountHeight) => nudgeModule(...)}` are pure passthroughs
   with identical signatures to the store actions they call — pass the store actions
   directly (`onModuleMove={updateModulePosition}`, etc.) instead of wrapping them.
   `onOpeningMove={(id, offset) => updateOpening(id, { offset })}` genuinely
   transforms its arguments (positional → object), so it needs `useCallback` instead of
   a direct pass. (`onModuleRemove={removeModule}`, `onModuleToggleLock={toggleModuleLock}`,
   `onUndo={undoLastMove}` are already passed directly today — no change needed.)

`KitchenBuilder.tsx` itself keeps its current single `useKitchenStore()` call (its own
render cost is not the bottleneck — cascading that cost into the 3D scene is). No
selector refactor needed in `KitchenBuilder.tsx` beyond the callback-stability fix
above; `React.memo` on `KitchenAssemblyScene` plus stable props is what stops the
cascade.

## Fix 4 — Debounce localStorage persistence

Zustand's `persist` middleware (`useKitchenStore.ts`) writes the whole draft
(`JSON.stringify`) to `localStorage` on every `set()`, including one per keystroke in
text fields like client name and notes. Add a debounced custom `storage` implementation
to the `persist` config (Zustand's documented mechanism for this — a `storage` object
whose `setItem` debounces the actual `localStorage.setItem` call, e.g. ~500ms since the
last call) rather than a scattered `setTimeout` at each call site. In-memory state
(what the UI reads and reacts to) updates instantly and unaffected — only the disk
write is delayed and coalesced, so a burst of keystrokes results in one write shortly
after the user stops typing instead of one write per character.

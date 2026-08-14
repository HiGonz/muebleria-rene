# Undo/Redo system — design

Status: approved, ready for implementation planning
Scope: item 6 of the 7-item roadmap. Replaces the existing `moveHistory`/
`undoLastMove` (position/rotation only, 3-entry limit, no redo) entirely.

Explicitly out of scope for this spec (deferred, per user's own scoping
choice):
- Openings (windows/doors — `addOpening`/`removeOpening`/`updateOpening`).
- Bulk "apply to all" material/height actions (`applyExteriorToAll`,
  `applyCountertopToAll`, `applyHardwareToAll`, `applyZocaloMaterialToAll`,
  `applyLowerHeightToAll`, `applyUpperMountHeightToAll`,
  `applyUpperHeightToAll`).
- Project metadata (`updateProject`: client name, notes, room dimensions).
- Item 7 of the roadmap (camera position persistence) — unrelated.

## Why this shape

The nine existing module-mutating store actions
(`addModule`, `placeAccessoryInNiche`, `removeModule`, `updateModule`,
`updateModulePosition`, `nudgeModule`, `setIslandModeManual`, `rotateModule`,
`duplicateModule`, `toggleModuleLock`) each touch exactly one module —
either creating it, deleting it, or replacing it with a patched copy. That
uniformity means a single generic history-entry shape covers "move / rotate
/ change dimensions / delete / restore / add / duplicate" from the original
request without writing a separate inverter per action type (a full Command
Pattern), while still satisfying the "not a full-scene-copy" constraint
(each entry stores at most one module, not the whole draft).

## Data model

```ts
interface UndoEntry {
  moduleId: string;
  before: KitchenModule | null; // null = the module didn't exist yet (this was an add)
  after: KitchenModule | null;  // null = the module no longer exists (this was a delete)
}
```

`undoStack: UndoEntry[]` and `redoStack: UndoEntry[]` live as top-level
fields on the store (sibling to `draft`, alongside where `moveHistory` lives
today), not inside `draft`. `persist`'s `partialize` only picks `draft` and
`projectId`, so both stacks are automatically excluded from localStorage —
undo history does not survive a page reload, matching how `moveHistory`
already behaves.

Capped at 50 entries (`UNDO_HISTORY_LIMIT = 50`) — oldest entries drop off
the front once exceeded.

## Actions

```ts
undo: () => void;
redo: () => void;
```

Replace `undoLastMove` entirely (removed, along with `moveHistory` and its
type `MoveHistoryEntry`).

**`undo()`:** pop the last entry off `undoStack`.
- If `after === null` (the action was a delete): reinsert `before` (append
  to the end of `draft.modules` — exact original list position is not
  preserved, which is an acceptable simplification since module order has
  no semantic meaning in this app).
- If `before === null` (the action was an add): remove the module matching
  `moduleId`.
- Otherwise (an update): replace the module matching `moduleId` with
  `before`.
- Push the same entry onto `redoStack`.
- A module that is currently `locked` is skipped (the mutation is not
  applied) but the entry still moves from undo-stack to redo-stack — same
  "locked blocks mutation" rule every other action already follows.

**`redo()`:** the exact mirror, popping `redoStack`, applying `after`
instead of `before`, pushing back onto `undoStack`.

**Redo invalidation:** every one of the nine module-mutating actions clears
`redoStack` when it runs (standard editor behavior — a new edit after an
undo discards the abandoned future).

## Integration into existing actions

A shared helper does the bookkeeping every action needs:

```ts
function pushUndoEntry(
  set: (fn: (s: KitchenStore) => Partial<KitchenStore>) => void,
  before: KitchenModule | null,
  after: KitchenModule | null,
) { /* appends to undoStack (capped at UNDO_HISTORY_LIMIT), clears redoStack */ }
```

Each of the nine actions calls this once, right alongside its existing
`draft.modules` update: capture the module's state before the change (via
`get().draft.modules.find(...)`, or `null` for a fresh add), compute the
after-state the action already computes today, and call the helper. This is
a mechanical 2-4 line addition per action — the actions' own mutation logic
is unchanged.

`removeModule`'s existing `moveHistory: s.moveHistory.filter(...)` line is
deleted along with the rest of `moveHistory` — an undo entry for a deleted
module stores the full module object, so it stays valid even after the
module is gone from `draft.modules`; no filtering needed on delete.

## Keyboard shortcuts

`Ctrl+Z` → undo. `Ctrl+Y` or `Ctrl+Shift+Z` → redo. A `window` `keydown`
listener in `KitchenBuilder.tsx` (not scoped to the 3D tab only, since
editing also happens through the module inspector on either tab) —
ignored when focus is in an `INPUT`/`TEXTAREA`/`SELECT`, matching the
existing arrow-key nudge guard in `KitchenAssemblyScene.tsx`.

## UI

The existing undo button in the 3D view's camera toolbar
(`KitchenAssemblyScene.tsx`, currently wired to `onUndo`/`undoCount`) stays
in place, now backed by the new `undo`/`undoStack`. A redo button is added
next to it, same style, mirrored icon, wired to `redo`/`redoStack`. Both
buttons are disabled when their respective stack is empty (`undoStack.length
=== 0` / `redoStack.length === 0`) — same disabled-when-empty pattern the
undo button already has via `undoCount`.

`KitchenAssemblyScene`'s prop signature changes from
`onUndo?: () => void; undoCount?: number;` to also carry redo:
`onRedo?: () => void; redoCount?: number;` — `KitchenBuilder.tsx` passes
`redo`/`redoStack.length` through the same way it already passes
`undoLastMove`/`moveHistory.length` today (renamed to `undo`/
`undoStack.length`).

## Edge cases

- **Locked modules:** covered above under `undo()`/`redo()` — mutation is
  skipped, history bookkeeping still advances (matches how every other
  action already treats `locked`).
- **Deleting, then undoing, a module that was selected/being edited:**
  `editingModuleId`/`selectedId` are UI-focus state, not data — undo/redo
  only touches `draft.modules`, never these fields. A restored module does
  not automatically re-select or re-open its inspector.
- **`duplicateModule`:** the duplicate is a single `add` (one new module
  with a fresh id) — undoing it removes only the copy, never the original.

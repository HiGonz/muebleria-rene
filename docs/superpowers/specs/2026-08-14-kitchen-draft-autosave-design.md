# Kitchen Draft Projects + Autosave — Design

## Problem

A kitchen project only gets a backend row when the user explicitly clicks
"Guardar." Until then, everything (modules, room dimensions, client info)
lives only in a debounced localStorage draft (`kitchen-draft-v3`). If the
user closes the browser, loses the tab, or simply forgets to click Guardar
before assigning a client, the work can be lost — and today's "no client"
handling is a string-sentinel hack (`"Cliente por asignar"` substituted at
save time, stripped back to `""` on read) rather than a real nullable
column.

## Goals

- A project must be saveable without a client, and show up as a **draft**
  when it has none — without inventing a parallel "draft" system alongside
  the existing `kitchen_projects` table.
- Changes autosave to the backend periodically, without hammering the API
  on every keystroke/drag frame.
- The user can see the autosave state, and turn autosave on/off per
  project — and that toggle itself is *part of the project* (survives
  across browsers/devices, not just a local UI setting).
- Losing the tab/connection should lose at most a few seconds of work, not
  the whole session.
- None of this may require the user to fill in a client before saving, and
  it must not break projects that already have a client and are saved
  normally today.

## Current state (verified against the code)

- `kitchen_projects.client_name` is `NOT NULL` (migration
  `2026_06_03_000100_create_kitchen_tables.php`). `KitchenProjectController::store()`
  validates it `required|string|max:120`.
- The frontend already works around the NOT NULL constraint: if
  `draft.clientName` is blank, `mapKitchenPayload()`
  (`frontend/services/api.ts`) substitutes the literal string
  `"Cliente por asignar"` (`KITCHEN_DRAFT_CLIENT_PLACEHOLDER`) before
  sending it, and strips that same string back to `""` on read
  (`mapKitchenResponseToDraft`, `listKitchenProjects`).
- `kitchen_projects.status` (enum, default `'Borrador'`) is a manually-set
  business-workflow field (Borrador → En diseño → Cotizado → ...), advanced
  automatically only by `quote()`. It does not mean "not yet saved" or "no
  client" — reusing it for that would conflate two different meanings.
- A project has **no backend ID until the first "Guardar" click**.
  `saveKitchenProject(draft, projectId)` already does the right thing once
  called: `POST /kitchen-projects` (full payload) when `projectId === null`,
  else `PUT /kitchen-projects/{id}` (metadata) + `POST
  /kitchen-projects/{id}/modules/sync` (destructive replace-all of modules).
- No autosave-to-backend exists anywhere. The only existing autosave-shaped
  thing is the client-side debounced localStorage persist
  (`createDebouncedLocalStorage`, 500ms, `kitchen-draft-v3`) — same pattern
  the closet builder uses, unrelated to any backend call.
- No `beforeunload`/`visibilitychange`/`pagehide` handling exists anywhere
  in the frontend.
- `/kitchen/projects` already lists every project regardless of status —
  including ones that would become drafts under this design — with no
  draft/complete filter today.

## Non-goals

- No `clients` table / real client entity — out of scope, this project has
  none today and inventing one is a much bigger change than what's asked.
- No incremental/diffed module sync — autosave reuses the existing
  destructive `modules/sync` replace-all endpoint. For a typical kitchen
  (tens of modules) this is cheap; it is not designed to scale to
  thousands of modules, but that's true of the manual save path today too.
- No cross-tab conflict resolution (two tabs editing the same project
  concurrently) — last-write-wins, same as today's manual save.
- Closet builder is untouched — it has no backend persistence at all yet
  (a later phase), so "client" and "draft" don't apply to it.

## 1. Data model

### Migration (additive, new file — never edit the original migration)

```php
Schema::table('kitchen_projects', function (Blueprint $table) {
    $table->string('client_name')->nullable()->change();
    $table->boolean('autosave_enabled')->default(true)->after('status');
});

// Backfill: the placeholder was always a stand-in for "no client yet" —
// converting existing rows to real NULL is what makes old and new drafts
// behave identically from here on (list badge, validation, etc.), instead
// of leaving a permanent split between "old-style empty" and "new-style
// empty" projects.
DB::table('kitchen_projects')
    ->where('client_name', 'Cliente por asignar')
    ->update(['client_name' => null]);
```

`->nullable()->change()` requires `doctrine/dbal`, already present in
`backend/composer.json` (`^4.4`) — no dependency change needed.

### Model (`app/Models/KitchenProject.php`)

Add `'autosave_enabled'` to `$fillable` and `'autosave_enabled' => 'boolean'`
to `$casts`. `client_name` needs no cast change (already a plain string
attribute; PHP/Eloquent handles `null` natively).

### Controller (`KitchenProjectController`)

- `store()`: change `'client_name' => 'required|string|max:120'` to
  `'client_name' => 'nullable|string|max:120'`. Add
  `'autosave_enabled' => 'sometimes|boolean'` (defaults to the column
  default of `true` when omitted).
- `update()`: `client_name` is already `sometimes` — just also accept
  `null` (`'sometimes|nullable|string|max:120'`). Add
  `'autosave_enabled' => 'sometimes|boolean'`.
- No other action needs to change. `index()`/`show()` already return the
  full row, so `client_name: null` and `autosave_enabled` come through for
  free once cast.

## 2. Frontend: types and API mapping

- `KitchenDraft` (`types/kitchen.ts`) gains `autosaveEnabled: boolean`
  (default `true` in `initialDraft`).
- `frontend/services/api.ts`:
  - Delete `KITCHEN_DRAFT_CLIENT_PLACEHOLDER` and every place that
    substitutes/strips it (`mapKitchenPayload`, `mapKitchenResponseToDraft`,
    `listKitchenProjects`). `clientName: ""` now maps to `client_name: null`
    on the way out, and `client_name: null` maps to `clientName: ""` on the
    way in — a plain, honest null-to-empty-string mapping, no sentinel.
  - `mapKitchenPayload` includes `autosave_enabled: draft.autosaveEnabled`.
  - `mapKitchenResponseToDraft` reads `autosaveEnabled: project.autosave_enabled`.
  - `BackendKitchenProject` type (and whatever list-row type
    `listKitchenProjects` maps to) gains `autosave_enabled: boolean` /
    `autosaveEnabled: boolean` respectively, and `clientName` becomes
    genuinely nullable/empty rather than placeholder-bearing.

## 3. Draft = derived, not stored

A project is a draft **iff `clientName` is empty**. No new boolean, no new
status value — this is computed wherever it's needed (list badge, notice
banner), never persisted redundantly. This directly matches "los proyectos
sin cliente aparecen como borradores."

## 4. Lazy backend creation

The backend row is created on the **first real change** after entering the
builder with `projectId === null`, not the instant the page loads. This
avoids littering `/kitchen/projects` with empty rows from users who open
the builder and immediately navigate away.

"First real change" is detected the same way React already would: every
mutating store action already produces a new `draft` object reference
(immutable-update pattern, same as the rest of the store). A `useEffect`
keyed on `[draft]` fires on every real mutation and does NOT fire from
merely mounting with an already-loaded draft, *provided* the effect skips
its own first run (a `hasMountedRef` guard — otherwise the mount itself,
or a freshly-`loadProject`-ed draft, would look like a "change"). No new
store field, no per-action instrumentation needed.

## 5. Autosave scheduling

New hook, `frontend/hooks/useKitchenAutosave.ts`. Inputs: `draft`,
`projectId`, `onProjectCreated` (calls the store's existing
`adoptSavedProjectId`/`loadProject` machinery), enabled flag. Behavior:

- Debounce: after a change, wait ~2.5s of no further changes before
  saving.
- Max-wait cap: even under continuous changes (e.g. dragging a module for
  30s straight), force a save at least every ~20s, so a long uninterrupted
  editing session still checkpoints periodically. Implemented as a small
  hand-rolled debounce-with-maxWait (two timers: a resettable debounce
  timer and a non-resetting max-wait timer, whichever fires first wins and
  clears the other) — same "hand-roll it, no new dependency" precedent as
  `createDebouncedLocalStorage`.
- Calls the exact same `saveKitchenProject(draft, projectId)` the manual
  Guardar button uses — no parallel save path. On success with
  `projectId === null`, adopts the newly-created id exactly like
  `handleSave` does today.
- Skipped entirely when `draft.autosaveEnabled === false` — manual Guardar
  keeps working regardless.
- Drives a status value the UI reads: `idle | saving | saved(at: Date) |
  error(message)`.

## 6. Leaving the page

- Primary: `visibilitychange` → when `document.visibilityState ===
  "hidden"`, immediately flush any pending debounced/max-wait save (skip
  the wait, save now if there are unsaved changes). This fires reliably on
  tab switch, minimize, and mobile backgrounding, and fires *before* most
  browsers' unload sequence — the right primary signal, not `beforeunload`.
- Secondary: `beforeunload` as a backup flush attempt for paths
  `visibilitychange` might miss — best-effort only; a multi-request
  authenticated save (`PUT` + `POST modules/sync`) cannot be guaranteed to
  complete once the page is actually torn down, so this is a "try, don't
  block" call, not a guarantee.
- The existing 500ms-debounced localStorage persist is the real safety net
  underneath both of these — it's same-browser-only but near-instant, so
  the worst case if both backend flush attempts are lost is "reopen the
  same browser, the localStorage draft still has it, autosave picks up
  from there on the next change." Recovery *across* browsers/devices
  depends on the backend row already existing from a prior autosave tick.

## 7. UI

- **Status indicator**, next to the existing Guardar button: `Guardando…` /
  `Guardado hace Xs` (live-updating label, ticks every ~5-10s while in the
  `saved` state) / `Error al guardar` (with the existing toast already
  covering the loud version; this is the persistent quiet one) / nothing
  when idle and no project exists yet.
- **Autosave toggle**, visible near the same area — default ON. Changing it
  writes `autosaveEnabled` in the store immediately (optimistic) and PATCHes
  `{ autosave_enabled }` via the existing `PUT /kitchen-projects/{id}` path
  (only meaningful once a project id exists; before that it just sets the
  draft field, applied on first save like everything else). When OFF, the
  status indicator area shows a persistent "Guardado automático
  desactivado" label — not just silence — per the explicit requirement
  that OFF must be visually obvious.
- **Notice banner**, shown once when a project is *opened* (not on every
  autosave tick): dismissible, sessionStorage-keyed per project id
  (`kitchen-autosave-notice:{id}`) so it reappears on a genuinely new tab
  session but not on every render/autosave within the same visit. Content
  combines both messages from the spec when both apply (autosave on +
  draft), or just the relevant one:
  - "Guardado automático activado — este proyecto se guardará
    automáticamente mientras trabajas. Puedes desactivarlo desde la
    configuración del proyecto."
  - "Proyecto borrador — este proyecto todavía no tiene un cliente
    asignado. Tus cambios se guardarán automáticamente."
- **List badge** (`/kitchen/projects`): a small "Borrador" chip next to the
  client-name cell when `clientName` is empty, so the list makes drafts
  visible instead of just showing a blank cell.

## Testing

Backend: existing feature tests for `KitchenProjectController` (if any)
should still pass with `client_name` nullable; add coverage for
create/update with a null client and for the `autosave_enabled` field
round-tripping. Frontend: `npx tsc --noEmit` must stay clean; the debounce
+ maxWait timer logic is pure enough to unit-test with `npx tsx` the same
way `closetData.ts` helpers were verified this session, if a plan task
wants that level of rigor. The end-to-end "close browser, reopen, draft is
exactly as left" scenario is the user's own manual acceptance test — not
something this plan re-verifies via browser automation.

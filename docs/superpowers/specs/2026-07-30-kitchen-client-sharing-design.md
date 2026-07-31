# Kitchen client sharing — Phase 1 design

Status: approved, ready for implementation planning
Scope: **Phase 1 only** — the public "share with client" read-only viewer link.
Explicitly out of scope for this spec (deferred to later phases/specs):
- Taller (workshop) role, production states, production queue, technical panels.
- Internal comments, progress photos, notifications.
- Share link password protection and expiration (columns exist, logic doesn't — see below).

## Why this shape

The existing 3D engine (`components/3d/KitchenAssemblyScene.tsx`) already keeps every
camera/interaction control (orbit, zoom, view presets, wireframe, labels, dimensions,
door/drawer open-close via right-click/double-tap) *inside itself*, separate from the
editing chrome (`KitchenBuilder.tsx`: FAB, module list delete/duplicate, catalog
selector, module inspector, Guardar/Nuevo/Habitación/Materiales/Alturas). Editing
callbacks (`onModuleMove`, `onModuleNudge`, `onModuleRemove`, `onModuleActivate`) are
already optional props with `?.()` call sites — if a caller doesn't pass them, those
capabilities simply don't exist, nothing to hide or disable.

This means the client viewer needs no parallel engine and no capability-flag plumbing
through the whole component tree: a new, minimal page renders
`<KitchenAssemblyScene readOnly modules={...} .../>` directly, omitting every editing
prop, with `KitchenBuilder`'s chrome never mounted around it at all.

## Data model

New table `kitchen_project_shares` (not a column on `kitchen_projects` — a dedicated
table lets a share be revoked/regenerated without losing history, and lets
password/expiration ship later as pure logic against columns that already exist,
rather than a second migration):

```
kitchen_project_shares
  id                  bigint PK
  kitchen_project_id  bigint FK -> kitchen_projects.id, cascade on delete
  token               string(48), unique, indexed — opaque (Str::random(40)-class),
                      never the numeric project id
  password_hash       string, nullable   — unused in Phase 1
  expires_at          timestamp, nullable — unused in Phase 1
  revoked_at          timestamp, nullable — the "stop sharing" switch
  view_count          unsigned integer, default 0
  timestamps
```

`KitchenProjectShare` model:
- `belongsTo(KitchenProject::class)`
- `isActive(): bool` — `revoked_at === null && ($expires_at === null || $expires_at->isFuture())`
  (expires_at is always null today, but writing the real check now means turning
  expiration on later is a one-line form field, not new logic)

`KitchenProject` gains `shares(): HasMany` and a convenience `activeShare(): HasOne`
(latest share where `revoked_at IS NULL`, ordered `latest()`).

## Backend API

Two authenticated endpoints (inside the existing `auth:sanctum` group, alongside the
other `kitchen-projects` routes) manage sharing; one new **public** endpoint (outside
that group entirely, no auth) serves the viewer.

```
POST   /api/kitchen-projects/{kitchenProject}/share
  -> creates a share if none active, otherwise returns the existing active one.
     Response: { token, url, viewCount, createdAt }
     url is built from FRONTEND_URL/viewer/{token} — same env var CORS already reads.

DELETE /api/kitchen-projects/{kitchenProject}/share
  -> revokes the active share (sets revoked_at = now()). 404 if none active.

GET    /api/public/kitchen-shares/{token}    [NO auth:sanctum]
  -> 404 if token doesn't exist or share is not active (revoked/expired — same
     response either way, doesn't leak *why* a dead link is dead).
  -> increments view_count.
  -> 200: { projectName, roomWidth, roomDepth, ceilingHeight, openings, modules }
     Deliberately thinner than the authenticated project payload: no numeric
     kitchen_project_id, no client_phone, no notes, no user_id, no status. The
     client only ever needs geometry to render the room.
```

`PublicKitchenShareController` is a new, separate controller — it must never
accidentally inherit an `auth:sanctum` middleware group assignment the way adding an
action to `KitchenProjectController` could.

Route registration in `routes/api.php`:
```php
Route::get('/public/kitchen-shares/{token}', [PublicKitchenShareController::class, 'show']);

Route::middleware('auth:sanctum')->group(function (): void {
    // ...existing routes...
    Route::post('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'createShare']);
    Route::delete('/kitchen-projects/{kitchenProject}/share', [KitchenProjectController::class, 'revokeShare']);
});
```

### CORS

`config/cors.php`'s `paths` currently only covers `api/*`, which already matches
`api/public/kitchen-shares/{token}` — no change needed there. The public endpoint
returns plain JSON (no cookies), so `supports_credentials` staying `false` is correct.

## Frontend

### Share button + modal (in `KitchenBuilder.tsx`)

- New "Compartir con cliente" button in the header, next to "Guardar".
- Opens a small modal (new `components/kitchen/ShareModal.tsx`):
  - No active share yet -> "Generar enlace" button -> `POST .../share`, show the
    resulting URL with a copy-to-clipboard button.
  - Active share exists -> show the URL + copy button + "Dejar de compartir" (calls
    `DELETE .../share`).
- New `services/api.ts` functions: `createKitchenShare(id)`, `revokeKitchenShare(id)`,
  both thin wrappers over `http.post`/`http.delete`.

### Public viewer route

- New route `app/viewer/[token]/page.tsx` — client component, no `AppShell` (no
  sidebar, no login gate — matches "abrir sin iniciar sesión").
- Fetches `GET /api/public/kitchen-shares/{token}` via a **plain fetch**, not the
  existing `services/http.ts` (that helper attaches a Bearer token from
  `useAuthStore` and redirects to `/login` on 401 — both wrong for an anonymous
  public page). A new tiny `services/publicApi.ts` holds this one function.
- Renders a minimal header (project name only, no client phone/notes — matches the
  thin public payload) and `<KitchenAssemblyScene readOnly modules={...} .../>`
  directly — no `KitchenBuilder` wrapper.
- 404 / dead link -> a plain "Este enlace ya no está disponible" state, no redirect
  to `/login` (this page must never imply the visitor should have an account).

### `KitchenAssemblyScene` change

One new prop: `readOnly?: boolean`. When true:
- The module list panel (bottom-left, with isolate/hide/delete) is not rendered at
  all — matches "no mostrar listas."
- Everything else (`Camera3DControls`, door/drawer right-click/double-tap, wireframe/
  labels/dimensions toggles) needs no changes — they already don't depend on any
  editing callback being present.
- No `onModuleMove`/`onModuleNudge`/`onModuleRemove`/`onModuleActivate` are passed
  from the viewer page, so drag, nudge, delete, and "open inspector" are already
  impossible without touching those code paths at all.

## End-to-end flow

1. Admin opens a saved kitchen project, clicks "Compartir con cliente".
2. Modal calls `POST /kitchen-projects/{id}/share`, shows the generated
   `{FRONTEND_URL}/viewer/{token}` link with a copy button.
3. Admin sends the link to the client through whatever channel they already use
   (WhatsApp, email — outside this system).
4. Client opens the link, no login: sees the kitchen, can orbit/zoom/change view/
   open doors and drawers/toggle wireframe-labels-dimensions. Cannot add, remove,
   move, rotate, duplicate, or edit anything — those affordances are simply absent
   from the page, not disabled-and-hidden.
5. Admin can revisit the modal any time and click "Dejar de compartir" to revoke;
   the link then 404s for the client without deleting the share record (so "who did
   I share this with, when" stays in the table for later, even though there's no UI
   for that history in Phase 1).

## Out of scope reminders (for whoever picks up Phase 2/3)

- Taller role and the `kitchen_projects.status` enum expansion are a separate spec —
  that status column is a real Postgres/MySQL `enum()`, so widening it is a genuine
  migration, not a frontend-only change.
- Photo uploads need cloud storage (S3/R2) configured before they're safe to build —
  Railway's disk is ephemeral and would silently lose real client photos on every
  redeploy. Don't wire photo upload against local disk "temporarily."
- Password/expiration for share links: the columns already exist on
  `kitchen_project_shares` (`password_hash`, `expires_at`) — turning them on later is
  a form field + an `if` in `PublicKitchenShareController@show`, not a new migration.

# User Roles (Admin / Vendedor / Taller) — Design

## Problem

`users.role` (`admin` | `seller`, default `seller`) and `users.active`
already exist on the model, are already returned by `POST /login`, and are
already typed and stored client-side in `useAuthStore` — but nothing reads
`role` anywhere. Every authenticated user can hit every route and see every
page, regardless of role. There's no way to tell who created a given
project without querying the database directly (`user_id` is already a
real FK on both `Project` and `KitchenProject`, just never surfaced in any
UI). There's no screen to create/manage vendedor or taller accounts — the
only two accounts that exist come from `DemoUserSeeder`.

## Goals

- Three roles — `admin`, `seller` (Vendedor), `taller` (Taller) — each
  restricted to a specific set of pages and API actions, enforced on both
  the backend (a rejected request is a real 403, not just a hidden button)
  and the frontend (hidden nav items/buttons, not just a blocked click).
- Admin: unrestricted access to everything, plus a new user-management
  screen to create/edit/deactivate vendedor and taller accounts.
- Vendedor: full design + quoting workflow (Dashboard, Nuevo diseño,
  Diseñar cocina, Diseñar closet, Cocinas, Cotizaciones, Proyectos) — sees
  **every** project/quote regardless of who created it (not scoped to
  their own), with an "owner" column so it's clear whose it is. No access
  to Materiales, Acabados, or Usuarios.
- Taller: can open a project to see its build-relevant technical detail
  (dimensions, cut list, module list — the Vista 3D tab) and can move a
  project through the production status flow (`Aprobado` → `En
  producción` → `Entregado`), but never sees prices/costs/quote totals
  anywhere, cannot create or edit a design, and has no access to
  Materiales, Acabados, Cotizaciones, or Usuarios.
- Zero disruption to existing accounts: `admin@demo.com` keeps working as
  `admin`, `seller@demo.com` keeps working as `seller` (Vendedor) — this
  is additive (one new role value, real gates where there were none),
  not a breaking migration of existing data.

## Current state (verified against the code)

- **`User` model** (`app/Models/User.php`): plain Eloquent, no
  `HasRoles`/Spatie trait. `$fillable` includes `role`, `active`.
  `spatie/laravel-permission` is a composer dependency but is not used
  anywhere in the codebase (`HasRoles`, `assignRole`, `hasRole`, `->can(`
  all return zero matches).
- **`users` migration** (`0001_01_01_000000_create_users_table.php`):
  `role` is a plain `string` column, default `'seller'` — no DB-level
  enum/check constraint, so adding `'taller'` as a value needs no schema
  migration, only application-level validation.
- **`DemoUserSeeder`**: seeds exactly `admin@demo.com` (`role: admin`) and
  `seller@demo.com` (`role: seller`).
- **`AuthController::login`**: returns the full `$user` object (only
  `password`/`remember_token` are `$hidden`) alongside the Sanctum token
  — `role` and `active` are already in every login response today.
- **`useAuthStore.ts`**: already types `AuthUser.role: "admin" | "seller"`
  and persists it — needs widening to include `"taller"`, nothing else
  structural.
- **Zero existing authorization**: `routes/api.php`'s entire
  `auth:sanctum` group has no role middleware anywhere. Every route is
  reachable by any authenticated user today.
- **Ownership already modeled, never displayed**: `KitchenProject belongsTo
  User` (`user_id` FK) and `Project belongsTo User` both already exist;
  `KitchenProjectController::index` doesn't currently eager-load or return
  the owner relation; the frontend list pages (`kitchen/projects/page.tsx`,
  `projects/page.tsx`) have no owner column.
- **Full current page inventory** (`frontend/app/**/page.tsx`):
  `/dashboard`, `/projects/new`, `/kitchen`, `/kitchen/projects`,
  `/closet`, `/materials`, `/finishes`, `/quotes`, `/projects`,
  `/projects/[id]`, `/login` (public), `/viewer/[token]` (public, no auth
  at all — the client-facing share link, untouched by this spec),
  `/dev-thumb-export` (an internal dev tool used by
  `scripts/generate-thumbnails.mjs`, not a real user-facing page — out of
  scope, see Non-goals).
- **Kitchen builder's own internal tabs**: `KitchenBuilder.tsx` has two
  tabs, "Vista 3D" (dimensions, cut visualization, module list — no prices)
  and "Resumen" (`KitchenSummary.tsx` — full material cost breakdown,
  computed client-side from `materialCosts`/`finishes` catalogs fetched
  over the API, plus the persisted `KitchenQuote.total`). This tab split
  is exactly the boundary Taller's restriction needs — see section 4.

## Non-goals

- Not adopting `spatie/laravel-permission`. Its dynamic roles/permissions
  tables solve "let an admin configure permissions from a UI" — this spec
  has 3 fixed roles with a matrix defined by business rules, not something
  meant to be end-user-configurable. Plain Laravel Gates reading the
  existing `role` column are simpler, sufficient, and don't add unused
  tables on top of an already-unused package.
- No per-project assignment ("this vendedor's projects vs. that one's") —
  already resolved: every vendedor sees every project.
- No change to the public, unauthenticated `/viewer/[token]` client-share
  page — that flow has never used `auth:sanctum` and stays exactly as is.
- No change to `/dev-thumb-export` — an internal Playwright-driven tool,
  not part of the role matrix.
- No password-reset/invite-email flow for new users — the new Usuarios
  screen sets an initial password directly (admin tells the new hire
  their password out of band), matching how the two demo accounts already
  work. A "send invite email" flow is a separate future feature if wanted.
- No UI to let Taller edit anything about a project other than `status` —
  confirmed: they can advance it through production, not touch the design.

## 1. Data model

`role` gains a third valid value, `taller`, alongside the existing
`admin`/`seller` — no migration needed (column is already an
unconstrained string). Add a small `RoleController`-adjacent constant/enum
on the backend (`App\Enums\UserRole` or a simple const array — see
section 2) so the three valid values are defined once, not repeated as
magic strings across controllers/policies.

## 2. Backend authorization

A `Gate::define` per capability, registered in `AppServiceProvider`,
reading `$user->role` directly (no new tables):

```php
Gate::define('manage-catalog', fn (User $u) => $u->role === 'admin');       // Materiales, Acabados
Gate::define('manage-users',   fn (User $u) => $u->role === 'admin');       // Usuarios
Gate::define('design-projects',fn (User $u) => in_array($u->role, ['admin', 'seller'])); // create/edit kitchen+closet+old-Project designs, sync modules
Gate::define('view-pricing',   fn (User $u) => in_array($u->role, ['admin', 'seller'])); // quote totals, material costs, Cotizaciones
Gate::define('view-projects',  fn (User $u) => in_array($u->role, ['admin', 'seller', 'taller'])); // read-only project/kitchen-project access
Gate::define('advance-status', fn (User $u) => in_array($u->role, ['admin', 'seller', 'taller'])); // status-only project update
```

Applied as route middleware (`can:design-projects` etc.) in
`routes/api.php`, and inside controllers for the finer-grained cases a
route-level gate can't express (see the two below).

### Route-by-route matrix

| Route | Admin | Vendedor | Taller |
|---|---|---|---|
| `materials.*`, `finishes.*` | ✅ | ❌ 403 | ❌ 403 |
| `quotes.*` | ✅ | ✅ | ❌ 403 |
| `projects.*` (old system), `.calculate`, `.quote` | ✅ | ✅ | view-only (`index`/`show`, no create/update/destroy) |
| `kitchen-projects.store`, `.destroy`, `.share`/`.quote` | ✅ | ✅ | ❌ 403 |
| `kitchen-projects.index`, `.show` | ✅ | ✅ | ✅ (response has pricing fields stripped — see below) |
| `kitchen-projects.update` | ✅ full | ✅ full | ✅ **but only if the payload's only key is `status`, and only to an allowed transition** — see below |
| `kitchen-projects.modules.sync` | ✅ | ✅ | ❌ 403 |
| `users.*` (new) | ✅ | ❌ 403 | ❌ 403 |
| `dashboard/stats` | ✅ | ✅ | ✅ (a taller-appropriate subset — see section 5) |

**Taller's status-only update**: `KitchenProjectController::update`
currently accepts the full validated payload (name, dimensions, modules
metadata, `status`, etc. — see the existing `$validated` array). Add a
guard at the top: if `$request->user()->role === 'taller'`, re-validate
that the request body contains only a `status` key (reject with 422
otherwise — "Taller solo puede cambiar el estado del proyecto"), and that
the target status is one of `['Aprobado', 'En producción', 'Entregado']`
(taller can't send a project backward to `Borrador`/`En diseño`/`Cotizado`
— those are design-phase states, not theirs to set). Everyone else
(admin/seller) keeps the existing unrestricted update.

**Stripping pricing from `kitchen-projects.index`/`.show` for Taller**:
`KitchenProjectController::index`/`show` currently eager-loads
`quote:id,kitchen_project_id,total,status,folio` and returns it as-is. When
`$request->user()->role === 'taller'`, drop the `quote` relation from the
response entirely (`null` it out or omit the eager-load) rather than
trying to redact individual fields — the frontend's `listKitchenProjects`
already treats a missing quote as "no total" (`total: p.quote?.total ??
null`), so this degrades gracefully with no frontend crash.
`materials`/`finishes` `index` routes are blocked outright for taller (see
matrix above), so the cost catalogs themselves are never reachable —
combined with the quote-stripping, taller's `kitchen-projects` responses
carry dimensions/module data (needed for the cut list) but no cost data
anywhere.

## 3. New: Usuarios (user management)

Admin-only CRUD, mirroring the existing Materials/Finishes CRUD pattern:

- Backend: `UserController` (`index/store/update/destroy`), route
  `Route::apiResource('users', UserController::class)->except(['show'])`,
  gated by `can:manage-users`. `store`/`update` validate `name`
  (required), `email` (required, unique, ignore-self on update), `role`
  (`Rule::in(['admin', 'seller', 'taller'])`), `password` (required on
  create via `Hash::make`, optional on update — only set if provided),
  `active` (boolean). `destroy` should actually **deactivate**
  (`active = false`) rather than hard-delete — a user row is the FK target
  of every project/quote they ever touched (`user_id`, `NOT NULL` per the
  existing `cascadeOnDelete` on the reverse direction — deleting the user
  would cascade-delete every project they created, which is never what
  "remove this employee" should mean). The "Eliminar" action in the UI is
  relabeled "Desactivar" to match — consistent with how `active` already
  gates login in `AuthController::login`.
- Frontend: `app/users/page.tsx` + `components/users/UserFormModal.tsx`,
  same shape as `materials`/`finishes`. Table: name, email, role badge,
  active/inactive badge, actions (Editar, Activar/Desactivar). Admin
  cannot deactivate their own account from this screen (guard both sides
  — a solo admin locking themselves out is an unrecoverable mistake this
  screen should just prevent, not merely discourage).
- Sidebar gains `{ href: "/users", label: "Usuarios", icon: Users }`,
  admin-only (see section 5).

## 4. Kitchen builder: Taller's read-only, price-free view

When `useAuthStore().user.role === 'taller'` and the builder is opened via
`/kitchen?projectId=…` (Taller never reaches `/kitchen` with no
`projectId` — that entry point is gated out of their sidebar/routes
entirely, see section 5):

- The "Resumen" tab button is not rendered at all — Taller only ever sees
  "Vista 3D" (dimensions, cut visualization already show no prices today).
- The "Guardar", "Nuevo", "Habitación", "Materiales" (global materials
  modal), "Compartir" header actions are hidden — none of them apply to a
  read-only viewer.
- The 3D view's module inspector (tap a module → edit panel) is not
  reachable — no `ModuleFabCluster`/`onModuleActivate` wiring for taller,
  since editing a module's design is exactly what they can't do. They can
  still orbit/zoom/pan the camera to inspect the layout.
- A visible status control (reusing the same `<select>` pattern already on
  the Cocinas list) is added to the builder's header for taller, since
  this is the one write action they're allowed — restricted client-side to
  the same 3 downstream statuses the backend enforces.

## 5. Frontend: route/sidebar gating

- `useAuthStore`'s `AuthUser.role` widens to `"admin" | "seller" |
  "taller"`.
- `Sidebar.tsx`'s `items` array gains a `roles: AuthUser["role"][]` field
  per entry; the render filters by `useAuthStore((s) => s.user?.role)`.
  Matches the confirmed matrix: Materiales/Acabados/Usuarios → `["admin"]`
  only; Nuevo diseño/Diseñar cocina/Diseñar closet/Cotizaciones →
  `["admin", "seller"]`; Dashboard/Cocinas/Proyectos → all three.
- A small `withRoleGuard(Component, allowedRoles)` wrapper (or an
  equivalent check at the top of each page component) redirects to
  `/dashboard` with a toast if a signed-in user's role isn't in the
  page's allowed list — covers direct URL entry, not just nav-link
  hiding, since hiding a sidebar link alone doesn't stop someone typing
  the URL.
- `kitchen/projects/page.tsx` and `projects/page.tsx` gain an "Dueño"
  column (owner's `name`), sourced from the backend eager-loading `user`
  alongside the existing `quote` relation — visible to admin/seller (not
  meaningfully different for taller, whose access to these lists is
  already read-only and price-free per section 2/4).

## 6. Testing

Backend: `php artisan test`, following this repo's established
Sanctum-feature-test convention (`Sanctum::actingAs($user)` with a
role-specific factory user) — new `UserRoleAuthorizationTest.php` covering
the route matrix's denial cases (403 for seller on `materials.store`, 403
for taller on `kitchen-projects.store`, 403 for taller sending a
non-status-only update, 422 for taller sending a disallowed status
transition, 200 for taller's allowed status transition, quote relation
absent from a taller's `kitchen-projects.show` response) plus the new
`UserController` CRUD (name/email/role validation, self-deactivation
blocked, deactivate-not-delete). Frontend: `npx tsc --noEmit`; manual
verification logging in as each of the three demo-seeded roles (seeder
gains a third `taller@demo.com` account) and confirming the sidebar/page
set matches the matrix, per this repo's established practice of manual
verification over automated frontend tests for UI-shaped changes.

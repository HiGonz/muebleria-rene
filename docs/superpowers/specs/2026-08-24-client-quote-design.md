# Client-facing quote (versioned, separate from the internal computed total)

Date: 2026-08-24

## Problem

The kitchen builder computes a materials-based cost breakdown live in the
browser (`calculateKitchenMaterials` in `services/kitchenData.ts`) and shows
it to internal staff (`KitchenSummary`, the admin projects table's
"Cotización" column, the PDF export). Nothing about pricing is ever shown to
the client through the existing share link (`/viewer/[token]`) — that view
renders only the 3D scene.

The store needs a second, independent number: a manually-typed amount that's
what gets *told* to the client, plus a short, styled "Incluye:" writeup
(materials/hardware included) — separate from, and never replacing, the
internally computed total. This needs to be editable from the projects
table and needs to end up on the same client share link the store already
uses.

## Scope

- A new, independent "client quote" concept per project: an amount, a list
  of short "included" items, and freeform styled notes.
- Versioned: every save creates a new version. Staff can see the full
  history; the client only ever sees the latest version.
- Editable via a new button in the projects table (alongside the existing
  "Compartir" button), opening a modal.
- A "smart" quick-add input for included items, suggesting phrases derived
  from the specific project's own already-configured module options
  (board material, hardware finish, drawer system, countertop material,
  door style, etc.), with freeform entries always allowed too.
- A lightweight markdown editor (3 formatting buttons + live preview) for
  the notes field.
- Rendered on `/viewer/[token]` as a floating, collapsible panel over the
  3D scene — absent entirely when no quote has ever been captured.

## Out of scope

- Does not touch the internal computed total, `KitchenSummary`, the
  projects table's "Cotización" column, or the PDF export — all unchanged.
- Does not touch the existing legacy `quotes`/`project_materials` system or
  the unused `kitchen_quotes` table (different shape, different purpose —
  left alone).
- Does not add authentication/expiry/password changes to the share link
  itself — reuses the existing `KitchenProjectShare` token mechanism as-is.
- No editing/deleting of past versions — append-only history.
- Markdown support is intentionally limited to bold, bullet lists, and one
  heading level — no tables, links, images, or nested lists.

## Data model

New table `kitchen_client_quotes`:

| column | type | notes |
|---|---|---|
| `id` | bigint pk | |
| `kitchen_project_id` | fk → `kitchen_projects.id`, cascade delete | |
| `amount` | decimal, nullable | the manually-typed client-facing amount |
| `includes` | json, default `[]` | array of short strings, e.g. `["Herrajes: Soft-close"]` |
| `notes` | text, nullable | markdown source |
| `created_by` | fk → `users.id`, nullable | who saved this version |
| `created_at` | timestamp | no `updated_at` — rows are immutable once created |

All three content fields (`amount`, `includes`, `notes`) are individually
optional, but saving requires at least one of them to be non-empty (no
point creating an all-blank version).

`App\Models\KitchenClientQuote` — `belongsTo(KitchenProject)`. On
`KitchenProject`: `clientQuotes()` (`hasMany`, ordered newest-first) and
`currentClientQuote()` (`hasOne(KitchenClientQuote::class)->latestOfMany()`),
mirroring the existing `activeShare()` pattern already used for
`KitchenProjectShare`.

## Backend endpoints

Both under the existing authenticated `kitchen-projects` route group:

- `GET /kitchen-projects/{id}/client-quotes` — full version history, newest
  first. Each entry: `id, amount, includes, notes, createdAt, createdBy`.
- `POST /kitchen-projects/{id}/client-quotes` — creates a new version.
  Body: `{ amount?: number, includes?: string[], notes?: string }`. Returns
  the created row. No PUT/DELETE — versions are immutable.

`PublicKitchenShareController::show` gains one additional key in its
response, only ever the latest version (never the full history):

```php
'clientQuote' => $project->currentClientQuote ? [
    'amount' => $project->currentClientQuote->amount,
    'includes' => $project->currentClientQuote->includes,
    'notes' => $project->currentClientQuote->notes,
] : null,
```

Client name/phone/internal notes/status/computed materials breakdown
remain excluded from this payload exactly as today — this change only adds
the one new key.

## Frontend: editing

New component `ClientQuoteModal.tsx` (mirrors `ShareModal.tsx`'s
structure/trigger pattern), opened via a new "Cotización cliente" button
next to "Compartir" in `app/projects/page.tsx`'s row actions.

Modal contents, top to bottom:
1. Collapsed, read-only version history (date, amount, and who created it
   per row — a plain list, no editing affordance).
2. Amount field — a currency-formatted number input (matches `fmtMXN`
   convention used elsewhere), optional. The whole form (amount, chips,
   notes) pre-fills with the current (latest) version's values when the
   modal opens, so anything the store employee doesn't touch carries
   forward unchanged into the new version by default — this is editing
   "the current state forward," not filling a blank form each time.
3. "Incluye" — a chip list with a combobox-style add input: typing filters
   suggestions drawn from the current project's own modules (see below);
   Enter (or clicking a suggestion) adds a chip; typing something that
   matches nothing and pressing Enter still adds it as a freeform chip.
   Each chip has a small remove (×) affordance.
4. "Notas" — the markdown-lite editor (see below).
5. "Guardar nueva cotización" button — POSTs, creates a new version,
   refreshes the history list, closes the modal.

### Suggestion mechanism (the "smart" part)

A pure function, e.g. `deriveIncludeSuggestions(modules: KitchenModule[]):
string[]`, scans every module's `options` for a small fixed set of known
fields already used across the catalog — `boardMaterial`, `hardwareFinish`,
`drawerSystem`, `countertopMaterial`, `doorStyle`, `sinkMaterial` — collects
the distinct non-empty values actually present, and formats each as a
short label (e.g. `"Tablero: Melamina blanca"`, `"Herrajes: Soft-close"`).
No separate catalog is maintained; this is entirely derived from whatever
the project's own modules are already configured with, so it's always
in sync with that project and needs no upkeep.

### Markdown-lite editor

A plain `<textarea>` bound to the raw markdown string, with 3 buttons
above it — **Negrita**, **Lista**, **Título** — that wrap the current
selection (or insert at the cursor if nothing is selected) with
`**...**`, prefix the current line with `- `, or prefix it with `## `,
respectively. Below the textarea, a live preview renders the same string
through the markdown renderer used on the client view (see below), so
staff see the styled result while typing.

New dependency: a lightweight markdown-to-React renderer (e.g.
`react-markdown` with no plugins — base feature set already covers
paragraphs/bold/bullet-lists/headings, which is all this needs). Used in
both the editor's live preview and the public viewer panel, so both
render identically.

## Frontend: client-facing panel

New component `ClientQuotePanel.tsx`, rendered in
`app/viewer/[token]/page.tsx` as a floating overlay positioned over a
corner of the 3D canvas (e.g. bottom-right), absolutely positioned so it
doesn't interfere with `KitchenAssemblyScene`'s own drag/orbit handling.

- If `clientQuote` is `null` in the fetched payload, the component renders
  nothing.
- Otherwise: a small header bar (label "Cotización" + minimize/expand
  toggle). Collapsed state shows just that header. Expanded state adds:
  the amount (formatted MXN, omitted if not set), an "Incluye:" bullet
  list (omitted if empty), and the notes rendered through the same
  markdown renderer (omitted if blank).
- Starts expanded by default when a quote exists.

## Testing

- `deriveIncludeSuggestions` gets unit tests in `services/kitchenData.test.ts`
  (or a new co-located test file) — the usual pattern for pure functions in
  this codebase.
- Backend: feature tests for the two new endpoints (create version, list
  history, and confirming the public share payload includes only the
  latest version's data) following the existing `KitchenProjectController`
  test conventions.
- No new tests needed for the markdown toolbar button behavior or the
  floating panel's collapse/expand — this codebase doesn't have component-
  level UI tests for equivalent existing pieces (`ShareModal`,
  `KitchenSummary`), so this stays consistent with existing practice.

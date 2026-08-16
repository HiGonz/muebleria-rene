# Acabados/Texturas (Finishes) CRUD + Photo-to-Texture Pipeline — Design

## Problem

Exterior panel finishes (`ExteriorTextureId`: `blanco_liso`, `roble_claro`,
`nogal_oscuro`, `naranja_vibrante`) are 4 hardcoded procedural wood-grain
textures, painted onto a canvas at runtime by `getWoodTexture()`
(`frontend/components/3d/woodTextures.ts`) — adding a 5th finish means a
code change and a deploy. Countertops (`cubiertas`) currently reuse this
same exterior-panel catalog via `mod.options.countertopTexture:
ExteriorTextureId | "ninguna"` (`ModuleInspector.tsx:986-1014`,
`KitchenAssemblyScene.tsx:764-765`) — semantically wrong, since a
countertop's real finish (granite speckle, quartz veining, laminate grain)
has nothing to do with cabinet wood grain, and a shop needs to represent
its actual stocked slabs, not a small fixed set of procedural wood colors.

The shop wants an admin-manageable catalog of real finishes, populated by
uploading a photo of the actual material (a board sample, a granite/quartz
slab) rather than hardcoding new procedural definitions per finish.

## Goals

- An admin can create, edit, activate/deactivate, and delete finish
  entries via a real CRUD UI, each backed by an uploaded photo.
- An uploaded photo is automatically turned into a texture usable on a 3D
  surface without visible tiling seams, with no per-upload manual editing
  required from the admin (crop/align in a separate tool, etc.).
- Exterior panel finishes and countertop finishes share one catalog (one
  table, one CRUD screen), distinguished by a `type` so each picker only
  offers what's relevant to it.
- The existing 4 procedural wood textures keep working unchanged and stay
  selectable side by side with uploaded finishes on the same panel picker.
- Each `COUNTERTOP_MODELS` entry (Postformado, Cuarzo engineered, Granito
  natural, etc.) can be pinned to one uploaded finish, so picking that
  model automatically shows its real photographed texture instead of a
  flat color.
- A finish can carry an additional per-m² cost that gets added to the
  base board cost when applied to an exterior panel, so pricier
  colors/textures raise the quoted price automatically.
- Zero breakage: every existing kitchen project keeps rendering exactly
  as it does today, even before any finish is uploaded (`finishCode`
  unset → flat color fallback, exactly like today's `ctColor` fallback).

## Current state (verified against the code)

- **`ExteriorTextureId`** (`frontend/types/kitchen.ts:158`): closed union
  of 4 string literals. **`WOOD_TEXTURES`**
  (`frontend/components/3d/woodTextures.ts:15-20`): label + flat swatch
  per id, used for UI chips. **`GRAIN_PARAMS`** (`woodTextures.ts:29-34`):
  per-id canvas paint parameters (base color, grain color, stripe count,
  roughness). **`getWoodTexture(id)`** (`woodTextures.ts:76-97`): paints a
  256×256 canvas once per id, wraps it in a cached `THREE.CanvasTexture`
  with `RepeatWrapping` and a fixed `repeat.set(2, 2)`.
- **Exterior panel picker**: `TexturePicker` component
  (`ModuleInspector.tsx:166-185`) renders `WOOD_TEXTURES` as chips;
  `applyExteriorToBand(band, material, texture)` sets
  `opt.exteriorTexture`.
- **Countertop "Textura"**: `mod.options.countertopTexture?:
  ExteriorTextureId | "ninguna"` (`types/kitchen.ts:408`). UI at
  `ModuleInspector.tsx:986-1014` — same `WOOD_TEXTURES` chips plus a
  "Ninguna (color liso)" option, via `applyCountertopToAll(model, color,
  texture)`. Rendering at `KitchenAssemblyScene.tsx:763-765`:
  `ctColor = mod.options.countertopColor || ctColorMap[countertopMaterial]
  || "#c8b89a"`, `ctMap = getWoodTexture(countertopTexture)` when not
  `"ninguna"`.
- **`COUNTERTOP_MODELS`** (`kitchenData.ts:233-256`): hardcoded array,
  `{ id, label, material: CountertopMaterial, color, pricePerM2 }` — no
  texture/photo reference today. Picked via `CountertopModelPicker`
  (`ModuleInspector.tsx:187-208`).
- **Board pricing**: `BOARD_COSTS: Record<BoardMaterial, number>`
  (`kitchenData.ts:204-215`), read at `kitchenData.ts:2407` as
  `materialCosts?.get(material) ?? BOARD_COSTS[material] ?? 180`, then
  `sheetCost = boardCost * sheetAreaM2`. This is keyed **only** by board
  material name — the chosen `exteriorTexture` has zero cost effect
  today. (`materialCosts` here is the `Map` introduced by the sibling
  Materials-CRUD-pricing effort, see
  `docs/superpowers/specs/2026-08-15-materials-crud-pricing-design.md` —
  independent of this spec's `finishes` table, but the same call site.)
- **Existing CRUD precedent**: `Material`/`MaterialController`/
  `materials/page.tsx` — plain Eloquent model, `index/store/update/
  destroy`, a list page with an inline modal form
  (`MaterialFormModal.tsx`). This spec's `Finish`/`FinishController`/
  `finishes/page.tsx` follow the same shape, plus a file upload the
  Material CRUD doesn't have.
- **Backend has no image handling today**: `composer.json` has no
  image-processing package (no `intervention/image`). `config/
  filesystems.php` has the Laravel-default `local`/`public`/`s3` disks;
  `s3` is already shaped for an S3-compatible endpoint (`endpoint`,
  `use_path_style_endpoint`) which Cloudflare R2 satisfies directly, but
  no Cloudflare credentials exist in `.env` yet. Cloudflare Images (a
  different product, its own REST API rather than S3-compatible) would
  need a small dedicated client instead of the `s3` disk. **Which
  Cloudflare product is in use is unresolved until the user provides the
  `.env` values — flagged as a blocking unknown, see Non-goals.**

## Non-goals

- No AI/ML-based texture or PBR-map generation from the photo (normal
  maps, displacement, etc.) — out of scope for this phase. The seamless-
  tiling + color-normalize pipeline (below) is deterministic image
  processing only. A future phase could add this without changing the
  `finishes` schema (it would just populate `texture_url` differently).
- No per-(board × finish) combination pricing matrix — a finish's
  `extra_cost_per_m2` is a single flat surcharge added on top of whatever
  board is selected, not a priced SKU per combination.
- No cost effect for `cubierta`-type finishes — countertop pricing stays
  entirely on `COUNTERTOP_MODELS.pricePerM2`, untouched by this spec.
  `extra_cost_per_m2` is only read when the finish is applied as an
  `exteriorTexture` on a panel.
- No background job queue for image processing — photos are admin-
  uploaded occasionally (not a customer-facing high-volume path), so
  processing runs synchronously inside the `store`/`update` request.
- No migration of `COUNTERTOP_MODELS` itself off its hardcoded array —
  it stays a static frontend catalog; only its `finishCode` field is new,
  pointing into the new dynamic backend table.
- The exact Cloudflare product/credentials are not finalized in this
  spec — see the open item under "1. Data model" and "2. Pipeline". This
  must be resolved (user to provide `.env`) before implementation starts
  on the storage-upload step; everything else in this design is
  independent of that choice.

## 1. Data model

New table `finishes`, independent of `materials`:

```
id                  bigint, pk
name                string
code                string, unique          — stable id, referenced by COUNTERTOP_MODELS.finishCode
                                               and by exteriorTexture values, same pattern as
                                               Material.code in the sibling pricing spec
type                enum('panel','cubierta','ambos')
source_image_url    string                  — original upload, kept for admin reference/re-processing
texture_url         string                  — processed seamless-tile derivative; what Three.js loads
swatch_color        string (hex)            — auto-sampled average color, for small UI chips
repeat_scale        float, default 2        — replaces the hardcoded repeat.set(2,2)
roughness           float, default 0.5      — replaces the hardcoded GRAIN_PARAMS[id].roughness;
                                               low values (near 0) read as high-gloss/reflective
                                               (e.g. "alto brillo" white), no separate gloss field needed
extra_cost_per_m2   decimal, default 0      — added to board cost when type is panel/ambos; ignored for cubierta
active              boolean, default true
timestamps
```

`Finish` model: plain Eloquent, `$fillable` on all of the above except
`id`/timestamps, casts for `active:boolean`,
`repeat_scale/roughness/extra_cost_per_m2:float`.

`COUNTERTOP_MODELS` (`kitchenData.ts`) gains one new optional field:
`finishCode?: string`, matched against `finishes.code`.

**Open item, not blocking the rest of this design:** the exact storage
backend (Cloudflare Images vs. R2-via-S3-disk) is pending the user's
`.env` values. `source_image_url`/`texture_url` are stored as plain
public URL strings regardless of which one is chosen, so no other part
of this spec depends on the answer.

## 2. Upload + processing pipeline

Synchronous, inside the `FinishController@store`/`@update` request:

1. Admin submits the form (multipart) with the photo file plus
   name/code/type/repeat_scale/roughness/extra_cost_per_m2.
2. Backend runs `intervention/image` (new composer dependency — not
   currently installed) on the uploaded file:
   - Auto-normalize exposure/white balance (histogram stretch), so
     unevenly-lit phone photos don't look patchy once tiled.
   - Generate the seamless-tile derivative: offset the image 50% on both
     axes (wrap-around), blend a feathered band across the seam where
     the wrapped edges now meet, matching the classic "make seamless"
     technique — deterministic, no ML.
   - Resize the derivative down to a fixed texture resolution (1024×1024)
     to keep GPU memory/load time predictable regardless of the source
     photo's size.
   - Sample the derivative's average color → `swatch_color`.
3. Both the original upload and the processed derivative are pushed to
   the image storage backend (Cloudflare — product TBD, see open item
   above), yielding two public URLs.
4. The `finishes` row is saved with both URLs, the sampled swatch, and
   the admin-provided `repeat_scale`/`roughness`/`extra_cost_per_m2`
   (each defaulting per the table above if left blank).

Editing an existing finish without submitting a new photo skips step 2-3
entirely (URLs unchanged) — the same partial-update shape the
`Material`/`update` action already uses (`sometimes` validation rules per
field).

## 3. Frontend: unified texture registry

`exteriorTexture` widens from `ExteriorTextureId` (closed union) to
`string` — one namespace that covers both the 4 procedural ids and any
`finishes.code`. `getWoodTexture(id)` becomes `getFinishTexture(id,
finishes)`:

- If `id` matches a key in `GRAIN_PARAMS`, behavior is byte-identical to
  today — same canvas paint, same cache, zero visual regression on the
  4 existing finishes.
- Otherwise, look up `id` against the loaded `finishes` list by `code`;
  if found, load `texture_url` via `THREE.TextureLoader` (cached per
  URL, same `textureCache` map extended to key by string id either way),
  apply `RepeatWrapping` with the finish's own `repeat_scale`, and use
  its `roughness` in the material instead of the hardcoded
  `GRAIN_PARAMS` roughness.
- If `id` matches neither (finish deleted/deactivated after a project
  referenced it), fall back to `blanco_liso` — same graceful-degradation
  precedent as the existing `ctColor` fallback for countertops.

`finishes` is fetched once and cached in `useKitchenStore` (a
`loadFinishes()` action mirroring the existing `loadMaterialCosts()`
fire-and-forget pattern — called once from `KitchenBuilder.tsx`'s mount
effect, pricing/rendering simply uses fallbacks until it resolves).

## 4. Backend CRUD + admin page

Same shape as the existing Materials CRUD:

- `FinishController` (`index/store/update/destroy`), route
  `Route::apiResource('finishes', FinishController::class)->except(['show'])`
  inside the `auth:sanctum` group, next to `materials`.
- Validation: `name` required string, `code` required/unique (`Rule::
  unique('finishes','code')->ignore($finish->id)` on update), `type` in
  `['panel','cubierta','ambos']`, numeric fields `sometimes|numeric`,
  photo `sometimes|image|max:<size>` (required on create, optional on
  update).
- `frontend/app/finishes/page.tsx` (new `AppShell` page, added to
  `Sidebar` next to "Materiales"): table with a thumbnail
  (`texture_url`) instead of plain text, same Editar/Activar-Desactivar/
  Eliminar actions as `materials/page.tsx`.
- `FinishFormModal.tsx`: name, code, type (radio: panel/cubierta/ambos),
  file input for the photo (with a preview once processed and returned
  by the save response), and numeric inputs for
  repeat_scale/roughness/extra_cost_per_m2. `roughness` is presented as a
  labeled slider ("Mate" ↔ "Alto brillo") rather than a bare number, so
  an admin creating a reflective finish (e.g. white high-gloss) has an
  obvious low-end value to pick without knowing what "roughness" means
  numerically.
- `services/api.ts` gains `listFinishes`, `createFinish`, `updateFinish`,
  `deleteFinish` — `createFinish`/`updateFinish` send `FormData` (not
  JSON) because of the file upload, unlike every other `services/api.ts`
  call today.

## 5. Integration into the kitchen builder

- **Panel picker** (`ModuleInspector.tsx` `TexturePicker`): renders
  `WOOD_TEXTURES` chips followed by chips for every loaded `finishes`
  row with `type` `panel`/`ambos` (swatch = `swatch_color`, same chip
  styling). Selecting either kind just sets `opt.exteriorTexture` to the
  id/code string — the picker doesn't need to know which kind it picked.
- **Countertop "Textura" removed**: delete the `FieldGroup label=
  "Textura"` block (`ModuleInspector.tsx:986-1014`) and the
  `countertopTexture` field from `KitchenModuleOptions`
  (`types/kitchen.ts:408`) entirely — not deprecated, removed, per the
  original ask.
- **Countertop texture now comes from the model**: in `CountertopMesh`
  (`KitchenAssemblyScene.tsx:763-765`), `ctMap` is resolved from
  `COUNTERTOP_MODELS.find(m => m.id === mod.options.countertopModel)
  ?.finishCode`, looked up against the loaded `finishes` list — same
  `getFinishTexture` used by panels, just with a `cubierta`/`ambos`-typed
  finish. If the model has no `finishCode` yet, `ctMap` stays `null` and
  the existing `ctColor` flat-color fallback keeps working exactly as
  today.
- **Pricing** (`kitchenData.ts:2407`, inside `calculateKitchenMaterials`):
  when resolving `boardCost` for a board pool, if the pool's modules'
  `exteriorTexture` resolves to a `finishes` row with `extra_cost_per_m2
  > 0` and `type` `panel`/`ambos`, add it to `boardCost` before
  multiplying by `sheetAreaM2`. A pool mixing multiple different finishes
  on the same board material needs its existing per-material pooling key
  extended to also key by `exteriorTexture` (today it only pools by
  board material) — otherwise two panels of the same board but different
  (differently-priced) finishes would incorrectly merge into one sheet
  cost. This is a real behavior change to the pooling logic, not just an
  additive cost read — flagged here so the implementation plan treats it
  as its own step, not a one-line change.

## 6. Testing

`npx tsc --noEmit`, per this repo's established convention (no frontend
unit-test runner). Backend: verify at implementation time whether
PHPUnit/Pest actually runs in this workflow (per the sibling pricing
spec's own note, this hasn't been confirmed as a running practice in this
project) — if so, add coverage for `FinishController` validation
(unique `code`, `type` enum) and for the seamless-tile image processing
(at minimum: output dimensions, no thrown exception on a small/odd-sized
input). Pricing changes (the board-pool keying change in section 5) are
real-money logic — verify by reading actual computed quotes through the
store for a project with two same-board/different-finish panels, not by
browser click-through alone, matching this project's existing precedent
for cost-logic verification (materials-crud-pricing spec, section 4).

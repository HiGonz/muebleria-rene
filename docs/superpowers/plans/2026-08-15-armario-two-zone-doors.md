# Armario Alto Two-Zone Door System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify `armario_alto_media_puerta` and its 4 siblings
(`armario_alto_2_puertas`, `_cristal`, `_combinado`,
`_combinado_invertido`) onto one live-computed, configurable two-zone
door mechanism — fixing a real frozen-door-height bug on the 4 siblings
and making door count/hinge-side (including "arriba")/hinge-type/glass
configurable on all 5, none of which is possible today.

**Architecture:** One new optional field, `ModuleOptions.doorZoneSplit`,
says how many of a cabinet's total `opt.doors` belong to the top zone
(the rest go to the bottom zone). A small shared derivation (duplicated
across `ModulePreview3D.tsx`/`kitchenData.ts`, mirroring this
codebase's existing intentional boundary between the 3D/UI layer and
the dependency-free cost engine) turns that into a live `DoorDef[]`
per zone, reusing the exact same width-splitting math
`getEffectiveDoors`/`resolveDoors`/`AereoHuecoInferiorMesh` already use.
A new shared mesh, `TwoZoneDoorCabinetMesh`, replaces
`ArmarioAltoMediaPuertaMesh` and renders all 5 types.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + react-three-fiber
+ Zustand, in `frontend/`. No frontend unit-test runner exists — verify
with `npx tsc --noEmit` plus reasoning, per this repo's established
convention.

**Spec:** `docs/superpowers/specs/2026-08-15-armario-two-zone-doors-design.md`

## Global Constraints

- All commands run from `frontend/`.
- Exactly these 5 catalog types are in scope: `armario_alto_media_puerta`,
  `armario_alto_2_puertas`, `armario_alto_2_puertas_cristal`,
  `armario_alto_combinado`, `armario_alto_combinado_invertido`. No other
  module type (including the similarly-shaped `aereo_hueco_inferior`,
  explicitly out of scope) is touched.
- `doorZoneSplit` is optional and additive — old saved projects of these
  5 types have it `undefined`; every read site falls back to `?? 1`,
  which reproduces each type's current default shape exactly (see spec
  §3). No migration, no backfill.
- The top/bottom zone split stays a live-computed 50/50 of
  `dimensions.height` for all 5 types (matching
  `armario_alto_media_puerta`'s existing, already-correct approach) —
  this is a deliberate simplification of the 4 siblings' old
  asymmetric frozen split (44.7cm/45.3cm out of a 90cm default, i.e.
  ~49.7%/50.3%), which differs by under 1% of total height and is not
  visually distinguishable; do not try to preserve the old asymmetric
  ratio.
- `doorHingeSides`/`doorHingeType`/`doorGlass`/`doorPullOut` are reused
  as-is (flat, index-aligned arrays) — indices `0..doorZoneSplit-1` are
  the top zone's doors in order, the rest are the bottom zone's. No new
  parallel per-zone field sets.

---

## File Structure

- `frontend/types/kitchen.ts` — `ModuleOptions` gains `doorZoneSplit?: number`.
- `frontend/components/3d/ModulePreview3D.tsx` — new
  `TWO_ZONE_CABINET_TYPES` set, `TWO_ZONE_SPLIT_PCT` constant (replaces
  `ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT`), `deriveZoneDoors`/
  `getTwoZoneDoors` helpers, `getEffectiveDoors` gains an early
  zone-aware branch, `ArmarioAltoMediaPuertaMesh` replaced by
  `TwoZoneDoorCabinetMesh`, `CabinetMesh`'s dispatch updated for all 5
  types.
- `frontend/services/kitchenData.ts` — mirrored `TWO_ZONE_CABINET_TYPES`/
  `TWO_ZONE_SPLIT_PCT`/`deriveZoneDoors`/`getTwoZoneDoors` (this file's
  own copies, per the established cross-file boundary), `resolveDoors`
  gains the same early branch, the 5 catalog entries updated, the
  `armario_alto_media_puerta` cost-calc branch's door-costing lines
  removed (structural box-piece lines unchanged).
- `frontend/components/kitchen/ModuleInspector.tsx` — new
  "Puertas arriba / abajo" control in the Frentes & Herrajes tab,
  visible only for these 5 types.

---

### Task 1: Data model — `doorZoneSplit` field

**Files:**
- Modify: `frontend/types/kitchen.ts:376-389` (`ModuleOptions`, near
  `doorPullOut`)

**Interfaces:**
- Produces: `ModuleOptions.doorZoneSplit?: number`.

- [ ] **Step 1: Add the field**

Find:

```ts
  doorPullOut?: boolean[];
```

Replace with:

```ts
  doorPullOut?: boolean[];
  // Two-zone cabinets only (armario_alto_media_puerta and its 4
  // doorDefs-based siblings) — how many of this module's `doors` total
  // belong to the top zone; the remainder belongs to the bottom zone.
  // Undefined means "use this type's catalog default" (1, for all 5
  // types today) — see getTwoZoneDoors in ModulePreview3D.tsx/
  // kitchenData.ts, both of which fall back to `?? 1`.
  doorZoneSplit?: number;
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASSES cleanly — purely additive optional field, nothing reads
it yet.

- [ ] **Step 3: Commit**

```bash
git add types/kitchen.ts
git commit -m "$(cat <<'EOF'
Add doorZoneSplit field to the kitchen module data model

Purely additive optional field — nothing reads it yet. Later tasks wire
it into the two-zone cabinet door derivation.
EOF
)"
```

---

### Task 2: Zone-aware door derivation — 3D layer

**Files:**
- Modify: `frontend/components/3d/ModulePreview3D.tsx:99-135`
  (`getEffectiveDoors`), `:1236-1246` (the
  `ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT` constant and its comment block)

**Interfaces:**
- Consumes: `ModuleOptions.doorZoneSplit` (Task 1).
- Produces: `TWO_ZONE_CABINET_TYPES: Set<KitchenModuleType>`,
  `TWO_ZONE_SPLIT_PCT: number`, `getTwoZoneDoors(mod: KitchenModule):
  DoorDef[]` — Task 3's mesh and Task 4's cost-calc mirror both consume
  these (the mesh imports these directly since they're in the same
  file; the cost-calc file gets its own copy in Task 4).

- [ ] **Step 1: Replace the old constant with the shared two-zone helpers**

Find:

```tsx
// ─── Armario alto media puerta — one door covers only the top half; the
// bottom half is fully open (no door, no shelf). Same idea as
// AereoHuecoInferiorMesh just above (door zone height derived live from the
// module's own height, recomputed on every render), but a single door and a
// single divider instead of two doors and a cubby split — see the design
// note on this type's catalog entry (kitchenData.ts) for why it moved off
// the generic useDetailedLayout/doorDefs mechanism, which froze the door at
// whatever height the cabinet had when it was first placed.
// ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT mirrors kitchenData.ts's materials
// calculator.
const ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT = 0.5;
```

Replace with:

```tsx
// ─── Two-zone door cabinets — armario_alto_media_puerta and its 4
// doorDefs-based siblings (armario_alto_2_puertas/_cristal/_combinado/
// _combinado_invertido) all share one shape: a fixed divider splitting
// the cabinet into a top zone and a bottom zone, each independently 0
// (open/hueco), 1, or 2 doors wide. Door zone heights are derived live
// from the module's own current height on every render — never frozen
// — which is what fixes the old bug where the 4 siblings' doors
// (previously a static useDetailedLayout/doorDefs pair with fixed
// fromBottomCm/heightCm computed once for the 90cm default height)
// didn't rescale when the cabinet was resized. TWO_ZONE_SPLIT_PCT
// mirrors kitchenData.ts's materials calculator — both derive the same
// live zone heights so the 3D view and the cost breakdown never
// disagree.
const TWO_ZONE_SPLIT_PCT = 0.5;
const TWO_ZONE_CABINET_TYPES = new Set<KitchenModuleType>([
  "armario_alto_media_puerta",
  "armario_alto_2_puertas",
  "armario_alto_2_puertas_cristal",
  "armario_alto_combinado",
  "armario_alto_combinado_invertido",
]);

// One zone's worth of doors — the same width-splitting math
// getEffectiveDoors' single-zone fallback already does, just confined
// to a [fromBottomCm, fromBottomCm + heightCm] band instead of the
// module's full usable height. `startIndex` offsets into the module's
// flat doorHingeSides/doorHingeType/doorGlass/doorPullOut/doorAccessories
// arrays so a zone's doors read the correct slice of those
// already-existing, already-index-aligned arrays — the bottom zone's
// doors continue the same flat index sequence right after the top
// zone's, matching doorZoneSplit's own definition.
function deriveZoneDoors(mod: KitchenModule, count: number, startIndex: number, fromBottomCm: number, heightCm: number): DoorDef[] {
  if (count <= 0) return [];
  const doorW = 100 / count;
  return Array.from({ length: count }, (_, i) => {
    const globalIndex = startIndex + i;
    const hingeSide = mod.options.doorHingeSides?.[globalIndex];
    return {
      id: `two-zone-d${globalIndex}`,
      label: `Puerta ${globalIndex + 1}`,
      widthPct: doorW,
      offsetPct: i * doorW,
      fromBottomCm,
      heightCm,
      hingeLeft: hingeSide ? hingeSide === "izquierda" : i % 2 === 0,
      hingeTop: hingeSide === "arriba",
      doorStyle: mod.options.doorStyle,
      pullOutAccessory: mod.options.doorAccessories?.[globalIndex] ?? null,
      pullOut: mod.options.doorPullOut?.[globalIndex] ?? false,
      wideAngle: mod.options.doorHingeType?.[globalIndex] === "chapulina",
      glass: mod.options.doorGlass?.[globalIndex] ?? false,
    };
  });
}

// Full door list for a two-zone cabinet — top zone's doors first, then
// the bottom zone's, both derived live from the module's current
// height. doorZoneSplit says how many of the total `doors` are in the
// top zone; clamped so a doors count reduced below the stored/default
// split never produces a negative bottom-zone count.
export function getTwoZoneDoors(mod: KitchenModule): DoorDef[] {
  const H = mod.dimensions.height;
  const topZoneH = H * TWO_ZONE_SPLIT_PCT;
  const bottomZoneH = H - topZoneH;
  const totalDoors = mod.options.doors || 0;
  const topCount = Math.min(totalDoors, Math.max(0, mod.options.doorZoneSplit ?? 1));
  const bottomCount = totalDoors - topCount;
  return [
    ...deriveZoneDoors(mod, topCount, 0, bottomZoneH, topZoneH),
    ...deriveZoneDoors(mod, bottomCount, topCount, 0, bottomZoneH),
  ];
}
```

- [ ] **Step 2: Route `getEffectiveDoors` through the new helper for these 5 types**

Find:

```tsx
export function getEffectiveDoors(mod: KitchenModule): DoorDef[] {
  if (mod.options.useDetailedLayout && mod.options.doorDefs?.length) {
    return mod.options.doorDefs;
  }
```

Replace with:

```tsx
export function getEffectiveDoors(mod: KitchenModule): DoorDef[] {
  if (TWO_ZONE_CABINET_TYPES.has(mod.type)) {
    return getTwoZoneDoors(mod);
  }
  if (mod.options.useDetailedLayout && mod.options.doorDefs?.length) {
    return mod.options.doorDefs;
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: FAILS — `ArmarioAltoMediaPuertaMesh` (not yet updated, Task 3)
still references the now-removed `ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT`
constant. Confirm the error is specifically about that missing name and
nothing else; Task 3 resolves it.

- [ ] **Step 4: Commit**

```bash
git add components/3d/ModulePreview3D.tsx
git commit -m "$(cat <<'EOF'
Add live zone-aware door derivation for two-zone cabinets (3D layer)

getTwoZoneDoors replaces the frozen useDetailedLayout/doorDefs path for
armario_alto_media_puerta and its 4 siblings with a live-computed
top/bottom split reusing the same width-splitting math the generic
single-zone system already has. getEffectiveDoors now dispatches to it
before ever reaching the frozen-doorDefs check, so old saved projects
of these 5 types are corrected on load, not just new placements.

Not yet fully wired — ArmarioAltoMediaPuertaMesh still references the
old constant this removed; next commit replaces it.
EOF
)"
```

---

### Task 3: `TwoZoneDoorCabinetMesh` — replaces `ArmarioAltoMediaPuertaMesh`

**Files:**
- Modify: `frontend/components/3d/ModulePreview3D.tsx:1247-1283` (the
  `ArmarioAltoMediaPuertaMesh` function body), `:2008-2010` (`CabinetMesh`'s
  dispatch)

**Interfaces:**
- Consumes: `getTwoZoneDoors`, `TWO_ZONE_SPLIT_PCT`,
  `TWO_ZONE_CABINET_TYPES` (Task 2).
- Produces: `TwoZoneDoorCabinetMesh({ module, wireframe, onSelect })` —
  rendered for all 5 two-zone types.

- [ ] **Step 1: Replace `ArmarioAltoMediaPuertaMesh` with the generalized mesh**

Find:

```tsx
function ArmarioAltoMediaPuertaMesh({ module, wireframe = false, onSelect }: {
  module: KitchenModule; wireframe?: boolean; onSelect?: () => void;
}) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const color = module.options.color || "#d4c5b0";
  const exteriorColor = module.options.exteriorColor || color;
  const exteriorMap = getWoodTexture(module.options.exteriorTexture);
  const exteriorRoughness = getWoodRoughness(module.options.exteriorTexture);
  const leftColor = module.options.leftSidePanel === "ninguno" || module.options.leftSidePanel === "lambrin" ? null : module.options.leftSidePanel === "exterior" ? exteriorColor : color;
  const rightColor = module.options.rightSidePanel === "ninguno" || module.options.rightSidePanel === "lambrin" ? null : module.options.rightSidePanel === "exterior" ? exteriorColor : color;
  const leftMap = module.options.leftSidePanel === "exterior" ? exteriorMap : null;
  const rightMap = module.options.rightSidePanel === "exterior" ? exteriorMap : null;

  const doorZoneH = H * ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT;
  const openZoneH = H - doorZoneH;
  const dividerColor = shiftColor(color, -0.04);

  const doorDefs: DoorDef[] = [
    { id: "media-puerta-d0", label: "Puerta superior", widthPct: 100, offsetPct: 0, fromBottomCm: openZoneH * 100, heightCm: doorZoneH * 100, hingeLeft: true, doorStyle: module.options.doorStyle },
  ];

  return (
    <group>
      <Carcass W={W} H={H} D={D} color={color} leftColor={leftColor} rightColor={rightColor} leftMap={leftMap} rightMap={rightMap} wireframe={wireframe} />
      {/* Divider between the open zone (bottom) and the door-covered zone (top) */}
      <Box pos={[0, openZoneH, 0]} size={[W - T * 2, T, D]} color={dividerColor} wireframe={wireframe} />
      {module.options.leftSidePanel === "lambrin" && (
        <LambrinPanel pos={[-W / 2 + T / 2, H / 2, 0]} faceW={D} faceH={H} horizontal={false} outward={-1} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel === "lambrin" && (
        <LambrinPanel pos={[W / 2 - T / 2, H / 2, 0]} faceW={D} faceH={H} horizontal={false} outward={1} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.leftSidePanel !== "exterior" && (
        <SideFiller side="left" W={W} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel !== "exterior" && (
        <SideFiller side="right" W={W} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {doorDefs.map((d) => (
        <DoorPanel
          key={d.id} door={d} W={W} D={D} toeKick={0} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness}
          hardware={module.options.hardwareFinish} wireframe={wireframe} onSelect={onSelect}
        />
      ))}
    </group>
  );
}
```

Replace with:

```tsx
function TwoZoneDoorCabinetMesh({ module, wireframe = false, onSelect }: {
  module: KitchenModule; wireframe?: boolean; onSelect?: () => void;
}) {
  const W = module.dimensions.width / 100;
  const H = module.dimensions.height / 100;
  const D = module.dimensions.depth / 100;
  const color = module.options.color || "#d4c5b0";
  const exteriorColor = module.options.exteriorColor || color;
  const exteriorMap = getWoodTexture(module.options.exteriorTexture);
  const exteriorRoughness = getWoodRoughness(module.options.exteriorTexture);
  const leftColor = module.options.leftSidePanel === "ninguno" || module.options.leftSidePanel === "lambrin" ? null : module.options.leftSidePanel === "exterior" ? exteriorColor : color;
  const rightColor = module.options.rightSidePanel === "ninguno" || module.options.rightSidePanel === "lambrin" ? null : module.options.rightSidePanel === "exterior" ? exteriorColor : color;
  const leftMap = module.options.leftSidePanel === "exterior" ? exteriorMap : null;
  const rightMap = module.options.rightSidePanel === "exterior" ? exteriorMap : null;

  // Divider sits at the same live-computed boundary getTwoZoneDoors uses
  // for both zones' door heights, so it never drifts out of sync with
  // whichever zone(s) actually have doors — including the "both zones
  // open" edge case (opt.doors === 0), where it's still the only thing
  // marking the two-zone shape at all.
  const openZoneH = H * (1 - TWO_ZONE_SPLIT_PCT);
  const dividerColor = shiftColor(color, -0.04);
  const doorDefs = getTwoZoneDoors(module);

  return (
    <group>
      <Carcass W={W} H={H} D={D} color={color} leftColor={leftColor} rightColor={rightColor} leftMap={leftMap} rightMap={rightMap} wireframe={wireframe} />
      {/* Divider between the bottom zone and the top zone */}
      <Box pos={[0, openZoneH, 0]} size={[W - T * 2, T, D]} color={dividerColor} wireframe={wireframe} />
      {module.options.leftSidePanel === "lambrin" && (
        <LambrinPanel pos={[-W / 2 + T / 2, H / 2, 0]} faceW={D} faceH={H} horizontal={false} outward={-1} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel === "lambrin" && (
        <LambrinPanel pos={[W / 2 - T / 2, H / 2, 0]} faceW={D} faceH={H} horizontal={false} outward={1} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.leftSidePanel !== "exterior" && (
        <SideFiller side="left" W={W} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {module.options.rightSidePanel !== "exterior" && (
        <SideFiller side="right" W={W} H={H} D={D} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness} wireframe={wireframe} />
      )}
      {doorDefs.map((d) => (
        <DoorPanel
          key={d.id} door={d} W={W} D={D} toeKick={0} color={exteriorColor} map={exteriorMap} roughness={exteriorRoughness}
          hardware={module.options.hardwareFinish} wireframe={wireframe} onSelect={onSelect}
        />
      ))}
    </group>
  );
}
```

- [ ] **Step 2: Update `CabinetMesh`'s dispatch to cover all 5 types**

Find:

```tsx
  // One door covering only the top half, open bottom half below.
  if (module.type === "armario_alto_media_puerta") {
    return <ArmarioAltoMediaPuertaMesh module={module} wireframe={wireframe} onSelect={onSelect} />;
  }
```

Replace with:

```tsx
  // Fixed divider splitting the cabinet into a top and bottom zone,
  // each independently 0 (open/hueco), 1, or 2 doors — see
  // TWO_ZONE_CABINET_TYPES/getTwoZoneDoors above.
  if (TWO_ZONE_CABINET_TYPES.has(module.type)) {
    return <TwoZoneDoorCabinetMesh module={module} wireframe={wireframe} onSelect={onSelect} />;
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Reasoning check — confirm the default case reproduces today's visuals**

No test runner exists for 3D rendering — verify by reading, not running.
For `armario_alto_media_puerta` with default options (`doors: 1,
doorZoneSplit` undefined → `1`): `getTwoZoneDoors` gives `topCount =
min(1, max(0, 1)) = 1`, `bottomCount = 0` — one door spanning the full
top zone width (`doorW = 100/1 = 100`), zero doors in the bottom zone.
Confirm this exactly reproduces the old hardcoded single `DoorDef` (same
`widthPct: 100`, same live-computed `fromBottomCm`/`heightCm`). For
`armario_alto_2_puertas` with default options (`doors: 2,
doorZoneSplit` undefined → `1`): `topCount = 1`, `bottomCount = 1` — one
door per zone, matching the old two-door layout, now rescaling live
with height instead of staying frozen at the 90cm-derived values.

- [ ] **Step 5: Commit**

```bash
git add components/3d/ModulePreview3D.tsx
git commit -m "$(cat <<'EOF'
Replace ArmarioAltoMediaPuertaMesh with the shared TwoZoneDoorCabinetMesh

Generalizes the existing single-door, always-open-bottom mesh into one
that renders whatever getTwoZoneDoors derives for either zone — now
used by all 5 two-zone catalog types instead of just
armario_alto_media_puerta, via CabinetMesh's dispatch.
EOF
)"
```

---

### Task 4: Zone-aware door derivation — cost-calc layer + catalog entries

**Files:**
- Modify: `frontend/services/kitchenData.ts:70-95` (`resolveDoors`),
  near `:333` (add the mirrored constants/helpers, alongside
  `HARDWARE_COSTS`), `:698-782` (5 catalog entries),
  `:1840-1850` (`armario_alto_media_puerta` cost branch), `:1932`
  (door-costing exclusion list)

**Interfaces:**
- Consumes: `ModuleOptions.doorZoneSplit` (Task 1). This file does not
  import from `ModulePreview3D.tsx` (established no-cross-dependency
  boundary) — it gets its own copy of the helpers Task 2 added there.
- Produces: this file's own `TWO_ZONE_CABINET_TYPES`/
  `TWO_ZONE_SPLIT_PCT`/`deriveZoneDoors`/`getTwoZoneDoors`, used by
  `resolveDoors` and by `calculateKitchenMaterials`'s per-module loop.

- [ ] **Step 1: Add the mirrored constants and helpers**

Find:

```ts
// Cost per unit for hardware
export const HARDWARE_COSTS = {
```

Replace with:

```ts
// ─── Two-zone door cabinets — mirrors ModulePreview3D.tsx's own copy of
// this logic (see that file for the full design note); duplicated here
// rather than imported since this file has no dependency on the 3D/UI
// layer, matching the existing resolveDoors/getEffectiveDoors boundary.
const TWO_ZONE_SPLIT_PCT = 0.5;
const TWO_ZONE_CABINET_TYPES = new Set<KitchenModuleType>([
  "armario_alto_media_puerta",
  "armario_alto_2_puertas",
  "armario_alto_2_puertas_cristal",
  "armario_alto_combinado",
  "armario_alto_combinado_invertido",
]);

function deriveZoneDoors(mod: KitchenModule, count: number, startIndex: number, fromBottomCm: number, heightCm: number): DoorDef[] {
  if (count <= 0) return [];
  const doorW = 100 / count;
  return Array.from({ length: count }, (_, i) => {
    const globalIndex = startIndex + i;
    const hingeSide = mod.options.doorHingeSides?.[globalIndex];
    return {
      id: `two-zone-d${globalIndex}`, label: `Puerta ${globalIndex + 1}`,
      widthPct: doorW, offsetPct: i * doorW,
      fromBottomCm, heightCm,
      hingeLeft: hingeSide ? hingeSide === "izquierda" : i % 2 === 0,
      hingeTop: hingeSide === "arriba",
      doorStyle: mod.options.doorStyle,
      pullOutAccessory: mod.options.doorAccessories?.[globalIndex] ?? null,
      pullOut: mod.options.doorPullOut?.[globalIndex] ?? false,
    };
  });
}

function getTwoZoneDoors(mod: KitchenModule): DoorDef[] {
  const H = mod.dimensions.height;
  const topZoneH = H * TWO_ZONE_SPLIT_PCT;
  const bottomZoneH = H - topZoneH;
  const totalDoors = mod.options.doors || 0;
  const topCount = Math.min(totalDoors, Math.max(0, mod.options.doorZoneSplit ?? 1));
  const bottomCount = totalDoors - topCount;
  return [
    ...deriveZoneDoors(mod, topCount, 0, bottomZoneH, topZoneH),
    ...deriveZoneDoors(mod, bottomCount, topCount, 0, bottomZoneH),
  ];
}

// Cost per unit for hardware
export const HARDWARE_COSTS = {
```

- [ ] **Step 2: Route `resolveDoors` through the new helper for these 5 types**

Find:

```ts
function resolveDoors(mod: KitchenModule): DoorDef[] {
  const { options: o, dimensions: d } = mod;
  if (o.useDetailedLayout && o.doorDefs?.length) return o.doorDefs;
```

Replace with:

```ts
function resolveDoors(mod: KitchenModule): DoorDef[] {
  const { options: o, dimensions: d } = mod;
  if (TWO_ZONE_CABINET_TYPES.has(mod.type)) return getTwoZoneDoors(mod);
  if (o.useDetailedLayout && o.doorDefs?.length) return o.doorDefs;
```

- [ ] **Step 3: Update the 5 catalog entries**

Find:

```ts
  // Every variant below is the exact same doorDefs shape — only which
  // door(s) get glass: true (or are omitted, for media puerta) changes.
  {
    type: "armario_alto_2_puertas",
    category: "upper",
    label: "Armario alto doble puerta",
    description: "Armario aéreo alto de 90cm con repisa al centro y una puerta independiente arriba y abajo",
    icon: "🗄️",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: {
      drawers: 0, doors: 2, shelves: 1, mountHeight: 144, useDetailedLayout: true,
      doorDefs: [
        { id: "puerta-inf", label: "Puerta inferior", widthPct: 100, offsetPct: 0, fromBottomCm: 0, heightCm: 44.7, hingeLeft: true, doorStyle: "Lisa" },
        { id: "puerta-sup", label: "Puerta superior", widthPct: 100, offsetPct: 0, fromBottomCm: 45.3, heightCm: 44.7, hingeLeft: true, doorStyle: "Lisa" },
      ],
    },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "armario_alto_2_puertas_cristal",
    category: "upper",
    label: "Armario alto doble puerta de cristal",
    description: "Mismo armario alto de dos puertas — ambas de cristal",
    icon: "🪟",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: {
      drawers: 0, doors: 2, shelves: 1, mountHeight: 144, useDetailedLayout: true,
      doorDefs: [
        { id: "puerta-inf", label: "Puerta inferior", widthPct: 100, offsetPct: 0, fromBottomCm: 0, heightCm: 44.7, hingeLeft: true, doorStyle: "Lisa", glass: true },
        { id: "puerta-sup", label: "Puerta superior", widthPct: 100, offsetPct: 0, fromBottomCm: 45.3, heightCm: 44.7, hingeLeft: true, doorStyle: "Lisa", glass: true },
      ],
    },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "armario_alto_combinado",
    category: "upper",
    label: "Armario alto combinado",
    description: "Mismo armario alto de dos puertas — puerta superior de cristal, inferior normal",
    icon: "🪟",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: {
      drawers: 0, doors: 2, shelves: 1, mountHeight: 144, useDetailedLayout: true,
      doorDefs: [
        { id: "puerta-inf", label: "Puerta inferior", widthPct: 100, offsetPct: 0, fromBottomCm: 0, heightCm: 44.7, hingeLeft: true, doorStyle: "Lisa" },
        { id: "puerta-sup", label: "Puerta superior", widthPct: 100, offsetPct: 0, fromBottomCm: 45.3, heightCm: 44.7, hingeLeft: true, doorStyle: "Lisa", glass: true },
      ],
    },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "armario_alto_combinado_invertido",
    category: "upper",
    label: "Armario alto combinado invertido",
    description: "Mismo armario alto de dos puertas — puerta inferior de cristal, superior normal",
```

Replace with:

```ts
  // All 4 variants below share the same two-zone shape (see
  // TWO_ZONE_CABINET_TYPES/getTwoZoneDoors in this file) — only
  // doorGlass differs. doorGlass is index-aligned across the flat door
  // list: index 0 is the top zone's door, index 1 is the bottom zone's
  // (doorZoneSplit defaults to 1, i.e. one door per zone).
  {
    type: "armario_alto_2_puertas",
    category: "upper",
    label: "Armario alto doble puerta",
    description: "Armario aéreo alto de 90cm con repisa al centro y una puerta independiente arriba y abajo",
    icon: "🗄️",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorZoneSplit: 1, mountHeight: 144 },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "armario_alto_2_puertas_cristal",
    category: "upper",
    label: "Armario alto doble puerta de cristal",
    description: "Mismo armario alto de dos puertas — ambas de cristal",
    icon: "🪟",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorZoneSplit: 1, mountHeight: 144, doorGlass: [true, true] },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "armario_alto_combinado",
    category: "upper",
    label: "Armario alto combinado",
    description: "Mismo armario alto de dos puertas — puerta superior de cristal, inferior normal",
    icon: "🪟",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorZoneSplit: 1, mountHeight: 144, doorGlass: [true, false] },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
  {
    type: "armario_alto_combinado_invertido",
    category: "upper",
    label: "Armario alto combinado invertido",
    description: "Mismo armario alto de dos puertas — puerta inferior de cristal, superior normal",
```

- [ ] **Step 4: Update the remaining `armario_alto_combinado_invertido` entry and `armario_alto_media_puerta`**

Find:

```ts
    icon: "🪟",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: {
      drawers: 0, doors: 2, shelves: 1, mountHeight: 144, useDetailedLayout: true,
      doorDefs: [
        { id: "puerta-inf", label: "Puerta inferior", widthPct: 100, offsetPct: 0, fromBottomCm: 0, heightCm: 44.7, hingeLeft: true, doorStyle: "Lisa", glass: true },
        { id: "puerta-sup", label: "Puerta superior", widthPct: 100, offsetPct: 0, fromBottomCm: 45.3, heightCm: 44.7, hingeLeft: true, doorStyle: "Lisa" },
      ],
    },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
```

Replace with:

```ts
    icon: "🪟",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: { drawers: 0, doors: 2, shelves: 1, doorZoneSplit: 1, mountHeight: 144, doorGlass: [false, true] },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
```

Then find:

```ts
  // Door covers the top half; the bottom half is fully open (no door, no
  // shelf) — see ArmarioAltoMediaPuertaMesh. Used to be modeled as a
  // useDetailedLayout override with a door frozen at fixed
  // fromBottomCm/heightCm values computed once for the 90cm default height —
  // that never recomputed when the cabinet's own height changed, so the door
  // drifted out of sync with the opening it's supposed to cover. Moved to a
  // dedicated mesh (same pattern as aereo_hueco_inferior) that derives the
  // door's zone from dimensions.height on every render instead.
  {
    type: "armario_alto_media_puerta",
    category: "upper",
    label: "Armario alto media puerta",
    description: "Mismo armario alto — solo existe la puerta superior; la mitad inferior queda completamente abierta",
    icon: "🗄️",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: { drawers: 0, doors: 1, shelves: 0, mountHeight: 144 },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
```

Replace with:

```ts
  // Door covers only the top zone by default (doorZoneSplit: 1 with
  // doors: 1); the bottom zone is open/hueco by default (0 doors
  // implied) — see TWO_ZONE_CABINET_TYPES/getTwoZoneDoors. Configurable
  // like every other two-zone type above: doors/doorZoneSplit can be
  // changed to put doors in the bottom zone too, or 2 side-by-side
  // doors in either zone.
  {
    type: "armario_alto_media_puerta",
    category: "upper",
    label: "Armario alto media puerta",
    description: "Mismo armario alto — solo existe la puerta superior; la mitad inferior queda completamente abierta",
    icon: "🗄️",
    defaultDimensions: { height: 90, width: 40, depth: 30 },
    defaultOptions: { drawers: 0, doors: 1, shelves: 0, doorZoneSplit: 1, mountHeight: 144 },
    configurableFields: ["mountHeight", "hasUnderLight", "hardwareFinish", "boardMaterial", "color"],
  },
```

- [ ] **Step 5: Remove `armario_alto_media_puerta` from the door-costing exclusion list**

Find:

```ts
      // aereo_hueco_inferior's two doors and armario_alto_media_puerta's one
      // door are sized to their own door zone above (not the module's full
      // usable height), and already accounted for there — skip the generic
      // full-height door sizing for them.
      const doors = (mod.type === "aereo_hueco_inferior" || mod.type === "armario_alto_media_puerta") ? [] : resolveDoors(mod);
```

Replace with:

```ts
      // aereo_hueco_inferior's two doors are sized to their own door zone
      // above (not the module's full usable height), and already
      // accounted for there — skip the generic full-height door sizing
      // for it. armario_alto_media_puerta and its two-zone siblings now
      // flow through resolveDoors normally (see TWO_ZONE_CABINET_TYPES),
      // which already returns correctly zone-sized doors for them.
      const doors = mod.type === "aereo_hueco_inferior" ? [] : resolveDoors(mod);
```

- [ ] **Step 6: Remove the now-redundant door-costing lines from the `armario_alto_media_puerta` branch, keep the box-piece lines**

Find:

```ts
      } else if (mod.type === "armario_alto_media_puerta") {
        // One door covers only the top half; the bottom half is fully open,
        // no shelf (see ArmarioAltoMediaPuertaMesh) — half of
        // aereo_hueco_inferior's shape (one door, one divider, no second
        // cubby split), same live height-derived door zone.
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases"); // top
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases"); // bottom
        addPiece("Interior", o.boardMaterial, panelWidth, d.height, "Respaldo");
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "División puerta/hueco");
        const mediaPuertaDoorZoneH = d.height * ARMARIO_MEDIA_PUERTA_DOOR_ZONE_PCT;
        addPiece("Exterior", o.exteriorMaterial, panelWidth, mediaPuertaDoorZoneH, "Puertas");
        addHardware("bisagra", "Bisagras", 1, "par", o.drawerSystem === "Soft-close" ? 65 : 35);
      } else if (mod.type === "librero_giratorio_espejo") {
```

Replace with:

```ts
      } else if (mod.type === "armario_alto_media_puerta") {
        // Structural box pieces only — door costing now flows through
        // the generic `doors` loop above (see the exclusion-list
        // comment near resolveDoors' call site), since resolveDoors
        // already returns this type's correctly zone-sized doors.
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases"); // top
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "Tapas y bases"); // bottom
        addPiece("Interior", o.boardMaterial, panelWidth, d.height, "Respaldo");
        addPiece("Interior", o.boardMaterial, panelWidth, d.depth, "División puerta/hueco");
      } else if (mod.type === "librero_giratorio_espejo") {
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 8: Verify the 4 siblings' box-piece costing wasn't accidentally left uncosted**

These 4 types were never in the `if/else` chain that
`armario_alto_media_puerta`'s branch belongs to (confirmed: no
`armario_alto_2_puertas` branch exists there) — they must already be
costed by whatever the chain's final generic `else` branch does for a
standard `category === "upper"` cabinet. Read that final `else` branch
now and confirm it produces sensible box-piece line items (top/bottom
caps, back panel) for these 4 types using their `shelves: 1` default —
this plan does not change their box-piece costing, only their door
costing (already covered by Steps 5-6 removing the exclusion + Task 2's
live derivation). If you find the generic branch does NOT sensibly cost
these 4 types' pieces, STOP and report BLOCKED — that would be a
pre-existing issue outside this plan's stated goal of fixing door
freezing, and needs a ruling before proceeding, not a silent fix.

- [ ] **Step 9: Commit**

```bash
git add services/kitchenData.ts
git commit -m "$(cat <<'EOF'
Wire two-zone door derivation into the cost engine + update catalog entries

Mirrors ModulePreview3D.tsx's getTwoZoneDoors (this file has no
dependency on the 3D/UI layer, matching the existing resolveDoors/
getEffectiveDoors boundary). The 4 armario_alto_2_puertas* siblings
drop their frozen useDetailedLayout/doorDefs catalog defaults in favor
of doors + doorZoneSplit + doorGlass, matching today's default shape
exactly. armario_alto_media_puerta's cost branch keeps its structural
box-piece lines but drops its now-redundant manual door costing, since
resolveDoors already returns this type's doors via the generic path.
EOF
)"
```

---

### Task 5: UI — door zone split control

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx:709-742`
  (the "Puertas y cajones" `Section`)

**Interfaces:**
- Consumes: `ModuleOptions.doorZoneSplit` (Task 1); `module.type` (already
  in scope).

**Design note (revised after initial user testing, before this task was
dispatched):** the first draft of this control exposed `doorZoneSplit`
directly as "how many of the total doors are on top," alongside the
existing generic total-doors field — indirect and easy to misread as
"set 2 doors" not realizing it silently means 1-top-1-bottom by
default with no visible way to choose otherwise. Two-zone cabinets
instead get **two independent fields**, "Puertas arriba" and "Puertas
abajo," each directly settable to 0-4 — matching the actual mental
model (each zone has its own door count) rather than a
total-plus-split-point. The generic "Núm. puertas" field is hidden for
these 5 types (superseded, would otherwise show a number that doesn't
map to either visible field). Both new fields write `opt.doors`
(top+bottom) and `opt.doorZoneSplit` (top count) together in one
`updateModule` call — not two sequential `updateOpt` calls, which would
race (the second call's `{...opt, ...}` spread would read the
already-stale `opt` from the closure, silently dropping the first
call's change).

- [ ] **Step 1: Add an `isTwoZoneCabinet` check and the new controls**

Find:

```tsx
        {/* ── Doors & Drawers (Frentes & Herrajes) ─────────────────────── */}
        {activeTab === "frentes" && (isLower || isUpper || isTower) && !isLightCrown && (
          <Section label={isCajonera ? "Cajones" : "Puertas y cajones"}>
            <div className="grid grid-cols-2 gap-3">
              {!isCajonera && !isFixedDrawerHueco && (
                <FieldGroup label="Núm. puertas">
                  <div className="space-y-1.5">
                    <QuickCountButtons value={opt.doors} options={[1, 2]} onChange={(v) => updateOpt("doors", v)} />
                    <NumInput value={opt.doors} onChange={(v) => updateOpt("doors", v)} min={0} max={6} />
                  </div>
                </FieldGroup>
              )}
```

Replace with:

```tsx
        {/* ── Doors & Drawers (Frentes & Herrajes) ─────────────────────── */}
        {activeTab === "frentes" && (isLower || isUpper || isTower) && !isLightCrown && (
          <Section label={isCajonera ? "Cajones" : "Puertas y cajones"}>
            <div className="grid grid-cols-2 gap-3">
              {!isCajonera && !isFixedDrawerHueco && !isTwoZoneCabinet && (
                <FieldGroup label="Núm. puertas">
                  <div className="space-y-1.5">
                    <QuickCountButtons value={opt.doors} options={[1, 2]} onChange={(v) => updateOpt("doors", v)} />
                    <NumInput value={opt.doors} onChange={(v) => updateOpt("doors", v)} min={0} max={6} />
                  </div>
                </FieldGroup>
              )}
              {isTwoZoneCabinet && (() => {
                const twoZoneTop = Math.max(0, Math.min(opt.doors, opt.doorZoneSplit ?? 1));
                const twoZoneBottom = Math.max(0, opt.doors - twoZoneTop);
                return (
                  <>
                    <FieldGroup label="Puertas arriba">
                      <NumInput
                        value={twoZoneTop}
                        onChange={(v) => {
                          const newTop = Math.max(0, v);
                          updateModule(module.id, { options: { ...opt, doors: newTop + twoZoneBottom, doorZoneSplit: newTop } });
                        }}
                        min={0}
                        max={4}
                      />
                    </FieldGroup>
                    <FieldGroup label="Puertas abajo">
                      <NumInput
                        value={twoZoneBottom}
                        onChange={(v) => {
                          const newBottom = Math.max(0, v);
                          updateModule(module.id, { options: { ...opt, doors: twoZoneTop + newBottom, doorZoneSplit: twoZoneTop } });
                        }}
                        min={0}
                        max={4}
                      />
                    </FieldGroup>
                  </>
                );
              })()}
```

- [ ] **Step 2: Define `isTwoZoneCabinet`**

Find (near the other `is*` booleans, right after `isLightCrown`):

```tsx
  const isLightCrown = type === "corona_luz";
```

Replace with:

```tsx
  const isLightCrown = type === "corona_luz";
  // Fixed divider splitting the cabinet into a top and bottom door zone
  // — see TWO_ZONE_CABINET_TYPES in services/kitchenData.ts (this
  // component reads the type list inline since it's only 5 fixed
  // strings, not worth importing a Set for).
  const isTwoZoneCabinet = type === "armario_alto_media_puerta" || type === "armario_alto_2_puertas" || type === "armario_alto_2_puertas_cristal" || type === "armario_alto_combinado" || type === "armario_alto_combinado_invertido";
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Reasoning check**

Confirm the two existing hinge-side/type/glass sections
(`ModuleInspector.tsx`, gated on `!opt.useDetailedLayout && opt.doors >
0`) now render for these 5 types by default — their catalog entries no
longer set `useDetailedLayout` (Task 4 removed it), so `opt.useDetailedLayout`
is `undefined`/falsy for a freshly-placed instance, and `!undefined` is
`true`. For an *old* saved instance that still has `useDetailedLayout:
true` stored from before this change, these sections stay hidden until
the user's `opt.doors`/other edits naturally clear it — note this as a
known, low-impact gap (the door geometry itself is still corrected per
Task 2/3 regardless; only the *hinge-side editing UI* stays hidden for
such an old instance until it's next resaved with fresh options) rather
than something to fix in this task.

- [ ] **Step 5: Commit**

```bash
git add components/kitchen/ModuleInspector.tsx
git commit -m "$(cat <<'EOF'
Add independent "Puertas arriba"/"Puertas abajo" controls for two-zone cabinets

Two separate 0-4 fields, one per zone, matching the actual mental model
instead of exposing doorZoneSplit as an indirect "how many of the total
are on top" number. Both fields write opt.doors and opt.doorZoneSplit
together in one updateModule call to avoid a stale-closure race between
two sequential updateOpt calls. The generic "Núm. puertas" field is
hidden for these 5 types (superseded). The existing hinge-side/type/
glass sections are now reachable for all 5 two-zone types too, since
their catalog defaults no longer force useDetailedLayout — no gating
changes needed there.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1) · 3D-layer live zone derivation
  + mesh (Tasks 2-3) · cost-engine mirror + catalog updates (Task 4) ·
  UI (Task 5). All 5 spec sections have a task. Non-goals (no change to
  `aereo_hueco_inferior`, no new opening mechanism beyond what exists,
  no pistons) are respected — no task touches those.
- **Placeholder scan:** none — every step has complete, literal code.
  Task 4 Step 8 is a verification/read step with an explicit stop
  condition (BLOCKED + report), not a vague "add appropriate handling."
- **Type consistency:** `getTwoZoneDoors(mod: KitchenModule): DoorDef[]`
  has the identical signature and body shape in both files (Task 2's
  3D-layer version, Task 4's cost-engine mirror) — deliberately, per
  the established cross-file duplication pattern this plan documents
  rather than fights. `TWO_ZONE_CABINET_TYPES`'s 5 type strings are
  spelled identically across Task 2 (3D), Task 4 (cost engine catalog
  entries + exclusion list), and Task 5 (UI's inline check).
  `doorZoneSplit` is read with the same `Math.max(0, ... ?? 1)`-shaped
  clamp everywhere it's used.
- **Scope check:** single cohesive plan; Task 1 is a prerequisite for
  everything, Task 2 before Task 3 (mesh consumes the derivation), Task
  4 is independent of Tasks 2-3 (separate file) but logically follows
  them, Task 5 depends on Task 4's catalog changes (for the UI gating
  reasoning) and Task 1 (the field it edits).
- **Ambiguity check:** the spec's "matching today's shape exactly"
  requirement is pinned to precise default values in Task 4's catalog
  entries (`doorZoneSplit: 1` for all 5, `doorGlass` arrays matching
  each variant's old hardcoded glass placement) rather than left for
  the implementer to re-derive from the old frozen `doorDefs`.

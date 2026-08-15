# Kitchen Configurator Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tabify `ModuleInspector` (Medidas / Estructura / Frentes & Herrajes /
Materiales) and replace the mobile full-screen panel overlay with a
Vaul-based bottom sheet that keeps the 3D viewport visible, without changing
any field's underlying logic or the desktop panel's existing
mutually-exclusive behavior.

**Architecture:** `useKitchenStore`'s existing `showSelector`/`editingModuleId`
state remains the single source of truth for which panel mode is active — on
mobile, a new `KitchenBottomSheet` component (built on `vaul`'s `Drawer`)
derives its snap point directly from that same state instead of introducing
parallel UI state, and translates drag/tap gestures back into the same
`openSelector`/`closeSelector`/`setEditingModule` actions the desktop panel
already uses. `ModuleInspector` gets an internal `activeTab` state and
existing field JSX is regrouped under 4 tab-gated conditionals — field
markup itself, and every store action it calls, is unchanged.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Zustand +
`framer-motion` (desktop panel slide, unchanged) + `vaul` 1.1.2 (new — mobile
bottom sheet), in `frontend/`. No frontend unit-test runner exists in this
repo (only Playwright e2e, `frontend/e2e/`) — per established precedent
(`docs/superpowers/plans/2026-08-13-island-edge-toggle.md`), verification is
`npx tsc --noEmit` plus code-level reasoning.

**Spec:** `docs/superpowers/specs/2026-08-15-kitchen-panel-redesign-design.md`

## Global Constraints

- All commands below run from `frontend/` unless stated otherwise.
- No changes to `KitchenAssemblyScene.tsx`, `useKitchenStore.ts`'s field
  logic, or any `ModuleOptions`/`KitchenModule` type — this plan only moves
  existing JSX between tabs and adds new wrapper components.
- Per [[feedback_no_visual_validation]]: verification is `npx tsc --noEmit`
  plus reasoning through the change. Do **not** screenshot or click through
  the UI to confirm — the user reviews visually in their own running dev
  server (`npx next dev -p 3123` in `frontend/`, keep it running throughout).
- Closet builder files (`components/closet/*`, `components/3d/Closet*`,
  `store/useClosetStore.ts`, `services/closetData.ts`, `types/closet.ts`)
  have unrelated uncommitted changes already on this branch — never stage or
  commit them as part of this plan's tasks. Use targeted `git add` (by exact
  file path), never `git add -A`/`git add .`.
- Tab-assignment table (binding for Task 4 — resolves one gap the spec left
  implicit: exactly which tab `hardwareFinish`, mount height, and the
  corona's light-color field land in):

  | Existing section (current line range, pre-edit) | Tab |
  |---|---|
  | "Nombre del mueble" field | Always visible (outside tabs) |
  | Dimensiones (Alto/Ancho/Fondo) | Medidas |
  | Mount height (`opt.mountHeight`, currently 2 separate "Instalación" sections) | Medidas (merged into the Dimensiones grid) |
  | Appliance niche size (Ancho/Alto hueco) | Medidas |
  | isOpening "Apariencia" (door/window color) | Materiales |
  | Tablero interior info box + Tablero exterior (material/texture) | Materiales |
  | "Herrajes" (`hardwareFinish` select, currently inside "Puertas y cajones") | Materiales |
  | Cubierta (countertop model/color/texture) | Materiales |
  | Orientación del esquinero | Estructura |
  | Paneles laterales | Estructura |
  | Isla (forzar modo isla) | Estructura |
  | Panel trasero | Estructura |
  | Iluminación (corona_luz) | Estructura |
  | Base (zócalo) | Estructura |
  | Puertas y cajones (doors/drawers/shelves counts, minus Herrajes) | Frentes & Herrajes |
  | Apertura de puertas (hinge side/type/glass) | Frentes & Herrajes |
  | Puertas: apertura y accesorio interior | Frentes & Herrajes |
  | "Observaciones" field | Always visible (outside tabs) |

---

## File Structure

- `frontend/lib/useIsMobile.ts` — fix breakpoint (1024px → 768px) to match
  the spec and the header's existing `md:` split; still unused as a value
  until Task 6 wires it up.
- `frontend/components/kitchen/KitchenBuilder.tsx` — pin desktop panel
  width, call `useIsMobile()`, swap in `KitchenBottomSheet` on mobile,
  hide `BuilderFab` on mobile.
- `frontend/components/kitchen/ModuleSelector.tsx` — context-aware back
  button copy.
- `frontend/components/kitchen/ModuleInspector.tsx` — tab bar + tab-gated
  sections (Task 4), mobile stepper fields (Task 5).
- `frontend/components/ui/input.tsx` — new `StepperInput` export.
- `frontend/components/kitchen/KitchenBottomSheet.tsx` — new file, the
  mobile bottom sheet.
- `frontend/package.json` / `package-lock.json` — new dependency: `vaul`.

---

### Task 1: Add `vaul` dependency

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`

**Interfaces:**
- Produces: `vaul`'s `Drawer` export (`Drawer.Root`, `.Portal`, `.Overlay`,
  `.Content`, `.Title`, `.Description`, `.Handle`), available to Task 6.

- [ ] **Step 1: Install**

```bash
cd frontend
npm install vaul
```

- [ ] **Step 2: Verify the install and confirm no peer-dependency conflicts**

Run: `npm ls vaul`
Expected: prints `vaul@1.1.2` (or newer) with no `UNMET PEER DEPENDENCY`
warnings — this project is on React 19.2.4/Next 16.2.6, and `vaul`'s
`peerDependencies` already list `react: "^16.8 || ^17.0 || ^18.0 ||
^19.0.0 || ^19.0.0-rc"`, confirmed compatible before this task was written.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly — nothing imports `vaul` yet.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
Add vaul dependency for the kitchen configurator mobile bottom sheet

Confirmed React 19-compatible peer deps before installing. Not wired up
yet — Task 6 builds the component that uses it.
EOF
)"
```

---

### Task 2: Layout constants — mobile breakpoint fix + desktop panel width

**Files:**
- Modify: `frontend/lib/useIsMobile.ts:5-7`
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx:450`, `:461`

**Interfaces:**
- Produces: `useIsMobile()` now returns `true` below 768px (was 1024px) —
  Task 6 is this hook's first real caller.

- [ ] **Step 1: Fix the breakpoint**

In `frontend/lib/useIsMobile.ts`, find:

```ts
// Mirrors Tailwind's `lg` breakpoint (1024px) — below it, KitchenBuilder shows
// one full-screen panel at a time instead of the desktop 3-column layout.
const QUERY = "(max-width: 1023px)";
```

Replace with:

```ts
// Mirrors Tailwind's `md` breakpoint (768px) — the same breakpoint
// KitchenBuilder's header already switches on via `md:`/`hidden md:flex`
// classes. Below it, the kitchen builder shows a bottom sheet instead of
// the desktop side panel (see KitchenBottomSheet.tsx).
const QUERY = "(max-width: 767px)";
```

- [ ] **Step 2: Pin the desktop panel width and wire up `useIsMobile`**

In `frontend/components/kitchen/KitchenBuilder.tsx`, find:

```tsx
  const [showMobileMenu, setShowMobileMenu] = useState(false);
```

Replace with:

```tsx
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const isMobile = useIsMobile();
```

- [ ] **Step 3: Widen the two panel `motion.div` widths from `sm:w-96` to `md:w-[400px]`**

In the same file, find (appears twice, once for the selector, once for the
inspector):

```tsx
                  className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ivory/8 bg-ink sm:w-96"
```

Replace **both** occurrences with:

```tsx
                  className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ivory/8 bg-ink md:w-[400px]"
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly. `isMobile` is declared but not yet read anywhere
— that's fine, TypeScript doesn't flag unused `const`s from a hook call the
same way as unused imports, and Task 6 uses it.

- [ ] **Step 5: Commit**

```bash
git add lib/useIsMobile.ts components/kitchen/KitchenBuilder.tsx
git commit -m "$(cat <<'EOF'
Fix useIsMobile's breakpoint to 768px and pin desktop panel width

useIsMobile was imported in KitchenBuilder.tsx but never called, and its
1024px breakpoint didn't match the header's own 768px md: split. Fixed
to 768px and now actually called (used by Task 6). Desktop panel width
made explicit (400px) instead of relying on sm:w-96's implicit 384px.
EOF
)"
```

---

### Task 3: `ModuleSelector` — context-aware back button copy

**Files:**
- Modify: `frontend/components/kitchen/ModuleSelector.tsx:61-93`

**Interfaces:**
- Consumes: `useKitchenStore().draft.editingModuleId` (already exists).

- [ ] **Step 1: Read `editingModuleId` and compute the landing-screen label**

Find:

```tsx
export function ModuleSelector() {
  const { addModule, closeSelector } = useKitchenStore();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<SelectorGroup | null>(null);
  const { thumbs } = useCatalogThumbnails();

  const searching = search.trim().length > 0;
  const showLanding = !searching && !group;
```

Replace with:

```tsx
export function ModuleSelector() {
  const { addModule, closeSelector, draft } = useKitchenStore();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<SelectorGroup | null>(null);
  const { thumbs } = useCatalogThumbnails();

  const searching = search.trim().length > 0;
  const showLanding = !searching && !group;
  // The selector opens either from the "+ Añadir Módulo" CTA (nothing was
  // being edited — closing it has nowhere meaningful to return to) or from
  // an existing module's inspector losing focus to it (closing returns
  // there) — draft.editingModuleId already reflects which case this is,
  // since setEditingModule/openSelector never clear it when the selector
  // opens (see useKitchenStore.ts).
  const hasModuleToReturnTo = draft.editingModuleId !== null;
```

- [ ] **Step 2: Use it for the category-group back button**

Find:

```tsx
        <div className="flex items-center gap-1.5">
          {group && (
            <button
              onClick={() => setGroup(null)}
              aria-label="Volver a categorías"
              title="Volver a categorías"
              className="-ml-1.5 rounded-lg p-1 text-warmgray hover:bg-ivory/8 hover:text-ivory transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <h2 className="font-display text-base font-semibold text-ivory">
            {group ? group.label : "Agregar módulo"}
          </h2>
        </div>
        <button onClick={closeSelector} className="text-warmgray hover:text-ivory transition-colors text-xl leading-none">&times;</button>
```

Replace with:

```tsx
        <div className="flex items-center gap-1.5">
          {group ? (
            <button
              onClick={() => setGroup(null)}
              aria-label="Volver a categorías"
              title="Volver a categorías"
              className="-ml-1.5 rounded-lg p-1 text-warmgray hover:bg-ivory/8 hover:text-ivory transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
          ) : (
            <button
              onClick={closeSelector}
              aria-label={hasModuleToReturnTo ? "Volver a configuración" : "Volver"}
              title={hasModuleToReturnTo ? "Volver a configuración" : "Volver"}
              className="-ml-1.5 rounded-lg p-1 text-warmgray hover:bg-ivory/8 hover:text-ivory transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <h2 className="font-display text-base font-semibold text-ivory">
            {group ? group.label : "Agregar módulo"}
          </h2>
        </div>
        <button onClick={closeSelector} className="text-warmgray hover:text-ivory transition-colors text-xl leading-none">&times;</button>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Commit**

```bash
git add components/kitchen/ModuleSelector.tsx
git commit -m "$(cat <<'EOF'
Add a context-aware back button to the module selector's landing screen

"Volver a configuración" when there's an existing module to return to,
plain "Volver" for a net-new module — matches the approved panel
redesign spec. The category-grid back button (unaffected) still reads
"Volver a categorías".
EOF
)"
```

---

### Task 4: Tabify `ModuleInspector`

**Files:**
- Modify: `frontend/components/kitchen/ModuleInspector.tsx` (multiple
  ranges — see steps)

**Interfaces:**
- Produces: an internal `activeTab: "medidas" | "estructura" | "frentes" |
  "materiales"` state, reset to `"medidas"` whenever the edited module
  changes. No new props, no new store actions — purely a rendering
  reorganization of fields Task 5/6 build on top of.

- [ ] **Step 1: Add tab state and the tab bar, right after the 3D preview**

Find:

```tsx
  const isConfirmingDelete = confirmDeleteId === module.id;
```

Replace with:

```tsx
  const [activeTab, setActiveTab] = useState<InspectorTab>("medidas");
  useEffect(() => {
    setActiveTab("medidas");
  }, [module?.id]);

  const isConfirmingDelete = confirmDeleteId === module.id;
```

Then find:

```tsx
      {/* ── 3D Preview ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4">
        <ModulePreview3D module={module} />
      </div>

      <div className={`flex-1 overflow-y-auto p-4 space-y-5 ${opt.locked ? "pointer-events-none opacity-50" : ""}`}>
        {/* ── Name ──────────────────────────────────────────────────────── */}
        <FieldGroup label="Nombre del mueble">
          <Input value={module.label} onChange={(e) => updateModule(module.id, { label: e.target.value })} />
        </FieldGroup>
```

Replace with:

```tsx
      {/* ── 3D Preview ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4">
        <ModulePreview3D module={module} />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────
          Field groups below are gated on activeTab, not hidden/removed —
          switching tabs never loses a value, it's a pure display filter. */}
      <div className="shrink-0 overflow-x-auto border-b border-ivory/8 px-2">
        <div className="flex w-max gap-1 py-1.5">
          {INSPECTOR_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id ? "bg-brass text-ink" : "text-warmgray hover:text-ivory"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 space-y-5 ${opt.locked ? "pointer-events-none opacity-50" : ""}`}>
        {/* ── Name — identification, not a config category, always visible ── */}
        <FieldGroup label="Nombre del mueble">
          <Input value={module.label} onChange={(e) => updateModule(module.id, { label: e.target.value })} />
        </FieldGroup>
```

- [ ] **Step 2: Declare the tab list above the component**

Find:

```tsx
const BOARD_OPTIONS = (Object.keys(BOARD_COSTS) as BoardMaterial[]).map((k) => ({ value: k, label: k }));
```

Replace with:

```tsx
const BOARD_OPTIONS = (Object.keys(BOARD_COSTS) as BoardMaterial[]).map((k) => ({ value: k, label: k }));

type InspectorTab = "medidas" | "estructura" | "frentes" | "materiales";
const INSPECTOR_TABS: { id: InspectorTab; label: string }[] = [
  { id: "medidas", label: "Medidas" },
  { id: "estructura", label: "Estructura" },
  { id: "frentes", label: "Frentes & Herrajes" },
  { id: "materiales", label: "Materiales" },
];
```

- [ ] **Step 3: Medidas tab — gate Dimensiones, fold in mount height**

Find:

```tsx
        {/* ── Dimensions ────────────────────────────────────────────────── */}
        <Section label="Dimensiones">
          <div className="grid grid-cols-3 gap-3">
            {showHeightField && (
              <FieldGroup label="Alto">
                <NumInput value={dim.height} onChange={(v) => updateDim("height", v)} min={1} max={500} unit="cm" />
              </FieldGroup>
            )}
            <FieldGroup label="Ancho">
              <NumInput value={dim.width} onChange={(v) => updateDim("width", v)} min={10} max={500} unit="cm" />
            </FieldGroup>
            <FieldGroup label="Fondo">
              <NumInput value={dim.depth} onChange={(v) => updateDim("depth", v)} min={10} max={200} unit="cm" />
            </FieldGroup>
            {isLightCrown && (
              <FieldGroup label="Separación del muro">
                <NumInput value={opt.wallOffset ?? 30} onChange={(v) => updateOpt("wallOffset", v)} min={0} max={60} unit="cm" />
              </FieldGroup>
            )}
          </div>
          {isLightCrown && (
            <p className="mt-2 text-[10px] text-warmgray/70">
              La corona no va pegada al muro como un aéreo — es una visera. Ajusta la separación para que quede encima
              y por delante de los muebles aéreos de abajo.
            </p>
          )}
        </Section>
```

Replace with:

```tsx
        {activeTab === "medidas" && (
        <>
        {/* ── Dimensions ────────────────────────────────────────────────── */}
        <Section label="Dimensiones">
          <div className="grid grid-cols-3 gap-3">
            {showHeightField && (
              <FieldGroup label="Alto">
                <NumInput value={dim.height} onChange={(v) => updateDim("height", v)} min={1} max={500} unit="cm" />
              </FieldGroup>
            )}
            <FieldGroup label="Ancho">
              <NumInput value={dim.width} onChange={(v) => updateDim("width", v)} min={10} max={500} unit="cm" />
            </FieldGroup>
            <FieldGroup label="Fondo">
              <NumInput value={dim.depth} onChange={(v) => updateDim("depth", v)} min={10} max={200} unit="cm" />
            </FieldGroup>
            {isLightCrown && (
              <FieldGroup label="Separación del muro">
                <NumInput value={opt.wallOffset ?? 30} onChange={(v) => updateOpt("wallOffset", v)} min={0} max={60} unit="cm" />
              </FieldGroup>
            )}
            {/* Moved in from the old standalone "Instalación" sections
                (upper cabinets/campanas and decorative windows both used
                mountHeight for this, just with different labels/ranges) —
                dimensions-shaped fields belong with the rest of Medidas. */}
            {(isUpper || type === "campana_extractora" || type === "campana_extractora_compacta") && (
              <FieldGroup label="Altura de montaje">
                <NumInput value={opt.mountHeight} onChange={(v) => updateOpt("mountHeight", v)} min={100} max={220} unit="cm" />
              </FieldGroup>
            )}
            {type === "ventana_decorativa" && (
              <FieldGroup label="Altura del alféizar">
                <NumInput value={opt.mountHeight} onChange={(v) => updateOpt("mountHeight", v)} min={0} max={220} unit="cm" />
              </FieldGroup>
            )}
          </div>
          {isLightCrown && (
            <p className="mt-2 text-[10px] text-warmgray/70">
              La corona no va pegada al muro como un aéreo — es una visera. Ajusta la separación para que quede encima
              y por delante de los muebles aéreos de abajo.
            </p>
          )}
        </Section>
        {/* ── Appliance niche size — also a Medidas concept ────────────── */}
        {isAppliance && (
          <Section label="Espacio para electrodoméstico">
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Ancho hueco">
                <NumInput value={opt.applianceWidth} onChange={(v) => updateOpt("applianceWidth", v)} min={30} max={200} unit="cm" />
              </FieldGroup>
              <FieldGroup label="Alto hueco">
                <NumInput value={opt.applianceHeight} onChange={(v) => updateOpt("applianceHeight", v)} min={30} max={250} unit="cm" />
              </FieldGroup>
            </div>
            {NICHE_ACCESSORY_MATCH[type] && (
              <button
                type="button"
                onClick={() => placeAccessoryInNiche(module.id, NICHE_ACCESSORY_MATCH[type]!)}
                className="mt-3 w-full rounded-xl border border-brass/30 bg-brass/10 px-3 py-2.5 text-sm font-medium text-brass-soft transition-colors hover:bg-brass/15"
              >
                Colocar {getCatalogEntry(NICHE_ACCESSORY_MATCH[type]!)?.label.toLowerCase()} aquí
              </button>
            )}
          </Section>
        )}
        </>
        )}
```

- [ ] **Step 4: Materiales tab — Apariencia (isOpening) + Tablero exterior**

Find:

```tsx
        {/* ── Puerta/ventana decorativa: just a color, no board material ──── */}
        {isOpening && (
          <Section label="Apariencia">
            <FieldGroup label={type === "ventana_decorativa" ? "Color del marco" : "Color de la puerta"}>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={opt.color || "#8b6142"}
                  onChange={(e) => updateOpt("color", e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-ivory/10 bg-transparent p-1"
                />
                <Input value={opt.color || ""} onChange={(e) => updateOpt("color", e.target.value)} placeholder="#8b6142" className="font-mono text-sm" />
              </div>
            </FieldGroup>
          </Section>
        )}

        {/* ── Boards ────────────────────────────────────────────────────── */}
        {!isCountertop && !isAppliance && !isAccessory && !isOpening && (
          <>
            <div className="rounded-xl border border-ivory/8 bg-ivory/3 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-warmgray">Tablero interior</p>
              <p className="mt-0.5 text-xs text-ivory/80">Melamina blanca 15mm · Blanco</p>
              <p className="mt-0.5 text-[10px] text-warmgray/70">Estándar del taller — no configurable por mueble.</p>
            </div>

            <Section label="Tablero exterior (puertas, cajones y remates visibles)">
              <div className="space-y-3">
                <FieldGroup label="Material">
                  <SelectInput value={opt.exteriorMaterial} onChange={(v) => applyExteriorToAll(v, opt.exteriorTexture)} options={BOARD_OPTIONS} />
                </FieldGroup>
                <FieldGroup label="Acabado / textura">
                  <TexturePicker value={opt.exteriorTexture} onChange={(v) => applyExteriorToAll(opt.exteriorMaterial, v)} />
                </FieldGroup>
                <p className="text-[10px] text-warmgray/70">Se aplica a toda la cocina — es el mismo acabado en todos los muebles.</p>
              </div>
            </Section>

            {category === "corner" && (
```

Replace with:

```tsx
        {/* ── Puerta/ventana decorativa: just a color, no board material ──── */}
        {activeTab === "materiales" && isOpening && (
          <Section label="Apariencia">
            <FieldGroup label={type === "ventana_decorativa" ? "Color del marco" : "Color de la puerta"}>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={opt.color || "#8b6142"}
                  onChange={(e) => updateOpt("color", e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-ivory/10 bg-transparent p-1"
                />
                <Input value={opt.color || ""} onChange={(e) => updateOpt("color", e.target.value)} placeholder="#8b6142" className="font-mono text-sm" />
              </div>
            </FieldGroup>
          </Section>
        )}

        {/* ── Boards (Materiales) ──────────────────────────────────────── */}
        {activeTab === "materiales" && !isCountertop && !isAppliance && !isAccessory && !isOpening && (
          <>
            <div className="rounded-xl border border-ivory/8 bg-ivory/3 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-warmgray">Tablero interior</p>
              <p className="mt-0.5 text-xs text-ivory/80">Melamina blanca 15mm · Blanco</p>
              <p className="mt-0.5 text-[10px] text-warmgray/70">Estándar del taller — no configurable por mueble.</p>
            </div>

            <Section label="Tablero exterior (puertas, cajones y remates visibles)">
              <div className="space-y-3">
                <FieldGroup label="Material">
                  <SelectInput value={opt.exteriorMaterial} onChange={(v) => applyExteriorToAll(v, opt.exteriorTexture)} options={BOARD_OPTIONS} />
                </FieldGroup>
                <FieldGroup label="Acabado / textura">
                  <TexturePicker value={opt.exteriorTexture} onChange={(v) => applyExteriorToAll(opt.exteriorMaterial, v)} />
                </FieldGroup>
                <p className="text-[10px] text-warmgray/70">Se aplica a toda la cocina — es el mismo acabado en todos los muebles.</p>
              </div>
            </Section>
          </>
        )}

        {/* ── Structure (Estructura) ───────────────────────────────────── */}
        {activeTab === "estructura" && !isCountertop && !isAppliance && !isAccessory && !isOpening && (
          <>
            {category === "corner" && (
```

- [ ] **Step 5: Close the Estructura fragment at the end of "Iluminación", and gate "Base"**

Find:

```tsx
                  {(opt.lightMode ?? "tira") === "foquitos" && (
                    <p className="text-[10px] text-warmgray/70">Los foquitos se reparten en partes iguales a lo ancho del mueble.</p>
                  )}
                </div>
              </Section>
            )}
          </>
        )}


        {/* ── Doors & Drawers (smart per type) ─────────────────────────── */}
        {(isLower || isUpper || isTower) && !isLightCrown && (
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
              {!isFixedDrawerHueco && (
                <FieldGroup label="Núm. cajones">
                  <NumInput value={opt.drawers} onChange={(v) => updateOpt("drawers", v)} min={0} max={8} />
                </FieldGroup>
              )}
              {!isCajonera && opt.doors > 0 && opt.drawers > 0 && (
                <FieldGroup label="Altura de cajones">
                  <NumInput
                    value={opt.drawerZoneHeight ?? defaultDrawerZoneHeight(module)}
                    onChange={(v) => updateOpt("drawerZoneHeight", v)}
                    min={5}
                    max={Math.max(dim.height - 40, 5)}
                    unit="cm"
                  />
                </FieldGroup>
              )}
              {!isCajonera && !isFixedDrawerHueco && (
                <FieldGroup label="Repisas">
                  <NumInput value={opt.shelves} onChange={(v) => updateOpt("shelves", v)} min={0} max={10} />
                </FieldGroup>
              )}
              <FieldGroup label="Herrajes">
                <SelectInput
                  value={opt.hardwareFinish}
                  onChange={(v) => applyHardwareToAll(v)}
                  options={[
                    { value: "Acero inoxidable", label: "Acero inoxidable" },
                    { value: "Negro mate", label: "Negro mate" },
                    { value: "Dorado", label: "Dorado" },
                    { value: "Bronce", label: "Bronce" },
                    { value: "Cromo", label: "Cromo" },
                    { value: "Sin jaladores", label: "Sin jaladores" },
                  ]}
                />
              </FieldGroup>
            </div>
            <p className="mt-2 text-[10px] text-warmgray/70">
              {opt.doors > 0 && opt.drawers > 0
                ? "Los cajones se reparten en partes iguales dentro de la altura fijada arriba, justo encima de la(s) puerta(s). Los herrajes se aplican a toda la cocina."
                : "Los cajones se distribuyen automáticamente en el área disponible. Los herrajes se aplican a toda la cocina."}
            </p>
          </Section>
        )}
```

Replace with:

```tsx
                  {(opt.lightMode ?? "tira") === "foquitos" && (
                    <p className="text-[10px] text-warmgray/70">Los foquitos se reparten en partes iguales a lo ancho del mueble.</p>
                  )}
                </div>
              </Section>
            )}

            {/* ── Base (zócalo) — also Estructura ──────────────────────── */}
            {isLower && (
              <Section label="Base">
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Zoclo">
                    <SelectInput
                      value={opt.hasToeKick ? "si" : "no"}
                      onChange={(v) => updateOpt("hasToeKick", v === "si")}
                      options={[{ value: "si", label: "Con zoclo" }, { value: "no", label: "Sin zoclo" }]}
                    />
                  </FieldGroup>
                  {opt.hasToeKick && (
                    <FieldGroup label="Alto zoclo">
                      <NumInput value={opt.toeKickHeight} onChange={(v) => updateOpt("toeKickHeight", v)} min={4} max={20} unit="cm" />
                    </FieldGroup>
                  )}
                  {opt.hasToeKick && (
                    <FieldGroup label="Material del zoclo">
                      <SelectInput value={opt.zocaloMaterial ?? "Exterior"} onChange={(v) => applyZocaloMaterialToAll(v)} options={ZOCALO_MATERIAL_OPTIONS} />
                    </FieldGroup>
                  )}
                </div>
                {opt.hasToeKick && (
                  <p className="mt-2 text-[10px] text-warmgray/70">
                    El material del zoclo se aplica a toda la cocina.
                    {opt.zocaloMaterial === "Aluminio" && " Se compra en tiras de 3m — la cotización redondea al número de piezas necesarias."}
                  </p>
                )}
              </Section>
            )}
          </>
        )}

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
              {!isFixedDrawerHueco && (
                <FieldGroup label="Núm. cajones">
                  <NumInput value={opt.drawers} onChange={(v) => updateOpt("drawers", v)} min={0} max={8} />
                </FieldGroup>
              )}
              {!isCajonera && opt.doors > 0 && opt.drawers > 0 && (
                <FieldGroup label="Altura de cajones">
                  <NumInput
                    value={opt.drawerZoneHeight ?? defaultDrawerZoneHeight(module)}
                    onChange={(v) => updateOpt("drawerZoneHeight", v)}
                    min={5}
                    max={Math.max(dim.height - 40, 5)}
                    unit="cm"
                  />
                </FieldGroup>
              )}
              {!isCajonera && !isFixedDrawerHueco && (
                <FieldGroup label="Repisas">
                  <NumInput value={opt.shelves} onChange={(v) => updateOpt("shelves", v)} min={0} max={10} />
                </FieldGroup>
              )}
            </div>
            <p className="mt-2 text-[10px] text-warmgray/70">
              {opt.doors > 0 && opt.drawers > 0
                ? "Los cajones se reparten en partes iguales dentro de la altura fijada arriba, justo encima de la(s) puerta(s)."
                : "Los cajones se distribuyen automáticamente en el área disponible."}
            </p>
          </Section>
        )}

        {/* ── Herrajes (jaladeras) — Materiales, per the approved spec ──── */}
        {activeTab === "materiales" && (isLower || isUpper || isTower) && !isLightCrown && (
          <Section label="Herrajes">
            <FieldGroup label="Acabado de jaladeras">
              <SelectInput
                value={opt.hardwareFinish}
                onChange={(v) => applyHardwareToAll(v)}
                options={[
                  { value: "Acero inoxidable", label: "Acero inoxidable" },
                  { value: "Negro mate", label: "Negro mate" },
                  { value: "Dorado", label: "Dorado" },
                  { value: "Bronce", label: "Bronce" },
                  { value: "Cromo", label: "Cromo" },
                  { value: "Sin jaladores", label: "Sin jaladores" },
                ]}
              />
            </FieldGroup>
            <p className="mt-2 text-[10px] text-warmgray/70">Se aplica a toda la cocina.</p>
          </Section>
        )}
```

- [ ] **Step 6: Gate the two remaining Frentes & Herrajes sections**

Find:

```tsx
        {/* ── Door hinge sides (independent per door) — lower/corner cabinets
             get izquierda/derecha; upper cabinets also get arriba (abatible). ── */}
        {(category === "lower" || category === "corner" || category === "upper") && !opt.useDetailedLayout && opt.doors > 0 && (
          <Section label="Apertura de puertas">
```

Replace with:

```tsx
        {/* ── Door hinge sides (independent per door) — lower/corner cabinets
             get izquierda/derecha; upper cabinets also get arriba (abatible). ── */}
        {activeTab === "frentes" && (category === "lower" || category === "corner" || category === "upper") && !opt.useDetailedLayout && opt.doors > 0 && (
          <Section label="Apertura de puertas">
```

Then find:

```tsx
        {(isLower || isUpper || isTower) && !opt.useDetailedLayout && opt.doors > 0 && (
          <Section label="Puertas: apertura y accesorio interior">
```

Replace with:

```tsx
        {activeTab === "frentes" && (isLower || isUpper || isTower) && !opt.useDetailedLayout && opt.doors > 0 && (
          <Section label="Puertas: apertura y accesorio interior">
```

- [ ] **Step 7: Remove the now-duplicated old "Instalación"/"Base"/Appliance/Countertop sections and gate Countertop into Materiales**

Find (the two old "Instalación" sections, now redundant with Step 3's
merged fields, plus the old ungated "Base" and appliance sections, now
redundant with Steps 3/5):

```tsx
        {/* ── Lower cabinet extras ──────────────────────────────────────── */}
        {isLower && (
          <Section label="Base">
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Zoclo">
                <SelectInput
                  value={opt.hasToeKick ? "si" : "no"}
                  onChange={(v) => updateOpt("hasToeKick", v === "si")}
                  options={[{ value: "si", label: "Con zoclo" }, { value: "no", label: "Sin zoclo" }]}
                />
              </FieldGroup>
              {opt.hasToeKick && (
                <FieldGroup label="Alto zoclo">
                  <NumInput value={opt.toeKickHeight} onChange={(v) => updateOpt("toeKickHeight", v)} min={4} max={20} unit="cm" />
                </FieldGroup>
              )}
              {opt.hasToeKick && (
                <FieldGroup label="Material del zoclo">
                  <SelectInput value={opt.zocaloMaterial ?? "Exterior"} onChange={(v) => applyZocaloMaterialToAll(v)} options={ZOCALO_MATERIAL_OPTIONS} />
                </FieldGroup>
              )}
            </div>
            {opt.hasToeKick && (
              <p className="mt-2 text-[10px] text-warmgray/70">
                El material del zoclo se aplica a toda la cocina.
                {opt.zocaloMaterial === "Aluminio" && " Se compra en tiras de 3m — la cotización redondea al número de piezas necesarias."}
              </p>
            )}
          </Section>
        )}

        {/* ── Upper cabinet extras ──────────────────────────────────────── */}
        {/* Campana extractora/compacta are category "accessory", not
            "upper", but they're wall-mounted the same way (mountHeight
            already drives their own mesh's vertical offset — see
            KitchenAssemblyScene.tsx) and just never got a field to edit it
            from. */}
        {(isUpper || type === "campana_extractora" || type === "campana_extractora_compacta") && (
          <Section label="Instalación">
            <FieldGroup label="Altura de montaje">
              <NumInput value={opt.mountHeight} onChange={(v) => updateOpt("mountHeight", v)} min={100} max={220} unit="cm" />
            </FieldGroup>
          </Section>
        )}

        {/* ── Ventana: sill height — a door sits on the floor, but a window
             needs its own mount height like an aéreo. ────────────────────── */}
        {type === "ventana_decorativa" && (
          <Section label="Instalación">
            <FieldGroup label="Altura del alféizar">
              <NumInput value={opt.mountHeight} onChange={(v) => updateOpt("mountHeight", v)} min={0} max={220} unit="cm" />
            </FieldGroup>
          </Section>
        )}

        {/* ── Appliance ─────────────────────────────────────────────────── */}
        {isAppliance && (
          <Section label="Espacio para electrodoméstico">
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Ancho hueco">
                <NumInput value={opt.applianceWidth} onChange={(v) => updateOpt("applianceWidth", v)} min={30} max={200} unit="cm" />
              </FieldGroup>
              <FieldGroup label="Alto hueco">
                <NumInput value={opt.applianceHeight} onChange={(v) => updateOpt("applianceHeight", v)} min={30} max={250} unit="cm" />
              </FieldGroup>
            </div>
            {NICHE_ACCESSORY_MATCH[type] && (
              <button
                type="button"
                onClick={() => placeAccessoryInNiche(module.id, NICHE_ACCESSORY_MATCH[type]!)}
                className="mt-3 w-full rounded-xl border border-brass/30 bg-brass/10 px-3 py-2.5 text-sm font-medium text-brass-soft transition-colors hover:bg-brass/15"
              >
                Colocar {getCatalogEntry(NICHE_ACCESSORY_MATCH[type]!)?.label.toLowerCase()} aquí
              </button>
            )}
          </Section>
        )}

        {/* ── Countertop appearance ─────────────────────────────────────── */}
        {showCountertopSection && (
          <Section label="Cubierta">
```

Replace with:

```tsx
        {/* ── Countertop appearance (Materiales) ───────────────────────── */}
        {activeTab === "materiales" && showCountertopSection && (
          <Section label="Cubierta">
```

- [ ] **Step 8: Move "Observaciones" outside the tab-gated area (it now sits right after Countertop's closing `</Section>` — no change needed there, just confirm)**

Read the file around the (now-shifted) end of the Countertop `</Section>`
and the `{/* ── Notes ── */}` block — it should already immediately follow,
still outside any `activeTab === ...` gate, since Step 4-7 only touched the
sections before and the Countertop section's own gate (Step 7) closes with
its own `)}` before Notes begins. No edit needed if so; if the Countertop
`</Section>` isn't immediately followed by `{/* ── Notes ── */}` after the
above edits, adjust so it is (Notes must stay ungated).

- [ ] **Step 9: Add missing imports (`useState`/`useEffect` already imported; nothing new needed) and type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly. If it doesn't, the most likely cause is a
mismatched `<>`/`)}`  pairing from Steps 4-5's fragment split — recount
the opening `{activeTab === "materiales" && ... && (` / `{activeTab ===
"estructura" && ... && (<>` against their closing `)}`/`</>\n)}` pairs
before moving on.

- [ ] **Step 10: Reasoning check — walk all 4 tabs for one module of each shape**

No test runner exists for this, so verify by reading the finished file
top-to-bottom against the Global Constraints table: for a `cajonera`
(drawers-only lower cabinet), a `refrigerador` (appliance), a `cubierta`
(countertop), and a `corona_luz` (light valance), confirm each of the 4
tabs renders at least the fields the table says it should for that
module's category/type, and no field appears twice or zero times across
all 4 tabs combined for that module.

- [ ] **Step 11: Commit**

```bash
git add components/kitchen/ModuleInspector.tsx
git commit -m "$(cat <<'EOF'
Tabify ModuleInspector into Medidas / Estructura / Frentes & Herrajes /
Materiales

Pure regrouping of existing field JSX under an activeTab gate — no field's
logic, validation, or store action changed. Mount height and appliance
niche size move into Medidas (previously their own "Instalación"/
standalone sections); the jaladeras/herrajes finish select moves from the
doors-and-drawers section into Materiales, per the approved panel
redesign spec. activeTab resets to "medidas" whenever the edited module
changes.
EOF
)"
```

---

### Task 5: Mobile stepper fields for Medidas

**Files:**
- Modify: `frontend/components/ui/input.tsx` (add `StepperInput`)
- Modify: `frontend/components/kitchen/ModuleInspector.tsx` (swap 5
  `NumInput` calls in the Medidas tab)

**Interfaces:**
- Consumes: `useIsMobile()` (Task 2, now correctly 768px).
- Produces: `StepperInput({ value, onChange, min?, max?, step?, unit? })`
  — same value/onChange contract as `NumberInput`, for reuse anywhere else
  a touch stepper is wanted later.

- [ ] **Step 1: Add `StepperInput` to `components/ui/input.tsx`**

Find:

```tsx
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
```

Replace with:

```tsx
// Touch-friendly alternative to NumberInput's bare numeric keyboard — large
// [-]/[+] buttons flank the same NumberInput, so typing directly still
// works too. Used on mobile only (ModuleInspector's Medidas tab); desktop
// keeps plain NumberInput.
export function StepperInput({ value, onChange, min = 0, max = 9999, step = 1, unit }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label="Disminuir"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ivory/10 bg-ivory/5 text-lg font-semibold text-ivory transition-colors hover:border-ivory/25 disabled:opacity-30"
      >
        −
      </button>
      <NumberInput value={value} onChange={(v) => onChange(clamp(v))} min={min} max={max} unit={unit} className="text-center" />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label="Aumentar"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ivory/10 bg-ivory/5 text-lg font-semibold text-ivory transition-colors hover:border-ivory/25 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
```

- [ ] **Step 2: Wire it into ModuleInspector's Medidas tab**

Find:

```tsx
import { WOOD_TEXTURES } from "@/components/3d/woodTextures";
import type { BoardMaterial, ExteriorTextureId, KitchenModule, PullOutAccessoryType, SidePanelMode } from "@/types/kitchen";
```

Replace with:

```tsx
import { WOOD_TEXTURES } from "@/components/3d/woodTextures";
import { StepperInput } from "@/components/ui/input";
import { useIsMobile } from "@/lib/useIsMobile";
import type { BoardMaterial, ExteriorTextureId, KitchenModule, PullOutAccessoryType, SidePanelMode } from "@/types/kitchen";
```

Then find:

```tsx
  const [activeTab, setActiveTab] = useState<InspectorTab>("medidas");
```

Replace with:

```tsx
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<InspectorTab>("medidas");
```

Then, inside the Medidas tab block added in Task 4 (the
`{activeTab === "medidas" && (<>...` fragment), find:

```tsx
            {showHeightField && (
              <FieldGroup label="Alto">
                <NumInput value={dim.height} onChange={(v) => updateDim("height", v)} min={1} max={500} unit="cm" />
              </FieldGroup>
            )}
            <FieldGroup label="Ancho">
              <NumInput value={dim.width} onChange={(v) => updateDim("width", v)} min={10} max={500} unit="cm" />
            </FieldGroup>
            <FieldGroup label="Fondo">
              <NumInput value={dim.depth} onChange={(v) => updateDim("depth", v)} min={10} max={200} unit="cm" />
            </FieldGroup>
```

Replace with:

```tsx
            {showHeightField && (
              <FieldGroup label="Alto">
                {isMobile ? (
                  <StepperInput value={dim.height} onChange={(v) => updateDim("height", v)} min={1} max={500} unit="cm" />
                ) : (
                  <NumInput value={dim.height} onChange={(v) => updateDim("height", v)} min={1} max={500} unit="cm" />
                )}
              </FieldGroup>
            )}
            <FieldGroup label="Ancho">
              {isMobile ? (
                <StepperInput value={dim.width} onChange={(v) => updateDim("width", v)} min={10} max={500} unit="cm" />
              ) : (
                <NumInput value={dim.width} onChange={(v) => updateDim("width", v)} min={10} max={500} unit="cm" />
              )}
            </FieldGroup>
            <FieldGroup label="Fondo">
              {isMobile ? (
                <StepperInput value={dim.depth} onChange={(v) => updateDim("depth", v)} min={10} max={200} unit="cm" />
              ) : (
                <NumInput value={dim.depth} onChange={(v) => updateDim("depth", v)} min={10} max={200} unit="cm" />
              )}
            </FieldGroup>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 4: Commit**

```bash
git add components/ui/input.tsx components/kitchen/ModuleInspector.tsx
git commit -m "$(cat <<'EOF'
Add touch stepper controls to Medidas dimension fields on mobile

New StepperInput (components/ui/input.tsx) wraps the existing
NumberInput with large [-]/[+] buttons — same value/onChange contract,
reusable elsewhere. Applied to Alto/Ancho/Fondo on mobile only
(useIsMobile, now correctly 768px); desktop keeps the plain numeric
input.
EOF
)"
```

---

### Task 6: Mobile bottom sheet (`vaul`)

**Files:**
- Create: `frontend/components/kitchen/KitchenBottomSheet.tsx`
- Modify: `frontend/components/kitchen/BuilderFab.tsx`
- Modify: `frontend/components/kitchen/KitchenBuilder.tsx`

**Interfaces:**
- Consumes: `Drawer` from `vaul` (Task 1); `useKitchenStore()`'s
  `showSelector`, `openSelector`, `closeSelector`, `setEditingModule`,
  `getEditingModule`, `draft.modules` (all pre-existing); `ModuleSelector`,
  `ModuleInspector` (unchanged from Tasks 3-5); `isMobile` (Task 2).
- Produces: `KitchenBottomSheet` — no props, reads everything from the
  store directly (same pattern `ModuleSelector`/`ModuleInspector` already
  use).

- [ ] **Step 1: Create `KitchenBottomSheet.tsx`**

```tsx
"use client";

import { Drawer } from "vaul";
import { Pencil, Plus } from "lucide-react";
import { useKitchenStore } from "@/store/useKitchenStore";
import { ModuleSelector } from "./ModuleSelector";
import { ModuleInspector } from "./ModuleInspector";

// Matches the approved spec's "~80px" collapsed row — 96px comfortably
// fits the row's padding plus a real touch target without clipping.
const COLLAPSED_SNAP = "96px";
// Within the spec's 50-85% range — leaves a visible strip of the 3D view
// at the top even when expanded, so the user never fully loses context.
const EXPANDED_SNAP = 0.78;

// Mobile-only counterpart to the desktop right panel (KitchenBuilder.tsx's
// AnimatePresence block) — same underlying state (showSelector/
// editingModuleId), different chrome. Deliberately has NO local "which
// mode" state of its own: the sheet's snap point is *derived* from the
// store, and drag/tap gestures translate back into the same
// openSelector/closeSelector/setEditingModule actions the desktop panel
// already calls, so the two surfaces can never drift out of sync.
export function KitchenBottomSheet() {
  const { draft, showSelector, openSelector, closeSelector, setEditingModule, getEditingModule } = useKitchenStore();
  const editingModule = getEditingModule();
  const expanded = showSelector || !!editingModule;
  const activeSnapPoint = expanded ? EXPANDED_SNAP : COLLAPSED_SNAP;

  // The only place drag/tap/backdrop gestures feed back into app state.
  // Collapsing (drag down, tap the backdrop, or the collapsed CTA itself
  // isn't reachable while already collapsed) closes whatever's open,
  // mirroring how the desktop panel's own close ("×") buttons behave.
  // Expanding from collapsed with nothing selected defaults to the
  // catalog — matches the collapsed row always showing "+ Añadir Módulo"
  // as its primary CTA.
  const handleSnapChange = (next: number | string | null) => {
    if (next === COLLAPSED_SNAP) {
      if (showSelector) closeSelector();
      if (editingModule) setEditingModule(null);
    } else if (next === EXPANDED_SNAP && !expanded) {
      openSelector();
    }
  };

  return (
    <Drawer.Root
      open
      dismissible={false}
      modal={expanded}
      snapPoints={[COLLAPSED_SNAP, EXPANDED_SNAP]}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={handleSnapChange}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          onClick={() => handleSnapChange(COLLAPSED_SNAP)}
          className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${
            expanded ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex h-full max-h-[92dvh] flex-col rounded-t-2xl border-t border-ivory/10 bg-ink outline-none">
          <Drawer.Title className="sr-only">
            {editingModule ? editingModule.label : "Configurador de cocina"}
          </Drawer.Title>
          <Drawer.Description className="sr-only">
            Panel de configuración de la cocina
          </Drawer.Description>
          <Drawer.Handle className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ivory/20" />
          <div className="min-h-0 flex-1">
            {expanded ? (showSelector ? <ModuleSelector /> : <ModuleInspector />) : (
              <CollapsedRow
                moduleLabel={editingModule?.label}
                modulesCount={draft.modules.length}
                onAddModule={() => handleSnapChange(EXPANDED_SNAP)}
                onEditModule={() => handleSnapChange(EXPANDED_SNAP)}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function CollapsedRow({ moduleLabel, modulesCount, onAddModule, onEditModule }: {
  moduleLabel?: string;
  modulesCount: number;
  onAddModule: () => void;
  onEditModule: () => void;
}) {
  return (
    <div className="flex h-full items-center gap-3 px-4">
      {moduleLabel ? (
        <button onClick={onEditModule} className="flex flex-1 items-center gap-2 truncate text-left text-sm font-medium text-ivory">
          <Pencil size={15} className="shrink-0 text-warmgray" />
          <span className="truncate">{moduleLabel}</span>
        </button>
      ) : (
        <div className="flex-1 truncate">
          <p className="truncate text-sm font-medium text-ivory">Configurador de Cocina</p>
          <p className="truncate text-xs text-warmgray">{modulesCount} módulo{modulesCount !== 1 ? "s" : ""}</p>
        </div>
      )}
      <button
        onClick={onAddModule}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-brass px-4 py-2.5 text-xs font-semibold text-ink"
      >
        <Plus size={15} />
        Añadir Módulo
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Hide `BuilderFab` on mobile (its CTA is now the sheet's own)**

In `frontend/components/kitchen/BuilderFab.tsx`, find:

```tsx
export function BuilderFab({ onClick, className = "right-5" }: { onClick: () => void; className?: string }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      whileTap={{ scale: 0.92 }}
      aria-label="Agregar mueble"
      className={`safe-bottom-inset fixed z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brass text-ink shadow-[0_8px_24px_rgba(193,144,79,0.45)] ${className}`}
    >
```

Replace with:

```tsx
export function BuilderFab({ onClick, className = "right-5" }: { onClick: () => void; className?: string }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      whileTap={{ scale: 0.92 }}
      aria-label="Agregar mueble"
      className={`safe-bottom-inset fixed z-30 h-14 w-14 items-center justify-center rounded-full bg-brass text-ink shadow-[0_8px_24px_rgba(193,144,79,0.45)] ${className}`}
    >
```

(Only change: dropped the bare `flex` from the base class — the caller now
supplies the full display utility, including the responsive `hidden
md:flex` set in Step 3, so `hidden` isn't fighting an always-on `flex`.)

- [ ] **Step 3: Wire it into `KitchenBuilder.tsx`**

Find:

```tsx
import { ModuleSelector } from "./ModuleSelector";
import { ModuleInspector } from "./ModuleInspector";
import { KitchenSummary } from "./KitchenSummary";
import { BuilderFab } from "./BuilderFab";
```

Replace with:

```tsx
import { ModuleSelector } from "./ModuleSelector";
import { ModuleInspector } from "./ModuleInspector";
import { KitchenSummary } from "./KitchenSummary";
import { BuilderFab } from "./BuilderFab";
import { KitchenBottomSheet } from "./KitchenBottomSheet";
```

Then find:

```tsx
            {!showSelector && !editingModule && (
              <BuilderFab onClick={() => openSelector()} className="bottom-6 left-1/2 -translate-x-1/2" />
            )}

            <AnimatePresence>
              {showSelector ? (
                <motion.div
                  key="selector"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ivory/8 bg-ink md:w-[400px]"
                >
                  <ModuleSelector />
                </motion.div>
              ) : editingModule ? (
                <motion.div
                  key="inspector"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 28, stiffness: 300 }}
                  className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ivory/8 bg-ink md:w-[400px]"
                >
                  <ModuleInspector />
                </motion.div>
              ) : null}
            </AnimatePresence>
```

Replace with:

```tsx
            {!showSelector && !editingModule && (
              <BuilderFab onClick={() => openSelector()} className="hidden md:flex bottom-6 left-1/2 -translate-x-1/2" />
            )}

            {isMobile ? (
              <KitchenBottomSheet />
            ) : (
              <AnimatePresence>
                {showSelector ? (
                  <motion.div
                    key="selector"
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 28, stiffness: 300 }}
                    className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ivory/8 bg-ink md:w-[400px]"
                  >
                    <ModuleSelector />
                  </motion.div>
                ) : editingModule ? (
                  <motion.div
                    key="inspector"
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 28, stiffness: 300 }}
                    className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-ivory/8 bg-ink md:w-[400px]"
                  >
                    <ModuleInspector />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASSES cleanly.

- [ ] **Step 5: Flag the two values that may need visual tuning**

`COLLAPSED_SNAP`/`EXPANDED_SNAP` (in `KitchenBottomSheet.tsx`) and
`max-h-[92dvh]` (on `Drawer.Content`) are reasoned starting values, not
measured against the actual rendered sheet — normal for a first pass at a
new drawer library. Per this plan's verification convention, don't
screenshot/click through to tune them; note in the handoff to the user
that these three values are the most likely candidates if the sheet's
collapsed row looks clipped/oversized or the expanded height feels off,
so they know where to point a quick fix if their own review flags it.

- [ ] **Step 6: Commit**

```bash
git add components/kitchen/KitchenBottomSheet.tsx components/kitchen/BuilderFab.tsx components/kitchen/KitchenBuilder.tsx
git commit -m "$(cat <<'EOF'
Add mobile bottom sheet, replacing the full-screen panel overlay

KitchenBottomSheet (vaul) has no state of its own — its snap point
derives from showSelector/editingModuleId, and drag/tap/backdrop
gestures feed back into openSelector/closeSelector/setEditingModule, the
same actions the desktop panel already uses. Collapsed (~96px) keeps the
3D view fully visible and interactive (Overlay's pointer-events forced
off below the expanded snap point); expanded (78% height) hosts the same
ModuleSelector/ModuleInspector desktop uses. BuilderFab is now
desktop-only (hidden md:flex) — its CTA is folded into the sheet's
collapsed row on mobile.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** desktop panel width/exclusivity (Task 2) · inspector
  tabs (Task 4) · mobile Medidas steppers (Task 5) · catalog back-button
  polish (Task 3) · mobile bottom sheet collapsed/expanded states, folded
  FAB, backdrop/swipe-to-collapse (Task 6) · new `vaul` dependency (Task
  1) · `useIsMobile` breakpoint correction found and fixed during planning
  (Task 2). All spec sections (§1-§4) have a task; the spec's one
  intentionally-open detail (StepperField's file location, exact snap
  values) is resolved above (`components/ui/input.tsx`; Task 6 Step 5
  flags the values as reasoned-but-unverified).
- **Placeholder scan:** none — every step has complete, literal code (or,
  for Task 4 Step 10 and Task 6 Step 5, an explicit reasoning/flagging
  procedure in place of a test command, since no test runner exists and
  the values genuinely need human eyes, not a fabricated "it works" claim).
- **Type consistency:** `InspectorTab` (Task 4) is `"medidas" |
  "estructura" | "frentes" | "materiales"` everywhere it's used (state,
  `INSPECTOR_TABS`, every `activeTab === "..."` gate). `StepperInput`'s
  props (Task 5) match `NumberInput`'s `value`/`onChange`/`min`/`max`/`unit`
  shape exactly, plus the new `step`. `KitchenBottomSheet` (Task 6) takes
  no props and reads the same store shape `ModuleSelector`/
  `ModuleInspector` already read — no new store fields anywhere in this
  plan.
- **Scope check:** single cohesive plan; Tasks 1-2 are prerequisites, 3-5
  are independent of each other and of Task 6, Task 6 depends on Tasks 1-2
  (vaul + isMobile) and reuses Tasks 3-5's already-tabbed/stepper-aware
  `ModuleInspector`/polished `ModuleSelector` as-is.
- **Ambiguity check:** the Global Constraints tab-assignment table pins
  down the one placement the spec left implicit (hardware/jaladeras →
  Materiales, per the user's original bullet list, not Frentes &
  Herrajes despite the tab's name) — resolved by re-reading the user's
  original request text rather than guessing.

"use client";

import { useState } from "react";
import type { KitchenModule, DrawerDef, DoorDef, DrawerSystem, DoorStyle } from "@/types/kitchen";
import { Input } from "@/components/ui/input";
import { getEffectiveDrawers, getEffectiveDoors } from "@/components/3d/ModulePreview3D";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const SVG_W = 272;
const GAP = 1.5;

const C = {
  bg: "#0c0c18",
  body: "#1a1a2c",
  toeKick: "#0a0a12",
  countertop: "#3a3028",
  drawerReal: "#362e60",
  drawerGhost: "#1e1e28",
  door: "#1e2e44",
  selected: "#6366f1",
};

interface FaceEditorProps {
  module: KitchenModule;
  onChange: (patch: Partial<KitchenModule>) => void;
}

type AddMode = "drawer" | "door" | null;

// ─── Main Component ────────────────────────────────────────────────────────────
export function FaceEditor({ module, onChange }: FaceEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>({});

  const { dimensions, options } = module;
  const toeKick = options.hasToeKick ? options.toeKickHeight : 0;
  const ctThick = options.includesCountertop ? options.countertopThickness : 0;
  const interiorH = dimensions.height - toeKick - ctThick;

  const drawerDefs = options.drawerDefs ?? [];
  const doorDefs = options.doorDefs ?? [];

  // For SVG: build the visual element list
  const svgScale = SVG_W / dimensions.width;
  const SVG_H = Math.round(dimensions.height * svgScale);
  const toY = (fromBottom: number, height: number) =>
    SVG_H - (toeKick + fromBottom + height) * svgScale;
  const toH = (cm: number) => cm * svgScale;

  // In simple mode, use auto-generated defs for SVG display
  const visualDrawers = options.useDetailedLayout ? drawerDefs : getEffectiveDrawers(module);
  const visualDoors = options.useDetailedLayout ? doorDefs : getEffectiveDoors(module);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const patchOpts = (up: Partial<typeof options>) =>
    onChange({ options: { ...options, ...up } });

  const suggestNextPos = () => {
    const occupied = [
      ...drawerDefs.map((d) => d.fromBottomCm + d.heightCm),
      ...doorDefs.map((d) => d.fromBottomCm + d.heightCm),
      0,
    ];
    return Math.min(Math.max(...occupied), interiorH - 10);
  };

  const openAddDrawer = () => {
    setActiveId(null);
    setAddMode("drawer");
    const pos = suggestNextPos();
    setDraft({
      label: `Cajón ${drawerDefs.length + 1}`,
      heightCm: 12,
      fromBottomCm: pos,
      isGhost: false,
      widthPct: 100,
      offsetPct: 0,
      drawerSystem: options.drawerSystem,
    });
  };

  const openAddDoor = () => {
    setActiveId(null);
    setAddMode("door");
    const existingCount = doorDefs.length;
    const autoW = existingCount === 0 ? 100 : 50;
    const autoOffset = existingCount > 0 ? 50 : 0;
    setDraft({
      label: `Puerta ${doorDefs.length + 1}`,
      widthPct: autoW,
      offsetPct: autoOffset,
      fromBottomCm: 0,
      heightCm: Math.max(Math.round(interiorH * 0.62), 40),
      hingeLeft: existingCount % 2 === 0,
      doorStyle: options.doorStyle,
    });
  };

  const commitAdd = () => {
    if (addMode === "drawer") {
      const d: DrawerDef = {
        id: uid(),
        label: String(draft.label ?? "Cajón"),
        heightCm: Number(draft.heightCm ?? 12),
        fromBottomCm: Number(draft.fromBottomCm ?? 0),
        isGhost: Boolean(draft.isGhost),
        widthPct: Number(draft.widthPct ?? 100),
        offsetPct: Number(draft.offsetPct ?? 0),
        drawerSystem: (draft.drawerSystem as DrawerSystem) ?? options.drawerSystem,
      };
      patchOpts({ drawerDefs: [...drawerDefs, d], useDetailedLayout: true });
    } else if (addMode === "door") {
      const d: DoorDef = {
        id: uid(),
        label: String(draft.label ?? "Puerta"),
        widthPct: Number(draft.widthPct ?? 100),
        offsetPct: Number(draft.offsetPct ?? 0),
        fromBottomCm: Number(draft.fromBottomCm ?? 0),
        heightCm: Number(draft.heightCm ?? interiorH),
        hingeLeft: Boolean(draft.hingeLeft ?? true),
        doorStyle: (draft.doorStyle as DoorStyle) ?? options.doorStyle,
      };
      patchOpts({ doorDefs: [...doorDefs, d], useDetailedLayout: true });
    }
    setAddMode(null);
    setDraft({});
  };

  const deleteEl = (kind: "drawer" | "door", id: string) => {
    if (kind === "drawer") patchOpts({ drawerDefs: drawerDefs.filter((d) => d.id !== id) });
    else patchOpts({ doorDefs: doorDefs.filter((d) => d.id !== id) });
    if (activeId === id) setActiveId(null);
  };

  const updateDrawer = (id: string, up: Partial<DrawerDef>) =>
    patchOpts({ drawerDefs: drawerDefs.map((d) => (d.id === id ? { ...d, ...up } : d)) });

  const updateDoor = (id: string, up: Partial<DoorDef>) =>
    patchOpts({ doorDefs: doorDefs.map((d) => (d.id === id ? { ...d, ...up } : d)) });

  const activeDrawer = activeId ? drawerDefs.find((d) => d.id === activeId) ?? null : null;
  const activeDoor = activeId ? doorDefs.find((d) => d.id === activeId) ?? null : null;

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((p) => ({ ...p, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  const handleClick = (id: string) => {
    setAddMode(null);
    setActiveId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-3">
      {/* ─── SVG Face View ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-white/8 bg-[#0c0c18]">
        <div className="flex items-center justify-between border-b border-white/6 px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Vista frontal — {dimensions.width} × {dimensions.height} cm
          </span>
          {options.useDetailedLayout && (
            <button
              onClick={() => {
                patchOpts({ useDetailedLayout: false, drawerDefs: [], doorDefs: [] });
                setActiveId(null);
              }}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
            >
              Reiniciar
            </button>
          )}
        </div>
        <div className="flex justify-center p-3">
          <svg width={SVG_W} height={SVG_H} style={{ display: "block", borderRadius: 3 }}>
            {/* Cabinet body */}
            <rect x={0} y={0} width={SVG_W} height={SVG_H} fill={C.body} />

            {/* Countertop band */}
            {ctThick > 0 && (
              <rect x={0} y={0} width={SVG_W} height={ctThick * svgScale} fill={C.countertop} />
            )}

            {/* Toe kick band */}
            {toeKick > 0 && (
              <rect
                x={0}
                y={SVG_H - toeKick * svgScale}
                width={SVG_W}
                height={toeKick * svgScale}
                fill={C.toeKick}
              />
            )}

            {/* Door panels */}
            {visualDoors.map((door) => {
              const isDetailed = options.useDetailedLayout;
              const x = (door.offsetPct / 100) * SVG_W + GAP;
              const w = (door.widthPct / 100) * SVG_W - GAP * 2;
              const y = toY(door.fromBottomCm, door.heightCm) + GAP;
              const h = toH(door.heightCm) - GAP;
              const isActive = isDetailed && activeId === door.id;
              return (
                <g
                  key={door.id}
                  onClick={isDetailed ? () => handleClick(door.id) : undefined}
                  style={{ cursor: isDetailed ? "pointer" : "default" }}
                >
                  <rect
                    x={x} y={y} width={w} height={h}
                    fill={isActive ? "#263d5a" : C.door}
                    stroke={isActive ? C.selected : "#3a506a"}
                    strokeWidth={isActive ? 1.5 : 1}
                    rx={1}
                  />
                  {/* Hinge pill */}
                  <rect
                    x={door.hingeLeft ? x + 3 : x + w - 7}
                    y={y + h * 0.22}
                    width={4}
                    height={h * 0.56}
                    fill="#556"
                    rx={2}
                    opacity={0.75}
                  />
                  {/* Handle */}
                  <rect
                    x={door.hingeLeft ? x + w - 10 : x + 6}
                    y={y + h / 2 - 5}
                    width={4}
                    height={10}
                    fill="#7a8a9a"
                    rx={2}
                    opacity={0.65}
                  />
                  {h > 20 && (
                    <text
                      x={x + w / 2} y={y + h / 2 + 4}
                      textAnchor="middle" fontSize={9} fill="#6a9ac0"
                      fontFamily="system-ui,sans-serif"
                    >
                      {door.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Drawer panels */}
            {visualDrawers.map((drawer) => {
              const isDetailed = options.useDetailedLayout;
              const x = (drawer.offsetPct / 100) * SVG_W + GAP;
              const w = (drawer.widthPct / 100) * SVG_W - GAP * 2;
              const y = toY(drawer.fromBottomCm, drawer.heightCm) + GAP;
              const h = toH(drawer.heightCm) - GAP;
              const isActive = isDetailed && activeId === drawer.id;
              return (
                <g
                  key={drawer.id}
                  onClick={isDetailed ? () => handleClick(drawer.id) : undefined}
                  style={{ cursor: isDetailed ? "pointer" : "default" }}
                >
                  <rect
                    x={x} y={y} width={w} height={h}
                    fill={isActive ? "#4a4680" : drawer.isGhost ? C.drawerGhost : C.drawerReal}
                    stroke={isActive ? C.selected : drawer.isGhost ? "#38384a" : "#5a52a0"}
                    strokeWidth={isActive ? 1.5 : 1}
                    strokeDasharray={drawer.isGhost ? "5 3" : undefined}
                    rx={1}
                  />
                  {/* Ghost diagonal marks */}
                  {drawer.isGhost && h > 10 && (
                    <>
                      <line x1={x + 5} y1={y + 4} x2={x + w - 5} y2={y + h - 4} stroke="#4a4a5a" strokeWidth={1} />
                      <line x1={x + w - 5} y1={y + 4} x2={x + 5} y2={y + h - 4} stroke="#4a4a5a" strokeWidth={1} />
                    </>
                  )}
                  {/* Handle bar */}
                  {!drawer.isGhost && h > 12 && (
                    <rect
                      x={x + w / 2 - 12} y={y + h / 2 - 2}
                      width={24} height={4}
                      fill="#666" rx={2} opacity={0.7}
                    />
                  )}
                  {h > 18 && (
                    <text
                      x={x + w / 2} y={y + h / 2 + 4}
                      textAnchor="middle" fontSize={9}
                      fill={drawer.isGhost ? "#505060" : "#9890d0"}
                      fontFamily="system-ui,sans-serif"
                    >
                      {drawer.label}{drawer.isGhost ? " ◌" : ""}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Cabinet outline */}
            <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="none" stroke="#2a2a3a" strokeWidth={1} />

            {/* Dimension text */}
            <text
              x={SVG_W / 2} y={SVG_H - 3}
              textAnchor="middle" fontSize={7} fill="#333"
              fontFamily="system-ui,sans-serif"
            >
              {dimensions.width} cm
            </text>
          </svg>
        </div>
      </div>

      {/* ─── Mode hint ─────────────────────────────────────────────────── */}
      {!options.useDetailedLayout && (
        <p className="text-[10px] text-zinc-600 text-center">
          Vista automática · Agrega elementos para activar modo detallado
        </p>
      )}

      {/* ─── Action Buttons ─────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={openAddDrawer}
          className="flex-1 rounded-xl border border-violet-500/30 bg-violet-950/25 py-2 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-950/45"
        >
          + Cajón
        </button>
        <button
          onClick={() => {
            openAddDrawer();
            setDraft((d) => ({ ...d, isGhost: true, label: `Cajón fantasma ${drawerDefs.length + 1}` }));
          }}
          className="flex-1 rounded-xl border border-zinc-600/40 bg-zinc-900/40 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800/50"
        >
          + Fantasma
        </button>
        <button
          onClick={openAddDoor}
          className="flex-1 rounded-xl border border-blue-500/30 bg-blue-950/25 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-950/45"
        >
          + Puerta
        </button>
      </div>

      {/* ─── Add Form ───────────────────────────────────────────────────── */}
      {addMode && (
        <AddForm
          mode={addMode}
          draft={draft}
          set={set}
          onCancel={() => { setAddMode(null); setDraft({}); }}
          onCommit={commitAdd}
        />
      )}

      {/* ─── Edit Drawer Form ────────────────────────────────────────────── */}
      {activeDrawer && (
        <ElementEditForm
          title={activeDrawer.isGhost ? "◌ Cajón fantasma" : "▬ Cajón real"}
          color="violet"
          onDelete={() => deleteEl("drawer", activeDrawer.id)}
        >
          <FieldRow label="Nombre">
            <Input value={activeDrawer.label} onChange={(e) => updateDrawer(activeDrawer.id, { label: e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Alto (cm)">
            <Input type="number" min={1} value={activeDrawer.heightCm} onChange={(e) => updateDrawer(activeDrawer.id, { heightCm: +e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Desde abajo (cm)">
            <Input type="number" min={0} value={activeDrawer.fromBottomCm} onChange={(e) => updateDrawer(activeDrawer.id, { fromBottomCm: +e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Ancho (%)">
            <Input type="number" min={1} max={100} value={activeDrawer.widthPct} onChange={(e) => updateDrawer(activeDrawer.id, { widthPct: +e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Desfase izq (%)">
            <Input type="number" min={0} max={99} value={activeDrawer.offsetPct} onChange={(e) => updateDrawer(activeDrawer.id, { offsetPct: +e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <CheckRow
            label="Cajón fantasma (solo visual, sin correderas)"
            checked={activeDrawer.isGhost}
            onChange={(v) => updateDrawer(activeDrawer.id, { isGhost: v })}
          />
        </ElementEditForm>
      )}

      {/* ─── Edit Door Form ──────────────────────────────────────────────── */}
      {activeDoor && (
        <ElementEditForm
          title="⬜ Puerta"
          color="blue"
          onDelete={() => deleteEl("door", activeDoor.id)}
        >
          <FieldRow label="Nombre">
            <Input value={activeDoor.label} onChange={(e) => updateDoor(activeDoor.id, { label: e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Alto (cm)">
            <Input type="number" min={1} value={activeDoor.heightCm} onChange={(e) => updateDoor(activeDoor.id, { heightCm: +e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Ancho (%)">
            <Input type="number" min={1} max={100} value={activeDoor.widthPct} onChange={(e) => updateDoor(activeDoor.id, { widthPct: +e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Desfase izq (%)">
            <Input type="number" min={0} max={99} value={activeDoor.offsetPct} onChange={(e) => updateDoor(activeDoor.id, { offsetPct: +e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <FieldRow label="Desde abajo (cm)">
            <Input type="number" min={0} value={activeDoor.fromBottomCm} onChange={(e) => updateDoor(activeDoor.id, { fromBottomCm: +e.target.value })} className="h-8 text-xs" />
          </FieldRow>
          <CheckRow
            label="Bisagra izquierda"
            checked={activeDoor.hingeLeft}
            onChange={(v) => updateDoor(activeDoor.id, { hingeLeft: v })}
          />
        </ElementEditForm>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="col-span-2 flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs transition-colors hover:border-white/15">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-indigo-500"
      />
      <span className="text-zinc-300">{label}</span>
    </label>
  );
}

function ElementEditForm({
  title,
  color,
  children,
  onDelete,
}: {
  title: string;
  color: "violet" | "blue";
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const border = color === "violet" ? "border-violet-500/25 bg-violet-950/20" : "border-blue-500/25 bg-blue-950/20";
  const titleColor = color === "violet" ? "text-violet-300" : "text-blue-300";
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${border}`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-semibold ${titleColor}`}>{title}</p>
        <button onClick={onDelete} className="text-xs text-red-400 transition-colors hover:text-red-300">
          Eliminar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function AddForm({
  mode,
  draft,
  set,
  onCancel,
  onCommit,
}: {
  mode: "drawer" | "door";
  draft: Record<string, string | number | boolean>;
  set: (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const title = mode === "drawer" ? "Nuevo cajón" : "Nueva puerta";
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-3 space-y-2">
      <p className="text-xs font-semibold text-white">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Nombre">
          <Input value={String(draft.label ?? "")} onChange={set("label")} className="h-8 text-xs" />
        </FieldRow>
        <FieldRow label="Alto (cm)">
          <Input type="number" min={1} value={Number(draft.heightCm ?? 12)} onChange={set("heightCm")} className="h-8 text-xs" />
        </FieldRow>
        <FieldRow label="Desde abajo (cm)">
          <Input type="number" min={0} value={Number(draft.fromBottomCm ?? 0)} onChange={set("fromBottomCm")} className="h-8 text-xs" />
        </FieldRow>
        <FieldRow label="Ancho (%)">
          <Input type="number" min={1} max={100} value={Number(draft.widthPct ?? 100)} onChange={set("widthPct")} className="h-8 text-xs" />
        </FieldRow>
        {mode === "door" && (
          <>
            <FieldRow label="Desfase izq (%)">
              <Input type="number" min={0} max={99} value={Number(draft.offsetPct ?? 0)} onChange={set("offsetPct")} className="h-8 text-xs" />
            </FieldRow>
            <CheckRow label="Bisagra izquierda" checked={Boolean(draft.hingeLeft ?? true)} onChange={(v) => set("hingeLeft")({ target: { type: "checkbox", checked: v } } as React.ChangeEvent<HTMLInputElement>)} />
          </>
        )}
        {mode === "drawer" && (
          <CheckRow
            label="Cajón fantasma (solo visual, sin correderas)"
            checked={Boolean(draft.isGhost)}
            onChange={(v) => set("isGhost")({ target: { type: "checkbox", checked: v } } as React.ChangeEvent<HTMLInputElement>)}
          />
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCommit}
          className="flex-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          Agregar
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-1.5 text-xs text-zinc-400 transition-colors hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

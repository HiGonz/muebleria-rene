"use client";

import { useState } from "react";
import { NumericField } from "./NumericField";

const DEFAULT_NICHE = { width: 300, height: 240, depth: 60 };
const DEFAULT_ROOM = { width: 300, depth: 300, ceilingHeight: 240 };

const fieldClass = "w-20 rounded border border-ivory/15 bg-ink px-1.5 py-0.5 text-right text-xs text-ivory";

// Shown instead of the builder whenever there's no draft yet (first-ever
// visit, or the draft was cleared) — replaces the old silent auto-init of a
// fixed niche, which never gave the user a way to reach a room área at all.
export function ClosetAreaCreationScreen({ onCreateNiche, onCreateRoom }: {
  onCreateNiche: (widthCm: number, heightCm: number, depthCm: number) => void;
  onCreateRoom: (widthCm: number, depthCm: number, ceilingHeightCm: number) => void;
}) {
  const [spaceType, setSpaceType] = useState<"niche" | "room">("niche");
  const [nicheWidth, setNicheWidth] = useState(DEFAULT_NICHE.width);
  const [nicheHeight, setNicheHeight] = useState(DEFAULT_NICHE.height);
  const [nicheDepth, setNicheDepth] = useState(DEFAULT_NICHE.depth);
  const [roomWidth, setRoomWidth] = useState(DEFAULT_ROOM.width);
  const [roomDepth, setRoomDepth] = useState(DEFAULT_ROOM.depth);
  const [roomCeilingHeight, setRoomCeilingHeight] = useState(DEFAULT_ROOM.ceilingHeight);

  return (
    <div className="flex h-screen items-center justify-center bg-ink text-ivory">
      <div className="w-80 rounded-2xl border border-ivory/10 bg-ivory/4 p-5">
        <h1 className="font-display text-sm font-semibold">Nuevo closet</h1>
        <div className="mt-4 flex gap-1.5">
          <button
            onClick={() => setSpaceType("niche")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${spaceType === "niche" ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
          >
            Nicho
          </button>
          <button
            onClick={() => setSpaceType("room")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${spaceType === "room" ? "bg-brass text-ink" : "bg-ivory/8 text-warmgray hover:text-ivory"}`}
          >
            Cuarto
          </button>
        </div>

        {spaceType === "niche" ? (
          <div className="mt-4 space-y-2">
            <label className="flex items-center justify-between text-xs text-warmgray">
              Ancho (cm)
              <NumericField value={nicheWidth} min={50} onCommit={setNicheWidth} className={fieldClass} ariaLabel="Ancho del nicho en centímetros" />
            </label>
            <label className="flex items-center justify-between text-xs text-warmgray">
              Alto (cm)
              <NumericField value={nicheHeight} min={50} onCommit={setNicheHeight} className={fieldClass} ariaLabel="Alto del nicho en centímetros" />
            </label>
            <label className="flex items-center justify-between text-xs text-warmgray">
              Profundidad (cm)
              <NumericField value={nicheDepth} min={20} onCommit={setNicheDepth} className={fieldClass} ariaLabel="Profundidad del nicho en centímetros" />
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <label className="flex items-center justify-between text-xs text-warmgray">
              Ancho (cm)
              <NumericField value={roomWidth} min={100} onCommit={setRoomWidth} className={fieldClass} ariaLabel="Ancho del cuarto en centímetros" />
            </label>
            <label className="flex items-center justify-between text-xs text-warmgray">
              Profundidad (cm)
              <NumericField value={roomDepth} min={100} onCommit={setRoomDepth} className={fieldClass} ariaLabel="Profundidad del cuarto en centímetros" />
            </label>
            <label className="flex items-center justify-between text-xs text-warmgray">
              Altura de techo (cm)
              <NumericField value={roomCeilingHeight} min={180} onCommit={setRoomCeilingHeight} className={fieldClass} ariaLabel="Altura de techo del cuarto en centímetros" />
            </label>
          </div>
        )}

        <button
          onClick={() => (spaceType === "niche" ? onCreateNiche(nicheWidth, nicheHeight, nicheDepth) : onCreateRoom(roomWidth, roomDepth, roomCeilingHeight))}
          className="mt-4 w-full rounded-lg bg-brass px-3 py-2 text-xs font-semibold text-ink hover:bg-brass-soft"
        >
          Crear
        </button>
      </div>
    </div>
  );
}

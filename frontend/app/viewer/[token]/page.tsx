"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getPublicKitchenShare, type PublicKitchenView } from "@/services/publicApi";

const KitchenAssemblyScene = dynamic(() => import("@/components/3d/KitchenAssemblyScene").then((m) => m.KitchenAssemblyScene), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-ink">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brass border-t-transparent" />
    </div>
  ),
});

export default function PublicKitchenViewerPage({ params }: { params: Promise<{ token: string }> }) {
  const [view, setView] = useState<PublicKitchenView | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    params
      .then(({ token }) => getPublicKitchenShare(token))
      .then(setView)
      .catch(() => setNotFound(true));
  }, [params]);

  if (notFound) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-ink px-4 text-center text-ivory">
        <p className="text-4xl">🔒</p>
        <h1 className="font-display text-lg font-semibold">Este enlace ya no está disponible</h1>
        <p className="max-w-sm text-sm text-warmgray">Pide al diseñador que te comparta un enlace nuevo.</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brass border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-ivory">
      <header className="flex shrink-0 items-center gap-3 border-b border-ivory/8 px-5 py-3">
        <h1 className="truncate font-display text-base font-semibold text-ivory">{view.projectName}</h1>
      </header>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <KitchenAssemblyScene
          readOnly
          modules={view.modules}
          roomWidth={view.roomWidth}
          roomDepth={view.roomDepth}
          ceilingHeight={view.ceilingHeight}
          openings={view.openings}
        />
      </div>
    </div>
  );
}

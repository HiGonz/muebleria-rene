"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createKitchenShare, revokeKitchenShare } from "@/services/api";

interface ShareModalProps {
  kitchenProjectId: number;
  onClose: () => void;
}

export function ShareModal({ kitchenProjectId, onClose }: ShareModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    createKitchenShare(kitchenProjectId)
      .then((share) => setUrl(share.url))
      .catch(() => toast.error("No fue posible generar el enlace de compartir."))
      .finally(() => setLoading(false));
  }, [kitchenProjectId]);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async () => {
    setRevoking(true);
    try {
      await revokeKitchenShare(kitchenProjectId);
      setUrl(null);
      toast.success("Se dejó de compartir este proyecto.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible dejar de compartir.");
    } finally {
      setRevoking(false);
    }
  };

  const generate = async () => {
    setLoading(true);
    try {
      const share = await createKitchenShare(kitchenProjectId);
      setUrl(share.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible generar el enlace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-ivory/10 bg-surface-raised shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-ivory/8 px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-ivory">Compartir con cliente</h2>
            <p className="mt-0.5 text-xs text-warmgray">
              Enlace de solo lectura — el cliente puede ver la cocina en 3D sin poder editarla
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-warmgray transition-colors hover:bg-ivory/8 hover:text-ivory">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {loading ? (
            <p className="text-xs text-warmgray">Generando enlace...</p>
          ) : url ? (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-ivory/10 bg-ivory/4 px-3 py-2.5">
                <span className="selectable-text flex-1 truncate text-xs text-ivory/80">{url}</span>
                <button
                  onClick={copy}
                  aria-label="Copiar enlace"
                  title="Copiar enlace"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-warmgray transition-colors hover:bg-ivory/10 hover:text-ivory"
                >
                  {copied ? <Check size={14} className="text-sage" /> : <Copy size={14} />}
                </button>
              </div>
              <Button variant="danger" className="h-9 w-full text-xs" disabled={revoking} onClick={revoke}>
                {revoking ? "Revocando..." : "Dejar de compartir"}
              </Button>
            </>
          ) : (
            <Button variant="primary" className="h-9 w-full text-xs" onClick={generate}>
              Generar enlace
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

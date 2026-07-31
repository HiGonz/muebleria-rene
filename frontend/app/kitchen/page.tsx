import { Suspense } from "react";
import { KitchenBuilder } from "@/components/kitchen/KitchenBuilder";

export const metadata = {
  title: "Constructor de Cocina",
};

export default function KitchenBuilderPage() {
  return (
    <Suspense fallback={null}>
      <KitchenBuilder />
    </Suspense>
  );
}

"use client";

import { Card } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function WeeklyChart({ data }: { data: Array<{ week: string; quotes: number }> }) {
  return (
    <Card className="min-h-[340px]">
      <div className="mb-6">
        <h3 className="text-lg font-semibold">Cotizaciones por semana</h3>
        <p className="text-sm text-zinc-400">Últimas 4 semanas</p>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="week" stroke="#71717a" tickLine={false} axisLine={false} />
          <YAxis stroke="#71717a" tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(99,102,241,0.12)" }} contentStyle={{ background: "#111118", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14 }} />
          <Bar dataKey="quotes" radius={[10, 10, 0, 0]} fill="#6366F1" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

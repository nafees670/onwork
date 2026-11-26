"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { BarChart, ChartCard } from "./primitives";

export default function NewHiresByMonthChart({ trend, labels, loading }: { trend: number[]; labels: string[]; loading: boolean }) {
  const isEmpty = trend.every((v) => v === 0);
  return (
    <ChartCard
      title="New Hires by Month"
      icon={<TrendingUp size={16} className="text-slate-400" />}
      loading={loading}
      isEmpty={isEmpty}
      emptyMessage="No hires recorded in the last 12 months"
      skeletonHeight="h-40"
    >
      <div className="h-40">
        <BarChart data={trend} />
      </div>
      <div className="flex justify-between mt-3 px-1">
        {labels.map((m, i) => (
          <span key={i} className="text-[10px] text-slate-400">{m}</span>
        ))}
      </div>
    </ChartCard>
  );
}

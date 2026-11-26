"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { BarChart, ChartCard } from "./primitives";

export interface TurnoverMonth {
  label: string;
  exits: number;
  avg_headcount: number;
  rate: number;
}

export default function TurnoverRateTrendChart({ data, loading }: { data: TurnoverMonth[]; loading: boolean }) {
  const isEmpty = data.every((m) => m.exits === 0);
  return (
    <ChartCard
      title="Turnover Rate Trend"
      icon={<TrendingUp size={16} className="text-slate-400" />}
      loading={loading}
      isEmpty={isEmpty}
      emptyMessage="No exits in the last 6 months"
      skeletonHeight="h-40"
    >
      <div className="h-40">
        <BarChart data={data.map((m) => m.rate)} />
      </div>
      <div className="flex justify-between mt-3 px-1">
        {data.map((m, i) => (
          <span key={i} className="text-[10px] text-slate-400">{m.label}</span>
        ))}
      </div>
    </ChartCard>
  );
}

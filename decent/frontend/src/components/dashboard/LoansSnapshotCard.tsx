"use client";

import React from "react";
import { HandCoins } from "lucide-react";
import { ChartCard, formatCurrency } from "./primitives";

export default function LoansSnapshotCard({
  activeLoans,
  outstanding,
  monthlyDeductions,
  loading,
}: {
  activeLoans: number;
  outstanding: number;
  monthlyDeductions: number;
  loading: boolean;
}) {
  return (
    <ChartCard
      title="Loans Snapshot"
      icon={<HandCoins size={16} className="text-slate-400" />}
      loading={loading}
      isEmpty={false}
      emptyMessage=""
      skeletonHeight="h-24"
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-slate-50 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wide mb-1">Active</p>
          <p className="text-xl font-black text-slate-900">{activeLoans}</p>
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wide mb-1">Outstanding</p>
          <p className="text-xl font-black text-rose-600">{formatCurrency(outstanding)}</p>
        </div>
        <div className="text-center p-3 bg-slate-50 rounded-xl">
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wide mb-1">Monthly</p>
          <p className="text-xl font-black text-slate-900">{formatCurrency(monthlyDeductions)}</p>
        </div>
      </div>
    </ChartCard>
  );
}

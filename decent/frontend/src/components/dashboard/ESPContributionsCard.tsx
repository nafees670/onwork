"use client";

import React from "react";
import { PiggyBank } from "lucide-react";
import { ChartCard, ProportionRow, BRAND, formatCurrency } from "./primitives";

export default function ESPContributionsCard({
  employeeContribution,
  employerContribution,
  balance,
  loading,
}: {
  employeeContribution: number;
  employerContribution: number;
  balance: number;
  loading: boolean;
}) {
  const total = Math.max(employeeContribution, employerContribution, 1);
  return (
    <ChartCard
      title="ESP Contributions Overview"
      icon={<PiggyBank size={16} className="text-slate-400" />}
      loading={loading}
      isEmpty={false}
      emptyMessage=""
      skeletonHeight="h-24"
    >
      <div>
        <ProportionRow label="Employee Contribution" count={Math.round(employeeContribution)} total={total} color={BRAND} />
        <ProportionRow label="Employer Contribution" count={Math.round(employerContribution)} total={total} color="#7c3aed" />
      </div>
      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Balance</span>
        <span className="text-lg font-bold text-emerald-600">{formatCurrency(balance)}</span>
      </div>
    </ChartCard>
  );
}

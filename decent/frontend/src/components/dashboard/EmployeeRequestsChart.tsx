"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import { ChartCard, DonutChart, BRAND } from "./primitives";

export interface RequestsByCategory {
  category: string;
  count: number;
}

const CATEGORY_COLORS = [BRAND, "#f59e0b", "#f43f5e", "#7c3aed", "#64748b"];

export default function EmployeeRequestsChart({
  pending,
  approved,
  rejected,
  byCategory,
  loading,
}: {
  pending: number;
  approved: number;
  rejected: number;
  byCategory: RequestsByCategory[];
  loading: boolean;
}) {
  const total = pending + approved + rejected;
  return (
    <ChartCard
      title="Employee Requests"
      icon={<MessageSquare size={16} className="text-slate-400" />}
      loading={loading}
      isEmpty={total === 0}
      emptyMessage="No employee requests yet"
    >
      <DonutChart
        data={byCategory.map((c, i) => ({ label: c.category, value: c.count, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))}
      />
      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-xs">
        <span className="text-amber-600 font-semibold">{pending} pending</span>
        <span className="text-emerald-600 font-semibold">{approved} approved</span>
        <span className="text-rose-600 font-semibold">{rejected} rejected</span>
      </div>
    </ChartCard>
  );
}

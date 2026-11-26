"use client";

import React from "react";
import { ChartCard, DonutChart, BRAND } from "./primitives";

export interface EmploymentMixItem {
  label: string;
  count: number;
}

const EMPLOYMENT_COLORS = [BRAND, "#f59e0b", "#7c3aed", "#64748b"];

export default function WorkforceCompositionChart({ data, loading }: { data: EmploymentMixItem[]; loading: boolean }) {
  return (
    <ChartCard title="Workforce Composition" loading={loading} isEmpty={data.length === 0} emptyMessage="No employment-type data yet">
      <DonutChart data={data.map((e, i) => ({ label: e.label, value: e.count, color: EMPLOYMENT_COLORS[i % EMPLOYMENT_COLORS.length] }))} />
    </ChartCard>
  );
}

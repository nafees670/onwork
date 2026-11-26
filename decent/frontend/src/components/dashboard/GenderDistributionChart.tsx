"use client";

import React from "react";
import { ChartCard, DonutChart, BRAND } from "./primitives";

export interface GenderMixItem {
  label: string;
  count: number;
}

const GENDER_COLORS: Record<string, string> = { Male: BRAND, Female: "#7c3aed", Unspecified: "#64748b" };

export default function GenderDistributionChart({ data, loading }: { data: GenderMixItem[]; loading: boolean }) {
  return (
    <ChartCard title="Gender Distribution" loading={loading} isEmpty={data.length === 0} emptyMessage="No gender data yet">
      <DonutChart data={data.map((g) => ({ label: g.label, value: g.count, color: GENDER_COLORS[g.label] || "#64748b" }))} />
    </ChartCard>
  );
}

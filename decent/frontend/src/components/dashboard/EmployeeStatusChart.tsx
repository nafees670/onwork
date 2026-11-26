"use client";

import React from "react";
import { ChartCard, DonutChart } from "./primitives";

export interface StatusMixItem {
  label: string;
  count: number;
  color: string;
}

export default function EmployeeStatusChart({ data, loading }: { data: StatusMixItem[]; loading: boolean }) {
  return (
    <ChartCard title="Employee Status" loading={loading} isEmpty={data.length === 0} emptyMessage="No employee data yet">
      <DonutChart data={data.map((s) => ({ label: s.label, value: s.count, color: s.color }))} />
    </ChartCard>
  );
}

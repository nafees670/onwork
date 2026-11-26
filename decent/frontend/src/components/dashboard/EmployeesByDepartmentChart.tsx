"use client";

import React from "react";
import { ChartCard, ProportionRow } from "./primitives";

export interface DepartmentMixItem {
  name: string;
  count: number;
}

export default function EmployeesByDepartmentChart({ data, loading }: { data: DepartmentMixItem[]; loading: boolean }) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  return (
    <ChartCard
      title="Employees by Department"
      loading={loading}
      isEmpty={data.length === 0}
      emptyMessage="No department data yet"
      skeletonHeight="h-40"
    >
      <div>
        {data.map((d, i) => (
          <ProportionRow key={i} label={d.name} count={d.count} total={total} />
        ))}
      </div>
    </ChartCard>
  );
}

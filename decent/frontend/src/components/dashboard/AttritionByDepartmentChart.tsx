"use client";

import React from "react";
import { ChartCard, ProportionRow } from "./primitives";

export interface AttritionByDeptItem {
  department: string;
  exits: number;
}

export default function AttritionByDepartmentChart({ data, loading }: { data: AttritionByDeptItem[]; loading: boolean }) {
  const total = data.reduce((acc, d) => acc + d.exits, 0);
  return (
    <ChartCard
      title="Attrition by Department"
      loading={loading}
      isEmpty={data.length === 0}
      emptyMessage="No attrition recorded"
      skeletonHeight="h-28"
    >
      <div>
        {data.map((d, i) => (
          <ProportionRow key={i} label={d.department} count={d.exits} total={total} color="#f43f5e" />
        ))}
      </div>
    </ChartCard>
  );
}

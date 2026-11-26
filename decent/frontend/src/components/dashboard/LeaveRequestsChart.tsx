"use client";

import React from "react";
import { ChartCard, DonutChart } from "./primitives";

export default function LeaveRequestsChart({
  approved,
  pending,
  rejected,
  loading,
}: {
  approved: number;
  pending: number;
  rejected: number;
  loading: boolean;
}) {
  const data = [
    { label: "Approved", value: approved, color: "#10b981" },
    { label: "Pending", value: pending, color: "#fbbf24" },
    { label: "Rejected", value: rejected, color: "#f43f5e" },
  ];
  const isEmpty = data.every((d) => d.value === 0);
  return (
    <ChartCard title="Leave Requests" loading={loading} isEmpty={isEmpty} emptyMessage="No leave requests yet">
      <DonutChart data={data} />
    </ChartCard>
  );
}

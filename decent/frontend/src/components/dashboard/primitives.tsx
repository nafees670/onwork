"use client";

import React, { useState } from "react";
import Link from "next/link";

export const BRAND = "#0A4174";

export function formatCurrency(value: number | undefined | null) {
  if (value === undefined || value === null) return "—";
  return `PKR ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ─── Simple SVG Bar Chart (single series) ─────────────────────────────────────
export function BarChart({ data }: { data: number[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const W = 220,
    H = 90;
  const max = Math.max(...data, 1);
  const barWidth = (W - 20) / data.length - 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
      {data.map((v, i) => {
        const barHeight = Math.max((v / max) * (H - 20), v > 0 ? 4 : 1);
        const x = 10 + i * ((W - 20) / data.length) + 3;
        const y = H - 10 - barHeight;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={BRAND}
              opacity={activeIndex === null ? 0.55 : activeIndex === i ? 1 : 0.2}
              className="cursor-pointer transition-opacity duration-200"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            />
            {activeIndex === i && (
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fill={BRAND} fontSize="11" fontWeight="700">
                {v}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Donut chart — ring centered on top, legend stacked below ────────────────
export function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = 42;
  const stroke = 15;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
          {total > 0 &&
            data.map((d, i) => {
              if (d.value === 0) return null;
              const frac = d.value / total;
              const dash = Math.max(frac * circumference - 2, 0);
              const gap = circumference - dash;
              const el = (
                <circle
                  key={i}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.35}
                  className="cursor-pointer transition-opacity duration-200"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              );
              offset += dash + 2;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-slate-900">{hoverIdx !== null ? data[hoverIdx].value : total}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide">{hoverIdx !== null ? data[hoverIdx].label : "Total"}</span>
        </div>
      </div>
      <div className="w-full mt-5 space-y-2">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-sm cursor-pointer px-1"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-slate-600 truncate flex-1">{d.label}</span>
            <span className="font-semibold text-slate-900 shrink-0">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Proportion Row ───────────────────────────────────────────────────────────
export function ProportionRow({ label, count, total, color = BRAND }: { label: string; count: number; total: number; color?: string }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-sm font-semibold text-slate-900">{count}</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percentage}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────
export function StatTile({
  title,
  value,
  icon: Icon,
  loading,
  color = "blue",
  sub,
  href,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  loading: boolean;
  color?: "blue" | "emerald" | "amber" | "rose" | "indigo" | "purple";
  sub?: string;
  href?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-800 group-hover:bg-blue-100 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-100 border-amber-100",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-100 border-rose-100",
    indigo: "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 border-indigo-100",
    purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-100 border-purple-100",
  };

  const content = (
    <div className="ui-card p-5 flex items-start justify-between cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group rounded-2xl bg-white border border-slate-100">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-indigo-600 transition-colors">{title}</p>
        {loading ? (
          <div className="h-7 w-16 bg-slate-100 rounded mt-2 animate-pulse" />
        ) : (
          <p className="text-2xl font-black text-slate-900 mt-1.5">{value}</p>
        )}
        {sub && <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">{sub}</p>}
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

// ─── System Status Tile ────────────────────────────────────────────────────────
export function SystemStatusTile({ active, inactive }: { active: number; inactive: number }) {
  const total = active + inactive;
  const pct = total > 0 ? (active / total) * 100 : 0;

  return (
    <div className="ui-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">System Status</p>
      <div className="flex items-center gap-4 mb-3 text-sm">
        <span className="text-slate-500">Active <span className="font-semibold text-slate-900">{active}</span></span>
        <span className="text-slate-500">Inactive <span className="font-semibold text-slate-900">{inactive}</span></span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-blue-800 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
        {/* CheckCircle2 intentionally left to caller icons to avoid a lucide import here */}
        All systems operational
      </div>
    </div>
  );
}

// ─── Shared chart-card shell: title + loading skeleton + empty state ─────────
export function ChartCard({
  title,
  icon,
  loading,
  isEmpty,
  emptyMessage,
  skeletonHeight = "h-28",
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  loading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  skeletonHeight?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ui-card p-6 sm:p-7 bg-white rounded-2xl border border-slate-100 min-h-[280px] flex flex-col">
      <div className="flex items-center gap-2 mb-5">
        {icon}
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        {loading ? (
          <div className={`${skeletonHeight} bg-slate-50 rounded-lg animate-pulse`} />
        ) : isEmpty ? (
          <p className="text-sm text-slate-400 py-8 text-center">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

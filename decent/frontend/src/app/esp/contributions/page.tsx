"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import EmployeeSelect from "@/components/EmployeeSelect";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
  Wallet, Filter, X, Users, ChevronLeft, ChevronRight, Eye,
} from "lucide-react";
import toast from "react-hot-toast";

type Contribution = {
  id: string;
  employee_id: string;
  employee_name: string;
  payslip_id: string;
  contribution_date: string;
  payroll_period_month: number;
  payroll_period_year: number;
  gross_salary_used: string;
  basic_salary_used: string;
  employee_contribution_pct_snapshot: string;
  employee_contribution_amount: string;
  employer_matching_pct_snapshot: string;
  employer_matching_amount: string;
  total_contribution: string;
  tenure_years_at_contribution: string;
  implementation_date_snapshot: string;
  enrollment_date_snapshot: string;
  date_of_joining_snapshot: string;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PAGE_SIZE = 20;

const fmt = (v?: string) => (v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function ESPContributionsPage() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [filtered, setFiltered] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [filterEmp, setFilterEmp] = useState("");
  const [filterMonth, setFilterMonth] = useState(0);
  const [filterYear, setFilterYear] = useState(0);
  const [selected, setSelected] = useState<Contribution | null>(null);
  const [page, setPage] = useState(1);

  const load = async (emp?: string, month?: number, year?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (emp) params.set("employee_id", emp);
      if (month) params.set("month", String(month));
      if (year) params.set("year", String(year));
      const qs = params.toString();
      const res = await fetchWithAuth(`/payroll/esp/contributions${qs ? `?${qs}` : ""}`);
      if (res.status === 403) return setNoAccess(true);
      if (res.ok) {
        const data = await res.json();
        setContributions(data);
        setFiltered(data);
      }
    } catch {
      toast.error("Failed to load contributions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    load(filterEmp, filterMonth, filterYear);
    setPage(1);
  }, [filterEmp, filterMonth, filterYear]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, c) => {
        acc.employee += Number(c.employee_contribution_amount || 0);
        acc.employer += Number(c.employer_matching_amount || 0);
        acc.grand += Number(c.total_contribution || 0);
        return acc;
      },
      { employee: 0, employer: 0, grand: 0 }
    );
  }, [filtered]);

  const clearFilters = () => {
    setFilterEmp("");
    setFilterMonth(0);
    setFilterYear(0);
  };

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Wallet className="text-indigo-600" size={28} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">ESP Contributions</h1>
                <p className="text-sm text-gray-500">{filtered.length} records</p>
              </div>
            </div>
          </div>

          {noAccess && <AccessDenied />}

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Employee</label>
              <div className="w-56">
                <EmployeeSelect value={filterEmp} onChange={setFilterEmp} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Month</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(Number(e.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value={0}>All</option>
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Year</label>
              <input
                type="number"
                placeholder="All"
                value={filterYear || ""}
                onChange={(e) => setFilterYear(Number(e.target.value) || 0)}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            {(filterEmp || filterMonth || filterYear) && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <X size={14} /> Clear
              </button>
            )}
          </div>

          {/* Totals */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Employee Contributions</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{fmt(String(totals.employee))}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Employer Matching</p>
              <p className="mt-1 text-xl font-bold text-indigo-700">{fmt(String(totals.employer))}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">Total ESP</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{fmt(String(totals.grand))}</p>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500">No contribution records found.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Basic Salary</th>
                    <th className="px-4 py-3">Employee %</th>
                    <th className="px-4 py-3">Employee Amt</th>
                    <th className="px-4 py-3">Employer %</th>
                    <th className="px-4 py-3">Employer Amt</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600">
                          <Users size={14} /> {c.employee_id}
                        </span>
                        <p className="text-xs text-gray-500">{c.employee_name}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {MONTHS[c.payroll_period_month - 1]} {c.payroll_period_year}
                      </td>
                      <td className="px-4 py-3 font-medium">{fmt(c.basic_salary_used)}</td>
                      <td className="px-4 py-3">{c.employee_contribution_pct_snapshot}%</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {fmt(c.employee_contribution_amount)}
                      </td>
                      <td className="px-4 py-3">{c.employer_matching_pct_snapshot}%</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {fmt(c.employer_matching_amount)}
                      </td>
                      <td className="px-4 py-3 font-bold text-indigo-700">
                        {fmt(c.total_contribution)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelected(c)}
                          title="Details"
                          className="inline-flex text-indigo-600 hover:text-indigo-800"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Detail Drawer */}
          {selected && (
            <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">Contribution Detail</h2>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <Section title="Employee">
                    <Row label="Employee ID" value={selected.employee_id} />
                    <Row label="Name" value={selected.employee_name} />
                    <Row label="Date of Joining" value={selected.date_of_joining_snapshot} />
                    <Row label="Enrollment Date" value={selected.enrollment_date_snapshot} />
                    <Row label="Salaries Completed Since ESP" value={`${Math.round(Number(selected.tenure_years_at_contribution) * 12)} (${selected.tenure_years_at_contribution} yrs)`} />
                  </Section>

                  <Section title="Period">
                    <Row
                      label="Payroll Period"
                      value={`${MONTHS[selected.payroll_period_month - 1]} ${selected.payroll_period_year}`}
                    />
                    <Row label="Contribution Date" value={selected.contribution_date} />
                    <Row label="Implementation Date" value={selected.implementation_date_snapshot} />
                  </Section>

                  <Section title="Salary">
                    <Row label="Gross Salary" value={fmt(selected.gross_salary_used)} />
                    <Row label="Basic Salary (for ESP)" value={fmt(selected.basic_salary_used)} />
                  </Section>

                  <Section title="Employee Contribution">
                    <Row label="Rate" value={`${selected.employee_contribution_pct_snapshot}%`} />
                    <Row label="Amount" value={fmt(selected.employee_contribution_amount)} bold />
                  </Section>

                  <Section title="Employer Matching">
                    <Row label="Matching Rate" value={`${selected.employer_matching_pct_snapshot}%`} />
                    <Row label="Amount" value={fmt(selected.employer_matching_amount)} bold />
                  </Section>

                  <div className="rounded-lg bg-indigo-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-indigo-800">Total Contribution</span>
                      <span className="text-lg font-bold text-indigo-700">
                        {fmt(selected.total_contribution)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1.5">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
        {value}
      </span>
    </div>
  );
}

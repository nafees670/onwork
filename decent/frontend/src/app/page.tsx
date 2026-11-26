"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import AccessDenied from "@/components/AccessDenied";
import { useAuth, resolveAdminLandingUrl } from "@/context/AuthContext";
import { fetchWithAuth } from "@/utils/api";
import { Building2, GitBranch, Users } from "lucide-react";
import {
  StatTile,
  SystemStatusTile,
  EmployeesByDepartmentChart,
  NewHiresByMonthChart,
  EmployeeStatusChart,
  WorkforceCompositionChart,
  GenderDistributionChart,
  LeaveRequestsChart,
  TurnoverRateTrendChart,
  AttritionByDepartmentChart,
  ESPContributionsCard,
  LoansSnapshotCard,
  EmployeeRequestsChart,
} from "@/components/dashboard";
import type { DepartmentMixItem } from "@/components/dashboard/EmployeesByDepartmentChart";
import type { StatusMixItem } from "@/components/dashboard/EmployeeStatusChart";
import type { EmploymentMixItem } from "@/components/dashboard/WorkforceCompositionChart";
import type { GenderMixItem } from "@/components/dashboard/GenderDistributionChart";
import type { TurnoverMonth } from "@/components/dashboard/TurnoverRateTrendChart";
import type { AttritionByDeptItem } from "@/components/dashboard/AttritionByDepartmentChart";
import type { RequestsByCategory } from "@/components/dashboard/EmployeeRequestsChart";

interface Employee {
  status?: string;
  gender?: string;
  employment_type?: string;
  department?: { dept_code?: string };
  primary_assignment?: { joining_date?: string };
}

interface DashboardAnalytics {
  pending_leave_requests: number;
  approved_leave_requests: number;
  rejected_leave_requests: number;
  total_leave_balance?: number;
  total_esp_contributions: number;
  total_esp_employer_contributions: number;
  total_esp_withdrawals_pending?: number;
  total_esp_balance: number;
  total_active_loans: number;
  total_loan_outstanding: number;
  total_monthly_loan_deductions: number;
  turnover_trend: TurnoverMonth[];
  attrition_by_department: AttritionByDeptItem[];
  pending_employee_requests: number;
  approved_employee_requests: number;
  rejected_employee_requests: number;
  requests_by_category: RequestsByCategory[];
}

// ─── Dashboard Page ────────────────────────────────────────────────────────────
// Data is fetched/derived here and handed to each chart component as typed
// props (see src/components/dashboard/) — this file only composes the page.
export default function Dashboard() {
  const { user, hydrated, activePortal, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && user) {
      if (activePortal === 'employee' || (!user.is_superadmin && (!user.roles || user.roles.length === 0))) {
        window.location.href = "/dashboard";
        return;
      }
      if (!user.is_superadmin && !hasPermission("dashboard.view")) {
        window.location.href = resolveAdminLandingUrl(user);
      }
    }
  }, [user, hydrated, activePortal, hasPermission]);

  const [stats, setStats] = useState({ employees: 0, institutions: 0, departments: 0, designations: 0, branches: 0 });
  const [deptMix, setDeptMix] = useState<DepartmentMixItem[]>([]);
  const [statusMix, setStatusMix] = useState<StatusMixItem[]>([]);
  const [genderMix, setGenderMix] = useState<GenderMixItem[]>([]);
  const [employmentMix, setEmploymentMix] = useState<EmploymentMixItem[]>([]);
  const [hireTrend, setHireTrend] = useState<{ trend: number[]; labels: string[] }>({ trend: [], labels: [] });
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (!user.is_superadmin && !hasPermission("dashboard.view")) return;
    async function loadData() {
      try {
        setLoading(true);
        const [empRes, instRes, deptRes, desigRes, branchRes, analyticsRes] = await Promise.all([
          fetchWithAuth("/employees/employees?per_page=100"),
          fetchWithAuth("/employees/institutions"),
          fetchWithAuth("/employees/departments"),
          fetchWithAuth("/employees/designations"),
          fetchWithAuth("/employees/branches"),
          fetchWithAuth("/dashboard/analytics"),
        ]);

        const employees = empRes.ok ? await empRes.json() : { employees: [] };
        const institutions = instRes.ok ? await instRes.json() : [];
        const departments = deptRes.ok ? await deptRes.json() : [];
        const designations = desigRes.ok ? await desigRes.json() : [];
        const branches = branchRes.ok ? await branchRes.json() : [];
        if (analyticsRes.ok) setAnalytics(await analyticsRes.json());

        const empArr: Employee[] = Array.isArray(employees) ? employees : employees.employees || [];
        const instArr = Array.isArray(institutions) ? institutions : institutions.institutions || [];
        const deptArr = Array.isArray(departments) ? departments : departments.departments || [];
        const desigArr = Array.isArray(designations) ? designations : designations.designations || [];
        const branchArr = Array.isArray(branches) ? branches : [];

        setStats({
          employees: Array.isArray(employees) ? employees.length : employees.total || 0,
          institutions: instArr.length,
          departments: deptArr.length,
          designations: desigArr.length,
          branches: branchArr.length,
        });

        // Employee status mix
        const statusLabels: Record<string, { label: string; color: string }> = {
          active: { label: "Active", color: "#10b981" },
          pending_approval: { label: "Pending approval", color: "#fbbf24" },
          rejected: { label: "Rejected", color: "#f43f5e" },
          suspended: { label: "Suspended", color: "#64748b" },
        };
        const statusCounts: Record<string, number> = {};
        empArr.forEach((emp) => {
          statusCounts[emp.status || "active"] = (statusCounts[emp.status || "active"] || 0) + 1;
        });
        setStatusMix(
          Object.entries(statusLabels)
            .map(([key, meta]) => ({ ...meta, count: statusCounts[key] || 0 }))
            .filter((item) => item.count > 0)
        );

        // Gender mix
        const genderLabels: Record<string, string> = { male: "Male", female: "Female" };
        const genderCounts: Record<string, number> = {};
        empArr.forEach((emp) => {
          const key = (emp.gender || "").toLowerCase();
          const label = genderLabels[key] || "Unspecified";
          genderCounts[label] = (genderCounts[label] || 0) + 1;
        });
        setGenderMix(Object.entries(genderCounts).map(([label, count]) => ({ label, count })).filter((g) => g.count > 0));

        // Employment type mix
        const employmentCounts: Record<string, number> = {};
        empArr.forEach((emp) => {
          const label = emp.employment_type || "Unspecified";
          employmentCounts[label] = (employmentCounts[label] || 0) + 1;
        });
        setEmploymentMix(Object.entries(employmentCounts).map(([label, count]) => ({ label, count })).filter((e) => e.count > 0));

        // New hires by month
        const now = new Date();
        const months: Date[] = [];
        for (let i = 11; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
        const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const trend = months.map((m) =>
          empArr.filter((emp) => {
            const jd = emp.primary_assignment?.joining_date;
            if (!jd) return false;
            const d = new Date(jd);
            return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
          }).length
        );
        setHireTrend({ trend, labels: months.map((m) => monthShort[m.getMonth()]) });

        // Department mix
        if (deptArr.length > 0) {
          const deptNameByCode: Record<string, string> = {};
          deptArr.forEach((d: { dept_code: string; dept_name?: string }) => {
            deptNameByCode[d.dept_code] = d.dept_name || d.dept_code;
          });

          const counts: Record<string, number> = {};
          empArr.forEach((emp) => {
            const code = emp.department?.dept_code;
            if (code && deptNameByCode[code]) counts[code] = (counts[code] || 0) + 1;
            else counts["UNASSIGNED"] = (counts["UNASSIGNED"] || 0) + 1;
          });

          const mix = Object.entries(counts)
            .map(([code, count]) => ({ name: code === "UNASSIGNED" ? "Unassigned" : deptNameByCode[code], count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);
          setDeptMix(mix);
        } else {
          setDeptMix([]);
        }
      } catch (err) {
        console.error("Failed to load dashboard stats", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const isSuperadmin = !!user?.is_superadmin;

  if (hydrated && user && !isSuperadmin && !hasPermission("dashboard.view")) {
    return (
      <ProtectedLayout>
        <AccessDenied permission="dashboard.view" />
      </ProtectedLayout>
    );
  }

  const activeEmployees = statusMix.find((s) => s.label === "Active")?.count || 0;
  const canViewEmployees = isSuperadmin || hasPermission("employee.view");
  const canViewInstitutions = isSuperadmin || hasPermission("institution.view");
  const canViewBranches = isSuperadmin || hasPermission("branch.view");
  const canViewLeaves = isSuperadmin || hasPermission("payroll.leave.view");
  const canViewRequests = isSuperadmin || hasPermission("employee_request.view") || hasPermission("employee_request.review");
  const canViewTurnover = isSuperadmin || hasPermission("payroll.salary.view");
  const canViewESP = isSuperadmin || hasPermission("payroll.esp.contribution") || hasPermission("payroll.esp.settings");
  const canViewLoans = isSuperadmin || hasPermission("payroll.loan.view");

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">Real-time insights across your organization.</p>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {canViewInstitutions && (
            <StatTile title="Total Institutions" value={stats.institutions} icon={Building2} loading={loading} color="blue" />
          )}
          {canViewBranches && (
            <StatTile title="Total Branches" value={stats.branches} icon={GitBranch} loading={loading} color="amber" />
          )}
          {canViewEmployees && (
            <>
              <StatTile title="Total Employees" value={stats.employees} icon={Users} loading={loading} color="emerald" />
              <SystemStatusTile active={activeEmployees} inactive={Math.max(stats.employees - activeEmployees, 0)} />
            </>
          )}
        </div>

        {/* Workforce: department / hires / status */}
        {canViewEmployees && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <EmployeesByDepartmentChart data={deptMix} loading={loading} />
              <NewHiresByMonthChart trend={hireTrend.trend} labels={hireTrend.labels} loading={loading} />
              <EmployeeStatusChart data={statusMix} loading={loading} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <WorkforceCompositionChart data={employmentMix} loading={loading} />
              <GenderDistributionChart data={genderMix} loading={loading} />
              {canViewLeaves ? (
                <LeaveRequestsChart
                  approved={analytics?.approved_leave_requests || 0}
                  pending={analytics?.pending_leave_requests || 0}
                  rejected={analytics?.rejected_leave_requests || 0}
                  loading={loading || !analytics}
                />
              ) : (
                <div className="ui-card p-6 flex flex-col items-center justify-center text-center text-slate-400">
                  <Users size={32} className="text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-600">Workforce Analytics</p>
                  <p className="text-xs text-slate-400 mt-1">Personnel metrics and distribution</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Turnover */}
        {canViewTurnover && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TurnoverRateTrendChart data={analytics?.turnover_trend || []} loading={loading || !analytics} />
            <AttritionByDepartmentChart data={analytics?.attrition_by_department || []} loading={loading || !analytics} />
          </div>
        )}

        {/* Financial, payroll & requests snapshots */}
        {(canViewESP || canViewLoans || canViewRequests) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {canViewESP && (
              <ESPContributionsCard
                employeeContribution={analytics?.total_esp_contributions || 0}
                employerContribution={analytics?.total_esp_employer_contributions || 0}
                balance={analytics?.total_esp_balance || 0}
                loading={loading || !analytics}
              />
            )}
            {canViewLoans && (
              <LoansSnapshotCard
                activeLoans={analytics?.total_active_loans || 0}
                outstanding={analytics?.total_loan_outstanding || 0}
                monthlyDeductions={analytics?.total_monthly_loan_deductions || 0}
                loading={loading || !analytics}
              />
            )}
            {canViewRequests && (
              <EmployeeRequestsChart
                pending={analytics?.pending_employee_requests || 0}
                approved={analytics?.approved_employee_requests || 0}
                rejected={analytics?.rejected_employee_requests || 0}
                byCategory={analytics?.requests_by_category || []}
                loading={loading || !analytics}
              />
            )}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import AccountStatusBanner from "@/components/AccountStatusBanner";
import { useEmployeeSelf, formatDate } from "@/hooks/useEmployeeSelf";
import { useAuth, resolveAdminLandingUrl } from "@/context/AuthContext";
import { fetchWithAuth } from "@/utils/api";
import {
  ShieldCheck, Building2, Briefcase, Calendar, GitBranch, Layers, Clock3,
  FileText, CalendarDays, PiggyBank, HandCoins, FileBadge2, ArrowRight,
  User, FileBadge, Wallet,
} from "lucide-react";

interface PayslipData {
  id: string;
  month: number;
  year: number;
  net_pay: number;
  status: string;
}

interface LeaveBalanceItem {
  leave_type: string;
  available: number;
  eligible: boolean;
}

interface ESPBalanceData {
  current_balance: number;
}

interface LoanItem {
  id: string;
  status: string;
  total_remaining: number;
}

interface PolicyItem {
  id: string;
  title: string;
  file_type: string;
}

const monthNames = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function formatCurrency(value: number | undefined | null) {
  if (value === undefined || value === null) return "—";
  return `PKR ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function DashboardOverviewPage() {
  const { user, employee, loading, isPending, isRejected, isSuspended, isActive } = useEmployeeSelf();
  const { activePortal } = useAuth();

  useEffect(() => {
    if (activePortal === 'admin' || user?.is_superadmin) {
      window.location.href = user ? resolveAdminLandingUrl(user) : '/';
    }
  }, [activePortal, user]);

  const [latestPayslip, setLatestPayslip] = useState<PayslipData | null>(null);
  const [payslipsLoading, setPayslipsLoading] = useState(true);

  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceItem[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(true);

  const [espBalance, setEspBalance] = useState<ESPBalanceData | null>(null);
  const [espLoading, setEspLoading] = useState(true);

  const [activeLoan, setActiveLoan] = useState<LoanItem | null>(null);
  const [loansLoading, setLoansLoading] = useState(true);

  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);

  const [toggles, setToggles] = useState({ allow_loan_requests: true, allow_esp_withdrawal_requests: true });

  useEffect(() => {
    fetchWithAuth("/payroll/system-toggles")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setToggles(data); })
      .catch(() => {});

    fetchWithAuth("/payroll/payslip/my")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PayslipData[]) => setLatestPayslip(Array.isArray(data) && data.length > 0 ? data[0] : null))
      .catch(() => {})
      .finally(() => setPayslipsLoading(false));


    fetchWithAuth("/payroll/leave/my-balance")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LeaveBalanceItem[]) => setLeaveBalance(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLeaveLoading(false));

    fetchWithAuth("/payroll/esp/my-balance")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ESPBalanceData | null) => setEspBalance(data))
      .catch(() => {})
      .finally(() => setEspLoading(false));

    fetchWithAuth("/payroll/loans/my-loans")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LoanItem[]) => setActiveLoan(Array.isArray(data) ? data.find((l) => l.status === "active") || null : null))
      .catch(() => {})
      .finally(() => setLoansLoading(false));

    fetchWithAuth("/hr-policy/policies")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PolicyItem[]) => setPolicies(Array.isArray(data) ? data.slice(0, 3) : []))
      .catch(() => {})
      .finally(() => setPoliciesLoading(false));
  }, []);

  const joiningDate =
    employee?.assignments?.find((a) => a.is_primary)?.joining_date ||
    employee?.assignments?.[0]?.joining_date;
  const primaryAssignment = employee?.assignments?.find((a) => a.is_primary) || employee?.assignments?.[0];

  const statCards = [
    {
      label: "Account Status",
      value: isPending ? "Pending" : isRejected ? "Rejected" : isSuspended ? "Suspended" : "Active",
      icon: ShieldCheck,
      color: isActive ? "bg-emerald-50 text-emerald-600" : isPending ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600",
      iconBg: isActive ? "bg-emerald-100" : isPending ? "bg-amber-100" : "bg-red-100",
    },
    {
      label: "Department",
      value: employee?.department || user?.department || "—",
      icon: Building2,
      color: "bg-blue-50 text-blue-600",
      iconBg: "bg-blue-100",
    },
    {
      label: "Designation",
      value: employee?.designation || user?.designation || "—",
      icon: Briefcase,
      color: "bg-purple-50 text-purple-600",
      iconBg: "bg-purple-100",
    },
    {
      label: "Joining Date",
      value: joiningDate ? formatDate(joiningDate) : "—",
      icon: Calendar,
      color: "bg-indigo-50 text-indigo-600",
      iconBg: "bg-indigo-100",
    },
  ];

  const quickActions = [
    { icon: User, label: "My Profile", href: "/my-profile", color: "text-purple-600 bg-purple-50" },
    { icon: FileText, label: "My Payslips", href: "/my-payslips", color: "text-emerald-600 bg-emerald-50" },
    { icon: FileBadge2, label: "HR Policies", href: "/hr-policies", color: "text-amber-600 bg-amber-50" },
  ];

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
        <AccountStatusBanner isPending={isPending} isRejected={isRejected} isSuspended={isSuspended} />

        <div>
          <h1 className="page-title">Welcome, {user?.full_name || "Employee"}</h1>
          <p className="page-subtitle">
            Employee ID: <span className="font-semibold text-slate-700">{employee?.employee_id || user?.employee_id || user?.code || "—"}</span>
          </p>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="ui-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <card.icon size={18} className={card.color.split(" ")[1]} />
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{card.label}</p>
              <p className="text-base font-bold text-slate-900 mt-1 truncate">{loading ? "Loading..." : card.value}</p>
            </div>
          ))}
        </div>

        {/* At a glance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* My Placement summary */}
          <div className="ui-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Briefcase size={16} className="text-theme-800" /> My Placement
              </h2>
              <Link href="/my-profile" className="text-xs font-medium text-theme-800 hover:underline flex items-center gap-1">
                Details <ArrowRight size={12} />
              </Link>
            </div>
            {loading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : primaryAssignment ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Building2 size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate">{primaryAssignment.institution || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <GitBranch size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate">{primaryAssignment.branch_name || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Layers size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate">{primaryAssignment.department || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Clock3 size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate capitalize">{primaryAssignment.shift || "—"}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No placement on record yet.</p>
            )}
          </div>

          {/* Latest Payslip */}
          <div className="ui-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FileText size={16} className="text-theme-800" /> Latest Payslip
              </h2>
              <Link href="/my-payslips" className="text-xs font-medium text-theme-800 hover:underline flex items-center gap-1">
                View All <ArrowRight size={12} />
              </Link>
            </div>
            {payslipsLoading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : latestPayslip ? (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                  {monthNames[latestPayslip.month]} {latestPayslip.year}
                </p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(latestPayslip.net_pay)}</p>
                <span className={`inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  latestPayslip.status === "paid" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-800"
                }`}>
                  {latestPayslip.status.charAt(0).toUpperCase() + latestPayslip.status.slice(1)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No payslips available yet.</p>
            )}
          </div>

          {/* Leave Balance */}
          <div className="ui-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CalendarDays size={16} className="text-theme-800" /> Leave Balance
              </h2>
              <Link href="/my-payslips" className="text-xs font-medium text-theme-800 hover:underline flex items-center gap-1">
                Apply <ArrowRight size={12} />
              </Link>
            </div>
            {leaveLoading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : leaveBalance.length > 0 ? (
              <div className="space-y-2">
                {leaveBalance.slice(0, 3).map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate">{b.leave_type}</span>
                    <span className="font-semibold text-slate-900 shrink-0 ml-2">{Number(b.available).toFixed(1)} days</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No leave balance available.</p>
            )}
          </div>
        </div>

        {/* ESP & Loans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="ui-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <PiggyBank size={16} className="text-theme-800" /> ESP Balance
              </h2>
              <Link href="/my-payslips#esp" className="text-xs font-medium text-theme-800 hover:underline flex items-center gap-1">
                Details <ArrowRight size={12} />
              </Link>
            </div>
            {espLoading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : espBalance ? (
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(espBalance.current_balance)}</p>
            ) : (
              <p className="text-sm text-slate-400">No ESP balance available.</p>
            )}
          </div>

          <div className="ui-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <HandCoins size={16} className="text-theme-800" /> Active Loan
              </h2>
              <Link href="/my-payslips" className="text-xs font-medium text-theme-800 hover:underline flex items-center gap-1">
                Details <ArrowRight size={12} />
              </Link>
            </div>
            {loansLoading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : activeLoan ? (
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(activeLoan.total_remaining)} <span className="text-sm font-medium text-slate-400">remaining</span></p>
            ) : (
              <p className="text-sm text-slate-400">No active loans.</p>
            )}
          </div>
        </div>

        {/* HR Policies */}
        <div className="ui-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FileBadge size={16} className="text-theme-800" /> HR Policies
            </h2>
            <Link href="/hr-policies" className="text-xs font-medium text-theme-800 hover:underline flex items-center gap-1">
              View All <ArrowRight size={12} />
            </Link>
          </div>
          {policiesLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : policies.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {policies.map((p) => (
                <Link
                  key={p.id}
                  href={`/hr-policies/${p.id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <FileText size={15} className="text-blue-800 shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{p.title}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No HR policies published yet.</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="ui-card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickActions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex flex-col items-center text-center gap-2 p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${a.color}`}>
                  <a.icon size={20} />
                </div>
                <p className="text-xs font-semibold text-slate-700">{a.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}

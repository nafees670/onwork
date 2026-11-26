"use client";

import React, { useState } from "react";
import { useAuth, resolveAdminLandingUrl } from "@/context/AuthContext";
import {
  Users,
  User,
  LayoutDashboard,
  LogOut,
  Building2,
  Menu,
  X,
  LayoutGrid,
  Briefcase,
  ChevronRight,
  GitBranch,
  ShieldCheck,
  CalendarCheck2,
  Wallet,
  FileText,
  FileBadge2,
  Settings,
  UserPlus,
  ArrowDownToLine,
  HandCoins,
  CalendarDays,
  UsersRound,
  MessageSquare,
  ArrowRightLeft,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchWithAuth } from "@/utils/api";

type NavLink = {
  name: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  href: string;
};

type WorkspacePolicy = {
  id: string;
  title: string;
};

function isChildActive(pathname: string, href: string) {
  const clean = href.split("?")[0].split("#")[0];
  return pathname === clean || pathname.startsWith(clean + "/");
}

function NavItem({
  link,
  onNavigate,
  hasPulse,
  onPulseDismiss,
}: {
  link: NavLink;
  onNavigate: () => void;
  hasPulse?: boolean;
  onPulseDismiss?: () => void;
}) {
  const pathname = usePathname();
  const Icon = link.icon;
  const isActive =
    link.href === "/dashboard" ? pathname === "/dashboard" : isChildActive(pathname, link.href);

  return (
    <Link
      href={link.href}
      onClick={() => {
        if (onPulseDismiss) onPulseDismiss();
        onNavigate();
      }}
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? "bg-blue-50 text-blue-800 border-r-4 border-blue-800"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
        <span>{link.name}</span>
      </div>
      {hasPulse && (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
      )}
    </Link>
  );
}

function NavGroup({
  label,
  icon: Icon,
  links,
  onNavigate,
  hasPulse,
  onPulseDismiss,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  links: NavLink[];
  onNavigate: () => void;
  hasPulse?: boolean;
  onPulseDismiss?: () => void;
}) {
  const pathname = usePathname();
  const hasActiveChild = links.some((l) => isChildActive(pathname, l.href));
  const [open, setOpen] = useState(hasActiveChild);

  React.useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (onPulseDismiss) onPulseDismiss();
          setOpen((o) => !o);
        }}
        className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          hasActiveChild ? "text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon size={18} strokeWidth={2} />
          {label}
        </span>
        <div className="flex items-center gap-2">
          {hasPulse && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          )}
          <ChevronRight
            size={15}
            className={`transition-transform duration-200 text-slate-400 ${open ? "rotate-90" : ""}`}
          />
        </div>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 pl-12">
          {links.map((link) => {
            const isActive = isChildActive(pathname, link.href);
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => {
                  if (onPulseDismiss) onPulseDismiss();
                  onNavigate();
                }}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "text-blue-800 font-semibold bg-blue-50"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, isAuthenticated, activePortal, switchPortal, hasPermission } = useAuth();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [workspacePolicies, setWorkspacePolicies] = useState<WorkspacePolicy[]>([]);
  const [pulseState, setPulseState] = useState<{ employees: boolean; payroll: boolean; esp: boolean }>({
    employees: false,
    payroll: false,
    esp: false,
  });
  const pathname = usePathname();
  const closeSidebar = () => setSidebarOpen(false);
  const isSuperadmin = !!user?.is_superadmin;
  const activeCustomRoles = (user?.roles || []).filter((r: any) => !r.is_default && r.name !== 'Employee Baseline');
  const hasDualAccess = !isSuperadmin && activeCustomRoles.length > 0;
  const primaryRoleName = activeCustomRoles[0]?.name ? `${activeCustomRoles[0].name} Portal` : "Role Portal";

  React.useEffect(() => {
    if (!isAuthenticated || isSuperadmin) return;

    let cancelled = false;
    fetchWithAuth("/hr-policy/policies")
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const policies = (await response.json()) as WorkspacePolicy[];
        if (!cancelled) setWorkspacePolicies(policies.slice(0, 4));
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isSuperadmin]);

  React.useEffect(() => {
    if (!isAuthenticated || !isSuperadmin) return;

    let cancelled = false;
    async function checkPulses() {
      try {
        const [pendingEmpRes, unassignedEmpRes, dashRes] = await Promise.all([
          fetchWithAuth("/employees/employees?per_page=1&status=pending"),
          fetchWithAuth("/employees/employees?per_page=1&status=unassigned"),
          fetchWithAuth("/dashboard/analytics"),
        ]);

        if (cancelled) return;

        const pendingEmpData = pendingEmpRes.ok ? await pendingEmpRes.json() : null;
        const unassignedEmpData = unassignedEmpRes.ok ? await unassignedEmpRes.json() : null;
        const dashData = dashRes.ok ? await dashRes.json() : null;

        const empPendingCount = (pendingEmpData?.total ?? 0) + (unassignedEmpData?.total ?? 0);
        const payrollPendingCount = (dashData?.pending_leave_requests ?? 0) + (dashData?.pending_employee_requests ?? 0);
        const espPendingCount = Math.round(Number(dashData?.total_esp_withdrawals_pending ?? 0));

        const seenEmp = parseInt(localStorage.getItem("seen_emp_pulse_count") || "0", 10);
        const seenPayroll = parseInt(localStorage.getItem("seen_payroll_pulse_count") || "0", 10);
        const seenEsp = parseInt(localStorage.getItem("seen_esp_pulse_count") || "0", 10);

        setPulseState({
          employees: empPendingCount > 0 && empPendingCount > seenEmp,
          payroll: payrollPendingCount > 0 && payrollPendingCount > seenPayroll,
          esp: espPendingCount > 0 && espPendingCount > seenEsp,
        });

        if (pathname.startsWith("/employees")) {
          localStorage.setItem("seen_emp_pulse_count", String(empPendingCount));
          setPulseState((prev) => ({ ...prev, employees: false }));
        }
        if (pathname.startsWith("/payroll")) {
          localStorage.setItem("seen_payroll_pulse_count", String(payrollPendingCount));
          setPulseState((prev) => ({ ...prev, payroll: false }));
        }
        if (pathname.startsWith("/esp")) {
          localStorage.setItem("seen_esp_pulse_count", String(espPendingCount));
          setPulseState((prev) => ({ ...prev, esp: false }));
        }
      } catch (err) {
        console.error("Failed checking pulse counts", err);
      }
    }

    checkPulses();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isSuperadmin, pathname]);

  const dismissPulse = (key: "employees" | "payroll" | "esp") => {
    if (typeof window !== "undefined") {
      if (key === "employees") localStorage.setItem("seen_emp_pulse_count", "999999");
      if (key === "payroll") localStorage.setItem("seen_payroll_pulse_count", "999999");
      if (key === "esp") localStorage.setItem("seen_esp_pulse_count", "999999");
    }
    setPulseState((prev) => ({ ...prev, [key]: false }));
  };

  if (!isAuthenticated) return null;

  const myWorkspaceLinks: NavLink[] = [
    { name: "Overview", icon: LayoutDashboard, href: "/dashboard" },
    { name: "My Profile", icon: User, href: "/my-profile" },
    { name: "My Payslips", icon: FileText, href: "/my-payslips" },
    { name: "My Requests", icon: MessageSquare, href: "/requests" },
  ];

  const policyLinks: NavLink[] = [
    ...workspacePolicies.map((policy) => ({
      name: policy.title,
      icon: FileBadge2,
      href: `/hr-policies/${policy.id}`,
    })),
  ];

  const organizationLinks: NavLink[] = [
    { name: "Institutions", icon: Building2, href: "/institutions", perm: "institution.view" },
    { name: "Branches", icon: GitBranch, href: "/branches", perm: "branch.view" },
    { name: "Departments", icon: LayoutGrid, href: "/departments", perm: "department.view" },
    { name: "Designations", icon: Briefcase, href: "/designations", perm: "designation.view" },
  ].filter((l) => isSuperadmin || hasPermission(l.perm));

  const payrollLinks: NavLink[] = [
    { name: "Salary", icon: Wallet, href: "/payroll/salary", perm: "payroll.salary.view" },
    { name: "Attendance", icon: CalendarCheck2, href: "/payroll/attendance", perm: "payroll.attendance.view" },
    { name: "Payslip", icon: FileText, href: "/payroll/payslip", perm: "payroll.payslip.view" },
    { name: "Loans", icon: HandCoins, href: "/payroll/loans", perm: "payroll.loan.view" },
    { name: "Leaves", icon: CalendarDays, href: "/payroll/leaves", perm: "payroll.leave.view" },
    { name: "Leave Settings", icon: Settings, href: "/payroll/leaves/settings", perm: "payroll.leave.approve" },
  ].filter((l) => isSuperadmin || hasPermission(l.perm));

  const espLinks: NavLink[] = [
    { name: "ESP Settings", icon: Settings, href: "/esp/settings", perm: "payroll.esp.settings" },
    { name: "Enrollments", icon: UserPlus, href: "/esp/enrollments", perm: "payroll.esp.enrollment" },
    { name: "Contributions", icon: Wallet, href: "/esp/contributions", perm: "payroll.esp.contribution" },
    { name: "Withdrawals", icon: ArrowDownToLine, href: "/esp/withdrawals", perm: "payroll.esp.withdrawal" },
  ].filter((l) => isSuperadmin || hasPermission(l.perm));

  const initials =
    user?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Sidebar Backdrop (mobile) */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-gray-900/40 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 lg:translate-x-0 lg:static ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-gray-100 shrink-0">
          <Link href={activePortal === 'admin' ? (user ? resolveAdminLandingUrl(user) : '/') : '/dashboard'} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden bg-slate-50">
              <img src="/logo.png" alt="HRMS logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="font-bold text-gray-900 text-sm tracking-tight block leading-none">
                HRMS
              </span>
              <span className="text-[10px] text-blue-700 font-semibold tracking-wide">
                {activePortal === 'admin' ? (isSuperadmin ? 'Admin Portal' : primaryRoleName) : 'Employee Portal'}
              </span>
            </div>
          </Link>
          <button
            className="lg:hidden text-slate-400 hover:text-slate-700"
            onClick={closeSidebar}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto no-scrollbar">
          {activePortal === 'admin' ? (
            <>
              {(isSuperadmin || hasPermission("dashboard.view")) && (
                <NavItem link={{ name: "Dashboard", icon: LayoutDashboard, href: "/" }} onNavigate={closeSidebar} />
              )}
              {organizationLinks.length > 0 && (
                <NavGroup label="Organization" icon={Building2} links={organizationLinks} onNavigate={closeSidebar} />
              )}
              {(isSuperadmin || hasPermission("employee.view")) && (
                <NavItem link={{ name: "Employees", icon: Users, href: "/employees" }} onNavigate={closeSidebar} hasPulse={pulseState.employees} onPulseDismiss={() => dismissPulse("employees")} />
              )}
              {payrollLinks.length > 0 && (
                <NavGroup label="Payroll" icon={Wallet} links={payrollLinks} onNavigate={closeSidebar} hasPulse={pulseState.payroll} onPulseDismiss={() => dismissPulse("payroll")} />
              )}
              {espLinks.length > 0 && (
                <NavGroup label="ESP" icon={UsersRound} links={espLinks} onNavigate={closeSidebar} hasPulse={pulseState.esp} onPulseDismiss={() => dismissPulse("esp")} />
              )}
              {(isSuperadmin || hasPermission("employee_request.view") || hasPermission("employee_request.review")) && (
                <NavItem link={{ name: "Employee Requests", icon: MessageSquare, href: "/requests" }} onNavigate={closeSidebar} />
              )}
              {(isSuperadmin || hasPermission("hr_policy.manage")) && (
                <NavItem link={{ name: "HR Policies", icon: FileBadge2, href: "/hr-policies" }} onNavigate={closeSidebar} />
              )}
              {(isSuperadmin || hasPermission("role.view") || hasPermission("role.manage")) && (
                <NavItem link={{ name: "Auth Roles", icon: ShieldCheck, href: "/service" }} onNavigate={closeSidebar} />
              )}
            </>
          ) : (
            <>
              <NavGroup label="My Workspace" icon={LayoutDashboard} links={myWorkspaceLinks} onNavigate={closeSidebar} />
              <NavGroup label="HR Policies" icon={FileBadge2} links={policyLinks} onNavigate={closeSidebar} />
            </>
          )}
        </nav>

        {/* Workspace Switcher Button for Dual Access Users */}
        {hasDualAccess && (
          <div className="px-3 pt-2 pb-1 border-t border-gray-100">
            {activePortal === 'admin' ? (
              <button
                type="button"
                onClick={() => switchPortal('employee')}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200/80 hover:border-blue-200 text-xs font-semibold text-slate-700 hover:text-blue-800 transition-all cursor-pointer group"
                title="Switch to employee self-service workspace"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Briefcase size={14} className="text-slate-400 group-hover:text-blue-600 shrink-0" />
                  <span className="truncate">Employee Workspace</span>
                </div>
                <ArrowRightLeft size={12} className="text-slate-400 group-hover:text-blue-600 shrink-0 ml-1" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchPortal('admin')}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50/80 hover:bg-blue-100 border border-blue-200 text-xs font-semibold text-blue-900 transition-all cursor-pointer group"
                title="Switch to administrative role workspace"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck size={14} className="text-blue-700 shrink-0" />
                  <span className="truncate">{primaryRoleName}</span>
                </div>
                <ArrowRightLeft size={12} className="text-blue-600 shrink-0 ml-1" />
              </button>
            )}
          </div>
        )}

        {/* User block + Sign out — pinned at bottom */}
        <div className="shrink-0 border-t border-gray-100 p-3 mt-auto">
          <Link
            href="/profile"
            onClick={closeSidebar}
            className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 transition-colors"
          >
            <div className="w-9 h-9 bg-blue-800 text-white flex items-center justify-center rounded-full text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
                {user?.full_name || "User"}
              </p>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {user?.email || user?.designation || "Admin"}
              </p>
            </div>
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-2 py-2 mt-1 w-full rounded-lg text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Area ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar — the one exception to "no top bar" */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center px-4 shrink-0 lg:hidden">
          <button
            className="text-slate-500 hover:text-slate-700"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>
          <span className="ml-3 font-bold text-gray-900 text-sm">HRMS</span>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

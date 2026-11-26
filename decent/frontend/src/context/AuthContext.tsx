"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export interface UserRole {
  id: string;
  name: string;
  description?: string;
}

export interface User {
  id: string;
  code: string;
  full_name: string;
  email: string;
  is_superadmin: boolean;
  status?: string;
  employee_id?: string;
  department?: string;
  designation?: string;
  roles?: UserRole[];
  permissions?: string[];
}

export type PortalMode = 'employee' | 'admin';

interface AuthContextType {
  user: User | null;
  login: (token: string, userData: User, chosenPortal?: PortalMode) => void;
  logout: () => void;
  isAuthenticated: boolean;
  hydrated: boolean;
  activePortal: PortalMode;
  switchPortal: (portal: PortalMode) => void;
  hasPermission: (codename: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/verify-otp'];

export function resolveAdminLandingUrl(user: User): string {
  if (user.is_superadmin) return "/";
  const perms = user.permissions || [];
  if (perms.includes("*") || perms.includes("dashboard.view")) return "/";
  if (perms.includes("employee.view")) return "/employees";
  if (
    perms.some((p) =>
      p.startsWith("institution.") ||
      p.startsWith("branch.") ||
      p.startsWith("department.") ||
      p.startsWith("designation.") ||
      p.startsWith("organization.")
    )
  ) {
    return "/institutions";
  }
  if (
    perms.some((p) =>
      p.startsWith("payroll.salary.") ||
      p.startsWith("payroll.attendance.") ||
      p.startsWith("payroll.payslip.") ||
      p.startsWith("payroll.loan.") ||
      p.startsWith("payroll.leave.")
    )
  ) {
    if (perms.includes("payroll.salary.view")) return "/payroll/salary";
    if (perms.includes("payroll.attendance.view")) return "/payroll/attendance";
    if (perms.includes("payroll.payslip.view")) return "/payroll/payslip";
    if (perms.includes("payroll.loan.view")) return "/payroll/loans";
    if (perms.includes("payroll.leave.view")) return "/payroll/leaves";
    return "/payroll/attendance";
  }
  if (perms.some((p) => p.startsWith("payroll.esp."))) {
    if (perms.includes("payroll.esp.contribution")) return "/esp/contributions";
    if (perms.includes("payroll.esp.enrollment")) return "/esp/enrollments";
    if (perms.includes("payroll.esp.withdrawal")) return "/esp/withdrawals";
    if (perms.includes("payroll.esp.settings")) return "/esp/settings";
    return "/esp/contributions";
  }
  if (perms.includes("employee_request.view") || perms.includes("employee_request.review")) return "/requests";
  if (perms.includes("hr_policy.manage")) return "/hr-policies";
  if (perms.includes("role.view") || perms.includes("role.manage")) return "/service";
  return "/dashboard";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [activePortal, setActivePortal] = useState<PortalMode>('employee');
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user');
    const storedPortal = localStorage.getItem('active_portal') as PortalMode | null;

    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as User;
        setUser(parsedUser);

        const customRoles = (parsedUser.roles || []).filter((r: any) => !r.is_default && r.name !== 'Employee Baseline');
        if (parsedUser.is_superadmin) {
          setActivePortal('admin');
        } else if (storedPortal === 'admin' || storedPortal === 'employee') {
          setActivePortal(storedPortal === 'admin' && customRoles.length === 0 ? 'employee' : storedPortal);
        } else if (customRoles.length > 0) {
          setActivePortal('admin');
        } else {
          setActivePortal('employee');
        }
      } catch (err) {
        console.error("Failed to parse user from localStorage", err);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      if (!PUBLIC_PATHS.includes(pathname)) window.location.href = '/login';
      return;
    }
  }, [hydrated, user, pathname]);

  const login = (token: string, userData: User, chosenPortal?: PortalMode) => {
    const customRoles = (userData.roles || []).filter((r: any) => !r.is_default && r.name !== 'Employee Baseline');
    const portal = userData.is_superadmin
      ? 'admin'
      : (chosenPortal || (customRoles.length > 0 ? 'admin' : 'employee'));
    localStorage.setItem('access_token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('active_portal', portal);
    setUser(userData);
    setActivePortal(portal);
    window.location.href = portal === 'admin' ? resolveAdminLandingUrl(userData) : '/dashboard';
  };

  const switchPortal = (portal: PortalMode) => {
    if (user?.is_superadmin) return;
    localStorage.setItem('active_portal', portal);
    setActivePortal(portal);
    window.location.href = portal === 'admin' ? (user ? resolveAdminLandingUrl(user) : '/') : '/dashboard';
  };

  const hasPermission = (codename: string): boolean => {
    if (!user) return false;
    if (user.is_superadmin) return true;
    if (activePortal !== 'admin') return false;
    if (!user.permissions) return false;
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(codename);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('active_portal');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        hydrated,
        activePortal,
        switchPortal,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

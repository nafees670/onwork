"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/utils/api";
import toast from "react-hot-toast";
import {
  Lock, User, Eye, EyeOff, Loader2,
  Users, Building2, LayoutGrid, ArrowRight, X,
  ShieldCheck, Briefcase, ChevronRight, Sparkles,
} from "lucide-react";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingLoginData, setPendingLoginData] = useState<{ token: string; user: any } | null>(null);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const [showRegistration, setShowRegistration] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    { title: "Institution Management", desc: "Manage every institution and branch from one unified, multi-branch structure.", icon: Building2, tone: "text-blue-500 bg-blue-50 border-blue-100" },
    { title: "Department Management", desc: "Keep departments structured and organized across your whole organization.", icon: LayoutGrid, tone: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    { title: "Employee Management", desc: "Handle the full employee lifecycle, designations, assignments, and access.", icon: Users, tone: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  ];

  useEffect(() => {
    const onRegistrationComplete = (event: MessageEvent) => {
      if (event.origin === window.location.origin && ["employee-created", "show-login"].includes(event.data?.type)) {
        setShowRegistration(false);
      }
    };
    window.addEventListener("message", onRegistrationComplete);
    return () => window.removeEventListener("message", onRegistrationComplete);
  }, []);

  useEffect(() => {
    if (showRegistration) return;
    const interval = window.setInterval(() => setCurrentSlide((slide) => (slide + 1) % slides.length), 5000);
    return () => window.clearInterval(interval);
  }, [showRegistration, slides.length]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: identifier.trim(), password }),
        }
      );
      const data = await response.json();
      if (response.ok) {
        if (data.must_change_password && data.reset_token) {
          sessionStorage.setItem("password_reset_token", data.reset_token);
          router.push("/verify-otp");
        } else if (data.otp_required && data.challenge_token && !data.access_token) {
          sessionStorage.setItem("otp_challenge_token", data.challenge_token);
          router.push("/verify-otp");
        } else {
          const customRoles = (data.employee?.roles || []).filter((r: any) => !r.is_default && r.name !== 'Employee Baseline');
          if (!data.employee?.is_superadmin && customRoles.length > 0) {
            setPendingLoginData({ token: data.access_token, user: data.employee });
            setShowRoleSelector(true);
          } else {
            login(data.access_token, data.employee);
          }
        }
      } else {
        toast.error(data.detail || data.error || "Invalid credentials");
      }
    } catch {
      toast.error("Unable to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white antialiased overflow-hidden">
      <div className="w-full lg:min-h-screen lg:flex bg-white overflow-hidden">

        {/* ═══ LEFT — branding ═══ */}
        <div className="hidden lg:flex lg:flex-1 bg-[#fcfdfe] p-12 relative overflow-hidden flex-col">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md overflow-hidden bg-white">
              <img src="/logo.png" alt="HRMS logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-2xl font-extrabold text-theme-900 tracking-tight">HRMS</span>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2 ml-1">Human Resource Management System</span>

          {showRegistration ? (
            <div className="absolute inset-0 top-24 bg-white/95 z-20 p-6 xl:p-10">
              <button type="button" onClick={() => setShowRegistration(false)} className="inline-flex items-center gap-2 text-sm font-semibold text-theme-800 hover:text-theme-900">
                <X size={16} /> Back to illustration
              </button>
              <iframe
                title="Create employee"
                src="/register?embedded=1"
                className="mt-3 h-[calc(100%-2.5rem)] w-full rounded-2xl border border-slate-200 bg-white"
              />
            </div>
          ) : (
            <>
              <div className="flex-1 flex items-center justify-center relative -mt-12">
                <img src="/login-page.png" alt="Employee management illustration" className="w-[65%] h-auto object-contain z-10 -mt-8" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-slate-100 rounded-full blur-3xl opacity-50" />
              </div>
              <div className="mt-auto mb-10 relative h-20">
                {slides.map(({ title, desc, icon: Icon, tone }, index) => (
                  <div key={title} className={`absolute inset-0 flex items-center gap-4 transition-all duration-700 ${index === currentSlide ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border shrink-0 ${tone}`}><Icon className="w-6 h-6" /></div>
                    <div><span className="text-lg font-bold text-slate-800">{title}</span><p className="text-xs text-slate-500 max-w-sm">{desc}</p></div>
                  </div>
                ))}
                <div className="absolute -bottom-1 left-0 flex gap-2">
                  {slides.map((slide, index) => <div key={slide.title} className={`h-1.5 rounded-full transition-all ${index === currentSlide ? "w-8 bg-theme-800" : "w-2 bg-gray-200"}`} />)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ═══ RIGHT — form ═══ */}
        <div className="w-full lg:w-[38%] lg:flex-none min-w-0 bg-[#f8fafc] p-6 sm:p-10 flex flex-col justify-center relative">
          <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-blue-100 rounded-full blur-[100px] opacity-60" />

          {/* Mobile embedded registration — kept full-opacity/interactive, outside the dimmed login card below */}
          {showRegistration && (
            <div className="relative z-10 w-full max-w-[420px] mx-auto mb-5 lg:hidden">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Create New Employee</span>
                <button type="button" onClick={() => setShowRegistration(false)} className="inline-flex items-center gap-1 text-xs font-semibold text-theme-800">
                  <X size={14} /> Back to login
                </button>
              </div>
              <iframe
                title="Create employee on mobile"
                src="/register?embedded=1"
                className="block h-[65vh] w-full rounded-2xl border border-slate-200 bg-white"
              />
            </div>
          )}

          <div className={`relative z-10 w-full max-w-[420px] mx-auto rounded-[40px] bg-white/70 backdrop-blur-2xl border border-white/70 p-8 sm:p-10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] transition-opacity ${showRegistration ? "opacity-45 pointer-events-none" : "opacity-100"}`} aria-disabled={showRegistration}>
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-400">Sign in with your employee credentials</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="form-label">Employee ID or Email</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. IAK-0000 or email"
                  className="form-input pl-10"
                  autoComplete="username"
                  disabled={isLoading || showRegistration}
                />
              </div>
            </div>

            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="form-input pl-10 pr-10"
                  autoComplete="current-password"
                  disabled={isLoading || showRegistration}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-theme-800"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end -mt-1">
              <a href="/forgot-password" className="text-xs font-semibold text-theme-800 hover:underline">
                Forgot password?
              </a>
            </div>

            <button type="submit" disabled={isLoading || showRegistration} className="btn-primary w-full h-11 mt-1">
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Log In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Want to create a new employee?{" "}
            <button type="button" onClick={() => setShowRegistration(true)} className="text-theme-800 font-semibold hover:underline">
              Create Employee
            </button>
          </p>
          </div>

          <p className="relative z-10 text-center text-xs text-slate-400 mt-6">
            Powered by <span className="font-semibold text-slate-500">Idara Al-Khair</span>
          </p>
        </div>

      </div>

      {/* ═══ ROLE / PORTAL SELECTOR MODAL ═══ */}
      {showRoleSelector && pendingLoginData && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          {/* Blurred Backdrop */}
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" />

          {/* Modal Card */}
          <div className="relative bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8 w-full max-w-lg z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 text-blue-800 border border-blue-100 flex items-center justify-center mb-3">
                <Sparkles size={24} />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Select Workspace</h2>
              <p className="text-sm font-medium text-slate-700 mt-1">
                Welcome back, <span className="text-blue-800 font-semibold">{pendingLoginData.user.full_name}</span>!
              </p>
              <p className="text-xs text-slate-400 mt-1">
                You have dual access. Please select which workspace you want to enter:
              </p>
            </div>

            <div className="space-y-3">
              {/* Option 1: Employee Workspace */}
              <button
                type="button"
                onClick={() => login(pendingLoginData.token, pendingLoginData.user, 'employee')}
                className="w-full text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50/40 transition-all group flex items-start gap-4 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-blue-100 text-slate-600 group-hover:text-blue-700 flex items-center justify-center shrink-0 transition-colors">
                  <Briefcase size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-gray-900 group-hover:text-blue-900">Employee Workspace</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-800">
                      Self-Service
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    View your personal payslips, apply for leaves, check attendance, and track requests.
                  </p>
                </div>
                <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-600 shrink-0 self-center transition-colors" />
              </button>

              {/* Option 2: Role Management Portals */}
              {pendingLoginData.user.roles && pendingLoginData.user.roles
                .filter((r: any) => !r.is_default && r.name !== 'Employee Baseline')
                .map((role: any) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => login(pendingLoginData.token, pendingLoginData.user, 'admin')}
                  className="w-full text-left p-4 rounded-2xl border-2 border-blue-100 bg-gradient-to-r from-blue-50/20 to-indigo-50/20 hover:border-blue-600 hover:bg-blue-50/60 transition-all group flex items-start gap-4 cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900 group-hover:text-blue-900">
                        {role.name} Portal
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        Role Access
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {role.description || "Manage organization workflows, employee records, and approvals."}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-blue-400 group-hover:text-blue-700 shrink-0 self-center transition-colors" />
                </button>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400">
                You can switch between workspaces at any time from your sidebar.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

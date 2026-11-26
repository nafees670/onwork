"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL as API_BASE } from "@/utils/api";
import {
  Lock, ShieldCheck, AlertCircle, Eye, EyeOff,
  ArrowRight, Check, X, KeyRound, Loader2,
} from "lucide-react";

type Phase = "otp" | "password" | "blocked";

const OTP_SECONDS = 5 * 60;

function formatTime(total: number) {
  const safe = Math.max(0, total);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface PasswordRule {
  label: string;
  test: (pwd: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One digit", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export default function VerifyOtpPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [phase, setPhase] = useState<Phase>("otp");
  const [blockedMessage, setBlockedMessage] = useState("");

  // ── OTP step ──
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(OTP_SECONDS);
  const [expired, setExpired] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  // ── Set-new-password step ──
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Pull the challenge_token (or, if the OTP step already completed, the
  // reset_token) forward from sessionStorage. Checking for a reset_token
  // first matters: after verify-otp succeeds, otp_challenge_token is
  // removed, so a page reload during the password step must resume there
  // instead of bouncing straight to "blocked" as if nothing had happened.
  useEffect(() => {
    const storedReset = sessionStorage.getItem("password_reset_token");
    if (storedReset) {
      setResetToken(storedReset);
      setPhase("password");
      return;
    }
    const stored = sessionStorage.getItem("otp_challenge_token");
    if (!stored) {
      setPhase("blocked");
      setBlockedMessage("No active password reset session found. Please log in again.");
      return;
    }
    setChallengeToken(stored);
  }, []);

  // Countdown — only ticks while we're on the OTP step waiting for input.
  useEffect(() => {
    if (phase !== "otp" || expired || !challengeToken) return;
    if (secondsLeft <= 0) {
      setExpired(true);
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, expired, challengeToken, secondsLeft]);

  const backToLogin = () => {
    sessionStorage.removeItem("otp_challenge_token");
    sessionStorage.removeItem("password_reset_token");
    router.push("/login");
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expired || !challengeToken || otpSubmitting) return;
    setOtpError("");
    setOtpSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_token: challengeToken, otp }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.reset_token) {
        sessionStorage.setItem("password_reset_token", data.reset_token);
        sessionStorage.removeItem("otp_challenge_token");
        setResetToken(data.reset_token);
        setPhase("password");
        return;
      }

      if (response.status === 401 && data.error === "invalid_or_expired_challenge") {
        sessionStorage.removeItem("otp_challenge_token");
        setBlockedMessage("This reset session has expired. Please log in again.");
        setPhase("blocked");
        return;
      }

      if (response.status === 429) {
        sessionStorage.removeItem("otp_challenge_token");
        setBlockedMessage(data.detail || "Too many attempts. Please log in again to get a new code.");
        setPhase("blocked");
        return;
      }

      if (response.status === 401 && data.error === "invalid_otp") {
        setOtpError("Incorrect code. Please try again.");
        return;
      }

      setOtpError(data.detail || data.error || "Could not verify the code.");
    } catch {
      setOtpError("Unable to connect to the server. Please try again later.");
    } finally {
      setOtpSubmitting(false);
    }
  };

  const ruleResults = PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(newPassword) }));
  const allRulesPass = ruleResults.every((r) => r.ok);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordSubmitting || !resetToken) return;
    setPasswordError("");
    setFieldErrors({});

    if (!allRulesPass) {
      setPasswordError("Password does not meet the requirements below.");
      return;
    }
    if (!passwordsMatch) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setPasswordSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/auth/complete-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        // Same shape as a normal successful login — store & redirect identically.
        sessionStorage.removeItem("password_reset_token");
        login(data.access_token, data.employee);
        return;
      }

      if (response.status === 401) {
        sessionStorage.removeItem("password_reset_token");
        setBlockedMessage("This reset session has expired. Please log in again.");
        setPhase("blocked");
        return;
      }

      if (data.field_errors) {
        setFieldErrors(data.field_errors);
        setPasswordError("Please fix the highlighted issues.");
        return;
      }

      setPasswordError(data.detail || data.error || "Could not reset the password.");
    } catch {
      setPasswordError("Unable to connect to the server. Please try again later.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const passwordFieldErrors = fieldErrors.password || fieldErrors.new_password || [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-4xl md:flex bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* ═══ LEFT — branding ═══ */}
        <div className="md:w-[42%] shrink-0 bg-theme-900 p-10 flex flex-col">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-white">
              <img src="/logo.png" alt="HRMS logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">HRMS</span>
          </div>

          <div className="mt-9">
            <h2 className="text-2xl font-bold text-white leading-tight">
              {phase === "password" ? "Set a New Password" : "Verify Your Identity"}
            </h2>
            <p className="mt-2 text-sm text-theme-100/70 leading-relaxed max-w-xs">
              {phase === "password"
                ? "Choose a strong password to finish securing your account."
                : "Your account is still on the default password. Enter the one-time code we emailed you to continue."}
            </p>
          </div>

          <div className="mt-6 border-t border-white/10" />

          {phase === "otp" && !expired && (
            <div className="mt-auto">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-theme-100/50 mb-1.5">Code expires in</p>
              <p className={`text-3xl font-bold tabular-nums ${secondsLeft <= 30 ? "text-rose-300" : "text-white"}`}>
                {formatTime(secondsLeft)}
              </p>
            </div>
          )}

          <p className={`text-[10px] font-semibold uppercase tracking-wider text-theme-100/30 pt-5 border-t border-white/10 ${phase === "otp" ? "mt-7" : "mt-auto"}`}>
            Idara al-Khair NGO · ERP Suite
          </p>
        </div>

        {/* ═══ RIGHT — form ═══ */}
        <div className="flex-1 p-10 md:p-12 flex flex-col justify-center">

          {phase === "blocked" && (
            <>
              <div className="mb-7">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Session Ended</h1>
                <p className="mt-1 text-sm text-slate-400">You&apos;ll need to log in again to continue</p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{blockedMessage}</span>
                </div>
                <button type="button" className="btn-primary h-11" onClick={backToLogin}>
                  Back to Login
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {phase === "otp" && (
            <>
              <div className="mb-7">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Enter Verification Code</h1>
                <p className="mt-1 text-sm text-slate-400">We&apos;ve emailed a 6-digit code to your address on file</p>
              </div>

              {expired ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>Code expired — please log in again.</span>
                  </div>
                  <button type="button" className="btn-primary h-11" onClick={backToLogin}>
                    Back to Login
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
                  {otpError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      <span>{otpError}</span>
                    </div>
                  )}

                  <div>
                    <label className="form-label">6-Digit Code</label>
                    <div className="relative">
                      <ShieldCheck size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000"
                        className="form-input pl-10 text-center text-lg font-bold tracking-[0.4em]"
                        autoComplete="one-time-code"
                        disabled={otpSubmitting}
                      />
                    </div>
                  </div>

                  <button type="submit" disabled={otpSubmitting || otp.length !== 6} className="btn-primary h-11">
                    {otpSubmitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        Verify Code
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}
            </>
          )}

          {phase === "password" && (
            <>
              <div className="mb-7">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create New Password</h1>
                <p className="mt-1 text-sm text-slate-400">This will replace your default password</p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
                {passwordError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <div>
                  <label className="form-label">New Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter a new password"
                      className="form-input pl-10 pr-10"
                      autoComplete="new-password"
                      disabled={passwordSubmitting}
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
                  {passwordFieldErrors.length > 0 && (
                    <p className="mt-1 text-xs font-medium text-red-600">{passwordFieldErrors.join(", ")}</p>
                  )}
                  <div className="flex flex-col gap-1.5 mt-2">
                    {ruleResults.map((r) => (
                      <div key={r.label} className={`flex items-center gap-2 text-xs font-medium ${r.ok ? "text-emerald-600" : "text-slate-400"}`}>
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${r.ok ? "bg-emerald-50" : "bg-slate-100"}`}>
                          {r.ok ? <Check size={10} /> : <X size={10} />}
                        </span>
                        {r.label}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label">Confirm Password</label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter the new password"
                      className="form-input pl-10"
                      autoComplete="new-password"
                      disabled={passwordSubmitting}
                    />
                  </div>
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="mt-1 text-xs font-medium text-red-600">Passwords do not match</p>
                  )}
                </div>

                <button type="submit" disabled={passwordSubmitting} className="btn-primary h-11 mt-1">
                  {passwordSubmitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Set Password &amp; Log In
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

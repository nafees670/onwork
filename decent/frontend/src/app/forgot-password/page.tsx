"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, UserRound } from "lucide-react";
import PasswordPageShell from "@/components/PasswordPageShell";
import { API_BASE_URL } from "@/utils/api";

type Step = "email" | "account" | "code" | "password" | "done";
type AccountOption = { employee_id: string; full_name: string };
const inputClass = "w-full h-12 rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-11 text-sm text-slate-900 outline-none transition focus:border-[#0A4174] focus:bg-white focus:ring-4 focus:ring-[#0A4174]/10";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const post = async (path: string, body: object) => {
    const response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.error || "Request could not be completed.");
    return data;
  };

  const requestCode = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const data = await post("/auth/forgot-password/request", { email: email.trim() });
      if (Array.isArray(data.accounts) && data.accounts.length > 0) {
        setAccounts(data.accounts); setNotice(""); setStep("account");
      } else {
        setAccounts([]); setNotice(data.message); setStep("code");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to send code."); }
    finally { setLoading(false); }
  };

  const pickAccount = async (account: AccountOption) => {
    setError(""); setLoading(true);
    try {
      const data = await post("/auth/forgot-password/request", { email: email.trim(), employee_id: account.employee_id });
      setEmployeeId(account.employee_id);
      setNotice(data.message); setStep("code");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to send code."); }
    finally { setLoading(false); }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const data = await post("/auth/forgot-password/verify", {
        email: email.trim(),
        code: code.trim(),
        ...(employeeId ? { employee_id: employeeId } : {}),
      });
      setResetToken(data.reset_token); setNotice(""); setStep("password");
    } catch (err) { setError(err instanceof Error ? err.message : "Invalid or expired code."); }
    finally { setLoading(false); }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await post("/auth/forgot-password/reset", { reset_token: resetToken, password, confirm_password: confirmPassword });
      localStorage.removeItem("access_token"); localStorage.removeItem("user");
      setStep("done"); setTimeout(() => router.replace("/login"), 1600);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to reset password."); }
    finally { setLoading(false); }
  };

  const descriptions: Record<Step, string> = {
    email: "Enter your personal email address and we’ll send a one-time verification code.",
    account: "This email is linked to multiple accounts. Select the account you want to reset.",
    code: `Enter the verification code sent to ${email}${employeeId ? ` for ${employeeId}` : ""}.`,
    password: "Your email is verified. Choose a strong new password for your account.",
    done: "Your password has been updated successfully.",
  };

  const progressStep = step === "account" ? "email" : step;

  return (
    <PasswordPageShell title={step === "done" ? "Password updated" : "Reset your password"} description={descriptions[step]} showBack={step !== "done"}>
      <div className="mb-6 flex gap-2" aria-label="Reset progress">
        {["email", "code", "password"].map((item, index) => {
          const current = ["email", "code", "password", "done"].indexOf(progressStep);
          return <span key={item} className={`h-1.5 flex-1 rounded-full ${index <= current ? "bg-[#0A4174]" : "bg-slate-200"}`} />;
        })}
      </div>
      {error && <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{notice}</div>}

      {step === "email" && <form onSubmit={requestCode} className="space-y-4"><Field label="Personal email" icon={<Mail size={16} />}><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" className={inputClass} /></Field><Submit loading={loading}>Send verification code</Submit></form>}
      {step === "account" && (
        <div className="space-y-2.5">
          {accounts.map((account) => (
            <button key={account.employee_id} type="button" disabled={loading} onClick={() => pickAccount(account)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-left transition hover:border-[#0A4174] hover:bg-white disabled:opacity-60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A4174]/10 text-[#0A4174]"><UserRound size={18} /></span>
              <span>
                <span className="block text-sm font-bold text-slate-900">{account.full_name}</span>
                <span className="block text-xs font-semibold text-slate-500">{account.employee_id}</span>
              </span>
            </button>
          ))}
          <button type="button" disabled={loading} onClick={() => { setAccounts([]); setError(""); setStep("email"); }}
            className="w-full text-xs font-bold text-slate-500 hover:text-[#0A4174]">Use a different email</button>
        </div>
      )}
      {step === "code" && <form onSubmit={verifyCode} className="space-y-4"><Field label="Verification code" icon={<KeyRound size={16} />}><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" placeholder="6-digit code" className={`${inputClass} tracking-[.3em]`} /></Field><Submit loading={loading}>Verify code</Submit><button type="button" disabled={loading} onClick={() => { setCode(""); setNotice(""); setError(""); setEmployeeId(""); setStep("email"); }} className="w-full text-xs font-bold text-slate-500 hover:text-[#0A4174]">Use a different email</button></form>}
      {step === "password" && <form onSubmit={resetPassword} className="space-y-4">{[{ label: "New password", value: password, set: setPassword }, { label: "Confirm password", value: confirmPassword, set: setConfirmPassword }].map((field) => <Field key={field.label} label={field.label} icon={<Lock size={16} />}><input required type={visible ? "text" : "password"} value={field.value} onChange={(e) => field.set(e.target.value)} autoComplete="new-password" className={inputClass} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide passwords" : "Show passwords"} className="absolute right-3 top-3 rounded-lg p-1 text-slate-400">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></Field>)}<p className="text-xs text-slate-500">Use at least 8 characters with upper/lowercase letters, a number and a symbol.</p><Submit loading={loading}>Reset password</Submit></form>}
      {step === "done" && <div role="status" className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"><CheckCircle2 size={20} className="shrink-0" />Password reset successfully. Redirecting you to login…</div>}
    </PasswordPageShell>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">{label}<span className="relative mt-2 block"><span className="absolute left-4 top-4 z-10 text-slate-400">{icon}</span>{children}</span></label>;
}

function Submit({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return <button disabled={loading} className="h-12 w-full rounded-xl bg-theme-800 font-bold text-white transition-colors hover:bg-theme-900 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Please wait…" : children}</button>;
}

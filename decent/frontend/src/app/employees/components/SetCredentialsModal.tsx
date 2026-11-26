"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { fetchWithAuth } from "@/utils/api";
import { X, Eye, EyeOff, Check, KeyRound } from "lucide-react";
import toast from "react-hot-toast";

const schema = z.object({
  password: z.string()
    .min(8, "Password must contain at least 8 characters")
    .regex(/[A-Z]/, "Password must contain one uppercase letter")
    .regex(/[a-z]/, "Password must contain one lowercase letter")
    .regex(/\d/, "Password must contain one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain one special character"),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const REQUIREMENTS: { label: string; test: (pwd: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One digit", test: (p) => /\d/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

interface SetCredentialsModalProps {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SetCredentialsModal({ employeeId, employeeName, employeeCode, open, onClose, onSuccess }: SetCredentialsModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormInput>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: { password: "" },
  });

  const { register, handleSubmit, watch, reset, setError, formState: { errors } } = form;
  const pwd = watch("password") || "";

  // Fresh state every time the modal opens.
  useEffect(() => {
    if (open) {
      reset({ password: "" });
      setShowPassword(false);
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = async (data: FormOutput) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetchWithAuth(`/employees/employees/${employeeId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: data.password }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          setServerError(body.error || "Credentials already exist for this employee.");
          return;
        }
        if (body.field_errors?.password) {
          const msgs: string[] = body.field_errors.password;
          setError("password", { message: msgs.join(", ") });
          return;
        }
        setServerError(body.error || `Request failed (${res.status})`);
        return;
      }

      toast.success(
        body.role_assigned
          ? "Credentials created & default role assigned"
          : "Credentials created",
        { style: { backgroundColor: "#059669", color: "#fff" }, icon: "🔐" }
      );
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Set credentials failed:", err);
      setServerError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const inputCls = (err?: { message?: string }) =>
    `w-full px-4 py-2.5 pr-12 border rounded-lg text-sm transition-colors ${
      err ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"
    } focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2">
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl relative z-10 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <KeyRound size={18} /> Set Login Password
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">{employeeName} ({employeeCode})</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 p-1"><X size={22} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                {...register("password")}
                placeholder="Enter a strong password"
                autoComplete="new-password"
                className={inputCls(errors.password)}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-rose-500 mt-1.5">{errors.password.message}</p>
            )}
          </div>

          {/* Live requirements checklist */}
          <ul className="grid grid-cols-1 gap-1.5 text-xs bg-slate-50 border border-slate-100 rounded-lg p-3">
            {REQUIREMENTS.map((req) => {
              const met = req.test(pwd);
              return (
                <li key={req.label} className={`flex items-center gap-2 ${met ? "text-emerald-600" : "text-slate-400"}`}>
                  <span className={`h-3.5 w-3.5 rounded-full flex items-center justify-center ${met ? "bg-emerald-100" : "bg-slate-200/60"}`}>
                    {met && <Check size={10} strokeWidth={4} />}
                  </span>
                  {req.label}
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-slate-400 leading-relaxed">
            The employee will sign in with their Employee Code and this password on the login page.
          </p>

          {serverError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
              {serverError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "Saving..." : "Create Credentials"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { fetchWithAuth } from "@/utils/api";
import { X, UserMinus } from "lucide-react";
import toast from "react-hot-toast";

interface OffboardModalProps {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function OffboardModal({ employeeId, employeeName, open, onClose, onSuccess }: OffboardModalProps) {
  const [status, setStatus] = useState<"resigned" | "terminated">("resigned");
  const [exitDate, setExitDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus("resigned");
      setExitDate(new Date().toISOString().slice(0, 10));
      setReason("");
      setServerError(null);
    }
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitDate) {
      setServerError("Exit date is required");
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetchWithAuth(`/employees/employees/${employeeId}/offboard`, {
        method: "POST",
        body: JSON.stringify({ status, exit_date: exitDate, exit_reason: reason || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(body.error || `Request failed (${res.status})`);
        return;
      }
      toast.success(`${employeeName} marked as ${status}`);
      onSuccess();
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2">
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl relative z-10 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserMinus size={18} /> Offboard Employee
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">{employeeName}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 p-1"><X size={22} /></button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Reason <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus("resigned")}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  status === "resigned" ? "bg-amber-50 border-amber-300 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Resigned
              </button>
              <button
                type="button"
                onClick={() => setStatus("terminated")}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  status === "terminated" ? "bg-rose-50 border-rose-300 text-rose-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Terminated
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Exit Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Any additional context…"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            This deactivates the employee&apos;s account and records the exit for turnover reporting. Their record is kept, not deleted.
          </p>

          {serverError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
              {serverError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Saving..." : "Confirm Offboarding"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

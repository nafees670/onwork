"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import { Settings, Plus, Trash2, Save, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

type LeaveBracket = {
  id?: string;
  leave_name: string;
  code?: string;
  days_per_year: number;
  is_paid: boolean;
  order?: number;
};

type LeaveSettings = {
  id: string;
  organization_id: string;
  implementation_date: string;
  is_active: boolean;
  notes?: string | null;
  brackets: LeaveBracket[];
  created_at?: string;
  updated_at?: string;
};

const DEFAULT_BRACKETS: LeaveBracket[] = [
  { leave_name: "Annual Leave", code: "annual", days_per_year: 14, is_paid: true, order: 1 },
  { leave_name: "Casual Leave", code: "casual", days_per_year: 6, is_paid: false, order: 2 },
  { leave_name: "Sick Leave", code: "sick", days_per_year: 8, is_paid: false, order: 3 },
];

export default function LeaveSettingsPage() {
  const [settings, setSettings] = useState<LeaveSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  const [implDate, setImplDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [brackets, setBrackets] = useState<LeaveBracket[]>(DEFAULT_BRACKETS);

  const load = async () => {
    try {
      const res = await fetchWithAuth("/payroll/leave/settings");
      if (res.status === 403) return setNoAccess(true);
      if (res.status === 404) {
        setSettings(null);
        return;
      }
      if (res.ok) {
        const data: LeaveSettings = await res.json();
        setSettings(data);
        setImplDate(data.implementation_date || "");
        setIsActive(data.is_active);
        setNotes(data.notes || "");
        if (data.brackets && data.brackets.length > 0) {
          setBrackets(
            data.brackets.map((b) => ({
              ...b,
              days_per_year: Number(b.days_per_year),
              is_paid: Boolean(b.is_paid),
            }))
          );
        }
      }
    } catch {
      // 404 is fine
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addBracket = () => {
    setBrackets([
      ...brackets,
      {
        leave_name: "",
        days_per_year: 0,
        is_paid: true,
        order: brackets.length + 1,
      },
    ]);
  };

  const removeBracket = (idx: number) => {
    setBrackets(brackets.filter((_, i) => i !== idx));
  };

  const updateBracket = (idx: number, field: keyof LeaveBracket, value: any) => {
    setBrackets(
      brackets.map((b, i) => (i === idx ? { ...b, [field]: value } : b))
    );
  };

  const handleSave = async () => {
    if (!implDate) return toast.error("Implementation date is required");
    if (brackets.length === 0) return toast.error("Add at least one leave bracket");

    for (const b of brackets) {
      if (!b.leave_name.trim()) {
        return toast.error("Please provide a name for all leave brackets");
      }
    }

    setSaving(true);
    try {
      const payload = {
        implementation_date: implDate,
        is_active: isActive,
        notes: notes || null,
        brackets: brackets.map((b, idx) => {
          const nameLower = b.leave_name.trim().toLowerCase();
          let code = b.code?.trim().toLowerCase() || "";
          if (nameLower.includes("annual") || code.includes("annual")) code = "annual";
          else if (nameLower.includes("casual") || code.includes("casual")) code = "casual";
          else if (nameLower.includes("sick") || code.includes("sick")) code = "sick";
          else if (nameLower.includes("unpaid") || code.includes("unpaid")) code = "unpaid";
          else if (!code) code = nameLower.replace(/[^a-z0-9_]/g, "_");

          return {
            leave_name: b.leave_name.trim(),
            code,
            days_per_year: Number(b.days_per_year) || 0,
            is_paid: b.is_paid,
            order: idx + 1,
          };
        }),
      };

      const res = await fetchWithAuth("/payroll/leave/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (res.status === 403) return setNoAccess(true);
      if (res.ok) {
        const data: LeaveSettings = await res.json();
        setSettings(data);
        toast.success("Leave policy settings updated successfully");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail?.[0]?.msg || err.detail || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50/50 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-800">
                <Settings size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Leave Settings</h1>
                <p className="text-sm text-gray-500">
                  {settings ? "Update" : "Configure"} your organization&apos;s leave policy
                </p>
              </div>
            </div>

            <Link
              href="/payroll/leaves"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-800 transition-colors"
            >
              <ArrowLeft size={14} /> Back to Leaves
            </Link>
          </div>

          {noAccess && <AccessDenied />}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-blue-800" />
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Implementation Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={implDate}
                    onChange={(e) => setImplDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Leave policy is active from this date. Accruals & calculations start from this date.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 rounded accent-blue-800"
                    />
                    Active Policy
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional policy notes..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              {/* Leave Policy Brackets */}
              <div className="mt-6 border-t border-gray-200 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">
                      Leave Policy Brackets
                    </h3>
                    <p className="text-xs text-gray-400">
                      Define leave types, annual quotas, and payment rules.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addBracket}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    <Plus size={14} /> Add Bracket
                  </button>
                </div>

                <div className="space-y-2.5">
                  {brackets.map((b, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/70 p-3"
                    >
                      {/* Leave Name */}
                      <div className="w-full sm:flex-[2]">
                        <label className="text-[10px] font-semibold uppercase text-gray-400">
                          Leave Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Annual Leave, Casual Leave"
                          value={b.leave_name}
                          onChange={(e) =>
                            updateBracket(idx, "leave_name", e.target.value)
                          }
                          className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:border-blue-800 focus:outline-none"
                        />
                      </div>

                      {/* Quantity / Days */}
                      <div className="w-full sm:flex-1">
                        <label className="text-[10px] font-semibold uppercase text-gray-400">
                          Quantity (Days / Year)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={b.days_per_year}
                          onChange={(e) =>
                            updateBracket(
                              idx,
                              "days_per_year",
                              Math.max(0, Number(e.target.value))
                            )
                          }
                          className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:border-blue-800 focus:outline-none"
                        />
                      </div>

                      {/* Paid / Unpaid Dropdown */}
                      <div className="w-full sm:flex-1">
                        <label className="text-[10px] font-semibold uppercase text-gray-400">
                          Payment Type
                        </label>
                        <select
                          value={b.is_paid ? "paid" : "unpaid"}
                          onChange={(e) =>
                            updateBracket(idx, "is_paid", e.target.value === "paid")
                          }
                          className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:border-blue-800 focus:outline-none"
                        >
                          <option value="paid">Paid</option>
                          <option value="unpaid">Unpaid</option>
                        </select>
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => removeBracket(idx)}
                        title="Delete bracket"
                        className="self-end sm:self-center mt-2 sm:mt-4 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {brackets.length === 0 && (
                  <p className="text-sm text-gray-400 italic py-3 text-center">
                    No brackets defined. Click &quot;Add Bracket&quot; to configure your leave types.
                  </p>
                )}
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {saving
                    ? "Saving..."
                    : settings
                    ? "Update Settings"
                    : "Create Settings"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}

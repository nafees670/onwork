"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import { Settings, Plus, Trash2, Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

type Bracket = {
  id?: string;
  min_tenure_years: number;
  max_tenure_years: number | null;
  matching_pct: number;
};

type ESPSettings = {
  id: string;
  organization_id: string;
  implementation_date: string;
  employee_contribution_pct: string;
  basic_salary_pct: string;
  is_active: boolean;
  notes?: string | null;
  matching_brackets: Bracket[];
  created_at: string;
  auto_enrolled?: number | null;
};

const DEFAULT_BRACKETS: Bracket[] = [
  { min_tenure_years: 0, max_tenure_years: 1, matching_pct: 0 },
  { min_tenure_years: 1, max_tenure_years: 2, matching_pct: 25 },
  { min_tenure_years: 2, max_tenure_years: 3, matching_pct: 50 },
  { min_tenure_years: 3, max_tenure_years: 4, matching_pct: 75 },
  { min_tenure_years: 4, max_tenure_years: null, matching_pct: 100 },
];

export default function ESPSettingsPage() {
  const [settings, setSettings] = useState<ESPSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  const [implDate, setImplDate] = useState("");
  const [empPct, setEmpPct] = useState("8.33");
  const [basicPct, setBasicPct] = useState("50.00");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [brackets, setBrackets] = useState<Bracket[]>(DEFAULT_BRACKETS);

  const load = async () => {
    try {
      const res = await fetchWithAuth("/payroll/esp/settings");
      if (res.status === 403) return setNoAccess(true);
      if (res.status === 404) {
        setSettings(null);
        return;
      }
      if (res.ok) {
        const data: ESPSettings = await res.json();
        setSettings(data);
        setImplDate(data.implementation_date);
        setEmpPct(data.employee_contribution_pct);
        setBasicPct(data.basic_salary_pct);
        setIsActive(data.is_active);
        setNotes(data.notes || "");
        if (data.matching_brackets.length > 0) {
          setBrackets(data.matching_brackets.map((b) => ({ ...b })));
        }
      }
    } catch {
      // 404 is fine — no settings yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addBracket = () => {
    const last = brackets[brackets.length - 1];
    setBrackets([
      ...brackets,
      {
        min_tenure_years: last ? (last.max_tenure_years ?? last.min_tenure_years + 1) : 0,
        max_tenure_years: null,
        matching_pct: 0,
      },
    ]);
  };

  const removeBracket = (idx: number) => {
    setBrackets(brackets.filter((_, i) => i !== idx));
  };

  const updateBracket = (idx: number, field: keyof Bracket, value: number | null) => {
    setBrackets(brackets.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  };

  const handleSave = async () => {
    if (!implDate) return toast.error("Implementation date is required");
    if (brackets.length === 0) return toast.error("Add at least one matching bracket");

    setSaving(true);
    try {
      const payload = {
        implementation_date: implDate,
        employee_contribution_pct: Number(empPct),
        basic_salary_pct: Number(basicPct),
        is_active: isActive,
        notes: notes || null,
        matching_brackets: brackets.map((b) => ({
          min_tenure_years: b.min_tenure_years,
          max_tenure_years: b.max_tenure_years,
          matching_pct: b.matching_pct,
        })),
      };

      const res = await fetchWithAuth("/payroll/esp/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (res.status === 403) return setNoAccess(true);
      if (res.ok) {
        const data: ESPSettings = await res.json();
        setSettings(data);
        toast.success(
          data.auto_enrolled && data.auto_enrolled > 0
            ? `ESP settings saved — ${data.auto_enrolled} employees auto-enrolled`
            : "ESP settings saved"
        );
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail?.[0]?.msg || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="text-indigo-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ESP Settings</h1>
              <p className="text-sm text-gray-500">
                {settings ? "Update" : "Configure"} your organization&apos;s ESP policy
              </p>
            </div>
          </div>

          {noAccess && <AccessDenied />}

          {loading ? (
            <p className="text-gray-500">Loading...</p>
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
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    ESP is active from this date. No contributions before it.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Basic Salary % of Gross
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={basicPct}
                    onChange={(e) => setBasicPct(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    ESP basic = Gross x this %. Default: 50%.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Employee Contribution %
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={empPct}
                    onChange={(e) => setEmpPct(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    % of ESP basic deducted from employee. Default: 8.33%.
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    Active
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {/* Matching Brackets */}
              <div className="mt-6 border-t border-gray-200 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">
                    Employer Matching Brackets (by tenure)
                  </h3>
                  <button
                    type="button"
                    onClick={addBracket}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Plus size={14} /> Add Bracket
                  </button>
                </div>

                <div className="space-y-2">
                  {brackets.map((b, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold uppercase text-gray-400">
                          Min Years
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={b.min_tenure_years}
                          onChange={(e) =>
                            updateBracket(idx, "min_tenure_years", Number(e.target.value))
                          }
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold uppercase text-gray-400">
                          Max Years (empty = open)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={b.max_tenure_years ?? ""}
                          onChange={(e) =>
                            updateBracket(
                              idx,
                              "max_tenure_years",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold uppercase text-gray-400">
                          Matching %
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={b.matching_pct}
                          onChange={(e) =>
                            updateBracket(idx, "matching_pct", Number(e.target.value))
                          }
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBracket(idx)}
                        className="mt-4 text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {brackets.length === 0 && (
                  <p className="text-sm text-gray-400 italic">
                    No brackets defined. Employer will not match any contributions.
                  </p>
                )}
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? "Saving..." : settings ? "Update Settings" : "Create Settings"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import EmployeeSelect from "@/components/EmployeeSelect";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import { useAuth } from "@/context/AuthContext";
import {
  ArrowDownToLine, Plus, X, Users, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Banknote, Filter, Trash2, Lock, Unlock, Wallet,
} from "lucide-react";
import toast from "react-hot-toast";


type Withdrawal = {
  id: string;
  employee_id: string;
  employee_name: string;
  requested_amount: string;
  reason: string;
  status: string;
  requested_at: string;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  disbursed_at?: string | null;
};

type MyESPBalance = {
  employee_id: string;
  employee_name: string;
  total_employee_contribution: string;
  total_employer_contribution: string;
  total_balance: string;
  eligible_withdrawal_amount: string;
  active_withdrawal_amount: string;
  available_withdrawal_balance: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
  disbursed: "bg-emerald-100 text-emerald-700",
};

const PAGE_SIZE = 20;
const fmt = (v?: string | number | null) => (v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// ─── Employee Self-Service ESP Portal ────────────────────────
function EmployeeESPWithdrawalPortal() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<MyESPBalance | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggles, setToggles] = useState({ allow_loan_requests: false, allow_esp_withdrawal_requests: false });
  const [showApplyModal, setShowApplyModal] = useState(false);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [toggleRes, balRes, withRes] = await Promise.all([
        fetchWithAuth("/payroll/system-toggles"),
        fetchWithAuth("/payroll/esp/my-balance"),
        fetchWithAuth("/payroll/esp/my-withdrawals"),
      ]);
      if (toggleRes.ok) setToggles(await toggleRes.json());
      if (balRes.ok) setBalance(await balRes.json());
      if (withRes.ok) setWithdrawals(await withRes.json());
    } catch {
      toast.error("Failed to load ESP withdrawal data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleApplyWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid withdrawal amount");
    if (!reason.trim()) return toast.error("Reason for withdrawal is required");

    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/payroll/esp/my-withdrawals", {
        method: "POST",
        body: JSON.stringify({
          requested_amount: amt,
          reason: reason.trim(),
        }),
      });
      if (res.ok) {
        toast.success("Withdrawal request submitted successfully!");
        setShowApplyModal(false);
        setAmount("");
        setReason("");
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to submit withdrawal request");
      }
    } catch {
      toast.error("Failed to submit withdrawal request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWithdrawal = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this withdrawal request?")) return;
    try {
      const res = await fetchWithAuth(`/payroll/esp/withdrawals/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Withdrawal request cancelled");
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to cancel request");
      }
    } catch {
      toast.error("Failed to cancel request");
    }
  };

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">ESP Withdrawals & Fund Portal</h1>
            <p className="page-subtitle">Track your Employee Savings Scheme balance and manage withdrawal requests.</p>
          </div>
          {toggles.allow_esp_withdrawal_requests && (
            <button
              onClick={() => setShowApplyModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={16} /> Request ESP Withdrawal
            </button>
          )}
        </div>

        {/* Closed Banner if disabled */}
        {!toggles.allow_esp_withdrawal_requests && (
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-center gap-3 text-amber-900 shadow-2xs">
            <Lock size={20} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">ESP Withdrawals Disabled</p>
              <p className="text-xs text-amber-700 mt-0.5">ESP withdrawal requests are currently closed by administration. You can view your ESP savings balance and past withdrawal requests below.</p>
            </div>
          </div>
        )}

        {/* Balance Cards */}
        {balance && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="ui-card p-5 border-l-4 border-l-indigo-600">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Fund Balance</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">PKR {fmt(balance.total_balance)}</p>
              <p className="text-xs text-slate-400 mt-1">Employee + Employer match</p>
            </div>
            <div className="ui-card p-5 border-l-4 border-l-emerald-600">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your Contributions</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">PKR {fmt(balance.total_employee_contribution)}</p>
              <p className="text-xs text-slate-400 mt-1">Total deducted via payroll</p>
            </div>
            <div className="ui-card p-5 border-l-4 border-l-blue-600">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employer Contributions</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">PKR {fmt(balance.total_employer_contribution)}</p>
              <p className="text-xs text-slate-400 mt-1">Company match contribution</p>
            </div>
            <div className="ui-card p-5 border-l-4 border-l-amber-600">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Available Withdrawal</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">PKR {fmt(balance.available_withdrawal_balance)}</p>
              <p className="text-xs text-slate-400 mt-1">Limit based on policy rules</p>
            </div>
          </div>
        )}

        {/* My Withdrawal Requests Table */}
        <div className="ui-card p-5">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <ArrowDownToLine size={18} className="text-indigo-600" /> My Withdrawal Requests
          </h2>
          {loading ? (
            <p className="text-sm text-slate-400 py-6 text-center">Loading requests...</p>
          ) : withdrawals.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-slate-500">You currently have no ESP withdrawal requests.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="ui-table-head border-b border-slate-100">
                    <th className="ui-table-head">Requested Amount</th>
                    <th className="ui-table-head">Reason</th>
                    <th className="ui-table-head">Status</th>
                    <th className="ui-table-head">Requested Date</th>
                    <th className="ui-table-head">Reviewed By</th>
                    <th className="ui-table-head text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {withdrawals.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50/50">
                      <td className="ui-table-cell font-bold text-slate-900">PKR {fmt(w.requested_amount)}</td>
                      <td className="ui-table-cell text-slate-700 max-w-xs truncate">{w.reason}</td>
                      <td className="ui-table-cell">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${
                          STATUS_COLORS[w.status] || 'bg-slate-100 text-slate-600'
                        }`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="ui-table-cell text-slate-500">{new Date(w.requested_at).toLocaleDateString()}</td>
                      <td className="ui-table-cell text-slate-500">{w.reviewed_by_name || "—"}</td>
                      <td className="ui-table-cell text-right">
                        {w.status === "pending" && (
                          <button
                            onClick={() => handleDeleteWithdrawal(w.id)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                          >
                            Cancel Request
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Apply Modal */}
        {showApplyModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="ui-card max-w-md w-full p-6 bg-white rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Request ESP Withdrawal</h3>
                <button onClick={() => setShowApplyModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
              </div>

              <form onSubmit={handleApplyWithdrawal} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Requested Amount (PKR)</label>
                  <input
                    type="number"
                    min="500"
                    step="100"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    placeholder="e.g. 25000"
                    className="ui-input w-full"
                  />
                  {balance && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Available withdrawal limit: <span className="font-bold text-indigo-600">PKR {fmt(balance.available_withdrawal_balance)}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Reason for Withdrawal</label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    placeholder="Provide detailed explanation for withdrawal request..."
                    className="ui-input w-full"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowApplyModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

export default function ESPWithdrawalsPage() {
  const { user, hydrated } = useAuth();
  if (hydrated && user && !user.is_superadmin) {
    return <EmployeeESPWithdrawalPortal />;
  }
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEmp, setFilterEmp] = useState("");
  const [page, setPage] = useState(1);
  const [toggles, setToggles] = useState({ allow_loan_requests: true, allow_esp_withdrawal_requests: true });
  const [updatingToggle, setUpdatingToggle] = useState(false);

  // Create form
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Review modal
  const [reviewing, setReviewing] = useState<Withdrawal | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | "disburse">("approve");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing_, setReviewing_] = useState(false);

  useEffect(() => {
    fetchWithAuth("/payroll/system-toggles")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setToggles(data); })
      .catch(() => {});
  }, []);

  const handleToggleEspWithdrawals = async () => {
    const enabled = !toggles.allow_esp_withdrawal_requests;
    setUpdatingToggle(true);
    try {
      const res = await fetchWithAuth("/payroll/system-toggles", {
        method: "PUT",
        body: JSON.stringify({ key: "allow_esp_withdrawal_requests", enabled }),
      });
      if (res.ok) {
        setToggles(await res.json());
        toast.success(`ESP withdrawal requests ${enabled ? "PERMITTED" : "DISABLED"}`);
      } else {
        toast.error("Failed to update ESP withdrawal permission");
      }
    } catch {
      toast.error("Error updating ESP withdrawal permission");
    } finally {
      setUpdatingToggle(false);
    }
  };

  const load = async () => {
    try {
      let qs = "";
      const params: string[] = [];
      if (filterStatus) params.push(`status=${filterStatus}`);
      if (filterEmp) params.push(`employee_id=${filterEmp}`);
      if (params.length) qs = `?${params.join("&")}`;
      const res = await fetchWithAuth(`/payroll/esp/withdrawals${qs}`);
      if (res.status === 403) return setNoAccess(true);
      if (res.ok) setWithdrawals(await res.json());
    } catch {
      toast.error("Failed to load withdrawals");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWithdrawal = async (id: string) => {
    if (!confirm("Are you sure you want to delete this withdrawal request? This action cannot be undone.")) return;
    try {
      const res = await fetchWithAuth(`/payroll/esp/withdrawals/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Withdrawal request deleted");
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to delete withdrawal");
      }
    } catch {
      toast.error("Failed to delete withdrawal");
    }
  };


  useEffect(() => { load(); }, [filterStatus, filterEmp]);

  const openCreate = () => {
    setEmployeeId("");
    setAmount("");
    setReason("");
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!employeeId) return toast.error("Select an employee");
    if (!amount || Number(amount) <= 0) return toast.error("Enter a valid amount");
    if (!reason.trim()) return toast.error("Reason is required");

    setSaving(true);
    try {
      const res = await fetchWithAuth("/payroll/esp/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          employee_id: employeeId,
          requested_amount: Number(amount),
          reason: reason.trim(),
        }),
      });
      if (res.status === 403) return setNoAccess(true);
      if (res.ok) {
        toast.success("Withdrawal request created");
        setShowCreate(false);
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to create");
      }
    } catch {
      toast.error("Failed to create withdrawal");
    } finally {
      setSaving(false);
    }
  };

  const openReview = (w: Withdrawal, action: "approve" | "reject" | "disburse") => {
    setReviewing(w);
    setReviewAction(action);
    setReviewNotes("");
  };

  const handleReview = async () => {
    if (!reviewing) return;
    setReviewing_(true);
    try {
      const res = await fetchWithAuth(
        `/payroll/esp/withdrawals/${reviewing.id}/${reviewAction}`,
        {
          method: "PUT",
          body: JSON.stringify({ review_notes: reviewNotes || null }),
        }
      );
      if (res.status === 403) return setNoAccess(true);
      if (res.ok) {
        toast.success(`Withdrawal ${reviewAction}d`);
        setReviewing(null);
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || `Failed to ${reviewAction}`);
      }
    } catch {
      toast.error(`Failed to ${reviewAction}`);
    } finally {
      setReviewing_(false);
    }
  };

  const filtered = useMemo(() => {
    return withdrawals;
  }, [withdrawals]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <ArrowDownToLine className="text-indigo-600" size={28} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">ESP Withdrawals</h1>
                <p className="text-sm text-gray-500">{withdrawals.length} requests</p>
              </div>
            </div>
            {toggles.allow_esp_withdrawal_requests && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer"
              >
                <Plus size={18} /> New Withdrawal
              </button>
            )}


          </div>

          {/* Employee self-service permission control */}
          <div className="mb-6 p-4 rounded-xl border border-slate-100 bg-white shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toggles.allow_esp_withdrawal_requests ? "bg-indigo-100 text-indigo-700" : "bg-rose-100 text-rose-700"}`}>
                <Wallet size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">ESP Fund Withdrawals</p>
                <p className="text-xs text-slate-500">{toggles.allow_esp_withdrawal_requests ? "Employees can submit withdrawal requests" : "Applications closed by administration"}</p>
              </div>
            </div>
            <button
              onClick={handleToggleEspWithdrawals}
              disabled={updatingToggle}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                toggles.allow_esp_withdrawal_requests
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-slate-200 text-slate-700 hover:bg-slate-300"
              }`}
            >
              {toggles.allow_esp_withdrawal_requests ? <Unlock size={13} /> : <Lock size={13} />}
              {toggles.allow_esp_withdrawal_requests ? "Permitted (ON)" : "Disabled (OFF)"}
            </button>
          </div>

          {noAccess && <AccessDenied />}

          {/* Filters */}
          <div className="mb-5 space-y-4 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <Filter size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Filter Withdrawals</h3>
                  <p className="text-xs text-slate-500">Search withdrawal requests by employee or approval status</p>
                </div>
              </div>

              {(filterEmp || filterStatus) && (
                <button
                  onClick={() => { setFilterEmp(""); setFilterStatus(""); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  <X size={13} /> Reset Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Employee</label>
                <EmployeeSelect value={filterEmp} onChange={setFilterEmp} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="disbursed">Disbursed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500">No withdrawal requests found.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Requested</th>
                    <th className="px-4 py-3">Reviewed By</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((w) => (
                    <tr key={w.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600">
                          <Users size={14} /> {w.employee_id}
                        </span>
                        <p className="text-xs text-gray-500">{w.employee_name}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">{fmt(w.requested_amount)}</td>
                      <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">{w.reason}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                            STATUS_COLORS[w.status] || "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(w.requested_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {w.reviewed_by_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {w.status === "pending" && (
                            <>
                              <button
                                onClick={() => openReview(w, "approve")}
                                title="Approve"
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                <CheckCircle2 size={14} /> Approve
                              </button>
                              <button
                                onClick={() => openReview(w, "reject")}
                                title="Reject"
                                className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </>
                          )}
                          {w.status === "approved" && (
                            <button
                              onClick={() => openReview(w, "disburse")}
                              title="Mark Disbursed"
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              <Banknote size={14} /> Disburse
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteWithdrawal(w.id)}
                            title="Delete Withdrawal"
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Create Modal */}
          {showCreate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">New Withdrawal Request</h2>
                  <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Employee</label>
                    <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Requested Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? "Submitting..." : "Submit Request"}
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Review Modal */}
          {reviewing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900 capitalize">
                    {reviewAction} Withdrawal
                  </h2>
                  <button onClick={() => setReviewing(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                <div className="mb-4 rounded-lg bg-gray-50 p-3">
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">{reviewing.employee_name}</span> ({reviewing.employee_id})
                  </p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {fmt(reviewing.requested_amount)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{reviewing.reason}</p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Review Notes {reviewAction === "reject" && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={3}
                    placeholder={reviewAction === "reject" ? "Reason for rejection..." : "Optional notes..."}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={handleReview}
                    disabled={reviewing_ || (reviewAction === "reject" && !reviewNotes.trim())}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                      reviewAction === "approve"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : reviewAction === "reject"
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-indigo-600 hover:bg-indigo-700"
                    }`}
                  >
                    {reviewing_ ? "Processing..." : `Confirm ${reviewAction}`}
                  </button>
                  <button
                    onClick={() => setReviewing(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}

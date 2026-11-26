"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import EmployeeSelect from "@/components/EmployeeSelect";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
  CalendarDays, Plus, X, Eye, Check, XCircle, Ban, Trash2,
  ChevronLeft, ChevronRight, Users, Filter, RefreshCw,
  Clock, CheckCircle2, AlertCircle, Calendar, SlidersHorizontal,
  Settings,
} from "lucide-react";
import Link from "next/link";

import toast from "react-hot-toast";

// ─── Types ──────────────────────────────────────────────────

type LeaveType = {
  id: string;
  name: string;
  code: string;
  annual_entitlement: number;
  accrual_frequency: string;
  accrual_days_per_period: string;
  accrual_timing: string;
  requires_confirmation: boolean;
  is_active: boolean;
};

type BalanceSummary = {
  employee_id: string;
  employee_name: string;
  annual_accrued: string;
  annual_consumed: string;
  annual_available: string;
  annual_eligible: boolean;
  casual_accrued: string;
  casual_consumed: string;
  casual_available: string;
  sick_accrued: string;
  sick_consumed: string;
  sick_available: string;
};

type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_id: string;
  leave_type_code: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  status: string;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  is_override: boolean;
  created_at: string;
};

type LeaveAdjustment = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_code: string;
  leave_type_name: string;
  adjustment_type: string;
  days: string;
  previous_balance: string;
  new_balance: string;
  reason: string;
  adjusted_by_name: string | null;
  created_at: string;
};

type LeaveAccrual = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_code: string;
  leave_type_name: string;
  accrual_date: string;
  days_accrued: string;
  period_month: number;
  period_year: number;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PAGE_SIZE = 20;

const fmt = (v?: string | null) =>
  v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  return map[status] || "bg-gray-100 text-gray-500";
};

const adjTypeBadge = (type: string) => {
  const map: Record<string, string> = {
    add: "bg-emerald-100 text-emerald-700",
    deduct: "bg-red-100 text-red-700",
    correction: "bg-blue-100 text-blue-700",
  };
  return map[type] || "bg-gray-100 text-gray-500";
};

const TABS = [
  { key: "balances", label: "Balances", icon: Calendar },
  { key: "requests", label: "Requests", icon: Clock },
  { key: "adjustments", label: "Adjustments", icon: SlidersHorizontal },
  { key: "accruals", label: "Accruals", icon: RefreshCw },
] as const;

type TabKey = typeof TABS[number]["key"];

import { useAuth } from "@/context/AuthContext";

// ─── Employee Self-Service Leave Portal ──────────────────────
function EmployeeLeavePortal() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);

  const [leaveTypeCode, setLeaveTypeCode] = useState("casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalDays, setTotalDays] = useState("1");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [balRes, reqRes] = await Promise.all([
        fetchWithAuth("/payroll/leave/my-balance"),
        fetchWithAuth("/payroll/leave/my-requests"),
      ]);
      if (balRes.ok) {
        const bData = await balRes.json();
        setBalances(bData);
        if (bData.length > 0 && !bData.some((b: any) => b.leave_type_code === leaveTypeCode)) {
          setLeaveTypeCode(bData[0].leave_type_code);
        }
      }
      if (reqRes.ok) setRequests(await reqRes.json());
    } catch {
      toast.error("Failed to load leave data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
        const diffMs = end.getTime() - start.getTime();
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
        setTotalDays(String(days));
      }
    }
  }, [startDate, endDate]);

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return toast.error("Select start and end dates");
    const days = parseInt(totalDays);
    if (!days || days < 1) return toast.error("Enter valid number of days");

    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/payroll/leave/my-requests", {
        method: "POST",
        body: JSON.stringify({
          employee_id: user?.employee_id || user?.code || "",
          leave_type_code: leaveTypeCode,
          start_date: startDate,
          end_date: endDate,
          total_days: days,
          reason: reason || null,
        }),
      });
      if (res.ok) {
        toast.success("Leave request submitted successfully!");
        setShowApplyModal(false);
        setReason("");
        setStartDate("");
        setEndDate("");
        setTotalDays("1");
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || err.error || "Failed to submit leave request");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMyLeave = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this leave request?")) return;
    try {
      const res = await fetchWithAuth(`/payroll/leave-requests/${id}/cancel`, { method: "PUT" });
      if (res.ok) {
        toast.success("Leave request cancelled");
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to cancel leave request");
      }
    } catch {
      toast.error("Failed to cancel leave request");
    }
  };

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">My Leaves & Entitlements</h1>
            <p className="page-subtitle">View your leave balances and track your leave request applications.</p>
          </div>
          <button
            onClick={() => setShowApplyModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={16} /> Apply for Leave
          </button>
        </div>

        {/* Leave Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="ui-card p-5 h-32 bg-slate-50 animate-pulse rounded-2xl" />
            ))
          ) : (
            balances.map((b) => (
              <div key={b.leave_type_code} className="ui-card p-5 rounded-2xl shadow-xs border border-slate-100 hover:border-amber-200 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-slate-900">{b.leave_type}</span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${Number(b.available) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                    {Number(b.available)} Days Available
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 py-2 border-t border-slate-50 text-center">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Accrued</p>
                    <p className="text-sm font-bold text-slate-800">{Number(b.accrued)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Consumed</p>
                    <p className="text-sm font-bold text-slate-800">{Number(b.consumed)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Available</p>
                    <p className="text-sm font-bold text-emerald-600">{Number(b.available)}</p>
                  </div>
                </div>
                {b.eligibility_note && (
                  <p className="text-[11px] text-amber-700 mt-2 font-medium bg-amber-50 p-2 rounded-lg">{b.eligibility_note}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* My Requests Table */}
        <div className="ui-card p-5">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <CalendarDays size={18} className="text-amber-500" /> My Leave Requests
          </h2>
          {loading ? (
            <p className="text-sm text-slate-400 py-6 text-center">Loading requests...</p>
          ) : requests.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-slate-500">You haven't submitted any leave requests yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="ui-table-head border-b border-slate-100">
                    <th className="ui-table-head">Leave Type</th>
                    <th className="ui-table-head">Start Date</th>
                    <th className="ui-table-head">End Date</th>
                    <th className="ui-table-head">Total Days</th>
                    <th className="ui-table-head">Reason</th>
                    <th className="ui-table-head">Status</th>
                    <th className="ui-table-head text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="ui-table-cell font-semibold text-slate-800">{r.leave_type_name}</td>
                      <td className="ui-table-cell text-slate-600">{r.start_date}</td>
                      <td className="ui-table-cell text-slate-600">{r.end_date}</td>
                      <td className="ui-table-cell font-bold text-slate-900">{r.total_days}</td>
                      <td className="ui-table-cell text-slate-500 max-w-[150px] truncate">{r.reason || "—"}</td>
                      <td className="ui-table-cell">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${
                          r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          r.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {r.status}
                        </span>
                        {r.rejection_reason && <p className="text-[10px] text-rose-500 mt-0.5">{r.rejection_reason}</p>}
                      </td>
                      <td className="ui-table-cell text-right">
                        {(r.status === 'pending' || r.status === 'approved') && (
                          <button
                            onClick={() => handleCancelMyLeave(r.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-semibold transition-all cursor-pointer"
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

        {/* Apply Leave Modal */}
        {showApplyModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="ui-card max-w-md w-full p-6 bg-white rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Apply for Leave</h3>
                <button onClick={() => setShowApplyModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
              </div>

              <form onSubmit={handleApplyLeave} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Leave Type</label>
                  <select
                    value={leaveTypeCode}
                    onChange={(e) => setLeaveTypeCode(e.target.value)}
                    className="ui-input w-full"
                  >
                    {balances.length > 0 ? (
                      balances.map((b) => (
                        <option key={b.leave_type_code} value={b.leave_type_code}>
                          {b.leave_type} ({Number(b.available)} Days Available)
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="annual">Annual Leave</option>
                        <option value="casual">Casual Leave</option>
                        <option value="sick">Sick Leave</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1 block">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="ui-input w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1 block">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                      className="ui-input w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Total Days</label>
                  <input
                    type="number"
                    min="1"
                    value={totalDays}
                    onChange={(e) => setTotalDays(e.target.value)}
                    required
                    className="ui-input w-full"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Reason for Leave</label>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Briefly state your reason..."
                    className="ui-input w-full"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowApplyModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? "Submitting..." : "Submit Application"}
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

export default function LeavesPage() {
  const { user, hydrated } = useAuth();
  if (hydrated && user && !user.is_superadmin) {
    return <EmployeeLeavePortal />;
  }

  const [tab, setTab] = useState<TabKey>("balances");

  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);

  // Data
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<BalanceSummary[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [adjustments, setAdjustments] = useState<LeaveAdjustment[]>([]);
  const [accruals, setAccruals] = useState<LeaveAccrual[]>([]);

  // Filters
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);

  // Modals
  const [showCreateRequest, setShowCreateRequest] = useState(false);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showProcessAccrual, setShowProcessAccrual] = useState(false);
  const [rejectModal, setRejectModal] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Approve Modal
  const [approveModal, setApproveModal] = useState<LeaveRequest | null>(null);
  const [approveTypeCode, setApproveTypeCode] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);

  // Create request form
  const [reqEmp, setReqEmp] = useState("");
  const [reqType, setReqType] = useState("");
  const [reqStart, setReqStart] = useState("");
  const [reqEnd, setReqEnd] = useState("");
  const [reqDays, setReqDays] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [reqOverride, setReqOverride] = useState(false);
  const [reqLoading, setReqLoading] = useState(false);

  useEffect(() => {
    if (reqStart && reqEnd) {
      const start = new Date(reqStart);
      const end = new Date(reqEnd);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
        const diffMs = end.getTime() - start.getTime();
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
        setReqDays(String(days));
      }
    }
  }, [reqStart, reqEnd]);

  // Adjustment form
  const [adjEmp, setAdjEmp] = useState("");
  const [adjType, setAdjType] = useState("");
  const [adjAction, setAdjAction] = useState("add");
  const [adjDays, setAdjDays] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjLoading, setAdjLoading] = useState(false);

  // Accrual form
  const [accrMonth, setAccrMonth] = useState(new Date().getMonth() + 1);
  const [accrYear, setAccrYear] = useState(new Date().getFullYear());
  const [accrLoading, setAccrLoading] = useState(false);

  const load = async () => {
    try {
      const [typesRes, balRes, reqRes, adjRes, accrRes] = await Promise.all([
        fetchWithAuth("/payroll/leave-types"),
        fetchWithAuth(`/payroll/leave-balances/summary?year=${filterYear}`),
        fetchWithAuth("/payroll/leave-requests"),
        fetchWithAuth("/payroll/leave-adjustments"),
        fetchWithAuth(`/payroll/leave-accruals?year=${filterYear}`),
      ]);
      if (typesRes.status === 403) return setNoAccess(true);
      if (typesRes.ok) setLeaveTypes(await typesRes.json());
      if (balRes.ok) setBalances(await balRes.json());
      if (reqRes.ok) setRequests(await reqRes.json());
      if (adjRes.ok) setAdjustments(await adjRes.json());
      if (accrRes.ok) setAccruals(await accrRes.json());
    } catch {
      toast.error("Failed to load leave data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ─── Filtering ─────────────────────────────────────────────

  const filteredBalances = useMemo(() => {
    let result = balances;
    if (filterEmp) result = result.filter((b) => b.employee_id === filterEmp);
    return result;
  }, [balances, filterEmp]);

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (filterEmp) result = result.filter((r) => r.employee_id === filterEmp);
    if (filterStatus) result = result.filter((r) => r.status === filterStatus);
    if (filterType) result = result.filter((r) => r.leave_type_code === filterType);
    return result;
  }, [requests, filterEmp, filterStatus, filterType]);

  const filteredAdjustments = useMemo(() => {
    let result = adjustments;
    if (filterEmp) result = result.filter((a) => a.employee_id === filterEmp);
    if (filterType) result = result.filter((a) => a.leave_type_code === filterType);
    return result;
  }, [adjustments, filterEmp, filterType]);

  const filteredAccruals = useMemo(() => {
    let result = accruals;
    if (filterEmp) result = result.filter((a) => a.employee_id === filterEmp);
    if (filterType) result = result.filter((a) => a.leave_type_code === filterType);
    return result;
  }, [accruals, filterEmp, filterType]);

  const currentData = tab === "balances" ? filteredBalances
    : tab === "requests" ? filteredRequests
    : tab === "adjustments" ? filteredAdjustments
    : filteredAccruals;

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return currentData.slice(start, start + PAGE_SIZE) as any[];
  }, [currentData, page, tab]);

  const totalPages = Math.max(1, Math.ceil(currentData.length / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [tab, filterEmp, filterStatus, filterType, filterYear]);

  // ─── Actions ───────────────────────────────────────────────

  const handleConfirmApprove = async () => {
    if (!approveModal) return;
    setApproveLoading(true);
    try {
      const res = await fetchWithAuth(`/payroll/leave-requests/${approveModal.id}/approve`, {
        method: "PUT",
        body: JSON.stringify({ leave_type_code: approveTypeCode }),
      });
      if (res.ok) {
        toast.success("Leave approved successfully");
        setApproveModal(null);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to approve");
      }
    } catch {
      toast.error("Failed to approve");
    } finally {
      setApproveLoading(false);
    }
  };

  const rejectLeave = async (id: string) => {
    try {
      const res = await fetchWithAuth(`/payroll/leave-requests/${id}/reject`, {
        method: "PUT",
        body: JSON.stringify({ rejection_reason: rejectReason || null }),
      });
      if (res.ok) {
        toast.success("Leave rejected");
        setRejectModal(null);
        setRejectReason("");
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to reject");
      }
    } catch { toast.error("Failed to reject"); }
  };

  const cancelLeave = async (id: string) => {
    if (!confirm("Cancel this leave request?")) return;
    try {
      const res = await fetchWithAuth(`/payroll/leave-requests/${id}/cancel`, { method: "PUT" });
      if (res.ok) {
        toast.success("Leave cancelled");
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to cancel");
      }
    } catch { toast.error("Failed to cancel"); }
  };

  const deleteLeave = async (id: string) => {
    if (!confirm("Are you sure you want to delete this leave request? This action cannot be undone.")) return;
    try {
      const res = await fetchWithAuth(`/payroll/leave-requests/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Leave request deleted");
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to delete leave request");
      }
    } catch { toast.error("Failed to delete leave request"); }
  };


  const createRequest = async () => {
    if (!reqEmp) { toast.error("Select an employee"); return; }
    if (!reqType) { toast.error("Select leave type"); return; }
    if (!reqStart || !reqEnd) { toast.error("Select start and end dates"); return; }
    const days = parseInt(reqDays);
    if (!days || days < 1) { toast.error("Enter valid number of days"); return; }

    setReqLoading(true);
    try {
      const res = await fetchWithAuth("/payroll/leave-requests", {
        method: "POST",
        body: JSON.stringify({
          employee_id: reqEmp,
          leave_type_code: reqType,
          start_date: reqStart,
          end_date: reqEnd,
          total_days: days,
          reason: reqReason || null,
          is_override: reqOverride,
        }),
      });
      if (res.ok) {
        toast.success("Leave request created");
        setShowCreateRequest(false);
        resetReqForm();
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to create request");
      }
    } catch { toast.error("Failed to create request"); }
    finally { setReqLoading(false); }
  };

  const createAdjustment = async () => {
    if (!adjEmp) { toast.error("Select an employee"); return; }
    if (!adjType) { toast.error("Select leave type"); return; }
    const days = parseFloat(adjDays);
    if (!days || days <= 0) { toast.error("Enter valid days"); return; }
    if (!adjReason.trim()) { toast.error("Reason is required"); return; }

    setAdjLoading(true);
    try {
      const res = await fetchWithAuth("/payroll/leave-adjustments", {
        method: "POST",
        body: JSON.stringify({
          employee_id: adjEmp,
          leave_type_code: adjType,
          adjustment_type: adjAction,
          days,
          reason: adjReason,
        }),
      });
      if (res.ok) {
        toast.success("Adjustment created");
        setShowAdjustment(false);
        resetAdjForm();
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to create adjustment");
      }
    } catch { toast.error("Failed to create adjustment"); }
    finally { setAdjLoading(false); }
  };

  const processAccruals = async () => {
    setAccrLoading(true);
    try {
      const res = await fetchWithAuth(`/payroll/leave-accruals/process?month=${accrMonth}&year=${accrYear}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Created ${data.created} accrual records`);
        setShowProcessAccrual(false);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to process accruals");
      }
    } catch { toast.error("Failed to process accruals"); }
    finally { setAccrLoading(false); }
  };

  const resetReqForm = () => {
    setReqEmp(""); setReqType(""); setReqStart(""); setReqEnd("");
    setReqDays(""); setReqReason(""); setReqOverride(false);
  };

  const resetAdjForm = () => {
    setAdjEmp(""); setAdjType(""); setAdjAction("add"); setAdjDays(""); setAdjReason("");
  };

  const clearFilters = () => {
    setFilterEmp(""); setFilterStatus(""); setFilterType("");
  };

  // Auto-calc days from dates
  useEffect(() => {
    if (reqStart && reqEnd) {
      const start = new Date(reqStart);
      const end = new Date(reqEnd);
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) setReqDays(String(diff));
    }
  }, [reqStart, reqEnd]);

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <CalendarDays className="text-indigo-600" size={28} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
                <p className="text-sm text-gray-500">{currentData.length} records</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowProcessAccrual(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <RefreshCw size={14} /> Process Accruals
              </button>
              <button
                onClick={() => setShowAdjustment(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <SlidersHorizontal size={14} /> Adjustment
              </button>
              <button
                onClick={() => setShowCreateRequest(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm"
              >
                <Plus size={16} /> Leave Request
              </button>
              <Link
                href="/payroll/leaves/settings"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-xs transition-colors"
              >
                <Settings size={14} /> Leave Settings
              </Link>
            </div>
          </div>

          {noAccess && <AccessDenied />}

          {/* Tabs */}
          <div className="mb-4 flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                    tab === t.key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  <Icon size={14} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="mb-5 space-y-4 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <Filter size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Filter Records</h3>
                  <p className="text-xs text-slate-500">Search by employee, status, leave category, or financial year</p>
                </div>
              </div>

              {(filterEmp || filterStatus || filterType || filterYear !== new Date().getFullYear()) && (
                <button
                  onClick={() => {
                    clearFilters();
                    setFilterYear(new Date().getFullYear());
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  <X size={13} /> Reset Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Employee</label>
                <EmployeeSelect value={filterEmp} onChange={setFilterEmp} />
              </div>

              {tab === "requests" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Leave Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">All Leave Types</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.code}>{lt.name} ({lt.code.toUpperCase()})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Year</label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                  <option value={2024}>2024</option>
                </select>
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : currentData.length === 0 ? (
            <p className="text-gray-500">No records found.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {/* Balances Table */}
              {tab === "balances" && (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3" rowSpan={2}>Employee</th>
                      <th className="px-4 py-1 text-center border-b border-gray-200" colSpan={3}>Annual Leave</th>
                      <th className="px-4 py-1 text-center border-b border-gray-200" colSpan={3}>Casual Leave</th>
                      <th className="px-4 py-1 text-center border-b border-gray-200" colSpan={3}>Sick Leave</th>
                    </tr>
                    <tr>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Accrued</th>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Used</th>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Available</th>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Accrued</th>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Used</th>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Available</th>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Accrued</th>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Used</th>
                      <th className="px-2 py-1 text-xs font-medium text-gray-400">Available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paged.map((b: BalanceSummary) => (
                      <tr key={b.employee_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600">
                            <Users size={14} /> {b.employee_id}
                          </span>
                          <p className="text-xs text-gray-500">{b.employee_name}</p>
                        </td>
                        <td className="px-2 py-3 text-center">{fmt(b.annual_accrued)}</td>
                        <td className="px-2 py-3 text-center">{fmt(b.annual_consumed)}</td>
                        <td className="px-2 py-3 text-center font-medium">
                          <span className={Number(b.annual_available) <= 0 ? "text-red-600" : "text-emerald-600"}>
                            {fmt(b.annual_available)}
                          </span>
                          {!b.annual_eligible && <span className="ml-1 text-[10px] text-amber-500" title="Not yet eligible (1 year service required)">*</span>}
                        </td>
                        <td className="px-2 py-3 text-center">{fmt(b.casual_accrued)}</td>
                        <td className="px-2 py-3 text-center">{fmt(b.casual_consumed)}</td>
                        <td className="px-2 py-3 text-center font-medium">
                          <span className={Number(b.casual_available) <= 0 ? "text-red-600" : "text-emerald-600"}>
                            {fmt(b.casual_available)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">{fmt(b.sick_accrued)}</td>
                        <td className="px-2 py-3 text-center">{fmt(b.sick_consumed)}</td>
                        <td className="px-2 py-3 text-center font-medium">
                          <span className={Number(b.sick_available) <= 0 ? "text-red-600" : "text-emerald-600"}>
                            {fmt(b.sick_available)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Requests Table */}
              {tab === "requests" && (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">From</th>
                      <th className="px-4 py-3">To</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paged.map((r: LeaveRequest) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600">
                            <Users size={14} /> {r.employee_id}
                          </span>
                          <p className="text-xs text-gray-500">{r.employee_name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-700">{r.leave_type_name}</span>
                          {r.is_override && (
                            <span className="ml-1 text-[10px] font-bold text-amber-600">OVERRIDE</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.start_date}</td>
                        <td className="px-4 py-3 text-gray-600">{r.end_date}</td>
                        <td className="px-4 py-3 font-bold">{r.total_days}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${statusBadge(r.status)}`}>
                            {r.status}
                          </span>
                          {r.status === "rejected" && r.rejection_reason && (
                            <p className="mt-0.5 text-[10px] text-red-500">{r.rejection_reason}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px] truncate">
                          {r.reason || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {r.status === "pending" && (
                              <>
                                <button
                                  onClick={() => {
                                    setApproveModal(r);
                                    setApproveTypeCode(r.leave_type_code);
                                  }}
                                  title="Approve"
                                  className="p-1.5 text-emerald-600 hover:text-emerald-800 cursor-pointer"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={() => { setRejectModal(r); setRejectReason(""); }}
                                  title="Reject"
                                  className="p-1.5 text-red-500 hover:text-red-700"
                                >
                                  <XCircle size={16} />
                                </button>
                                <button
                                  onClick={() => cancelLeave(r.id)}
                                  title="Cancel"
                                  className="p-1.5 text-gray-400 hover:text-gray-600"
                                >
                                  <Ban size={16} />
                                </button>
                              </>
                            )}
                            {r.status === "approved" && (
                              <button
                                onClick={() => cancelLeave(r.id)}
                                title="Cancel"
                                className="p-1.5 text-gray-400 hover:text-gray-600"
                              >
                                <Ban size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => deleteLeave(r.id)}
                              title="Delete Request"
                              className="p-1.5 text-rose-500 hover:text-rose-700 cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Adjustments Table */}
              {tab === "adjustments" && (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Leave Type</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Previous</th>
                      <th className="px-4 py-3">New Balance</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Adjusted By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paged.map((a: LeaveAdjustment) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600">
                            <Users size={14} /> {a.employee_id}
                          </span>
                          <p className="text-xs text-gray-500">{a.employee_name}</p>
                        </td>
                        <td className="px-4 py-3 font-medium">{a.leave_type_name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${adjTypeBadge(a.adjustment_type)}`}>
                            {a.adjustment_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold">{fmt(a.days)}</td>
                        <td className="px-4 py-3 text-gray-600">{fmt(a.previous_balance)}</td>
                        <td className="px-4 py-3 font-medium">{fmt(a.new_balance)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px] truncate">{a.reason}</td>
                        <td className="px-4 py-3 text-gray-600">{a.adjusted_by_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Accruals Table */}
              {tab === "accruals" && (
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Leave Type</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Days Accrued</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paged.map((a: LeaveAccrual) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600">
                            <Users size={14} /> {a.employee_id}
                          </span>
                          <p className="text-xs text-gray-500">{a.employee_name}</p>
                        </td>
                        <td className="px-4 py-3 font-medium">{a.leave_type_name}</td>
                        <td className="px-4 py-3 text-gray-600">{MONTHS[a.period_month - 1]} {a.period_year}</td>
                        <td className="px-4 py-3 text-gray-600">{a.accrual_date}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600">{fmt(a.days_accrued)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {currentData.length > PAGE_SIZE && (
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

          {/* ─── Create Leave Request Modal ─────────────────────── */}
          {showCreateRequest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">Create Leave Request</h2>
                  <button onClick={() => { setShowCreateRequest(false); resetReqForm(); }} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Employee *</label>
                    <EmployeeSelect value={reqEmp} onChange={setReqEmp} />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Leave Type *</label>
                    <select
                      value={reqType}
                      onChange={(e) => setReqType(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select...</option>
                      {leaveTypes.filter((lt) => lt.is_active).map((lt) => (
                        <option key={lt.id} value={lt.code}>{lt.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Start Date *</label>
                      <input
                        type="date"
                        value={reqStart}
                        onChange={(e) => setReqStart(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">End Date *</label>
                      <input
                        type="date"
                        value={reqEnd}
                        onChange={(e) => setReqEnd(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Total Days *</label>
                    <input
                      type="number"
                      value={reqDays}
                      onChange={(e) => setReqDays(e.target.value)}
                      min={1}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Reason</label>
                    <textarea
                      value={reqReason}
                      onChange={(e) => setReqReason(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reqOverride}
                      onChange={(e) => setReqOverride(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600"
                    />
                    <span className="text-sm text-gray-600">HR Override (bypass leave rules)</span>
                  </label>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => { setShowCreateRequest(false); resetReqForm(); }}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createRequest}
                      disabled={reqLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {reqLoading && (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      )}
                      Submit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Leave Adjustment Modal ─────────────────────────── */}
          {showAdjustment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">Leave Adjustment</h2>
                  <button onClick={() => { setShowAdjustment(false); resetAdjForm(); }} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Employee *</label>
                    <EmployeeSelect value={adjEmp} onChange={setAdjEmp} />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Leave Type *</label>
                    <select
                      value={adjType}
                      onChange={(e) => setAdjType(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select...</option>
                      {leaveTypes.map((lt) => (
                        <option key={lt.id} value={lt.code}>{lt.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Adjustment Type *</label>
                    <select
                      value={adjAction}
                      onChange={(e) => setAdjAction(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="add">Add Days</option>
                      <option value="deduct">Deduct Days</option>
                      <option value="correction">Correction</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Days *</label>
                    <input
                      type="number"
                      value={adjDays}
                      onChange={(e) => setAdjDays(e.target.value)}
                      min={0.5}
                      step={0.5}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Reason *</label>
                    <textarea
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value)}
                      rows={2}
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => { setShowAdjustment(false); resetAdjForm(); }}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={createAdjustment}
                      disabled={adjLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {adjLoading && (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      )}
                      Apply Adjustment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Process Accruals Modal ─────────────────────────── */}
          {showProcessAccrual && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">Process Monthly Accruals</h2>
                  <button onClick={() => setShowProcessAccrual(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                <p className="mb-4 text-sm text-gray-500">
                  This will credit leave days to all active employees for the selected month. Duplicate accruals for the same period are skipped automatically.
                </p>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Month</label>
                    <select
                      value={accrMonth}
                      onChange={(e) => setAccrMonth(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {MONTHS.map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Year</label>
                    <input
                      type="number"
                      value={accrYear}
                      onChange={(e) => setAccrYear(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowProcessAccrual(false)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={processAccruals}
                    disabled={accrLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {accrLoading && (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    )}
                    Process
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Reject Modal ───────────────────────────────────── */}
          {rejectModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Reject Leave</h2>
                  <button onClick={() => setRejectModal(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>
                <p className="mb-3 text-sm text-gray-600">
                  Rejecting leave for <span className="font-semibold">{rejectModal.employee_name}</span> ({rejectModal.leave_type_name}, {rejectModal.total_days} days).
                </p>
                <div className="mb-4">
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Rejection Reason</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="Optional reason..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setRejectModal(null)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => rejectLeave(rejectModal.id)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Approve Modal ───────────────────────────────────── */}
          {approveModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-lg font-bold text-gray-900">Approve Leave Request</h2>
                  <button onClick={() => setApproveModal(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
                  <p><span className="font-semibold text-slate-700">Employee:</span> {approveModal.employee_name} ({approveModal.employee_id})</p>
                  <p><span className="font-semibold text-slate-700">Dates:</span> {approveModal.start_date} to {approveModal.end_date} ({approveModal.total_days} days)</p>
                  {approveModal.reason && <p><span className="font-semibold text-slate-700">Reason:</span> {approveModal.reason}</p>}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    Approved Leave Type (Change if needed)
                  </label>
                  <select
                    value={approveTypeCode}
                    onChange={(e) => setApproveTypeCode(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {leaveTypes.filter(lt => lt.is_active).map((lt) => (
                      <option key={lt.id} value={lt.code}>
                        {lt.name} ({lt.code.toUpperCase()})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Originally applied as: <span className="font-bold text-indigo-600">{approveModal.leave_type_name}</span>
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setApproveModal(null)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmApprove}
                    disabled={approveLoading}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {approveLoading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                    Confirm & Approve
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

"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import AccountStatusBanner from "@/components/AccountStatusBanner";
import { useEmployeeSelf, formatDate } from "@/hooks/useEmployeeSelf";
import { fetchWithAuth } from "@/utils/api";
import {
  FileText, Download, CalendarDays, PiggyBank, HandCoins, Wallet, TrendingUp,
  Plus, X, Clock, Loader2, Lock, ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";

interface PayslipData {
  id: string;
  month: number;
  year: number;
  net_pay: number;
  status: string;
  generated_at: string;
}

interface LeaveBalanceItem {
  leave_type: string;
  leave_type_code: string;
  accrued: number;
  consumed: number;
  adjusted: number;
  available: number;
  eligible: boolean;
  eligibility_note?: string;
}

interface LeaveRequestItem {
  id: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason?: string;
  status: string;
  created_at: string;
}

interface ESPBalanceData {
  total_employee_contributions: number;
  total_employer_contributions: number;
  total_withdrawn: number;
  current_balance: number;
}

interface ESPContributionItem {
  id: string;
  payroll_period_month: number;
  payroll_period_year: number;
  employee_contribution_amount: number;
  employer_matching_amount: number;
  total_contribution: number;
}

interface ESPWithdrawalItem {
  id: string;
  requested_amount: number;
  reason: string;
  status: string;
  requested_at: string;
}

interface LoanItem {
  id: string;
  loan_amount: number;
  monthly_installment?: number;
  status: string;
  total_paid: number;
  total_remaining: number;
  required_date?: string;
  start_date?: string;
  offered_amount?: number;
  reason?: string;
}

const monthNames = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function formatCurrency(value: number | undefined) {
  if (value === undefined || value === null) return "—";
  return `PKR ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function statusBadge(status: string) {
  const base = "inline-block px-2.5 py-1 rounded-full text-xs font-semibold";
  switch (status) {
    case "active":
      return <span className={`${base} bg-blue-50 text-blue-800 border border-blue-200`}>Active</span>;
    case "completed":
    case "paid":
      return <span className={`${base} bg-emerald-50 text-emerald-700 border border-emerald-200`}>Completed</span>;
    case "pending":
      return <span className={`${base} bg-amber-50 text-amber-700 border border-amber-200`}>Pending Review</span>;
    case "offered":
      return <span className={`${base} bg-purple-50 text-purple-700 border border-purple-200`}>Offer Proposed</span>;
    case "agreed":
      return <span className={`${base} bg-indigo-50 text-indigo-700 border border-indigo-200`}>Docs Required</span>;
    case "documents_submitted":
      return <span className={`${base} bg-cyan-50 text-cyan-700 border border-cyan-200`}>Docs Under Review</span>;
    case "approved":
      return <span className={`${base} bg-teal-50 text-teal-700 border border-teal-200`}>Approved</span>;
    case "rejected":
    case "cancelled":
    case "overdue":
      return <span className={`${base} bg-rose-50 text-rose-600 border border-rose-200`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
    default:
      return <span className={`${base} bg-slate-50 text-slate-600 border border-slate-200`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
  }
}

export default function MyPayslipsPage() {
  const { employee, isPending, isRejected, isSuspended } = useEmployeeSelf();

  const [payslips, setPayslips] = useState<PayslipData[]>([]);
  const [payslipsLoading, setPayslipsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceItem[]>([]);
  const [leaveBalanceLoading, setLeaveBalanceLoading] = useState(true);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestItem[]>([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(true);

  const [espBalance, setEspBalance] = useState<ESPBalanceData | null>(null);
  const [espBalanceLoading, setEspBalanceLoading] = useState(true);
  const [espContributions, setEspContributions] = useState<ESPContributionItem[]>([]);
  const [espContributionsLoading, setEspContributionsLoading] = useState(true);
  const [espWithdrawals, setEspWithdrawals] = useState<ESPWithdrawalItem[]>([]);
  const [espWithdrawalsLoading, setEspWithdrawalsLoading] = useState(true);

  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [loansLoading, setLoansLoading] = useState(true);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const [leaveForm, setLeaveForm] = useState({
    leave_type_code: "", start_date: "", end_date: "", total_days: "", reason: "",
  });
  const [loanForm, setLoanForm] = useState({
    loan_amount: "",
    required_date: new Date().toISOString().slice(0, 10),
    reason: "",
  });
  const [withdrawalForm, setWithdrawalForm] = useState({ requested_amount: "", reason: "" });

  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [submittingLoan, setSubmittingLoan] = useState(false);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  const [toggles, setToggles] = useState({ allow_loan_requests: true, allow_esp_withdrawal_requests: true });

  useEffect(() => {
    fetchWithAuth("/payroll/system-toggles")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setToggles(data); })
      .catch(() => {});

    const fetchPayslips = async () => {
      try {
        const res = await fetchWithAuth("/payroll/payslip/my");
        if (res.ok) {
          const data = await res.json();
          setPayslips(Array.isArray(data) ? data : []);
        }
      } catch {
        // silent
      } finally {
        setPayslipsLoading(false);
      }
    };
    fetchPayslips();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const targetId = window.location.hash.replace("#", "");
      const timer = setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [espBalanceLoading, payslipsLoading]);


  const fetchLeaveData = async () => {
    try {
      const [balRes, reqRes] = await Promise.all([
        fetchWithAuth("/payroll/leave/my-balance"),
        fetchWithAuth("/payroll/leave/my-requests"),
      ]);
      if (balRes.ok) setLeaveBalance(await balRes.json());
      if (reqRes.ok) setLeaveRequests(await reqRes.json());
    } catch {
      // silent
    } finally {
      setLeaveBalanceLoading(false);
      setLeaveRequestsLoading(false);
    }
  };

  const fetchESPData = async () => {
    try {
      const [balRes, contribRes, withdrawalRes] = await Promise.all([
        fetchWithAuth("/payroll/esp/my-balance"),
        fetchWithAuth("/payroll/esp/my-contributions"),
        fetchWithAuth("/payroll/esp/my-withdrawals"),
      ]);
      if (balRes.ok) setEspBalance(await balRes.json());
      if (contribRes.ok) setEspContributions(await contribRes.json());
      if (withdrawalRes.ok) setEspWithdrawals(await withdrawalRes.json());
    } catch {
      // silent
    } finally {
      setEspBalanceLoading(false);
      setEspContributionsLoading(false);
      setEspWithdrawalsLoading(false);
    }
  };

  const fetchLoans = async () => {
    try {
      const res = await fetchWithAuth("/payroll/loans/my-loans");
      if (res.ok) setLoans(await res.json());
    } catch {
      // silent
    } finally {
      setLoansLoading(false);
    }
  };

  useEffect(() => { fetchLeaveData(); }, []);
  useEffect(() => { fetchESPData(); }, []);
  useEffect(() => { fetchLoans(); }, []);

  const downloadPayslip = async (id: string) => {
    setDownloadingId(id);
    try {
      const res = await fetchWithAuth(`/payroll/payslip/my/${id}/pdf`);
      if (!res.ok) return toast.error("Failed to download payslip");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payslip-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  };

  const calcLeaveDays = (start: string, end: string) => {
    if (!start || !end) return "";
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
    if (e < s) return "";
    const diffTime = e.getTime() - s.getTime();
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return String(days);
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee?.employee_id) return toast.error("Employee not loaded");
    if (!leaveForm.leave_type_code) return toast.error("Select a leave type");
    if (!leaveForm.start_date || !leaveForm.end_date) return toast.error("Select start and end dates");
    const totalDays = parseInt(leaveForm.total_days, 10);
    if (isNaN(totalDays) || totalDays < 1) return toast.error("Total days must be at least 1");

    setSubmittingLeave(true);
    try {
      const res = await fetchWithAuth("/payroll/leave/my-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employee.employee_id,
          leave_type_code: leaveForm.leave_type_code,
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          total_days: totalDays,
          reason: leaveForm.reason || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Leave request submitted");
        setShowLeaveModal(false);
        setLeaveForm({ leave_type_code: "", start_date: "", end_date: "", total_days: "", reason: "" });
        await fetchLeaveData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || err.error || "Failed to submit leave request");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to submit leave request");
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee?.employee_id) return toast.error("Employee not loaded");
    const loanAmount = parseFloat(loanForm.loan_amount);
    if (isNaN(loanAmount) || loanAmount <= 0) return toast.error("Loan amount must be positive");
    if (!loanForm.required_date) return toast.error("Select loan requirement date");

    setSubmittingLoan(true);
    try {
      const res = await fetchWithAuth("/payroll/loans/my-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loan_amount: loanAmount,
          required_date: loanForm.required_date,
          reason: loanForm.reason || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Loan request submitted successfully!");
        setShowLoanModal(false);
        setLoanForm({
          loan_amount: "",
          required_date: new Date().toISOString().slice(0, 10),
          reason: "",
        });
        await fetchLoans();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || err.error || "Failed to submit loan request");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to submit loan request");
    } finally {
      setSubmittingLoan(false);
    }
  };

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee?.employee_id) return toast.error("Employee not loaded");
    const amount = parseFloat(withdrawalForm.requested_amount);
    if (isNaN(amount) || amount <= 0) return toast.error("Amount must be positive");
    if (!withdrawalForm.reason.trim()) return toast.error("Reason is required");

    setSubmittingWithdrawal(true);
    try {
      const res = await fetchWithAuth("/payroll/esp/my-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employee.employee_id,
          requested_amount: amount,
          reason: withdrawalForm.reason,
        }),
      });
      if (res.ok) {
        toast.success("ESP withdrawal request submitted");
        setShowWithdrawalModal(false);
        setWithdrawalForm({ requested_amount: "", reason: "" });
        await fetchESPData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || err.error || "Failed to submit withdrawal request");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to submit withdrawal request");
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  const closeLeaveModal = () => {
    setShowLeaveModal(false);
    setLeaveForm({ leave_type_code: "", start_date: "", end_date: "", total_days: "", reason: "" });
  };
  const closeLoanModal = () => {
    setShowLoanModal(false);
    setLoanForm({
      loan_amount: "",
      required_date: new Date().toISOString().slice(0, 10),
      reason: "",
    });
  };
  const closeWithdrawalModal = () => {
    setShowWithdrawalModal(false);
    setWithdrawalForm({ requested_amount: "", reason: "" });
  };

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
        <AccountStatusBanner isPending={isPending} isRejected={isRejected} isSuspended={isSuspended} />

        <div>
          <h1 className="page-title">My Payslips</h1>
          <p className="page-subtitle">Payslips, leave, provident fund, and loans.</p>
        </div>

        {/* My Payslips */}
        <div className="ui-card p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <FileText size={20} className="text-theme-800" />
            My Payslips
          </h2>
          {payslipsLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : payslips.length === 0 ? (
            <p className="text-sm text-slate-400">No payslips available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="ui-table-head border-b border-gray-100">
                    <th className="ui-table-head">Period</th>
                    <th className="ui-table-head">Status</th>
                    <th className="ui-table-head">Net Pay</th>
                    <th className="ui-table-head"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payslips.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="ui-table-cell font-medium text-slate-800">{monthNames[p.month]} {p.year}</td>
                      <td className="ui-table-cell">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                          p.status === "paid" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-800"
                        }`}>
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                      </td>
                      <td className="ui-table-cell font-medium text-slate-800">{Number(p.net_pay).toLocaleString()}</td>
                      <td className="ui-table-cell text-right">
                        <button
                          onClick={() => downloadPayslip(p.id)}
                          disabled={downloadingId === p.id}
                          className="btn-secondary py-1.5 px-3 text-xs"
                        >
                          <Download size={14} />
                          {downloadingId === p.id ? "..." : "Download"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Leave Balance */}
        <div className="ui-card p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CalendarDays size={20} className="text-theme-800" />
              Leave Balance
            </h2>
            <button
              onClick={() => setShowLeaveModal(true)}
              disabled={leaveBalanceLoading || leaveBalance.length === 0}
              className="btn-primary"
            >
              <Plus size={16} /> Apply Leave
            </button>
          </div>
          {leaveBalanceLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : leaveBalance.length === 0 ? (
            <p className="text-sm text-slate-400">No leave balance available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leaveBalance.map((b, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-800">{b.leave_type}</p>
                    {statusBadge(b.eligible ? "approved" : "pending")}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase">Accrued</p>
                      <p className="text-base font-bold text-slate-900">{Number(b.accrued).toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase">Consumed</p>
                      <p className="text-base font-bold text-rose-600">{Number(b.consumed).toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase">Available</p>
                      <p className="text-base font-bold text-emerald-600">{Number(b.available).toFixed(1)}</p>
                    </div>
                  </div>
                  {b.eligibility_note && (
                    <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">{b.eligibility_note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Leave Requests */}
        <div className="ui-card p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Clock size={20} className="text-theme-800" />
            My Leave Requests
          </h2>
          {leaveRequestsLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : leaveRequests.length === 0 ? (
            <p className="text-sm text-slate-400">No leave requests found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="ui-table-head border-b border-gray-100">
                    <th className="ui-table-head">Type</th>
                    <th className="ui-table-head">Period</th>
                    <th className="ui-table-head">Days</th>
                    <th className="ui-table-head">Status</th>
                    <th className="ui-table-head">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaveRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="ui-table-cell font-medium text-slate-800">{r.leave_type_name}</td>
                      <td className="ui-table-cell text-slate-600">{formatDate(r.start_date)} — {formatDate(r.end_date)}</td>
                      <td className="ui-table-cell font-medium text-slate-800">{r.total_days}</td>
                      <td className="ui-table-cell">{statusBadge(r.status)}</td>
                      <td className="ui-table-cell text-slate-500 truncate max-w-xs">{r.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ESP Summary */}
        <div id="esp" className="ui-card p-6 md:p-8 scroll-mt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <PiggyBank size={20} className="text-theme-800" />
              ESP Summary
            </h2>
            {toggles.allow_esp_withdrawal_requests && (
              <button
                onClick={() => setShowWithdrawalModal(true)}
                disabled={espBalanceLoading || !espBalance}
                className="btn-primary"
              >
                <Plus size={16} /> Request Withdrawal
              </button>
            )}


          </div>
          {espBalanceLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : !espBalance ? (
            <p className="text-sm text-slate-400">No ESP balance available.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="border border-gray-100 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Employee Contribution</p>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(espBalance.total_employee_contributions)}</p>
                </div>
                <div className="border border-gray-100 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Employer Contribution</p>
                  <p className="text-lg font-bold text-slate-900">{formatCurrency(espBalance.total_employer_contributions)}</p>
                </div>
                <div className="border border-gray-100 rounded-xl p-4 text-center bg-emerald-50/50">
                  <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Current Balance</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(espBalance.current_balance)}</p>
                </div>
              </div>

              <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-slate-400" />
                Monthly ESP Deductions &amp; Contributions
              </h3>
              {espContributionsLoading ? (
                <p className="text-sm text-slate-400 mb-6">Loading...</p>
              ) : espContributions.length === 0 ? (
                <p className="text-sm text-slate-400 mb-6">No contributions yet.</p>
              ) : (
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="ui-table-head border-b border-gray-100">
                        <th className="ui-table-head">Period</th>
                        <th className="ui-table-head">Employee Deduction</th>
                        <th className="ui-table-head">Employer Matching</th>
                        <th className="ui-table-head">Total ESP</th>
                        <th className="ui-table-head">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {espContributions.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="ui-table-cell font-medium text-slate-800">{monthNames[c.payroll_period_month]} {c.payroll_period_year}</td>
                          <td className="ui-table-cell font-semibold text-slate-800">{formatCurrency(c.employee_contribution_amount)}</td>
                          <td className="ui-table-cell text-slate-600">{formatCurrency(c.employer_matching_amount)}</td>
                          <td className="ui-table-cell font-bold text-emerald-600">{formatCurrency(c.total_contribution)}</td>
                          <td className="ui-table-cell">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Deducted &amp; Credited
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Wallet size={16} className="text-slate-400" />
                Withdrawal Requests
              </h3>
              {espWithdrawalsLoading ? (
                <p className="text-sm text-slate-400">Loading...</p>
              ) : espWithdrawals.length === 0 ? (
                <p className="text-sm text-slate-400">No withdrawal requests found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="ui-table-head border-b border-gray-100">
                        <th className="ui-table-head">Requested Amount</th>
                        <th className="ui-table-head">Reason</th>
                        <th className="ui-table-head">Status</th>
                        <th className="ui-table-head">Requested At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {espWithdrawals.map((w) => (
                        <tr key={w.id} className="hover:bg-gray-50">
                          <td className="ui-table-cell font-medium text-slate-800">{formatCurrency(w.requested_amount)}</td>
                          <td className="ui-table-cell text-slate-500 truncate max-w-xs">{w.reason}</td>
                          <td className="ui-table-cell">{statusBadge(w.status)}</td>
                          <td className="ui-table-cell text-slate-600">{formatDate(w.requested_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* My Loans */}
        <div className="ui-card p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <HandCoins size={20} className="text-theme-800" />
              My Loans & Advances
            </h2>
            <div className="flex items-center gap-3">
              <a
                href="/payroll/loans"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 transition-colors"
              >
                Track & Verification Portal <ArrowRight size={14} />
              </a>
              {toggles.allow_loan_requests ? (
                <button onClick={() => setShowLoanModal(true)} disabled={loansLoading} className="btn-primary">
                  <Plus size={16} /> Request Loan
                </button>
              ) : (
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1.5">
                  <Lock size={13} className="text-amber-600" /> Requests Closed
                </span>
              )}
            </div>
          </div>

          {!toggles.allow_loan_requests && (
            <div className="mb-5 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-center gap-2.5 text-amber-900 text-xs">
              <Lock size={16} className="text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">Applications Closed: </span>
                <span>Loan and advance requests are currently disabled by administration. You can view your existing loans below.</span>
              </div>
            </div>
          )}

          {loansLoading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : loans.length === 0 ? (
            <p className="text-sm text-slate-400">No loans found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="ui-table-head border-b border-gray-100">
                    <th className="ui-table-head">Loan Amount</th>
                    <th className="ui-table-head">Monthly Deduction</th>
                    <th className="ui-table-head">Status</th>
                    <th className="ui-table-head">Total Paid</th>
                    <th className="ui-table-head">Remaining</th>
                    <th className="ui-table-head text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loans.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="ui-table-cell font-bold text-slate-800">{formatCurrency(l.loan_amount)}</td>
                      <td className="ui-table-cell text-slate-600">{formatCurrency(l.monthly_installment)}</td>
                      <td className="ui-table-cell">{statusBadge(l.status)}</td>
                      <td className="ui-table-cell text-emerald-600 font-medium">{formatCurrency(l.total_paid)}</td>
                      <td className="ui-table-cell text-rose-600 font-medium">{formatCurrency(l.total_remaining)}</td>
                      <td className="ui-table-cell text-right">
                        <a
                          href="/payroll/loans"
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          View Details <ArrowRight size={12} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Apply Leave Modal */}
        {showLeaveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-100">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h3 className="text-lg font-bold text-slate-900">Apply Leave</h3>
                <button onClick={closeLeaveModal} className="text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleLeaveSubmit} className="p-5 flex flex-col gap-4">
                <div>
                  <label className="form-label">Leave Type</label>
                  <select
                    value={leaveForm.leave_type_code}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, leave_type_code: e.target.value }))}
                    className="form-input"
                    required
                  >
                    <option value="">Select leave type</option>
                    {leaveBalance.map((b) => (
                      <option key={b.leave_type_code} value={b.leave_type_code}>
                        {b.leave_type} {b.eligible ? `(${Number(b.available).toFixed(1)} available)` : "(not eligible)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Start Date</label>
                    <input
                      type="date"
                      value={leaveForm.start_date}
                      onChange={(e) => {
                        const start = e.target.value;
                        setLeaveForm((f) => ({ ...f, start_date: start, total_days: calcLeaveDays(start, f.end_date) }));
                      }}
                      className="form-input"
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">End Date</label>
                    <input
                      type="date"
                      value={leaveForm.end_date}
                      onChange={(e) => {
                        const end = e.target.value;
                        setLeaveForm((f) => ({ ...f, end_date: end, total_days: calcLeaveDays(f.start_date, end) }));
                      }}
                      className="form-input"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">Total Days</label>
                  <input
                    type="number"
                    min={1}
                    value={leaveForm.total_days}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, total_days: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Reason</label>
                  <textarea
                    value={leaveForm.reason}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
                    className="form-input h-auto py-2.5 resize-y"
                    placeholder="Optional reason"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={closeLeaveModal} disabled={submittingLeave} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={submittingLeave} className="btn-primary">
                    {submittingLeave ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {submittingLeave ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Request Loan Modal */}
        {showLoanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-100">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h3 className="text-lg font-bold text-slate-900">Request Loan / Advance</h3>
                <button onClick={closeLoanModal} className="text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleLoanSubmit} className="p-5 flex flex-col gap-4">
                <div>
                  <label className="form-label">Loan Amount (PKR) <span className="text-rose-500">*</span></label>
                  <input
                    type="number" min={1} step="0.01"
                    value={loanForm.loan_amount}
                    onChange={(e) => setLoanForm((f) => ({ ...f, loan_amount: e.target.value }))}
                    className="form-input"
                    placeholder="e.g. 50000"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Loan Requirement Date <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    value={loanForm.required_date}
                    onChange={(e) => setLoanForm((f) => ({ ...f, required_date: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Reason for Loan</label>
                  <textarea
                    rows={3}
                    value={loanForm.reason}
                    onChange={(e) => setLoanForm((f) => ({ ...f, reason: e.target.value }))}
                    className="form-input h-auto py-2.5 resize-y"
                    placeholder="State reason for advance..."
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                  <button type="button" onClick={closeLoanModal} disabled={submittingLoan} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={submittingLoan} className="btn-primary">
                    {submittingLoan ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {submittingLoan ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Request ESP Withdrawal Modal */}
        {showWithdrawalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h3 className="text-lg font-bold text-slate-900">Request ESP Withdrawal</h3>
                <button onClick={closeWithdrawalModal} className="text-slate-400 hover:text-slate-700">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleWithdrawalSubmit} className="p-5 flex flex-col gap-4">
                <div>
                  <label className="form-label">Requested Amount (PKR)</label>
                  <input
                    type="number" min={1} step="0.01"
                    value={withdrawalForm.requested_amount}
                    onChange={(e) => setWithdrawalForm((f) => ({ ...f, requested_amount: e.target.value }))}
                    className="form-input"
                    required
                  />
                  {espBalance && (
                    <p className="text-xs text-slate-500 mt-1.5">
                      Available balance: {formatCurrency(espBalance.current_balance)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label">Reason</label>
                  <textarea
                    value={withdrawalForm.reason}
                    onChange={(e) => setWithdrawalForm((f) => ({ ...f, reason: e.target.value }))}
                    className="form-input h-auto py-2.5 resize-y"
                    placeholder="Reason for withdrawal"
                    required
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={closeWithdrawalModal} disabled={submittingWithdrawal} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={submittingWithdrawal} className="btn-primary">
                    {submittingWithdrawal ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {submittingWithdrawal ? "Submitting..." : "Submit"}
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

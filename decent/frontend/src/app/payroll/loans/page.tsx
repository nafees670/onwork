"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import EmployeeSelect from "@/components/EmployeeSelect";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
  HandCoins, Plus, X, Eye, Pencil, Trash2, AlertCircle, Lock, Unlock,
  ChevronLeft, ChevronRight, Users, Filter, Calendar,
  TrendingUp, Clock, CheckCircle2, AlertTriangle, RefreshCw,
  Upload, FileText, Check, ShieldCheck, ArrowRight, Loader2, DollarSign,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";

type LoanSummary = {
  id: string;
  employee_id: string;
  employee_name: string;
  loan_amount: string;
  required_date?: string | null;
  start_date?: string | null;
  monthly_installment?: string | null;
  num_installments?: number | null;
  first_deduction_month?: number | null;
  first_deduction_year?: number | null;
  status: string;
  total_paid: string;
  total_remaining: string;
  offered_amount?: string | null;
  admin_notes?: string | null;
  terms_accepted?: boolean;
  terms_accepted_at?: string | null;
  cnic_front_url?: string | null;
  cnic_back_url?: string | null;
  guarantor_name?: string | null;
  guarantor_phone?: string | null;
  guarantor_cnic?: string | null;
  guarantor_cnic_front_url?: string | null;
  guarantor_cnic_back_url?: string | null;
  documents_submitted_at?: string | null;
  disbursement_receipt_url?: string | null;
  satisfied_rating?: boolean;
  disbursed_at?: string | null;
  reason?: string | null;
  created_at: string;
};

type Installment = {
  id: string;
  installment_number: number;
  due_month: number;
  due_year: number;
  due_date: string;
  installment_amount: string;
  paid_amount: string;
  remaining_amount: string;
  status: string;
  deferral_reason?: string | null;
  deferred_by_name?: string | null;
};

type LoanDetail = LoanSummary & {
  installment_frequency?: string;
  notes?: string | null;
  created_by_name?: string | null;
  paid_installments: number;
  remaining_installments: number;
  installments: Installment[];
};

type LoanPayment = {
  id: string;
  employee_id: string;
  loan_id: string;
  installment_id: string;
  installment_number: number;
  payslip_id: string | null;
  amount: string;
  payment_date: string;
  payroll_period_month: number | null;
  payroll_period_year: number | null;
  remaining_balance: string;
  notes: string | null;
};

type Dashboard = {
  total_active_loans: number;
  total_outstanding: string;
  total_monthly_deductions: string;
  fully_paid_loans: number;
  pending_installments: number;
  overdue_installments: number;
};

type PreviewItem = {
  installment_number: number;
  due_month: number;
  due_year: number;
  due_date: string;
  installment_amount: string;
};

type PreviewData = {
  loan_amount: string;
  num_installments: number;
  monthly_installment: string;
  schedule: PreviewItem[];
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PAGE_SIZE = 20;

const fmt = (v?: string | null) =>
  v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending Review", cls: "bg-amber-100 text-amber-800 border border-amber-300" },
    offered: { label: "Offer Proposed", cls: "bg-purple-100 text-purple-800 border border-purple-300" },
    agreed: { label: "Terms Accepted (Upload Docs)", cls: "bg-indigo-100 text-indigo-800 border border-indigo-300" },
    documents_submitted: { label: "Docs Under Review", cls: "bg-cyan-100 text-cyan-800 border border-cyan-300" },
    approved: { label: "Approved (Disbursement)", cls: "bg-teal-100 text-teal-800 border border-teal-300" },
    active: { label: "Active", cls: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
    completed: { label: "Completed", cls: "bg-blue-100 text-blue-800 border border-blue-300" },
    rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-800 border border-rose-300" },
    cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-700 border border-gray-300" },
  };
  const item = map[status] || { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${item.cls}`}>
      {item.label}
    </span>
  );
};

const instStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 border border-amber-200",
    paid: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    partially_paid: "bg-blue-100 text-blue-700 border border-blue-200",
    overdue: "bg-rose-100 text-rose-700 border border-rose-200",
    deferred: "bg-purple-100 text-purple-700 border border-purple-200",
    waived: "bg-gray-100 text-gray-500 border border-gray-200",
  };
  return map[status] || "bg-gray-100 text-gray-500";
};

// ─── File Upload Box Helper Component ────────────────────────
function FileUploadBox({
  label,
  value,
  onChange,
  accept = "image/*,.pdf",
  required = false,
}: {
  label: string;
  value?: string | null;
  onChange: (url: string) => void;
  accept?: string;
  required?: boolean;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10 MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetchWithAuth("/payroll/loans/upload-document", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        onChange(data.url);
        toast.success(`${label} uploaded`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
        <span>{label} {required && <span className="text-rose-500">*</span>}</span>
        {value && (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-normal"
          >
            <Eye size={12} /> View File
          </a>
        )}
      </label>
      <div className="flex items-center gap-2">
        <label className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed text-xs cursor-pointer transition-colors ${
          value ? "border-emerald-300 bg-emerald-50/40 text-emerald-800" : "border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-600"
        }`}>
          {uploading ? (
            <span className="flex items-center gap-1 text-slate-500"><Loader2 size={14} className="animate-spin" /> Uploading...</span>
          ) : value ? (
            <span className="flex items-center gap-1 font-medium text-emerald-700 truncate"><CheckCircle2 size={14} className="shrink-0" /> {value.split("/").pop()}</span>
          ) : (
            <span className="flex items-center gap-1"><Upload size={14} /> Choose Image or PDF</span>
          )}
          <input
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
            title="Remove"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Employee Self-Service Loan Portal ────────────────────────
function EmployeeLoanPortal() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggles, setToggles] = useState({ allow_loan_requests: false, allow_esp_withdrawal_requests: false });

  // Modals
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [activeOfferLoan, setActiveOfferLoan] = useState<LoanSummary | null>(null);
  const [activeDocsLoan, setActiveDocsLoan] = useState<LoanSummary | null>(null);
  const [activeDisbursementLoan, setActiveDisbursementLoan] = useState<LoanSummary | null>(null);
  const [viewScheduleLoan, setViewScheduleLoan] = useState<LoanDetail | null>(null);

  // Apply Form (Step 1: simplified)
  const [applyAmount, setApplyAmount] = useState("");
  const [applyRequiredDate, setApplyRequiredDate] = useState(new Date().toISOString().slice(0, 10));
  const [applyReason, setApplyReason] = useState("");
  const [submittingApply, setSubmittingApply] = useState(false);

  // Offer Acceptance Form (Step 3)
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submittingOffer, setSubmittingOffer] = useState(false);

  // Docs Form (Step 4)
  const [docsForm, setDocsForm] = useState({
    cnic_front_url: "",
    cnic_back_url: "",
    guarantor_name: "",
    guarantor_phone: "",
    guarantor_cnic: "",
    guarantor_cnic_front_url: "",
    guarantor_cnic_back_url: "",
  });
  const [submittingDocs, setSubmittingDocs] = useState(false);

  // Disbursement Form (Step 6)
  const [disbursementSlipUrl, setDisbursementSlipUrl] = useState("");
  const [satisfiedRating, setSatisfiedRating] = useState(true);
  const [submittingDisbursement, setSubmittingDisbursement] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [toggleRes, loanRes] = await Promise.all([
        fetchWithAuth("/payroll/system-toggles"),
        fetchWithAuth("/payroll/loans/my-loans"),
      ]);
      if (toggleRes.ok) setToggles(await toggleRes.json());
      if (loanRes.ok) setLoans(await loanRes.json());
    } catch {
      toast.error("Failed to load loan data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Step 1 Submit
  const handleApplyLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(applyAmount);
    if (!amt || amt <= 0) return toast.error("Enter a valid loan amount");
    if (!applyRequiredDate) return toast.error("Select loan requirement date");

    setSubmittingApply(true);
    try {
      const res = await fetchWithAuth("/payroll/loans/my-loans", {
        method: "POST",
        body: JSON.stringify({
          loan_amount: amt,
          required_date: applyRequiredDate,
          reason: applyReason || null,
        }),
      });
      if (res.ok) {
        toast.success("Loan request submitted successfully!");
        setShowApplyModal(false);
        setApplyAmount("");
        setApplyReason("");
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to submit loan request");
      }
    } catch {
      toast.error("Failed to submit loan request");
    } finally {
      setSubmittingApply(false);
    }
  };

  // Step 3 Submit: Accept Terms
  const handleAcceptTerms = async () => {
    if (!activeOfferLoan) return;
    if (!agreeTerms) return toast.error("You must check the agreement box to accept");

    setSubmittingOffer(true);
    try {
      const res = await fetchWithAuth(`/payroll/loans/${activeOfferLoan.id}/accept-terms`, {
        method: "POST",
        body: JSON.stringify({ terms_accepted: true }),
      });
      if (res.ok) {
        toast.success("Terms accepted! Please upload your verification documents next.");
        const updated = await res.json();
        setActiveOfferLoan(null);
        setAgreeTerms(false);
        await loadData();
        // Immediately open docs modal for seamless UX
        openDocsModal(updated);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to accept terms");
      }
    } catch {
      toast.error("Error accepting terms");
    } finally {
      setSubmittingOffer(false);
    }
  };

  // Step 4 Open
  const openDocsModal = (loan: LoanSummary) => {
    setDocsForm({
      cnic_front_url: loan.cnic_front_url || "",
      cnic_back_url: loan.cnic_back_url || "",
      guarantor_name: loan.guarantor_name || "",
      guarantor_phone: loan.guarantor_phone || "",
      guarantor_cnic: loan.guarantor_cnic || "",
      guarantor_cnic_front_url: loan.guarantor_cnic_front_url || "",
      guarantor_cnic_back_url: loan.guarantor_cnic_back_url || "",
    });
    setActiveDocsLoan(loan);
  };

  // Step 4 Submit: Documents
  const handleSubmitDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDocsLoan) return;
    if (!docsForm.guarantor_name || !docsForm.guarantor_phone || !docsForm.guarantor_cnic) {
      return toast.error("Guarantor Name, Phone, and CNIC are mandatory");
    }

    setSubmittingDocs(true);
    try {
      const res = await fetchWithAuth(`/payroll/loans/${activeDocsLoan.id}/submit-documents`, {
        method: "POST",
        body: JSON.stringify(docsForm),
      });
      if (res.ok) {
        toast.success("Documents submitted successfully for Admin review!");
        setActiveDocsLoan(null);
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to submit documents");
      }
    } catch {
      toast.error("Error submitting documents");
    } finally {
      setSubmittingDocs(false);
    }
  };

  // Step 6 Submit: Disbursement Confirmation
  const handleConfirmDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDisbursementLoan) return;
    if (!disbursementSlipUrl) return toast.error("Upload your disbursement receipt / slip");
    if (!satisfiedRating) return toast.error("Please confirm satisfaction");

    setSubmittingDisbursement(true);
    try {
      const res = await fetchWithAuth(`/payroll/loans/${activeDisbursementLoan.id}/confirm-disbursement`, {
        method: "POST",
        body: JSON.stringify({
          disbursement_receipt_url: disbursementSlipUrl,
          satisfied_rating: satisfiedRating,
        }),
      });
      if (res.ok) {
        toast.success("Loan confirmed and activated! Repayment schedule is now active.");
        setActiveDisbursementLoan(null);
        setDisbursementSlipUrl("");
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to confirm disbursement");
      }
    } catch {
      toast.error("Error confirming disbursement");
    } finally {
      setSubmittingDisbursement(false);
    }
  };

  const handleOpenSchedule = async (loanId: string) => {
    try {
      const res = await fetchWithAuth(`/payroll/loans/${loanId}`);
      if (res.ok) setViewScheduleLoan(await res.json());
      else toast.error("Failed to load installment schedule");
    } catch {
      toast.error("Error loading schedule");
    }
  };

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">My Loans & Advances</h1>
            <p className="page-subtitle">Track your loan applications, multi-step approvals, installment schedules, and repayment history.</p>
          </div>
          {toggles.allow_loan_requests ? (
            <button
              onClick={() => setShowApplyModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={16} /> Request Loan
            </button>
          ) : (
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1.5">
              <Lock size={13} className="text-amber-600" /> Requests Closed
            </span>
          )}
        </div>

        {/* Closed Banner if disabled */}
        {!toggles.allow_loan_requests && (
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-center gap-3 text-amber-900 shadow-2xs">
            <Lock size={20} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Loan Requests Disabled</p>
              <p className="text-xs text-amber-700 mt-0.5">Loan and advance applications are currently closed by administration. You can view your existing loan history below.</p>
            </div>
          </div>
        )}

        {/* My Loans Table */}
        <div className="ui-card p-5">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <HandCoins size={18} className="text-blue-600" /> My Loan History & Application Status
          </h2>
          {loading ? (
            <p className="text-sm text-slate-400 py-6 text-center">Loading loans...</p>
          ) : loans.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-slate-500">You currently have no active or past loans.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="ui-table-head border-b border-slate-100">
                    <th className="ui-table-head">Loan Amount</th>
                    <th className="ui-table-head">Required / Start Date</th>
                    <th className="ui-table-head">Monthly Deduction</th>
                    <th className="ui-table-head">Paid Amount</th>
                    <th className="ui-table-head">Remaining</th>
                    <th className="ui-table-head">Status</th>
                    <th className="ui-table-head text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loans.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/50">
                      <td className="ui-table-cell font-bold text-slate-900">
                        PKR {Number(l.offered_amount || l.loan_amount).toLocaleString()}
                        {l.offered_amount && l.offered_amount !== l.loan_amount && (
                          <span className="block text-[10px] text-slate-400 font-normal line-through">
                            Req: PKR {Number(l.loan_amount).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="ui-table-cell text-slate-600 text-xs">{l.required_date || l.start_date || "—"}</td>
                      <td className="ui-table-cell text-slate-700 font-semibold">
                        {l.monthly_installment ? `PKR ${Number(l.monthly_installment).toLocaleString()}` : "TBD by Admin"}
                      </td>
                      <td className="ui-table-cell text-emerald-600 font-medium">PKR {Number(l.total_paid).toLocaleString()}</td>
                      <td className="ui-table-cell text-rose-600 font-medium">PKR {Number(l.total_remaining).toLocaleString()}</td>
                      <td className="ui-table-cell">
                        {statusBadge(l.status)}
                      </td>
                      <td className="ui-table-cell text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {l.status === "offered" && (
                            <button
                              onClick={() => { setActiveOfferLoan(l); setAgreeTerms(false); }}
                              className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              Review Offer <ArrowRight size={12} />
                            </button>
                          )}
                          {l.status === "agreed" && (
                            <button
                              onClick={() => openDocsModal(l)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              Upload Docs <Upload size={12} />
                            </button>
                          )}
                          {l.status === "documents_submitted" && (
                            <button
                              onClick={() => openDocsModal(l)}
                              className="px-2 py-1 rounded-lg bg-cyan-50 text-cyan-800 hover:bg-cyan-100 text-xs font-semibold border border-cyan-200 inline-flex items-center gap-1"
                            >
                              View Docs
                            </button>
                          )}
                          {l.status === "approved" && (
                            <button
                              onClick={() => { setActiveDisbursementLoan(l); setDisbursementSlipUrl(""); setSatisfiedRating(true); }}
                              className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              Confirm Receipt <CheckCircle2 size={12} />
                            </button>
                          )}
                          {(l.status === "active" || l.status === "completed") && (
                            <button
                              onClick={() => handleOpenSchedule(l.id)}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Eye size={12} /> Schedule
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ─── Step 1: Simplified Apply Loan Modal ───────────── */}
        {showApplyModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="ui-card max-w-md w-full p-6 bg-white rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Request Loan / Advance</h3>
                <button onClick={() => setShowApplyModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
              </div>

              <form onSubmit={handleApplyLoan} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Loan Amount (PKR) <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    value={applyAmount}
                    onChange={(e) => setApplyAmount(e.target.value)}
                    required
                    placeholder="e.g. 50000"
                    className="ui-input w-full"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Loan Requirement Date <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    value={applyRequiredDate}
                    onChange={(e) => setApplyRequiredDate(e.target.value)}
                    required
                    className="ui-input w-full"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Reason for Loan</label>
                  <textarea
                    rows={3}
                    value={applyReason}
                    onChange={(e) => setApplyReason(e.target.value)}
                    placeholder="State reason for advance..."
                    className="ui-input w-full"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowApplyModal(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={submittingApply} className="btn-primary">
                    {submittingApply ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── Step 3: Review & Accept Counter-Offer Modal ───── */}
        {activeOfferLoan && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="ui-card max-w-lg w-full p-6 bg-white rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Review Counter-Offer Terms</h3>
                  <p className="text-xs text-slate-500">Administration has reviewed your loan request and proposed the following terms.</p>
                </div>
                <button onClick={() => setActiveOfferLoan(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-xl text-xs border border-slate-200/80">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Requested Amount:</span>
                  <span className="font-semibold text-slate-700">PKR {Number(activeOfferLoan.loan_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500 font-bold text-purple-800">Admin Approved Offer:</span>
                  <span className="font-bold text-purple-900 text-sm">PKR {Number(activeOfferLoan.offered_amount || activeOfferLoan.loan_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">First Deduction Period:</span>
                  <span className="font-semibold text-slate-700">
                    {activeOfferLoan.first_deduction_month ? MONTHS[activeOfferLoan.first_deduction_month - 1] : "—"} {activeOfferLoan.first_deduction_year || ""}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Repayment Installments:</span>
                  <span className="font-semibold text-slate-700">{activeOfferLoan.num_installments} Months</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Monthly Deduction:</span>
                  <span className="font-bold text-emerald-700 text-sm">PKR {Number(activeOfferLoan.monthly_installment).toLocaleString()} / month</span>
                </div>
                {activeOfferLoan.admin_notes && (
                  <div className="pt-1">
                    <span className="text-slate-500 block mb-0.5 font-medium">Admin Remarks / Conditions:</span>
                    <p className="bg-white p-2 rounded-lg border border-slate-200 text-slate-700 italic">{activeOfferLoan.admin_notes}</p>
                  </div>
                )}
              </div>

              <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl">
                <label className="flex items-start gap-2 text-xs font-semibold text-purple-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>I accept these loan terms and authorize monthly payroll deduction of PKR {Number(activeOfferLoan.monthly_installment).toLocaleString()} starting from the specified period.</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setActiveOfferLoan(null)} className="btn-secondary">Close</button>
                <button
                  type="button"
                  onClick={handleAcceptTerms}
                  disabled={!agreeTerms || submittingOffer}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submittingOffer ? "Accepting..." : "Accept Terms & Proceed"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step 4: Submit Verification Documents Modal ─── */}
        {activeDocsLoan && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="ui-card max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 bg-white rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Upload Verification Documents</h3>
                  <p className="text-xs text-slate-500">Upload your CNIC scans and Guarantor details to proceed with final loan approval.</p>
                </div>
                <button onClick={() => setActiveDocsLoan(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
              </div>

              <form onSubmit={handleSubmitDocs} className="space-y-4">
                <div className="border-b border-slate-100 pb-3 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Employee Documents</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FileUploadBox
                      label="Your CNIC (Front)"
                      value={docsForm.cnic_front_url}
                      onChange={(url) => setDocsForm((f) => ({ ...f, cnic_front_url: url }))}
                    />
                    <FileUploadBox
                      label="Your CNIC (Back)"
                      value={docsForm.cnic_back_url}
                      onChange={(url) => setDocsForm((f) => ({ ...f, cnic_back_url: url }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Guarantor Information & Documents</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Guarantor Name <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        required
                        value={docsForm.guarantor_name}
                        onChange={(e) => setDocsForm((f) => ({ ...f, guarantor_name: e.target.value }))}
                        className="ui-input w-full"
                        placeholder="Full Name"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Guarantor Phone <span className="text-rose-500">*</span></label>
                      <input
                        type="tel"
                        required
                        value={docsForm.guarantor_phone}
                        onChange={(e) => setDocsForm((f) => ({ ...f, guarantor_phone: e.target.value }))}
                        className="ui-input w-full"
                        placeholder="0300-1234567"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 mb-1 block">Guarantor CNIC <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        required
                        value={docsForm.guarantor_cnic}
                        onChange={(e) => setDocsForm((f) => ({ ...f, guarantor_cnic: e.target.value }))}
                        className="ui-input w-full"
                        placeholder="42101-1234567-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FileUploadBox
                      label="Guarantor CNIC (Front)"
                      value={docsForm.guarantor_cnic_front_url}
                      onChange={(url) => setDocsForm((f) => ({ ...f, guarantor_cnic_front_url: url }))}
                    />
                    <FileUploadBox
                      label="Guarantor CNIC (Back)"
                      value={docsForm.guarantor_cnic_back_url}
                      onChange={(url) => setDocsForm((f) => ({ ...f, guarantor_cnic_back_url: url }))}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setActiveDocsLoan(null)} className="btn-secondary">Cancel</button>
                  <button
                    type="submit"
                    disabled={submittingDocs}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                  >
                    {submittingDocs ? "Submitting..." : "Submit Documents"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── Step 6: Confirm Disbursement ("You Got Loan?") Modal ─ */}
        {activeDisbursementLoan && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="ui-card max-w-md w-full p-6 bg-white rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">You Got Loan?</h3>
                  <p className="text-xs text-slate-500">Confirm receipt of payment to activate your loan.</p>
                </div>
                <button onClick={() => setActiveDisbursementLoan(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
              </div>

              <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs">
                <p className="font-bold">Official Loan Approval Complete</p>
                <p className="mt-1">
                  The administration has approved your loan of <span className="font-bold">PKR {Number(activeDisbursementLoan.offered_amount || activeDisbursementLoan.loan_amount).toLocaleString()}</span>. Please upload the cheque copy, bank receipt, or cash voucher given to you and confirm receipt.
                </p>
              </div>

              <form onSubmit={handleConfirmDisbursement} className="space-y-4">
                <FileUploadBox
                  label="Disbursement Receipt / Cheque / Bank Transfer Slip"
                  value={disbursementSlipUrl}
                  onChange={setDisbursementSlipUrl}
                  required
                />

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={satisfiedRating}
                      onChange={(e) => setSatisfiedRating(e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Are you satisfied? [Yes, I have received the complete loan amount]</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setActiveDisbursementLoan(null)} className="btn-secondary">Cancel</button>
                  <button
                    type="submit"
                    disabled={!disbursementSlipUrl || !satisfiedRating || submittingDisbursement}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {submittingDisbursement ? "Activating..." : "Confirm & Activate Loan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── Schedule Modal for Active Loans ───────────────── */}
        {viewScheduleLoan && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="ui-card max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 bg-white rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Repayment Schedule</h3>
                  <p className="text-xs text-slate-500">
                    Loan Amount: PKR {Number(viewScheduleLoan.loan_amount).toLocaleString()} | Monthly: PKR {Number(viewScheduleLoan.monthly_installment).toLocaleString()}
                  </p>
                </div>
                <button onClick={() => setViewScheduleLoan(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="py-2">#</th>
                      <th className="py-2">Period</th>
                      <th className="py-2">Due Date</th>
                      <th className="py-2 text-right">Amount</th>
                      <th className="py-2 text-right">Paid</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewScheduleLoan.installments.map((inst) => (
                      <tr key={inst.id}>
                        <td className="py-2 font-medium">{inst.installment_number}</td>
                        <td className="py-2">{MONTHS[inst.due_month - 1]} {inst.due_year}</td>
                        <td className="py-2 text-slate-500">{inst.due_date}</td>
                        <td className="py-2 text-right font-medium">PKR {Number(inst.installment_amount).toLocaleString()}</td>
                        <td className="py-2 text-right text-emerald-600 font-medium">PKR {Number(inst.paid_amount).toLocaleString()}</td>
                        <td className="py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${instStatusBadge(inst.status)}`}>
                            {inst.status === 'deferred' ? 'Deferred (Skipped)' : inst.status}
                          </span>
                          {inst.status === 'deferred' && inst.deferral_reason && (
                            <span className="block text-[10px] text-purple-600 italic">Reason: {inst.deferral_reason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={() => setViewScheduleLoan(null)} className="btn-secondary">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

export default function LoansPage() {
  const { user, hydrated } = useAuth();
  if (hydrated && user && !user.is_superadmin) {
    return <EmployeeLoanPortal />;
  }

  const [loans, setLoans] = useState<LoanSummary[]>([]);

  const [filtered, setFiltered] = useState<LoanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [page, setPage] = useState(1);
  const [toggles, setToggles] = useState({ allow_loan_requests: true, allow_esp_withdrawal_requests: true });
  const [updatingToggle, setUpdatingToggle] = useState(false);

  const handleToggleLoanRequests = async () => {
    const enabled = !toggles.allow_loan_requests;
    setUpdatingToggle(true);
    try {
      const res = await fetchWithAuth("/payroll/system-toggles", {
        method: "PUT",
        body: JSON.stringify({ key: "allow_loan_requests", enabled }),
      });
      if (res.ok) {
        setToggles(await res.json());
        toast.success(`Loan requests ${enabled ? "PERMITTED" : "DISABLED"}`);
      } else {
        toast.error("Failed to update loan-request permission");
      }
    } catch {
      toast.error("Error updating loan-request permission");
    } finally {
      setUpdatingToggle(false);
    }
  };

  // Filters
  const [filterEmp, setFilterEmp] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [viewLoan, setViewLoan] = useState<LoanDetail | null>(null);
  const [viewPayments, setViewPayments] = useState<LoanPayment[]>([]);
  const [showPayments, setShowPayments] = useState(false);

  // Create form
  const [formEmp, setFormEmp] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formInstallments, setFormInstallments] = useState("");
  const [formMonth, setFormMonth] = useState(new Date().getMonth() + 1);
  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formReason, setFormReason] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [formReceiptUrl, setFormReceiptUrl] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Counter-Offer Modal State
  const [offerModalLoan, setOfferModalLoan] = useState<LoanSummary | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerInstallments, setOfferInstallments] = useState("12");
  const [useReqDate, setUseReqDate] = useState(true);
  const [offerMonth, setOfferMonth] = useState(new Date().getMonth() + 1);
  const [offerYear, setOfferYear] = useState(new Date().getFullYear());
  const [offerNotes, setOfferNotes] = useState("");
  const [submittingOffer, setSubmittingOffer] = useState(false);

  // Review Docs & Final Approve Modal State
  const [reviewDocsLoan, setReviewDocsLoan] = useState<LoanSummary | null>(null);
  const [submittingFinalApprove, setSubmittingFinalApprove] = useState(false);

  // Defer Installment Modal State
  const [deferModalInst, setDeferModalInst] = useState<{ id: string; num: number; period: string; amount: string; loanId: string } | null>(null);
  const [deferReason, setDeferReason] = useState("");
  const [submittingDefer, setSubmittingDefer] = useState(false);

  useEffect(() => {
    fetchWithAuth("/payroll/system-toggles")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setToggles(data); })
      .catch(() => {});
  }, []);

  const load = async () => {
    try {
      const [loanRes, dashRes] = await Promise.all([
        fetchWithAuth("/payroll/loans"),
        fetchWithAuth("/payroll/loans/dashboard"),
      ]);
      if (loanRes.status === 403) return setNoAccess(true);
      if (loanRes.ok) setLoans(await loanRes.json());
      if (dashRes.ok) setDashboard(await dashRes.json());
    } catch {
      toast.error("Failed to load loans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let result = loans;
    if (filterEmp) result = result.filter((l) => l.employee_id === filterEmp);
    if (filterStatus) result = result.filter((l) => l.status === filterStatus);
    setFiltered(result);
    setPage(1);
  }, [loans, filterEmp, filterStatus]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const handlePreview = async () => {
    const amt = parseFloat(formAmount);
    const num = parseInt(formInstallments);
    if (!amt || amt <= 0 || !num || num < 1) {
      toast.error("Enter a valid amount and number of installments");
      return;
    }
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({
        loan_amount: String(amt),
        num_installments: String(num),
        first_deduction_month: String(formMonth),
        first_deduction_year: String(formYear),
      });
      const res = await fetchWithAuth(`/payroll/loans/preview-schedule?${params}`);
      if (res.ok) setPreview(await res.json());
      else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to preview schedule");
      }
    } catch {
      toast.error("Failed to preview schedule");
    } finally {
      setPreviewLoading(false);
    }
  };

  const resetForm = () => {
    setFormEmp("");
    setFormAmount("");
    setFormInstallments("");
    setFormMonth(new Date().getMonth() + 1);
    setFormYear(new Date().getFullYear());
    setFormReason("");
    setFormNotes("");
    setFormStartDate(new Date().toISOString().slice(0, 10));
    setFormReceiptUrl("");
    setPreview(null);
  };

  const handleCreate = async () => {
    if (!formEmp) { toast.error("Select an employee"); return; }
    const amt = parseFloat(formAmount);
    const num = parseInt(formInstallments);
    if (!amt || amt <= 0) { toast.error("Enter a valid loan amount"); return; }
    if (!num || num < 1) { toast.error("Enter valid number of installments"); return; }

    setCreateLoading(true);
    try {
      const res = await fetchWithAuth("/payroll/loans", {
        method: "POST",
        body: JSON.stringify({
          employee_id: formEmp,
          loan_amount: amt,
          start_date: formStartDate,
          num_installments: num,
          first_deduction_month: formMonth,
          first_deduction_year: formYear,
          reason: formReason || null,
          notes: formNotes || null,
          disbursement_receipt_url: formReceiptUrl || null,
        }),
      });
      if (res.ok) {
        toast.success("Loan created successfully");
        setShowCreate(false);
        resetForm();
        setLoading(true);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to create loan");
      }
    } catch {
      toast.error("Failed to create loan");
    } finally {
      setCreateLoading(false);
    }
  };

  const openOfferModal = (loan: LoanSummary) => {
    setOfferModalLoan(loan);
    setOfferAmount(loan.offered_amount || loan.loan_amount || "");
    setOfferInstallments(loan.num_installments ? String(loan.num_installments) : "12");
    setOfferNotes(loan.admin_notes || "");

    if (loan.required_date) {
      const dt = new Date(loan.required_date);
      if (!isNaN(dt.getTime())) {
        setOfferMonth(dt.getMonth() + 1);
        setOfferYear(dt.getFullYear());
        setUseReqDate(true);
      } else {
        setOfferMonth(new Date().getMonth() + 1);
        setOfferYear(new Date().getFullYear());
        setUseReqDate(false);
      }
    } else {
      setOfferMonth(loan.first_deduction_month || (new Date().getMonth() + 1));
      setOfferYear(loan.first_deduction_year || new Date().getFullYear());
      setUseReqDate(false);
    }
  };

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerModalLoan) return;
    const amt = parseFloat(offerAmount);
    const num = parseInt(offerInstallments);
    if (!amt || amt <= 0 || !num || num < 1) {
      toast.error("Please enter a valid offered amount and tenure");
      return;
    }
    setSubmittingOffer(true);
    try {
      const res = await fetchWithAuth(`/payroll/loans/${offerModalLoan.id}/offer-terms`, {
        method: "POST",
        body: JSON.stringify({
          offered_amount: amt,
          num_installments: num,
          first_deduction_month: offerMonth,
          first_deduction_year: offerYear,
          admin_notes: offerNotes || null,
        }),
      });
      if (res.ok) {
        toast.success("Counter-offer proposed and sent to employee");
        setOfferModalLoan(null);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to submit offer terms");
      }
    } catch {
      toast.error("Failed to submit offer terms");
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleFinalApprove = async (loanId: string) => {
    setSubmittingFinalApprove(true);
    try {
      const res = await fetchWithAuth(`/payroll/loans/${loanId}/final-approve`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Loan approved! Awaiting employee disbursement confirmation");
        setReviewDocsLoan(null);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to approve loan");
      }
    } catch {
      toast.error("Failed to approve loan");
    } finally {
      setSubmittingFinalApprove(false);
    }
  };

  const handleDeferInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deferModalInst || !deferReason.trim()) {
      toast.error("Please provide a reason for deferral");
      return;
    }
    setSubmittingDefer(true);
    try {
      const res = await fetchWithAuth(`/payroll/loans/installments/${deferModalInst.id}/defer`, {
        method: "POST",
        body: JSON.stringify({ reason: deferReason }),
      });
      if (res.ok) {
        toast.success("Installment deferred successfully");
        const loanIdToReload = deferModalInst.loanId;
        setDeferModalInst(null);
        setDeferReason("");
        if (viewLoan && viewLoan.id === loanIdToReload) {
          await handleViewDetail(loanIdToReload);
        }
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to defer installment");
      }
    } catch {
      toast.error("Failed to defer installment");
    } finally {
      setSubmittingDefer(false);
    }
  };

  const handleDelete = async (loanId: string) => {
    if (!confirm("Delete this loan? This action cannot be undone.")) return;
    try {
      const res = await fetchWithAuth(`/payroll/loans/${loanId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Loan deleted");
        setViewLoan(null);
        setLoading(true);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to delete loan");
      }
    } catch {
      toast.error("Failed to delete loan");
    }
  };

  const handleViewDetail = async (loanId: string) => {
    try {
      const res = await fetchWithAuth(`/payroll/loans/${loanId}`);
      if (res.ok) setViewLoan(await res.json());
      else toast.error("Failed to load loan details");
    } catch {
      toast.error("Failed to load loan details");
    }
  };

  const handleViewPayments = async (loanId: string) => {
    try {
      const res = await fetchWithAuth(`/payroll/loans/${loanId}/payments`);
      if (res.ok) {
        setViewPayments(await res.json());
        setShowPayments(true);
      } else {
        toast.error("Failed to load payment history");
      }
    } catch {
      toast.error("Failed to load payment history");
    }
  };

  const handleMarkOverdue = async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    try {
      const res = await fetchWithAuth(`/payroll/loans/mark-overdue?month=${month}&year=${year}`, { method: "POST" });
      if (res.ok) {
        toast.success("Overdue installments marked");
        setLoading(true);
        await load();
      } else {
        toast.error("Failed to mark overdue");
      }
    } catch {
      toast.error("Failed to mark overdue");
    }
  };

  const handleUpdateStatus = async (loanId: string, newStatus: string) => {
    try {
      const res = await fetchWithAuth(`/payroll/loans/${loanId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Loan request ${newStatus === 'active' ? 'approved' : newStatus}`);
        setLoading(true);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to update loan status");
      }
    } catch {
      toast.error("Failed to update loan status");
    }
  };

  const handlePayInstallment = async (installmentId: string) => {
    if (!confirm("Mark this installment as paid manually?")) return;
    try {
      const res = await fetchWithAuth(`/payroll/loans/installments/${installmentId}/pay`, {
        method: "POST",
        body: JSON.stringify({ notes: "Manual payment / prior payslip deduction" }),
      });
      if (res.ok) {
        toast.success("Installment marked as paid");
        if (viewLoan) {
          await handleViewDetail(viewLoan.id);
        }
        await load();
      } else {
        toast.error("Failed to mark installment as paid");
      }
    } catch {
      toast.error("Failed to mark installment as paid");
    }
  };

  const clearFilters = () => {
    setFilterEmp("");
    setFilterStatus("");
  };

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <HandCoins className="text-indigo-600" size={28} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Loan Management</h1>
                <p className="text-sm text-gray-500">{filtered.length} loans</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleMarkOverdue}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
              >
                <AlertTriangle size={14} /> Mark Overdue
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer"
              >
                <Plus size={16} /> New Loan
              </button>
            </div>
          </div>

          {/* Employee self-service permission control */}
          <div className="mb-6 p-4 rounded-xl border border-slate-100 bg-white shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toggles.allow_loan_requests ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                <HandCoins size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Loan & Advance Requests</p>
                <p className="text-xs text-slate-500">{toggles.allow_loan_requests ? "Employees can submit loan requests" : "Applications closed by administration"}</p>
              </div>
            </div>
            <button
              onClick={handleToggleLoanRequests}
              disabled={updatingToggle}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                toggles.allow_loan_requests
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-slate-200 text-slate-700 hover:bg-slate-300"
              }`}
            >
              {toggles.allow_loan_requests ? <Unlock size={13} /> : <Lock size={13} />}
              {toggles.allow_loan_requests ? "Permitted (ON)" : "Disabled (OFF)"}
            </button>
          </div>

          {noAccess && <AccessDenied />}

          {/* Dashboard Cards */}
          {dashboard && (
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <DashCard icon={<HandCoins size={18} />} label="Active Loans" value={String(dashboard.total_active_loans)} color="indigo" />
              <DashCard icon={<TrendingUp size={18} />} label="Outstanding" value={fmt(dashboard.total_outstanding)} color="rose" />
              <DashCard icon={<Calendar size={18} />} label="Monthly Deductions" value={fmt(dashboard.total_monthly_deductions)} color="emerald" />
              <DashCard icon={<CheckCircle2 size={18} />} label="Fully Paid" value={String(dashboard.fully_paid_loans)} color="blue" />
              <DashCard icon={<Clock size={18} />} label="Pending" value={String(dashboard.pending_installments)} color="amber" />
              <DashCard icon={<AlertCircle size={18} />} label="Overdue" value={String(dashboard.overdue_installments)} color="red" />
            </div>
          )}

          {/* Filters */}
          <div className="mb-5 space-y-4 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <Filter size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Filter Loans</h3>
                  <p className="text-xs text-slate-500">Filter employee loans by staff member or approval status</p>
                </div>
              </div>

              {(filterEmp || filterStatus) && (
                <button
                  onClick={clearFilters}
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
                  <option value="pending">Pending Request</option>
                  <option value="offered">Offered Terms</option>
                  <option value="agreed">Terms Agreed</option>
                  <option value="documents_submitted">Docs Submitted</option>
                  <option value="approved">Approved (Pending Confirmation)</option>
                  <option value="active">Active Repayment</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected / Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Loan Table */}
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500">No loans found.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Loan Amount</th>
                    <th className="px-4 py-3">Monthly Installment</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Remaining</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Start Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600">
                          <Users size={14} /> {l.employee_id}
                        </span>
                        <p className="text-xs text-gray-500">{l.employee_name}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {fmt(l.offered_amount || l.loan_amount)}
                        {l.offered_amount && l.offered_amount !== l.loan_amount && (
                          <span className="block text-[10px] text-gray-400 font-normal line-through">
                            Req: {fmt(l.loan_amount)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{l.monthly_installment ? fmt(l.monthly_installment) : "TBD"}</td>
                      <td className="px-4 py-3 text-emerald-600">{fmt(l.total_paid)}</td>
                      <td className="px-4 py-3 text-rose-600">{fmt(l.total_remaining)}</td>
                      <td className="px-4 py-3">
                        {statusBadge(l.status)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{l.required_date || l.start_date || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {l.status === "pending" && (
                            <>
                              <button
                                onClick={() => openOfferModal(l)}
                                title="Offer Terms"
                                className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <DollarSign size={13} /> Offer Terms
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(l.id, "rejected")}
                                title="Reject Loan"
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <X size={13} /> Reject
                              </button>
                            </>
                          )}
                          {l.status === "documents_submitted" && (
                            <button
                              onClick={() => setReviewDocsLoan(l)}
                              title="Review Verification Documents & Approve"
                              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold inline-flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                            >
                              <ShieldCheck size={13} /> Review Docs
                            </button>
                          )}
                          {l.status === "offered" && (
                            <button
                              onClick={() => openOfferModal(l)}
                              title="Edit Offer Terms"
                              className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Pencil size={12} /> Edit Offer
                            </button>
                          )}
                          <button
                            onClick={() => handleViewDetail(l.id)}
                            title="Details"
                            className="p-1.5 text-indigo-600 hover:text-indigo-800"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleViewPayments(l.id)}
                            title="Payments"
                            className="p-1.5 text-emerald-600 hover:text-emerald-800"
                          >
                            <RefreshCw size={16} />
                          </button>
                          {l.status === "active" && (
                            <button
                              onClick={() => handleDelete(l.id)}
                              title="Delete"
                              className="p-1.5 text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
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

          {/* ─── Create Loan Modal ─────────────────────────────── */}
          {showCreate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">Create New Loan</h2>
                  <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Employee *</label>
                    <EmployeeSelect value={formEmp} onChange={setFormEmp} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Loan Amount *</label>
                      <input
                        type="number"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Number of Installments *</label>
                      <input
                        type="number"
                        value={formInstallments}
                        onChange={(e) => setFormInstallments(e.target.value)}
                        placeholder="12"
                        min={1}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Start Date</label>
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">First Deduction Month</label>
                      <select
                        value={formMonth}
                        onChange={(e) => setFormMonth(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {MONTHS.map((m, i) => (
                          <option key={i} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">First Deduction Year</label>
                      <input
                        type="number"
                        value={formYear}
                        onChange={(e) => setFormYear(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Reason</label>
                    <input
                      type="text"
                      value={formReason}
                      onChange={(e) => setFormReason(e.target.value)}
                      placeholder="e.g. Emergency, Housing, Education"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <FileUploadBox
                      label="Disbursement Proof Slip / Cheque / Voucher (Optional)"
                      value={formReceiptUrl}
                      onChange={setFormReceiptUrl}
                    />
                  </div>

                  {/* Preview Section */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePreview}
                      disabled={previewLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      {previewLoading ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-700" />
                      ) : (
                        <Eye size={14} />
                      )}
                      Preview Schedule
                    </button>
                  </div>

                  {preview && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-gray-700">
                        Monthly Installment: <span className="text-indigo-700">{fmt(preview.monthly_installment)}</span>
                      </p>
                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="py-1">#</th>
                              <th className="py-1">Due Date</th>
                              <th className="py-1 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.schedule.map((s) => (
                              <tr key={s.installment_number} className="border-t border-gray-100">
                                <td className="py-1">{s.installment_number}</td>
                                <td className="py-1">{MONTHS[s.due_month - 1]} {s.due_year}</td>
                                <td className="py-1 text-right font-medium">{fmt(s.installment_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => { setShowCreate(false); resetForm(); }}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={createLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {createLoading && (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      )}
                      Create Loan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Loan Detail Drawer ────────────────────────────── */}
          {viewLoan && (
            <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">Loan Detail</h2>
                  <button onClick={() => setViewLoan(null)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <Section title="Loan Info">
                    <Row label="Employee" value={`${viewLoan.employee_name} (${viewLoan.employee_id})`} />
                    <Row label="Loan Amount" value={fmt(viewLoan.loan_amount)} bold />
                    {viewLoan.offered_amount && viewLoan.offered_amount !== viewLoan.loan_amount && (
                      <Row label="Offered Amount" value={fmt(viewLoan.offered_amount)} bold />
                    )}
                    <Row label="Monthly Installment" value={fmt(viewLoan.monthly_installment)} />
                    <Row label="Installments" value={`${viewLoan.num_installments} (${viewLoan.installment_frequency})`} />
                    <Row label="Status" value={viewLoan.status} />
                    <Row label="Required / Start Date" value={viewLoan.required_date || viewLoan.start_date || "—"} />
                    <Row label="First Deduction" value={`${viewLoan.first_deduction_month ? MONTHS[viewLoan.first_deduction_month - 1] : "—"} ${viewLoan.first_deduction_year || ""}`} />
                    {viewLoan.reason && <Row label="Reason" value={viewLoan.reason} />}
                    {viewLoan.admin_notes && <Row label="Admin Notes" value={viewLoan.admin_notes} />}
                    {viewLoan.created_by_name && <Row label="Created By" value={viewLoan.created_by_name} />}
                    {viewLoan.disbursement_receipt_url && (
                      <div className="pt-2 border-t border-gray-200">
                        <span className="text-xs font-semibold text-gray-700 block mb-1">Disbursement Proof / Receipt:</span>
                        <a
                          href={viewLoan.disbursement_receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold hover:bg-teal-100 transition-colors"
                        >
                          <FileText size={14} /> View Disbursement Slip / Proof
                        </a>
                      </div>
                    )}
                  </Section>

                  {(viewLoan.cnic_front_url || viewLoan.guarantor_name) && (
                    <Section title="Verification Documents">
                      {viewLoan.cnic_front_url && (
                        <div>
                          <span className="text-xs font-semibold text-gray-700 block mb-1">Employee CNIC:</span>
                          <div className="flex gap-2">
                            <a href={viewLoan.cnic_front_url} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100">
                              CNIC Front
                            </a>
                            {viewLoan.cnic_back_url && (
                              <a href={viewLoan.cnic_back_url} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100">
                                CNIC Back
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                      {viewLoan.guarantor_name && (
                        <div className="pt-2 border-t border-gray-200 text-xs space-y-1">
                          <p><span className="font-semibold text-gray-700">Guarantor:</span> {viewLoan.guarantor_name} ({viewLoan.guarantor_phone})</p>
                          <p><span className="font-semibold text-gray-700">CNIC:</span> {viewLoan.guarantor_cnic}</p>
                          <div className="flex gap-2 pt-1">
                            {viewLoan.guarantor_cnic_front_url && (
                              <a href={viewLoan.guarantor_cnic_front_url} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100">
                                Guarantor CNIC Front
                              </a>
                            )}
                            {viewLoan.guarantor_cnic_back_url && (
                              <a href={viewLoan.guarantor_cnic_back_url} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100">
                                Guarantor CNIC Back
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </Section>
                  )}

                  <Section title="Progress">
                    <Row label="Total Paid" value={fmt(viewLoan.total_paid)} bold />
                    <Row label="Total Remaining" value={fmt(viewLoan.total_remaining)} bold />
                    <Row label="Paid Installments" value={`${viewLoan.paid_installments} / ${viewLoan.num_installments || 0}`} />
                    <div className="mt-2">
                      <div className="h-2 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-emerald-500 transition-all"
                          style={{
                            width: `${Math.min(100, (viewLoan.paid_installments / (viewLoan.num_installments || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {((viewLoan.paid_installments / (viewLoan.num_installments || 1)) * 100).toFixed(0)}% complete
                      </p>
                    </div>
                  </Section>

                  <Section title="Installment Schedule">
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="py-1">#</th>
                            <th className="py-1">Due</th>
                            <th className="py-1 text-right">Amount</th>
                            <th className="py-1 text-right">Paid</th>
                            <th className="py-1">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewLoan.installments.map((inst) => (
                            <tr key={inst.id} className="border-t border-gray-100">
                              <td className="py-1">{inst.installment_number}</td>
                              <td className="py-1">{MONTHS[inst.due_month - 1]} {inst.due_year}</td>
                              <td className="py-1 text-right font-medium">{fmt(inst.installment_amount)}</td>
                              <td className="py-1 text-right text-emerald-600">{fmt(inst.paid_amount)}</td>
                              <td className="py-1">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize ${instStatusBadge(inst.status)}`}>
                                      {inst.status === 'deferred' ? 'Deferred (Skipped)' : inst.status}
                                    </span>
                                    {inst.status !== "paid" && inst.status !== "deferred" && (
                                      <>
                                        <button
                                          onClick={() => handlePayInstallment(inst.id)}
                                          title="Mark Paid"
                                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                                        >
                                          Mark Paid
                                        </button>
                                        <button
                                          onClick={() => {
                                            setDeferModalInst({
                                              id: inst.id,
                                              num: inst.installment_number,
                                              period: `${MONTHS[inst.due_month - 1]} ${inst.due_year}`,
                                              amount: inst.installment_amount,
                                              loanId: viewLoan.id,
                                            });
                                            setDeferReason("");
                                          }}
                                          title="Defer Installment (Skip Month)"
                                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer"
                                        >
                                          Defer
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  {inst.status === 'deferred' && inst.deferral_reason && (
                                    <span className="text-[10px] text-purple-700 italic">
                                      Deferred: {inst.deferral_reason}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleViewPayments(viewLoan.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <RefreshCw size={14} /> View Payments
                    </button>
                    {viewLoan.status === "active" && (
                      <button
                        onClick={() => handleDelete(viewLoan.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 size={14} /> Delete Loan
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Payments Modal ────────────────────────────────── */}
          {showPayments && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
              <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">Payment History</h2>
                  <button onClick={() => setShowPayments(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                {viewPayments.length === 0 ? (
                  <p className="text-gray-500">No payments recorded yet.</p>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Installment</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Period</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {viewPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">#{p.installment_number}</td>
                          <td className="px-3 py-2 text-gray-600">{p.payment_date}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {p.payroll_period_month && p.payroll_period_year
                              ? `${MONTHS[p.payroll_period_month - 1]} ${p.payroll_period_year}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-600">{fmt(p.amount)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{fmt(p.remaining_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ─── Admin Counter-Offer Modal ───────────────────────── */}
          {offerModalLoan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Make Counter-Offer / Set Loan Terms</h3>
                    <p className="text-xs text-slate-500">Propose terms to {offerModalLoan.employee_name} ({offerModalLoan.employee_id})</p>
                  </div>
                  <button onClick={() => setOfferModalLoan(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Employee Requested:</span>
                    <span className="font-bold text-slate-800">PKR {Number(offerModalLoan.loan_amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Required Date:</span>
                    <span className="font-semibold text-slate-700">{offerModalLoan.required_date || offerModalLoan.start_date || "—"}</span>
                  </div>
                  {offerModalLoan.reason && (
                    <div className="pt-1">
                      <span className="text-slate-500 font-medium">Reason:</span>
                      <p className="text-slate-700 italic">{offerModalLoan.reason}</p>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSubmitOffer} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1 block">
                      Offered Amount (PKR) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1000"
                      step="500"
                      required
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                      placeholder="e.g. 50000"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1 block">
                      Repayment Tenure (Installments in Months) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      required
                      value={offerInstallments}
                      onChange={(e) => setOfferInstallments(e.target.value)}
                      placeholder="12"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-purple-800 font-medium">Calculated Monthly Deduction:</span>
                      <span className="font-bold text-purple-900 text-sm">
                        PKR {((parseFloat(offerAmount) || 0) / (parseInt(offerInstallments) || 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / month
                      </span>
                    </div>

                    <div className="pt-1 border-t border-purple-200/60">
                      <label className="flex items-center gap-2 text-xs font-semibold text-purple-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useReqDate}
                          onChange={(e) => {
                            setUseReqDate(e.target.checked);
                            if (e.target.checked && offerModalLoan.required_date) {
                              const dt = new Date(offerModalLoan.required_date);
                              if (!isNaN(dt.getTime())) {
                                setOfferMonth(dt.getMonth() + 1);
                                setOfferYear(dt.getFullYear());
                              }
                            }
                          }}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span>Use Employee&apos;s Required Date for deduction period ({offerModalLoan.required_date || "N/A"})</span>
                      </label>
                    </div>

                    {!useReqDate && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="text-[11px] font-semibold text-purple-900 mb-0.5 block">First Deduction Month</label>
                          <select
                            value={offerMonth}
                            onChange={(e) => setOfferMonth(Number(e.target.value))}
                            className="w-full rounded-lg border border-purple-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                          >
                            {MONTHS.map((m, i) => (
                              <option key={i} value={i + 1}>{m}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-purple-900 mb-0.5 block">First Deduction Year</label>
                          <input
                            type="number"
                            value={offerYear}
                            onChange={(e) => setOfferYear(Number(e.target.value))}
                            className="w-full rounded-lg border border-purple-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1 block">Offer Remarks / Conditions for Employee</label>
                    <textarea
                      rows={2}
                      value={offerNotes}
                      onChange={(e) => setOfferNotes(e.target.value)}
                      placeholder="e.g. Approved. Please provide CNIC copy and Guarantor details upon accepting."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setOfferModalLoan(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
                    <button
                      type="submit"
                      disabled={submittingOffer}
                      className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2 shadow-md transition-all cursor-pointer"
                    >
                      {submittingOffer ? "Submitting..." : "Send Offer to Employee"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ─── Admin Review Docs & Final Approve Modal ─────────── */}
          {reviewDocsLoan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
              <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Review Verification Documents</h3>
                    <p className="text-xs text-slate-500">{reviewDocsLoan.employee_name} ({reviewDocsLoan.employee_id})</p>
                  </div>
                  <button onClick={() => setReviewDocsLoan(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
                </div>

                <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-xs space-y-1 text-cyan-900">
                  <div className="flex justify-between">
                    <span>Agreed Loan Amount:</span>
                    <span className="font-bold">PKR {Number(reviewDocsLoan.offered_amount || reviewDocsLoan.loan_amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monthly Deduction:</span>
                    <span className="font-bold">PKR {Number(reviewDocsLoan.monthly_installment).toLocaleString()} / month ({reviewDocsLoan.num_installments} mos)</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Employee CNIC Scans</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-1">CNIC Front</span>
                        {reviewDocsLoan.cnic_front_url ? (
                          <a href={reviewDocsLoan.cnic_front_url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                            <img src={reviewDocsLoan.cnic_front_url} alt="CNIC Front" className="h-28 w-full object-cover rounded" />
                          </a>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not uploaded</p>
                        )}
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-1">CNIC Back</span>
                        {reviewDocsLoan.cnic_back_url ? (
                          <a href={reviewDocsLoan.cnic_back_url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                            <img src={reviewDocsLoan.cnic_back_url} alt="CNIC Back" className="h-28 w-full object-cover rounded" />
                          </a>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not uploaded</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Guarantor Information</h4>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                      <p><span className="font-semibold text-slate-700">Name:</span> {reviewDocsLoan.guarantor_name || "—"}</p>
                      <p><span className="font-semibold text-slate-700">Phone:</span> {reviewDocsLoan.guarantor_phone || "—"}</p>
                      <p><span className="font-semibold text-slate-700">CNIC:</span> {reviewDocsLoan.guarantor_cnic || "—"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-1">Guarantor CNIC Front</span>
                        {reviewDocsLoan.guarantor_cnic_front_url ? (
                          <a href={reviewDocsLoan.guarantor_cnic_front_url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                            <img src={reviewDocsLoan.guarantor_cnic_front_url} alt="Guarantor CNIC Front" className="h-28 w-full object-cover rounded" />
                          </a>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not uploaded</p>
                        )}
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-1">Guarantor CNIC Back</span>
                        {reviewDocsLoan.guarantor_cnic_back_url ? (
                          <a href={reviewDocsLoan.guarantor_cnic_back_url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                            <img src={reviewDocsLoan.guarantor_cnic_back_url} alt="Guarantor CNIC Back" className="h-28 w-full object-cover rounded" />
                          </a>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not uploaded</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Reject this loan application?")) {
                        handleUpdateStatus(reviewDocsLoan.id, "rejected");
                        setReviewDocsLoan(null);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold cursor-pointer"
                  >
                    Reject Application
                  </button>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setReviewDocsLoan(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Close</button>
                    <button
                      type="button"
                      onClick={() => handleFinalApprove(reviewDocsLoan.id)}
                      disabled={submittingFinalApprove}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} />
                      {submittingFinalApprove ? "Approving..." : "Final Approve Loan"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Defer Installment Modal ───────────────────────── */}
          {deferModalInst && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Defer Installment (Skip Month)</h3>
                    <p className="text-xs text-slate-500">
                      Installment #{deferModalInst.num} - {deferModalInst.period} (PKR {Number(deferModalInst.amount).toLocaleString()})
                    </p>
                  </div>
                  <button onClick={() => setDeferModalInst(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
                </div>

                <p className="text-xs text-slate-600">
                  Deferring this installment will mark it as skipped for this month. 0 deduction will be applied in that month&apos;s payslip. Please provide the reason below (e.g. employee emergency request).
                </p>

                <form onSubmit={handleDeferInstallment} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 mb-1 block">
                      Reason for Deferral / Revoke <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={deferReason}
                      onChange={(e) => setDeferReason(e.target.value)}
                      placeholder="e.g. Employee requested skip due to family medical emergency..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setDeferModalInst(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
                    <button
                      type="submit"
                      disabled={submittingDefer || !deferReason.trim()}
                      className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2 shadow-md transition-all cursor-pointer"
                    >
                      {submittingDefer ? "Deferring..." : "Confirm Deferral"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}

function DashCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    rose: "bg-rose-50 text-rose-600",
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className={`mb-2 inline-flex rounded-lg p-2 ${colorMap[color] || colorMap.indigo}`}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1.5">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm capitalize ${bold ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
        {value}
      </span>
    </div>
  );
}

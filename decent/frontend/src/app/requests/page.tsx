"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { useAuth } from "@/context/AuthContext";
import { fetchWithAuth } from "@/utils/api";
import toast from "react-hot-toast";
import {
  MessageSquarePlus, Send, X, CheckCircle2, XCircle, Inbox,
  MessageSquare, Filter, Eye, Sparkles, Trash2, Maximize2, Minimize2,
  Loader2, RotateCcw, Check, Building2,
} from "lucide-react";

interface EmployeeRequestItem {
  id: string;
  employee_id: string;
  employee_name: string;
  category: string;
  subject: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "General Inquiry",
  salary: "Salary & Payroll",
  certificate: "Certificate / Work Letter",
  leave: "Leave & Attendance",
  loan: "Loan & Advance",
  complaint: "Formal Complaint / Grievance",
  other: "Other Request",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${map[status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {status}
    </span>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Gmail-Style Compose Modal with Auto-Save & AI Polish ─────────────────
function ComposeRequestModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const [originalDraft, setOriginalDraft] = useState<{ subject: string; message: string } | null>(null);

  const DRAFT_KEY = "hrms_employee_request_draft";

  // Restore draft when modal opens
  useEffect(() => {
    if (open) {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.subject || parsed.message) {
            setCategory(parsed.category || "general");
            setSubject(parsed.subject || "");
            setMessage(parsed.message || "");
            setSaveStatus("saved");
            return;
          }
        }
      } catch (err) {
        console.error("Failed to restore draft:", err);
      }
      setCategory("general");
      setSubject("");
      setMessage("");
      setOriginalDraft(null);
      setSaveStatus("idle");
    }
  }, [open]);

  // Auto-save to localStorage with debounce
  useEffect(() => {
    if (!open) return;
    if (!subject && !message) {
      setSaveStatus("idle");
      return;
    }
    setSaveStatus("saving");
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ category, subject, message, updatedAt: Date.now() })
        );
        setSaveStatus("saved");
      } catch (e) {
        console.error("Draft autosave error:", e);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [category, subject, message, open]);

  if (!open) return null;

  const handleDiscard = () => {
    if ((subject || message) && !window.confirm("Are you sure you want to discard this draft?")) {
      return;
    }
    localStorage.removeItem(DRAFT_KEY);
    setSubject("");
    setMessage("");
    setCategory("general");
    setOriginalDraft(null);
    setSaveStatus("idle");
    onClose();
  };

  const handleAIPolish = async () => {
    if (!message.trim()) {
      toast.error("Please write your draft first (in Urdu, Roman Urdu, or English).");
      return;
    }

    setPolishing(true);
    setOriginalDraft({ subject, message });

    try {
      const res = await fetch("/api/ai/polish-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, message }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "AI service is currently unavailable");
      }

      if (data.subject && (!subject || subject.trim().length < 5 || subject === "Draft")) {
        setSubject(data.subject);
      } else if (data.subject && !subject) {
        setSubject(data.subject);
      }
      if (data.message) {
        setMessage(data.message);
      }
      toast.success("Request polished to formal English!");
    } catch (err: any) {
      toast.error(err.message || "Failed to polish request. Check AI server connection.");
    } finally {
      setPolishing(false);
    }
  };

  const handleRevert = () => {
    if (originalDraft) {
      setSubject(originalDraft.subject);
      setMessage(originalDraft.message);
      setOriginalDraft(null);
      toast.success("Reverted to previous draft.");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth("/payroll/my-requests", {
        method: "POST",
        body: JSON.stringify({ category, subject: subject.trim(), message: message.trim() }),
      });
      if (res.ok) {
        toast.success("Request sent to HR & Administration");
        localStorage.removeItem(DRAFT_KEY);
        onSent();
        onClose();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.detail || "Failed to send request");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={() => !submitting && !polishing && onClose()}
      />
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-slate-200/90 relative z-10 flex flex-col transition-all duration-150 overflow-hidden ${
          isMaximized ? "w-[95vw] h-[92vh] max-w-5xl" : "w-full max-w-2xl max-h-[85vh] h-[580px]"
        }`}
      >
        {/* Email Header Bar — Clean Gmail Style (Light Background) */}
        <div className="bg-[#f2f6fc] text-slate-800 px-4 py-2.5 flex items-center justify-between border-b border-slate-200/70 select-none">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">New Message</span>
            {saveStatus === "saving" && (
              <span className="text-xs text-slate-400 flex items-center gap-1 font-normal ml-2">
                <Loader2 size={11} className="animate-spin text-slate-400" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-slate-400 font-normal ml-2">Draft saved</span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-md transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={() => !submitting && !polishing && onClose()}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-md transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleSend} className="flex-1 flex flex-col min-h-0 bg-white">
          {/* Recipient Line */}
          <div className="flex items-center px-4 py-2 border-b border-slate-100 text-sm">
            <span className="text-xs text-slate-400 w-16 shrink-0 select-none">To</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium">
                HR &amp; Administration
              </span>
            </div>
          </div>


          {/* Subject Line */}
          <div className="flex items-center px-4 py-2 border-b border-slate-100 text-sm">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full text-sm font-normal text-slate-900 placeholder-slate-400 outline-none bg-transparent"
              required
            />
          </div>

          {/* AI Revert Banner if polished */}
          {originalDraft && (
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-1.5 flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-blue-600" />
                Polished with AI (GLM-4.7)
              </span>
              <button
                type="button"
                onClick={handleRevert}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
              >
                <RotateCcw size={11} /> Revert to original
              </button>
            </div>
          )}

          {/* Message Area */}
          <div className="flex-1 p-4 flex flex-col min-h-0">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here... (Aap Urdu ya Roman Urdu mein bhi likh sakte hain, AI Polish se formal English ban jayega)"
              className="w-full flex-1 resize-none outline-none text-slate-800 placeholder-slate-400 text-sm leading-relaxed bg-transparent font-normal"
              required
            />
          </div>

          {/* Bottom Action Toolbar — Gmail Style */}
          <div className="px-4 py-2.5 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                disabled={submitting || polishing}
                className="bg-[#0b57d0] hover:bg-[#0842a0] text-white px-6 py-2 rounded-full text-sm font-medium transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? "Sending..." : "Send"}
              </button>

              <button
                type="button"
                onClick={handleAIPolish}
                disabled={polishing || submitting || !message.trim()}
                title="Convert Urdu/Roman Urdu to formal professional English"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-colors disabled:opacity-50"
              >
                {polishing ? (
                  <Loader2 size={13} className="animate-spin text-blue-600" />
                ) : (
                  <Sparkles size={13} className="text-blue-600" />
                )}
                <span>{polishing ? "Polishing..." : "AI Polish"}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                title="Discard draft"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Employee self-service view ────────────────────────────────────────────
function MyRequestsPortal() {
  const [requests, setRequests] = useState<EmployeeRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  const load = async () => {
    try {
      const res = await fetchWithAuth("/payroll/my-requests");
      if (res.ok) setRequests(await res.json());
    } catch {
      toast.error("Failed to load your requests");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Requests</h1>
              <p className="text-sm text-gray-500">Send a request to HR/Admin — salary queries, certificates, or anything else.</p>
            </div>
            <button onClick={() => setShowCompose(true)} className="btn-primary">
              <MessageSquarePlus size={16} /> New Request
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
            </div>
          ) : requests.length === 0 ? (
            <div className="ui-card p-12 text-center">
              <Inbox size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-400">You haven&apos;t sent any requests yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="ui-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-semibold text-theme-800 bg-blue-50 px-2 py-0.5 rounded-md">{CATEGORY_LABELS[r.category] || r.category}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{r.subject}</h3>
                      <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{r.message}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{formatDate(r.submitted_at)}</span>
                  </div>
                  {r.review_notes && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                        {r.status === "approved" ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-rose-600" />}
                        Response{r.reviewed_by_name ? ` from ${r.reviewed_by_name}` : ""}
                      </p>
                      <p className="text-sm text-slate-600">{r.review_notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ComposeRequestModal open={showCompose} onClose={() => setShowCompose(false)} onSent={load} />
    </ProtectedLayout>
  );
}

// ─── Admin queue view ───────────────────────────────────────────────────────
function ReviewModal({
  request,
  onClose,
  onDone,
}: {
  request: EmployeeRequestItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);

  useEffect(() => { setNotes(""); }, [request]);

  if (!request) return null;

  const act = async (action: "approve" | "reject") => {
    setSubmitting(action);
    try {
      const res = await fetchWithAuth(`/payroll/requests/${request.id}/${action}`, {
        method: "PUT",
        body: JSON.stringify({ review_notes: notes.trim() || null }),
      });
      if (res.ok) {
        toast.success(`Request ${action === "approve" ? "approved" : "rejected"}`);
        onDone();
        onClose();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.detail || `Failed to ${action}`);
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2">
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl relative z-10 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">{request.subject}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{request.employee_name} ({request.employee_id}) · {CATEGORY_LABELS[request.category] || request.category} · {formatDate(request.submitted_at)}</p>
          </div>
          <button onClick={() => !submitting && onClose()} className="text-slate-400 hover:text-slate-700 p-1"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-4 border border-slate-100">{request.message}</p>

          {request.status === "pending" ? (
            <>
              <div>
                <label className="form-label">Response notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add a note for the employee…"
                  className="form-input"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => act("reject")} disabled={!!submitting} className="btn-secondary text-rose-600">
                  <XCircle size={15} /> {submitting === "reject" ? "Rejecting..." : "Reject"}
                </button>
                <button onClick={() => act("approve")} disabled={!!submitting} className="btn-primary">
                  <CheckCircle2 size={15} /> {submitting === "approve" ? "Approving..." : "Approve"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <StatusBadge status={request.status} />
              {request.reviewed_by_name && (
                <span className="text-xs text-slate-400">by {request.reviewed_by_name} on {request.reviewed_at ? formatDate(request.reviewed_at) : ""}</span>
              )}
            </div>
          )}
          {request.review_notes && request.status !== "pending" && (
            <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100">{request.review_notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminRequestsQueue() {
  const [requests, setRequests] = useState<EmployeeRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "approved" | "rejected">("pending");
  const [selected, setSelected] = useState<EmployeeRequestItem | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const res = await fetchWithAuth(`/payroll/requests${qs}`);
      if (res.ok) setRequests(await res.json());
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="text-indigo-600" size={28} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Employee Requests</h1>
                <p className="text-sm text-gray-500">{requests.length} {statusFilter || "total"}{statusFilter === "pending" && pendingCount > 0 ? " — needs review" : ""}</p>
              </div>
            </div>
          </div>

          <div className="mb-5 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm">
            <Filter size={14} className="text-slate-400 ml-1" />
            {(["pending", "approved", "rejected", ""] as const).map((s) => (
              <button
                key={s || "all"}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  statusFilter === s ? "bg-blue-50 text-theme-800 border border-blue-100" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>

          <div className="ui-card overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-[800px] text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="ui-table-head">Employee</th>
                    <th className="ui-table-head">Category</th>
                    <th className="ui-table-head">Subject</th>
                    <th className="ui-table-head">Status</th>
                    <th className="ui-table-head">Submitted</th>
                    <th className="ui-table-head text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={i}><td className="p-8" colSpan={6}><div className="h-6 bg-slate-50 rounded-lg animate-pulse" /></td></tr>
                    ))
                  ) : requests.length === 0 ? (
                    <tr><td className="p-16 text-center text-sm text-slate-400" colSpan={6}>No requests found</td></tr>
                  ) : (
                    requests.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelected(r)}>
                        <td className="ui-table-cell">
                          <p className="text-sm font-semibold text-slate-900">{r.employee_name}</p>
                          <p className="text-xs text-slate-400">{r.employee_id}</p>
                        </td>
                        <td className="ui-table-cell">
                          <span className="text-xs font-medium text-theme-800 bg-blue-50 px-2 py-0.5 rounded-md">{CATEGORY_LABELS[r.category] || r.category}</span>
                        </td>
                        <td className="ui-table-cell text-sm text-slate-700 max-w-xs truncate">{r.subject}</td>
                        <td className="ui-table-cell"><StatusBadge status={r.status} /></td>
                        <td className="ui-table-cell text-sm text-slate-500">{formatDate(r.submitted_at)}</td>
                        <td className="ui-table-cell text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                          >
                            <Eye size={13} /> {r.status === "pending" ? "Review" : "View"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <ReviewModal request={selected} onClose={() => setSelected(null)} onDone={load} />
    </ProtectedLayout>
  );
}

export default function RequestsPage() {
  const { user, hydrated } = useAuth();
  if (!hydrated) return null;
  return user?.is_superadmin ? <AdminRequestsQueue /> : <MyRequestsPortal />;
}

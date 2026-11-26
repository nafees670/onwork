"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
    ArrowLeft, FileText, Sparkles, Trash2, X, Download, PencilLine, CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";

type Payslip = {
    id: string;
    employee_id: string;
    month: number;
    year: number;
    basic_salary: string;
    hra: string;
    conveyance: string;
    utility: string;
    medical: string;
    gross_salary: string;
    per_day_salary: string;
    late_absent_equivalent: string;
    effective_absents: number;
    absent_days_deducted: string;
    absent_deduction: string;
    esp: string;
    loan_deduction: string;
    unpaid_leave_deduction: string;
    income_tax: string;
    total_deductions: string;
    net_pay: string;
    status: string;
    notes?: string | null;
    generated_at: string;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    final: "bg-indigo-100 text-indigo-700",
    paid: "bg-emerald-100 text-emerald-700",
};
const STATUS_FLOW = ["draft", "final", "paid"];

export default function PayslipPage() {
    const params = useParams();
    const employeeId = params?.id as string;

    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [noAccess, setNoAccess] = useState(false);
    const [showGen, setShowGen] = useState(false);
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [generating, setGenerating] = useState(false);
    const [selected, setSelected] = useState<Payslip | null>(null);
    const [notesDraft, setNotesDraft] = useState("");
    const [savingStatus, setSavingStatus] = useState(false);

    const load = async () => {
        try {
            const res = await fetchWithAuth(`/payroll/payslip?employee_id=${encodeURIComponent(employeeId)}`);
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) setPayslips(await res.json());
        } catch {
            toast.error("Failed to load payslips");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (employeeId) load(); }, [employeeId]);

    const generate = async () => {
        setGenerating(true);
        try {
            const res = await fetchWithAuth("/payroll/payslip/generate", {
                method: "POST",
                body: JSON.stringify({ employee_id: employeeId, month, year }),
            });
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) {
                toast.success("Payslip generated");
                setShowGen(false);
                load();
            } else {
                const err = await res.json().catch(() => ({}));
                const msg = err.detail?.[0]?.msg || err.detail || "Generation failed";
                toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
            }
        } catch {
            toast.error("Generation failed");
        } finally {
            setGenerating(false);
        }
    };

    const openModal = (p: Payslip) => {
        setSelected(p);
        setNotesDraft(p.notes || "");
    };

    const savePayslip = async (p: Payslip, status: string, notes: string) => {
        setSavingStatus(true);
        try {
            const res = await fetchWithAuth(`/payroll/payslip/${p.id}`, {
                method: "PUT",
                body: JSON.stringify({ status, notes }),
            });
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) {
                toast.success(`Status: ${status}`);
                const updated = { ...p, status, notes };
                setSelected(updated);
                setNotesDraft(notes);
                setPayslips((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.detail?.[0]?.msg || "Failed to update");
            }
        } catch {
            toast.error("Failed to update payslip");
        } finally {
            setSavingStatus(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Delete this payslip?")) return;
        const res = await fetchWithAuth(`/payroll/payslip/${id}`, { method: "DELETE" });
        if (res.ok) { toast.success("Payslip deleted"); load(); }
        else toast.error("Failed to delete");
    };

    const download = async (id: string) => {
        try {
            const res = await fetchWithAuth(`/payroll/payslip/${id}/pdf`);
            if (!res.ok) return toast.error("Failed to download PDF");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `payslip-${employeeId}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Failed to download PDF");
        }
    };

    const fmt = (v?: string) => (v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }));
    const nextStatus = (cur: string) => STATUS_FLOW[Math.min(STATUS_FLOW.indexOf(cur) + 1, STATUS_FLOW.length - 1)];

    return (
        <ProtectedLayout>
            <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="mb-4 flex items-center gap-3">
                        <Link href={`/employees/${employeeId}/edit`} className="inline-flex items-center gap-1 text-sm text-theme-800 hover:underline">
                            <ArrowLeft size={16} /> Back to Employee
                        </Link>
                        <span className="text-slate-300">|</span>
                        <Link href="/payroll/payslip" className="inline-flex items-center gap-1 text-sm text-theme-800 hover:underline">
                            All Payslips <PencilLine size={14} />
                        </Link>
                    </div>

                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="page-title">Payslips</h1>
                            <p className="page-subtitle">{employeeId}</p>
                        </div>
                        <button onClick={() => setShowGen((v) => !v)} className="btn-primary">
                            <Sparkles size={18} /> Generate Payslip
                        </button>
                    </div>

                    {noAccess && <AccessDenied />}

                    {showGen && (
                        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Month</label>
                                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Year</label>
                                <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                            </div>
                            <button onClick={generate} disabled={generating} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                                {generating ? "Generating..." : "Generate"}
                            </button>
                            <button onClick={() => setShowGen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                        </div>
                    )}

                    {loading ? (
                        <p className="text-gray-500">Loading...</p>
                    ) : payslips.length === 0 ? (
                        <p className="text-gray-500">No payslips generated yet.</p>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Period</th>
                                        <th className="px-4 py-3">Gross</th>
                                        <th className="px-4 py-3">Deductions</th>
                                        <th className="px-4 py-3">Net Payable</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {payslips.map((p) => (
                                        <tr key={p.id}>
                                            <td className="px-4 py-3 font-medium text-gray-900">{MONTHS[p.month - 1]} {p.year}</td>
                                            <td className="px-4 py-3">{fmt(p.gross_salary)}</td>
                                            <td className="px-4 py-3 text-red-600">{fmt(p.total_deductions)}</td>
                                            <td className="px-4 py-3 font-semibold text-gray-900">{fmt(p.net_pay)}</td>
                                            <td className="px-4 py-3">
                                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_COLORS[p.status] || STATUS_COLORS.draft}`}>
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {p.status !== "paid" && (
                                                    <button
                                                        onClick={() => savePayslip(p, nextStatus(p.status), p.notes || "")}
                                                        title={`Mark as ${nextStatus(p.status)}`}
                                                        className="mr-2 inline-flex text-emerald-600 hover:text-emerald-800"
                                                    >
                                                        <CheckCircle2 size={16} />
                                                    </button>
                                                )}
                                                <button onClick={() => openModal(p)} title="View" className="mr-2 text-indigo-600 hover:text-indigo-800"><FileText size={16} /></button>
                                                <button onClick={() => remove(p.id)} title="Delete" className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>

            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
                    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Payslip</h2>
                                <p className="text-sm text-gray-500">{selected.employee_id} · {MONTHS[selected.month - 1]} {selected.year} · generated {new Date(selected.generated_at).toLocaleString()}</p>
                            </div>
                            <button onClick={() => download(selected.id)} title="Download PDF" className="mr-3 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"><Download size={14} /> PDF</button>
                            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="space-y-3 px-6 py-5 text-sm">
                            <Row label="Basic Salary (50% of gross)" value={fmt(selected.basic_salary)} />
                            <Row label="HRA (40% of basic)" value={fmt(selected.hra)} />
                            <Row label="Conveyance (30% of basic)" value={fmt(selected.conveyance)} />
                            <Row label="Utility (20% of basic)" value={fmt(selected.utility)} />
                            <Row label="Medical (10% of basic)" value={fmt(selected.medical)} />
                            <Row label="Gross Salary" value={fmt(selected.gross_salary)} bold />
                            <Row label="Per-Day Salary" value={fmt(selected.per_day_salary)} />
                            <Row label="Late Absent Eq." value={fmt(selected.late_absent_equivalent)} />
                            <Row label="Effective Absents" value={String(selected.effective_absents)} />
                            <Row label="Absent Days Deducted" value={fmt(selected.absent_days_deducted)} />
                            <Row label="Absent Deduction" value={fmt(selected.absent_deduction)} />
                            <Row label="ESP (8.33% of basic)" value={fmt(selected.esp)} />
                            <Row label="Loan Deduction" value={fmt(selected.loan_deduction)} />
                            <Row label="Unpaid Leave Deduction" value={fmt(selected.unpaid_leave_deduction)} />
                            <Row label="Income Tax" value={fmt(selected.income_tax)} />
                            <Row label="Total Deductions" value={fmt(selected.total_deductions)} />
                            <div className="border-t border-gray-200 pt-3">
                                <Row label="NET PAY" value={fmt(selected.net_pay)} bold highlight />
                            </div>

                            {/* Status workflow + notes */}
                            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Workflow</p>
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    {STATUS_FLOW.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => savePayslip(selected, s, notesDraft)}
                                            disabled={savingStatus}
                                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${selected.status === s ? STATUS_COLORS[s] + " ring-2 ring-indigo-300" : "bg-white text-gray-500 border border-gray-300 hover:bg-gray-100"}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                                <textarea
                                    value={notesDraft}
                                    onChange={(e) => setNotesDraft(e.target.value)}
                                    rows={2}
                                    placeholder="Add note..."
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                                <button
                                    onClick={() => savePayslip(selected, selected.status, notesDraft)}
                                    disabled={savingStatus || notesDraft === (selected.notes || "")}
                                    className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                                >
                                    {savingStatus ? "Saving..." : "Save Notes"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ProtectedLayout>
    );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
    return (
        <div className={`flex justify-between ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>
            <span>{label}</span>
            <span className={highlight ? "text-lg font-bold text-indigo-600" : ""}>{value}</span>
        </div>
    );
}
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedLayout from "@/components/ProtectedLayout";
import EmployeeSelect from "@/components/EmployeeSelect";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
    FileText, Sparkles, Trash2, X, Download, Users, CheckCircle2, Filter, ChevronLeft, ChevronRight, Layers,
} from "lucide-react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    final: "bg-blue-50 text-theme-800",
    paid: "bg-emerald-100 text-emerald-700",
};
const STATUS_FLOW = ["draft", "final", "paid"];
const PAGE_SIZE = 20;

const genSchema = z.object({
    employee_id: z.string().min(1, "Select an employee"),
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2000),
});
type GenInput = z.input<typeof genSchema>;
type GenOutput = z.output<typeof genSchema>;

export default function PayrollPayslipPage() {
    const router = useRouter();

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [filtered, setFiltered] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);
    const [noAccess, setNoAccess] = useState(false);
    const [generateEmpId, setGenerateEmpId] = useState("");
    const [filterEmp, setFilterEmp] = useState("");
    const [filterMonth, setFilterMonth] = useState(currentMonth);
    const [filterYear, setFilterYear] = useState(currentYear);
    const [filterStatus, setFilterStatus] = useState("");
    const [selected, setSelected] = useState<Payslip | null>(null);
    const [notesDraft, setNotesDraft] = useState("");
    const [savingStatus, setSavingStatus] = useState(false);
    const [page, setPage] = useState(1);

    // Bulk generate
    const [bulkMonth, setBulkMonth] = useState(currentMonth);
    const [bulkYear, setBulkYear] = useState(currentYear);
    const [bulking, setBulking] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; created: number; skipped: number; failed: number } | null>(null);

    const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting } } =
        useForm<GenInput, any, GenOutput>({
            resolver: zodResolver(genSchema),
            defaultValues: {
                employee_id: "",
                month: currentMonth,
                year: currentYear,
            },
        });

    const load = async () => {
        const params = new URLSearchParams();
        if (filterEmp) params.set("employee_id", filterEmp);
        if (filterMonth) params.set("month", String(filterMonth));
        if (filterYear) params.set("year", String(filterYear));
        if (filterStatus) params.set("status", filterStatus);
        try {
            const res = await fetchWithAuth(`/payroll/payslip?${params.toString()}`);
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) setPayslips(await res.json());
        } catch {
            toast.error("Failed to load payslips");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [filterEmp, filterMonth, filterYear, filterStatus]);

    useEffect(() => {
        setFiltered(payslips);
        setPage(1);
    }, [payslips]);

    const generateOne = async (employee_id: string, month: number, year: number) => {
        const res = await fetchWithAuth("/payroll/payslip/generate", {
            method: "POST",
            body: JSON.stringify({ employee_id, month, year }),
        });
        return res;
    };

    const onGenerate: SubmitHandler<GenOutput> = async (data) => {
        try {
            const res = await generateOne(data.employee_id, data.month, data.year);
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) {
                toast.success("Payslip generated");
                reset({ employee_id: "", month: new Date().getMonth() + 1, year: new Date().getFullYear() });
                setGenerateEmpId("");
                load();
            } else {
                const err = await res.json().catch(() => ({}));
                const msg = err.detail?.[0]?.msg || err.detail || "Generation failed";
                toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
            }
        } catch {
            toast.error("Generation failed");
        }
    };

    const bulkGenerate = async () => {
        setBulking(true);
        setBulkProgress({ done: 0, total: 0, created: 0, skipped: 0, failed: 0 });
        try {
            // Use the atomic backend bulk operation. Calling the single-employee
            // endpoint in a loop produced a misleading 404 for every employee
            // without attendance or an active salary in the selected period.
            const params = new URLSearchParams({
                month: String(bulkMonth),
                year: String(bulkYear),
            });
            const res = await fetchWithAuth(`/payroll/generate?${params.toString()}`, {
                method: "POST",
            });
            if (res.status === 403) {
                setNoAccess(true);
                return;
            }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const message = err.detail?.[0]?.msg || err.detail || "Bulk generation failed";
                toast.error(typeof message === "string" ? message : JSON.stringify(message));
                return;
            }

            const result = await res.json();
            const created = Number(result.generated) || 0;
            const skipped = Number(result.skipped) || 0;
            const failed = Number(result.failed) || 0;
            const total = created + skipped + failed;
            setBulkProgress({ done: total, total, created, skipped, failed });
            if (created > 0) await load();
            toast.success(`Bulk done: ${created} created, ${skipped} skipped, ${failed} failed`);
        } catch {
            toast.error("Bulk generation failed");
        } finally {
            setBulking(false);
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
            a.download = "payslip.pdf";
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Failed to download PDF");
        }
    };

    const fmt = (v?: string) => (v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 }));
    const nextStatus = (cur: string) => STATUS_FLOW[Math.min(STATUS_FLOW.indexOf(cur) + 1, STATUS_FLOW.length - 1)];
    const dated = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

    const paged = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, page]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    return (
        <ProtectedLayout>
            <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="flex items-center gap-3 mb-6">
                        <FileText className="text-theme-800" size={24} />
                        <div>
                            <h1 className="page-title">Payroll — Payslips</h1>
                            <p className="page-subtitle">{filtered.length} payslip(s)</p>
                        </div>
                    </div>

                    {noAccess && <AccessDenied />}

                    {/* Filters */}
                    <div className="ui-card mb-4 flex flex-wrap items-end gap-3 p-4">
                        <div className="flex items-center gap-1 pr-2 text-xs font-semibold text-slate-500">
                            <Filter size={14} /> Filter
                        </div>
                        <div>
                            <label className="form-label">Month</label>
                            <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))} className="form-input h-auto py-2">
                                <option value={0}>All</option>
                                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label">Year</label>
                            <input type="number" value={filterYear || ""} onChange={(e) => setFilterYear(Number(e.target.value) || 0)} placeholder="All" className="form-input w-28 h-auto py-2" />
                        </div>
                        <div>
                            <label className="form-label">Status</label>
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="form-input h-auto py-2">
                                <option value="">All</option>
                                {STATUS_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="min-w-56 flex-1">
                            <label className="form-label">Employee</label>
                            <EmployeeSelect value={filterEmp} onChange={setFilterEmp} placeholder="Filter by employee (optional)..." />
                        </div>
                        {(filterMonth || filterYear || filterStatus || filterEmp) && (
                            <button onClick={() => { setFilterMonth(0); setFilterYear(0); setFilterStatus(""); setFilterEmp(""); }} className="btn-secondary">
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {/* Generate one */}
                        <form onSubmit={handleSubmit(onGenerate)} className="ui-card p-6">
                            <h2 className="text-sm font-semibold text-gray-900 mb-4">Generate Payslip</h2>
                            <div className="mb-3">
                                <label className="form-label">Employee</label>
                                <EmployeeSelect value={generateEmpId} onChange={(id) => { setGenerateEmpId(id); setValue("employee_id", id); }} />
                                {errors.employee_id && <p className="text-xs text-red-600 mt-1">{errors.employee_id.message}</p>}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="form-label">Month</label>
                                    <select {...register("month")} className="form-input">
                                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Year</label>
                                    <input type="number" {...register("year")} className="form-input" />
                                </div>
                            </div>
                            <button type="submit" disabled={isSubmitting} className="btn-primary mt-4">
                                <Sparkles size={16} /> {isSubmitting ? "Generating..." : "Generate"}
                            </button>
                        </form>

                        {/* Bulk generate */}
                        <div className="ui-card p-6">
                            <h2 className="text-sm font-semibold text-gray-900 mb-2">
                                <span className="inline-flex items-center gap-1.5"><Layers size={14} /> Generate for All Employees</span>
                            </h2>
                            <p className="mb-3 text-xs text-slate-500">
                                Creates draft payslips for employees with attendance in the selected month. Existing payslips and records without an active salary are skipped.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="form-label">Month</label>
                                    <select value={bulkMonth} onChange={(e) => setBulkMonth(Number(e.target.value))} className="form-input">
                                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Year</label>
                                    <input type="number" value={bulkYear} onChange={(e) => setBulkYear(Number(e.target.value))} className="form-input" />
                                </div>
                            </div>
                            <button onClick={bulkGenerate} disabled={bulking} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                                <Sparkles size={16} /> {bulking ? "Generating..." : "Generate for All"}
                            </button>
                            {bulkProgress && (
                                <div className="mt-4">
                                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                                        <span>{bulkProgress.done} attendance record(s) processed</span>
                                        <span>
                                            <span className="text-emerald-600">{bulkProgress.created} created</span> · <span className="text-slate-400">{bulkProgress.skipped} skipped</span> · <span className="text-rose-600">{bulkProgress.failed} failed</span>
                                        </span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${bulkProgress.total === 0 ? 0 : Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <p className="text-slate-500 text-sm">Loading...</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-slate-500 text-sm">No payslips found.</p>
                    ) : (
                        <div className="ui-card overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="ui-table-head">Employee</th>
                                        <th className="ui-table-head">Period</th>
                                        <th className="ui-table-head">Gross</th>
                                        <th className="ui-table-head">Deductions</th>
                                        <th className="ui-table-head">Net Payable</th>
                                        <th className="ui-table-head">Status</th>
                                        <th className="ui-table-head">Generated</th>
                                        <th className="ui-table-head text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paged.map((p) => (
                                        <tr key={p.id} className="hover:bg-gray-50">
                                            <td className="ui-table-cell">
                                                <button onClick={() => router.push(`/employees/${p.employee_id}/payslip`)} className="inline-flex items-center gap-1.5 font-medium text-theme-800 hover:underline">
                                                    <Users size={14} /> {p.employee_id}
                                                </button>
                                            </td>
                                            <td className="ui-table-cell font-medium text-gray-900">{MONTHS_FULL[p.month - 1]} {p.year}</td>
                                            <td className="ui-table-cell">{fmt(p.gross_salary)}</td>
                                            <td className="ui-table-cell text-rose-600">{fmt(p.total_deductions)}</td>
                                            <td className="ui-table-cell font-semibold text-gray-900">{fmt(p.net_pay)}</td>
                                            <td className="ui-table-cell">
                                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_COLORS[p.status] || STATUS_COLORS.draft}`}>{p.status}</span>
                                            </td>
                                            <td className="ui-table-cell text-slate-500">{dated(p.generated_at)}</td>
                                            <td className="ui-table-cell text-right">
                                                {p.status !== "paid" && (
                                                    <button onClick={() => savePayslip(p, nextStatus(p.status), p.notes || "")} title={`Mark as ${nextStatus(p.status)}`} className="mr-2 text-slate-400 hover:text-emerald-600">
                                                        <CheckCircle2 size={16} />
                                                    </button>
                                                )}
                                                <button onClick={() => openModal(p)} title="View" className="mr-2 text-slate-400 hover:text-theme-800"><FileText size={16} /></button>
                                                <button onClick={() => remove(p.id)} title="Delete" className="text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {filtered.length > PAGE_SIZE && (
                        <div className="mt-4 flex items-center justify-between">
                            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary">
                                    <ChevronLeft size={16} /> Prev
                                </button>
                                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary">
                                    Next <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
            </div>

            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
                    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Payslip</h2>
                                <p className="text-sm text-slate-500">{selected.employee_id} · {MONTHS_FULL[selected.month - 1]} {selected.year} · generated {new Date(selected.generated_at).toLocaleString()}</p>
                            </div>
                            <button onClick={() => download(selected.id)} title="Download PDF" className="mr-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 transition-colors"><Download size={14} /> PDF</button>
                            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
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
                            <div className="border-t border-gray-100 pt-3">
                                <Row label="NET PAY" value={fmt(selected.net_pay)} bold highlight />
                            </div>

                            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                                <p className="mb-2 text-xs font-semibold text-slate-500">Workflow</p>
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    {STATUS_FLOW.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => savePayslip(selected, s, notesDraft)}
                                            disabled={savingStatus}
                                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${selected.status === s ? STATUS_COLORS[s] + " ring-2 ring-blue-200" : "bg-white text-slate-500 border border-slate-200 hover:bg-gray-100"}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                                <label className="form-label">Notes</label>
                                <textarea
                                    value={notesDraft}
                                    onChange={(e) => setNotesDraft(e.target.value)}
                                    rows={2}
                                    placeholder="Add note..."
                                    className="form-input h-auto py-2"
                                />
                                <button
                                    onClick={() => savePayslip(selected, selected.status, notesDraft)}
                                    disabled={savingStatus || notesDraft === (selected.notes || "")}
                                    className="mt-2 rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 transition-colors disabled:opacity-40"
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
            <span className={highlight ? "text-lg font-bold text-theme-800" : ""}>{value}</span>
        </div>
    );
}

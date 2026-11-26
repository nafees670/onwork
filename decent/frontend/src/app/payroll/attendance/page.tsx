"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedLayout from "@/components/ProtectedLayout";
import EmployeeSelect from "@/components/EmployeeSelect";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
    CalendarCheck2, Upload, Save, Trash2, RefreshCw, Users, Pencil, AlertTriangle, Filter, ChevronLeft, ChevronRight, FileSpreadsheet,
} from "lucide-react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

type Attendance = {
    id: string;
    employee_id: string;
    month: number;
    year: number;
    total_work_days: number;
    presents: number;
    absents: number;
    lates: number;
    leaves: number;
    notes?: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];
const PAGE_SIZE = 20;

// Calendar Month Days policy: total calendar days in the given month (e.g. 28/29, 30, 31).
function getWorkDays(month: number, year: number): number {
    if (!month || !year) return 30;
    return new Date(year, month, 0).getDate();
}


const attSchema = z.object({
    employee_id: z.string().min(1, "Select an employee"),
    month: z.coerce.number().min(1).max(12, "Month 1-12"),
    year: z.coerce.number().min(2000),
    absents: z.coerce.number().min(0).default(0),
    lates: z.coerce.number().min(0).default(0),
    leaves: z.coerce.number().min(0).default(0),
    notes: z.string().optional(),
}).refine(
    (d) => d.absents + d.leaves <= getWorkDays(d.month, d.year),
    { message: "Absents + Leaves cannot exceed work days", path: ["absents"] }
).refine(
    (d) => d.lates <= (getWorkDays(d.month, d.year) - d.absents - d.leaves),
    { message: "Lates cannot exceed presents", path: ["lates"] }
);
type AttInput = z.input<typeof attSchema>;
type AttOutput = z.output<typeof attSchema>;

type CsvError = { row: number; error: string };

export default function PayrollAttendancePage() {
    const router = useRouter();

    const [records, setRecords] = useState<Attendance[]>([]);
    const [filtered, setFiltered] = useState<Attendance[]>([]);
    const [loading, setLoading] = useState(true);
    const [noAccess, setNoAccess] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [editing, setEditing] = useState<Attendance | null>(null);
    const [employeeId, setEmployeeId] = useState("");
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [filterMonth, setFilterMonth] = useState<number>(currentMonth);
    const [filterYear, setFilterYear] = useState<number>(currentYear);
    const [filterEmp, setFilterEmp] = useState("");
    const [page, setPage] = useState(1);
    const [tplMonth, setTplMonth] = useState<number>(currentMonth);
    const [tplYear, setTplYear] = useState<number>(currentYear);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [csvErrors, setCsvErrors] = useState<CsvError[]>([]);

    const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } =
        useForm<AttInput, any, AttOutput>({
            resolver: zodResolver(attSchema),
            defaultValues: {
                employee_id: "",
                month: currentMonth,
                year: currentYear,
                absents: 0,
                lates: 0,
                leaves: 0,
                notes: "",
            },
        });

    const wMonth = Number(watch("month") ?? currentMonth);
    const wYear = Number(watch("year") ?? currentYear);
    const wAbsents = Number(watch("absents") ?? 0);
    const wLeaves = Number(watch("leaves") ?? 0);
    const wLates = Number(watch("lates") ?? 0);
    const autoWorkDays = getWorkDays(wMonth, wYear);
    const autoPresents = Math.max(0, autoWorkDays - wAbsents - wLeaves);


    const load = async () => {
        try {
            const res = await fetchWithAuth("/payroll/attendance");
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) setRecords(await res.json());
        } catch {
            toast.error("Failed to load attendance");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        let list = records;
        if (filterMonth) list = list.filter((a) => a.month === filterMonth);
        if (filterYear) list = list.filter((a) => a.year === filterYear);
        if (filterEmp) list = list.filter((a) => a.employee_id === filterEmp);
        setFiltered(list);
        setPage(1);
        setSelectedIds(new Set());
    }, [records, filterMonth, filterYear, filterEmp]);

    const startEdit = (a: Attendance) => {
        setEditing(a);
        setEmployeeId(a.employee_id);
        setValue("employee_id", a.employee_id);
        setValue("month", a.month);
        setValue("year", a.year);
        setValue("absents", a.absents);
        setValue("lates", a.lates);
        setValue("leaves", a.leaves);
        setValue("notes", a.notes || "");
    };

    const cancelEdit = () => {
        setEditing(null);
        setEmployeeId("");
        reset({ employee_id: "", month: new Date().getMonth() + 1, year: new Date().getFullYear(), absents: 0, lates: 0, leaves: 0, notes: "" });
    };

    const onSubmit: SubmitHandler<AttOutput> = async (data) => {
        try {
            const workDays = getWorkDays(data.month, data.year);
            const presents = Math.max(0, workDays - data.absents - data.leaves);
            const payload = {
                ...data,
                total_work_days: workDays,
                presents,
            };
            if (editing) {
                const res = await fetchWithAuth(`/payroll/attendance/${editing.id}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                if (res.status === 403) return setNoAccess(true);
                if (res.ok) {
                    toast.success("Attendance updated");
                    cancelEdit();
                    load();
                } else {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.detail?.[0]?.msg || "Failed to update");
                }
                return;
            }
            const res = await fetchWithAuth("/payroll/attendance", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) {
                toast.success("Attendance saved");
                cancelEdit();
                load();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.detail?.[0]?.msg || "Failed to save");
            }
        } catch {
            toast.error(editing ? "Failed to update attendance" : "Failed to save attendance");
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Delete this attendance record?")) return;
        const res = await fetchWithAuth(`/payroll/attendance/${id}`, { method: "DELETE" });
        if (res.ok) { toast.success("Deleted"); load(); }
        else toast.error("Failed to delete");
    };

    const doUpload = async () => {
        if (!file) return toast.error("Choose a CSV file first");
        const formData = new FormData();
        formData.append("file", file);
        setUploading(true);
        setCsvErrors([]);
        try {
            const res = await fetchWithAuth("/payroll/attendance/bulk-upload", {
                method: "POST",
                body: formData,
            });
            if (res.status === 403) return setNoAccess(true);
            const result = await res.json();
            if (res.ok) {
                toast.success(`${result.succeeded} saved, ${result.failed} failed`);
                if (result.failed > 0 && Array.isArray(result.errors)) setCsvErrors(result.errors);
                load();
            } else toast.error(result.detail?.[0]?.msg || "Upload failed");
        } catch {
            toast.error("Upload failed");
        } finally {
            setUploading(false);
            setFile(null);
        }
    };

    const downloadTemplate = async () => {
        const month = tplMonth || new Date().getMonth() + 1;
        const year = tplYear || new Date().getFullYear();
        try {
            const res = await fetchWithAuth(`/payroll/attendance/template?month=${month}&year=${year}`);
            if (res.status === 403) return setNoAccess(true);
            if (!res.ok) return toast.error("Failed to download template");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `attendance_template_${month}_${year}.csv`;
            document.body.appendChild(link);
            link.click();
            // Revoke after the download has had a chance to start so the blob
            // isn't released before the browser begins saving the file.
            setTimeout(() => {
                link.remove();
                URL.revokeObjectURL(url);
            }, 1000);
        } catch {
            toast.error("Failed to download template");
        }
    };

    const paged = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, page]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    const pageIds = useMemo(() => paged.map((a) => a.id), [paged]);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    const somePageSelected = pageIds.some((id) => selectedIds.has(id));

    const toggleAllPage = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allPageSelected) {
                pageIds.forEach((id) => next.delete(id));
            } else {
                pageIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    const toggleOne = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const bulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        if (!confirm(`Delete ${ids.length} selected attendance record(s)? This cannot be undone.`)) return;
        setBulkDeleting(true);
        try {
            const res = await fetchWithAuth("/payroll/attendance/bulk-delete", {
                method: "DELETE",
                body: JSON.stringify({ ids }),
            });
            if (res.status === 403) return setNoAccess(true);
            const result = await res.json();
            if (res.ok) {
                toast.success(`${result.deleted} deleted, ${result.not_found} not found`);
                setSelectedIds(new Set());
                load();
            } else toast.error(result.detail?.[0]?.msg || "Bulk delete failed");
        } catch {
            toast.error("Bulk delete failed");
        } finally {
            setBulkDeleting(false);
        }
    };


    return (
        <ProtectedLayout>
            <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="flex items-center gap-3 mb-6">
                        <CalendarCheck2 className="text-theme-800" size={24} />
                        <div>
                            <h1 className="page-title">Payroll — Attendance</h1>
                            <p className="page-subtitle">{filtered.length} records</p>
                        </div>
                    </div>

                    {noAccess && <AccessDenied />}

                    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {/* Manual add/edit */}
                        <form onSubmit={handleSubmit(onSubmit)} className="ui-card p-6">
                            <h2 className="text-sm font-semibold text-gray-900 mb-4">
                                {editing ? `Edit ${editing.employee_id} — ${FULL_MONTH_NAMES[editing.month - 1]} ${editing.year}` : "Add / Update"}
                            </h2>
                            <div className="mb-3">
                                <label className="form-label">Employee</label>
                                <EmployeeSelect
                                    value={employeeId}
                                    onChange={(id) => { setEmployeeId(id); setValue("employee_id", id); }}
                                    disabled={!!editing}
                                />
                                {errors.employee_id && <p className="text-xs text-red-600 mt-1">{errors.employee_id.message}</p>}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="form-label">Month</label>
                                    <select
                                        {...register("month", { valueAsNumber: true })}
                                        disabled={!!editing}
                                        className="form-input bg-white cursor-pointer"
                                    >
                                        {FULL_MONTH_NAMES.map((name, i) => (
                                            <option key={name} value={i + 1}>
                                                {name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.month && <p className="text-xs text-red-600 mt-1">{errors.month.message}</p>}
                                </div>
                                <div>
                                    <label className="form-label">Year</label>
                                    <input
                                        type="number"
                                        min={2000}
                                        max={2100}
                                        {...register("year", { valueAsNumber: true })}
                                        disabled={!!editing}
                                        className="form-input"
                                    />
                                    {errors.year && <p className="text-xs text-red-600 mt-1">{errors.year.message}</p>}
                                </div>
                                <div>
                                    <label className="form-label">Work Days (auto)</label>
                                    <input
                                        type="number"
                                        value={autoWorkDays}
                                        disabled
                                        readOnly
                                        className="form-input bg-slate-50 text-slate-700 font-semibold cursor-not-allowed"
                                    />
                                    <p className="mt-0.5 text-[10px] text-slate-400">Total days in {FULL_MONTH_NAMES[wMonth - 1] || "month"}</p>
                                </div>
                                <div>
                                    <label className="form-label">Presents (auto)</label>
                                    <input
                                        type="number"
                                        value={autoPresents}
                                        disabled
                                        readOnly
                                        className="form-input bg-slate-50 text-slate-700 font-semibold cursor-not-allowed"
                                    />
                                    <p className="mt-0.5 text-[10px] text-slate-400">Work Days − Absents − Leaves</p>
                                </div>
                                <div>
                                    <label className="form-label">Absents</label>
                                    <input type="number" min={0} {...register("absents")} className="form-input" />
                                    {errors.absents && <p className="text-xs text-red-600 mt-1">{errors.absents.message}</p>}
                                </div>
                                <div>
                                    <label className="form-label">Lates</label>
                                    <input type="number" min={0} {...register("lates")} className="form-input" />
                                    {errors.lates && <p className="text-xs text-red-600 mt-1">{errors.lates.message}</p>}
                                </div>
                                <div>
                                    <label className="form-label">Leaves</label>
                                    <input type="number" min={0} {...register("leaves")} className="form-input" />
                                </div>
                                <div className="col-span-3">
                                    <label className="form-label">Notes</label>
                                    <input {...register("notes")} placeholder="Optional" className="form-input" />
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button type="submit" disabled={isSubmitting} className="btn-primary">
                                    <Save size={16} /> {isSubmitting ? "Saving..." : editing ? "Update" : "Save"}
                                </button>
                                {editing && (
                                    <button type="button" onClick={cancelEdit} className="btn-secondary">
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>

                        {/* Bulk upload */}
                        <div className="ui-card p-6">
                            <h2 className="text-sm font-semibold text-gray-900 mb-2">Bulk Upload (CSV)</h2>
                            <div className="mb-3 grid grid-cols-2 gap-2">
                                <div>
                                    <label className="form-label">Template Month</label>
                                    <select
                                        value={tplMonth}
                                        onChange={(e) => setTplMonth(Number(e.target.value))}
                                        className="form-input bg-white cursor-pointer"
                                    >
                                        {FULL_MONTH_NAMES.map((name, i) => (
                                            <option key={name} value={i + 1}>
                                                {name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Template Year</label>
                                    <input
                                        type="number"
                                        min={2000}
                                        max={2100}
                                        value={tplYear}
                                        onChange={(e) => setTplYear(Number(e.target.value))}
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <button onClick={downloadTemplate} className="btn-secondary mb-3">
                                <FileSpreadsheet size={16} /> Download Template (CSV)
                            </button>
                            <p className="mb-3 text-xs text-slate-500">
                                Columns: employee_id, employee_name, branch, designation, month, year, total_work_days, presents, absents, lates, leaves
                            </p>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="mb-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-theme-800 hover:file:bg-blue-100"
                            />
                            <button onClick={doUpload} disabled={!file || uploading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                                <Upload size={16} /> {uploading ? "Uploading..." : "Upload CSV"}
                            </button>

                            {csvErrors.length > 0 && (
                                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                                    <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-red-700">
                                        <AlertTriangle size={14} /> {csvErrors.length} row(s) failed
                                    </p>
                                    <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                                        {csvErrors.map((e, i) => (
                                            <li key={i} className="rounded bg-white/60 px-2 py-1">
                                                <span className="font-semibold">Row {e.row}:</span> {e.error}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Table Filters (placed right above Attendance records) */}
                    <div className="ui-card mb-4 flex flex-wrap items-end gap-3 p-4">
                        <div className="flex items-center gap-1.5 pr-2 text-xs font-semibold text-slate-600">
                            <Filter size={14} className="text-theme-800" /> Filter Records
                        </div>
                        <div>
                            <label className="form-label">Month</label>
                            <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))} className="form-input h-auto py-2 bg-white">
                                <option value={0}>All Months</option>
                                {FULL_MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label">Year</label>
                            <input type="number" value={filterYear || ""} onChange={(e) => setFilterYear(Number(e.target.value) || 0)} placeholder="All Years" className="form-input w-28 h-auto py-2" />
                        </div>
                        <div className="min-w-56 flex-1">
                            <label className="form-label">Employee</label>
                            <EmployeeSelect value={filterEmp} onChange={setFilterEmp} placeholder="Filter by employee (optional)..." />
                        </div>
                        {(filterMonth || filterYear || filterEmp) && (
                            <button onClick={() => { setFilterMonth(0); setFilterYear(0); setFilterEmp(""); }} className="btn-secondary">
                                Clear Filters
                            </button>
                        )}
                    </div>


                    {loading ? (
                        <p className="text-slate-500 text-sm">Loading...</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-slate-500 text-sm">No attendance records match.</p>
                    ) : (
                        <div className="ui-card overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="ui-table-head w-10">
                                            <input
                                                type="checkbox"
                                                checked={allPageSelected}
                                                ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                                                onChange={toggleAllPage}
                                                className="h-4 w-4 rounded border-gray-300 text-theme-800 focus:ring-theme-500"
                                                title="Select all on this page"
                                            />
                                        </th>
                                        <th className="ui-table-head">Employee</th>
                                        <th className="ui-table-head">Month</th>
                                        <th className="ui-table-head">Work Days</th>
                                        <th className="ui-table-head">P</th>
                                        <th className="ui-table-head">A</th>
                                        <th className="ui-table-head">Lates</th>
                                        <th className="ui-table-head">Leaves</th>
                                        <th className="ui-table-head text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paged.map((a) => (
                                        <tr key={a.id} className={selectedIds.has(a.id) ? "bg-blue-50" : "hover:bg-gray-50"}>
                                            <td className="ui-table-cell">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(a.id)}
                                                    onChange={() => toggleOne(a.id)}
                                                    className="h-4 w-4 rounded border-gray-300 text-theme-800 focus:ring-theme-500"
                                                />
                                            </td>
                                            <td className="ui-table-cell">
                                                <button onClick={() => router.push(`/employees/${a.employee_id}/attendance`)} className="inline-flex items-center gap-1.5 font-medium text-theme-800 hover:underline">
                                                    <Users size={14} /> {a.employee_id}
                                                </button>
                                            </td>
                                            <td className="ui-table-cell font-medium text-gray-900">{MONTHS[a.month - 1]} {a.year}</td>
                                            <td className="ui-table-cell">{a.total_work_days}</td>
                                            <td className="ui-table-cell text-emerald-600">{a.presents}</td>
                                            <td className="ui-table-cell text-rose-600">{a.absents}</td>
                                            <td className="ui-table-cell text-amber-600">{a.lates}</td>
                                            <td className="ui-table-cell text-theme-800">{a.leaves}</td>
                                            <td className="ui-table-cell text-right">
                                                <button onClick={() => startEdit(a)} title="Edit" className="mr-2 text-slate-400 hover:text-theme-800"><Pencil size={16} /></button>
                                                <button onClick={load} title="Refresh" className="mr-2 text-slate-400 hover:text-slate-600"><RefreshCw size={16} /></button>
                                                <button onClick={() => remove(a.id)} title="Delete" className="text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {selectedIds.size > 0 && (
                        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                            <span className="text-sm font-semibold text-gray-700">{selectedIds.size} selected</span>
                            <button
                                onClick={bulkDelete}
                                disabled={bulkDeleting}
                                className="btn-danger"
                            >
                                <Trash2 size={16} /> {bulkDeleting ? "Deleting..." : "Delete Selected"}
                            </button>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="text-sm text-slate-500 hover:text-slate-700"
                            >
                                Clear
                            </button>
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
        </ProtectedLayout>
    );
}
"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
    ArrowLeft, Upload, Save, Trash2, RefreshCw, Pencil, AlertTriangle, PencilLine, FileSpreadsheet,
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

// Calendar Month Days policy: total calendar days in the given month (e.g. 28/29, 30, 31).
function getWorkDays(month: number, year: number): number {
    if (!month || !year) return 30;
    return new Date(year, month, 0).getDate();
}

const attSchema = z.object({
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

export default function AttendancePage() {
    const params = useParams();
    const employeeId = params?.id as string;

    const [records, setRecords] = useState<Attendance[]>([]);
    const [loading, setLoading] = useState(true);
    const [noAccess, setNoAccess] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [editing, setEditing] = useState<Attendance | null>(null);
    const [csvErrors, setCsvErrors] = useState<CsvError[]>([]);

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } =
        useForm<AttInput, any, AttOutput>({
            resolver: zodResolver(attSchema),
            defaultValues: {
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
            const res = await fetchWithAuth(`/payroll/attendance?employee_id=${encodeURIComponent(employeeId)}`);
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) setRecords(await res.json());
        } catch {
            toast.error("Failed to load attendance");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (employeeId) load(); }, [employeeId]);

    const startEdit = (a: Attendance) => {
        setEditing(a);
        setValue("month", a.month);
        setValue("year", a.year);
        setValue("absents", a.absents);
        setValue("lates", a.lates);
        setValue("leaves", a.leaves);
        setValue("notes", a.notes || "");
    };

    const cancelEdit = () => {
        setEditing(null);
        reset({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), absents: 0, lates: 0, leaves: 0, notes: "" });
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
                body: JSON.stringify({ employee_id: employeeId, ...payload }),
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
        const month = Number(watch("month") ?? new Date().getMonth() + 1);
        const year = Number(watch("year") ?? new Date().getFullYear());
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
            setTimeout(() => {
                link.remove();
                URL.revokeObjectURL(url);
            }, 1000);
        } catch {
            toast.error("Failed to download template");
        }
    };

    return (
        <ProtectedLayout>
            <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="mb-4 flex items-center gap-3">
                        <Link href={`/employees/${employeeId}/edit`} className="inline-flex items-center gap-1 text-sm text-theme-800 hover:underline">
                            <ArrowLeft size={16} /> Back to Employee
                        </Link>
                        <span className="text-slate-300">|</span>
                        <Link href="/payroll/attendance" className="inline-flex items-center gap-1 text-sm text-theme-800 hover:underline">
                            All Attendance <PencilLine size={14} />
                        </Link>
                    </div>

                    <div className="mb-6">
                        <h1 className="page-title">Attendance</h1>
                        <p className="page-subtitle">{employeeId}{editing ? ` · editing ${MONTHS[editing.month - 1]} ${editing.year}` : ""}</p>
                    </div>

                    {noAccess && <AccessDenied />}

                    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {/* Manual add/edit */}
                        <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                                {editing ? `Edit ${MONTHS[editing.month - 1]} ${editing.year}` : "Add / Update Month"}
                            </h2>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-700">Month</label>
                                    <select
                                        {...register("month", { valueAsNumber: true })}
                                        disabled={!!editing}
                                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white cursor-pointer disabled:opacity-50"
                                    >
                                        {FULL_MONTH_NAMES.map((name, i) => (
                                            <option key={name} value={i + 1}>
                                                {name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.month && <p className="text-xs text-red-600">{errors.month.message}</p>}
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-700">Year</label>
                                    <input
                                        type="number"
                                        min={2000}
                                        max={2100}
                                        {...register("year", { valueAsNumber: true })}
                                        disabled={!!editing}
                                        className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-700">Work Days (auto)</label>
                                    <input
                                        type="number"
                                        value={autoWorkDays}
                                        disabled
                                        readOnly
                                        className="w-full rounded-lg border border-gray-200 bg-gray-100 px-2 py-2 text-sm font-semibold text-gray-700 cursor-not-allowed"
                                    />
                                    <p className="mt-0.5 text-[10px] text-gray-400">Total days in {FULL_MONTH_NAMES[wMonth - 1] || "month"}</p>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-700">Presents (auto)</label>
                                    <input
                                        type="number"
                                        value={autoPresents}
                                        disabled
                                        readOnly
                                        className="w-full rounded-lg border border-gray-200 bg-gray-100 px-2 py-2 text-sm font-semibold text-gray-700 cursor-not-allowed"
                                    />
                                    <p className="mt-0.5 text-[10px] text-gray-400">Work Days − Absents − Leaves</p>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-700">Absents</label>
                                    <input type="number" {...register("absents")} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                                    {errors.absents && <p className="text-xs text-red-600">{errors.absents.message}</p>}
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-700">Lates</label>
                                    <input type="number" {...register("lates")} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                                    {errors.lates && <p className="text-xs text-red-600">{errors.lates.message}</p>}
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-gray-700">Leaves</label>
                                    <input type="number" {...register("leaves")} className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                                </div>
                                <div className="col-span-3">
                                    <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                                    <input {...register("notes")} placeholder="Optional" className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm" />
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                                    <Save size={16} /> {isSubmitting ? "Saving..." : editing ? "Update" : "Save"}
                                </button>
                                {editing && (
                                    <button type="button" onClick={cancelEdit} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>

                        {/* Bulk upload */}
                        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 shadow-sm">
                            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Bulk Upload (CSV)</h2>
                            <p className="mb-3 text-xs text-gray-500">
                                Columns: employee_id, employee_name, branch, designation, month, year, total_work_days, presents, absents, lates, leaves
                            </p>
                            <button onClick={downloadTemplate} className="mb-3 inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
                                <FileSpreadsheet size={16} /> Download Template (CSV)
                            </button>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="mb-3 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-600 hover:file:bg-indigo-100"
                            />
                            <button onClick={doUpload} disabled={!file || uploading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
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

                    {loading ? (
                        <p className="text-gray-500">Loading...</p>
                    ) : records.length === 0 ? (
                        <p className="text-gray-500">No attendance records yet.</p>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Month</th>
                                        <th className="px-4 py-3">Work Days</th>
                                        <th className="px-4 py-3">P</th>
                                        <th className="px-4 py-3">A</th>
                                        <th className="px-4 py-3">Lates</th>
                                        <th className="px-4 py-3">Leaves</th>
                                        <th className="px-4 py-3">Notes</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {records.map((a) => (
                                        <tr key={a.id}>
                                            <td className="px-4 py-3 font-medium text-gray-900">{MONTHS[a.month - 1]} {a.year}</td>
                                            <td className="px-4 py-3">{a.total_work_days}</td>
                                            <td className="px-4 py-3 text-emerald-600">{a.presents}</td>
                                            <td className="px-4 py-3 text-red-600">{a.absents}</td>
                                            <td className="px-4 py-3 text-amber-600">{a.lates}</td>
                                            <td className="px-4 py-3 text-indigo-600">{a.leaves}</td>
                                            <td className="px-4 py-3 text-gray-500">{a.notes || "—"}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => startEdit(a)} title="Edit" className="mr-2 text-indigo-600 hover:text-indigo-800"><Pencil size={16} /></button>
                                                <button onClick={load} title="Refresh" className="mr-2 text-gray-400 hover:text-gray-600"><RefreshCw size={16} /></button>
                                                <button onClick={() => remove(a.id)} title="Delete" className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>
        </ProtectedLayout>
    );
}
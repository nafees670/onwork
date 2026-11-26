"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import EmployeeSelect from "@/components/EmployeeSelect";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
    Plus, Wallet, Pencil, Power, Trash2, Users, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

type Salary = {
    id: string;
    employee_id: string;
    gross_salary: string;
    currency: string;
    effective_from: string;
    effective_to?: string | null;
    is_active: boolean;
    notes?: string | null;
    created_at: string;
};

const salarySchema = z.object({
    employee_id: z.string().min(1, "Select an employee"),
    gross_salary: z.coerce.number().min(0, "Must be >= 0"),
    currency: z.string().min(1).default("PKR"),
    effective_from: z.string().min(1, "Required"),
    notes: z.string().optional(),
});

type SalaryInput = z.input<typeof salarySchema>;
type SalaryOutput = z.output<typeof salarySchema>;

const PAGE_SIZE = 20;

export default function PayrollSalaryPage() {
    const [salaries, setSalaries] = useState<Salary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editing, setEditing] = useState<Salary | null>(null);
    const [employeeId, setEmployeeId] = useState("");
    const [noAccess, setNoAccess] = useState(false);
    const [activeOnly, setActiveOnly] = useState(false);
    const [page, setPage] = useState(1);

    const {
        register, handleSubmit, reset, setValue,
        formState: { errors, isSubmitting },
    } = useForm<SalaryInput, any, SalaryOutput>({ resolver: zodResolver(salarySchema) });

    const load = async () => {
        try {
            const qs = activeOnly ? "?active_only=true" : "";
            const res = await fetchWithAuth(`/payroll/salary${qs}`);
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) setSalaries(await res.json());
        } catch {
            toast.error("Failed to load salaries");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [activeOnly]);

    const startCreate = () => {
        setEditing(null);
        setEmployeeId("");
        reset({ employee_id: "", gross_salary: 0, currency: "PKR", effective_from: "", notes: "" });
        setShowCreate(true);
    };

    const startEdit = (s: Salary) => {
        setEditing(s);
        setEmployeeId(s.employee_id);
        setValue("employee_id", s.employee_id);
        setValue("gross_salary", Number(s.gross_salary));
        setValue("currency", s.currency);
        setValue("effective_from", s.effective_from);
        setValue("notes", s.notes || "");
        setShowCreate(true);
    };

    const cancelForm = () => {
        setShowCreate(false);
        setEditing(null);
        setEmployeeId("");
        reset();
    };

    const onSubmit: SubmitHandler<SalaryOutput> = async (data) => {
        try {
            if (editing) {
                const res = await fetchWithAuth(`/payroll/salary/${editing.id}`, {
                    method: "PUT",
                    body: JSON.stringify(data),
                });
                if (res.status === 403) return setNoAccess(true);
                if (res.ok) {
                    toast.success("Salary updated");
                    cancelForm();
                    load();
                } else {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.detail?.[0]?.msg || "Failed to update salary");
                }
                return;
            }
            const res = await fetchWithAuth("/payroll/salary", {
                method: "POST",
                body: JSON.stringify({ ...data, is_active: true }),
            });
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) {
                toast.success("Salary created");
                cancelForm();
                load();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.detail?.[0]?.msg || "Failed to create salary");
            }
        } catch {
            toast.error(editing ? "Failed to update salary" : "Failed to create salary");
        }
    };

    const deactivate = async (id: string) => {
        try {
            const res = await fetchWithAuth(`/payroll/salary/${id}/deactivate`, { method: "POST" });
            if (res.ok) {
                toast.success("Salary deactivated");
                load();
            } else toast.error("Failed to deactivate");
        } catch {
            toast.error("Failed to deactivate");
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Delete this salary record?")) return;
        try {
            const res = await fetchWithAuth(`/payroll/salary/${id}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Salary deleted");
                load();
            } else toast.error("Failed to delete");
        } catch {
            toast.error("Failed to delete");
        }
    };

    const fmt = (v?: string) => (v == null ? "—" : Number(v).toLocaleString());

    const paged = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return salaries.slice(start, start + PAGE_SIZE);
    }, [salaries, page]);

    const totalPages = Math.max(1, Math.ceil(salaries.length / PAGE_SIZE));

    return (
        <ProtectedLayout>
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Wallet className="text-theme-800" size={24} />
                        <div>
                            <h1 className="page-title">Payroll — Salaries</h1>
                            <p className="page-subtitle">{salaries.length} records</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                            <input type="checkbox" checked={activeOnly} onChange={(e) => { setActiveOnly(e.target.checked); setPage(1); }} className="h-4 w-4 accent-theme-800" />
                            Active only
                        </label>
                        <button onClick={startCreate} className="btn-primary">
                            <Plus size={16} /> New Salary
                        </button>
                    </div>
                </div>

                {noAccess && <AccessDenied />}

                {showCreate && (
                    <form onSubmit={handleSubmit(onSubmit)} className="ui-card mb-6 p-6">
                        <h2 className="text-sm font-semibold text-gray-900 mb-4">
                            {editing ? `Edit Salary (${editing.employee_id})` : "New Salary"}
                        </h2>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                                <label className="form-label">Employee</label>
                                <EmployeeSelect
                                    value={employeeId}
                                    onChange={(id) => { setEmployeeId(id); setValue("employee_id", id); }}
                                    disabled={!!editing}
                                />
                                {errors.employee_id && <p className="text-xs text-red-600 mt-1">{errors.employee_id.message}</p>}
                            </div>
                            <div>
                                <label className="form-label">Gross Salary</label>
                                <input type="number" step="0.01" {...register("gross_salary")} className="form-input" />
                                {errors.gross_salary && <p className="text-xs text-red-600 mt-1">{errors.gross_salary.message}</p>}
                                <p className="mt-1 text-xs text-slate-400">Basic/HRA/Conveyance/Utility/Medical and deductions are derived automatically.</p>
                            </div>
                            <div>
                                <label className="form-label">Currency</label>
                                <input {...register("currency")} className="form-input" />
                            </div>
                            <div>
                                <label className="form-label">Effective From</label>
                                <input type="date" {...register("effective_from")} className="form-input" />
                                {errors.effective_from && <p className="text-xs text-red-600 mt-1">{errors.effective_from.message}</p>}
                            </div>
                            <div>
                                <label className="form-label">Notes</label>
                                <input {...register("notes")} placeholder="Optional" className="form-input" />
                            </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button type="submit" disabled={isSubmitting} className="btn-primary">
                                {isSubmitting ? "Saving..." : editing ? "Update Salary" : "Create Salary"}
                            </button>
                            <button type="button" onClick={cancelForm} className="btn-secondary">
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                {loading ? (
                    <p className="text-slate-500 text-sm">Loading...</p>
                ) : salaries.length === 0 ? (
                    <p className="text-slate-500 text-sm">No salary records yet.</p>
                ) : (
                    <div className="ui-card overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="ui-table-head">Employee</th>
                                    <th className="ui-table-head">Gross Salary</th>
                                    <th className="ui-table-head">Currency</th>
                                    <th className="ui-table-head">Effective</th>
                                    <th className="ui-table-head">Status</th>
                                    <th className="ui-table-head text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paged.map((s) => (
                                    <tr key={s.id} className="hover:bg-gray-50">
                                        <td className="ui-table-cell">
                                            <Link href={`/employees/${s.employee_id}`} className="inline-flex items-center gap-1.5 font-medium text-theme-800 hover:underline">
                                                <Users size={14} /> {s.employee_id}
                                            </Link>
                                        </td>
                                        <td className="ui-table-cell font-medium text-gray-900">{fmt(s.gross_salary)}</td>
                                        <td className="ui-table-cell">{s.currency}</td>
                                        <td className="ui-table-cell text-slate-600">{s.effective_from}</td>
                                        <td className="ui-table-cell">
                                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${s.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                                                {s.is_active ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td className="ui-table-cell text-right">
                                            <button onClick={() => startEdit(s)} title="Edit" className="mr-2 inline-flex text-slate-400 hover:text-theme-800">
                                                <Pencil size={16} />
                                            </button>
                                            {s.is_active && (
                                                <button onClick={() => deactivate(s.id)} title="Deactivate" className="mr-2 inline-flex text-slate-400 hover:text-amber-600">
                                                    <Power size={16} />
                                                </button>
                                            )}
                                            <button onClick={() => remove(s.id)} title="Delete" className="inline-flex text-slate-400 hover:text-rose-600">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {salaries.length > PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-slate-500">
                            Page {page} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="btn-secondary"
                            >
                                <ChevronLeft size={16} /> Prev
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="btn-secondary"
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedLayout>
    );
}
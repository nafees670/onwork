"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
    Plus, ArrowLeft, Pencil, Power, Trash2, PencilLine,
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
};

const salarySchema = z.object({
    gross_salary: z.coerce.number().min(0, "Must be >= 0"),
    currency: z.string().min(1),
    effective_from: z.string().min(1, "Required"),
    notes: z.string().optional(),
});

type SalaryInput = z.input<typeof salarySchema>;
type SalaryOutput = z.output<typeof salarySchema>;

export default function SalaryPage() {
    const params = useParams();
    const employeeId = params?.id as string;

    const [salaries, setSalaries] = useState<Salary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editing, setEditing] = useState<Salary | null>(null);
    const [noAccess, setNoAccess] = useState(false);

    const {
        register, handleSubmit, reset, setValue,
        formState: { errors, isSubmitting },
    } = useForm<SalaryInput, any, SalaryOutput>({ resolver: zodResolver(salarySchema) });

    const load = async () => {
        try {
            const res = await fetchWithAuth(`/payroll/salary?employee_id=${encodeURIComponent(employeeId)}`);
            if (res.status === 403) return setNoAccess(true);
            if (res.ok) setSalaries(await res.json());
        } catch {
            toast.error("Failed to load salaries");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (employeeId) load(); }, [employeeId]);

    const startCreate = () => {
        setEditing(null);
        reset({ gross_salary: 0, currency: "PKR", effective_from: "", notes: "" });
        setShowCreate(true);
    };

    const startEdit = (s: Salary) => {
        setEditing(s);
        setValue("gross_salary", Number(s.gross_salary));
        setValue("currency", s.currency);
        setValue("effective_from", s.effective_from);
        setValue("notes", s.notes || "");
        setShowCreate(true);
    };

    const cancelForm = () => {
        setShowCreate(false);
        setEditing(null);
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
                body: JSON.stringify({ employee_id: employeeId, ...data, is_active: true }),
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

    return (
        <ProtectedLayout>
            <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="mb-4 flex items-center gap-3">
                        <Link href={`/employees/${employeeId}/edit`} className="inline-flex items-center gap-1 text-sm text-theme-800 hover:underline">
                            <ArrowLeft size={16} /> Back to Employee
                        </Link>
                        <span className="text-slate-300">|</span>
                        <Link href="/payroll/salary" className="inline-flex items-center gap-1 text-sm text-theme-800 hover:underline">
                            All Salaries <PencilLine size={14} />
                        </Link>
                    </div>

                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="page-title">Salary</h1>
                            <p className="page-subtitle">{employeeId}</p>
                        </div>
                        <button
                            onClick={startCreate}
                            className="btn-primary"
                        >
                            <Plus size={18} /> New Salary
                        </button>
                    </div>

                    {noAccess && <AccessDenied />}

                    {showCreate && (
                        <form onSubmit={handleSubmit(onSubmit)} className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                                {editing ? `Edit Salary (${editing.employee_id})` : "New Salary"}
                            </h2>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Gross Salary</label>
                                    <input type="number" step="0.01" {...register("gross_salary")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                                    {errors.gross_salary && <p className="text-xs text-red-600">{errors.gross_salary.message}</p>}
                                    <p className="mt-1 text-xs text-gray-400">Basic/HRA/Conveyance/Utility/Medical and deductions are derived automatically.</p>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
                                    <input {...register("currency")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Effective From</label>
                                    <input type="date" {...register("effective_from")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                                    {errors.effective_from && <p className="text-xs text-red-600">{errors.effective_from.message}</p>}
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                                    <input {...register("notes")} placeholder="Optional" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2">
                                <button type="submit" disabled={isSubmitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                                    {isSubmitting ? "Saving..." : editing ? "Update Salary" : "Create Salary"}
                                </button>
                                <button type="button" onClick={cancelForm} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}

                    {loading ? (
                        <p className="text-gray-500">Loading...</p>
                    ) : salaries.length === 0 ? (
                        <p className="text-gray-500">No salary records yet.</p>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Gross Salary</th>
                                        <th className="px-4 py-3">Currency</th>
                                        <th className="px-4 py-3">Effective</th>
                                        <th className="px-4 py-3">Notes</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {salaries.map((s) => (
                                        <tr key={s.id}>
                                            <td className="px-4 py-3 font-medium text-gray-900">{fmt(s.gross_salary)}</td>
                                            <td className="px-4 py-3">{s.currency}</td>
                                            <td className="px-4 py-3 text-gray-600">{s.effective_from}</td>
                                            <td className="px-4 py-3 text-gray-500">{s.notes || "—"}</td>
                                            <td className="px-4 py-3">
                                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${s.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                                                    {s.is_active ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => startEdit(s)} title="Edit" className="mr-2 inline-flex text-indigo-600 hover:text-indigo-800">
                                                    <Pencil size={16} />
                                                </button>
                                                {s.is_active && (
                                                    <button onClick={() => deactivate(s.id)} title="Deactivate" className="mr-2 inline-flex text-amber-500 hover:text-amber-700">
                                                        <Power size={16} />
                                                    </button>
                                                )}
                                                <button onClick={() => remove(s.id)} title="Delete" className="inline-flex text-red-500 hover:text-red-700">
                                                    <Trash2 size={16} />
                                                </button>
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
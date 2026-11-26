"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
    Plus, Search, Edit2, Trash2, X,
    LayoutGrid, CheckCircle2, XCircle,
    GitBranch, Building2, Loader2,
} from "lucide-react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { generateDepartmentCode } from "@/utils/codeGen";

type Department = {
    id: string;
    dept_code: string;
    dept_name: string;
    institution_code?: string;
    branch_code?: string;
    description?: string;
};

type Institution = { inst_code: string; name: string };
type Branch = { branch_code: string; branch_name: string; institution_code?: string };

const deptSchema = z.object({
    dept_name: z.string().trim().min(2, "Name must be at least 2 characters"),
    dept_code: z.string().trim()
        .min(1, "Code is required")
        .max(6, "Code must be 6 characters or less")
        .regex(/^[A-Za-z0-9]+$/, "Code must be alphanumeric only"),
    institution_code: z.string().optional().or(z.literal("")),
    branch_code: z.string().optional().or(z.literal("")),
    description: z.string().trim().optional().or(z.literal("")),
});

type DeptInput = z.input<typeof deptSchema>;
type DeptOutput = z.output<typeof deptSchema>;

function RowSkeleton() {
    return <div className="animate-pulse bg-slate-100 rounded h-4 w-full" />;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-xs text-rose-500 mt-1">{msg}</p>;
}

type SaveResult = { ok: boolean; fieldErrors?: Record<string, string>; error?: string };

function DepartmentModal({
    open, onClose, onSave, initial, institutions, branches,
}: {
    open: boolean;
    onClose: () => void;
    onSave: (d: DeptOutput) => Promise<SaveResult>;
    initial?: Department | null;
    institutions: Institution[];
    branches: Branch[];
}) {
    const {
        register, handleSubmit, reset, setError, watch, setValue,
        formState: { errors, isSubmitting },
    } = useForm<DeptInput, any, DeptOutput>({
        resolver: zodResolver(deptSchema),
        defaultValues: { dept_name: "", dept_code: "", institution_code: "", branch_code: "", description: "" },
    });
    const [submitError, setSubmitError] = useState<string | null>(null);
    const instVal = watch("institution_code");
    const branchVal = watch("branch_code");
    const nameVal = watch("dept_name");
    const selectedBranch = branches.find(b => b.branch_code === branchVal);
    const filteredInstitutions = selectedBranch?.institution_code
        ? institutions.filter(i => i.inst_code === selectedBranch.institution_code)
        : institutions;

    useEffect(() => {
        if (!open) return;
        setSubmitError(null);
        reset(initial ? {
            dept_name: initial.dept_name || "",
            dept_code: initial.dept_code || "",
            institution_code: initial.institution_code || "",
            branch_code: initial.branch_code || "",
            description: initial.description || "",
        } : { dept_name: "", dept_code: "", institution_code: "", branch_code: "", description: "" });
    }, [initial, open, reset]);

    // Code is auto-derived from the name -- never typed by hand. Existing
    // departments keep their original code (never regenerated on edit).
    useEffect(() => {
        if (!open || initial) return;
        setValue("dept_code", generateDepartmentCode(nameVal || ""));
    }, [nameVal, open, initial, setValue]);

    if (!open) return null;

    const submit: SubmitHandler<DeptOutput> = async (data) => {
        setSubmitError(null);
        const res = await onSave(data);
        if (!res.ok) {
            if (res.fieldErrors) {
                Object.entries(res.fieldErrors).forEach(([k, v]) => setError(k as any, { message: v }));
            }
            if (res.error) setSubmitError(res.error);
            return;
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <form onSubmit={handleSubmit(submit)} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-gray-100">
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">{initial ? "Edit Department" : "Add Department"}</h2>
                    <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50"><X size={18} /></button>
                </div>

                {submitError && (
                    <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm font-medium text-red-600">
                        {submitError}
                    </div>
                )}

                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label className="form-label">Branch</label>
                        <select
                            {...register("branch_code")}
                            onChange={(e) => {
                                const code = e.target.value;
                                const br = branches.find(b => b.branch_code === code);
                                setValue("branch_code", code);
                                setValue("institution_code", br?.institution_code || "");
                            }}
                            className="form-input"
                        >
                            <option value="">Select a branch</option>
                            {branches.map(b => (
                                <option key={b.branch_code} value={b.branch_code}>
                                    {b.branch_name} ({b.branch_code})
                                </option>
                            ))}
                        </select>
                        <FieldError msg={errors.branch_code?.message} />
                        {!instVal && !branchVal && (
                            <p className="text-xs text-slate-400 mt-1">Pick a branch to auto-select its institution</p>
                        )}
                    </div>

                    <div>
                        <label className="form-label">Institution</label>
                        <select
                            {...register("institution_code")}
                            onChange={(e) => {
                                setValue("institution_code", e.target.value);
                                if (e.target.value) setValue("branch_code", "");
                            }}
                            className="form-input"
                        >
                            <option value="">Select an institution</option>
                            {filteredInstitutions.map(inst => (
                                <option key={inst.inst_code} value={inst.inst_code}>
                                    {inst.name} ({inst.inst_code})
                                </option>
                            ))}
                        </select>
                        <FieldError msg={errors.institution_code?.message} />
                    </div>

                    <div>
                        <label className="form-label">Department Name <span className="text-rose-500 ml-0.5">*</span></label>
                        <input
                            type="text"
                            placeholder="e.g. Academic Affairs"
                            {...register("dept_name")}
                            className="form-input"
                        />
                        <FieldError msg={errors.dept_name?.message} />
                        {watch("dept_code") && (
                            <p className="text-xs text-slate-400 mt-1.5">
                                Code: <span className="font-mono font-semibold text-slate-600">{watch("dept_code")}</span> (auto-generated)
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="form-label">Description</label>
                        <input
                            type="text"
                            placeholder="Brief description"
                            {...register("description")}
                            className="form-input"
                        />
                        <FieldError msg={errors.description?.message} />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="btn-primary">
                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : initial ? "Save Changes" : "Add Department"}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function DepartmentsPage() {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [search, setSearch] = useState("");
    const [institutionFilter, setInstitutionFilter] = useState("All");
    const [branchFilter, setBranchFilter] = useState("All");
    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Department | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    async function loadData() {
        try {
            setLoading(true);
            const [deptRes, instRes, brRes] = await Promise.all([
                fetchWithAuth("/employees/departments"),
                fetchWithAuth("/employees/institutions"),
                fetchWithAuth("/employees/branches"),
            ]);
            if (deptRes.status === 403 || instRes.status === 403 || brRes.status === 403) {
                setForbidden(true); return;
            }
            if (deptRes.ok) {
                const data = await deptRes.json();
                setDepartments(Array.isArray(data) ? data : data.departments || []);
            }
            if (instRes.ok) {
                const data = await instRes.json();
                setInstitutions(Array.isArray(data) ? data : data.institutions || []);
            }
            if (brRes.ok) {
                const data = await brRes.json();
                setBranches(Array.isArray(data) ? data : data.branches || []);
            }
        } catch (err) {
            console.error("Failed to load departments:", err);
            setDepartments([]);
            setInstitutions([]);
            setBranches([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadData(); }, []);

    const availableBranches = institutionFilter === "All"
        ? branches
        : branches.filter(b => b.institution_code === institutionFilter);

    const filtered = departments.filter(d => {
        const matchesSearch =
            (d.dept_name || "").toLowerCase().includes(search.toLowerCase()) ||
            (d.dept_code || "").toLowerCase().includes(search.toLowerCase()) ||
            (d.institution_code || "").toLowerCase().includes(search.toLowerCase());

        const matchesInstitution = institutionFilter === "All" || d.institution_code === institutionFilter;
        const matchesBranch = branchFilter === "All" || d.branch_code === branchFilter;

        return matchesSearch && matchesInstitution && matchesBranch;
    });

    const instName = (code?: string) =>
        code ? (institutions.find(i => i.inst_code === code)?.name || code) : "—";
    const branchName = (code?: string) =>
        code ? (branches.find(b => b.branch_code === code)?.branch_name || code) : "—";

    const stats = [
        { label: "Total Departments", value: departments.length, icon: LayoutGrid },
        { label: "Active", value: departments.length, icon: CheckCircle2 },
        { label: "Branches", value: new Set(departments.map(d => d.branch_code).filter(Boolean)).size, icon: GitBranch },
        { label: "Institutions", value: new Set(departments.map(d => d.institution_code).filter(Boolean)).size, icon: Building2 },
    ];

    async function handleSave(data: DeptOutput): Promise<SaveResult> {
        const payload = editTarget
            ? {
                dept_name: data.dept_name.trim(),
                description: data.description?.trim() || null,
                institution_code: data.institution_code || null,
                branch_code: data.branch_code || null,
            }
            : {
                dept_name: data.dept_name.trim(),
                dept_code: data.dept_code.trim().toUpperCase(),
                institution_code: data.institution_code || null,
                branch_code: data.branch_code || null,
                description: data.description?.trim() || null,
            };
        const url = editTarget
            ? `/employees/departments/${editTarget.id}`
            : "/employees/departments";
        const method = editTarget ? "PUT" : "POST";
        try {
            const res = await fetchWithAuth(url, { method, body: JSON.stringify(payload) });
            const body = await res.json().catch(() => ({}));
            if (res.ok) {
                loadData();
                setEditTarget(null);
                toast.success(editTarget ? "Department updated" : "Department added");
                return { ok: true };
            }
            if (body?.field_errors) return { ok: false, fieldErrors: body.field_errors };
            if (Array.isArray(body?.detail)) {
                return { ok: false, error: body.detail.map((d: any) => d?.msg || JSON.stringify(d)).join("; ") };
            }
            return { ok: false, error: typeof body?.error === "string" ? body.error : "Operation failed" };
        } catch (err: any) {
            return { ok: false, error: err?.message || "Network error" };
        }
    }

    async function handleDelete(departmentId: string) {
        setDeleteBusy(true);
        try {
            const res = await fetchWithAuth(`/employees/departments/${departmentId}`, { method: "DELETE" });
            if (res.ok) {
                loadData();
                toast.success("Department deleted");
            } else {
                const body = await res.json().catch(() => ({}));
                toast.error(body?.error || "Failed to delete department");
            }
        } catch (err) {
            console.error("Delete failed:", err);
        } finally {
            setDeleteBusy(false);
            setDeleteId(null);
        }
    }

    if (forbidden) return <ProtectedLayout><AccessDenied permission="department.view" /></ProtectedLayout>;

    return (
        <ProtectedLayout>
            {deleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center border border-gray-100">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 mx-auto mb-4">
                            <Trash2 className="text-rose-500 h-5 w-5" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Delete department?</h3>
                        <p className="text-sm text-slate-500 mt-1.5">This cannot be undone.</p>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setDeleteId(null)} disabled={deleteBusy} className="btn-secondary flex-1">
                                Cancel
                            </button>
                            <button onClick={() => handleDelete(deleteId)} disabled={deleteBusy} className="btn-danger flex-1">
                                {deleteBusy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DepartmentModal
                open={modalOpen}
                onClose={() => { setModalOpen(false); setEditTarget(null); }}
                onSave={handleSave}
                initial={editTarget}
                institutions={institutions}
                branches={branches}
            />

            <div className="p-6 max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="page-title">Departments</h1>
                        <p className="page-subtitle">Functional organizational units</p>
                    </div>
                    <button
                        onClick={() => { setEditTarget(null); setModalOpen(true); }}
                        className="btn-primary"
                    >
                        <Plus size={16} /> Add Department
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats.map((s) => (
                        <div key={s.label} className="ui-card p-5 flex items-center justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">{s.label}</p>
                                {loading ? <div className="animate-pulse bg-slate-100 rounded h-7 w-12" /> : (
                                    <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                                )}
                            </div>
                            <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-50 text-theme-800">
                                <s.icon size={18} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name, code, or institution..."
                            className="form-input pl-10 text-xs h-10 w-full"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        value={institutionFilter}
                        onChange={(e) => {
                            setInstitutionFilter(e.target.value);
                            setBranchFilter("All");
                        }}
                        className="form-input text-xs h-10 max-w-xs"
                    >
                        <option value="All">All Institutions</option>
                        {institutions.map(inst => (
                            <option key={inst.inst_code} value={inst.inst_code}>{inst.name}</option>
                        ))}
                    </select>
                    <select
                        value={branchFilter}
                        onChange={(e) => setBranchFilter(e.target.value)}
                        className="form-input text-xs h-10 max-w-xs"
                    >
                        <option value="All">All Branches</option>
                        {availableBranches.map(b => (
                            <option key={b.branch_code} value={b.branch_code}>{b.branch_name}</option>
                        ))}
                    </select>
                    {(search !== "" || institutionFilter !== "All" || branchFilter !== "All") && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch("");
                                setInstitutionFilter("All");
                                setBranchFilter("All");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors shrink-0"
                        >
                            <X size={14} /> Reset
                        </button>
                    )}
                </div>

                <div className="ui-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="ui-table-head">Department</th>
                                    <th className="ui-table-head">Institution</th>
                                    <th className="ui-table-head">Branch</th>
                                    <th className="ui-table-head">Description</th>
                                    <th className="ui-table-head text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    [1, 2, 3, 4].map(i => (
                                        <tr key={i}><td colSpan={5} className="px-5 py-4"><RowSkeleton /></td></tr>
                                    ))
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                                            No departments found.
                                        </td>
                                    </tr>
                                ) : filtered.map((d) => (
                                    <tr key={d.id} className="hover:bg-gray-50">
                                        <td className="ui-table-cell">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-blue-50 text-theme-800 flex items-center justify-center shrink-0 font-semibold text-sm">
                                                    {d.dept_name?.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-800">{d.dept_name}</p>
                                                    <p className="text-xs text-slate-400">{d.dept_code}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="ui-table-cell">{instName(d.institution_code)}</td>
                                        <td className="ui-table-cell">{branchName(d.branch_code)}</td>
                                        <td className="ui-table-cell max-w-xs truncate">{d.description || "—"}</td>
                                        <td className="ui-table-cell text-right">
                                            <div className="flex justify-end gap-1">
                                                <button onClick={() => { setEditTarget(d); setModalOpen(true); }} className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-700">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => setDeleteId(d.id)} className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </ProtectedLayout>
    );
}

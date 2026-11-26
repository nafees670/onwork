"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import {
  Plus, Search, Edit2, Trash2, X,
  GitBranch, MapPin, CheckCircle2, XCircle, Phone, Mail, Globe, Loader2,
} from "lucide-react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import PhoneInput from "@/components/PhoneInput";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { generateBranchCode } from "@/utils/codeGen";

type Branch = {
  id?: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  institution_code: string;
  status: string;
  address?: string;
  city?: string;
  district?: string;
  postal_code?: string;
  contact_number?: string;
  secondary_contact?: string;
  email?: string;
  branch_head_name?: string;
  branch_head_contact?: string;
  branch_head_email?: string;
  established_year?: number;
  registration_number?: string;
};

type Institution = { inst_code: string; name: string };

const PK_PHONE_RE = /^(\+92|92|0|0092)?3\d{2}-?\d{7}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const branchSchema = z.object({
  branch_name: z.string().trim().min(2, "Name must be at least 2 characters"),
  branch_code: z.string().trim().min(1, "Code is required").max(20, "Code too long"),
  institution_code: z.string().min(1, "Select an institution"),
  status: z.enum(["active", "inactive", "closed", "under_construction"]),
  city: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  branch_head_name: z.string().trim().optional().or(z.literal("")),
  contact_number: z.string().trim().optional().or(z.literal(""))
    .refine(v => !v || PK_PHONE_RE.test(v), "Invalid PK phone (e.g. 03001234567)"),
  email: z.string().trim().optional().or(z.literal(""))
    .refine(v => !v || EMAIL_RE.test(v), "Invalid email"),
});
type BranchInput = z.input<typeof branchSchema>;
type BranchOutput = z.output<typeof branchSchema>;

function RowSkeleton() {
  return <div className="animate-pulse bg-slate-100 rounded h-4 w-full" />;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-rose-500 mt-1">{msg}</p>;
}

type SaveResult = { ok: boolean; fieldErrors?: Record<string, string>; error?: string };

function BranchModal({
  open, onClose, onSave, initial, institutions, existingBranches,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (d: BranchOutput) => Promise<SaveResult>;
  initial?: Branch | null;
  institutions: Institution[];
  existingBranches: Branch[];
}) {
  const {
    register, handleSubmit, reset, setError, control, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<BranchInput, any, BranchOutput>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      branch_name: "", branch_code: "", institution_code: "",
      status: "active", city: "", address: "", email: "",
      contact_number: "", branch_head_name: "",
    },
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const instVal = watch("institution_code");

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    reset(initial ? {
      branch_name: initial.branch_name || "",
      branch_code: initial.branch_code || "",
      institution_code: initial.institution_code || "",
      status: (initial.status as any) || "active",
      city: initial.city || "",
      address: initial.address || "",
      email: initial.email || "",
      contact_number: initial.contact_number || "",
      branch_head_name: initial.branch_head_name || "",
    } : {
      branch_name: "", branch_code: "", institution_code: "",
      status: "active", city: "", address: "", email: "",
      contact_number: "", branch_head_name: "",
    });
  }, [initial, open, reset]);

  // Code is auto-derived from parent institution -- never typed by hand.
  // Existing branches keep their original code (never regenerated on edit).
  useEffect(() => {
    if (!open || initial || !instVal) return;
    const count = existingBranches.filter(b => b.institution_code === instVal).length;
    setValue("branch_code", generateBranchCode(instVal, count));
  }, [open, initial, instVal, existingBranches, setValue]);

  if (!open) return null;

  const submit: SubmitHandler<BranchOutput> = async (data) => {
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
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{initial ? "Edit Branch" : "Add Branch"}</h2>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50"><X size={18} /></button>
        </div>

        {submitError && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm font-medium text-red-600">
            {submitError}
          </div>
        )}

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          <div className="sm:col-span-2">
            <label className="form-label">Branch Name <span className="text-rose-500 ml-0.5">*</span></label>
            <input type="text" placeholder="e.g. Lahore Central Campus" {...register("branch_name")} className="form-input" />
            <FieldError msg={errors.branch_name?.message} />
          </div>
          <div>
            <label className="form-label">Institution <span className="text-rose-500 ml-0.5">*</span></label>
            <select {...register("institution_code")} className="form-input">
              <option value="">Select Institution</option>
              {institutions.map(inst => (
                <option key={inst.inst_code} value={inst.inst_code}>{inst.name} [{inst.inst_code}]</option>
              ))}
            </select>
            <FieldError msg={errors.institution_code?.message} />
            {watch("branch_code") && (
              <p className="text-xs text-slate-400 mt-1.5">
                Code: <span className="font-mono font-semibold text-slate-600">{watch("branch_code")}</span> (auto-generated)
              </p>
            )}
          </div>
          <div>
            <label className="form-label">Status</label>
            <select {...register("status")} className="form-input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="closed">Closed</option>
              <option value="under_construction">Under Construction</option>
            </select>
            <FieldError msg={errors.status?.message} />
          </div>
          <div>
            <label className="form-label">City</label>
            <input type="text" placeholder="e.g. Lahore" {...register("city")} className="form-input" />
            <FieldError msg={errors.city?.message} />
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Address</label>
            <input type="text" placeholder="Full street address..." {...register("address")} className="form-input" />
            <FieldError msg={errors.address?.message} />
          </div>
          <div>
            <label className="form-label">Branch Head</label>
            <input type="text" placeholder="e.g. Dr. Ali" {...register("branch_head_name")} className="form-input" />
            <FieldError msg={errors.branch_head_name?.message} />
          </div>
          <div>
            <label className="form-label">Contact Phone</label>
            <Controller name="contact_number" control={control} render={({ field }) => (
              <PhoneInput value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} className="form-input" />
            )} />
            <FieldError msg={errors.contact_number?.message} />
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Email</label>
            <input type="text" placeholder="branch@domain.pk" {...register("email")} className="form-input" />
            <FieldError msg={errors.email?.message} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : initial ? "Save Changes" : "Add Branch"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const [branchRes, instRes] = await Promise.all([
        fetchWithAuth("/employees/branches"),
        fetchWithAuth("/employees/institutions"),
      ]);
      if (branchRes.ok) {
        const data = await branchRes.json();
        setBranches(Array.isArray(data) ? data : data.branches || []);
      }
      if (instRes.ok) {
        const data = await instRes.json();
        setInstitutions(Array.isArray(data) ? data : data.institutions || []);
      }
    } catch (err) {
      console.error("Failed to load branches:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = branches.filter(b =>
    b.branch_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.branch_code?.toLowerCase().includes(search.toLowerCase()) ||
    b.city?.toLowerCase().includes(search.toLowerCase()) ||
    b.institution_code?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = [
    { label: "Total Branches", value: branches.length, icon: GitBranch },
    { label: "Active", value: branches.filter(b => b.status === "active").length, icon: CheckCircle2 },
    { label: "Inactive", value: branches.filter(b => b.status !== "active").length, icon: XCircle },
    { label: "Cities", value: new Set(branches.map(b => b.city).filter(Boolean)).size, icon: Globe },
  ];

  async function handleSave(data: BranchOutput): Promise<SaveResult> {
    const payload = {
      branch_name: data.branch_name.trim(),
      branch_code: data.branch_code.trim(),
      institution_code: data.institution_code,
      status: data.status,
      city: data.city?.trim() || null,
      address: data.address?.trim() || null,
      contact_number: data.contact_number?.trim() || null,
      email: data.email?.trim() || null,
      branch_head_name: data.branch_head_name?.trim() || null,
    };
    const url = editTarget
      ? `/employees/branches/${editTarget.branch_code}`
      : "/employees/branches";
    const method = editTarget ? "PUT" : "POST";
    try {
      const res = await fetchWithAuth(url, { method, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        loadData();
        setEditTarget(null);
        toast.success(editTarget ? "Branch updated" : "Branch added");
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

  async function handleDelete(id: string) {
    setDeleteBusy(true);
    try {
      const res = await fetchWithAuth(`/employees/branches/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadData();
        toast.success("Branch deleted");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || "Failed to delete branch");
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleteBusy(false);
      setDeleteId(null);
    }
  }

  return (
    <ProtectedLayout>
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center border border-gray-100">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4 text-rose-500"><Trash2 size={20} /></div>
            <h3 className="text-lg font-bold text-gray-900">Delete branch?</h3>
            <p className="text-sm text-slate-500 mt-1.5">This cannot be undone.</p>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setDeleteId(null)} disabled={deleteBusy} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} disabled={deleteBusy} className="btn-danger flex-1">
                {deleteBusy ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BranchModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSave={handleSave}
        initial={editTarget}
        institutions={institutions}
        existingBranches={branches}
      />

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h1 className="page-title">Branches</h1>
            <p className="page-subtitle">Physical branches across every institution</p>
          </div>
          <button onClick={() => { setEditTarget(null); setModalOpen(true); }} className="btn-primary">
            <Plus size={16} /> Add Branch
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div key={idx} className="ui-card p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">{s.label}</p>
                  {loading ? <div className="animate-pulse bg-slate-100 rounded h-7 w-12" /> : (
                    <h3 className="text-2xl font-bold text-gray-900">{s.value}</h3>
                  )}
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-50 text-theme-800">
                  <Icon size={18} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Search by name, code, or city..." value={search} onChange={e => setSearch(e.target.value)}
            className="form-input pl-10 max-w-sm" />
        </div>

        <div className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="ui-table-head">Branch</th>
                  <th className="ui-table-head">Location</th>
                  <th className="ui-table-head">Contact</th>
                  <th className="ui-table-head">Status</th>
                  <th className="ui-table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? [1, 2, 3, 4].map(i => (
                  <tr key={i}><td colSpan={5} className="px-5 py-4"><RowSkeleton /></td></tr>
                )) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                    No branches found.
                  </td></tr>
                ) : filtered.map(b => (
                  <tr key={b.branch_id} className="hover:bg-gray-50">
                    <td className="ui-table-cell">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-blue-50 text-theme-800 flex items-center justify-center shrink-0">
                          <GitBranch size={16} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{b.branch_name}</p>
                          <p className="text-xs text-slate-400">{b.branch_code} · {b.institution_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="ui-table-cell">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-slate-400" />
                        {b.city || "—"}
                      </div>
                    </td>
                    <td className="ui-table-cell">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="flex items-center gap-1.5"><Phone size={11} className="text-slate-400" />{b.contact_number || "—"}</span>
                        <span className="flex items-center gap-1.5"><Mail size={11} className="text-slate-400" />{b.email || "—"}</span>
                      </div>
                    </td>
                    <td className="ui-table-cell">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${b.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${b.status === "active" ? "bg-emerald-500" : "bg-rose-500"}`} />
                        {b.status}
                      </span>
                    </td>
                    <td className="ui-table-cell text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditTarget(b); setModalOpen(true); }} className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-700">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDeleteId(b.branch_code)} className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600">
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

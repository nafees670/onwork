"use client";

import React, { useState, useEffect } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import {
  Building2, Plus, Search, MapPin, GitBranch, ArrowLeft,
  X, Edit2, Trash2, Phone, Mail, Loader2,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { fetchWithAuth } from "@/utils/api";
import { Suspense } from "react";
import AccessDenied from "@/components/AccessDenied";
import toast from "react-hot-toast";
import { generateInstitutionCode, generateBranchCode } from "@/utils/codeGen";

// ==========================================================================
// 1. TYPES & INTERFACES
// ==========================================================================

type Organization = {
  id: string;
  name: string;
  org_code: string;
};

type Institution = {
  id: string;
  inst_code: string;
  name: string;
  inst_type: string;
  address: string;
  city: string;
  contact_number: string;
  organization_code?: string;
};

type Branch = {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  institution_code: string;
  status: string;
  address: string;
  city: string;
  contact_number: string;
  email: string;
  branch_head_name?: string;
};

// ==========================================================================
// 2. SHARED UI FRAGMENTS
// ==========================================================================

function RowSkeleton() {
  return <div className="animate-pulse bg-slate-100 rounded h-4 w-full" />;
}

// ==========================================================================
// 3. MODALS
// ==========================================================================

function InstitutionModal({ open, onClose, onSave, initial, organizations, existingInstitutions }: {
  open: boolean; onClose: () => void;
  onSave: (d: any) => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>;
  initial?: Institution | null;
  organizations: Organization[];
  existingInstitutions: Institution[];
}) {
  const [form, setForm] = useState({
    name: '', inst_code: '', inst_type: 'educational',
    organization_code: '', city: '', address: '', contact_number: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        inst_code: initial?.inst_code ?? '',
        inst_type: initial?.inst_type ?? 'educational',
        organization_code: initial?.organization_code ?? (organizations[0]?.org_code || ''),
        city: initial?.city ?? '',
        address: initial?.address ?? '',
        contact_number: initial?.contact_number ?? '',
      });
      setErrors({});
      setSubmitError('');
    }
  }, [initial, open, organizations]);

  // Code is auto-derived from the name -- never typed by hand. Existing
  // institutions keep their original code (never regenerated on edit).
  useEffect(() => {
    if (!open || initial) return;
    const count = existingInstitutions.filter(i => i.organization_code === form.organization_code).length;
    setForm(p => ({ ...p, inst_code: generateInstitutionCode(p.name, count) }));
  }, [form.name, form.organization_code, open, initial, existingInstitutions]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name required';
    if (!form.organization_code) e.organization_code = 'Organization required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');
    const result = await onSave(form);
    setSaving(false);
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      setSubmitError(result.error || 'Save failed');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{initial ? 'Edit Institution' : 'Add Institution'}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50"><X size={18} /></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          {submitError && (
            <div className="col-span-2 bg-red-50 border border-red-100 text-red-600 text-sm font-medium px-4 py-3 rounded-lg">
              {submitError}
            </div>
          )}

          <div className="col-span-2">
            <label className="form-label">Parent Organization</label>
            <select value={form.organization_code}
              onChange={e => { setForm(p => ({ ...p, organization_code: e.target.value })); setErrors(p => ({ ...p, organization_code: '' })); }}
              className="form-input">
              {organizations.map(org => <option key={org.id} value={org.org_code}>{org.name} ({org.org_code})</option>)}
            </select>
            {errors.organization_code && <p className="text-xs text-rose-500 mt-1">{errors.organization_code}</p>}
          </div>

          <div className="col-span-2">
            <label className="form-label">Institution Name <span className="text-rose-500 ml-0.5">*</span></label>
            <input type="text" placeholder="e.g. Al-Khidmat Foundation" value={form.name}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: '' })); }}
              className="form-input" />
            {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
            {form.inst_code && (
              <p className="text-xs text-slate-400 mt-1.5">Code: <span className="font-mono font-semibold text-slate-600">{form.inst_code}</span> (auto-generated)</p>
            )}
          </div>

          <div className="col-span-2">
            <label className="form-label">Institution Type</label>
            <select value={form.inst_type} onChange={e => setForm(p => ({ ...p, inst_type: e.target.value }))}
              className="form-input">
              <option value="educational">Educational (School, College, University)</option>
              <option value="healthcare">Healthcare (Hospital, Clinic, Lab)</option>
              <option value="social_welfare">Social Welfare (Kitchen, Shelter, Center)</option>
              <option value="administrative">Administrative (Office, Branch)</option>
              <option value="technical">Technical / Vocational</option>
              <option value="operational">Operational / Project Site</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="form-label">Address</label>
            <input type="text" placeholder="Street address" value={form.address ?? ''}
              onChange={e => { setForm(p => ({ ...p, address: e.target.value })); setErrors(p => ({ ...p, address: '' })); }}
              className="form-input" />
            {errors.address && <p className="text-xs text-rose-500 mt-1">{errors.address}</p>}
          </div>

          <div>
            <label className="form-label">City</label>
            <input type="text" placeholder="e.g. Karachi" value={form.city ?? ''}
              onChange={e => { setForm(p => ({ ...p, city: e.target.value })); setErrors(p => ({ ...p, city: '' })); }}
              className="form-input" />
            {errors.city && <p className="text-xs text-rose-500 mt-1">{errors.city}</p>}
          </div>

          <div>
            <label className="form-label">Contact Number</label>
            <input type="tel" placeholder="e.g. 0300-1234567" value={form.contact_number ?? ''}
              onChange={e => { setForm(p => ({ ...p, contact_number: e.target.value })); setErrors(p => ({ ...p, contact_number: '' })); }}
              className="form-input" />
            {errors.contact_number && <p className="text-xs text-rose-500 mt-1">{errors.contact_number}</p>}
          </div>

          <div className="col-span-2 pt-4 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : initial ? 'Save Changes' : 'Add Institution'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BranchModal({ open, onClose, onSave, initial, institutionCode, existingCountInInstitution }: {
  open: boolean; onClose: () => void;
  onSave: (d: any) => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>;
  initial?: Branch | null;
  institutionCode: string;
  existingCountInInstitution: number;
}) {
  const empty = { branch_name: '', branch_code: '', institution_code: institutionCode, status: 'active', city: '', address: '', contact_number: '', email: '', branch_head_name: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        branch_name: initial?.branch_name ?? '',
        branch_code: initial?.branch_code ?? '',
        institution_code: institutionCode,
        status: initial?.status ?? 'active',
        city: initial?.city ?? '',
        address: initial?.address ?? '',
        contact_number: initial?.contact_number ?? '',
        email: initial?.email ?? '',
        branch_head_name: initial?.branch_head_name ?? '',
      });
      setErrors({});
      setSubmitError('');
    }
  }, [initial, open, institutionCode]);

  // Code is auto-derived from the parent institution -- never typed by hand.
  // Existing branches keep their original code (never regenerated on edit).
  useEffect(() => {
    if (!open || initial || !institutionCode) return;
    setForm(p => ({ ...p, branch_code: generateBranchCode(institutionCode, existingCountInInstitution) }));
  }, [open, initial, institutionCode, existingCountInInstitution]);

  const PK_PHONE = /^(\+92|92|0|0092)?3\d{2}-?\d{7}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.branch_name.trim()) e.branch_name = 'Branch name required';
    if (form.contact_number && !PK_PHONE.test(form.contact_number)) e.contact_number = 'Invalid PK phone (e.g. 03001234567)';
    if (form.email && !EMAIL_RE.test(form.email)) e.email = 'Invalid email';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');
    const result = await onSave(form);
    setSaving(false);
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      setSubmitError(result.error || 'Save failed');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{initial ? 'Edit Branch' : 'Add Branch'}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50"><X size={18} /></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          {submitError && (
            <div className="col-span-2 bg-red-50 border border-red-100 text-red-600 text-sm font-medium px-4 py-3 rounded-lg">
              {submitError}
            </div>
          )}
          <div className="col-span-2">
            <label className="form-label">Branch Name <span className="text-rose-500 ml-0.5">*</span></label>
            <input type="text" placeholder="e.g. Area Command Hub" value={form.branch_name}
              onChange={e => { setForm(p => ({ ...p, branch_name: e.target.value })); setErrors(p => ({ ...p, branch_name: '' })); }}
              className="form-input" />
            {errors.branch_name && <p className="text-xs text-rose-500 mt-1">{errors.branch_name}</p>}
            {form.branch_code && (
              <p className="text-xs text-slate-400 mt-1.5">Code: <span className="font-mono font-semibold text-slate-600">{form.branch_code}</span> (auto-generated)</p>
            )}
          </div>
          <div>
            <label className="form-label">Status</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="form-input">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="form-label">Branch Head</label>
            <input type="text" placeholder="e.g. Dr. Salman Khan" value={form.branch_head_name}
              onChange={e => setForm(p => ({ ...p, branch_head_name: e.target.value }))} className="form-input" />
          </div>
          <div>
            <label className="form-label">Contact Phone</label>
            <input type="tel" placeholder="03001234567" value={form.contact_number}
              onChange={e => { setForm(p => ({ ...p, contact_number: e.target.value })); setErrors(p => ({ ...p, contact_number: '' })); }}
              className="form-input" />
            {errors.contact_number && <p className="text-xs text-rose-500 mt-1">{errors.contact_number}</p>}
          </div>
          <div>
            <label className="form-label">Email</label>
            <input type="email" placeholder="unit@inst.pk" value={form.email}
              onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setErrors(p => ({ ...p, email: '' })); }}
              className="form-input" />
            {errors.email && <p className="text-xs text-rose-500 mt-1">{errors.email}</p>}
          </div>
          <div className="col-span-2">
            <label className="form-label">City</label>
            <input type="text" placeholder="e.g. Islamabad" value={form.city}
              onChange={e => setForm(p => ({ ...p, city: e.target.value }))} className="form-input" />
          </div>
          <div className="col-span-2">
            <label className="form-label">Address</label>
            <input type="text" placeholder="Plot 123, Sector G-10..." value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="form-input" />
          </div>
          <div className="col-span-2 pt-4 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : initial ? 'Save Changes' : 'Add Branch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
// 4. MAIN PAGE
// ==========================================================================

function InstitutionsPage() {
  const [view, setView] = useState<"list" | "branches">("list");
  const [selectedInst, setSelectedInst] = useState<Institution | null>(null);

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");

  const [totalUnits, setTotalUnits] = useState(0);

  const [instModal, setInstModal] = useState(false);
  const [branchModal, setBranchModal] = useState(false);
  const [editInst, setEditInst] = useState<Institution | null>(null);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);

  async function loadInitialData() {
    try {
      setLoading(true);
      const [instRes, orgRes, branchRes] = await Promise.all([
        fetchWithAuth("/employees/institutions"),
        fetchWithAuth("/employees/organizations"),
        fetchWithAuth("/employees/branches")
      ]);

      if (instRes.status === 403 || orgRes.status === 403 || branchRes.status === 403) {
        setForbidden(true);
        return;
      }

      if (instRes.ok) {
        const data = await instRes.json();
        const list = Array.isArray(data) ? data : (data.institutions || []);
        setInstitutions(list);
      }

      if (orgRes.ok) {
        const data = await orgRes.json();
        setOrganizations(Array.isArray(data) ? data : (data.organizations || []));
      }

      if (branchRes.ok) {
        const data = await branchRes.json();
        const list = Array.isArray(data) ? data : (data.branches || []);
        setBranches(list);
        setTotalUnits(list.length);
      }
    } catch (err) {
      console.error("Failed to load institutions:", err);
    } finally {
      setLoading(false);
    }
  }

  const searchParams = useSearchParams();

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "branches") {
      setView("branches");
      setSelectedInst(null); // Show all branches
    }
  }, [searchParams]);

  useEffect(() => { loadInitialData(); }, []);

  async function handleInstitutionSave(data: any): Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }> {
    try {
      const method = editInst ? "PUT" : "POST";
      const url = editInst ? `/employees/institutions/${editInst.id}` : "/employees/institutions";
      const res = await fetchWithAuth(url, { method, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setInstModal(false);
        await loadInitialData();
        toast.success(editInst ? "Institution updated" : "Institution added");
        return { ok: true };
      }
      if (body?.field_errors) return { ok: false, fieldErrors: body.field_errors };
      if (Array.isArray(body?.detail)) return { ok: false, error: body.detail.map((d: any) => d?.msg || JSON.stringify(d)).join('; ') };
      return { ok: false, error: body?.error || 'Failed to save institution' };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }

  async function handleBranchSave(data: any): Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }> {
    try {
      const method = editBranch ? "PUT" : "POST";
      const url = editBranch ? `/employees/branches/${editBranch.branch_id}` : "/employees/branches";
      const res = await fetchWithAuth(url, { method, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setBranchModal(false);
        await loadInitialData();
        toast.success(editBranch ? "Branch updated" : "Branch added");
        return { ok: true };
      }
      if (body?.field_errors) return { ok: false, fieldErrors: body.field_errors };
      if (Array.isArray(body?.detail)) return { ok: false, error: body.detail.map((d: any) => d?.msg || JSON.stringify(d)).join('; ') };
      return { ok: false, error: body?.error || 'Failed to save branch' };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }

  async function deleteEntity(id: string) {
    if (!confirm("Delete this institution? This cannot be undone.")) return;
    try {
      const res = await fetchWithAuth(`/employees/institutions/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadInitialData();
        toast.success("Institution deleted");
      }
      else { const b = await res.json().catch(() => ({})); toast.error(b?.error || 'Failed to delete institution'); }
    } catch { toast.error('Network error'); }
  }

  async function deleteUnit(id: string) {
    if (!confirm("Delete this branch? This cannot be undone.")) return;
    try {
      const res = await fetchWithAuth(`/employees/branches/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadInitialData();
        toast.success("Branch deleted");
      }
      else { const b = await res.json().catch(() => ({})); toast.error(b?.error || 'Failed to delete branch'); }
    } catch { toast.error('Network error'); }
  }

  const filtered = institutions.filter(inst =>
    inst.name.toLowerCase().includes(search.toLowerCase()) ||
    inst.inst_code.toLowerCase().includes(search.toLowerCase())
  );

  const selectedBranches = branches.filter(b => b.institution_code === selectedInst?.inst_code);

  if (forbidden) return <ProtectedLayout><AccessDenied permission="institution.view" /></ProtectedLayout>;

  return (
    <ProtectedLayout>
      <InstitutionModal open={instModal} onClose={() => setInstModal(false)} onSave={handleInstitutionSave} initial={editInst} organizations={organizations} existingInstitutions={institutions} />
      <BranchModal open={branchModal} onClose={() => setBranchModal(false)} onSave={handleBranchSave} initial={editBranch} institutionCode={selectedInst?.inst_code || ''} existingCountInInstitution={selectedBranches.length} />

      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {view === "list" ? (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="page-title">Institutions</h1>
                <p className="page-subtitle">Manage your institutions and their branches</p>
              </div>
              <button onClick={() => { setEditInst(null); setInstModal(true); }} className="btn-primary">
                <Plus size={16} /> Add Institution
              </button>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Institutions', val: institutions.length, icon: Building2 },
                { label: 'Total Organizations', val: organizations.length, icon: Building2 },
                { label: 'Total Branches', val: totalUnits, icon: GitBranch },
                { label: 'Cities Covered', val: new Set(institutions.map(i => i.city).filter(Boolean)).size, icon: MapPin },
              ].map((stat, i) => (
                <div key={i} className="ui-card p-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">{stat.label}</p>
                    <h3 className="text-2xl font-bold text-gray-900">{stat.val}</h3>
                  </div>
                  <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-50 text-theme-800">
                    <stat.icon size={18} />
                  </div>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name or code..."
                className="form-input pl-10 max-w-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Table */}
            <div className="ui-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="ui-table-head">Institution</th>
                      <th className="ui-table-head">Type</th>
                      <th className="ui-table-head">Location</th>
                      <th className="ui-table-head">Branches</th>
                      <th className="ui-table-head text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      [1, 2, 3].map(i => (
                        <tr key={i}><td colSpan={5} className="px-5 py-4"><RowSkeleton /></td></tr>
                      ))
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                          No institutions found.
                        </td>
                      </tr>
                    ) : filtered.map(inst => {
                      const branchCount = branches.filter(b => b.institution_code === inst.inst_code).length;
                      return (
                        <tr key={inst.id} className="hover:bg-gray-50">
                          <td className="ui-table-cell">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-blue-50 text-theme-800 flex items-center justify-center shrink-0">
                                <Building2 size={16} />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">{inst.name}</p>
                                <p className="text-xs text-slate-400">{inst.inst_code}</p>
                              </div>
                            </div>
                          </td>
                          <td className="ui-table-cell capitalize">{(inst.inst_type || 'educational').replace('_', ' ')}</td>
                          <td className="ui-table-cell">{inst.city || '—'}</td>
                          <td className="ui-table-cell">
                            <button
                              onClick={() => { setSelectedInst(inst); setView("branches"); }}
                              className="text-theme-800 font-medium hover:underline"
                            >
                              {branchCount} {branchCount === 1 ? 'branch' : 'branches'}
                            </button>
                          </td>
                          <td className="ui-table-cell text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => { setEditInst(inst); setInstModal(true); }} className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-700">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => deleteEntity(inst.id)} className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <button onClick={() => setView("list")} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 mb-2">
                  <ArrowLeft size={15} /> Back to Institutions
                </button>
                <h1 className="page-title">
                  {selectedInst ? selectedInst.name : "All Branches"}
                </h1>
                <p className="page-subtitle">
                  {selectedInst ? `${selectedInst.inst_code} · ${(selectedInst.inst_type || '').replace('_', ' ')}` : 'Branches across every institution'}
                </p>
              </div>
              <button onClick={() => { setEditBranch(null); setBranchModal(true); }} className="btn-primary self-start">
                <Plus size={16} /> Add Branch
              </button>
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
                    {loading ? (
                      [1, 2, 3].map(i => (
                        <tr key={i}><td colSpan={5} className="px-5 py-4"><RowSkeleton /></td></tr>
                      ))
                    ) : (selectedInst ? selectedBranches : branches).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                          No branches found.
                        </td>
                      </tr>
                    ) : (selectedInst ? selectedBranches : branches).map(b => (
                      <tr key={b.branch_id} className="hover:bg-gray-50">
                        <td className="ui-table-cell">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-blue-50 text-theme-800 flex items-center justify-center shrink-0">
                              <GitBranch size={16} />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">{b.branch_name}</p>
                              <p className="text-xs text-slate-400">
                                {b.branch_code}{!selectedInst && ` · ${b.institution_code}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="ui-table-cell">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-slate-400" />
                            {b.city || '—'}
                          </div>
                        </td>
                        <td className="ui-table-cell">
                          <div className="flex flex-col gap-0.5 text-xs">
                            <span className="flex items-center gap-1.5"><Phone size={11} className="text-slate-400" />{b.contact_number || '—'}</span>
                            <span className="flex items-center gap-1.5"><Mail size={11} className="text-slate-400" />{b.email || '—'}</span>
                          </div>
                        </td>
                        <td className="ui-table-cell">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${b.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${b.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {b.status}
                          </span>
                        </td>
                        <td className="ui-table-cell text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => { setEditBranch(b); setBranchModal(true); }} className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-700">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => deleteUnit(b.branch_id)} className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600">
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
        )}
      </div>
    </ProtectedLayout>
  );
}

// Wrap in Suspense for useSearchParams
export default function SuspendedInstitutionsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 animate-pulse" />}>
      <InstitutionsPage />
    </Suspense>
  );
}

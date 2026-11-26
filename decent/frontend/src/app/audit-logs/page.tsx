"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import {
  Plus, Search, Edit2, Trash2, X,
  Briefcase, CheckCircle2, Layers, Star
} from "lucide-react";

type Designation = {
  id: string;
  position_code: string;
  position_name: string;
  department__dept_code?: string;
  department_code?: string;
};

type Department = {
  dept_code: string;
  dept_name: string;
};

const DEPARTMENTS: Department[] = [
  { dept_name: "Academic", dept_code: "AIT" },
  { dept_name: "Health care", dept_code: "EDHI02" },
  { dept_name: "Food", dept_code: "SMIT03" },
  { dept_name: "IT Dept", dept_code: "BQ01" },
  { dept_name: "Test", dept_code: "TEST01" },
];

const Skeleton = ({ className, height, width }: any) => (
  <div className={`animate-pulse bg-gray-100 rounded-lg ${className}`} style={{ height, width }} />
);

function DesignationModal({ open, onClose, onSave, initial }: {
  open: boolean; onClose: () => void;
  onSave: (d: any) => void; initial?: Designation | null;
}) {
  const empty = { position_name: "", position_code: "", department_code: "" };
  const [form, setForm] = useState(empty);

  useEffect(() => {
    setForm(initial ? {
      position_name: initial.position_name,
      position_code: initial.position_code,
      department_code: initial.department__dept_code || initial.department_code || ""
    } : empty);
  }, [initial, open]);

  if (!open) return null;

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{initial ? "Edit Designation" : "Add Designation"}</h2>
            <p className="text-sm text-slate-400 mt-0.5">Fill in the position details.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="form-label">Position Name</label>
            <input
              type="text" placeholder="Enter position name" value={form.position_name} onChange={f('position_name')}
              className="form-input"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Position Code</label>
              <input
                type="text" placeholder="Short code" value={form.position_code} onChange={f('position_code')}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Department</label>
              <select value={form.department_code} onChange={f('department_code')} className="form-input">
                <option value="">Select Department</option>
                {DEPARTMENTS.map(dept => (
                  <option key={dept.dept_code} value={dept.dept_code}>
                    {dept.dept_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-3">
          <button onClick={onClose} className="btn-secondary w-full sm:w-auto">Cancel</button>
          <button onClick={() => { onSave(form); onClose(); }} className="btn-primary w-full sm:w-auto">
            {initial ? "Save Changes" : "Add Designation"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DesignationsPage() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Designation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/employees/designations');
      if (res.ok) {
        const data = await res.json();
        setDesignations(Array.isArray(data) ? data : (data.designations || []));
      }
    } catch (err) {
      console.error("Failed to load data:", err);
      setDesignations([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = (Array.isArray(designations) ? designations : []).filter(d =>
    ((d.position_name || '').toLowerCase().includes(search.toLowerCase()) ||
     (d.position_code || '').toLowerCase().includes(search.toLowerCase()))
  );

  const stats = [
    { label: "Total Designations", value: designations.length, icon: Briefcase, color: "text-theme-800", bg: "bg-blue-50" },
    { label: "Active", value: designations.length, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Departments", value: new Set(designations.map(d => d.department__dept_code || d.department_code)).size, icon: Layers, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Featured", value: designations.length, icon: Star, color: "text-rose-600", bg: "bg-rose-50" },
  ];

  async function handleSave(data: any) {
    try {
      const url = editTarget ? `/employees/designations/${editTarget.id}` : '/employees/designations';
      const method = editTarget ? 'PUT' : 'POST';
      const res = await fetchWithAuth(url, { method, body: JSON.stringify(data) });
      if (res.ok) loadData();
    } catch (err) {
      console.error("Save failed:", err);
    }
    setEditTarget(null);
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetchWithAuth(`/employees/designations/${id}`, { method: 'DELETE' });
      if (res.ok) loadData();
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setDeleteId(null);
  }

  return (
    <ProtectedLayout>
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4 text-rose-600"><Trash2 /></div>
            <h3 className="text-lg font-semibold text-gray-900">Delete Record?</h3>
            <p className="text-sm text-slate-500 mt-1">This entry will be permanently removed.</p>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="btn-danger flex-1">Delete</button>
            </div>
          </div>
        </div>
      )}

      <DesignationModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSave={handleSave}
        initial={editTarget}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="page-title">Designations</h1>
            <p className="page-subtitle">Job titles, roles and authority levels</p>
          </div>
          <button onClick={() => { setEditTarget(null); setModalOpen(true); }} className="btn-primary whitespace-nowrap">
            <Plus size={16} /> Add Designation
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {stats.map((s) => (
            <div key={s.label} className="ui-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">{s.label}</p>
                  {loading ? <Skeleton width="40%" height={28} /> : (
                    <h3 className="text-2xl font-bold text-gray-900">{s.value}</h3>
                  )}
                </div>
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${s.bg} ${s.color}`}>
                  <s.icon size={16} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="mt-6 ui-card p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by title or code…"
              className="form-input pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="ui-table-head">Position / Title</th>
                  <th className="ui-table-head hidden md:table-cell">Code</th>
                  <th className="ui-table-head">Department</th>
                  <th className="ui-table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? [...Array(3)].map((_, i) => (
                  <tr key={i}><td colSpan={4} className="p-6"><Skeleton height={20} className="w-full" /></td></tr>
                )) : filtered.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="ui-table-cell">
                      <div className="flex items-center gap-3">
                        <div className="hidden xs:flex h-9 w-9 rounded-full bg-blue-50 items-center justify-center text-theme-800 text-sm font-semibold shrink-0">
                          {d.position_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{d.position_name}</p>
                          <p className="md:hidden text-xs text-slate-400 mt-0.5">{d.position_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="ui-table-cell hidden md:table-cell text-slate-500">{d.position_code}</td>
                    <td className="ui-table-cell text-slate-500">
                      {DEPARTMENTS.find(dept => dept.dept_code === (d.department__dept_code || d.department_code))?.dept_name || '—'}
                    </td>
                    <td className="ui-table-cell text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setEditTarget(d); setModalOpen(true); }} className="h-8 w-8 flex items-center justify-center bg-white text-slate-400 rounded-lg hover:text-theme-800 hover:bg-blue-50 transition-colors border border-slate-100">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDeleteId(d.id)} className="h-8 w-8 flex items-center justify-center bg-white text-slate-400 rounded-lg hover:text-rose-600 hover:bg-rose-50 transition-colors border border-slate-100">
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

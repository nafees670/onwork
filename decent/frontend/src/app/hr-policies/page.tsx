"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedLayout from "@/components/ProtectedLayout";
import { useAuth } from "@/context/AuthContext";
import { fetchWithAuth } from "@/utils/api";
import {
  FileBadge2, Plus, X, Edit2, Trash2, Loader2, FileText, Eye,
} from "lucide-react";
import toast from "react-hot-toast";

interface Policy {
  id: string;
  title: string;
  description: string;
  file_type: "pptx" | "docx";
  original_filename: string;
  updated_at: string;
  uploaded_by_name?: string | null;
}

function fileTypeBadge(fileType: string) {
  const isPptx = fileType === "pptx";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
        isPptx ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-800"
      }`}
    >
      {isPptx ? "PowerPoint" : "Word"}
    </span>
  );
}

function PolicyFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Policy | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!initial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !file) {
      setError("Please choose a .pptx or .docx file to upload.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("description", description);
      if (file) form.append("file", file);

      const res = await fetchWithAuth(
        isEdit ? `/hr-policy/policies/${initial!.id}` : "/hr-policy/policies",
        { method: isEdit ? "PUT" : "POST", body: form }
      );

      if (res.ok) {
        toast.success(isEdit ? "Policy updated" : "Policy uploaded");
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || data.error || "Something went wrong");
      }
    } catch {
      setError("Unable to connect to the server. Please try again later.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-slate-900">
            {isEdit ? "Edit Policy" : "Upload Policy"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="form-label">Title <span className="text-rose-500 ml-0.5">*</span></label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Leave Policy"
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="form-input h-auto py-2.5 resize-y"
            />
          </div>

          <div>
            <label className="form-label">
              {isEdit ? "Replace File (optional)" : "File"}
              {!isEdit && <span className="text-rose-500 ml-0.5">*</span>}
            </label>
            <input
              type="file"
              accept=".pptx,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="form-input py-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-800 file:text-xs file:font-semibold"
            />
            {isEdit && (
              <p className="mt-1.5 text-xs text-slate-400">
                Currently: {initial!.original_filename}. Leave empty to keep the existing document.
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-400">Only .pptx and .docx files are supported.</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HRPoliciesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isSuperadmin = !!user?.is_superadmin;

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/hr-policy/policies");
      if (res.ok) setPolicies(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (policy: Policy) => {
    if (!confirm(`Delete "${policy.title}"? This cannot be undone.`)) return;
    setDeletingId(policy.id);
    try {
      const res = await fetchWithAuth(`/hr-policy/policies/${policy.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Policy deleted");
        load();
      } else {
        toast.error("Failed to delete policy");
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">HR Policies</h1>
            <p className="page-subtitle">Company policies, available to every employee — view only.</p>
          </div>
          {isSuperadmin && (
            <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary">
              <Plus size={16} /> Upload Policy
            </button>
          )}
        </div>

        <div className="ui-card overflow-hidden">
          {loading ? (
            <div className="p-10 flex justify-center">
              <Loader2 size={22} className="animate-spin text-slate-300" />
            </div>
          ) : policies.length === 0 ? (
            <div className="p-10 text-center">
              <FileBadge2 size={28} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm text-slate-400">No HR policies published yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="ui-table-head">Policy</th>
                    <th className="ui-table-head">Type</th>
                    <th className="ui-table-head">Last Updated</th>
                    <th className="ui-table-head"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {policies.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="ui-table-cell">
                        <button
                          onClick={() => router.push(`/hr-policies/${p.id}`)}
                          className="flex items-center gap-3 text-left"
                        >
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <FileText size={16} className="text-blue-800" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{p.title}</p>
                            {p.description && (
                              <p className="text-xs text-slate-400 line-clamp-1 max-w-md">{p.description}</p>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="ui-table-cell">{fileTypeBadge(p.file_type)}</td>
                      <td className="ui-table-cell text-slate-500">
                        {new Date(p.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                      <td className="ui-table-cell">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => router.push(`/hr-policies/${p.id}`)}
                            className="p-2 text-slate-400 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye size={15} />
                          </button>
                          {isSuperadmin && (
                            <>
                              <button
                                onClick={() => { setEditing(p); setShowModal(true); }}
                                className="p-2 text-slate-400 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(p)}
                                disabled={deletingId === p.id}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <PolicyFormModal
          initial={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </ProtectedLayout>
  );
}

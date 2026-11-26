"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import EmployeeSelect from "@/components/EmployeeSelect";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import {
  UserPlus, Plus, Pencil, Trash2, Users, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import toast from "react-hot-toast";

type Enrollment = {
  id: string;
  employee_id: string;
  employee_name: string;
  enrollment_date: string;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
};

const PAGE_SIZE = 20;

export default function ESPEnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Enrollment | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [enrollmentDate, setEnrollmentDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterActive, setFilterActive] = useState(false);
  const [page, setPage] = useState(1);

  const load = async () => {
    try {
      const qs = filterActive ? "?is_active=true" : "";
      const res = await fetchWithAuth(`/payroll/esp/enrollments${qs}`);
      if (res.status === 403) return setNoAccess(true);
      if (res.ok) setEnrollments(await res.json());
    } catch {
      toast.error("Failed to load enrollments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterActive]);

  const openCreate = () => {
    setEditing(null);
    setEmployeeId("");
    setEnrollmentDate("");
    setIsActive(true);
    setNotes("");
    setShowModal(true);
  };

  const openEdit = (e: Enrollment) => {
    setEditing(e);
    setEmployeeId(e.employee_id);
    setEnrollmentDate(e.enrollment_date);
    setIsActive(e.is_active);
    setNotes(e.notes || "");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!editing && !employeeId) return toast.error("Select an employee");
    if (!enrollmentDate) return toast.error("Enrollment date is required");

    setSaving(true);
    try {
      if (editing) {
        const res = await fetchWithAuth(`/payroll/esp/enrollments/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            enrollment_date: enrollmentDate,
            is_active: isActive,
            notes: notes || null,
          }),
        });
        if (res.status === 403) return setNoAccess(true);
        if (res.ok) {
          toast.success("Enrollment updated");
          closeModal();
          load();
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.detail || "Failed to update");
        }
      } else {
        const res = await fetchWithAuth("/payroll/esp/enrollments", {
          method: "POST",
          body: JSON.stringify({
            employee_id: employeeId,
            enrollment_date: enrollmentDate,
            is_active: isActive,
            notes: notes || null,
          }),
        });
        if (res.status === 403) return setNoAccess(true);
        if (res.ok) {
          toast.success("Employee enrolled");
          closeModal();
          load();
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(err.detail || "Failed to enroll");
        }
      }
    } catch {
      toast.error("Failed to save enrollment");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this enrollment?")) return;
    try {
      const res = await fetchWithAuth(`/payroll/esp/enrollments/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Enrollment removed");
        load();
      } else toast.error("Failed to remove");
    } catch {
      toast.error("Failed to remove");
    }
  };

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return enrollments.slice(start, start + PAGE_SIZE);
  }, [enrollments, page]);

  const totalPages = Math.max(1, Math.ceil(enrollments.length / PAGE_SIZE));

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <UserPlus className="text-indigo-600" size={28} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">ESP Enrollments</h1>
                <p className="text-sm text-gray-500">{enrollments.length} enrolled</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={filterActive}
                  onChange={(e) => { setFilterActive(e.target.checked); setPage(1); }}
                  className="h-4 w-4 accent-indigo-600"
                />
                Active only
              </label>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Plus size={18} /> Enroll Employee
              </button>
            </div>
          </div>

          {noAccess && <AccessDenied />}

          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : enrollments.length === 0 ? (
            <p className="text-gray-500">No enrollments yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Enrollment Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600">
                          <Users size={14} /> {e.employee_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{e.employee_name}</td>
                      <td className="px-4 py-3 text-gray-600">{e.enrollment_date}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            e.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {e.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">
                        {e.notes || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEdit(e)}
                          title="Edit"
                          className="mr-2 inline-flex text-indigo-600 hover:text-indigo-800"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => remove(e.id)}
                          title="Delete"
                          className="inline-flex text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {enrollments.length > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Modal */}
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">
                    {editing ? "Edit Enrollment" : "Enroll Employee"}
                  </h2>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Employee</label>
                    <EmployeeSelect
                      value={employeeId}
                      onChange={(id) => setEmployeeId(id)}
                      disabled={!!editing}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Enrollment Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={enrollmentDate}
                      onChange={(e) => setEnrollmentDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    Active
                  </label>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : editing ? "Update" : "Enroll"}
                  </button>
                  <button
                    onClick={closeModal}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}

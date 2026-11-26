"use client";

import React, { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import toast from "react-hot-toast";
import {
  Users, UserCheck, Clock, RefreshCw, CheckCircle, XCircle,
  AlertTriangle, Search, Mail, Phone, X, Briefcase,
} from "lucide-react";

type TabKey = "all" | "assigned" | "pending";

interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  personal_email: string;
  personal_phone: string;
  cnic: string;
  gender: string;
  dob: string;
  education: string;
  status: string;
  department: string;
  designation: string;
  branch: string;
  institution: string;
  created_at: string;
}

interface Department {
  id: string;
  dept_code: string;
  dept_name: string;
}

interface Designation {
  id: string;
  position_code: string;
  position_name: string;
}

interface DashboardData {
  counts: { all: number; assigned: number; pending: number };
  employees: { all: Employee[]; assigned: Employee[]; pending: Employee[] };
}

const TAB_BADGE: Record<TabKey, string> = {
  pending: "bg-amber-100 text-amber-700",
  assigned: "bg-emerald-100 text-emerald-700",
  all: "bg-blue-100 text-theme-800",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  pending_approval: "bg-amber-50 text-amber-700 border border-amber-100",
  rejected: "bg-red-50 text-red-600 border border-red-100",
  suspended: "bg-slate-50 text-slate-500 border border-slate-200",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending_approval: "Pending",
  rejected: "Rejected",
  suspended: "Suspended",
};

export default function PendingRegistrationsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [assignModal, setAssignModal] = useState<Employee | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedDesig, setSelectedDesig] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/employees/employees/dashboard-stats");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAssignModal = async (emp: Employee) => {
    setAssignModal(emp);
    setSelectedDept("");
    setSelectedDesig("");
    setJoiningDate("");
    try {
      const res = await fetchWithAuth("/employees/departments");
      if (res.ok) {
        const list = await res.json();
        setDepartments(Array.isArray(list) ? list : []);
      }
    } catch {
      setDepartments([]);
    }
    setDesignations([]);
  };

  useEffect(() => {
    if (!selectedDept) { setDesignations([]); setSelectedDesig(""); return; }
    (async () => {
      try {
        const res = await fetchWithAuth(`/employees/designations?department_id=${selectedDept}`);
        if (res.ok) {
          const list = await res.json();
          setDesignations(Array.isArray(list) ? list : []);
        }
      } catch {
        setDesignations([]);
      }
    })();
  }, [selectedDept]);

  const handleAssign = async () => {
    if (!assignModal || !selectedDept || !selectedDesig || !joiningDate) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (joiningDate > todayStr) {
      return toast.error("Joining date cannot be in the future");
    }
    setAssignLoading(true);
    try {
      const res = await fetchWithAuth(`/employees/employees/${assignModal.employee_id}/assign-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: selectedDept,
          designation_id: selectedDesig,
          joining_date: joiningDate,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Role assigned to ${assignModal.full_name}`);
        if (json?.default_credentials_created && !json.welcome_email_sent_to?.length) {
          toast(
            "Default login credentials created, but the welcome email could not be delivered — share the login details with the employee manually.",
            { duration: 7000, icon: "⚠️" }
          );
        }
        setAssignModal(null);
        fetchData();
      } else {
        toast.error(json.error || "Failed to assign role");
      }
    } catch {
      toast.error("Failed to assign role");
    } finally {
      setAssignLoading(false);
    }
  };

  const handleApprove = async (employeeId: string) => {
    setActionLoading(employeeId);
    try {
      const res = await fetchWithAuth(`/employees/employees/${employeeId}/approve`, { method: "POST" });
      if (res.ok) {
        toast.success("Employee approved");
        fetchData();
      } else {
        toast.error("Failed to approve");
      }
    } catch {
      toast.error("Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (employeeId: string) => {
    setActionLoading(employeeId);
    try {
      const res = await fetchWithAuth(`/employees/employees/${employeeId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by admin" }),
      });
      if (res.ok) {
        toast.success("Employee rejected");
        fetchData();
      }
    } catch {
      toast.error("Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "pending", label: "Pending", icon: <Clock size={16} /> },
    { key: "assigned", label: "Assigned", icon: <UserCheck size={16} /> },
    { key: "all", label: "Employees", icon: <Users size={16} /> },
  ];

  const currentList = data?.employees[activeTab] || [];
  const counts = data?.counts || { all: 0, assigned: 0, pending: 0 };

  const filteredList = search
    ? currentList.filter(
        (e) =>
          e.full_name.toLowerCase().includes(search.toLowerCase()) ||
          e.personal_email.toLowerCase().includes(search.toLowerCase()) ||
          e.employee_id.toLowerCase().includes(search.toLowerCase()) ||
          e.department.toLowerCase().includes(search.toLowerCase())
      )
    : currentList;

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Pending Registrations</h1>
            <p className="page-subtitle">Manage employees, assignments, and pending registrations</p>
          </div>
          <button onClick={fetchData} disabled={loading} className="btn-secondary whitespace-nowrap">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mt-6">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? "bg-white text-gray-900 font-semibold shadow-sm" : "text-slate-500 font-medium"
                }`}
              >
                {tab.icon}
                {tab.label}
                <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full text-xs font-semibold px-1.5 ${
                  isActive ? TAB_BADGE[tab.key] : "bg-black/5 text-slate-400"
                }`}>
                  {loading ? "…" : count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mt-5">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email, ID, or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input pl-10"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            <RefreshCw size={20} className="animate-spin mx-auto mb-3" />
            Loading…
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            <AlertTriangle size={20} className="mx-auto mb-3 opacity-50" />
            {search ? "No matching employees found" : "No employees found"}
          </div>
        ) : (
          <div className="mt-5 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="ui-table-head">Name</th>
                    <th className="ui-table-head">ID</th>
                    <th className="ui-table-head">Contact</th>
                    {activeTab === "assigned" && <th className="ui-table-head">Department</th>}
                    {activeTab === "assigned" && <th className="ui-table-head">Designation</th>}
                    <th className="ui-table-head">Status</th>
                    <th className="ui-table-head text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredList.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="ui-table-cell">
                        <div className="font-semibold text-gray-900">{emp.full_name}</div>
                        {emp.education && <div className="text-xs text-slate-400 mt-0.5">{emp.education}</div>}
                      </td>
                      <td className="ui-table-cell">
                        <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{emp.employee_id || "N/A"}</code>
                      </td>
                      <td className="ui-table-cell">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Mail size={12} /> {emp.personal_email || "N/A"}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                          <Phone size={12} /> {emp.personal_phone || "N/A"}
                        </div>
                      </td>
                      {activeTab === "assigned" && (
                        <td className="ui-table-cell">
                          <div className="text-slate-700">{emp.department || "N/A"}</div>
                          {emp.branch && <div className="text-xs text-slate-400 mt-0.5">{emp.branch}</div>}
                        </td>
                      )}
                      {activeTab === "assigned" && (
                        <td className="ui-table-cell text-slate-700">{emp.designation || "N/A"}</td>
                      )}
                      <td className="ui-table-cell">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${STATUS_STYLES[emp.status] || "bg-slate-50 text-slate-500 border border-slate-200"}`}>
                          {STATUS_LABEL[emp.status] || emp.status}
                        </span>
                      </td>
                      <td className="ui-table-cell text-right">
                        {activeTab === "pending" && (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleApprove(emp.employee_id)}
                              disabled={actionLoading === emp.employee_id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle size={13} /> Approve
                            </button>
                            <button
                              onClick={() => handleReject(emp.employee_id)}
                              disabled={actionLoading === emp.employee_id}
                              className="btn-danger text-xs px-3 py-1.5 h-auto"
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          </div>
                        )}
                        {activeTab === "assigned" && (
                          <button
                            onClick={() => openAssignModal(emp)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-theme-800 border border-blue-100 text-xs font-semibold hover:bg-blue-100 transition-colors"
                          >
                            <Briefcase size={13} /> Assign Role
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Assign Role Modal */}
        {assignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Assign Role</h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    <strong>{assignModal.full_name}</strong> ({assignModal.employee_id})
                  </p>
                </div>
                <button onClick={() => setAssignModal(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="form-label">Department</label>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="form-input appearance-none cursor-pointer"
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.dept_name} [{d.dept_code}]</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Designation</label>
                  <select
                    value={selectedDesig}
                    onChange={(e) => setSelectedDesig(e.target.value)}
                    disabled={!selectedDept}
                    className="form-input appearance-none cursor-pointer disabled:cursor-not-allowed"
                  >
                    <option value="">{selectedDept ? "Select Designation" : "Select department first"}</option>
                    {designations.map((d) => (
                      <option key={d.id} value={d.id}>{d.position_name} [{d.position_code}]</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Joining Date</label>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <button onClick={() => setAssignModal(null)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleAssign}
                  disabled={!selectedDept || !selectedDesig || !joiningDate || assignLoading}
                  className="btn-primary"
                >
                  {assignLoading ? "Assigning…" : "Assign"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

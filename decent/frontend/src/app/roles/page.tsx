"use client";

import ProtectedLayout from "@/components/ProtectedLayout";
import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/utils/api';
import { rbacService, type EmployeeRoleAssignment, type RbacRole, type RbacRoleDetail, type RbacPermission } from '@/services/rbacService';
import {
  Loader2,
  RotateCcw,
  Save,
  ChevronsUpDown,
  Plus,
  Search,
  X,
  Edit,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ==========================================
// 1. TYPES & INTERFACES
// ==========================================
interface SelectOption {
  id: number;
  name: string;
  code?: string;
}

// ==========================================
// 2. API SERVICE LAYER (employees lookup only — no other services)
// ==========================================
const employeeService = {
  getEmployees: async (search?: string): Promise<SelectOption[]> => {
    try {
      const url = `/employees/employees${search ? `?search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) return [];
      const data = await res.json();
      const employeeArray = Array.isArray(data) ? data : (data.employees || data.results || []);
      return employeeArray.map((emp: any) => ({
        id: emp.id || emp.employee_id,
        name: `${emp.full_name} (${emp.employee_id})`,
        code: emp.employee_id
      }));
    } catch {
      return [];
    }
  },
};

// ==========================================
// 3. ROLE MANAGEMENT PANEL — create / edit / delete auth roles & permissions
// ==========================================
function RoleManagementPanel({ onRolesChanged }: { onRolesChanged?: () => void }) {
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [allPermissions, setAllPermissions] = useState<RbacPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RbacRoleDetail | null>(null);
  const [processing, setProcessing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);

  const loadRoles = () => {
    setLoading(true);
    return Promise.all([rbacService.listRoles('auth'), rbacService.listPermissions('auth')])
      .then(([rolesData, permsData]) => {
        setRoles(rolesData.roles);
        setAllPermissions(permsData.permissions);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const openCreate = () => {
    setFormName(''); setFormDescription(''); setFormPermissions([]);
    setEditingRole(null); setShowModal(true);
  };

  const openEdit = async (role: RbacRole) => {
    const detail = await rbacService.getRole(role.id);
    setFormName(detail.name); setFormDescription(detail.description);
    setFormPermissions(detail.permission_codenames);
    setEditingRole(detail); setShowModal(true);
  };

  const handleSave = async () => {
    setProcessing(true);
    try {
      if (editingRole) {
        await rbacService.updateRole(editingRole.id, {
          name: formName, description: formDescription, permission_codenames: formPermissions,
        });
        toast.success('Role updated');
      } else {
        await rbacService.createRole({
          name: formName, service: 'auth', description: formDescription, permission_codenames: formPermissions,
        });
        toast.success('Role created');
      }
      const updated = await rbacService.listRoles('auth');
      setRoles(updated.roles);
      setShowModal(false);
      onRolesChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save role');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (role: RbacRole) => {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await rbacService.deleteRole(role.id);
      setRoles(prev => prev.filter(r => r.id !== role.id));
      toast.success('Role deleted');
      onRolesChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete role');
    }
  };

  const togglePermission = (codename: string) =>
    setFormPermissions(prev =>
      prev.includes(codename) ? prev.filter(c => c !== codename) : [...prev, codename],
    );

  if (loading) return (
    <div className="ui-card p-5 mb-5 flex items-center gap-3 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Loading roles…</span>
    </div>
  );

  return (
    <div className="ui-card p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700">Auth Roles</h2>
        <button onClick={openCreate} className="btn-primary text-xs px-3 py-1.5 h-auto">
          <Plus className="h-3.5 w-3.5" /> New Role
        </button>
      </div>

      {roles.length === 0 ? (
        <p className="text-sm text-slate-400">No auth roles defined. Create one above.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {roles.map(role => (
            <div key={role.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">{role.name}</span>
              <span className="text-xs text-slate-400">{role.permission_count} perms</span>
              <button onClick={() => openEdit(role)} className="text-slate-400 hover:text-theme-800 transition-colors">
                <Edit className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleDelete(role)} className="text-slate-400 hover:text-rose-600 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">
                  {editingRole ? 'Edit Role' : 'Create Auth Role'}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="form-label">Role Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. HR Manager"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Description (optional)</label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="Brief description"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Permissions</label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-100 rounded-lg">
                    {allPermissions.map(perm => (
                      <label key={perm.codename} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={formPermissions.includes(perm.codename)}
                          onChange={() => togglePermission(perm.codename)}
                          className="rounded border-slate-300 text-theme-800"
                        />
                        <span className="text-xs text-slate-600">{perm.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{formPermissions.length} selected</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
                <button onClick={() => setShowModal(false)} className="btn-secondary text-xs px-4 py-2 h-auto">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formName.trim() || processing}
                  className="btn-primary text-xs px-4 py-2 h-auto"
                >
                  {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editingRole ? 'Save Changes' : 'Create Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 4. PER-EMPLOYEE PERMISSION OVERRIDES PANEL
// ==========================================
function OverridesPanel({ employeeId }: { employeeId: string }) {
  const [allPermissions, setAllPermissions] = useState<RbacPermission[]>([]);
  const [overrides, setOverrides] = useState<Array<{ id: string; permission_codename: string; is_allowed: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedPerm, setSelectedPerm] = useState('');
  const [isAllowed, setIsAllowed] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    rbacService.listPermissions('auth')
      .then(data => setAllPermissions(data.permissions))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const handleAdd = async (force = false) => {
    if (!selectedPerm) return;
    setSaving(true);
    try {
      const ov = await rbacService.createOverride(employeeId, selectedPerm, isAllowed, force);
      setOverrides(prev => [...prev, { id: ov.id, permission_codename: ov.permission_codename, is_allowed: ov.is_allowed }]);
      setSelectedPerm('');
      setAdding(false);
      toast.success(`${isAllowed ? 'ALLOW' : 'DENY'} override added`);
    } catch (err: any) {
      if (err.status === 409) {
        const confirmed = window.confirm(`⚠️ ${err.message}\n\nProceed anyway?`);
        if (confirmed) {
          setSaving(false);
          return handleAdd(true);
        }
      } else {
        toast.error(err.message || 'Failed to add override');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await rbacService.removeOverride(id);
      setOverrides(prev => prev.filter(o => o.id !== id));
      toast.success('Override removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove override');
    }
  };

  if (loading) return (
    <div className="bg-slate-50 rounded-xl p-4 mt-1 border border-slate-100 flex items-center gap-2 text-slate-400 text-xs">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions...
    </div>
  );

  return (
    <div className="bg-slate-50 rounded-xl p-4 mt-1 border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Permission Overrides</h4>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-theme-800 text-white rounded-lg hover:bg-theme-900 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add Override
        </button>
      </div>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-white rounded-lg border border-slate-100">
          <select
            value={selectedPerm}
            onChange={e => setSelectedPerm(e.target.value)}
            className="flex-1 min-w-40 h-8 px-2 text-xs border border-slate-200 rounded-md"
          >
            <option value="">Select permission...</option>
            {allPermissions.map(p => (
              <option key={p.codename} value={p.codename}>{p.name} ({p.codename})</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsAllowed(true)}
              className={`px-2 py-1 text-[10px] font-semibold rounded ${isAllowed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
            >ALLOW</button>
            <button
              type="button"
              onClick={() => setIsAllowed(false)}
              className={`px-2 py-1 text-[10px] font-semibold rounded ${!isAllowed ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}
            >DENY</button>
          </div>
          <button
            onClick={() => handleAdd()}
            disabled={!selectedPerm || saving}
            className="px-3 h-8 text-[10px] font-semibold bg-theme-600 text-white rounded-md disabled:opacity-50 flex items-center gap-1"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </button>
        </div>
      )}

      {overrides.length === 0 ? (
        <p className="text-[10px] text-slate-400">No overrides. Use &quot;Add Override&quot; to grant or block specific permissions.</p>
      ) : (
        <div className="space-y-1">
          {overrides.map(ov => (
            <div key={ov.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${ov.is_allowed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {ov.is_allowed ? 'ALLOW' : 'DENY'}
                </span>
                <span className="text-[11px] font-mono text-slate-600">{ov.permission_codename}</span>
              </div>
              <button onClick={() => handleRemove(ov.id)} className="text-slate-400 hover:text-rose-500 transition">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthAssignmentRow({
  assignment,
  onRemove,
}: {
  assignment: EmployeeRoleAssignment;
  onRemove: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="ui-table-cell">{assignment.employee_org_id || assignment.employee_id}</td>
        <td className="ui-table-cell">
          <div className="font-semibold text-slate-800">{assignment.employee_name || '—'}</div>
        </td>
        <td className="ui-table-cell">
          <span className="px-2 py-1 bg-blue-50 text-theme-800 text-xs font-semibold rounded-md">
            {assignment.role_name}
          </span>
        </td>
        <td className="ui-table-cell text-slate-400">
          {new Date(assignment.granted_at).toLocaleDateString()}
        </td>
        <td className="ui-table-cell text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="btn-secondary text-xs px-2.5 py-1.5 h-auto"
            >
              <Edit className="h-3 w-3" /> Overrides
            </button>
            <button
              onClick={async () => {
                setRemoving(true);
                try { await onRemove(assignment.id); } finally { setRemoving(false); }
              }}
              disabled={removing}
              className="inline-flex items-center justify-center p-2 rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50 transition-colors"
              title="Remove assignment (soft delete)"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-5 pb-4">
            <OverridesPanel employeeId={assignment.employee_id} />
          </td>
        </tr>
      )}
    </>
  );
}

// ==========================================
// 5. INLINE COMPONENT: ASYNC SEARCH SELECT
// ==========================================
function AsyncSearchSelect({
  fetchOptions,
  value,
  onChange,
  placeholder
}: {
  fetchOptions: (search?: string) => Promise<SelectOption[]>;
  value?: number | string;
  onChange: (value: any) => void;
  placeholder: string;
}) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await fetchOptions();
        setOptions(data);
      } catch (err) {
        console.error("Error pulling dropdown details: ", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchOptions]);

  return (
    <div className="relative w-full">
      <select
        className="form-input appearance-none cursor-pointer"
        value={value || ''}
        onChange={(e) => {
          const val = e.target.value;
          onChange(isNaN(Number(val)) ? val : Number(val));
        }}
      >
        <option value="" disabled hidden>{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.code || opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronsUpDown className="h-4 w-4" />}
      </div>
    </div>
  );
}

// ==========================================
// 6. MAIN AUTH ROLES & PERMISSIONS PAGE
// ==========================================
export default function AuthRolesManagement() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [authAssignments, setAuthAssignments] = useState<EmployeeRoleAssignment[]>([]);
  const [loadingAuth, setLoadingAuth] = useState(false);

  const [dynamicRoles, setDynamicRoles] = useState<{ value: string; label: string }[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | number>('');
  const [selectedRoleId, setSelectedRoleId] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const empId = params.get('employee_id');
      if (empId) {
        setModalOpen(true);
        setSelectedEmployeeId(empId);
      }
    }
  }, []);

  const fetchAuthAssignments = async () => {
    setLoadingAuth(true);
    try {
      const data = await rbacService.listEmployeeRoles();
      setAuthAssignments(data.assignments);
    } catch {
      setAuthAssignments([]);
    } finally {
      setLoadingAuth(false);
    }
  };

  const loadRolesForFilter = () => {
    setLoadingRoles(true);
    rbacService.listRoles('auth')
      .then(data => setDynamicRoles(data.roles.map(r => ({ value: r.id, label: r.name }))))
      .catch(() => setDynamicRoles([]))
      .finally(() => setLoadingRoles(false));
  };

  useEffect(() => {
    fetchAuthAssignments();
    loadRolesForFilter();
  }, []);

  const resetModalForm = () => {
    setSelectedEmployeeId('');
    setSelectedRoleId('');
  };

  const handleAssignRole = async () => {
    if (!selectedEmployeeId || !selectedRoleId) {
      toast.error('Employee and role selection are both required.');
      return;
    }
    setIsSubmitting(true);
    try {
      await rbacService.assignRole(String(selectedEmployeeId), selectedRoleId);
      toast.success('Auth role assigned successfully.');
      setModalOpen(false);
      resetModalForm();
      fetchAuthAssignments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign auth role.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAssignments = authAssignments.filter(a => {
    const matchesSearch = !searchQuery ||
      a.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.employee_org_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.employee_id?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || a.role_id === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Role Assignments</h1>
            <p className="page-subtitle">Assign auth roles to employees and manage permission overrides</p>
          </div>

          <button
            onClick={() => { resetModalForm(); setModalOpen(true); }}
            className="btn-primary whitespace-nowrap"
          >
            <Plus size={16} /> Assign Role
          </button>
        </div>

        <main className="mt-6">
          {/* Filter Bar Panel */}
          <div className="ui-card p-5 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="text-xs text-slate-400">
                {authAssignments.length} auth role assignments
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by employee name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input pl-9"
                />
              </div>

              {/* Role filter */}
              <div className="relative">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="form-input appearance-none cursor-pointer"
                >
                  <option value="">All Roles</option>
                  {dynamicRoles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                </div>
              </div>

              <button
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('');
                }}
                className="btn-secondary"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
              </button>
            </div>
          </div>

          {/* Role Management Panel — create/edit/delete roles & permissions */}
          <RoleManagementPanel onRolesChanged={loadRolesForFilter} />

          {/* Table Listing */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingAuth ? (
              <div className="p-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-theme-800" />
                <span className="text-sm font-medium">Loading auth role assignments…</span>
              </div>
            ) : filteredAssignments.length === 0 ? (
              <div className="p-20 text-center text-slate-400 text-sm font-medium">
                No auth role assignments found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="ui-table-head">Employee ID</th>
                      <th className="ui-table-head">Employee Name</th>
                      <th className="ui-table-head">Role</th>
                      <th className="ui-table-head">Granted At</th>
                      <th className="ui-table-head text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredAssignments.map((assignment) => (
                      <AuthAssignmentRow
                        key={assignment.id}
                        assignment={assignment}
                        onRemove={async (id) => {
                          await rbacService.removeRoleAssignment(id);
                          setAuthAssignments(prev => prev.filter(a => a.id !== id));
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {/* Assign Role Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setModalOpen(false)}
            />

            <div className="flex min-h-full items-center justify-center p-3">
              <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 p-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Assign Auth Role</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Grant an employee a role with its associated permissions.</p>
                  </div>
                  <button
                    onClick={() => setModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="form-label">Target Employee</label>
                    <AsyncSearchSelect
                      fetchOptions={employeeService.getEmployees}
                      value={selectedEmployeeId}
                      onChange={(val) => setSelectedEmployeeId(val)}
                      placeholder="Search employees…"
                    />
                  </div>

                  <div>
                    <label className="form-label">Role</label>
                    <div className="relative w-full">
                      <select
                        value={selectedRoleId}
                        onChange={(e) => setSelectedRoleId(e.target.value)}
                        className="form-input appearance-none cursor-pointer"
                        disabled={loadingRoles}
                      >
                        <option value="" disabled hidden>
                          {loadingRoles ? 'Loading roles...' : 'Select a role...'}
                        </option>
                        {dynamicRoles.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                        {loadingRoles ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronsUpDown className="h-4 w-4" />}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 mt-5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    disabled={isSubmitting}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAssignRole}
                    disabled={isSubmitting}
                    className="btn-primary"
                  >
                    {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {isSubmitting ? 'Assigning…' : 'Assign Role'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

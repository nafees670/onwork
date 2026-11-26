"use client";

import ProtectedLayout from "@/components/ProtectedLayout";
import React, { useState, useEffect, useMemo } from 'react';
import {
  rbacService,
  type RbacRole,
  type RbacRoleDetail,
  type RbacPermission,
  type EmployeeRoleAssignment
} from '@/services/rbacService';
import { fetchWithAuth } from '@/utils/api';
import {
  Loader2,
  Save,
  Plus,
  X,
  Edit,
  Trash2,
  Search,
  RotateCcw,
  ShieldCheck,
  Users,
  Building2,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ============================================================================
// PERMISSION CATEGORIES DEFINITION
// ============================================================================
interface PermissionCategory {
  id: string;
  name: string;
  icon: string;
  prefixMatch: (codename: string) => boolean;
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'dashboard',
    name: 'Management Dashboard',
    icon: '📊',
    prefixMatch: (c) => c.startsWith('dashboard.'),
  },
  {
    id: 'employees',
    name: 'Employees & Placements',
    icon: '👥',
    prefixMatch: (c) => c.startsWith('employee.') || c.startsWith('assignment.'),
  },
  {
    id: 'org',
    name: 'Organization Structure',
    icon: '🏢',
    prefixMatch: (c) =>
      c.startsWith('organization.') ||
      c.startsWith('institution.') ||
      c.startsWith('branch.') ||
      c.startsWith('department.') ||
      c.startsWith('designation.'),
  },
  {
    id: 'payroll',
    name: 'Payroll, Attendance & Leaves',
    icon: '💵',
    prefixMatch: (c) =>
      c.startsWith('payroll.salary.') ||
      c.startsWith('payroll.attendance.') ||
      c.startsWith('payroll.payslip.') ||
      c.startsWith('payroll.loan.') ||
      c.startsWith('payroll.leave.'),
  },
  {
    id: 'esp',
    name: 'Employee Savings Plan (ESP)',
    icon: '📈',
    prefixMatch: (c) => c.startsWith('payroll.esp.'),
  },
  {
    id: 'policies',
    name: 'HR Policies & Requests',
    icon: '📜',
    prefixMatch: (c) => c.startsWith('hr_policy.') || c.startsWith('employee_request.'),
  },
  {
    id: 'admin',
    name: 'Roles, Services & Auditing',
    icon: '🛡️',
    prefixMatch: (c) =>
      c.startsWith('role.') ||
      c.startsWith('service_access.') ||
      c.startsWith('audit.'),
  },
];

// ============================================================================
// PERMISSION DEPENDENCY MAP
// When a permission is checked, these are the required/recommended deps.
// View permissions (*.view) are standalone — no dependencies.
// ============================================================================
const PERMISSION_DEPENDENCIES: Record<string, { deps: string[]; reason: string }> = {
  // ── Employees & Placements ──
  'employee.create': {
    deps: ['organization.view', 'institution.view', 'branch.view', 'department.view', 'designation.view'],
    reason: 'Create Employee form needs Organization, Institution, Branch, Department & Designation dropdowns',
  },
  'employee.edit': {
    deps: ['employee.view', 'organization.view', 'institution.view', 'branch.view', 'department.view', 'designation.view'],
    reason: 'Edit Employee form needs to view the employee + all org hierarchy dropdowns',
  },
  'employee.delete': {
    deps: ['employee.view'],
    reason: 'Must be able to view employees in order to delete them',
  },
  'assignment.create': {
    deps: [
      'employee.view', 'employee.edit',
      'organization.view', 'institution.view', 'branch.view',
      'department.view', 'department.create',
      'designation.view', 'designation.create',
    ],
    reason: 'Assignment is inside Employee Edit → Placement tab — needs all org dropdowns + ability to create Department/Designation if missing',
  },
  'assignment.edit': {
    deps: [
      'employee.view', 'employee.edit',
      'organization.view', 'institution.view', 'branch.view',
      'department.view', 'designation.view',
    ],
    reason: 'Edit Assignment needs Employee Edit access + all org hierarchy dropdowns',
  },
  'assignment.delete': {
    deps: ['employee.view', 'employee.edit'],
    reason: 'Must access Employee Edit to delete an assignment',
  },

  // ── Organization Structure ──
  'institution.create': {
    deps: ['organization.view'],
    reason: 'Need to select parent Organization when creating an Institution',
  },
  'institution.edit': {
    deps: ['institution.view', 'organization.view'],
    reason: 'View Institution list + Organization dropdown',
  },
  'institution.delete': {
    deps: ['institution.view'],
    reason: 'Must view Institutions to delete one',
  },
  'branch.create': {
    deps: ['organization.view', 'institution.view'],
    reason: 'Need Organization + Institution dropdowns',
  },
  'branch.edit': {
    deps: ['branch.view', 'organization.view', 'institution.view'],
    reason: 'View Branch list + org hierarchy dropdowns',
  },
  'branch.delete': {
    deps: ['branch.view'],
    reason: 'Must view Branches to delete one',
  },
  'department.create': {
    deps: ['organization.view', 'institution.view', 'branch.view'],
    reason: 'Need Organization → Institution → Branch hierarchy',
  },
  'department.edit': {
    deps: ['department.view', 'organization.view', 'institution.view', 'branch.view'],
    reason: 'View Department list + full hierarchy dropdowns',
  },
  'department.delete': {
    deps: ['department.view'],
    reason: 'Must view Departments to delete one',
  },
  'designation.create': {
    deps: ['department.view'],
    reason: 'Need to select Department when creating a Designation',
  },
  'designation.edit': {
    deps: ['designation.view', 'department.view'],
    reason: 'View Designation list + Department dropdown',
  },
  'designation.delete': {
    deps: ['designation.view'],
    reason: 'Must view Designations to delete one',
  },

  // ── Payroll ──
  'payroll.salary.create': {
    deps: ['employee.view', 'payroll.salary.view'],
    reason: 'Select employee + view salary list',
  },
  'payroll.salary.update': {
    deps: ['employee.view', 'payroll.salary.view'],
    reason: 'Select employee + view salary to update',
  },
  'payroll.salary.delete': {
    deps: ['payroll.salary.view'],
    reason: 'Must view salary records to delete',
  },
  'payroll.attendance.create': {
    deps: ['employee.view', 'payroll.attendance.view'],
    reason: 'Select employee + view attendance list',
  },
  'payroll.attendance.update': {
    deps: ['employee.view', 'payroll.attendance.view'],
    reason: 'Select employee + view attendance to update',
  },
  'payroll.attendance.delete': {
    deps: ['payroll.attendance.view'],
    reason: 'Must view attendance records to delete',
  },
  'payroll.payslip.generate': {
    deps: ['employee.view', 'payroll.salary.view', 'payroll.attendance.view', 'payroll.payslip.view'],
    reason: 'Payslip generation needs salary data, attendance data & payslip list',
  },
  'payroll.payslip.update': {
    deps: ['payroll.payslip.view'],
    reason: 'Must view payslips to update',
  },
  'payroll.payslip.delete': {
    deps: ['payroll.payslip.view'],
    reason: 'Must view payslips to delete',
  },
  'payroll.loan.create': {
    deps: ['employee.view', 'payroll.loan.view'],
    reason: 'Select employee + view loans list',
  },
  'payroll.loan.edit': {
    deps: ['employee.view', 'payroll.loan.view'],
    reason: 'Select employee + view loan to edit',
  },
  'payroll.loan.delete': {
    deps: ['payroll.loan.view'],
    reason: 'Must view loans to delete',
  },
  'payroll.leave.create': {
    deps: ['employee.view', 'payroll.leave.view'],
    reason: 'Select employee + view leaves list',
  },
  'payroll.leave.edit': {
    deps: ['payroll.leave.view'],
    reason: 'Must view leaves to edit',
  },
  'payroll.leave.approve': {
    deps: ['employee.view', 'payroll.leave.view'],
    reason: 'Review employee leave request',
  },

  // ── ESP ──
  'payroll.esp.enrollment': {
    deps: ['employee.view', 'payroll.esp.settings'],
    reason: 'Need employee list + ESP settings configured',
  },
  'payroll.esp.contribution': {
    deps: ['employee.view', 'payroll.esp.enrollment'],
    reason: 'Need enrollment data to view contributions',
  },
  'payroll.esp.withdrawal': {
    deps: ['employee.view', 'payroll.esp.enrollment', 'payroll.esp.contribution'],
    reason: 'Full ESP chain needed for withdrawals',
  },

  // ── HR Policies & Requests ──
  'employee_request.review': {
    deps: ['employee.view', 'employee_request.view'],
    reason: 'Need to view requests + employee info to review',
  },

  // ── Admin ──
  'role.manage': {
    deps: ['role.view'],
    reason: 'Must view roles to manage them',
  },
  'service_access.grant': {
    deps: ['service_access.view', 'employee.view'],
    reason: 'View services + select employee to grant access',
  },
  'service_access.toggle': {
    deps: ['service_access.view'],
    reason: 'Must view service access to toggle it',
  },
};

// Helper: find which checked parent permissions depend on a given codename
function findParentPerms(codename: string, checkedPerms: string[]): string[] {
  const parents: string[] = [];
  for (const checked of checkedPerms) {
    const config = PERMISSION_DEPENDENCIES[checked];
    if (config && config.deps.includes(codename)) {
      parents.push(checked);
    }
  }
  return parents;
}

// Helper: collect all deps that were auto-added for a parent permission
// (only those not required by any OTHER checked permission)
function collectRemovableDeps(parentCodename: string, currentPerms: string[]): string[] {
  const parentConfig = PERMISSION_DEPENDENCIES[parentCodename];
  if (!parentConfig) return [];

  // For each dep of this parent, check if any OTHER checked permission also needs it
  return parentConfig.deps.filter(dep => {
    const otherParents = currentPerms.filter(
      p => p !== parentCodename && PERMISSION_DEPENDENCIES[p]?.deps.includes(dep)
    );
    return otherParents.length === 0; // only removable if no other parent needs it
  });
}

// ==========================================
// SUB-TAB 1: ROLES & PERMISSIONS PANEL
// ==========================================
function RolesPanel({
  onRolesUpdated
}: {
  onRolesUpdated?: () => void;
}) {
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [allPermissions, setAllPermissions] = useState<RbacPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RbacRoleDetail | null>(null);
  const [processing, setProcessing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [expandedRoleDetails, setExpandedRoleDetails] = useState<Record<string, boolean>>({});
  const [roleDetailsCache, setRoleDetailsCache] = useState<Record<string, string[]>>({});

  // Smart dependency suggestion card state
  const [depSuggestion, setDepSuggestion] = useState<{
    trigger: string;
    triggerName: string;
    deps: { codename: string; name: string; checked: boolean }[];
    reason: string;
  } | null>(null);

  // Warning dialog when unchecking a dependency that a parent needs
  const [depWarning, setDepWarning] = useState<{
    codename: string;
    codeName: string;
    parentPerms: string[];
  } | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([rbacService.listRoles('auth'), rbacService.listPermissions('auth')])
      .then(([rolesData, permsData]) => {
        setRoles(rolesData.roles);
        setAllPermissions(permsData.permissions);
      })
      .catch((err) => {
        toast.error('Failed to load roles: ' + (err.message || ''));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setFormName('');
    setFormDescription('');
    setFormPermissions([]);
    setPermSearch('');
    setEditingRole(null);
    setShowModal(true);
  };

  const openEdit = async (role: RbacRole) => {
    try {
      const detail = await rbacService.getRole(role.id);
      setFormName(detail.name);
      setFormDescription(detail.description || '');
      setFormPermissions(detail.permission_codenames || []);
      setPermSearch('');
      setEditingRole(detail);
      setShowModal(true);
    } catch (err: any) {
      toast.error('Failed to load role details: ' + (err.message || ''));
    }
  };

  const toggleRoleExpand = async (role: RbacRole) => {
    const nextState = !expandedRoleDetails[role.id];
    setExpandedRoleDetails(prev => ({ ...prev, [role.id]: nextState }));
    if (nextState && !roleDetailsCache[role.id]) {
      try {
        const detail = await rbacService.getRole(role.id);
        setRoleDetailsCache(prev => ({ ...prev, [role.id]: detail.permission_codenames || [] }));
      } catch {
        // silent fallback
      }
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Role name is required');
      return;
    }
    setProcessing(true);
    try {
      if (editingRole) {
        await rbacService.updateRole(editingRole.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          permission_codenames: formPermissions,
        });
        toast.success(`Role "${formName}" updated successfully`);
      } else {
        await rbacService.createRole({
          name: formName.trim(),
          service: 'auth',
          description: formDescription.trim(),
          permission_codenames: formPermissions,
        });
        toast.success(`Role "${formName}" created successfully`);
      }
      setShowModal(false);
      loadData();
      onRolesUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save role');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (role: RbacRole) => {
    if (role.is_default) {
      toast.error('Default system roles cannot be deleted.');
      return;
    }
    if (!confirm(`Are you sure you want to delete role "${role.name}"? Employees with this role will lose its permissions.`)) return;
    try {
      await rbacService.deleteRole(role.id);
      setRoles(prev => prev.filter(r => r.id !== role.id));
      toast.success(`Role "${role.name}" deleted`);
      onRolesUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete role');
    }
  };

  const togglePermission = (codename: string) => {
    const isCurrentlyChecked = formPermissions.includes(codename);

    if (isCurrentlyChecked) {
      // ── UNCHECKING ──

      // 1. Check if this is a "parent" permission that has deps in the map
      const parentConfig = PERMISSION_DEPENDENCIES[codename];
      if (parentConfig) {
        // Auto-uncheck all deps that are ONLY needed by this parent (not by other checked parents)
        const removable = collectRemovableDeps(codename, formPermissions);
        setFormPermissions(prev =>
          prev.filter(c => c !== codename && !removable.includes(c))
        );
        return;
      }

      // 2. Check if this permission is a dep of some other checked parent
      const parents = findParentPerms(codename, formPermissions);
      if (parents.length > 0) {
        // Show warning before allowing uncheck
        const permObj = allPermissions.find(p => p.codename === codename);
        setDepWarning({
          codename,
          codeName: permObj?.name || codename,
          parentPerms: parents,
        });
        return;
      }

      // 3. Normal uncheck (standalone permission, no parent depends on it)
      setFormPermissions(prev => prev.filter(c => c !== codename));
      return;
    }

    // ── CHECKING ──
    // First, add the permission itself
    setFormPermissions(prev => [...new Set([...prev, codename])]);

    // Then check if it has dependencies we need to suggest
    const depConfig = PERMISSION_DEPENDENCIES[codename];
    if (depConfig) {
      const missingDeps = depConfig.deps.filter(d => !formPermissions.includes(d));
      if (missingDeps.length > 0) {
        const depDetails = missingDeps.map(d => ({
          codename: d,
          name: allPermissions.find(p => p.codename === d)?.name || d,
          checked: true,
        }));
        setDepSuggestion({
          trigger: codename,
          triggerName: allPermissions.find(p => p.codename === codename)?.name || codename,
          deps: depDetails,
          reason: depConfig.reason,
        });
      }
    }
  };

  // Confirm dependency suggestion → add accepted deps
  const confirmDeps = () => {
    if (!depSuggestion) return;
    const accepted = depSuggestion.deps.filter(d => d.checked).map(d => d.codename);
    setFormPermissions(prev => Array.from(new Set([...prev, ...accepted])));
    setDepSuggestion(null);
  };

  // Skip dependency suggestion → keep only the original permission
  const skipDeps = () => {
    setDepSuggestion(null);
  };

  // Toggle a dep checkbox inside the suggestion card
  const toggleDepInSuggestion = (depCodename: string) => {
    setDepSuggestion(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        deps: prev.deps.map(d =>
          d.codename === depCodename ? { ...d, checked: !d.checked } : d
        ),
      };
    });
  };

  // Confirm warning → force-uncheck the dependency
  const confirmDepWarning = () => {
    if (!depWarning) return;
    setFormPermissions(prev => prev.filter(c => c !== depWarning.codename));
    setDepWarning(null);
  };

  // Cancel warning → keep permission checked
  const cancelDepWarning = () => {
    setDepWarning(null);
  };

  const toggleCategoryAll = (categoryPerms: RbacPermission[]) => {
    const codenames = categoryPerms.map(p => p.codename);
    const allSelected = codenames.every(c => formPermissions.includes(c));
    if (allSelected) {
      setFormPermissions(prev => prev.filter(c => !codenames.includes(c)));
    } else {
      setFormPermissions(prev => Array.from(new Set([...prev, ...codenames])));
    }
  };

  const selectAllPermissions = () => {
    setFormPermissions(allPermissions.map(p => p.codename));
  };

  const clearAllPermissions = () => {
    setFormPermissions([]);
  };

  // Filtered & grouped permissions for modal
  const groupedPermissions = useMemo(() => {
    const query = permSearch.toLowerCase().trim();
    const filtered = allPermissions.filter(p =>
      !query || p.name.toLowerCase().includes(query) || p.codename.toLowerCase().includes(query)
    );

    return PERMISSION_CATEGORIES.map(cat => ({
      category: cat,
      perms: filtered.filter(p => cat.prefixMatch(p.codename)),
    })).filter(g => g.perms.length > 0);
  }, [allPermissions, permSearch]);

  if (loading) {
    return (
      <div className="ui-card p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
        <span className="text-sm font-medium">Loading auth roles & permissions…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-700" />
            Configured System Roles
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define granular roles and customize exactly what permissions each role confers.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="btn-primary text-xs px-4 py-2.5 h-auto flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="h-4 w-4" /> New Role
        </button>
      </div>

      {/* Role Cards Grid */}
      {roles.length === 0 ? (
        <div className="ui-card p-12 text-center">
          <p className="text-sm text-slate-400">No auth roles found. Create your first role above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {roles.map(role => {
            const isExpanded = !!expandedRoleDetails[role.id];
            const permsList = roleDetailsCache[role.id] || [];

            return (
              <div
                key={role.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm text-gray-900 truncate">{role.name}</h3>
                        {role.is_default && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                            System Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {role.description || "No description provided."}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(role)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                        title="Edit Role & Permissions"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      {!role.is_default && (
                        <button
                          onClick={() => handleDelete(role)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Role"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {role.permission_count} permissions
                    </span>

                    <button
                      onClick={() => toggleRoleExpand(role)}
                      className="text-xs text-slate-500 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {isExpanded ? 'Hide' : 'View'} Perms
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expandable Permissions Drawer */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50/70 -mx-5 -mb-5 p-4 rounded-b-2xl max-h-56 overflow-y-auto">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Active Permissions ({permsList.length})
                    </p>
                    {permsList.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No permissions assigned yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {permsList.map(codename => (
                          <span
                            key={codename}
                            className="inline-block px-2 py-0.5 text-[10px] font-mono bg-white border border-slate-200 text-slate-700 rounded-md shadow-2xs"
                          >
                            {codename}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT ROLE MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />

          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-gray-100 flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-700" />
                  {editingRole ? 'Edit Role & Permissions' : 'Create New Auth Role'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure role name, description, and assign categorized permissions.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label text-xs font-semibold text-slate-700">Role Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    disabled={!!editingRole?.is_default}
                    placeholder="e.g. HR Assistant, Payroll Officer"
                    className="form-input text-xs disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    autoFocus
                  />
                  {editingRole?.is_default && (
                    <p className="text-[11px] text-amber-600 mt-1 font-medium">
                      ⚠️ System Default role name is protected and cannot be changed. Use &quot;+ New Role&quot; to create a new role.
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-slate-700">Description</label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="Brief description of this role's duties"
                    className="form-input text-xs"
                  />
                </div>
              </div>

              {/* Permissions Header & Actions */}
              <div className="pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <label className="form-label text-xs font-bold text-slate-800">
                      Module Permissions ({formPermissions.length} selected of {allPermissions.length})
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Select which actions users with this role are authorized to perform.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllPermissions}
                      className="text-xs text-blue-700 hover:text-blue-900 font-semibold px-2 py-1 rounded bg-blue-50 cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearAllPermissions}
                      className="text-xs text-slate-500 hover:text-slate-700 font-semibold px-2 py-1 rounded bg-slate-100 cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Filter input */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search permissions by name or code..."
                    value={permSearch}
                    onChange={e => setPermSearch(e.target.value)}
                    className="form-input text-xs pl-9 py-1.5"
                  />
                </div>

                {/* ── Dependency Suggestion Card ── */}
                {depSuggestion && (
                  <div className="mb-3 border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-start gap-2.5 mb-3">
                      <div className="p-1.5 bg-blue-100 rounded-lg shrink-0 mt-0.5">
                        <Zap className="h-4 w-4 text-blue-700" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-blue-900">
                          Required Permissions
                        </h4>
                        <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                          <span className="font-semibold">&quot;{depSuggestion.triggerName}&quot;</span> needs
                          these permissions to work properly:
                        </p>
                        <p className="text-[10px] text-blue-500 mt-1 italic">
                          {depSuggestion.reason}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
                      {depSuggestion.deps.map(dep => (
                        <label
                          key={dep.codename}
                          className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors border ${
                            dep.checked
                              ? 'bg-white border-blue-200 text-blue-900'
                              : 'bg-white/50 border-slate-200 text-slate-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={dep.checked}
                            onChange={() => toggleDepInSuggestion(dep.codename)}
                            className="rounded border-blue-300 text-blue-700 focus:ring-blue-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold leading-tight">{dep.name}</p>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{dep.codename}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={skipDeps}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={confirmDeps}
                        className="text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 px-4 py-1.5 rounded-lg shadow-sm cursor-pointer transition-colors flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirm &amp; Add
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Dependency Warning Dialog ── */}
                {depWarning && (
                  <div className="mb-3 border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-start gap-2.5 mb-3">
                      <div className="p-1.5 bg-amber-100 rounded-lg shrink-0 mt-0.5">
                        <AlertTriangle className="h-4 w-4 text-amber-700" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-900">
                          Warning: Permission Dependency
                        </h4>
                        <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                          <span className="font-semibold">&quot;{depWarning.codeName}&quot;</span> is required by:
                        </p>
                        <ul className="mt-1.5 space-y-0.5">
                          {depWarning.parentPerms.map(parent => {
                            const parentName = allPermissions.find(p => p.codename === parent)?.name || parent;
                            return (
                              <li key={parent} className="text-[11px] text-amber-800 font-medium flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                                {parentName} <span className="font-mono text-amber-500">({parent})</span>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="text-[10px] text-amber-600 mt-2">
                          Removing it may cause those features to not work correctly.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelDepWarning}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                      >
                        Keep It
                      </button>
                      <button
                        type="button"
                        onClick={confirmDepWarning}
                        className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-1.5 rounded-lg shadow-sm cursor-pointer transition-colors flex items-center gap-1.5"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Remove Anyway
                      </button>
                    </div>
                  </div>
                )}

                {/* Categorized Permissions Accordions */}
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {groupedPermissions.map(({ category, perms }) => {
                    const isCollapsed = !!collapsedCategories[category.id];
                    const selectedCount = perms.filter(p => formPermissions.includes(p.codename)).length;
                    const allCatSelected = perms.length > 0 && selectedCount === perms.length;

                    return (
                      <div
                        key={category.id}
                        className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs"
                      >
                        {/* Category Header */}
                        <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedCategories(prev => ({ ...prev, [category.id]: !isCollapsed }))
                            }
                            className="flex items-center gap-2 text-xs font-bold text-slate-800 text-left flex-1 cursor-pointer"
                          >
                            <span>{category.icon}</span>
                            <span>{category.name}</span>
                            <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded-full ml-1">
                              {selectedCount}/{perms.length}
                            </span>
                            {isCollapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleCategoryAll(perms)}
                            className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 px-2 py-0.5 rounded hover:bg-blue-100/50 cursor-pointer"
                          >
                            {allCatSelected ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>

                        {/* Category Permissions Checkboxes */}
                        {!isCollapsed && (
                          <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white">
                            {perms.map(p => {
                              const isChecked = formPermissions.includes(p.codename);
                              return (
                                <label
                                  key={p.codename}
                                  className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors text-left border ${
                                    isChecked
                                      ? 'bg-blue-50/50 border-blue-200 text-blue-900'
                                      : 'hover:bg-slate-50 border-transparent text-slate-700'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePermission(p.codename)}
                                    className="mt-0.5 rounded border-slate-300 text-blue-800 focus:ring-blue-700"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold leading-tight">{p.name}</p>
                                    <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{p.codename}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0 bg-slate-50/50 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn-secondary text-xs px-4 py-2 h-auto cursor-pointer"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!formName.trim() || processing}
                className="btn-primary text-xs px-5 py-2 h-auto flex items-center gap-1.5 cursor-pointer"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingRole ? 'Save Changes' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-TAB 2: USERS & ROLE ASSIGNMENTS PANEL
// ============================================================================
interface ModalEmployee {
  id: string;
  name: string;
  code: string;
  dept?: string;
}

function UsersRoleAssignmentsPanel({
  onNavigateToRoles
}: {
  onNavigateToRoles?: () => void;
}) {
  const [assignments, setAssignments] = useState<EmployeeRoleAssignment[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Assign Role Modal
  const [selectedEmpIdentifier, setSelectedEmpIdentifier] = useState('');
  const [selectedEmpName, setSelectedEmpName] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [allEmployees, setAllEmployees] = useState<ModalEmployee[]>([]);
  const [empSearchTerm, setEmpSearchTerm] = useState('');
  const [searchingEmp, setSearchingEmp] = useState(false);
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const [assignData, rolesData] = await Promise.all([
        rbacService.listEmployeeRoles(),
        rbacService.listRoles('auth'),
      ]);
      setAssignments(assignData.assignments);
      setRoles(rolesData.roles);
    } catch (err: any) {
      toast.error('Failed to load assignments: ' + (err.message || ''));
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  // Pre-load active employees when opening Assign Role modal
  const loadEmployeesForModal = async () => {
    setSearchingEmp(true);
    try {
      const res = await fetchWithAuth('/employees/employees?per_page=100&status=all');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.employees || data.results || []);
        const formatted: ModalEmployee[] = list.map((e: any) => ({
          id: String(e.employee_id || e.id || ''),
          name: String(e.full_name || ''),
          code: String(e.employee_id || ''),
          dept: String(e.department?.dept_name || ''),
        }));
        setAllEmployees(formatted);
      }
    } catch {
      // ignore
    } finally {
      setSearchingEmp(false);
    }
  };

  // Search employees dynamically for modal
  const handleEmpSearch = async (term: string) => {
    setEmpSearchTerm(term);
    setEmpDropdownOpen(true);
    if (!term || term.length < 2) return;
    setSearchingEmp(true);
    try {
      const res = await fetchWithAuth(`/employees/employees?search=${encodeURIComponent(term)}&per_page=25&status=all`);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.employees || data.results || []);
      const formatted: ModalEmployee[] = list.map((e: any) => ({
        id: String(e.employee_id || e.id || ''),
        name: String(e.full_name || ''),
        code: String(e.employee_id || ''),
        dept: String(e.department?.dept_name || ''),
      }));
      setAllEmployees(prev => {
        const map = new Map<string, ModalEmployee>();
        prev.forEach((p: ModalEmployee) => map.set(p.code, p));
        formatted.forEach((f: ModalEmployee) => map.set(f.code, f));
        return Array.from(map.values());
      });
    } catch {
      // ignore
    } finally {
      setSearchingEmp(false);
    }
  };

  const filteredModalEmployees = useMemo(() => {
    const q = empSearchTerm.toLowerCase().trim();
    if (!q) return allEmployees.slice(0, 25);
    return allEmployees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q) ||
      (e.dept && e.dept.toLowerCase().includes(q))
    ).slice(0, 25);
  }, [allEmployees, empSearchTerm]);

  const handleAssignRole = async () => {
    if (!selectedEmpIdentifier.trim() || !selectedRoleId) {
      toast.error('Please choose both an employee and a role');
      return;
    }
    setIsSubmitting(true);
    try {
      await rbacService.assignRole(selectedEmpIdentifier.trim(), selectedRoleId);
      toast.success('Role assigned successfully');
      setModalOpen(false);
      setSelectedEmpIdentifier('');
      setSelectedEmpName('');
      setSelectedRoleId('');
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAssignment = async (assignment: EmployeeRoleAssignment) => {
    if (!confirm(`Remove role "${assignment.role_name}" from ${assignment.employee_name}?`)) return;
    try {
      await rbacService.removeRoleAssignment(assignment.id);
      setAssignments(prev => prev.filter(a => a.id !== assignment.id));
      toast.success('Role assignment removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove assignment');
    }
  };

  // Distinct departments for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach(a => {
      if (a.department) set.add(a.department);
    });
    return Array.from(set).sort();
  }, [assignments]);

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return assignments.filter(a => {
      const matchesSearch =
        !q ||
        a.employee_name?.toLowerCase().includes(q) ||
        a.employee_org_id?.toLowerCase().includes(q) ||
        a.employee_id?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q);
      const matchesRole = !roleFilter || a.role_id === roleFilter;
      const matchesDept = !departmentFilter || a.department === departmentFilter;
      return matchesSearch && matchesRole && matchesDept;
    });
  }, [assignments, searchQuery, roleFilter, departmentFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Search Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-700" />
              User Role Assignments
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assign administrative and operational roles to employees to grant system access.
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedEmpIdentifier('');
              setSelectedEmpName('');
              setSelectedRoleId('');
              setEmpSearchTerm('');
              setEmpDropdownOpen(false);
              setModalOpen(true);
              loadEmployeesForModal();
            }}
            className="btn-primary text-xs px-4 py-2.5 h-auto flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Assign Role
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search employee by name, ID, or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input text-xs pl-9 py-2"
            />
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="form-input text-xs py-2 cursor-pointer"
          >
            <option value="">All Roles ({roles.length})</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="form-input text-xs py-2 cursor-pointer flex-1"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            {(searchQuery || roleFilter || departmentFilter) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('');
                  setDepartmentFilter('');
                }}
                className="btn-secondary text-xs p-2 h-auto shrink-0 cursor-pointer"
                title="Reset Filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
            <span className="text-sm font-medium">Loading user role assignments…</span>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            <p className="font-semibold text-slate-600">No role assignments found.</p>
            <p className="text-xs mt-1">Use the &quot;Assign Role&quot; button above to grant an employee a role.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-gray-100">
                <tr>
                  <th className="ui-table-head text-xs">Employee</th>
                  <th className="ui-table-head text-xs">Department & Designation</th>
                  <th className="ui-table-head text-xs">Assigned Role</th>
                  <th className="ui-table-head text-xs">Granted Date</th>
                  <th className="ui-table-head text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredAssignments.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="ui-table-cell py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-xs shrink-0">
                          {item.employee_name?.charAt(0)?.toUpperCase() || "E"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{item.employee_name}</p>
                          <p className="text-[11px] font-mono text-blue-700">{item.employee_org_id || item.employee_id}</p>
                          {item.email && <p className="text-[10px] text-slate-400 truncate">{item.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="ui-table-cell py-3.5">
                      <p className="font-medium text-slate-800">{item.department || "—"}</p>
                      <p className="text-[11px] text-slate-500">{item.designation || "—"}</p>
                    </td>
                    <td className="ui-table-cell py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-100">
                        <ShieldCheck className="h-3 w-3 text-blue-700" />
                        {item.role_name}
                      </span>
                    </td>
                    <td className="ui-table-cell py-3.5 text-slate-400">
                      {item.granted_at ? new Date(item.granted_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="ui-table-cell py-3.5 text-right">
                      <button
                        onClick={() => handleRemoveAssignment(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-100 transition-colors text-[11px] font-semibold cursor-pointer"
                        title="Remove role assignment"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ASSIGN ROLE MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setModalOpen(false)} />

          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-gray-100 p-6 z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-700" />
                  Assign Role to Employee
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select an employee and grant them an administrative or management role.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Employee Selection */}
              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Select Employee *</label>

                {selectedEmpIdentifier ? (
                  <div className="flex items-center justify-between p-3 bg-blue-50/80 border border-blue-200 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center text-xs shrink-0">
                        {selectedEmpName?.charAt(0)?.toUpperCase() || 'E'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-blue-950">{selectedEmpName}</p>
                        <p className="text-[11px] font-mono text-blue-700 font-semibold">{selectedEmpIdentifier}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmpIdentifier('');
                        setSelectedEmpName('');
                        setEmpSearchTerm('');
                        setEmpDropdownOpen(true);
                      }}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-2.5 py-1 rounded-lg hover:bg-rose-50 cursor-pointer border border-rose-200 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Backdrop to close dropdown when clicking outside */}
                    {empDropdownOpen && (
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setEmpDropdownOpen(false)}
                      />
                    )}

                    <div className="relative z-40">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Click to browse employees or search by name / ID..."
                        value={empSearchTerm}
                        onFocus={() => setEmpDropdownOpen(true)}
                        onChange={e => handleEmpSearch(e.target.value)}
                        className="form-input text-xs pl-9 pr-8"
                      />
                      {searchingEmp && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        </div>
                      )}
                    </div>

                    {/* Autocomplete dropdown positioned directly below input */}
                    {empDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-52 overflow-y-auto z-50 animate-in fade-in duration-150">
                        {filteredModalEmployees.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400">
                            {searchingEmp ? 'Searching employees…' : 'No employees found.'}
                          </div>
                        ) : (
                          filteredModalEmployees.map(emp => (
                            <button
                              key={emp.code}
                              type="button"
                              onClick={() => {
                                setSelectedEmpIdentifier(emp.code);
                                setSelectedEmpName(emp.name);
                                setEmpDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 flex items-center justify-between border-b border-slate-100 last:border-0 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                                  {emp.name?.charAt(0)?.toUpperCase() || 'E'}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 leading-tight truncate">{emp.name}</p>
                                  {emp.dept && <p className="text-[10px] text-slate-400 truncate">{emp.dept}</p>}
                                </div>
                              </div>
                              <span className="font-mono text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 shrink-0 ml-2">
                                {emp.code}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  You can type the Employee ID directly or pick an employee from the list.
                </p>
              </div>

              {/* Role Selector */}
              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Select Role *</label>
                {roles.filter(r => !r.is_default).length === 0 ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
                    <p className="font-bold flex items-center gap-1.5 text-amber-900">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      No Custom Roles Found
                    </p>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      The system default &quot;Employee Baseline&quot; role cannot be manually assigned. Please create a custom role (e.g. <strong>HR Assistant</strong>, <strong>Manager</strong>) first.
                    </p>
                    {onNavigateToRoles && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalOpen(false);
                          onNavigateToRoles();
                        }}
                        className="text-xs font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer pt-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Go to &quot;Roles &amp; Permissions&quot; to create a role
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    value={selectedRoleId}
                    onChange={e => setSelectedRoleId(e.target.value)}
                    className="form-input text-xs cursor-pointer"
                  >
                    <option value="" disabled hidden>Choose a role to assign...</option>
                    {roles.filter(r => !r.is_default).map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.permission_count} permissions)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-5 mt-5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={isSubmitting}
                className="btn-secondary text-xs px-4 py-2 h-auto cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignRole}
                disabled={!selectedEmpIdentifier.trim() || !selectedRoleId || isSubmitting}
                className="btn-primary text-xs px-5 py-2 h-auto flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Assign Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN SERVICE ACCESS & RBAC MANAGEMENT PAGE (WITH 2 SUB-TABS)
// ============================================================================
export default function ServiceAccessManagement() {
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles');

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
          <div>
            <h1 className="page-title flex items-center gap-2.5">
              <ShieldCheck className="h-7 w-7 text-blue-800" />
              Auth Roles & Access Control
            </h1>
            <p className="page-subtitle mt-1">
              Configure system roles, manage permissions, and grant roles to employees.
            </p>
          </div>

          {/* Tab Switcher Pills */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl shrink-0 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'roles'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldCheck size={15} />
              <span>Roles & Permissions</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users size={15} />
              <span>Users & Role Assignments</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'roles' ? (
            <RolesPanel />
          ) : (
            <UsersRoleAssignmentsPanel onNavigateToRoles={() => setActiveTab('roles')} />
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}

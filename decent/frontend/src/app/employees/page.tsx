"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import ProtectedLayout from '@/components/ProtectedLayout';
import Link from 'next/link';
import {
  Plus, Search,
  Users, UserPlus, UserCheck, Clock, CheckCircle, XCircle,
  X, SlidersHorizontal, Filter, RotateCcw,
  MoreVertical, Download, CreditCard,
  ShieldCheck, User as UserIcon,
  Trash2, Edit2, ExternalLink, Upload, Building2, Mail,
  ChevronDown, ChevronUp, MapPin, GraduationCap, Landmark, Calendar, Phone,
  Briefcase, Loader2
} from 'lucide-react';
import IDCard from '@/components/IDCard';
import Skeleton from '@/components/Skeleton';
import { fetchWithAuth } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import AccessDenied from '@/components/AccessDenied';
import toast from "react-hot-toast";
import SetCredentialsModal from './components/SetCredentialsModal';
import OffboardModal from './components/OffboardModal';

// --- Types ---
interface Employee {
  employee_id: string;
  full_name: string;
  email: string;
  personal_email?: string;
  org_email?: string;
  phone: string;
  department?: { dept_name: string; dept_code: string } | null;
  designation?: { position_name: string; position_code: string } | null;
  is_active: boolean;
  created_at: string;
  join_date?: string | null;
  image?: string;
  employment_type?: string;
  gender?: string;
  bio?: string;
  location?: string;
  cnic?: string;
  status?: string;
  assignment_status?: string;
}

// --- Utils ---
const getDeptColor = (deptName: string = '') => {
  const name = deptName.toLowerCase();
  if (name.includes('food')) return 'bg-orange-50 text-orange-600 border-orange-100';
  if (name.includes('acad')) return 'bg-blue-50 text-blue-600 border-blue-100';
  if (name.includes('health') || name.includes('medic')) return 'bg-rose-50 text-rose-600 border-rose-100';
  if (name.includes('it') || name.includes('tech') || name.includes('design')) return 'bg-purple-50 text-purple-600 border-purple-100';
  if (name.includes('admin') || name.includes('sales')) return 'bg-amber-50 text-amber-600 border-amber-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
};

const getStatusColor = (status: string = '') => {
  switch (status) {
    case 'Active':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'Assigned':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'Pending':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'Rejected':
      return 'bg-red-50 text-red-700 border-red-100';
    case 'Suspended':
      return 'bg-slate-50 text-slate-700 border-slate-100';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-100';
  }
};

// --- Components ---

const StatsCard = ({ title, count, icon: Icon, color, bgColor, loading }: any) => (
  <div className="ui-card p-5 flex items-center justify-between">
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">{title}</p>
      {loading ? (
        <div className="h-8 w-16 bg-slate-50 rounded animate-pulse" />
      ) : (
        <h3 className="text-2xl font-bold text-slate-900">{count}</h3>
      )}
    </div>
    <div className={`h-11 w-11 rounded-full flex items-center justify-center ${bgColor} ${color}`}>
      <Icon size={20} strokeWidth={2} />
    </div>
  </div>
);

const EmployeeCard = ({ employee, onClick, onDelete }: { employee: Employee, onClick: () => void, onDelete: (id: string) => void }) => (
  <div className="ui-card p-5 flex flex-col items-center text-center relative">
    {/* Status Indicator Dot */}
    <div className={`absolute top-5 right-5 h-2 w-2 rounded-full ${employee.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />

    {/* Profile Initial */}
    <button onClick={onClick} className="h-12 w-12 rounded-full bg-theme-800 flex items-center justify-center text-white text-base font-bold mb-4">
      {employee.full_name.charAt(0)}
    </button>

    {/* Name & Designation & Gender */}
    <button onClick={onClick} className="mb-5 flex flex-col items-center">
      <h4 className="text-sm font-semibold text-slate-900">{employee.full_name}</h4>
      <div className="flex items-center gap-2 mt-2">
        <p className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getDeptColor(employee.department?.dept_name)}`}>
          {employee.designation?.position_name || 'Personnel'}
        </p>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${employee.gender === 'male' ? 'bg-blue-50 text-blue-600 border-blue-100' : employee.gender === 'female' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
          {employee.gender || 'N/A'}
        </span>
      </div>
    </button>

    {/* Metrics Pills */}
    <div className="flex gap-2 w-full mb-4">
      <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Emp ID</p>
        <p className="text-xs font-semibold text-slate-700">{employee.employee_id}</p>
      </div>
      <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Join Date</p>
        <p className="text-xs font-semibold text-slate-700">{employee.join_date ? new Date(employee.join_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</p>
      </div>
    </div>

    {/* Action Footer */}
    <div className="flex items-center gap-2 w-full">
      <Link href={`/employees/${employee.employee_id}`} className="h-10 w-10 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center hover:bg-slate-50 transition-colors">
        <Edit2 size={15} />
      </Link>
      <button
        onClick={() => onDelete(employee.employee_id)}
        className="h-10 w-10 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg flex items-center justify-center hover:bg-rose-600 hover:text-white transition-colors"
      >
        <Trash2 size={15} />
      </button>
      <button
        onClick={onClick}
        className="flex-1 h-10 bg-white border border-slate-200 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-50 transition-colors"
      >
        <ShieldCheck size={16} />
      </button>
    </div>
  </div>
);

const ActionMenu = ({ emp, onDelete, onDetailClick, onSetCredentials, onApproveAndPlace, onOffboard, tab }: { emp: Employee, onDelete: (id: string) => void, onDetailClick: (emp: Employee) => void, onSetCredentials?: (emp: Employee) => void, onApproveAndPlace?: (emp: Employee) => void, onOffboard?: (emp: Employee) => void, tab: 'all' | 'assigned' | 'pending' }) => {
  const { user, hasPermission } = useAuth();
  const isSuperadmin = !!user?.is_superadmin;
  const canEdit = isSuperadmin || hasPermission("employee.edit");
  const canDelete = isSuperadmin || hasPermission("employee.delete");
  const canManageRoles = isSuperadmin || hasPermission("role.manage");
  const canManagePlacements = isSuperadmin || hasPermission("assignment.create") || hasPermission("employee.edit");
  const hasAnyAction = canEdit || canDelete || canManageRoles || canManagePlacements;

  const [open, setOpen] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  const handleResendWelcome = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    const targetEmail = emp.personal_email || emp.email || emp.org_email;
    setResendingEmail(true);
    const toastId = toast.loading(`Sending welcome email to ${targetEmail}...`);
    try {
      const res = await fetchWithAuth(`/employees/employees/${emp.employee_id}/resend-welcome-email`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Welcome email sent successfully", { id: toastId });
      } else {
        toast.error(data.error || "Failed to send welcome email", { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send welcome email", { id: toastId });
    } finally {
      setResendingEmail(false);
    }
  };

  // Position is computed from the trigger button's own bounding box and the
  // dropdown is rendered into document.body via a portal (below) — this is
  // what keeps it from being clipped by the table's overflow-x/y-auto
  // scroll wrappers, which was cutting the menu off on desktop.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const MENU_WIDTH = 192; // w-48

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpwards = spaceBelow < 260 && rect.top > 260;
      setCoords({
        top: openUpwards ? rect.top - 4 : rect.bottom + 4,
        left: Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleReposition = () => setOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    // Any scroll (including the table's internal scroll container) or resize
    // closes the menu instead of leaving a stale, misplaced dropdown behind.
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  return (
    <div className="flex items-center justify-center gap-2 relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); onDetailClick(emp); }}
        className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shadow-sm hover:border-slate-300"
      >
        View profile <ExternalLink size={13} className="text-slate-400" />
      </button>

      {hasAnyAction && (
        <button
          ref={btnRef}
          onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : openMenu(); }}
          className={`h-[30px] w-[30px] flex items-center justify-center rounded-lg border transition-colors ${open ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          <MoreVertical size={14} />
        </button>
      )}

      {open && coords && hasAnyAction && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_WIDTH }}
          className="bg-white border border-gray-100 rounded-xl shadow-xl py-1.5 z-[100]"
          onClick={(e) => e.stopPropagation()}
        >
          {canManageRoles && (
            <Link href={`/service?employee_id=${emp.employee_id}`} className="w-full text-left px-4 py-2 text-xs font-medium text-blue-800 hover:bg-blue-50 flex items-center" onClick={() => setOpen(false)}>
              Setup permissions
            </Link>
          )}
          {canEdit && (
            <Link href={`/employees/${emp.employee_id}/edit`} className="w-full text-left px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center" onClick={() => setOpen(false)}>
              Edit employee
            </Link>
          )}
          {canManagePlacements && (tab === 'assigned' || tab === 'all') && (
            <Link
              href={`/employees/${emp.employee_id}/edit?step=3`}
              onClick={() => setOpen(false)}
              className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 flex items-center gap-1.5"
            >
              <Building2 size={13} /> Give Placement (Organization)
            </Link>
          )}
          {canEdit && onApproveAndPlace && tab === 'pending' && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onApproveAndPlace(emp); }}
              className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 flex items-center gap-1.5"
            >
              <Building2 size={13} /> Approve &amp; Give Placement
            </button>
          )}
          {canEdit && onOffboard && tab === 'all' && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onOffboard(emp); }}
              className="w-full text-left px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center"
            >
              Offboard employee
            </button>
          )}
          {canEdit && onSetCredentials && tab === 'assigned' && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onSetCredentials(emp); }}
              className="w-full text-left px-4 py-2 text-xs font-medium text-blue-800 hover:bg-blue-50 flex items-center"
            >
              Set Password
            </button>
          )}
          {canEdit && (emp.personal_email || emp.email || emp.org_email) && (
            <button
              onClick={handleResendWelcome}
              disabled={resendingEmail}
              className="w-full text-left px-4 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-50 flex items-center gap-1.5"
            >
              <Mail size={13} /> Resend Welcome Email
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(emp.employee_id); }}
              className="w-full text-left px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center mt-1 pt-2 border-t border-slate-100"
            >
              Remove user
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

const EmployeeTable = ({ employees, onDetailClick, onDelete, loading, tab, onApprove, onReject, onSetCredentials, onApproveAndPlace, onOffboard, actionLoadingId, selection, onToggleSelect, onToggleSelectAll }: { employees: Employee[], onDetailClick: (emp: Employee) => void, onDelete: (id: string) => void, loading: boolean, tab: 'all' | 'assigned' | 'pending', onApprove: (id: string) => void, onReject: (id: string) => void, onSetCredentials?: (emp: Employee) => void, onApproveAndPlace?: (emp: Employee) => void, onOffboard?: (emp: Employee) => void, actionLoadingId: string | null, selection: Set<string>, onToggleSelect: (id: string) => void, onToggleSelectAll: () => void }) => (
  <div className="ui-card overflow-hidden">
    <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
      <table className="w-full min-w-[1000px] text-left">
        <thead className="bg-gray-50">
          <tr>
            <th className="ui-table-head">
              <div className="flex items-center gap-3">
                {tab === 'pending' && (
                  <input
                    type="checkbox"
                    checked={employees.length > 0 && employees.every(e => selection.has(e.employee_id))}
                    onChange={onToggleSelectAll}
                    className="w-4 h-4 accent-theme-800 cursor-pointer"
                  />
                )}
                Name
              </div>
            </th>
            <th className="ui-table-head">Gender</th>
            {tab === 'all' && <th className="ui-table-head">Employee ID</th>}
            <th className="ui-table-head">Phone</th>
            {tab === 'assigned' && <th className="ui-table-head">Assigned</th>}
            {tab === 'all' && <th className="ui-table-head">Join Date</th>}
            {tab === 'all' && <th className="ui-table-head">Department</th>}
            {tab !== 'assigned' && <th className="ui-table-head">Status</th>}
            {tab === 'pending' && <th className="ui-table-head text-center">Approve</th>}
            {tab === 'pending' && <th className="ui-table-head text-center">Reject</th>}
            <th className="ui-table-head text-center">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="p-8" colSpan={tab === 'pending' ? 7 : tab === 'assigned' ? 5 : 8}><Skeleton height={40} className="w-full" /></td>
              </tr>
            ))
          ) : employees.length === 0 ? (
            <tr>
              <td className="p-16 text-center" colSpan={tab === 'pending' ? 7 : tab === 'assigned' ? 5 : 8}>
                <p className="text-sm text-slate-400">No personnel records found</p>
              </td>
            </tr>
          ) : (
            employees.map((emp) => (
              <tr
                key={emp.employee_id}
                onClick={tab === 'assigned' ? undefined : () => onDetailClick(emp)}
                className={`hover:bg-gray-50 transition-colors group ${tab === 'assigned' ? '' : 'cursor-pointer'}`}
              >
                <td className="ui-table-cell">
                  <div className="flex items-center gap-3">
                    {tab === 'pending' ? (
                      <input
                        type="checkbox"
                        checked={selection.has(emp.employee_id)}
                        onChange={() => onToggleSelect(emp.employee_id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 accent-theme-800 cursor-pointer shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-blue-50 text-theme-800 overflow-hidden flex items-center justify-center text-sm font-semibold shrink-0">
                        {emp.image ? (
                          <img src={emp.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          emp.full_name.charAt(0)
                        )}
                      </div>
                    )}
                    <div>
                      <h5 className="text-sm font-semibold text-slate-900 leading-tight">{emp.full_name}</h5>
                      <p className="text-xs text-slate-400">{emp.email}</p>
                    </div>
                  </div>
                </td>
                <td className="ui-table-cell">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${emp.gender === 'male' ? 'bg-blue-50 text-blue-600 border-blue-100' : emp.gender === 'female' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                    {emp.gender || 'N/A'}
                  </span>
                </td>
                {tab === 'all' && (
                  <td className="ui-table-cell">
                    <span className="text-xs font-medium text-theme-800 bg-blue-50 px-2.5 py-1 rounded-lg">
                      {emp.employee_id}
                    </span>
                  </td>
                )}
                <td className="ui-table-cell">{emp.phone}</td>
                {tab === 'assigned' && (
                  <td className="ui-table-cell">
                    <Link
                      href={`/employees/${emp.employee_id}/edit?step=3`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-100 bg-blue-50 text-blue-800 text-xs font-medium hover:bg-blue-100 transition-colors"
                    >
                      Give Placement
                    </Link>
                  </td>
                )}
                {tab === 'all' && (
                  <td className="ui-table-cell">
                    {emp.join_date ? new Date(emp.join_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                  </td>
                )}
                {tab === 'all' && (
                  <td className="ui-table-cell">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getDeptColor(emp.department?.dept_name)}`}>
                      {emp.department?.dept_name || 'General'}
                    </span>
                  </td>
                )}
                {tab !== 'assigned' && (
                  <td className="ui-table-cell">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(emp.assignment_status)}`}>
                      {emp.assignment_status || 'N/A'}
                    </span>
                  </td>
                )}
                {tab === 'pending' && (
                  <td className="ui-table-cell text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); onApprove(emp.employee_id); }}
                      disabled={actionLoadingId === emp.employee_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle size={13} /> Approve
                    </button>
                  </td>
                )}
                {tab === 'pending' && (
                  <td className="ui-table-cell text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); onReject(emp.employee_id); }}
                      disabled={actionLoadingId === emp.employee_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  </td>
                )}
                <td className="ui-table-cell">
                  <ActionMenu emp={emp} onDelete={onDelete} onDetailClick={onDetailClick} onSetCredentials={onSetCredentials} onApproveAndPlace={onApproveAndPlace} onOffboard={onOffboard} tab={tab} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const DetailField = ({
  label,
  value,
  icon: Icon,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  className?: string;
}) => (
  <div className={`bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 hover:border-slate-300 transition-colors ${className}`}>
    <div className="flex items-center gap-1.5 mb-1">
      {Icon && <Icon size={13} className="text-slate-400 shrink-0" />}
      <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</p>
    </div>
    <p className="text-sm font-semibold text-slate-900 break-words">{value || "N/A"}</p>
  </div>
);

const DetailModal = ({
  employee,
  open,
  onClose,
}: {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
}) => {
  const [detailedData, setDetailedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showCard, setShowCard] = useState(false);

  // Accordion sections - all open by default for rich instant visibility
  const [sections, setSections] = useState({
    personal: true,
    contact: true,
    placement: true,
    education: true,
    experience: true,
    bank: true,
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAll = (state: boolean) => {
    setSections({
      personal: state,
      contact: state,
      placement: state,
      education: state,
      experience: state,
      bank: state,
    });
  };

  useEffect(() => {
    if (!open) {
      setShowCard(false);
      setDetailedData(null);
      return;
    }

    if (employee?.employee_id) {
      setLoading(true);
      fetchWithAuth(`/employees/employees/${employee.employee_id}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setDetailedData(data);
          } else {
            setDetailedData(null);
          }
        })
        .catch((err) => {
          console.error("Failed to load employee details", err);
          setDetailedData(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, employee?.employee_id]);

  if (!open || !employee) return null;

  const data = detailedData || employee;
  const fullName = data.full_name || employee.full_name || "Employee Profile";
  const empId = data.employee_id || employee.employee_id;
  const isActive = data.is_active ?? employee.is_active;

  const primaryAssignment = Array.isArray(data.assignments)
    ? data.assignments.find((a: any) => a.is_primary) || data.assignments[0]
    : null;

  const deptName =
    primaryAssignment?.department ||
    data.department?.dept_name ||
    (typeof data.department === "string" ? data.department : "General");
  const desigName =
    primaryAssignment?.designation ||
    data.designation?.position_name ||
    (typeof data.designation === "string" ? data.designation : "Personnel");

  const handlePrint = () => {
    window.print();
  };

  const formatDateStr = (d?: string | null) => {
    if (!d) return "N/A";
    try {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return d;
      return parsed.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[92vh] border border-slate-200/80">
        
        {/* Modal Top Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-md">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 border border-white/20 flex items-center justify-center text-white text-xl font-bold shadow-md shrink-0">
              {fullName ? fullName.charAt(0).toUpperCase() : "E"}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">{fullName}</h2>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded-md bg-white/15 border border-white/20 text-white font-semibold">
                  {empId}
                </span>
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border ${
                    isActive
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                  }`}
                >
                  {isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-xs text-indigo-200 flex items-center gap-2">
                <span>{deptName}</span>
                <span className="opacity-40">•</span>
                <span>{desigName}</span>
                {data.employment_type && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="capitalize">{data.employment_type}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {!showCard ? (
              <button
                type="button"
                onClick={() => setShowCard(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors cursor-pointer"
              >
                <CreditCard size={14} /> View ID Card
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowCard(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors cursor-pointer"
              >
                <UserIcon size={14} /> Back to Profile
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {showCard ? (
          <div className="p-7 flex flex-col items-center w-full overflow-y-auto max-h-[80vh]">
            <IDCard
              employee={{
                ...data,
                full_name: fullName,
                employee_id: empId,
                email: data.personal_email || data.email,
                phone: data.personal_phone || data.phone,
                join_date: formatDateStr(data.join_date || primaryAssignment?.joining_date || data.created_at),
                designation: { position_name: desigName },
                department: { dept_name: deptName },
              }}
            />
            <div className="flex gap-3 w-full max-w-md px-4 mt-6 print:hidden">
              <button
                type="button"
                onClick={() => setShowCard(false)}
                className="btn-secondary flex-1 h-11 cursor-pointer"
              >
                Back to Profile
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary flex-1 h-11 cursor-pointer"
              >
                <Download size={16} /> Print Card
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Quick Contact & Collapse Bar */}
            <div className="bg-slate-50 border-b border-slate-200/80 px-5 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Mail size={13} className="text-slate-400" />
                  {data.personal_email || data.email || "No email"}
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Phone size={13} className="text-slate-400" />
                  {data.personal_phone || data.phone || "No phone"}
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Calendar size={13} className="text-slate-400" />
                  Joined: {formatDateStr(data.join_date || primaryAssignment?.joining_date || data.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleAll(true)}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                >
                  Expand All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => toggleAll(false)}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Scrollable Accordions */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 bg-slate-50/40">
              {loading && !detailedData ? (
                <div className="space-y-4 py-8">
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 size={18} className="animate-spin text-indigo-600" /> Loading full profile details from API...
                  </div>
                  <Skeleton height={80} className="w-full rounded-xl" />
                  <Skeleton height={80} className="w-full rounded-xl" />
                  <Skeleton height={80} className="w-full rounded-xl" />
                </div>
              ) : (
                <>
                  {/* 1. Identity & Personal Details */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => toggleSection("personal")}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                          <UserIcon size={16} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Identity & Demographics</h4>
                          <p className="text-xs text-slate-500">CNIC, age, gender, marital status, religion & nationality</p>
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-slate-400 transition-transform duration-200 ${sections.personal ? "rotate-180" : ""}`}
                      />
                    </button>
                    {sections.personal && (
                      <div className="p-4 pt-1 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <DetailField label="Full Name" value={data.full_name} />
                        <DetailField label="Employee Code" value={data.employee_id} />
                        <DetailField label="CNIC Number" value={data.cnic} />
                        <DetailField label="Date of Birth" value={formatDateStr(data.dob)} />
                        <DetailField label="Gender" value={data.gender_display || data.gender} />
                        <DetailField label="Marital Status" value={data.marital_status_display || data.marital_status} />
                        <DetailField label="Nationality" value={data.nationality || "Pakistani"} />
                        <DetailField label="Religion" value={data.religion || "Islam"} />
                        <DetailField label="Working Sector" value={data.current_working_sector || data.currentWorkingSector} />
                      </div>
                    )}
                  </div>

                  {/* 2. Contact & Address Details */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => toggleSection("contact")}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Contact & Address Details</h4>
                          <p className="text-xs text-slate-500">Emails, telephone numbers, residential & emergency info</p>
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-slate-400 transition-transform duration-200 ${sections.contact ? "rotate-180" : ""}`}
                      />
                    </button>
                    {sections.contact && (
                      <div className="p-4 pt-1 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <DetailField label="Personal Email" value={data.personal_email || data.email} icon={Mail} />
                        <DetailField label="Official Work Email" value={data.org_email || "Not Configured"} icon={Mail} />
                        <DetailField label="Personal Mobile" value={data.personal_phone || data.phone} icon={Phone} />
                        <DetailField label="Official Phone" value={data.org_phone || "N/A"} icon={Phone} />
                        <DetailField label="Emergency Contact Person" value={data.emergency_contact?.name || "N/A"} />
                        <DetailField label="Emergency Phone" value={data.emergency_contact?.phone || "N/A"} />
                        <DetailField label="City / Region" value={data.address?.city || data.location || "N/A"} />
                        <DetailField
                          label="Residential Address"
                          value={data.address?.residential || data.residential_address || "N/A"}
                          className="sm:col-span-2"
                        />
                        <DetailField
                          label="Permanent Address"
                          value={data.address?.permanent || data.permanent_address || "N/A"}
                          className="sm:col-span-3"
                        />
                      </div>
                    )}
                  </div>

                  {/* 3. Organizational Placements */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => toggleSection("placement")}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                          <Building2 size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">Organizational Placements</h4>
                            {Array.isArray(data.assignments) && (
                              <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                                {data.assignments.length} Record(s)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">Institutional posting, branch, department, designation & shifts</p>
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-slate-400 transition-transform duration-200 ${sections.placement ? "rotate-180" : ""}`}
                      />
                    </button>
                    {sections.placement && (
                      <div className="p-4 pt-1 border-t border-slate-100 space-y-3">
                        {Array.isArray(data.assignments) && data.assignments.length > 0 ? (
                          data.assignments.map((asn: any, idx: number) => (
                            <div key={idx} className="rounded-xl border border-slate-200/80 p-3.5 bg-slate-50/70 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                                      asn.is_primary
                                        ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                                        : "bg-slate-200 text-slate-700"
                                    }`}
                                  >
                                    {asn.is_primary ? "Primary Role" : "Secondary Placement"}
                                  </span>
                                  <span className="text-xs text-slate-500 capitalize bg-white px-2 py-0.5 rounded border border-slate-200">
                                    Shift: {asn.shift || "General"}
                                  </span>
                                </div>
                                <span className="text-xs text-slate-500">
                                  Joined: {formatDateStr(asn.joining_date)}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                                <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">Institution</span>
                                  <span className="font-semibold text-slate-800">{asn.institution || "Global"}</span>
                                  {asn.institution_code && <span className="text-[10px] text-slate-400 block">({asn.institution_code})</span>}
                                </div>
                                <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">Branch</span>
                                  <span className="font-semibold text-slate-800">{asn.branch_name || "N/A"}</span>
                                  {asn.branch_code && <span className="text-[10px] text-slate-400 block">({asn.branch_code})</span>}
                                </div>
                                <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">Department</span>
                                  <span className="font-semibold text-slate-800">{asn.department || "General"}</span>
                                  {asn.department_code && <span className="text-[10px] text-slate-400 block">({asn.department_code})</span>}
                                </div>
                                <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">Designation</span>
                                  <span className="font-semibold text-slate-800">{asn.designation || "Personnel"}</span>
                                  {asn.designation_code && <span className="text-[10px] text-slate-400 block">({asn.designation_code})</span>}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <DetailField label="Department" value={deptName} />
                            <DetailField label="Designation" value={desigName} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 4. Education History */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => toggleSection("education")}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                          <GraduationCap size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">Academic & Educational Qualifications</h4>
                            {Array.isArray(data.education_history) && (
                              <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                                {data.education_history.length} Degree(s)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">Degrees, certifications, institutes & graduation years</p>
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-slate-400 transition-transform duration-200 ${sections.education ? "rotate-180" : ""}`}
                      />
                    </button>
                    {sections.education && (
                      <div className="p-4 pt-1 border-t border-slate-100">
                        {Array.isArray(data.education_history) && data.education_history.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {data.education_history.map((edu: any, idx: number) => (
                              <div key={idx} className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-sm font-bold text-slate-900">{edu.degree || "Degree"}</h5>
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100/70 text-amber-800">
                                    {edu.passingYear || "N/A"}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-600">{edu.institute || "Institute / University"}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic py-3 text-center bg-slate-50 rounded-lg">
                            No academic qualification records found for this employee.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 5. Work Experience */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => toggleSection("experience")}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                          <Briefcase size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">Work Experience History</h4>
                            {Array.isArray(data.work_experience) && (
                              <span className="text-[11px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">
                                {data.work_experience.length} Previous Role(s)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">Past employment, titles, durations & responsibilities</p>
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-slate-400 transition-transform duration-200 ${sections.experience ? "rotate-180" : ""}`}
                      />
                    </button>
                    {sections.experience && (
                      <div className="p-4 pt-1 border-t border-slate-100">
                        {Array.isArray(data.work_experience) && data.work_experience.length > 0 ? (
                          <div className="space-y-3">
                            {data.work_experience.map((exp: any, idx: number) => (
                              <div key={idx} className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <h5 className="text-sm font-bold text-slate-900">{exp.jobTitle || "Job Title"}</h5>
                                    <p className="text-xs font-medium text-slate-600">{exp.employer || "Employer"}</p>
                                  </div>
                                  <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                    {exp.startDate} - {exp.endDate || "Present"}
                                  </span>
                                </div>
                                {exp.responsibilities && (
                                  <p className="text-xs text-slate-600 pt-1 border-t border-slate-200/50">
                                    {exp.responsibilities}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic py-3 text-center bg-slate-50 rounded-lg">
                            No prior employment experience records listed.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 6. Banking Details */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => toggleSection("bank")}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                          <Landmark size={16} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Banking & Payroll Credentials</h4>
                          <p className="text-xs text-slate-500">Designated disbursement bank and account details</p>
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-slate-400 transition-transform duration-200 ${sections.bank ? "rotate-180" : ""}`}
                      />
                    </button>
                    {sections.bank && (
                      <div className="p-4 pt-1 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <DetailField label="Bank Name" value={data.bank_info?.bank_name || data.bank_name || "N/A"} icon={Landmark} />
                        <DetailField label="Account / IBAN Number" value={data.bank_info?.account_number || data.account_number || "N/A"} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default function EmployeesPage() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const isSuperadmin = !!user?.is_superadmin;
  const canCreate = isSuperadmin || hasPermission("employee.create");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('All');
  const [genderFilter, setGenderFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [entriesPerPage, setEntriesPerPage] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [regTab, setRegTab] = useState<'all' | 'assigned' | 'pending'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [credModal, setCredModal] = useState<{ id: string; name: string; code: string } | null>(null);
  const [offboardModal, setOffboardModal] = useState<{ id: string; name: string } | null>(null);

  const [tabCounts, setTabCounts] = useState<{ all: number; assigned: number; pending: number }>({
    all: 0,
    assigned: 0,
    pending: 0,
  });
  const [seenPendingCount, setSeenPendingCount] = useState<number>(0);
  const [seenAssignedCount, setSeenAssignedCount] = useState<number>(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSeenPendingCount(parseInt(localStorage.getItem('seen_pending_tab_count') || '0', 10));
      setSeenAssignedCount(parseInt(localStorage.getItem('seen_assigned_tab_count') || '0', 10));
    }
  }, []);

  const departmentsList = React.useMemo(() => {
    if (!Array.isArray(employees)) return [];
    const depts = employees.map(e => e.department?.dept_name).filter(Boolean) as string[];
    return Array.from(new Set(depts));
  }, [employees]);

  async function loadData(targetTab: 'all' | 'assigned' | 'pending' = regTab) {
    try {
      setLoading(true);
      const statusParam = targetTab === 'pending' ? 'pending' : targetTab === 'assigned' ? 'unassigned' : 'active';
      
      const [listRes, allRes, assignedRes, pendingRes] = await Promise.all([
        fetchWithAuth(`/employees/employees?per_page=0&status=${statusParam}`),
        fetchWithAuth(`/employees/employees?per_page=1&status=active`),
        fetchWithAuth(`/employees/employees?per_page=1&status=unassigned`),
        fetchWithAuth(`/employees/employees?per_page=1&status=pending`),
      ]);

      if (listRes.status === 403) { setForbidden(true); return; }

      if (listRes.ok) {
        const data = await listRes.json();
        const employeeArray = Array.isArray(data) ? data : (data.employees || []);
        setEmployees(employeeArray);
      }

      const allData = allRes.ok ? await allRes.json() : null;
      const assignedData = assignedRes.ok ? await assignedRes.json() : null;
      const pendingData = pendingRes.ok ? await pendingRes.json() : null;

      const counts = {
        all: allData?.total ?? 0,
        assigned: assignedData?.total ?? 0,
        pending: pendingData?.total ?? 0,
      };

      setTabCounts(counts);

      if (targetTab === 'pending' && counts.pending > 0) {
        localStorage.setItem('seen_pending_tab_count', String(counts.pending));
        setSeenPendingCount(counts.pending);
      } else if (targetTab === 'assigned' && counts.assigned > 0) {
        localStorage.setItem('seen_assigned_tab_count', String(counts.assigned));
        setSeenAssignedCount(counts.assigned);
      }
    } catch (err) {
      console.error("Failed to load employees:", err);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(regTab); }, [regTab]);

  const filtered = Array.isArray(employees) ? employees.filter(e => {
    const matchesSearch = (e.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.employee_id || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || (statusFilter === 'Active' ? e.is_active : !e.is_active);
    const matchesEmploymentType = employmentTypeFilter === 'All' || (e.employment_type === employmentTypeFilter);
    const matchesGender = genderFilter === 'All' || (e.gender === genderFilter.toLowerCase());
    const matchesDepartment = departmentFilter === 'All' || (e.department?.dept_name === departmentFilter);
    return matchesSearch && matchesStatus && matchesEmploymentType && matchesGender && matchesDepartment;
  }) : [];

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to archive this employee? The record will be preserved and can be restored by an admin.")) return;

    try {
      const res = await fetchWithAuth(`/employees/employees/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setEmployees(employees.filter(emp => emp.employee_id !== id));
        toast.success("Employee deleted successfully");
      } else {
        const error = await res.json();
        toast.error(`Failed to delete employee: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete employee. Please try again.");
    }
  }

  async function handleApprove(id: string) {
    setActionLoadingId(id);
    try {
      const res = await fetchWithAuth(`/employees/employees/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        toast.success("Employee approved");
        loadData();
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || "Failed to approve employee");
      }
    } catch (err) {
      console.error("Approve failed:", err);
      toast.error("Failed to approve employee. Please try again.");
    } finally {
      setActionLoadingId(null);
    }
  }

  // One-click shortcut for the Pending tab: approve the request AND jump
  // straight into the organization/placement form (edit page, step 3) — no
  // manual tab switch to "Assigned" needed. Only navigates once the approve
  // call has actually succeeded, so we never show a placement form for an
  // employee the backend still considers not-yet-active.
  async function handleApproveAndPlace(emp: Employee) {
    setActionLoadingId(emp.employee_id);
    try {
      const res = await fetchWithAuth(`/employees/employees/${emp.employee_id}/approve`, { method: 'POST' });
      if (res.ok) {
        toast.success("Employee approved");
        router.push(`/employees/${emp.employee_id}/edit?step=3`);
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || "Failed to approve employee");
      }
    } catch (err) {
      console.error("Approve & place failed:", err);
      toast.error("Failed to approve employee. Please try again.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReject(id: string) {
    setActionLoadingId(id);
    try {
      const res = await fetchWithAuth(`/employees/employees/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rejected by admin' }),
      });
      if (res.ok) {
        toast.success("Employee rejected");
        loadData();
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || "Failed to reject employee");
      }
    } catch (err) {
      console.error("Reject failed:", err);
      toast.error("Failed to reject employee. Please try again.");
    } finally {
      setActionLoadingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const visibleIds = filtered.map(e => e.employee_id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  }

  async function handleBulkApprove() {
    const ids = Array.from(selectedIds);
    if (!ids.length || !window.confirm(`Approve ${ids.length} employee(s)?`)) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map(id => fetchWithAuth(`/employees/employees/${id}/approve`, { method: 'POST' }))
      );
      const ok = results.filter(r => r.status === 'fulfilled' && (r.value as Response).ok).length;
      if (ok > 0) toast.success(`${ok} employee(s) approved`);
      if (ok < ids.length) toast.error(`${ids.length - ok} failed to approve`);
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      console.error("Bulk approve failed:", err);
      toast.error("Bulk approve failed. Please try again.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkReject() {
    const ids = Array.from(selectedIds);
    if (!ids.length || !window.confirm(`Reject ${ids.length} employee(s)?`)) return;
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map(id => fetchWithAuth(`/employees/employees/${id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Rejected by admin' }),
        }))
      );
      const ok = results.filter(r => r.status === 'fulfilled' && (r.value as Response).ok).length;
      if (ok > 0) toast.success(`${ok} employee(s) rejected`);
      if (ok < ids.length) toast.error(`${ids.length - ok} failed to reject`);
      setSelectedIds(new Set());
      loadData();
    } catch (err) {
      console.error("Bulk reject failed:", err);
      toast.error("Bulk reject failed. Please try again.");
    } finally {
      setBulkLoading(false);
    }
  }

  const stats = {
    total: tabCounts.all > 0 ? tabCounts.all : (Array.isArray(employees) ? employees.length : 0),
    new: Array.isArray(employees) ? employees.filter(e => (new Date().getTime() - new Date(e.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000).length : 0,
    male: Array.isArray(employees) ? employees.filter(e => (e.gender || '').toLowerCase() === 'male').length : 0,
    female: Array.isArray(employees) ? employees.filter(e => (e.gender || '').toLowerCase() === 'female').length : 0,
  };
  if (forbidden) return <ProtectedLayout><AccessDenied permission="employee.view" /></ProtectedLayout>;

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Employees</h1>
            <p className="page-subtitle">Manage your workforce and personnel records.</p>
          </div>

          {canCreate && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/employees/new" className="btn-primary">
                <Plus size={16} /> Add Employee
              </Link>
              <Link href="/employees/bulk-upload" className="btn-secondary">
                <Upload size={16} /> Bulk Upload
              </Link>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <button onClick={() => { setStatusFilter('All'); setGenderFilter('All'); setEmploymentTypeFilter('All'); }} className="text-left">
            <StatsCard title="Total Employees" count={stats.total} icon={Users} color="text-purple-600" bgColor="bg-purple-50" loading={loading} />
          </button>
          <StatsCard title="New Employees" count={stats.new} icon={UserPlus} color="text-amber-600" bgColor="bg-amber-50" loading={loading} />
          <button onClick={() => setGenderFilter('Male')} className="text-left">
            <StatsCard title="Male" count={stats.male} icon={UserIcon} color="text-blue-600" bgColor="bg-blue-50" loading={loading} />
          </button>
          <button onClick={() => setGenderFilter('Female')} className="text-left">
            <StatsCard title="Female" count={stats.female} icon={UserIcon} color="text-emerald-600" bgColor="bg-emerald-50" loading={loading} />
          </button>
        </div>

        {/* Filter Section */}
        <div className="ui-card p-5 space-y-4 bg-white/90 border border-slate-200/80 shadow-sm backdrop-blur-md rounded-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <SlidersHorizontal size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Filter Employees</h3>
                <p className="text-xs text-slate-500">Refine workforce records by department, status, gender, or search query</p>
              </div>
            </div>

            {((search !== '') || statusFilter !== 'All' || genderFilter !== 'All' || employmentTypeFilter !== 'All' || departmentFilter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('All');
                  setGenderFilter('All');
                  setEmploymentTypeFilter('All');
                  setDepartmentFilter('All');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <X size={13} /> Reset Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="form-label text-xs font-semibold text-slate-600 mb-1">Search Employee</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Name or Code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="form-input pl-9 pr-8 text-xs h-10"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="form-label text-xs font-semibold text-slate-600 mb-1">Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="form-input text-xs h-10"
              >
                <option value="All">All Departments</option>
                {departmentsList.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label text-xs font-semibold text-slate-600 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="form-input text-xs h-10"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
            </div>

            <div>
              <label className="form-label text-xs font-semibold text-slate-600 mb-1">Gender</label>
              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className="form-input text-xs h-10"
              >
                <option value="All">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div>
              <label className="form-label text-xs font-semibold text-slate-600 mb-1">Employment Type</label>
              <select
                value={employmentTypeFilter}
                onChange={(e) => setEmploymentTypeFilter(e.target.value)}
                className="form-input text-xs h-10"
              >
                <option value="All">All Types</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="probation">Probation</option>
              </select>
            </div>
          </div>
        </div>

        {/* Registration Tabs (Pending / Assigned / Employees) */}
        <div className="flex gap-1 sm:gap-1.5 bg-slate-100 rounded-xl p-1.5">
          {([
            { key: 'pending', label: 'Pending', icon: Clock },
            { key: 'assigned', label: 'Assigned', icon: UserCheck },
            { key: 'all', label: 'Employees', icon: Users },
          ] as const).map((tab) => {
            const isActive = regTab === tab.key;
            const Icon = tab.icon;
            const count = tabCounts[tab.key];
            const showPulse =
              tab.key === 'pending'
                ? count > 0 && count > seenPendingCount
                : tab.key === 'assigned'
                ? count > 0 && count > seenAssignedCount
                : false;

            return (
              <button
                key={tab.key}
                onClick={() => {
                  setRegTab(tab.key);
                  setSelectedIds(new Set());
                  if (tab.key === 'pending') {
                    localStorage.setItem('seen_pending_tab_count', String(count));
                    setSeenPendingCount(count);
                  } else if (tab.key === 'assigned') {
                    localStorage.setItem('seen_assigned_tab_count', String(count));
                    setSeenAssignedCount(count);
                  }
                }}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm transition-colors relative ${
                  isActive
                    ? 'bg-white font-semibold text-slate-900 shadow-sm'
                    : 'bg-transparent font-medium text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="hidden sm:inline truncate">{tab.label}</span>
                <span
                  className={`inline-flex items-center justify-center min-w-6 h-[22px] px-1.5 rounded-full text-xs font-semibold shrink-0 ${
                    isActive
                      ? tab.key === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : tab.key === 'assigned'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-200/70 text-slate-500'
                  }`}
                >
                  {loading && count === 0 ? '...' : count}
                </span>
                {showPulse && (
                  <span className="relative flex h-2.5 w-2.5 shrink-0 -mt-2 -mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bulk Actions Bar (Pending tab) */}
        {regTab === 'pending' && selectedIds.size > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ui-card px-5 py-3">
            <span className="text-sm font-medium text-slate-500">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkApprove}
                disabled={bulkLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle size={13} /> Approve All
              </button>
              <button
                onClick={handleBulkReject}
                disabled={bulkLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-600 text-xs font-medium hover:bg-rose-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle size={13} /> Reject All
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* View Content */}
        {viewMode === 'list' ? (
          <EmployeeTable
            employees={filtered.slice(0, entriesPerPage === 'All' ? filtered.length : parseInt(entriesPerPage))}
            loading={loading}
            tab={regTab}
            onApprove={handleApprove}
            onApproveAndPlace={handleApproveAndPlace}
            onReject={handleReject}
            onSetCredentials={(emp) => setCredModal({ id: emp.employee_id, name: emp.full_name, code: emp.employee_id })}
            onOffboard={(emp) => setOffboardModal({ id: emp.employee_id, name: emp.full_name })}
            actionLoadingId={actionLoadingId}
            selection={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onDetailClick={(emp) => {
              setSelectedEmployee(emp);
              setIsModalOpen(true);
            }}
            onDelete={handleDelete}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {loading ? (
              [...Array(entriesPerPage === 'All' ? 10 : parseInt(entriesPerPage))].map((_, i) => (
                <div key={i} className="ui-card p-6 h-72">
                  <Skeleton className="h-14 w-14 rounded-full mx-auto" />
                  <Skeleton className="h-4 w-3/4 mx-auto mt-5" />
                  <Skeleton className="h-3 w-1/2 mx-auto mt-2" />
                  <div className="flex gap-2 mt-8">
                    <Skeleton className="h-10 flex-1 rounded-lg" />
                    <Skeleton className="h-10 flex-1 rounded-lg" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="col-span-full py-16 text-center ui-card">
                <p className="text-sm text-slate-400">No personnel records found</p>
              </div>
            ) : (
              filtered.slice(0, entriesPerPage === 'All' ? filtered.length : parseInt(entriesPerPage)).map((emp) => (
                <EmployeeCard
                  key={emp.employee_id}
                  employee={emp}
                  onClick={() => {
                    setSelectedEmployee(emp);
                    setIsModalOpen(true);
                  }}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        )}

      </div>

      <DetailModal
        employee={selectedEmployee}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <SetCredentialsModal
        employeeId={credModal?.id || ""}
        employeeName={credModal?.name || ""}
        employeeCode={credModal?.code || ""}
        open={!!credModal}
        onClose={() => setCredModal(null)}
        onSuccess={loadData}
      />

      <OffboardModal
        employeeId={offboardModal?.id || ""}
        employeeName={offboardModal?.name || ""}
        open={!!offboardModal}
        onClose={() => setOffboardModal(null)}
        onSuccess={loadData}
      />

    </ProtectedLayout>
  );
}

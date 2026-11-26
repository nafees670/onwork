"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import AccessDenied from "@/components/AccessDenied";
import { Plus, Search, Edit2, Trash2, X, Briefcase, CheckCircle2, XCircle, Filter, LayoutGrid, Loader2 } from "lucide-react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { generatePositionCode, generateDepartmentCode } from "@/utils/codeGen";

type Designation = {
  id: string;
  position_code: string;
  position_name: string;
  department_id?: string;
  department__dept_code?: string;
  department_code?: string;
  description?: string;
};

type Department = { id: string; dept_code: string; dept_name: string; branch_code?: string; institution_code?: string; organization_code?: string };
type Organization = { id: string; org_code: string; name: string };
type Branch = { branch_code: string; branch_name: string; institution_code?: string; organization_code?: string };
type Institution = { id: string; inst_code: string; name: string; organization_code?: string };

const desigSchema = z.object({
  position_name: z.string().trim().min(2, "Name must be at least 2 characters"),
  position_code: z.string().trim().min(1, "Code is required").max(20, "Code too long"),
  description: z.string().trim().optional().or(z.literal("")),
  dept_mode: z.enum(["new", "existing"]).default("new"),
  department_ids: z.array(z.string()).default([]),
  target_dept_code: z.string().trim().optional().or(z.literal("")),
  target_dept_name: z.string().trim().optional().or(z.literal("")),
  branch_codes: z.array(z.string()).default([]),
  institution_codes: z.array(z.string()).default([]),
}).superRefine((data, ctx) => {
  if (data.dept_mode === "existing") {
    if (!data.department_ids || data.department_ids.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one department", path: ["department_ids"] });
    }
  } else {
    if (!data.target_dept_code || data.target_dept_code.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Department code is required", path: ["target_dept_code"] });
    }
    if (!data.target_dept_name || data.target_dept_name.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Department name is required", path: ["target_dept_name"] });
    }
    const locCount = (data.branch_codes?.length || 0) + (data.institution_codes?.length || 0);
    if (locCount === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one location", path: ["branch_codes"] });
    }
  }
});
type DesigInput = z.input<typeof desigSchema>;
type DesigOutput = z.output<typeof desigSchema>;

function RowSkeleton() {
  return <div className="animate-pulse bg-slate-100 rounded h-4 w-full" />;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-rose-500 mt-1">{msg}</p>;
}

type SaveResult = { ok: boolean; fieldErrors?: Record<string, string>; error?: string };

function DesignationModal({
  open, onClose, onSave, initial, organizations, institutions, branches, departments,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (d: DesigOutput) => Promise<SaveResult>;
  initial?: Designation | null;
  organizations: Organization[];
  institutions: Institution[];
  branches: Branch[];
  departments: Department[];
}) {
  const {
    register, handleSubmit, reset, setError, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<DesigInput, any, DesigOutput>({
    resolver: zodResolver(desigSchema),
    defaultValues: {
      position_name: "", position_code: "", description: "",
      dept_mode: "existing", department_ids: [],
      target_dept_code: "", target_dept_name: "",
      branch_codes: [], institution_codes: [],
    },
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    reset(initial ? {
      position_name: initial.position_name || "",
      position_code: initial.position_code || "",
      department_ids: initial.department_id ? [initial.department_id] : [],
      description: initial.description || "",
      dept_mode: "existing",
      target_dept_code: "", target_dept_name: "",
      branch_codes: [], institution_codes: [],
    } : {
      position_name: "", position_code: "", description: "",
      dept_mode: "existing", department_ids: [],
      target_dept_code: "", target_dept_name: "",
      branch_codes: [], institution_codes: [],
    });
  }, [initial, open, reset]);

  const selectedIds = (watch("department_ids") as string[]) || [];

  const checklist = React.useMemo(() => {
    return organizations.map(org => {
      const instNodes = institutions
        .filter(i => i.organization_code === org.org_code)
        .map(inst => {
          const branchNodes = branches
            .filter(b => b.institution_code === inst.inst_code)
            .map(br => ({
              branch: br,
              depts: departments.filter(d => d.branch_code === br.branch_code),
            }));
          const localDepts = departments.filter(d => d.institution_code === inst.inst_code && !d.branch_code);
          const allIds = [
            ...branchNodes.flatMap(b => b.depts.map(d => d.id)),
            ...localDepts.map(d => d.id),
          ];
          return { inst, branches: branchNodes, localDepts, allIds };
        });
      const globalDepts = departments.filter(d => d.organization_code === org.org_code && !d.institution_code && !d.branch_code);
      return {
        org,
        institutions: instNodes,
        globalDepts,
        allIds: [...instNodes.flatMap(i => i.allIds), ...globalDepts.map(d => d.id)],
      };
    }).filter(o => o.institutions.length || o.globalDepts.length);
  }, [organizations, institutions, branches, departments]);

  const deptMode = (watch("dept_mode") as "new" | "existing") || "new";
  const nameVal = watch("position_name");
  const targetDeptName = watch("target_dept_name");
  const selectedBranches = (watch("branch_codes") as string[]) || [];
  const selectedInstitutions = (watch("institution_codes") as string[]) || [];

  // Code is auto-derived from the position title -- never typed by hand.
  // Existing designations keep their original code (never regenerated on edit).
  useEffect(() => {
    if (!open || initial) return;
    setValue("position_code", generatePositionCode(nameVal || ""));
  }, [nameVal, open, initial, setValue]);

  useEffect(() => {
    if (!open || initial || deptMode !== "new") return;
    setValue("target_dept_code", generateDepartmentCode(targetDeptName || ""));
  }, [targetDeptName, deptMode, open, initial, setValue]);

  const locationTree = React.useMemo(() => {
    return organizations.map(org => {
      const instNodes = institutions
        .filter(i => i.organization_code === org.org_code)
        .map(inst => {
          const branchNodes = branches
            .filter(b => b.institution_code === inst.inst_code)
            .map(br => ({ branch: br }));
          return { inst, branches: branchNodes };
        });
      return { org, institutions: instNodes };
    }).filter(o => o.institutions.length > 0);
  }, [organizations, institutions, branches]);

  const allBranchesSelected = (codes: string[]) => codes.length > 0 && codes.every(c => selectedBranches.includes(c));

  const toggleBranch = (code: string) => {
    const next = selectedBranches.includes(code)
      ? selectedBranches.filter(c => c !== code)
      : [...selectedBranches, code];
    setValue("branch_codes", next, { shouldValidate: true });
  };

  const toggleInstitution = (code: string) => {
    const next = selectedInstitutions.includes(code)
      ? selectedInstitutions.filter(c => c !== code)
      : [...selectedInstitutions, code];
    setValue("institution_codes", next, { shouldValidate: true });
  };

  const allSelected = (ids: string[]) => ids.length > 0 && ids.every(id => selectedIds.includes(id));
  const someSelected = (ids: string[]) => ids.some(id => selectedIds.includes(id));

  const toggleDept = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id];
    setValue("department_ids", next, { shouldValidate: true });
  };

  const toggleMany = (ids: string[]) => {
    const next = allSelected(ids)
      ? selectedIds.filter(x => !ids.includes(x))
      : Array.from(new Set([...selectedIds, ...ids]));
    setValue("department_ids", next, { shouldValidate: true });
  };

  const submit: SubmitHandler<DesigOutput> = async (data) => {
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

  const checkbox = (checked: boolean, onChange: () => void) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={e => e.stopPropagation()}
      className="h-4 w-4 rounded border-slate-300 text-theme-800 focus:ring-theme-800/40 accent-theme-800"
    />
  );
  // Early return must stay below every hook — useMemos above run on closed-modal
  // renders too, and returning early skips them, crashing React on reopen.
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <form onSubmit={handleSubmit(submit)} className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col border border-gray-100">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{initial ? "Edit Designation" : "Add Designation"}</h2>
            <p className="text-sm text-slate-400 mt-0.5">{initial ? "Update this designation role." : "Select the campuses / departments where this role applies."}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        {submitError && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm font-medium text-red-600">
            {submitError}
          </div>
        )}

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="form-label">Position / Title <span className="text-rose-500 ml-0.5">*</span></label>
            <input type="text" placeholder="e.g. Senior Surgeon, Head Teacher" {...register("position_name")} className="form-input" />
            <FieldError msg={errors.position_name?.message} />
            {watch("position_code") && (
              <p className="text-xs text-slate-400 mt-1.5 ml-1">
                Code: <span className="font-mono font-semibold text-slate-600">{watch("position_code")}</span> (auto-generated)
              </p>
            )}
          </div>

          {/* Mode Toggle — only for create */}
          {!initial && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setValue("dept_mode", "new", { shouldValidate: false })}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${deptMode === "new" ? "bg-theme-800 text-white border-theme-800" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                New Department
              </button>
              <button type="button" onClick={() => setValue("dept_mode", "existing", { shouldValidate: false })}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${deptMode === "existing" ? "bg-theme-800 text-white border-theme-800" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                Existing Department
              </button>
            </div>
          )}

          {/* ─── NEW MODE: dept name/code + location tree ─── */}
          {!initial && deptMode === "new" && (
            <>
              <div>
                <label className="form-label">Department Name <span className="text-rose-500 ml-0.5">*</span></label>
                <input type="text" placeholder="e.g. Information Technology" {...register("target_dept_name")} className="form-input" />
                <FieldError msg={errors.target_dept_name?.message} />
                {watch("target_dept_code") && (
                  <p className="text-xs text-slate-400 mt-1.5 ml-1">
                    Dept Code: <span className="font-mono font-semibold text-slate-600">{watch("target_dept_code")}</span> (auto-generated)
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="form-label mb-0">Apply To Locations</label>
                  <span className={`text-xs font-medium ${(selectedBranches.length + selectedInstitutions.length) ? "text-theme-800" : "text-slate-400"}`}>
                    {selectedBranches.length + selectedInstitutions.length} selected
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {locationTree.length === 0 && (
                    <div className="p-6 text-center text-sm text-slate-400">No locations available</div>
                  )}
                  {locationTree.map(({ org, institutions: instNodes }) => (
                    <div key={org.org_code}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 select-none">
                        <span className="text-xs font-semibold text-slate-700">
                          {org.name} ({org.org_code})
                        </span>
                      </div>
                      {instNodes.map(({ inst, branches: branchNodes }) => (
                        <div key={inst.inst_code}>
                          <div className="flex items-center gap-2 pl-6 pr-3 py-2 cursor-pointer select-none hover:bg-slate-50"
                            onClick={() => toggleInstitution(inst.inst_code)}>
                            {checkbox(selectedInstitutions.includes(inst.inst_code), () => toggleInstitution(inst.inst_code))}
                            <span className={`text-xs ${selectedInstitutions.includes(inst.inst_code) ? "text-theme-800 font-semibold" : "text-slate-500"}`}>
                              {inst.name} ({inst.inst_code})
                            </span>
                          </div>
                          {branchNodes.map(({ branch }) => (
                            <div key={branch.branch_code} className="flex items-center gap-2 pl-12 pr-3 py-1.5 cursor-pointer select-none hover:bg-blue-50"
                              onClick={() => toggleBranch(branch.branch_code)}>
                              {checkbox(selectedBranches.includes(branch.branch_code), () => toggleBranch(branch.branch_code))}
                              <span className={`text-xs ${selectedBranches.includes(branch.branch_code) ? "text-theme-800 font-semibold" : "text-slate-500"}`}>
                                {branch.branch_name} ({branch.branch_code})
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <FieldError msg={errors.branch_codes?.message} />
              </div>
            </>
          )}

          {/* ─── EXISTING MODE: department checkbox tree ─── */}
          {!initial && deptMode === "existing" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="form-label mb-0">Select Departments</label>
                <span className={`text-xs font-medium ${selectedIds.length ? "text-theme-800" : "text-slate-400"}`}>
                  {selectedIds.length} selected
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {checklist.length === 0 && (
                  <div className="p-6 text-center text-sm text-slate-400">No departments available</div>
                )}
                {checklist.map(({ org, institutions, globalDepts, allIds }) => (
                  <div key={org.org_code}>
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer select-none hover:bg-slate-100" onClick={() => toggleMany(allIds)}>
                      {checkbox(allSelected(allIds), () => toggleMany(allIds))}
                      <span className={`text-xs ${someSelected(allIds) ? "text-theme-800 font-semibold" : "text-slate-700 font-medium"}`}>
                        {org.name} ({org.org_code})
                      </span>
                    </div>
                    {institutions.map(({ inst, branches: brNodes, localDepts, allIds: instIds }) => (
                      <div key={inst.inst_code}>
                        <div className="flex items-center gap-2 pl-6 pr-3 py-2 cursor-pointer select-none hover:bg-slate-50" onClick={() => toggleMany(instIds)}>
                          {checkbox(allSelected(instIds), () => toggleMany(instIds))}
                          <span className={`text-xs ${someSelected(instIds) ? "text-theme-800 font-semibold" : "text-slate-500"}`}>
                            {inst.name} ({inst.inst_code})
                          </span>
                        </div>
                        {localDepts.map(dept => (
                          <div key={dept.id} className="flex items-center gap-2 pl-12 pr-3 py-1.5 cursor-pointer select-none hover:bg-blue-50" onClick={() => toggleDept(dept.id)}>
                            {checkbox(selectedIds.includes(dept.id), () => toggleDept(dept.id))}
                            <span className={`text-xs ${selectedIds.includes(dept.id) ? "text-theme-800 font-semibold" : "text-slate-500"}`}>
                              {dept.dept_name} [{dept.dept_code}]
                            </span>
                          </div>
                        ))}
                        {brNodes.map(({ branch, depts }) => (
                          <div key={branch.branch_code}>
                            <div className="flex items-center gap-2 pl-10 pr-3 py-1.5 cursor-pointer select-none hover:bg-slate-50" onClick={() => toggleMany(depts.map(d => d.id))}>
                              {checkbox(allSelected(depts.map(d => d.id)), () => toggleMany(depts.map(d => d.id)))}
                              <span className={`text-xs ${someSelected(depts.map(d => d.id)) ? "text-theme-800 font-semibold" : "text-slate-500"}`}>
                                {branch.branch_name} ({branch.branch_code})
                              </span>
                            </div>
                            {depts.map(dept => (
                              <div key={dept.id} className="flex items-center gap-2 pl-14 pr-3 py-1.5 cursor-pointer select-none hover:bg-blue-50" onClick={() => toggleDept(dept.id)}>
                                {checkbox(selectedIds.includes(dept.id), () => toggleDept(dept.id))}
                                <span className={`text-xs ${selectedIds.includes(dept.id) ? "text-theme-800 font-semibold" : "text-slate-500"}`}>
                                  {dept.dept_name} [{dept.dept_code}]
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                    {globalDepts.map(dept => (
                      <div key={dept.id} className="flex items-center gap-2 pl-6 pr-3 py-1.5 cursor-pointer select-none hover:bg-blue-50" onClick={() => toggleDept(dept.id)}>
                        {checkbox(selectedIds.includes(dept.id), () => toggleDept(dept.id))}
                        <span className={`text-xs ${selectedIds.includes(dept.id) ? "text-theme-800 font-semibold" : "text-slate-500"}`}>
                          {dept.dept_name} [{dept.dept_code}]
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <FieldError msg={errors.department_ids?.message} />
            </div>
          )}

          {/* Edit mode: reference department (read-only) */}
          {initial && (
            <div>
              <label className="form-label">Department</label>
              <div className="h-11 flex items-center px-3 text-sm text-slate-500 bg-slate-100 border border-slate-200 rounded-lg truncate">
                {departments.find(d => d.id === initial?.department_id)?.dept_name || "Unassigned"}
              </div>
            </div>
          )}

          <div>
            <label className="form-label">Description</label>
            <textarea rows={3} placeholder="Outline key responsibilities..." {...register("description")} className="form-input h-auto py-2.5 resize-none" />
            <FieldError msg={errors.description?.message} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : initial ? "Save Changes" : "Add Designation"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function DesignationsPage() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Designation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const [desigRes, deptRes, orgRes, brRes, instRes] = await Promise.all([
        fetchWithAuth("/employees/designations"),
        fetchWithAuth("/employees/departments"),
        fetchWithAuth("/employees/organizations"),
        fetchWithAuth("/employees/branches"),
        fetchWithAuth("/employees/institutions"),
      ]);
      if (desigRes.status === 403 || deptRes.status === 403 || orgRes.status === 403 || brRes.status === 403 || instRes.status === 403) { setForbidden(true); return; }
      if (desigRes.ok) {
        const data = await desigRes.json();
        setDesignations(Array.isArray(data) ? data : data.designations || []);
      }
      if (deptRes.ok) {
        const data = await deptRes.json();
        setDepartments(Array.isArray(data) ? data : data.departments || []);
      }
      if (orgRes.ok) {
        const data = await orgRes.json();
        setOrganizations(Array.isArray(data) ? data : data.organizations || []);
      }
      if (brRes.ok) {
        const data = await brRes.json();
        setBranches(Array.isArray(data) ? data : data.branches || []);
      }
      if (instRes.ok) {
        const data = await instRes.json();
        setInstitutions(Array.isArray(data) ? data : data.institutions || []);
      }
    } catch (err) {
      console.error("Failed to load designations:", err);
      setDesignations([]);
      setDepartments([]);
      setOrganizations([]);
      setBranches([]);
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = designations.filter(d =>
    (d.position_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.position_code || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.department__dept_code || d.department_code || "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = [
    { label: "Total Designations", value: designations.length, icon: Briefcase },
    { label: "Active", value: designations.length, icon: CheckCircle2 },
    { label: "Distinct Departments", value: new Set(designations.map(d => d.department__dept_code || d.department_code)).size, icon: Filter },
    { label: "Total Departments", value: departments.length, icon: LayoutGrid },
  ];

  async function handleSave(data: DesigOutput): Promise<SaveResult> {
    let payload: Record<string, any>;
    if (editTarget) {
      payload = {
        position_name: data.position_name.trim(),
        description: data.description?.trim() || null,
      };
    } else if (data.dept_mode === "new") {
      payload = {
        position_code: data.position_code.trim(),
        position_name: data.position_name.trim(),
        description: data.description?.trim() || null,
        target_dept_code: data.target_dept_code?.trim(),
        target_dept_name: data.target_dept_name?.trim(),
        branch_codes: data.branch_codes || [],
        institution_codes: data.institution_codes || [],
      };
    } else {
      payload = {
        department_ids: data.department_ids,
        position_code: data.position_code.trim(),
        position_name: data.position_name.trim(),
        description: data.description?.trim() || null,
      };
    }
    const url = editTarget
      ? `/employees/designations/${editTarget.id}`
      : "/employees/designations";
    const method = editTarget ? "PUT" : "POST";
    try {
      const res = await fetchWithAuth(url, { method, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        loadData();
        setEditTarget(null);
        const msg = !editTarget && typeof body?.message === "string" && body.message ? body.message : (editTarget ? "Designation updated" : "Designation added");
        toast.success(msg);
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
      const res = await fetchWithAuth(`/employees/designations/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadData();
        toast.success("Designation deleted");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || "Failed to delete designation");
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleteBusy(false);
      setDeleteId(null);
    }
  }

  if (forbidden) return <ProtectedLayout><AccessDenied permission="designation.view" /></ProtectedLayout>;

  return (
    <ProtectedLayout>
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center border border-gray-100">
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4 text-rose-500">
              <Trash2 size={20} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Delete designation?</h3>
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

      <DesignationModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSave={handleSave}
        initial={editTarget}
        organizations={organizations}
        institutions={institutions}
        branches={branches}
        departments={departments}
      />

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Designations</h1>
            <p className="page-subtitle">Professional roles across your organization</p>
          </div>
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="btn-primary"
          >
            <Plus size={16} /> Add Designation
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="ui-card p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">{s.label}</p>
                {loading ? <div className="animate-pulse bg-slate-100 rounded h-7 w-12" /> : (
                  <h3 className="text-2xl font-bold text-gray-900">{s.value}</h3>
                )}
              </div>
              <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-50 text-theme-800">
                <s.icon size={18} />
              </div>
            </div>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, code, or department..."
            className="form-input pl-10 max-w-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="ui-table-head">Position</th>
                  <th className="ui-table-head">Code</th>
                  <th className="ui-table-head">Department</th>
                  <th className="ui-table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  [1, 2, 3, 4].map(i => (
                    <tr key={i}><td colSpan={4} className="px-5 py-4"><RowSkeleton /></td></tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-16 text-center text-sm text-slate-400">
                      No designations found.
                    </td>
                  </tr>
                ) : (
                  filtered.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="ui-table-cell">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-blue-50 text-theme-800 flex items-center justify-center shrink-0 font-semibold text-sm">
                            {d.position_name?.charAt(0)}
                          </div>
                          <p className="font-semibold text-slate-800">{d.position_name}</p>
                        </div>
                      </td>
                      <td className="ui-table-cell">
                        <span className="text-xs font-medium text-theme-800 bg-blue-50 px-2.5 py-1 rounded-full">
                          {d.position_code}
                        </span>
                      </td>
                      <td className="ui-table-cell">
                        {departments.find(dept => dept.id === d.department_id)?.dept_name || "Unassigned"}
                      </td>
                      <td className="ui-table-cell text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => { setEditTarget(d); setModalOpen(true); }}
                            className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteId(d.id)}
                            className="h-8 w-8 flex items-center justify-center text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}

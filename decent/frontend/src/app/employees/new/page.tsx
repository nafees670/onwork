"use client";

import { Fragment, useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Check, ChevronRight, ChevronLeft, Loader2,
} from "lucide-react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import PhoneInput from "@/components/PhoneInput";
import CNICInput from "@/components/CNICInput";
import EmailInput from "@/components/EmailInput";
import toast from "react-hot-toast";

// ----- Validators (mirror backend) -----
const CNIC_RE = /^\d{5}-?\d{7}-?\d{1}$/;
const PK_PHONE_RE = /^(\+92|92|0|0092)?3\d{2}-?\d{7}$/;

const educationSchema = z.object({
  degree: z.string().trim().min(1, "Degree required"),
  institute: z.string().trim().min(1, "Institute required"),
  passingYear: z.string().regex(/^\d{4}$/, "Year must be 4 digits"),
});

const experienceSchema = z.object({
  employer: z.string().trim().min(1, "Employer required"),
  jobTitle: z.string().trim().min(1, "Job title required"),
  startDate: z.string().min(1, "Start date required"),
  currentlyWorking: z.boolean().default(false),
  endDate: z.string().optional().default(""),
  responsibilities: z.string().optional().default(""),
}).refine((data) => {
  // If not currently working, endDate is required
  if (!data.currentlyWorking && !data.endDate) {
    return false;
  }
  return true;
}, {
  message: "End date is required when not currently working",
  path: ["endDate"],
});

const assignmentSchema = z.object({
  branch_code: z.string().optional().default(""),
  department_id: z.string().min(1, "Department required"),
  designation_id: z.string().min(1, "Designation required"),
  joining_date: z.string().min(1, "Joining date required").refine((val) => {
    if (!val) return true;
    const todayStr = new Date().toISOString().slice(0, 10);
    return val <= todayStr;
  }, { message: "Joining date cannot be in the future" }),
  shift: z.enum(["general", "morning", "afternoon", "night", "hourly", "both"]).default("general"),
  is_primary: z.boolean().default(false),
});

const schema = z.object({
  // Step 1 — Identity
  fullName: z.string().trim().min(2, "Name too short").max(100),
  cnic: z.string().regex(CNIC_RE, "Format: XXXXX-XXXXXXX-X"),
  dob: z.string().min(1, "Date of birth is required").refine((v) => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const monthDiff = today.getMonth() - d.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) age--;
    return age >= 13;
  }, "Employee must be at least 13 years old"),
  gender: z.enum(["male", "female"]),
  maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
  nationality: z.string().default("Pakistani"),
  religion: z.string().optional().default("Islam"),
  currentWorkingSector: z.string().optional().default(""),

  // Step 2 — Contact
  personalEmail: z.string().email("Invalid email"),
  mobile: z.string().regex(PK_PHONE_RE, "Invalid PK mobile (03XX-XXXXXXX)"),
  orgEmail: z.string().email("Invalid email").or(z.literal("")).optional(),
  orgPhone: z.string().regex(PK_PHONE_RE, "Invalid PK mobile").or(z.literal("")).optional(),
  emergencyName: z.string().optional().default(""),
  emergencyPhone: z.string().regex(PK_PHONE_RE, "Invalid PK mobile").or(z.literal("")).optional(),
  residentialAddress: z.string().trim().min(3, "Address required"),
  permanentAddress: z.string().optional().default(""),
  city: z.string().optional().default(""),
  bio: z.string().optional().default(""),

  // Step 3 — Placement (multi-role assignments)
  organizationCode: z.string().min(1, "Organization required"),
  institutionCode: z.string().optional().default(""),
  assignments: z.array(assignmentSchema).min(1, "At least one assignment required"),

  // Bank
  bankName: z.string().optional().default(""),
  accountNumber: z.string().optional().default(""),

  // Step 4 — History (optional arrays)
  education: z.array(educationSchema).optional().default([]),
  experience: z.array(experienceSchema).optional().default([]),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

type Institution = { inst_code: string; name: string };
type Branch = { branch_code: string; branch_name: string };
type Department = { id: string; dept_code: string; dept_name: string };
type Designation = { id: string; position_code: string; position_name: string };
type AssignmentRow = {
  branch_code: string;
  department_id: string;
  designation_id: string;
  joining_date: string;
  shift: "general" | "morning" | "afternoon" | "night" | "hourly" | "both";
  is_primary: boolean;
};

const STEPS = [
  { id: 1, label: "Identity" },
  { id: 2, label: "Contact" },
  { id: 3, label: "Placement" },
  { id: 4, label: "History" },
];

const FIELDS_PER_STEP: Record<number, (keyof FormInput)[]> = {
  1: ["fullName", "cnic", "dob", "gender", "maritalStatus", "nationality", "religion", "currentWorkingSector"],
  2: ["personalEmail", "mobile", "orgEmail", "orgPhone", "emergencyName", "emergencyPhone", "residentialAddress", "permanentAddress", "city"],
  3: ["organizationCode", "institutionCode", "assignments", "bankName", "accountNumber"],
  4: ["education", "experience"],
};

// Reverse lookup so a server-only error (e.g. "CNIC already registered",
// only known after submit on step 4) can send the user back to the step
// that actually renders that field, instead of leaving the error invisible.
const STEP_OF_FIELD: Record<string, number> = Object.fromEntries(
  Object.entries(FIELDS_PER_STEP).flatMap(([step, fields]) => fields.map((f) => [f, Number(step)]))
);

export default function NewEmployeePage() {
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  const isSuperadmin = !!user?.is_superadmin;
  const canCreate = isSuperadmin || hasPermission("employee.create");
  const [step, setStep] = useState(1);
  const [organizations, setOrganizations] = useState<{ org_code: string; name: string }[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [branchOptions, setBranchOptions] = useState<Branch[]>([]);
  // Cascade options are cached per row (keyed by the row's field-array id)
  const [deptOptions, setDeptOptions] = useState<Record<string, Department[]>>({});
  const [desigOptions, setDesigOptions] = useState<Record<string, Designation[]>>({});

  const form = useForm<FormInput, any, FormOutput>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      fullName: "", cnic: "", dob: "", gender: "male", maritalStatus: "single",
      nationality: "Pakistani", religion: "Islam",
      personalEmail: "", mobile: "", orgEmail: "", orgPhone: "",
      emergencyName: "", emergencyPhone: "",
      residentialAddress: "", permanentAddress: "", city: "",
      organizationCode: "IAK", institutionCode: "",
      assignments: [{
        branch_code: "",
        department_id: "",
        designation_id: "",
        joining_date: new Date().toISOString().slice(0, 10),
        shift: "general",
        is_primary: true,
      }],
      bankName: "", accountNumber: "",
      education: [], experience: [{ employer: "", jobTitle: "", startDate: "", currentlyWorking: false, endDate: "", responsibilities: "" }],
    },
  });

  const { register, handleSubmit, trigger, watch, control, setValue, setError, formState: { errors, isSubmitting } } = form;

  const eduArr = useFieldArray({ control, name: "education" });
  const expArr = useFieldArray({ control, name: "experience" });
  const asnArr = useFieldArray({ control, name: "assignments" });

  const orgCode = watch("organizationCode");
  const instCode = watch("institutionCode");

  // Load organizations once
  useEffect(() => {
    (async () => {
      const oRes = await fetchWithAuth("/employees/organizations");
      if (oRes.ok) {
        const orgs = await oRes.json();
        const orgList = Array.isArray(orgs) ? orgs : [];
        setOrganizations(orgList);
        if (orgList.length > 0) {
          const cur = form.getValues("organizationCode");
          if (!cur || !orgList.some(o => o.org_code === cur)) {
            form.setValue("organizationCode", orgList[0].org_code, { shouldValidate: true });
          }
        }
      }
    })();
  }, []);

  // Organization → only institutions that belong to the selected org
  useEffect(() => {
    let active = true;
    if (!orgCode) {
      setInstitutions([]);
      setBranchOptions([]);
      return () => { active = false; };
    }
    (async () => {
      const r = await fetchWithAuth(`/employees/institutions?organization_code=${encodeURIComponent(orgCode || "")}`);
      const data = r.ok ? await r.json() : [];
      if (active) setInstitutions(Array.isArray(data) ? data : []);
    })();
    return () => { active = false; };
  }, [orgCode]);

  // Institution → only branches under the selected institution
  useEffect(() => {
    let active = true;
    if (!instCode) {
      setBranchOptions([]);
      return () => { active = false; };
    }
    (async () => {
      const r = await fetchWithAuth(`/employees/branches?institution_code=${encodeURIComponent(instCode || "")}`);
      const data = r.ok ? await r.json() : [];
      if (active) setBranchOptions(Array.isArray(data) ? data : []);
    })();
    return () => { active = false; };
  }, [instCode]);

  const fetchDeptsForRow = async (rowId: string, branchCode: string, inst: string) => {
    if (!branchCode && !inst) {
      setDeptOptions(prev => ({ ...prev, [rowId]: [] }));
      return;
    }
    if (branchOptions.length > 0 && !branchCode) {
      setDeptOptions(prev => ({ ...prev, [rowId]: [] }));
      return;
    }
    const url = branchCode
      ? `/employees/departments?branch_code=${encodeURIComponent(branchCode || "")}`
      : `/employees/departments?institution_code=${encodeURIComponent(inst || "")}`;
    try {
      const r = await fetchWithAuth(url);
      const data = r.ok ? await r.json() : [];
      setDeptOptions(prev => ({ ...prev, [rowId]: Array.isArray(data) ? data : [] }));
    } catch {
      setDeptOptions(prev => ({ ...prev, [rowId]: [] }));
    }
  };

  const fetchDesigsForRow = async (rowId: string, deptId: string) => {
    try {
      const r = await fetchWithAuth(`/employees/designations?department_id=${encodeURIComponent(deptId || "")}`);
      const data = r.ok ? await r.json() : [];
      setDesigOptions(prev => ({ ...prev, [rowId]: Array.isArray(data) ? data : [] }));
    } catch {
      setDesigOptions(prev => ({ ...prev, [rowId]: [] }));
    }
  };

  // Prime every row's department list based on its branch (or institution fallback)
  useEffect(() => {
    const inst = form.getValues("institutionCode");
    (asnArr.fields as unknown as (AssignmentRow & { id: string })[]).forEach(f => {
      fetchDeptsForRow(f.id, f.branch_code || "", inst || "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instCode, branchOptions.length, asnArr.fields.length]);

  // Organization change → reset institution + every role's cascade
  const onOrgChange = (value: string) => {
    setValue("organizationCode", value, { shouldValidate: true });
    setValue("institutionCode", "", { shouldValidate: true });
    setBranchOptions([]);
    setDeptOptions({});
    setDesigOptions({});
    (asnArr.fields as unknown as (AssignmentRow & { id: string })[]).forEach((f, index) => {
      setValue(`assignments.${index}.branch_code`, "", { shouldValidate: true });
      setValue(`assignments.${index}.department_id`, "", { shouldValidate: true });
      setValue(`assignments.${index}.designation_id`, "", { shouldValidate: true });
    });
  };

  // Institution change → reset each role's branch/department/designation
  const onInstChange = (value: string) => {
    setValue("institutionCode", value, { shouldValidate: true });
    setBranchOptions([]);
    setDeptOptions({});
    setDesigOptions({});
    (asnArr.fields as unknown as (AssignmentRow & { id: string })[]).forEach((f, index) => {
      setValue(`assignments.${index}.branch_code`, "", { shouldValidate: true });
      setValue(`assignments.${index}.department_id`, "", { shouldValidate: true });
      setValue(`assignments.${index}.designation_id`, "", { shouldValidate: true });
    });
  };

  // Branch change → reload departments, reset dept + designation
  const onBranchChange = (index: number, rowId: string, value: string) => {
    setValue(`assignments.${index}.branch_code`, value, { shouldValidate: true });
    setValue(`assignments.${index}.department_id`, "", { shouldValidate: true });
    setValue(`assignments.${index}.designation_id`, "", { shouldValidate: true });
    setDesigOptions(prev => ({ ...prev, [rowId]: [] }));
    fetchDeptsForRow(rowId, value, form.getValues("institutionCode") || "");
  };

  // Department change → reload designations, reset designation
  const onDeptChange = (index: number, rowId: string, value: string) => {
    setValue(`assignments.${index}.department_id`, value, { shouldValidate: true });
    setValue(`assignments.${index}.designation_id`, "", { shouldValidate: true });
    fetchDesigsForRow(rowId, value);
  };

  // Multiple roles may be flagged primary (M3) — toggling one never unchecks the others.
  const onPrimaryChange = (index: number, checked: boolean) => {
    setValue(`assignments.${index}.is_primary`, checked, { shouldValidate: true });
  };

  const addAssignmentRow = () => {
    asnArr.append({
      branch_code: "",
      department_id: "",
      designation_id: "",
      joining_date: new Date().toISOString().slice(0, 10),
      shift: "general",
      is_primary: false,
    } as AssignmentRow);
  };

  const removeAssignmentRow = (index: number) => {
    asnArr.remove(index);
  };

  const next = async () => {
    if (step === 3) {
      // Manual deep validation for assignments array
      const assignments = form.getValues("assignments");
      let allValid = true;
      for (let i = 0; i < assignments.length; i++) {
        const rowValid = await trigger([
          `assignments.${i}.branch_code`,
          `assignments.${i}.department_id`,
          `assignments.${i}.designation_id`,
          `assignments.${i}.joining_date`,
          `assignments.${i}.shift`,
        ]);
        if (!rowValid) allValid = false;
      }
      if (!allValid) return;
    }
    const ok = await trigger(FIELDS_PER_STEP[step] as any);
    if (ok) setStep((s) => Math.min(4, s + 1));
  };
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 4) handleSubmit(onSubmit)(e);
  };

  const onSubmit = async (values: FormOutput) => {
    // Safety: only allow submit on step 4 (History)
    if (step !== 4) return;
    try {
      const res = await fetchWithAuth("/employees/employees", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.field_errors) {
          const fields = Object.entries(data.field_errors);
          for (const [field, msgs] of fields) {
            const text = Array.isArray(msgs) ? msgs.map(String).join(", ") : String(msgs);
            setError(field as any, { message: text });
          }
          // Jump back to the earliest step that renders one of these fields
          // so a server-only error (e.g. duplicate CNIC/email) isn't left
          // invisible on a later step.
          const errorSteps = fields.map(([field]) => STEP_OF_FIELD[field]).filter(Boolean);
          if (errorSteps.length) setStep(Math.min(...errorSteps));
          toast.error("Please fix the highlighted fields.");
          return;
        }
        if (Array.isArray(data?.detail)) {
          // Raw Pydantic validation errors (e.g. a schema `@validator` that
          // raises, like the DOB age check) never go through field_errors —
          // Ninja returns them here instead, each with a `loc` array ending
          // in the field name. Same step-jump treatment applies.
          const detailFields: string[] = [];
          for (const d of data.detail) {
            const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
            if (typeof field === "string") {
              detailFields.push(field);
              setError(field as any, { message: d?.msg || "Invalid value" });
            }
          }
          const errorSteps = detailFields.map((f) => STEP_OF_FIELD[f]).filter(Boolean);
          if (errorSteps.length) setStep(Math.min(...errorSteps));
          toast.error(data.detail.map((d: any) => d?.msg || JSON.stringify(d)).join("; "));
          return;
        }
        toast.error(
          typeof data?.error === "string" ? data.error :
            typeof data?.detail === "string" ? data.detail :
              `Request failed (${res.status})`
        );
        return;
      }
      toast.success("Employee Added Successfully", { style: { backgroundColor: '#22c55e', color: '#fff' } });
      router.push("/employees");
    } catch (e: any) {
      toast.error(e.message || "Network error");
    }
  };

  if (!canCreate) {
    return (
      <ProtectedLayout>
        <AccessDenied permission="employee.create" />
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
        <h1 className="page-title text-center">Add Employee</h1>

        {/* Stepper */}
        <ol className="flex items-start mt-6 mb-8">
          {STEPS.map((s, i) => {
            const active = step === s.id;
            const done = step > s.id;
            return (
              <Fragment key={s.id}>
                <li className="flex flex-col items-center gap-2 shrink-0">
                  <div className={`h-9 w-9 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors ${
                    active ? "bg-theme-800 border-theme-800 text-white"
                    : done ? "bg-blue-50 border-theme-800 text-theme-800"
                    : "bg-white border-slate-200 text-slate-400"
                  }`}>
                    {done ? <Check size={16} strokeWidth={3} /> : s.id}
                  </div>
                  <span className={`text-xs font-semibold whitespace-nowrap ${active || done ? "text-slate-900" : "text-slate-400"}`}>
                    {s.label}
                  </span>
                </li>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mt-[18px] mx-2 sm:mx-4 rounded-full transition-colors ${done ? "bg-theme-800" : "bg-slate-100"}`} />
                )}
              </Fragment>
            );
          })}
        </ol>

        <form
          onSubmit={handleFormSubmit}
          className="ui-card p-5 sm:p-10 space-y-5 sm:space-y-6"
        >
          {/* ── Step 1: Identity ── */}
          {step === 1 && (
            <>
              <Field label="Full name" error={errors.fullName?.message}>
                <input
                  {...register("fullName")}
                  placeholder="Ahmed Ali"
                  className={inputCls(errors.fullName)}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <Field label="CNIC *" error={errors.cnic?.message}>
                  <Controller
                    name="cnic"
                    control={control}
                    render={({ field }) => (
                      <CNICInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        className={inputCls(errors.cnic)}
                      />
                    )}
                  />
                </Field>

                <Field label="Date of birth" error={errors.dob?.message}>
                  <input
                    type="date"
                    {...register("dob")}
                    className={inputCls(errors.dob)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <Field label="Gender" error={errors.gender?.message}>
                  <select
                    {...register("gender")}
                    className={inputCls(errors.gender)}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>

                <Field label="Marital status" error={errors.maritalStatus?.message}>
                  <select
                    {...register("maritalStatus")}
                    className={inputCls(errors.maritalStatus)}
                  >
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <Field label="Nationality" error={errors.nationality?.message}>
                  <input
                    {...register("nationality")}
                    placeholder="Pakistani"
                    className={inputCls(errors.nationality)}
                  />
                </Field>

                <Field label="Religion" error={errors.religion?.message}>
                  <input
                    {...register("religion")}
                    className={inputCls(errors.religion)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <Field label="Current Working Sector" error={errors.currentWorkingSector?.message}>
                  <input
                    {...register("currentWorkingSector")}
                    placeholder="e.g. Education, Health, IT, Administration"
                    className={inputCls(errors.currentWorkingSector)}
                  />
                </Field>
              </div>
            </>
          )}

          {/* ── Step 2: Contact ── */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Personal email *" error={errors.personalEmail?.message}>
                  <Controller
                    name="personalEmail"
                    control={control}
                    render={({ field }) => (
                      <EmailInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        defaultDomain="@gmail.com"
                        hasError={!!errors.personalEmail}
                      />
                    )}
                  />
                </Field>
                <Field label="Mobile" error={errors.mobile?.message}>
                  <Controller name="mobile" control={control} render={({ field }) => (
                    <PhoneInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={inputCls(errors.mobile)} />
                  )} />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Org email" error={errors.orgEmail?.message}>
                  <Controller
                    name="orgEmail"
                    control={control}
                    render={({ field }) => (
                      <EmailInput
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        defaultDomain="@iak.ngo"
                        hasError={!!errors.orgEmail}
                      />
                    )}
                  />
                </Field>
                <Field label="Org phone" error={errors.orgPhone?.message}>
                  <Controller name="orgPhone" control={control} render={({ field }) => (
                    <PhoneInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} className={inputCls(errors.orgPhone)} />
                  )} />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Emergency contact name" error={errors.emergencyName?.message}>
                  <input {...register("emergencyName")} className={inputCls(errors.emergencyName)} />
                </Field>
                <Field label="Emergency contact phone" error={errors.emergencyPhone?.message}>
                  <Controller name="emergencyPhone" control={control} render={({ field }) => (
                    <PhoneInput value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} className={inputCls(errors.emergencyPhone)} />
                  )} />
                </Field>
              </div>

              <Field label="Residential address" error={errors.residentialAddress?.message}>
                <textarea {...register("residentialAddress")} rows={2} className={inputCls(errors.residentialAddress)} />
              </Field>

              <Field label="Permanent address" error={errors.permanentAddress?.message}>
                <textarea {...register("permanentAddress")} rows={2} className={inputCls(errors.permanentAddress)} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="City" error={errors.city?.message}>
                  <input {...register("city")} className={inputCls(errors.city)} />
                </Field>
                <Field label="Bio" error={errors.bio?.message}>
                  <textarea {...register("bio")} rows={2} className={inputCls(errors.bio)} />
                </Field>
              </div>

            </>
          )}

          {/* ── Step 3: Placement (Multi-Role Assignments) ── */}
          {step === 3 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Organization" error={errors.organizationCode?.message}>
                  <select
                    {...register("organizationCode", {
                      onChange: (e) => onOrgChange(e.target.value),
                    })}
                    className={inputCls(errors.organizationCode)}
                  >
                    {organizations.length > 1 && <option value="">— select org —</option>}
                    {organizations.map((o) => (
                      <option key={o.org_code} value={o.org_code}>{o.name} ({o.org_code})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Institution" error={errors.institutionCode?.message}>
                  <select
                    {...register("institutionCode", {
                      onChange: (e) => onInstChange(e.target.value),
                    })}
                    className={inputCls(errors.institutionCode)}
                  >
                    <option value="">— none —</option>
                    {institutions.map((i) => (
                      <option key={i.inst_code} value={i.inst_code}>{i.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <section className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Assignments / Roles</h3>
                  <button
                    type="button"
                    onClick={addAssignmentRow}
                    className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer transition-colors"
                  >
                    <Plus size={14} /> Add Role
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {asnArr.fields.map((f, index) => {
                    const rowId = (f as any).id as string;
                    const rowErrors: any = errors.assignments?.[index];
                    const selectedDept = watch(`assignments.${index}.department_id`);
                    const isPrimary = Boolean(watch(`assignments.${index}.is_primary`));
                    return (
                      <div key={rowId} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Role {index + 1}</span>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={isPrimary}
                                onClick={() => onPrimaryChange(index, !isPrimary)}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  isPrimary ? 'bg-indigo-600' : 'bg-slate-300'
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    isPrimary ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                              <span className={`text-xs font-semibold ${isPrimary ? 'text-indigo-700' : 'text-slate-500'}`}>
                                {isPrimary ? 'Primary Role' : 'Secondary Role'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAssignmentRow(index)}
                              disabled={asnArr.fields.length === 1}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                              title="Remove role"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <Field label="Branch" error={rowErrors?.branch_code?.message}>
                            <select
                              {...register(`assignments.${index}.branch_code`, {
                                onChange: (e) => onBranchChange(index, rowId, e.target.value),
                              })}
                              disabled={!instCode}
                              className={inputCls(rowErrors?.branch_code)}
                            >
                              <option value="">— none / global —</option>
                              {branchOptions.map((b) => (
                                <option key={b.branch_code} value={b.branch_code}>{b.branch_name} ({b.branch_code})</option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Department" error={rowErrors?.department_id?.message}>
                            <select
                              {...register(`assignments.${index}.department_id`, {
                                onChange: (e) => onDeptChange(index, rowId, e.target.value),
                              })}
                              disabled={!instCode || (branchOptions.length > 0 && !watch(`assignments.${index}.branch_code`))}
                              className={inputCls(rowErrors?.department_id)}
                            >
                              <option value="">— select —</option>
                              {(deptOptions[rowId] || []).map((d) => (
                                <option key={d.id} value={d.id}>{d.dept_name} ({d.dept_code})</option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Designation" error={rowErrors?.designation_id?.message}>
                            <select
                              {...register(`assignments.${index}.designation_id`)}
                              disabled={!selectedDept}
                              className={inputCls(rowErrors?.designation_id)}
                            >
                              <option value="">— select —</option>
                              {(desigOptions[rowId] || []).map((d) => (
                                <option key={d.id} value={d.id}>{d.position_name} ({d.position_code})</option>
                              ))}
                            </select>
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Joining date" error={rowErrors?.joining_date?.message}>
                            <input
                              type="date"
                              max={new Date().toISOString().slice(0, 10)}
                              {...register(`assignments.${index}.joining_date`)}
                              className={inputCls(rowErrors?.joining_date)}
                            />
                          </Field>
                          <Field label="Shift" error={rowErrors?.shift?.message}>
                            <select {...register(`assignments.${index}.shift`)} className={inputCls(rowErrors?.shift)}>
                              <option value="general">General / Office</option>
                              <option value="morning">Morning</option>
                              <option value="afternoon">Afternoon</option>
                              <option value="night">Night</option>
                              <option value="hourly">Hourly</option>
                              <option value="both">Both (M+A)</option>
                            </select>
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              {errors.assignments?.message && (
                <p className="text-xs text-rose-600">{errors.assignments.message}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Bank name" error={errors.bankName?.message}>
                  <input {...register("bankName")} className={inputCls(errors.bankName)} />
                </Field>
                <Field label="Account number" error={errors.accountNumber?.message}>
                  <input {...register("accountNumber")} className={inputCls(errors.accountNumber)} />
                </Field>
              </div>
            </>
          )}

          {/* ── Step 4: History ── */}
          {step === 4 && (
            <>
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Education</h3>
                  <button
                    type="button"
                    onClick={() => eduArr.append({ degree: "", institute: "", passingYear: "" })}
                    className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>

                {eduArr.fields.length === 0 && (
                  <p className="text-sm text-slate-400 italic">No records added.</p>
                )}

                {eduArr.fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px_auto] gap-3 mb-3">
                    <input {...register(`education.${i}.degree`)} placeholder="Degree" className={inputCls(errors.education?.[i]?.degree)} />
                    <input {...register(`education.${i}.institute`)} placeholder="Institute" className={inputCls(errors.education?.[i]?.institute)} />
                    <input {...register(`education.${i}.passingYear`)} placeholder="YYYY" className={inputCls(errors.education?.[i]?.passingYear)} />
                    <button
                      type="button"
                      onClick={() => eduArr.remove(i)}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg self-start sm:self-auto cursor-pointer transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </section>

              <section className="pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Work experience</h3>
                  <button
                    type="button"
                    onClick={() => expArr.append({ employer: "", jobTitle: "", startDate: "", currentlyWorking: false, endDate: "", responsibilities: "" })}
                    className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>

                {expArr.fields.length === 0 && (
                  <p className="text-sm text-slate-400 italic">No records added.</p>
                )}

                {expArr.fields.map((f, i) => (
                  <div key={f.id} className="space-y-2 mb-4 p-3 border border-slate-200 rounded-lg">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input {...register(`experience.${i}.employer`)} placeholder="ABC Pvt Ltd" className={inputCls(errors.experience?.[i]?.employer)} />
                      <input {...register(`experience.${i}.jobTitle`)} placeholder="Job title" className={inputCls(errors.experience?.[i]?.jobTitle)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Start Date <span className="text-rose-500 ml-0.5">*</span></label>
                        <input
                          type="date"
                          {...register(`experience.${i}.startDate`)}
                          className={inputCls(errors.experience?.[i]?.startDate)}
                        />
                        {errors.experience?.[i]?.startDate && <p className="text-xs text-rose-600 mt-1">{errors.experience?.[i]?.startDate.message}</p>}
                      </div>

                      <div>
                        <label className="form-label">End Date</label>
                        <input
                          type="date"
                          {...register(`experience.${i}.endDate`)}
                          disabled={watch(`experience.${i}.currentlyWorking`) || false}
                          className={`${inputCls(errors.experience?.[i]?.endDate)} ${watch(`experience.${i}.currentlyWorking`) ? "bg-slate-100 cursor-not-allowed" : ""}`}
                        />
                        {errors.experience?.[i]?.endDate && <p className="text-xs text-rose-600 mt-1">{errors.experience?.[i]?.endDate.message}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <Controller
                          name={`experience.${i}.currentlyWorking`}
                          control={control}
                          rules={{ required: false }}
                          render={({ field: { value, onChange, onBlur, name, ref } }) => (
                            <input
                              type="checkbox"
                              name={name}
                              onBlur={onBlur}
                              ref={ref}
                              checked={value ?? false}
                              onChange={(e) => onChange(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-theme-600 focus:ring-theme-500"
                            />
                          )}
                        />
                        <span>Currently working here</span>
                      </label>
                    </div>

                    <textarea {...register(`experience.${i}.responsibilities`)} rows={2} placeholder="Responsibilities" className={inputCls()} />
                    <button
                      type="button"
                      onClick={() => expArr.remove(i)}
                      className="inline-flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700 cursor-pointer transition-colors"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-6 sm:pt-8 border-t border-slate-100 mt-8 sm:mt-10">
            <button
              type="button"
              onClick={prev}
              disabled={step === 1}
              className="btn-secondary h-11"
            >
              <ChevronLeft size={16} /> Back
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  next();
                }}
                className="btn-primary h-11"
              >
                Next Step <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary h-11"
              >
                {isSubmitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Saving…</>
                ) : (
                  <><Check size={16} strokeWidth={3} /> Create Employee</>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </ProtectedLayout>
  );
}

// ----- Shared helpers -----
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1.5">{label}</span>
      {children}
      {error && <span className="block text-xs text-rose-600 mt-1">{error}</span>}
    </label>
  );
}

// ── Single unified inputCls — bg-gray-50 everywhere ──
function inputCls(err?: any) {
  const base =
    "w-full px-3 py-2.5 sm:py-3 h-11 sm:h-14 text-sm bg-gray-50 border rounded-lg outline-none transition focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100 disabled:text-slate-400 appearance-none";
  return `${base} ${err
    ? "border-rose-300 focus:border-rose-400"
    : "border-slate-200 focus:border-slate-400"
    }`;
}

"use client";

import React, { Fragment, useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus, Trash2, Check, ChevronRight, ChevronLeft, Loader2, Mail,
} from "lucide-react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { Controller } from "react-hook-form";
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
  endDate: z.string().optional().default(""),
  responsibilities: z.string().optional().default(""),
});

const schema = z.object({
  fullName: z.string().trim().min(2, "Name too short").max(100),
  cnic: z.string().regex(CNIC_RE, "Format: XXXXX-XXXXXXX-X"),
  dob: z.string().optional().default(""),
  gender: z.enum(["male", "female"]),
  maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
  nationality: z.string().default("Pakistani"),
  religion: z.string().optional().default(""),
  currentWorkingSector: z.string().optional().default(""),

  personalEmail: z.string().email("Invalid email"),
  mobile: z.string().regex(PK_PHONE_RE, "Invalid PK mobile (03XX-XXXXXXX)"),
  orgEmail: z.string().email("Invalid email").or(z.literal("")).optional(),
  orgPhone: z.string().regex(PK_PHONE_RE, "Invalid PK mobile").or(z.literal("")).optional(),
  emergencyName: z.string().optional().default(""),
  emergencyPhone: z.string().regex(PK_PHONE_RE, "Invalid PK mobile").or(z.literal("")).optional(),
  residentialAddress: z.string().trim().min(3, "Address required"),
  permanentAddress: z.string().optional().default(""),
  city: z.string().optional().default(""),

  organizationCode: z.string().min(1, "Organization required"),
  institutionCode: z.string().optional().default(""),
  branchCode: z.string().optional().default(""),
  departmentId: z.string().min(1, "Department required"),
  designationId: z.string().min(1, "Designation required"),
  joiningDate: z.string().min(1, "Joining date required").refine((val) => {
    if (!val) return true;
    const todayStr = new Date().toISOString().slice(0, 10);
    return val <= todayStr;
  }, { message: "Joining date cannot be in the future" }),
  shift: z.enum(["general", "morning", "afternoon", "night", "hourly", "both"]).default("general"),
  isActive: z.boolean().optional().default(true),

  bankName: z.string().optional().default(""),
  accountNumber: z.string().optional().default(""),

  education: z.array(educationSchema).optional().default([]),
  experience: z.array(experienceSchema).optional().default([]),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

type Institution = { inst_code: string; name: string };
type Branch = { branch_code: string; branch_name: string };
type Department = { id: string; dept_code: string; dept_name: string };
type Designation = { id: string; position_code: string; position_name: string };

const STEPS = [
  { id: 1, label: "Identity" },
  { id: 2, label: "Contact" },
  { id: 3, label: "Placement" },
  { id: 4, label: "History" },
];

const FIELDS_PER_STEP: Record<number, (keyof FormInput)[]> = {
  1: ["fullName", "cnic", "dob", "gender", "maritalStatus", "nationality", "religion", "currentWorkingSector"],
  2: ["personalEmail", "mobile", "orgEmail", "orgPhone", "emergencyName", "emergencyPhone", "residentialAddress", "permanentAddress", "city"],
  3: ["organizationCode", "institutionCode", "branchCode", "departmentId", "designationId", "joiningDate", "shift", "bankName", "accountNumber"],
  4: ["education", "experience"],
};

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { user, hasPermission } = useAuth();
  const isSuperadmin = !!user?.is_superadmin;
  const canEdit = isSuperadmin || hasPermission("employee.edit");

  const [step, setStep] = useState(1);

  // Deep-link support: /employees/:id/edit?step=3 opens straight on the
  // Placement step (used by "Give Placement (Organization)" from the list),
  // so admins don't have to walk steps 1–2 for an existing employee.
  useEffect(() => {
    const s = Number(new URLSearchParams(window.location.search).get("step"));
    if (s >= 1 && s <= 4) setStep(s);
  }, []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<{ org_code: string; name: string }[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  // Whether this employee already has a primary EmployeeAssignment row.
  // false === this is their FIRST placement ("Assigned" queue), which the
  // generic PUT /employees/employees/:id below cannot create — only the
  // dedicated assign-role endpoint creates the assignment, provisions
  // default credentials, and sends the welcome email.
  const [hasPrimaryAssignment, setHasPrimaryAssignment] = useState(true);
  const [resendingEmail, setResendingEmail] = useState(false);

  const form = useForm<FormInput, any, FormOutput>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      fullName: "", cnic: "", dob: "", gender: "male", maritalStatus: "single",
      nationality: "Pakistani", religion: "", currentWorkingSector: "",
      personalEmail: "", mobile: "", orgEmail: "", orgPhone: "",
      emergencyName: "", emergencyPhone: "",
      residentialAddress: "", permanentAddress: "", city: "",
      organizationCode: "IAK", institutionCode: "", branchCode: "",
      departmentId: "", designationId: "",
      joiningDate: new Date().toISOString().slice(0, 10),
      shift: "general", bankName: "", accountNumber: "",
      education: [], experience: [],
    },
  });

  const { register, handleSubmit, trigger, watch, reset, setError, control, getValues, setValue, formState: { errors, isSubmitting } } = form;
  const eduArr = useFieldArray({ control: form.control, name: "education" });
  const expArr = useFieldArray({ control: form.control, name: "experience" });

  const handleResendWelcome = async () => {
    const targetEmail = getValues("personalEmail") || getValues("orgEmail");
    setResendingEmail(true);
    const toastId = toast.loading(`Sending welcome email to ${targetEmail || id}...`);
    try {
      const res = await fetchWithAuth(`/employees/employees/${id}/resend-welcome-email`, {
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

  const orgCode = watch("organizationCode");
  const instCode = watch("institutionCode");
  const branchCode = watch("branchCode");
  const deptId = watch("departmentId");

  // Load employee + metadata
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [oRes, iRes, eRes] = await Promise.all([
          fetchWithAuth("/employees/organizations"),
          fetchWithAuth("/employees/institutions"),
          fetchWithAuth(`/employees/employees/${id}`),
        ]);
        const orgs = oRes.ok ? await oRes.json() : [];
        const orgList = Array.isArray(orgs) ? orgs : [];
        setOrganizations(orgList);
        if (iRes.ok) setInstitutions(await iRes.json());

        if (!eRes.ok) {
          setLoadError(`Employee not found (${eRes.status})`);
          setLoading(false);
          return;
        }
        const emp = await eRes.json();
        const primary = (emp.assignments || []).find((a: any) => a.is_primary) || emp.assignments?.[0] || {};
        setHasPrimaryAssignment((emp.assignments || []).length > 0);

        const defaultOrg = emp.organization_code || (orgList.length > 0 ? orgList[0].org_code : "IAK");

        reset({
          fullName: emp.full_name || "",
          cnic: emp.cnic || "",
          dob: emp.dob ? emp.dob.slice(0, 10) : "",
          gender: (emp.gender || "male") as any,
          maritalStatus: (emp.marital_status || "single") as any,
          nationality: emp.nationality || "Pakistani",
          religion: emp.religion || "",
          currentWorkingSector: emp.current_working_sector || emp.currentWorkingSector || "",
          personalEmail: emp.personal_email || "",
          mobile: emp.personal_phone || "",
          orgEmail: emp.org_email || "",
          orgPhone: emp.org_phone || "",
          emergencyName: emp.emergency_contact?.name || "",
          emergencyPhone: emp.emergency_contact?.phone || "",
          residentialAddress: emp.address?.residential || "",
          permanentAddress: emp.address?.permanent || "",
          city: emp.address?.city || "",
          organizationCode: defaultOrg,
          institutionCode: primary.institution_code || "",
          branchCode: primary.branch_code || "",
          departmentId: primary.department_id || "",
          designationId: primary.designation_id || "",
          joiningDate: primary.joining_date ? primary.joining_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
          shift: (primary.shift || "general") as any,
          isActive: emp.is_active ?? true,
          bankName: emp.bank_info?.bank_name || "",
          accountNumber: emp.bank_info?.account_number || "",
          education: (emp.education_history || []).map((e: any) => ({
            degree: e.degree || "", institute: e.institute || "", passingYear: String(e.passingYear || e.passing_year || ""),
          })),
          experience: (emp.work_experience || []).map((e: any) => ({
            employer: e.employer || "", jobTitle: e.jobTitle || e.job_title || "",
            startDate: e.startDate || e.start_date || "",
            endDate: e.endDate || e.end_date || "",
            responsibilities: e.responsibilities || "",
          })),
        });
      } catch (err: any) {
        setLoadError(err?.message || "Failed to load employee");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, reset]);

  // Branches depend on institution
  useEffect(() => {
    if (!instCode) { setBranches([]); return; }
    (async () => {
      const r = await fetchWithAuth(`/employees/branches?institution_code=${encodeURIComponent(instCode || "")}`);
      if (r.ok) setBranches(await r.json());
    })();
  }, [instCode]);

  // Departments depend strictly on branch or institution (never load all departments without branch/institution)
  useEffect(() => {
    let active = true;
    if (!branchCode && !instCode) {
      setDepartments([]);
      return () => { active = false; };
    }
    // If institution has branches but branch is not selected yet, keep departments empty
    if (branches.length > 0 && !branchCode) {
      setDepartments([]);
      return () => { active = false; };
    }
    (async () => {
      const url = branchCode
        ? `/employees/departments?branch_code=${encodeURIComponent(branchCode || "")}`
        : `/employees/departments?institution_code=${encodeURIComponent(instCode || "")}`;
      const r = await fetchWithAuth(url);
      if (r.ok && active) {
        const data = await r.json();
        setDepartments(Array.isArray(data) ? data : []);
      }
    })();
    return () => { active = false; };
  }, [branchCode, instCode, branches.length]);

  // Designations depend on department
  useEffect(() => {
    if (!deptId) { setDesignations([]); return; }
    (async () => {
      const r = await fetchWithAuth(`/employees/designations?department_id=${encodeURIComponent(deptId || "")}`);
      if (r.ok) setDesignations(await r.json());
    })();
  }, [deptId]);

  const onInstChange = (newInst: string) => {
    setValue("institutionCode", newInst, { shouldValidate: true });
    setValue("branchCode", "", { shouldValidate: true });
    setValue("departmentId", "", { shouldValidate: true });
    setValue("designationId", "", { shouldValidate: true });
    setBranches([]);
    setDepartments([]);
    setDesignations([]);
  };

  const onBranchChange = (newBranch: string) => {
    setValue("branchCode", newBranch, { shouldValidate: true });
    setValue("departmentId", "", { shouldValidate: true });
    setValue("designationId", "", { shouldValidate: true });
    setDepartments([]);
    setDesignations([]);
  };

  const onDeptChange = (newDept: string) => {
    setValue("departmentId", newDept, { shouldValidate: true });
    setValue("designationId", "", { shouldValidate: true });
    setDesignations([]);
  };

  const next = async () => {
    const ok = await trigger(FIELDS_PER_STEP[step] as any);
    if (ok) setStep((s) => Math.min(4, s + 1));
  };
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const onSubmit = async (values: FormOutput) => {
    setSubmitError(null);
    try {
      const res = await fetchWithAuth(`/employees/employees/${id}`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.field_errors) {
          for (const [field, msgs] of Object.entries(data.field_errors)) {
            const text = Array.isArray(msgs) ? msgs.map(String).join(", ") : String(msgs);
            setError(field as any, { message: text });
          }
          setSubmitError("Please fix the highlighted fields.");
          return;
        }
        if (Array.isArray(data?.detail)) {
          setSubmitError(data.detail.map((d: any) => d?.msg || JSON.stringify(d)).join("; "));
          return;
        }
        setSubmitError(
          typeof data?.error === "string" ? data.error :
          typeof data?.detail === "string" ? data.detail :
          `Request failed (${res.status})`
        );
        return;
      }

      // First-ever placement ("Assigned" queue, no assignment yet): the PUT
      // above has nothing to attach the department/designation to, so it
      // silently does nothing for organizational placement. The dedicated
      // assign-role endpoint is what actually creates the EmployeeAssignment
      // row, provisions default login credentials, and sends the welcome
      // email — without this call the employee stays stuck in "Assigned"
      // forever and no email is ever sent.
      if (!hasPrimaryAssignment) {
        const roleRes = await fetchWithAuth(`/employees/employees/${id}/assign-role`, {
          method: "POST",
          body: JSON.stringify({
            department_id: values.departmentId,
            designation_id: values.designationId,
            branch_code: values.branchCode || "",
            joining_date: values.joiningDate,
            shift: values.shift,
            is_primary: true,
            organization_code: values.organizationCode,
            institution_code: values.institutionCode,
          }),
        });
        const roleData = await roleRes.json().catch(() => ({}));
        if (!roleRes.ok) {
          const errMsg = typeof roleData?.error === "string" ? roleData.error : typeof roleData?.detail === "string" ? roleData.detail : "";
          if (!errMsg.toLowerCase().includes("already exists")) {
            setSubmitError(
              errMsg || `Placement failed (${roleRes.status})`
            );
            return;
          }
        }
        setHasPrimaryAssignment(true);
        if (roleData?.default_credentials_created && !roleData?.welcome_email_sent_to?.length) {
          toast(
            "Placement saved and login credentials created, but the welcome email could not be delivered — share the login details with the employee manually.",
            { duration: 7000, icon: "⚠️", style: { backgroundColor: "#fef3c7", color: "#92400e" } }
          );
        }
      }

      if (data?.welcome_email_status === "sent") {
        toast.success("Employee updated & welcome email delivered successfully!", { icon: "📧" });
      } else {
        toast.success("Employee Updated Successfully", { style: { backgroundColor: '#3b82f6', color: '#fff' } });
      }
      router.push("/employees");
    } catch (e: any) {
      setSubmitError(e.message || "Network error");
    }
  };

  if (!canEdit) {
    return (
      <ProtectedLayout>
        <AccessDenied permission="employee.edit" />
      </ProtectedLayout>
    );
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="max-w-4xl mx-auto px-6 py-8 text-sm text-slate-500 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading employee…
        </div>
      </ProtectedLayout>
    );
  }

  if (loadError) {
    return (
      <ProtectedLayout>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href="/employees" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 cursor-pointer mb-6">
            <ArrowLeft size={16} /> Back
          </Link>
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{loadError}</div>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            <Link href={`/employees/${id}/salary`} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors">
              Salary
            </Link>
            <Link href={`/employees/${id}/attendance`} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-100 transition-colors">
              Attendance
            </Link>
            <Link href={`/employees/${id}/payslip`} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
              Payslips
            </Link>
          </div>
          <button
            type="button"
            onClick={handleResendWelcome}
            disabled={resendingEmail}
            className="rounded-lg border border-indigo-200 bg-white px-3.5 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Mail size={14} /> {resendingEmail ? "Sending..." : "Resend Welcome Email"}
          </button>
        </div>

        <h1 className="page-title text-center">Edit Employee</h1>

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

        {submitError && (
          <div className="mb-6 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="ui-card p-6 space-y-5">
          {step === 1 && (
            <>
              <Field label="Full name *" error={errors.fullName?.message}>
                <input {...register("fullName")} className={inputCls(errors.fullName)} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="CNIC *" error={errors.cnic?.message}>
                  <Controller name="cnic" control={control} render={({ field }) => (
                    <CNICInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={inputCls(errors.cnic)} />
                  )} />
                </Field>
                <Field label="Date of birth" error={errors.dob?.message}>
                  <input type="date" {...register("dob")} className={inputCls(errors.dob)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Gender *" error={errors.gender?.message}>
                  <select {...register("gender")} className={inputCls(errors.gender)}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>
                <Field label="Marital status" error={errors.maritalStatus?.message}>
                  <select {...register("maritalStatus")} className={inputCls(errors.maritalStatus)}>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nationality" error={errors.nationality?.message}>
                  <input {...register("nationality")} className={inputCls(errors.nationality)} />
                </Field>
                <Field label="Religion" error={errors.religion?.message}>
                  <input {...register("religion")} className={inputCls(errors.religion)} />
                </Field>
              </div>
              <Field label="Current Working Sector" error={errors.currentWorkingSector?.message}>
                <input
                  type="text"
                  placeholder="e.g. Health, Education, IT"
                  {...register("currentWorkingSector")}
                  className={inputCls(errors.currentWorkingSector)}
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-4">
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
                <Field label="Mobile *" error={errors.mobile?.message}>
                  <Controller name="mobile" control={control} render={({ field }) => (
                    <PhoneInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={inputCls(errors.mobile)} />
                  )} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                    <PhoneInput value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} className={inputCls(errors.orgPhone)} />
                  )} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Emergency contact name" error={errors.emergencyName?.message}>
                  <input {...register("emergencyName")} className={inputCls(errors.emergencyName)} />
                </Field>
                <Field label="Emergency contact phone" error={errors.emergencyPhone?.message}>
                  <Controller name="emergencyPhone" control={control} render={({ field }) => (
                    <PhoneInput value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} className={inputCls(errors.emergencyPhone)} />
                  )} />
                </Field>
              </div>
              <Field label="Residential address *" error={errors.residentialAddress?.message}>
                <textarea {...register("residentialAddress")} rows={2} className={inputCls(errors.residentialAddress)} />
              </Field>
              <Field label="Permanent address" error={errors.permanentAddress?.message}>
                <textarea {...register("permanentAddress")} rows={2} className={inputCls(errors.permanentAddress)} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="City" error={errors.city?.message}>
                  <input {...register("city")} className={inputCls(errors.city)} />
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Organization *" error={errors.organizationCode?.message}>
                  <select {...register("organizationCode")} className={inputCls(errors.organizationCode)}>
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
                <Field label="Branch" error={errors.branchCode?.message}>
                  <select
                    {...register("branchCode", {
                      onChange: (e) => onBranchChange(e.target.value),
                    })}
                    disabled={!instCode}
                    className={inputCls(errors.branchCode)}
                  >
                    <option value="">— none —</option>
                    {branches.map((b) => (
                      <option key={b.branch_code} value={b.branch_code}>{b.branch_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Current Working Sector">
                  <input
                    type="text"
                    value={watch("currentWorkingSector") || "—"}
                    disabled
                    readOnly
                    className="form-input bg-slate-50 text-slate-700 font-medium cursor-not-allowed border-slate-200"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Department *" error={errors.departmentId?.message}>
                  <select
                    {...register("departmentId", {
                      onChange: (e) => onDeptChange(e.target.value),
                    })}
                    disabled={!instCode || (branches.length > 0 && !branchCode)}
                    className={inputCls(errors.departmentId)}
                  >
                    <option value="">— select —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.dept_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Designation *" error={errors.designationId?.message}>
                  <select {...register("designationId")} disabled={!deptId} className={inputCls(errors.designationId)}>
                    <option value="">— select —</option>
                    {designations.map((d) => (
                      <option key={d.id} value={d.id}>{d.position_name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Joining date *" error={errors.joiningDate?.message}>
                  <input type="date" max={new Date().toISOString().slice(0, 10)} {...register("joiningDate")} className={inputCls(errors.joiningDate)} />
                </Field>
                <Field label="Shift" error={errors.shift?.message}>
                  <select {...register("shift")} className={inputCls(errors.shift)}>
                    <option value="general">General / Office</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="night">Night</option>
                    <option value="hourly">Hourly</option>
                    <option value="both">Both (M+A)</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Bank name" error={errors.bankName?.message}>
                  <input {...register("bankName")} className={inputCls(errors.bankName)} />
                </Field>
                <Field label="Account number" error={errors.accountNumber?.message}>
                  <input {...register("accountNumber")} className={inputCls(errors.accountNumber)} />
                </Field>
              </div>
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl mt-2">
                <div>
                  <span className="text-sm font-semibold text-slate-800 block">Account Status</span>
                  <span className="text-xs text-slate-500 block">Enable or disable employee login access</span>
                </div>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(field.value)}
                        onClick={() => field.onChange(!field.value)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                          field.value ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            field.value ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className={`text-xs font-bold uppercase tracking-wider ${field.value ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md' : 'text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md'}`}>
                        {field.value ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  )}
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Education</h3>
                  <button type="button" onClick={() => eduArr.append({ degree: "", institute: "", passingYear: "" })}
                    className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 cursor-pointer">
                    <Plus size={14} /> Add
                  </button>
                </div>
                {eduArr.fields.length === 0 && <p className="text-sm text-slate-400 italic">No records added.</p>}
                {eduArr.fields.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-[1fr_1fr_120px_auto] gap-3 mb-3">
                    <input {...register(`education.${i}.degree`)} placeholder="Degree" className={inputCls(errors.education?.[i]?.degree)} />
                    <input {...register(`education.${i}.institute`)} placeholder="Institute" className={inputCls(errors.education?.[i]?.institute)} />
                    <input {...register(`education.${i}.passingYear`)} placeholder="YYYY" className={inputCls(errors.education?.[i]?.passingYear)} />
                    <button type="button" onClick={() => eduArr.remove(i)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </section>

              <section className="pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Work experience</h3>
                  <button type="button" onClick={() => expArr.append({ employer: "", jobTitle: "", startDate: "", endDate: "", responsibilities: "" })}
                    className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-slate-900 cursor-pointer">
                    <Plus size={14} /> Add
                  </button>
                </div>
                {expArr.fields.length === 0 && <p className="text-sm text-slate-400 italic">No records added.</p>}
                {expArr.fields.map((f, i) => (
                  <div key={f.id} className="space-y-2 mb-4 p-3 border border-slate-200 rounded-lg">
                    <div className="grid grid-cols-2 gap-3">
                      <input {...register(`experience.${i}.employer`)} placeholder="Employer" className={inputCls(errors.experience?.[i]?.employer)} />
                      <input {...register(`experience.${i}.jobTitle`)} placeholder="Job title" className={inputCls(errors.experience?.[i]?.jobTitle)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" {...register(`experience.${i}.startDate`)} className={inputCls(errors.experience?.[i]?.startDate)} />
                      <input type="date" {...register(`experience.${i}.endDate`)} className={inputCls(errors.experience?.[i]?.endDate)} />
                    </div>
                    <textarea {...register(`experience.${i}.responsibilities`)} rows={2} placeholder="Responsibilities" className={inputCls()} />
                    <button type="button" onClick={() => expArr.remove(i)} className="inline-flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700">
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}

          <div className="flex items-center justify-between pt-8 border-t border-slate-100 mt-10">
            <button
              type="button"
              onClick={prev}
              disabled={step === 1}
              className="btn-secondary h-11"
            >
              <ChevronLeft size={16} /> Back
            </button>

            <div className="flex items-center gap-2">
              {step === 3 && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <><Loader2 size={16} className="animate-spin" /> Saving…</>
                  ) : (
                    <><Check size={16} strokeWidth={3} /> Save Placement</>
                  )}
                </button>
              )}

              {step < 4 ? (
                <button
                  type="button"
                  onClick={next}
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
                    <><Loader2 size={16} className="animate-spin" /> Saving Changes…</>
                  ) : (
                    <><Check size={16} strokeWidth={3} /> Update Profile</>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </ProtectedLayout>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1.5">{label}</span>
      {children}
      {error && <span className="block text-xs text-rose-600 mt-1">{error}</span>}
    </label>
  );
}

function inputCls(err?: any) {
  const base = "w-full px-3 py-2 text-sm bg-white border rounded-lg outline-none transition focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50 disabled:text-slate-400";
  return `${base} ${err ? "border-rose-300 focus:border-rose-400" : "border-slate-200 focus:border-slate-400"}`;
}

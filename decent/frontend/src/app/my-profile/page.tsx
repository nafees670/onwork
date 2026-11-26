"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import AccountStatusBanner from "@/components/AccountStatusBanner";
import EmployeeField from "@/components/EmployeeField";
import { useEmployeeSelf, formatDate } from "@/hooks/useEmployeeSelf";
import { fetchWithAuth } from "@/utils/api";
import {
  User, Mail, Phone, MapPin, CreditCard, GraduationCap, Calendar,
  Briefcase, Save, Loader2, Edit3, Landmark, FileBadge2,
  Building2, GitBranch, Layers, Clock3, Star,
} from "lucide-react";
import toast from "react-hot-toast";

export default function MyProfilePage() {
  const { user, employee, setEmployee, loading, isPending, isRejected, isSuspended } = useEmployeeSelf();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({
    full_name: "", cnic: "", personal_email: "", dob: "", personal_phone: "",
    gender: "", nationality: "", marital_status: "", religion: "", city: "",
    residence_name: "", residence_phone: "", residential: "", permanent: "",
    qualification: "", institute: "", passing_year: "",
  });

  useEffect(() => {
    if (employee) {
      setForm({
        full_name: employee.full_name || "",
        cnic: employee.cnic || "",
        personal_email: employee.personal_email || "",
        dob: employee.dob ? employee.dob.slice(0, 10) : "",
        personal_phone: employee.personal_phone || "",
        gender: employee.gender || "",
        nationality: employee.nationality || "",
        marital_status: employee.marital_status || "",
        religion: employee.religion || "",
        city: employee.address?.city || employee.city || "",
        residence_name: employee.emergency_contact?.name || "",
        residence_phone: employee.emergency_contact?.phone || "",
        residential: employee.address?.residential || employee.residential_address || "",
        permanent: employee.address?.permanent || "",
        qualification: employee.education_history?.[0]?.degree || "",
        institute: employee.education_history?.[0]?.institute || "",
        passing_year: employee.education_history?.[0]?.passingYear || "",
      });
    }
  }, [employee]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        fullName: form.full_name,
        cnic: form.cnic,
        personalEmail: form.personal_email,
        dob: form.dob,
        mobile: form.personal_phone,
        gender: form.gender,
        nationality: form.nationality,
        maritalStatus: form.marital_status,
        religion: form.religion,
        city: form.city,
        emergencyName: form.residence_name,
        emergencyPhone: form.residence_phone,
        residentialAddress: form.residential,
        permanentAddress: form.permanent,
      };
      if (form.qualification || form.institute || form.passing_year) {
        payload.education = [{
          degree: form.qualification,
          institute: form.institute,
          passingYear: form.passing_year,
        }];
      }
      const empId = employee?.employee_id;
      if (!empId) throw new Error("No employee id");
      const res = await fetchWithAuth(`/employees/employees/${empId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Profile updated successfully");
        setEditing(false);
        const empRes = await fetchWithAuth(`/employees/employees/${empId}`);
        if (empRes.ok) setEmployee(await empRes.json());
      } else {
        const err = await res.json();
        const detail = err.detail ?? err.error ?? err;
        let msg: string;
        if (typeof detail === "string") {
          msg = detail;
        } else if (detail && typeof detail === "object") {
          const parts: string[] = [];
          const extract = (obj: any) => {
            if (!obj) return;
            if (typeof obj === "string") { parts.push(obj); return; }
            if (Array.isArray(obj)) { obj.forEach(extract); return; }
            if (typeof obj === "object") {
              Object.values(obj).forEach(extract);
            }
          };
          extract(detail);
          msg = parts.join(", ") || "Failed to save";
        } else {
          msg = "Failed to save";
        }
        toast.error(msg);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const educationHistory = (employee?.education_history || []).filter(
    (e) => e.degree || e.institute || e.passingYear
  );
  const workExperience = (employee?.work_experience || []).filter(
    (e) => e.employer || e.jobTitle
  );

  const assignments = employee?.assignments || [];
  const primaryAssignment = assignments.find((a) => a.is_primary) || assignments[0];
  const otherAssignments = primaryAssignment ? assignments.filter((a) => a !== primaryAssignment) : [];

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6">
        <AccountStatusBanner isPending={isPending} isRejected={isRejected} isSuspended={isSuspended} />

        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Your personal information and placement on file.</p>
        </div>

        {/* My Placement */}
        <div className="ui-card p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-6">
            <Briefcase size={20} className="text-theme-800" />
            My Placement
          </h2>

          {loading ? (
            <p className="text-sm text-slate-500">Loading placement data...</p>
          ) : primaryAssignment ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                <EmployeeField label="Institution" icon={Building2} value={primaryAssignment.institution || "—"} />
                <EmployeeField label="Branch" icon={GitBranch} value={primaryAssignment.branch_name || "—"} />
                <EmployeeField label="Department" icon={Layers} value={primaryAssignment.department || "—"} />
                <EmployeeField label="Designation" icon={Briefcase} value={primaryAssignment.designation || "—"} />
                <EmployeeField label="Shift" icon={Clock3} value={primaryAssignment.shift || "—"} />
                <EmployeeField
                  label="Joining Date" icon={Calendar}
                  value={primaryAssignment.joining_date ? formatDate(primaryAssignment.joining_date) : "—"}
                />
              </div>

              {otherAssignments.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    Other Assignments ({otherAssignments.length})
                  </p>
                  <div className="space-y-2">
                    {otherAssignments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                        <Star size={13} className="text-slate-300 shrink-0" />
                        <span className="font-medium text-slate-800">{a.designation || "—"}</span>
                        <span className="text-slate-400">·</span>
                        <span>{a.department || "—"}</span>
                        <span className="text-slate-400">·</span>
                        <span>{a.branch_name || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">No placement on record yet.</p>
          )}
        </div>

        {/* Profile Information */}
        <div className="ui-card p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <User size={20} className="text-theme-800" />
              Profile Information
            </h2>
            {editing ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(false)} disabled={saving} className="btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || loading || !employee} className="btn-primary">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            ) : (
              <button onClick={() => setEditing(true)} disabled={loading || !employee} className="btn-secondary">
                <Edit3 size={16} /> Edit
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading profile data...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              <EmployeeField label="Employee ID" icon={CreditCard} value={employee?.employee_id || user?.employee_id || user?.code || "—"} />
              <EmployeeField
                label="Employment Type" icon={Briefcase}
                value={employee?.employment_type ? employee.employment_type.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()) : "—"}
              />
              <EmployeeField label="Full Name" icon={User} editable={editing} value={form.full_name} onChange={(v) => setField("full_name", v)} />
              <EmployeeField label="CNIC" icon={CreditCard} value={employee?.cnic || "—"} />
              <EmployeeField label="Email" icon={Mail} value={employee?.personal_email || "—"} />
              <EmployeeField label="Date of Birth" icon={Calendar} type="date" editable={editing} value={form.dob} onChange={(v) => setField("dob", v)} />
              <EmployeeField label="Phone" icon={Phone} editable={editing} value={form.personal_phone} onChange={(v) => setField("personal_phone", v)} />
              <EmployeeField
                label="Gender" icon={User} editable={editing} value={form.gender}
                onChange={(v) => setField("gender", v)} select options={["male", "female"]}
              />
              <EmployeeField label="Nationality" icon={User} editable={editing} value={form.nationality} onChange={(v) => setField("nationality", v)} />
              <EmployeeField
                label="Marital Status" icon={User} editable={editing} value={form.marital_status}
                onChange={(v) => setField("marital_status", v)} select options={["single", "married", "divorced", "widowed"]}
              />
              <EmployeeField label="Religion" icon={User} editable={editing} value={form.religion} onChange={(v) => setField("religion", v)} />
              <EmployeeField label="Current Working Sector" icon={Briefcase} value={employee?.current_working_sector || "—"} />
              <EmployeeField label="City" icon={MapPin} editable={editing} value={form.city} onChange={(v) => setField("city", v)} />
              <EmployeeField label="Emergency Contact Name" icon={Phone} editable={editing} value={form.residence_name} onChange={(v) => setField("residence_name", v)} />
              <EmployeeField label="Emergency Contact Phone" icon={Phone} editable={editing} value={form.residence_phone} onChange={(v) => setField("residence_phone", v)} />
              <EmployeeField label="Residential Address" icon={MapPin} editable={editing} value={form.residential} onChange={(v) => setField("residential", v)} />
              <EmployeeField label="Permanent Address" icon={MapPin} editable={editing} value={form.permanent} onChange={(v) => setField("permanent", v)} />
              <EmployeeField label="Qualification" icon={GraduationCap} editable={editing} value={form.qualification} onChange={(v) => setField("qualification", v)} />
              <EmployeeField label="Institute" icon={GraduationCap} editable={editing} value={form.institute} onChange={(v) => setField("institute", v)} />
              <EmployeeField label="Passing Year" icon={Calendar} editable={editing} value={form.passing_year} onChange={(v) => setField("passing_year", v)} />
            </div>
          )}
        </div>

        {/* Education & Work Experience */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="ui-card p-6 md:p-8">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-6">
              <GraduationCap size={20} className="text-theme-800" />
              Education History
            </h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : educationHistory.length > 0 ? (
              <div className="space-y-4">
                {educationHistory.map((edu, i) => (
                  <div key={i} className="pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold text-slate-900">{edu.degree || "—"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{edu.institute || "—"}</p>
                    {edu.passingYear && <p className="text-xs text-slate-400 mt-0.5">Class of {edu.passingYear}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No education records yet.</p>
            )}
          </div>

          <div className="ui-card p-6 md:p-8">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-6">
              <Briefcase size={20} className="text-theme-800" />
              Work Experience
            </h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : workExperience.length > 0 ? (
              <div className="space-y-4">
                {workExperience.map((exp, i) => (
                  <div key={i} className="pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{exp.jobTitle || "—"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{exp.employer || "—"}</p>
                      </div>
                      {exp.currentlyWorking && (
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Current</span>
                      )}
                    </div>
                    {(exp.startDate || exp.endDate) && (
                      <p className="text-xs text-slate-400 mt-1">
                        {exp.startDate ? formatDate(exp.startDate) : "—"} – {exp.currentlyWorking ? "Present" : exp.endDate ? formatDate(exp.endDate) : "—"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No work experience on record.</p>
            )}
          </div>
        </div>

        {/* Bank & Documents — only shown once there's something to show */}
        {(employee?.bank_info?.bank_name || employee?.bank_info?.account_number || employee?.resume_url) && (
          <div className="ui-card p-6 md:p-8">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-6">
              <Landmark size={20} className="text-theme-800" />
              Bank & Documents
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              {(employee?.bank_info?.bank_name || employee?.bank_info?.account_number) && (
                <>
                  <EmployeeField label="Bank Name" icon={Landmark} value={employee?.bank_info?.bank_name || "—"} />
                  <EmployeeField label="Account Number" icon={CreditCard} value={employee?.bank_info?.account_number || "—"} />
                </>
              )}
              {employee?.resume_url && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Resume</p>
                  <a
                    href={employee.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-theme-800 hover:underline"
                  >
                    <FileBadge2 size={14} /> View Resume
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

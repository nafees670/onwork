"use client";

import React, { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/utils/api";
import toast from "react-hot-toast";
import CNICInput from "@/components/CNICInput";
import PhoneInput from "@/components/PhoneInput";
import EmailInput from "@/components/EmailInput";
import {
  User, Mail, Phone, Loader2,
  UserPlus, ArrowRight, Building2, LayoutGrid, Briefcase, Shield, Users,
  Calendar, Check, ChevronLeft, ChevronRight,
  Building, UserCheck, Plus, Trash2,
} from "lucide-react";

type Step = 1 | 2 | 3;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Personal Info" },
  { id: 2, label: "Contact & Address" },
  { id: 3, label: "History" },
];

// Which step each backend field_errors key belongs to — lets a server-side
// error (e.g. "CNIC already registered", only known after submit) send the
// user back to the step that actually shows that field, instead of leaving
// them stuck on step 3 with an invisible error.
const FIELD_STEP: Record<string, Step> = {
  full_name: 1, cnic: 1, gender: 1, personal_phone: 1, dob: 1, current_working_sector: 1,
  personal_email: 2, emergency_name: 2, emergency_phone: 2,
  residential_address: 2, permanent_address: 2, city: 2, bio: 2,
};

export default function RegisterPage() {
  const router = useRouter();
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1 - Personal Info
  const [fullName, setFullName] = useState("");
  const [cnic, setCnic] = useState("");
  const [gender, setGender] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [nationality, setNationality] = useState("Pakistani");
  const [religion, setReligion] = useState("Islam");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [currentWorkingSector, setCurrentWorkingSector] = useState("");

  // Step 2 - Contact & Address Info
  const [email, setEmail] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [residentialAddress, setResidentialAddress] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");

  // Step 3 - History (Education & Work Experience)
  const [education, setEducation] = useState<Array<{ id: string; degree: string; institute: string; passingYear: string }>>([
    { id: "1", degree: "", institute: "", passingYear: "" }
  ]);
  const [experience, setExperience] = useState<Array<{ id: string; employer: string; jobTitle: string; startDate: string; currentlyWorking: boolean; endDate: string; responsibilities: string }>>([
    { id: "1", employer: "", jobTitle: "", startDate: "", currentlyWorking: false, endDate: "", responsibilities: "" }
  ]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const embedded = new URLSearchParams(window.location.search).get("embedded") === "1";
    setIsEmbedded(embedded);
    if (embedded) document.documentElement.classList.add("embedded-register");
    return () => document.documentElement.classList.remove("embedded-register");
  }, []);

  const features = [
    { icon: Building2, label: "Institution Management", sub: "Multi-branch" },
    { icon: LayoutGrid, label: "Department Management", sub: "Structured" },
    { icon: Briefcase, label: "Designation Management", sub: "Role-based" },
    { icon: Users, label: "Employee Management", sub: "Full lifecycle" },
    { icon: Shield, label: "Service Access Control", sub: "Permissions" },
  ];

  const stepSubtitle: Record<Step, string> = {
    1: "Fill in the employee's personal information.",
    2: "Additional contact and address information.",
    3: "Add education and work experience records.",
  };

  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};

    if (!fullName.trim()) e.full_name = "Full name is required";
    else if (!/^[a-zA-Z\s]+$/.test(fullName.trim())) e.full_name = "Only alphabets and spaces allowed";

    if (!cnic.trim()) e.cnic = "CNIC is required";
    else if (!/^\d{5}-\d{7}-\d{1}$/.test(cnic.trim())) e.cnic = "Invalid CNIC format. Expected: XXXXX-XXXXXXX-X";

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length !== 11 || !phoneDigits.startsWith("03")) e.personal_phone = "Invalid phone (03XXXXXXXXX)";

    if (!gender) e.gender = "Gender is required";

    if (!dob) {
      e.dob = "Date of birth is required";
    } else {
      const dobDate = new Date(dob);
      const today = new Date();
      if (dobDate > today) {
        e.dob = "Date of birth cannot be in the future";
      } else {
        const age = today.getFullYear() - dobDate.getFullYear();
        const monthDiff = today.getMonth() - dobDate.getMonth();
        const dayDiff = today.getDate() - dobDate.getDate();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
        if (actualAge < 16) e.dob = "You must be at least 16 years old";
        else if (actualAge > 100) e.dob = "Invalid date of birth";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = (): boolean => {
    const e: Record<string, string> = {};

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) e.personal_email = "Invalid email address";

    if (emergencyPhone) {
      const digits = emergencyPhone.replace(/\D/g, "");
      if (digits.length !== 11 || !digits.startsWith("03")) e.emergency_phone = "Invalid emergency phone (03XXXXXXXXX)";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = (): boolean => {
    const e: Record<string, string> = {};

    // Validate Education - only validate entries that have at least one field filled
    education.forEach((edu, i) => {
      const hasData = edu.degree.trim() || edu.institute.trim() || edu.passingYear.trim();
      if (hasData) {
        if (!edu.degree.trim()) e[`education.${i}.degree`] = "Degree is required";
        if (!edu.institute.trim()) e[`education.${i}.institute`] = "Institute is required";
        if (!edu.passingYear.trim()) e[`education.${i}.passingYear`] = "Passing year is required";
        else if (!/^\d{4}$/.test(edu.passingYear)) e[`education.${i}.passingYear`] = "Year must be 4 digits";
      }
    });

    // Validate Experience - only validate entries that have at least one field filled
    experience.forEach((exp, i) => {
      const hasData = exp.employer.trim() || exp.jobTitle.trim() || exp.startDate || exp.endDate || exp.responsibilities.trim();
      if (hasData) {
        if (!exp.employer.trim()) e[`experience.${i}.employer`] = "Employer is required";
        if (!exp.jobTitle.trim()) e[`experience.${i}.jobTitle`] = "Job title is required";
        if (!exp.startDate) e[`experience.${i}.startDate`] = "Start date is required";
        if (!exp.currentlyWorking && !exp.endDate) e[`experience.${i}.endDate`] = "End date is required (or check 'Currently working here')";
      }
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateAll = (): boolean => {
    if (!validateStep1()) return false;
    if (!validateStep2()) return false;
    if (!validateStep3()) return false;
    return true;
  };

  const toPKPhone = (local: string): string => {
    const digits = local.replace(/\D/g, "");
    if (digits.startsWith("0")) return "+92" + digits.slice(1);
    return "+92" + digits;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2()) setStep(3);
    } else if (step === 3) {
      if (validateAll()) handleRegister();
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleLoginLink = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isEmbedded) return;
    event.preventDefault();
    window.parent.postMessage({ type: "show-login" }, window.location.origin);
  };

  // Education helpers
  const addEducation = () => {
    setEducation(prev => [...prev, { id: Date.now().toString(), degree: "", institute: "", passingYear: "" }]);
  };
  const removeEducation = (id: string) => {
    if (education.length > 1) {
      setEducation(prev => prev.filter(e => e.id !== id));
    }
  };
  const updateEducation = (id: string, field: string, value: string) => {
    setEducation(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  // Experience helpers
  const addExperience = () => {
    setExperience(prev => [...prev, { id: Date.now().toString(), employer: "", jobTitle: "", startDate: "", currentlyWorking: false, endDate: "", responsibilities: "" }]);
  };
  const removeExperience = (id: string) => {
    if (experience.length > 1) {
      setExperience(prev => prev.filter(e => e.id !== id));
    }
  };
  const updateExperience = (id: string, field: string, value: string | boolean) => {
    setExperience(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: value };
      // Auto-clear endDate when "Currently working here" is checked
      if (field === "currentlyWorking" && value === true) {
        updated.endDate = "";
      }
      return updated;
    }));
  };

  const handleRegister = async () => {
    if (!validateAll()) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          cnic: cnic.trim(),
          gender,
          marital_status: maritalStatus,
          nationality: nationality.trim(),
          religion: religion.trim(),
          personal_phone: toPKPhone(phone),
          personal_email: email.trim().toLowerCase(),
          dob,
          current_working_sector: currentWorkingSector.trim() || null,
          emergency_name: emergencyName.trim() || null,
          emergency_phone: emergencyPhone ? toPKPhone(emergencyPhone) : null,
          residential_address: residentialAddress.trim() || null,
          permanent_address: permanentAddress.trim() || null,
          city: city.trim() || null,
          bio: bio.trim() || null,
          education: education.filter(e => e.degree || e.institute || e.passingYear).map(e => ({
            degree: e.degree,
            institute: e.institute,
            passing_year: e.passingYear,
          })),
          experience: experience.filter(e => e.employer || e.jobTitle || e.startDate).map(e => ({
            employer: e.employer,
            job_title: e.jobTitle,
            start_date: e.startDate,
            currently_working: e.currentlyWorking,
            end_date: e.currentlyWorking ? null : e.endDate,
            responsibilities: e.responsibilities,
          })),
        }),
      });
      const data = await response.json();

      if (response.ok) {
        toast.success("Employee created successfully");
        if (window.parent !== window) {
          window.parent.postMessage({ type: "employee-created" }, window.location.origin);
        } else {
          router.push("/login");
        }
      } else if (data.field_errors) {
        setErrors(data.field_errors);
        // Jump back to the earliest step that actually shows one of these
        // fields, so a server-only error (duplicate CNIC/email) doesn't sit
        // invisible on a step that isn't rendered.
        const errorSteps = Object.keys(data.field_errors)
          .map((key) => FIELD_STEP[key])
          .filter((s): s is Step => !!s);
        if (errorSteps.length) setStep(Math.min(...errorSteps) as Step);
        const firstMessage = Object.values(data.field_errors)[0];
        toast.error(typeof firstMessage === "string" ? firstMessage : "Please fix the highlighted fields");
      } else {
        const detail = data.detail;
        let msg: string = data.error || "Registration failed";
        if (typeof detail === "string") msg = detail;
        else if (Array.isArray(detail)) {
          msg = detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ") || "Invalid data submitted";
          // Raw Pydantic validation errors carry a `loc` array ending in the
          // field name — same step-jump treatment as field_errors above.
          const detailSteps = detail
            .map((d: { loc?: unknown[] }) => (Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null))
            .map((field) => (typeof field === "string" ? FIELD_STEP[field] : undefined))
            .filter((s): s is Step => !!s);
          if (detailSteps.length) setStep(Math.min(...detailSteps) as Step);
        }
        toast.error(msg);
      }
    } catch {
      toast.error("Backend connection is currently unavailable.");
    } finally {
      setIsLoading(false);
    }
  };

  const errorClass = "text-xs text-red-500 mt-1 font-medium";

  return (
    <div className={`min-h-screen flex items-center justify-center ${isEmbedded ? "bg-white p-0" : "bg-slate-50 p-6"}`}>
      <div className={`w-full ${isEmbedded ? "max-w-none" : "max-w-4xl md:flex rounded-2xl border border-gray-100 shadow-sm"} bg-white overflow-hidden`}>

        {/* ═══ LEFT — branding ═══ */}
        {!isEmbedded && <div className="md:w-[38%] shrink-0 bg-theme-900 p-10 flex flex-col">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-white">
              <img src="/logo.png" alt="HRMS logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">HRMS</span>
          </div>

          <div className="mt-9">
            <h2 className="text-2xl font-bold text-white leading-tight">Human Resource Management System</h2>
            <p className="mt-2 text-sm text-theme-100/70 leading-relaxed max-w-xs">
              Add a new employee to the system. They will receive their credentials after approval.
            </p>
          </div>

          <div className="mt-6 border-t border-white/10" />

          <div className="mt-6 flex flex-col gap-1.5">
            {features.map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5"
              >
                <div className="w-7 h-7 rounded-lg bg-theme-600/40 flex items-center justify-center shrink-0">
                  <Icon size={13} className="text-theme-300" />
                </div>
                <span className="text-xs font-semibold text-white">{label}</span>
                <span className="text-[11px] text-theme-100/50 ml-auto">{sub}</span>
              </div>
            ))}
          </div>

          <p className="mt-auto pt-8 text-[10px] font-semibold uppercase tracking-wider text-theme-100/30">
            Idara al-Khair NGO · ERP Suite
          </p>
        </div>}

        {/* ═══ RIGHT — form ═══ */}
        <div className={`flex-1 p-6 sm:p-10 flex flex-col overflow-y-auto ${isEmbedded ? "max-h-full" : "max-h-[90vh]"}`}>

          {/* Stepper */}
          <ol className="flex items-start mb-7">
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

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              {step === 1 ? "Create New Employee" : step === 2 ? "Contact & Address" : "History"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">{stepSubtitle[step]}</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="flex flex-col gap-4">
            {step === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="form-label">Full Name <span className="text-rose-500 ml-0.5">*</span></label>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text" required value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Muhammad Ali"
                      className="form-input pl-10"
                    />
                  </div>
                  {errors.full_name && <p className={errorClass}>{errors.full_name}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label className="form-label">CNIC <span className="text-rose-500 ml-0.5">*</span></label>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                    <CNICInput
                      value={cnic}
                      onChange={setCnic}
                      placeholder="12345-1234567-1"
                      className="form-input pl-10"
                    />
                  </div>
                  {errors.cnic && <p className={errorClass}>{errors.cnic}</p>}
                </div>

                <div>
                  <label className="form-label">Gender <span className="text-rose-500 ml-0.5">*</span></label>
                  <div className="relative">
                    <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                    <select
                      required value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="form-input pl-10"
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {errors.gender && <p className={errorClass}>{errors.gender}</p>}
                </div>

                <div>
                  <label className="form-label">Marital Status</label>
                  <div className="relative">
                    <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                    <select
                      value={maritalStatus}
                      onChange={(e) => setMaritalStatus(e.target.value)}
                      className="form-input pl-10"
                    >
                      <option value="">Select Status</option>
                      <option value="single">Single</option>
                      <option value="married">Married</option>
                      <option value="divorced">Divorced</option>
                      <option value="widowed">Widowed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label">Nationality</label>
                  <div className="relative">
                    <Shield size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text" value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      placeholder="e.g., Pakistani"
                      className="form-input pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Religion</label>
                  <div className="relative">
                    <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text" value={religion}
                      onChange={(e) => setReligion(e.target.value)}
                      placeholder="e.g., Islam"
                      className="form-input pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Phone Number <span className="text-rose-500 ml-0.5">*</span></label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      placeholder="0321-1234567"
                      className="form-input pl-10"
                    />
                  </div>
                  {errors.personal_phone && <p className={errorClass}>{errors.personal_phone}</p>}
                </div>

                <div>
                  <label className="form-label">Date of Birth <span className="text-rose-500 ml-0.5">*</span></label>
                  <div className="relative">
                    <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="date" required value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="form-input pl-10"
                      max={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  {errors.dob && <p className={errorClass}>{errors.dob}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label className="form-label">Current Working Sector</label>
                  <div className="relative">
                    <Briefcase size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={currentWorkingSector}
                      onChange={(e) => setCurrentWorkingSector(e.target.value)}
                      placeholder="e.g., AIT, Campus1,Hospital"
                      className="form-input pl-10"
                    />
                  </div>
                  {errors.current_working_sector && <p className={errorClass}>{errors.current_working_sector}</p>}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Personal Email <span className="text-rose-500 ml-0.5">*</span></label>
                  <EmailInput
                    value={email}
                    onChange={setEmail}
                    defaultDomain="@gmail.com"
                    hasError={!!errors.personal_email}
                  />
                  {errors.personal_email && <p className={errorClass}>{errors.personal_email}</p>}
                </div>

                <div>
                  <label className="form-label">Emergency Contact Name</label>
                  <div className="relative">
                    <UserCheck size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text" value={emergencyName}
                      onChange={(e) => setEmergencyName(e.target.value)}
                      placeholder="Emergency contact person"
                      className="form-input pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">City</label>
                  <div className="relative">
                    <Building size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text" value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g., Karachi"
                      className="form-input pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Emergency Contact Phone</label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                    <PhoneInput
                      value={emergencyPhone}
                      onChange={setEmergencyPhone}
                      placeholder="0321-1234567"
                      className="form-input pl-10"
                    />
                  </div>
                  {errors.emergency_phone && <p className={errorClass}>{errors.emergency_phone}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label className="form-label">Residential Address</label>
                  <textarea
                    value={residentialAddress}
                    onChange={(e) => setResidentialAddress(e.target.value)}
                    rows={2}
                    className="form-input h-auto py-2.5 resize-y"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="form-label">Permanent Address</label>
                  <textarea
                    value={permanentAddress}
                    onChange={(e) => setPermanentAddress(e.target.value)}
                    rows={2}
                    className="form-input h-auto py-2.5 resize-y"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="form-label">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={2}
                    className="form-input h-auto py-2.5 resize-y"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <>
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">Education</h3>
                    <button
                      type="button"
                      onClick={addEducation}
                      className="inline-flex items-center gap-1 text-sm font-medium text-theme-800 hover:text-theme-900"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>

                  {education.map((edu) => (
                    <div key={edu.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px_auto] gap-3 mb-3 items-start">
                      <input
                        value={edu.degree}
                        onChange={(e) => updateEducation(edu.id, "degree", e.target.value)}
                        placeholder="Degree (e.g., BSc Computer Science)"
                        className="form-input"
                      />
                      <input
                        value={edu.institute}
                        onChange={(e) => updateEducation(edu.id, "institute", e.target.value)}
                        placeholder="Institute (e.g., University of Karachi)"
                        className="form-input"
                      />
                      <input
                        value={edu.passingYear}
                        onChange={(e) => updateEducation(edu.id, "passingYear", e.target.value)}
                        placeholder="YYYY"
                        maxLength={4}
                        className="form-input"
                      />
                      {education.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEducation(edu.id)}
                          className="p-2.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}

                  {education.map((edu, i) => errors[`education.${i}.degree`] && (
                    <p key={`edu-deg-${i}`} className={errorClass}>{errors[`education.${i}.degree`]}</p>
                  ))}
                  {education.map((edu, i) => errors[`education.${i}.institute`] && (
                    <p key={`edu-inst-${i}`} className={errorClass}>{errors[`education.${i}.institute`]}</p>
                  ))}
                  {education.map((edu, i) => errors[`education.${i}.passingYear`] && (
                    <p key={`edu-year-${i}`} className={errorClass}>{errors[`education.${i}.passingYear`]}</p>
                  ))}
                </section>

                <section className="pt-6 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">Work Experience</h3>
                    <button
                      type="button"
                      onClick={addExperience}
                      className="inline-flex items-center gap-1 text-sm font-medium text-theme-800 hover:text-theme-900"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>

                  {experience.map((exp, i) => (
                    <div key={exp.id} className="space-y-3 mb-4 p-4 border border-slate-200 rounded-lg">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          value={exp.employer}
                          onChange={(e) => updateExperience(exp.id, "employer", e.target.value)}
                          placeholder="Employer (e.g., ABC Pvt Ltd)"
                          className="form-input"
                        />
                        <input
                          value={exp.jobTitle}
                          onChange={(e) => updateExperience(exp.id, "jobTitle", e.target.value)}
                          placeholder="Job Title"
                          className="form-input"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="form-label">Start Date <span className="text-rose-500 ml-0.5">*</span></label>
                          <input
                            type="date"
                            value={exp.startDate}
                            onChange={(e) => updateExperience(exp.id, "startDate", e.target.value)}
                            className="form-input"
                          />
                          {errors[`experience.${i}.startDate`] && <p className={errorClass}>{errors[`experience.${i}.startDate`]}</p>}
                        </div>

                        <div>
                          <label className="form-label">End Date</label>
                          <input
                            type="date"
                            value={exp.endDate}
                            onChange={(e) => updateExperience(exp.id, "endDate", e.target.value)}
                            disabled={exp.currentlyWorking}
                            className="form-input"
                          />
                          {errors[`experience.${i}.endDate`] && <p className={errorClass}>{errors[`experience.${i}.endDate`]}</p>}
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={exp.currentlyWorking}
                          onChange={(e) => updateExperience(exp.id, "currentlyWorking", e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-theme-800 focus:ring-theme-800/50"
                        />
                        <span>Currently working here</span>
                      </label>

                      <textarea
                        value={exp.responsibilities}
                        onChange={(e) => updateExperience(exp.id, "responsibilities", e.target.value)}
                        rows={2}
                        placeholder="Responsibilities"
                        className="form-input h-auto py-2.5 resize-y"
                      />
                      {experience.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeExperience(exp.id)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-rose-600 hover:text-rose-700"
                        >
                          <Trash2 size={14} /> Remove
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              </>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between gap-3 mt-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={isLoading || step === 1}
                className="btn-secondary min-w-[120px]"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary min-w-[160px]"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : step === 3 ? (
                  <>
                    <UserPlus size={16} />
                    Create Employee
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    Next Step
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>

          {step === 1 && (
            <p className="text-center text-sm text-slate-400 mt-6">
              Already have an account?{" "}
              <a href="/login" onClick={handleLoginLink} className="text-theme-800 font-semibold hover:underline">
                Log In
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

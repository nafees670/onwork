"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchWithAuth } from "@/utils/api";

export interface Assignment {
  institution?: string;
  branch_name?: string;
  department?: string;
  designation?: string;
  shift?: string;
  joining_date?: string;
  is_primary?: boolean;
}

export interface WorkExperience {
  employer?: string;
  jobTitle?: string;
  startDate?: string;
  endDate?: string;
  currentlyWorking?: boolean;
  responsibilities?: string;
}

export interface EmployeeData {
  id: string;
  employee_id: string;
  full_name: string;
  personal_email: string;
  personal_phone: string;
  cnic: string;
  dob: string;
  gender: string;
  city: string;
  residential_address: string;
  employment_type: string;
  status: string;
  created_at: string;
  department?: string;
  designation?: string;
  nationality?: string;
  marital_status?: string;
  religion?: string;
  current_working_sector?: string;
  emergency_contact?: { name?: string; phone?: string };
  address?: { residential?: string; permanent?: string; city?: string };
  education_history?: { degree?: string; institute?: string; passingYear?: string }[];
  work_experience?: WorkExperience[];
  assignments?: Assignment[];
  resume_url?: string;
  bank_info?: { bank_name?: string; account_number?: string };
}

/**
 * Shared self-service data for a logged-in employee's own record — used by
 * the Overview, My Placement, and My Profile pages so they all read the
 * same fetch instead of triple-fetching (and drifting) independently.
 * Redirects a superadmin away, same as the old single-page dashboard did.
 */
export function useEmployeeSelf() {
  const { user, hydrated } = useAuth();
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && user?.is_superadmin) {
      window.location.href = "/";
    }
  }, [user, hydrated]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const meRes = await fetchWithAuth("/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          const empId = meData.employee_id || meData.id;
          if (empId && !meData.is_superadmin) {
            const empRes = await fetchWithAuth(`/employees/employees/${empId}`);
            if (empRes.ok) {
              setEmployee(await empRes.json());
            }
          }
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const status = user?.status || employee?.status || "active";

  return {
    user,
    hydrated,
    employee,
    setEmployee,
    loading,
    status,
    isPending: status === "pending_approval",
    isRejected: status === "rejected",
    isSuspended: status === "suspended",
    isActive: status === "active",
  };
}

export function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

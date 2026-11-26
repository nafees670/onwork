"use client";

import React, { useEffect, useState } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import { Building, Search, Info } from "lucide-react";

type Organization = {
  id: string;
  name: string;
  org_code: string;
  description?: string;
  created_at?: string;
};

function RowSkeleton() {
  return <div className="animate-pulse bg-slate-100 rounded h-4 w-full" />;
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/employees/organizations');
      if (res.ok) {
        const data = await res.json();
        setOrganizations(Array.isArray(data) ? data : (data.organizations || []));
      }
    } catch (err) {
      console.error("Failed to load organizations:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filtered = organizations.filter(o =>
    o.name?.toLowerCase().includes(search.toLowerCase()) ||
    o.org_code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ProtectedLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="page-title">Organizations</h1>
          <p className="page-subtitle">Root organizational entities in the system</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-10 max-w-sm"
          />
        </div>

        <div className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="ui-table-head">Organization</th>
                  <th className="ui-table-head">Code</th>
                  <th className="ui-table-head">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  [1, 2, 3].map(i => (
                    <tr key={i}><td colSpan={3} className="px-5 py-4"><RowSkeleton /></td></tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-16 text-center text-sm text-slate-400">
                      No organizations found.
                    </td>
                  </tr>
                ) : filtered.map(org => (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="ui-table-cell">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-blue-50 text-theme-800 flex items-center justify-center shrink-0">
                          <Building size={16} />
                        </div>
                        <p className="font-semibold text-slate-800">{org.name}</p>
                      </div>
                    </td>
                    <td className="ui-table-cell">{org.org_code}</td>
                    <td className="ui-table-cell text-slate-500">{org.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-start gap-3 text-sm text-slate-500 bg-slate-50 rounded-xl p-4 border border-slate-100">
          <Info size={16} className="text-slate-400 mt-0.5 shrink-0" />
          <p>
            Organizations are root entities. To manage institutions, branches, or departments underneath them, use those pages under the Organization group in the sidebar.
          </p>
        </div>
      </div>
    </ProtectedLayout>
  );
}

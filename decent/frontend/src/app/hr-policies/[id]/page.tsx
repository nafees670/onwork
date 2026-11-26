"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import PdfViewer from "@/components/PdfViewer";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Policy {
  id: string;
  title: string;
  description: string;
  file_type: "pptx" | "docx";
  updated_at: string;
}

export default function HRPolicyViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchWithAuth("/hr-policy/policies");
        if (res.ok) {
          const all: Policy[] = await res.json();
          setPolicy(all.find((p) => p.id === params.id) || null);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  return (
    <ProtectedLayout>
      <div className="max-w-5xl mx-auto p-6 sm:p-8 space-y-6">
        <button
          onClick={() => router.push("/hr-policies")}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={15} /> Back to HR Policies
        </button>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-slate-300" />
          </div>
        ) : !policy ? (
          <div className="ui-card p-10 text-center">
            <p className="text-sm text-slate-400">Policy not found.</p>
          </div>
        ) : (
          <>
            <div>
              <h1 className="page-title">{policy.title}</h1>
              {policy.description && <p className="page-subtitle">{policy.description}</p>}
            </div>

            <div className="ui-card p-6">
              <PdfViewer endpoint={`/hr-policy/policies/${policy.id}/view`} />
            </div>
          </>
        )}
      </div>
    </ProtectedLayout>
  );
}

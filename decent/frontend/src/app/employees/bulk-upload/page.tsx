"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileText, UploadCloud, X } from "lucide-react";
import toast from "react-hot-toast";
import ProtectedLayout from "@/components/ProtectedLayout";
import { fetchWithAuth } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import AccessDenied from "@/components/AccessDenied";

type UploadResult = { total: number; created_count: number; failed_count: number; errors: { row: number; name?: string; errors: string[] }[] };

export default function EmployeeBulkUploadPage() {
  const { user, hasPermission } = useAuth();
  const isSuperadmin = !!user?.is_superadmin;
  const canCreate = isSuperadmin || hasPermission("employee.create");

  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  function choose(candidate?: File) {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".csv")) return toast.error("Please select a CSV file");
    setFile(candidate); setResult(null);
  }

  async function downloadTemplate() {
    const response = await fetchWithAuth("/employees/employees/bulk-upload/template");
    if (!response.ok) return toast.error("Template download failed");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "employee_bulk_upload_template.csv"; anchor.click();
    URL.revokeObjectURL(url);
  }

  async function upload() {
    if (!file) return toast.error("Select a CSV file first");
    setUploading(true); setResult(null);
    const form = new FormData(); form.append("file", file);
    try {
      const response = await fetchWithAuth("/employees/employees/bulk-upload", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(body.error || "Upload failed");
      setResult(body);
      if (body.created_count) toast.success(`${body.created_count} employee(s) added to Pending Approval`);
      if (body.failed_count) toast.error(`${body.failed_count} row(s) need correction`);
    } finally { setUploading(false); }
  }

  if (!canCreate) {
    return (
      <ProtectedLayout>
        <AccessDenied permission="employee.create" />
      </ProtectedLayout>
    );
  }

  return <ProtectedLayout>
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/employees" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 transition-colors"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="page-title">Bulk Upload Employees</h1>
          <p className="page-subtitle">Import basic employee records into Pending Approval.</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="ui-card p-6">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-theme-800"><FileText size={20} /></div>
          <h2 className="text-lg font-semibold text-slate-900">Prepare your CSV</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-600">
            <li>Download the template and keep its header names unchanged.</li>
            <li>Required: organization_code, full_name, cnic, dob and gender.</li>
            <li>Use YYYY-MM-DD for DOB and male, female or other for gender.</li>
            <li>Each valid row creates a basic pending employee only. Assignment and login are completed later.</li>
          </ol>
          <button onClick={downloadTemplate} className="btn-primary mt-6"><Download size={16} /> Download CSV Template</button>
        </section>
        <section className="ui-card p-6">
          <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()} className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-theme-800 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-theme-800"}`}>
            <UploadCloud size={36} className="mb-4 text-theme-800" />
            <h2 className="font-semibold text-slate-900">Drop CSV file here</h2>
            <p className="mt-2 text-xs text-slate-500">or click to browse — maximum 5 MB</p>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => choose(e.target.files?.[0])} />
          </div>
          {file && <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm font-medium"><span>{file.name}</span><button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-600"><X size={17} /></button></div>}
          <button disabled={!file || uploading} onClick={upload} className="btn-primary w-full mt-4">{uploading ? "Uploading…" : "Upload Employees"}</button>
        </section>
      </div>
      {result && <section className="ui-card p-5">
        <div className="flex flex-wrap gap-5 text-sm font-medium">
          <span className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={18} /> {result.created_count} created</span>
          <span className="flex items-center gap-2 text-rose-600"><AlertTriangle size={18} /> {result.failed_count} failed</span>
        </div>
        {result.errors.length > 0 && <div className="mt-4 max-h-64 space-y-2 overflow-auto">{result.errors.map(error => <div key={error.row} className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700"><b>Row {error.row}{error.name ? ` · ${error.name}` : ""}:</b> {error.errors.join("; ")}</div>)}</div>}
      </section>}
    </div>
  </ProtectedLayout>;
}

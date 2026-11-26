"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function PasswordPageShell({
  title,
  description,
  children,
  showBack = true,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  showBack?: boolean;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="bg-theme-900 px-7 py-7 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden bg-white">
              <img src="/logo.png" alt="HRMS logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">HRMS</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-theme-100/70">Secure account access</p>
            </div>
          </div>
        </div>
        <div className="px-7 py-8">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-theme-800">
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          <div className="mt-7">{children}</div>
          {showBack && (
            <Link href="/login" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-theme-800 hover:underline">
              <ArrowLeft size={15} aria-hidden="true" /> Back to login
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

"use client";

import React, { useState, useRef } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { useAuth, resolveAdminLandingUrl } from "@/context/AuthContext";
import Link from "next/link";
import { User, Mail, Building, Camera, Calendar, ArrowLeft } from "lucide-react";

export default function ProfilePage() {
  const { user, activePortal } = useAuth();

  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (!user) return null;

  const roleText = user.is_superadmin
    ? "System Administrator"
    : user.designation || "User";
  const roleDesc = user.is_superadmin
    ? "Full system access and management"
    : "Standard system access and management";
  const memberSince = "29/04/2026";

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageUrl = URL.createObjectURL(file);
    setPreviewImage(imageUrl);
    setMessage("Profile picture updated locally.");
    setTimeout(() => setMessage(""), 3000);
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <ProtectedLayout>
      <div className="max-w-7xl mx-auto p-6 sm:p-8">
        <div className="max-w-2xl mx-auto">

          <div className="mb-4">
            <Link
              href={activePortal === 'admin' ? (user ? resolveAdminLandingUrl(user) : '/') : '/dashboard'}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft size={15} />
              {activePortal === 'admin' ? "Back to Workspace" : "Back to Dashboard"}
            </Link>
          </div>

          <div className="ui-card overflow-hidden">

            {/* Header */}
            <div className="flex flex-col items-center text-center px-6 pt-8 pb-5">
              <div className="h-14 w-14 bg-theme-800 rounded-full flex items-center justify-center mb-3">
                <User size={22} className="text-white" strokeWidth={2} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Profile Settings</h1>
              <p className="text-sm text-slate-500 mt-1">Manage your account information and preferences</p>
            </div>

            {message && (
              <div className="mx-6 mb-2 p-2.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium text-center border border-emerald-100">
                {message}
              </div>
            )}

            <div className="px-6 sm:px-8 pb-8 space-y-6">

              {/* ── Personal Information ── */}
              <section>
                <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-3 border-b border-gray-100">
                  Personal Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                      <User size={12} /> Full Name
                    </label>
                    <div className="w-full bg-gray-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 font-medium truncate">
                      {user.full_name}
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                      <Mail size={12} /> Email Address
                    </label>
                    <div className="w-full bg-gray-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 font-medium truncate">
                      {user.email}
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                      <Building size={12} /> Department
                    </label>
                    <div className="w-full bg-gray-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 font-medium truncate">
                      {user.department || "Unassigned"}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">
                      Role
                    </label>
                    <div className="w-full bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-sm text-theme-800 font-semibold truncate">
                      {user.is_superadmin ? "Admin" : (user.designation || "User")}
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Profile Picture ── */}
              <section className="border-t border-gray-100 pt-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Profile Picture</h3>

                <div className="bg-gray-50 border border-slate-100 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-4">
                  <div className="h-20 w-20 shrink-0 rounded-2xl bg-white flex items-center justify-center text-2xl font-bold text-theme-800 border border-slate-100 overflow-hidden">
                    {previewImage ? (
                      <img src={previewImage} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      user.full_name?.charAt(0)
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-xs text-slate-500 mb-3 leading-relaxed max-w-xs mx-auto sm:mx-0">
                      Update your profile picture to help people recognize you easily. The image will appear across all pages.
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <button onClick={triggerImageUpload} className="btn-secondary py-2 px-3.5 text-xs">
                      <Camera size={14} /> Upload Picture
                    </button>
                  </div>
                </div>
              </section>

              {/* ── Role Information ── */}
              <section className="border-t border-gray-100 pt-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Role Information</h3>

                <div className="bg-gray-50 border border-slate-100 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900 font-semibold truncate">{roleText}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{roleDesc}</p>
                  </div>

                  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-100 text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
                    <Calendar size={13} className="text-theme-800" />
                    <span>Since {memberSince}</span>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}

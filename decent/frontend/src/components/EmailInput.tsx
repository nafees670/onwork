"use client";

import React, { useEffect, useState } from "react";
import { Mail, ChevronDown } from "lucide-react";

interface EmailInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  defaultDomain?: string;
  hasError?: boolean;
}

const COMMON_DOMAINS = [
  "@gmail.com",
  "@yahoo.com",
  "@outlook.com",
  "@hotmail.com",
  "@iak.ngo",
];

export default function EmailInput({
  value = "",
  onChange,
  onBlur,
  placeholder = "username",
  className = "",
  id,
  disabled = false,
  defaultDomain = "@gmail.com",
  hasError = false,
}: EmailInputProps) {
  // Parse incoming value into username and domain
  const parseEmail = (emailStr: string) => {
    if (!emailStr) return { user: "", dom: defaultDomain };
    const atIndex = emailStr.indexOf("@");
    if (atIndex === -1) {
      return { user: emailStr, dom: defaultDomain };
    }
    const user = emailStr.slice(0, atIndex);
    const dom = emailStr.slice(atIndex);
    return { user, dom: dom || defaultDomain };
  };

  const initial = parseEmail(value);
  const [username, setUsername] = useState(initial.user);
  const [domain, setDomain] = useState(initial.dom);

  // Sync with external value changes (e.g. form reset or prefilled data)
  useEffect(() => {
    const { user, dom } = parseEmail(value);
    setUsername(user);
    if (dom) setDomain(dom);
  }, [value, defaultDomain]);

  const emitChange = (newUser: string, newDom: string) => {
    const trimmedUser = newUser.trim().replace(/\s+/g, "");
    if (!trimmedUser) {
      onChange?.("");
    } else {
      onChange?.(`${trimmedUser}${newDom}`);
    }
  };

  const handleUserChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // If user typed or pasted an @, smartly extract the domain if present
    if (raw.includes("@")) {
      const parts = raw.split("@");
      const cleanUser = parts[0];
      const potentialDomain = parts[1] ? `@${parts[1]}` : domain;
      setUsername(cleanUser);
      setDomain(potentialDomain);
      emitChange(cleanUser, potentialDomain);
    } else {
      setUsername(raw);
      emitChange(raw, domain);
    }
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDom = e.target.value;
    setDomain(newDom);
    emitChange(username, newDom);
  };

  const availableDomains = Array.from(
    new Set([
      defaultDomain,
      ...COMMON_DOMAINS,
      ...(domain ? [domain] : []),
    ])
  );

  return (
    <div
      className={`relative flex items-stretch w-full rounded-lg border transition-all overflow-hidden ${
        hasError
          ? "border-rose-400 bg-rose-50/40 text-rose-900 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500"
          : "border-slate-200 bg-white text-slate-900 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
      } ${disabled ? "opacity-60 bg-slate-50 cursor-not-allowed" : ""} ${className}`}
    >
      <div className="flex items-center pl-3 pr-1 text-slate-400 pointer-events-none select-none">
        <Mail size={16} />
      </div>

      <input
        type="text"
        id={id}
        value={username}
        onChange={handleUserChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full min-w-0 px-2 py-2 text-sm bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
      />

      <div className="relative flex items-center bg-slate-50 border-l border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold select-none group hover:bg-slate-100 transition-colors">
        <select
          value={domain}
          onChange={handleDomainChange}
          disabled={disabled}
          className="appearance-none bg-transparent pl-3 pr-7 py-2 font-medium text-xs sm:text-sm text-slate-700 cursor-pointer outline-none focus:text-blue-600"
          title="Select email domain"
        >
          {availableDomains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2 text-slate-400 pointer-events-none group-hover:text-slate-600 transition-colors"
        />
      </div>
    </div>
  );
}

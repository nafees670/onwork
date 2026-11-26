"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithAuth } from "@/utils/api";
import { Search, X, Users } from "lucide-react";

type EmployeeOption = {
    employee_id: string;
    full_name: string;
    email?: string;
    designation?: { position_name?: string } | null;
    department?: { dept_name?: string } | null;
};

interface EmployeeSelectProps {
    value: string;
    onChange: (employee_id: string) => void;
    placeholder?: string;
    disabled?: boolean;
    autoFocus?: boolean;
}

export default function EmployeeSelect({
    value,
    onChange,
    placeholder = "Search by name or employee ID...",
    disabled = false,
    autoFocus = false,
}: EmployeeSelectProps) {
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<EmployeeOption[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedName, setSelectedName] = useState("");
    const [forbidden, setForbidden] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // When a value is provided but name unknown (e.g. after reload), try to resolve it.
    const resolveName = useCallback(async (employeeId: string) => {
        if (!employeeId) { setSelectedName(""); return; }
        try {
            const res = await fetchWithAuth(`/employees/employees?search=${encodeURIComponent(employeeId)}&per_page=5`);
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.employees || []);
                const hit = list.find((e: EmployeeOption) => e.employee_id === employeeId);
                if (hit) setSelectedName(`${hit.full_name} (${hit.employee_id})`);
                else setSelectedName(employeeId);
            } else if (res.status === 403) setForbidden(true);
        } catch { setSelectedName(employeeId); }
    }, []);

    useEffect(() => { resolveName(value); }, [value, resolveName]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    const search = useCallback(async (q: string) => {
        if (!q.trim()) { setOptions([]); setLoading(false); return; }
        setLoading(true);
        try {
            const res = await fetchWithAuth(`/employees/employees?search=${encodeURIComponent(q)}&per_page=20`);
            if (res.status === 403) { setForbidden(true); setOptions([]); return; }
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.employees || []);
                setOptions(list);
            }
        } catch {
            setOptions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const onInput = (val: string) => {
        setQuery(val);
        setOpen(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(val), 300);
    };

    const [highlightedIndex, setHighlightedIndex] = useState(0);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [options]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open || options.length === 0) {
            if (e.key === "Enter" && query.trim()) {
                e.preventDefault();
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev + 1) % options.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            const target = options[highlightedIndex] || options[0];
            if (target) {
                select(target);
            }
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    const select = (emp: EmployeeOption) => {
        setQuery("");
        setOpen(false);
        setSelectedName(`${emp.full_name} (${emp.employee_id})`);
        onChange(emp.employee_id);
    };

    const clear = () => {
        setQuery("");
        setSelectedName("");
        setOpen(false);
        onChange("");
    };

    return (
        <div ref={containerRef} className="relative">
            <input
                ref={inputRef}
                type="text"
                value={selectedName || query}
                onChange={(e) => onInput(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => { setOpen(true); if (!query) search(""); }}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus={autoFocus}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {loading ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
                ) : selectedName ? (
                    <button type="button" onClick={clear} title="Clear" className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                    </button>
                ) : (
                    <Search size={14} className="text-gray-400" />
                )}
            </div>

            {open && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                    {forbidden && (
                        <p className="px-4 py-3 text-sm text-red-600">Permission denied — cannot search employees.</p>
                    )}
                    {!forbidden && !loading && query && options.length === 0 && (
                        <p className="px-4 py-3 text-sm text-gray-500">No employees found.</p>
                    )}
                    {options.map((emp, idx) => (
                        <button
                            key={emp.employee_id}
                            type="button"
                            onClick={() => select(emp)}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            className={`flex w-full items-start gap-2 px-4 py-2.5 text-left transition-colors ${
                                idx === highlightedIndex ? "bg-indigo-50" : "hover:bg-gray-50"
                            }`}
                        >
                            <Users size={15} className="mt-0.5 shrink-0 text-indigo-500" />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium text-gray-900">{emp.full_name}</span>
                                <span className="block text-xs text-gray-500">
                                    {emp.employee_id}
                                    {emp.designation?.position_name ? ` · ${emp.designation.position_name}` : ""}
                                    {emp.department?.dept_name ? ` · ${emp.department.dept_name}` : ""}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
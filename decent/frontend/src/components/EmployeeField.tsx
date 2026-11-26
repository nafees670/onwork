import React from "react";

export default function EmployeeField({
  label, icon: Icon, value, onChange, editable, type = "text", select, options,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string;
  onChange?: (v: string) => void;
  editable?: boolean;
  type?: string;
  select?: boolean;
  options?: string[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{label}</p>
      {editable ? (
        select ? (
          <select
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className="form-input"
          >
            <option value="">Select {label}</option>
            {options?.map((opt) => (
              <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className="form-input"
          />
        )
      ) : (
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-800">{value || "—"}</p>
        </div>
      )}
    </div>
  );
}

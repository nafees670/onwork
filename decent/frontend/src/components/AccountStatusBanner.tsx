import { AlertTriangle, Lock } from "lucide-react";

export default function AccountStatusBanner({
  isPending,
  isRejected,
  isSuspended,
}: {
  isPending: boolean;
  isRejected: boolean;
  isSuspended: boolean;
}) {
  if (!isPending && !isRejected && !isSuspended) return null;

  if (isPending) {
    return (
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 text-amber-800 rounded-lg px-4 py-3">
        <AlertTriangle size={18} className="shrink-0 text-amber-500" />
        <div>
          <p className="font-semibold text-sm">Your account is pending admin approval</p>
          <p className="text-xs text-amber-600 mt-0.5">Some features are restricted until an administrator approves your registration.</p>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-100 text-red-700 rounded-lg px-4 py-3">
        <AlertTriangle size={18} className="shrink-0 text-red-500" />
        <div>
          <p className="font-semibold text-sm">Your registration was not approved</p>
          <p className="text-xs text-red-600 mt-0.5">Please contact administration for more information.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-100 text-red-700 rounded-lg px-4 py-3">
      <Lock size={18} className="shrink-0 text-red-500" />
      <div>
        <p className="font-semibold text-sm">Your account has been suspended</p>
        <p className="text-xs text-red-600 mt-0.5">Contact administration to resolve this issue.</p>
      </div>
    </div>
  );
}

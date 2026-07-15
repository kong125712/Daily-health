"use client";

import { CheckCircle2, XCircle } from "lucide-react";

export type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) {
    return null;
  }
  const Icon = toast.type === "error" ? XCircle : CheckCircle2;
  return (
    <div className="fixed inset-x-4 top-[calc(1rem+var(--app-safe-top))] z-50 mx-auto max-w-md rounded-md border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft sm:left-auto sm:right-6 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <Icon className={toast.type === "error" ? "h-5 w-5 text-berry" : "h-5 w-5 text-leaf"} aria-hidden="true" />
        <span className="break-words text-slate-800 dark:text-slate-100">{toast.message}</span>
      </div>
    </div>
  );
}

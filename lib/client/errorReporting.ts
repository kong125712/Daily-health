"use client";

import { mobileApiFetch, usesNativeMobileDatabase } from "@/lib/client/mobileSqlite";

type ReportClientErrorInput = {
  source: string;
  severity?: "info" | "warning" | "error";
  message: string;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  stack?: string | null;
  details?: Record<string, unknown> | null;
};

const recentReports = new Map<string, number>();

function currentProfileId() {
  try {
    return localStorage.getItem("daily_health_profile_id");
  } catch {
    return null;
  }
}

function currentPath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

function shouldSkipDuplicate(source: string, message: string, path: string | null) {
  const key = `${source}:${path ?? ""}:${message.slice(0, 180)}`;
  const now = Date.now();
  const lastSeenAt = recentReports.get(key) ?? 0;
  recentReports.set(key, now);
  return now - lastSeenAt < 5000;
}

export function errorToMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown client error";
  }
}

export function errorToStack(error: unknown) {
  return error instanceof Error ? error.stack ?? null : null;
}

export async function reportClientError(input: ReportClientErrorInput) {
  if (typeof window === "undefined") return;
  const path = input.path ?? currentPath();
  if (shouldSkipDuplicate(input.source, input.message, path)) return;

  const payload = {
    profileId: currentProfileId(),
    source: input.source,
    severity: input.severity ?? "error",
    message: input.message.slice(0, 1000),
    path,
    method: input.method ?? null,
    statusCode: input.statusCode ?? null,
    stack: input.stack?.slice(0, 4000) ?? null,
    userAgent: navigator.userAgent,
    details: input.details ?? null
  };

  try {
    if (usesNativeMobileDatabase()) {
      await mobileApiFetch("/api/error-logs", {
        method: "POST",
        profileId: payload.profileId,
        body: payload
      });
      return;
    }
    await fetch("/api/error-logs", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch {
    // Error reporting must never create a second user-facing error.
  }
}

import { prisma } from "@/lib/db";
import type { AppErrorLogView } from "@/lib/types/domain";
import type { z } from "zod";
import type { errorLogInputSchema } from "@/lib/validation/schemas";

type ErrorLogInput = z.infer<typeof errorLogInputSchema>;

function truncate(value: string | null | undefined, max: number) {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function parseDetails(detailsJson: string | null) {
  if (!detailsJson) return null;
  try {
    const parsed = JSON.parse(detailsJson) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function serializeErrorLog(log: {
  id: string;
  profileId: string | null;
  source: string;
  severity: string;
  message: string;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  stack: string | null;
  userAgent: string | null;
  detailsJson: string | null;
  createdAt: Date;
}): AppErrorLogView {
  return {
    id: log.id,
    profileId: log.profileId,
    source: log.source,
    severity: log.severity === "info" || log.severity === "warning" ? log.severity : "error",
    message: log.message,
    path: log.path,
    method: log.method,
    statusCode: log.statusCode,
    stack: log.stack,
    userAgent: log.userAgent,
    details: parseDetails(log.detailsJson),
    createdAt: log.createdAt.toISOString()
  };
}

export async function createErrorLog(input: ErrorLogInput & { userAgent?: string | null }) {
  const detailsJson = input.details ? truncate(JSON.stringify(input.details), 2000) : null;
  const log = await prisma.appErrorLog.create({
    data: {
      profileId: input.profileId || null,
      source: input.source,
      severity: input.severity,
      message: input.message,
      path: input.path || null,
      method: input.method || null,
      statusCode: input.statusCode ?? null,
      stack: truncate(input.stack, 4000),
      userAgent: truncate(input.userAgent, 500),
      detailsJson
    }
  });
  return serializeErrorLog(log);
}

export async function listRecentErrorLogs(limit = 12) {
  const logs = await prisma.appErrorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50)
  });
  return logs.map(serializeErrorLog);
}

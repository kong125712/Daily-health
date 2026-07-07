import { NextRequest } from "next/server";
import { createErrorLog, listRecentErrorLogs } from "@/lib/repositories/errorLogRepository";
import { handleRouteError, jsonOk, localeFromRequest, parseJson } from "@/lib/server/http";
import { errorLogInputSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "12");
    const logs = await listRecentErrorLogs(Number.isFinite(limit) ? limit : 12);
    return jsonOk({ logs });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function POST(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, errorLogInputSchema);
    const userAgent = body.userAgent ?? request.headers.get("user-agent");
    const log = await createErrorLog({ ...body, userAgent });
    return jsonOk({ log }, 201);
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

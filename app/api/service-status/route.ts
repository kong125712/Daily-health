import { NextRequest } from "next/server";
import { getServiceStatus } from "@/lib/services/serviceStatus";
import { handleRouteError, jsonOk, localeFromRequest } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const status = await getServiceStatus();
    return jsonOk(status);
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

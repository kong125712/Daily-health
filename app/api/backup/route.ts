import { NextRequest, NextResponse } from "next/server";
import { exportProfileBackup, importProfileBackup } from "@/lib/services/backupService";
import { backupImportRequestSchema } from "@/lib/validation/schemas";
import { handleRouteError, jsonOk, localeFromRequest, parseJson, profileIdFromRequest } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const profileId = profileIdFromRequest(request);
    if (!profileId) {
      return jsonOk({ error: "Missing profile id." }, 400);
    }
    const backup = await exportProfileBackup(profileId);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="daily-health-backup-${date}.json"`
      }
    });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function POST(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, backupImportRequestSchema);
    const summary = await importProfileBackup(body.profileId, body.backup);
    return jsonOk({ summary });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

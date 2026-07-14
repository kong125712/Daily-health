import { NextRequest } from "next/server";
import { updateAiSettings } from "@/lib/repositories/aiSettingsRepository";
import { getAiSettingsView } from "@/lib/services/aiConfiguration";
import { handleRouteError, jsonError, jsonOk, localeFromRequest, parseJson, profileIdFromRequest } from "@/lib/server/http";
import { aiSettingsUpdateSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const profileId = profileIdFromRequest(request);
    if (!profileId) return jsonError("Missing profile ID.", 400);
    return jsonOk({ aiSettings: await getAiSettingsView(profileId) });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function PATCH(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, aiSettingsUpdateSchema);
    await updateAiSettings(body);
    return jsonOk({ aiSettings: await getAiSettingsView(body.profileId) });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

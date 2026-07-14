import { NextRequest } from "next/server";
import { getOrCreateSettings, updateSettings } from "@/lib/repositories/settingsRepository";
import { serializeAppSettings } from "@/lib/repositories/serializers";
import { handleRouteError, jsonError, jsonOk, localeFromRequest, parseJson, profileIdFromRequest } from "@/lib/server/http";
import { settingsUpdateSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const profileId = profileIdFromRequest(request);
    if (!profileId) {
      return jsonError("Missing profile ID.", 400);
    }
    const settings = await getOrCreateSettings(profileId);
    return jsonOk({ settings: serializeAppSettings(settings) });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function PATCH(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, settingsUpdateSchema);
    const settings = await updateSettings(body);
    return jsonOk({ settings: serializeAppSettings(settings) });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

import { NextRequest } from "next/server";
import { ensureProfile, updateProfile } from "@/lib/repositories/profileRepository";
import { handleRouteError, jsonOk, localeFromRequest, parseJson, profileIdFromRequest } from "@/lib/server/http";
import { profileRequestSchema, profileUpdateSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const profileId = profileIdFromRequest(request);
    if (!profileId) {
      return jsonOk({ profile: null, settings: null }, 200);
    }
    const result = await ensureProfile(profileId);
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function POST(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, profileRequestSchema);
    const result = await ensureProfile(body.profileId);
    return jsonOk(result, 201);
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function PATCH(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, profileUpdateSchema);
    const profile = await updateProfile(body);
    return jsonOk({ profile });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

import { NextRequest } from "next/server";
import {
  deleteIngredientScan,
  getIngredientScan,
  updateRecognizedIngredients
} from "@/lib/repositories/ingredientScanRepository";
import { handleRouteError, jsonError, jsonOk, localeFromRequest, parseJson, profileIdFromRequest } from "@/lib/server/http";
import { deleteByIdSchema, updateScanSchema } from "@/lib/validation/schemas";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const locale = localeFromRequest(request);
  try {
    const profileId = profileIdFromRequest(request);
    if (!profileId) {
      return jsonError("Missing profile ID.", 400);
    }
    const { id } = await context.params;
    const scan = await getIngredientScan(profileId, id);
    if (!scan) {
      return jsonError("Scan not found.", 404);
    }
    return jsonOk({ scan });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, updateScanSchema);
    const { id } = await context.params;
    const scan = await updateRecognizedIngredients({
      profileId: body.profileId,
      scanId: id,
      ingredients: body.ingredients,
      confirmed: body.confirmed
    });
    if (!scan) {
      return jsonError("Scan not found.", 404);
    }
    return jsonOk({ scan });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const locale = localeFromRequest(request);
  try {
    const { id } = await context.params;
    const body = await parseJson(request, deleteByIdSchema);
    const deleted = await deleteIngredientScan(body.profileId, id);
    return jsonOk({ deleted });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

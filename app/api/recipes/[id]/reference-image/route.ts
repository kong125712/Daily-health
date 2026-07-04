import { NextRequest } from "next/server";
import { z } from "zod";
import { setRecipeReferenceImage } from "@/lib/repositories/recipeRepository";
import { handleRouteError, jsonError, jsonOk, localeFromRequest, parseJson } from "@/lib/server/http";
import { profileIdSchema, recipeReferenceImageSchema } from "@/lib/validation/schemas";

const referenceImageUpdateSchema = z.object({
  profileId: profileIdSchema,
  referenceImage: recipeReferenceImageSchema
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, referenceImageUpdateSchema);
    const { id } = await context.params;
    const recipe = await setRecipeReferenceImage({
      profileId: body.profileId,
      recipeId: id,
      referenceImage: body.referenceImage
    });
    if (!recipe) {
      return jsonError("Recipe not found.", 404);
    }
    return jsonOk({ recipe });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

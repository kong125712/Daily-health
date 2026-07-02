import { NextRequest } from "next/server";
import { getIngredientScan, saveEpicurePairings } from "@/lib/repositories/ingredientScanRepository";
import { createRecipes, getRecipe } from "@/lib/repositories/recipeRepository";
import { jsonMessageError, handleRouteError, jsonError, jsonOk, localeFromRequest, parseJson } from "@/lib/server/http";
import { getEpicurePairings } from "@/lib/services/epicureService";
import { generateRecipesWithOpenAI } from "@/lib/services/openaiService";
import type { RecognizedIngredientInput } from "@/lib/types/domain";
import { generateRecipesRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, generateRecipesRequestSchema);
    let ingredients: RecognizedIngredientInput[] = body.manualIngredients;
    let sourceScanId = body.scanId;

    if (body.scanId) {
      const scan = await getIngredientScan(body.profileId, body.scanId);
      if (!scan) {
        return jsonError("Scan not found.", 404);
      }
      ingredients = scan.ingredients;
      sourceScanId = scan.id;
    } else if (body.sourceRecipeId) {
      const recipe = await getRecipe(body.profileId, body.sourceRecipeId);
      if (!recipe) {
        return jsonError("Recipe not found.", 404);
      }
      ingredients = recipe.ingredients.map((ingredient) => ({
        normalizedName: ingredient.normalizedName,
        displayNameEn: ingredient.nameEn,
        displayNameZh: ingredient.nameZh,
        estimatedAmount: ingredient.amount,
        estimatedCalories: undefined,
        confidence: "medium",
        notes: ""
      }));
    }

    if (ingredients.length === 0) {
      return jsonError("Please provide at least one ingredient.", 400);
    }

    const epicure = await getEpicurePairings({
      ingredients,
      preferences: body.preferences
    });

    if (sourceScanId && epicure.pairings.length > 0) {
      await saveEpicurePairings({ scanId: sourceScanId, pairings: epicure.pairings });
    }

    const generated = await generateRecipesWithOpenAI({
      locale: body.locale,
      ingredients,
      pairings: epicure.pairings,
      preferences: body.preferences
    });

    if (!generated.ok) {
      const isGemini = (process.env.AI_PROVIDER || "openai") === "gemini";
      return jsonMessageError(
        locale,
        isGemini ? "error.geminiRecipe" : "error.openaiRecipe",
        503
      );
    }

    const recipes = await createRecipes({
      profileId: body.profileId,
      sourceScanId,
      recipes: generated.recipes
    });

    return jsonOk({
      recipes,
      epicureStatus: epicure.status
    });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

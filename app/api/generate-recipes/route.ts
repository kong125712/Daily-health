import { NextRequest } from "next/server";
import { getIngredientScan, saveEpicurePairings } from "@/lib/repositories/ingredientScanRepository";
import { createRecipes, getRecipe } from "@/lib/repositories/recipeRepository";
import { jsonMessageError, handleRouteError, jsonError, jsonOk, localeFromRequest, parseJson } from "@/lib/server/http";
import { getEpicurePairings } from "@/lib/services/epicureService";
import { generateFallbackRecipes } from "@/lib/services/fallbackRecipeService";
import { generateRecipesWithOpenAI } from "@/lib/services/openaiService";
import { applyRecipeNutritionEstimates } from "@/lib/services/recipeCalories";
import type { RecognizedIngredientInput } from "@/lib/types/domain";
import { generateRecipesRequestSchema } from "@/lib/validation/schemas";

const localFallbackCode = "LOCAL_RECIPE_FALLBACK_AVAILABLE";

function localFallbackResponse(locale: "en" | "zh-CN") {
  return jsonError(
    locale === "zh-CN"
      ? "Gemini 菜谱生成暂时无法连接。是否改用本地生成菜谱？"
      : "Gemini recipe generation is temporarily unavailable. Use local recipe generation instead?",
    503,
    {
      code: localFallbackCode,
      localFallbackAvailable: true
    }
  );
}

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

    let generated = await generateRecipesWithOpenAI({
      locale: body.locale,
      ingredients,
      pairings: epicure.pairings,
      preferences: body.preferences,
      avoidRecipes: body.avoidRecipes
    }).catch((error) => {
      console.warn("AI recipe generation failed; local fallback requires user confirmation", error);
      return null;
    });

    if (!generated || !generated.ok) {
      const isGemini = (process.env.AI_PROVIDER || "openai") === "gemini";
      if (!body.allowLocalFallback) {
        return localFallbackResponse(locale);
      }
      generated = {
        ok: true as const,
        recipes: generateFallbackRecipes({
          locale: body.locale,
          ingredients,
          pairings: epicure.pairings,
          preferences: body.preferences
        })
      };
      if (generated.recipes.length === 0) {
        return jsonMessageError(
          locale,
          isGemini ? "error.geminiRecipe" : "error.openaiRecipe",
          503
        );
      }
    }

    const recipesWithNutrition = await applyRecipeNutritionEstimates({
      recipes: generated.recipes,
      sourceIngredients: ingredients,
      pairings: epicure.pairings
    });

    const recipes = await createRecipes({
      profileId: body.profileId,
      sourceScanId,
      recipes: recipesWithNutrition
    });

    return jsonOk({
      recipes,
      epicureStatus: epicure.status
    });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

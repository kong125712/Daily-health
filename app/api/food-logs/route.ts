import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createFoodLog,
  createRecipeFoodLog,
  deleteFoodLog,
  listFoodLogs,
  updateFoodLog
} from "@/lib/repositories/foodLogRepository";
import { getProfile } from "@/lib/repositories/profileRepository";
import { handleRouteError, jsonError, jsonOk, localeFromRequest, parseJson, profileIdFromRequest } from "@/lib/server/http";
import { buildCalorieGuidance } from "@/lib/services/calorieTargets";
import { buildNutritionSummary } from "@/lib/services/nutritionStructure";
import { estimateFoodNutrition } from "@/lib/services/openaiService";
import { dateSchema, deleteByIdSchema, foodLogInputSchema, mealCategorySchema, profileIdSchema } from "@/lib/validation/schemas";

const recipeLogSchema = z.object({
  profileId: profileIdSchema,
  recipeId: z.string().cuid(),
  date: dateSchema,
  mealCategory: mealCategorySchema,
  calories: z.number().int().min(0).max(5000).nullable().optional(),
  sourceType: z.literal("recipe")
});

type NutritionFields = {
  nameEn: string;
  nameZh?: string;
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  notes?: string | null;
};

function needsNutritionEstimate(input: NutritionFields) {
  return (
    input.calories == null ||
    input.proteinGrams == null ||
    input.carbsGrams == null ||
    input.fatGrams == null
  );
}

async function withAiNutritionEstimate<T extends NutritionFields>(input: T, locale: "en" | "zh-CN"): Promise<T> {
  if (!needsNutritionEstimate(input)) {
    return input;
  }

  try {
    const result = await estimateFoodNutrition({
      locale,
      nameEn: input.nameEn,
      nameZh: input.nameZh,
      calories: input.calories,
      notes: input.notes
    });

    if (!result.ok) {
      return input;
    }

    return {
      ...input,
      calories: input.calories ?? result.estimate.calories,
      proteinGrams: input.proteinGrams ?? result.estimate.proteinGrams,
      carbsGrams: input.carbsGrams ?? result.estimate.carbsGrams,
      fatGrams: input.fatGrams ?? result.estimate.fatGrams
    };
  } catch (error) {
    console.warn("AI nutrition estimate failed", error);
    return input;
  }
}

export async function GET(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const profileId = profileIdFromRequest(request);
    const date = request.nextUrl.searchParams.get("date");
    if (!profileId || !date) {
      return jsonError("Missing profile ID or date.", 400);
    }
    const logs = await listFoodLogs(profileId, date);
    const total = logs.reduce((sum, log) => sum + (log.calories ?? 0), 0);
    const profile = await getProfile(profileId);
    return jsonOk({
      logs,
      total,
      calorieGuidance: buildCalorieGuidance(profile, total),
      nutritionSummary: buildNutritionSummary(logs, total)
    });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function POST(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = (await request.json()) as unknown;
    const recipeParse = recipeLogSchema.safeParse(body);
    if (recipeParse.success) {
      const log = await createRecipeFoodLog(recipeParse.data);
      if (!log) {
        return jsonError("Recipe not found.", 404);
      }
      return jsonOk({ log }, 201);
    }
    const parsed = foodLogInputSchema.parse(body);
    const nutrition = await withAiNutritionEstimate(parsed, locale);
    const log = await createFoodLog({
      profileId: parsed.profileId,
      recipeId: parsed.recipeId,
      date: parsed.date,
      mealCategory: parsed.mealCategory,
      nameEn: nutrition.nameEn,
      nameZh: nutrition.nameZh,
      calories: nutrition.calories,
      proteinGrams: nutrition.proteinGrams,
      carbsGrams: nutrition.carbsGrams,
      fatGrams: nutrition.fatGrams,
      notes: nutrition.notes,
      sourceType: parsed.sourceType
    });
    return jsonOk({ log }, 201);
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function PATCH(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, foodLogInputSchema.extend({ id: z.string().cuid() }));
    const nutrition = await withAiNutritionEstimate(body, locale);
    const log = await updateFoodLog({
      id: body.id,
      profileId: body.profileId,
      date: body.date,
      mealCategory: body.mealCategory,
      nameEn: nutrition.nameEn,
      nameZh: nutrition.nameZh,
      calories: nutrition.calories,
      proteinGrams: nutrition.proteinGrams,
      carbsGrams: nutrition.carbsGrams,
      fatGrams: nutrition.fatGrams,
      notes: nutrition.notes
    });
    if (!log) {
      return jsonError("Food log not found.", 404);
    }
    return jsonOk({ log });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

export async function DELETE(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, deleteByIdSchema);
    const deleted = await deleteFoodLog(body.profileId, body.id);
    return jsonOk({ deleted });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

import { NextRequest } from "next/server";
import { estimateFoodNutrition } from "@/lib/services/openaiService";
import { handleRouteError, jsonMessageError, jsonOk, localeFromRequest, parseJson } from "@/lib/server/http";
import { foodNutritionEstimateRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, foodNutritionEstimateRequestSchema);
    const result = await estimateFoodNutrition({
      locale,
      nameEn: body.nameEn,
      nameZh: body.nameZh,
      calories: body.calories,
      notes: body.notes
    });

    if (!result.ok) {
      const isGemini = (process.env.AI_PROVIDER || "openai") === "gemini";
      return jsonMessageError(locale, isGemini ? "error.geminiNutrition" : "error.openaiNutrition", 503);
    }

    return jsonOk({ estimate: result.estimate });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

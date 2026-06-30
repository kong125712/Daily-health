import { NextRequest } from "next/server";
import { createIngredientScan } from "@/lib/repositories/ingredientScanRepository";
import { jsonMessageError, handleRouteError, jsonOk, localeFromRequest, parseJson } from "@/lib/server/http";
import { recognizeIngredientsWithOpenAI } from "@/lib/services/openaiService";
import { analyzeIngredientsSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const locale = localeFromRequest(request);
  try {
    const body = await parseJson(request, analyzeIngredientsSchema);
    const recognized = await recognizeIngredientsWithOpenAI({
      imageDataUrl: body.imageDataUrl,
      locale: body.locale
    });

    if (!recognized.ok) {
      const isGemini = (process.env.AI_PROVIDER || "openai") === "gemini";
      return jsonMessageError(
        locale,
        isGemini ? "error.geminiRecognition" : "error.openaiRecognition",
        503
      );
    }

    const scan = await createIngredientScan({
      profileId: body.profileId,
      imageName: body.imageName,
      imageMimeType: body.imageMimeType,
      result: recognized.result
    });

    return jsonOk({ scan });
  } catch (error) {
    return handleRouteError(error, locale);
  }
}

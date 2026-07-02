import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AppLocale,
  GeneratedRecipeInput,
  RecognizedIngredientInput,
  EpicurePairingInput,
  RecipePreferenceInput
} from "@/lib/types/domain";
import {
  generatedRecipesSchema,
  recognitionResultSchema
} from "@/lib/validation/schemas";

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

function getGeminiModelName() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(withoutFence);
}

export async function recognizeIngredientsWithGeminiImpl(input: {
  imageDataUrl: string;
  locale: AppLocale;
}) {
  const genAI = getGeminiClient();
  if (!genAI) return { ok: false as const, reason: "missing_key" as const };

  const matches = input.imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image data URL");
  const mimeType = matches[1];
  const base64Data = matches[2];

  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const prompt = [
    "Analyze the image for visible food, ingredients, beverages, and obvious seasonings only.",
    "Do not invent hidden ingredients. If no food is identifiable, return an empty ingredients array.",
    "Use normalized English singular ingredient names for normalizedName.",
    "Provide English and Simplified Chinese display names.",
    "Estimate visible amounts cautiously and avoid exact weight claims unless packaging or labels show them.",
    "Estimate approximate calories in kcal for the visible estimatedAmount. Use null for estimatedCalories if calories cannot be reasonably estimated.",
    "Avoid medical advice. Mention uncertainty honestly.",
    "Return valid JSON only with this shape:",
    `{ "overallConfidence": "high" | "medium" | "low", "uncertaintyNoteEn": "string", "uncertaintyNoteZh": "string", "ingredients": [{ "normalizedName": "...", "displayNameEn": "...", "displayNameZh": "...", "estimatedAmount": "...", "estimatedCalories": 120, "confidence": "high|medium|low", "notes": "..." }] }`,
    `Prefer ${input.locale === "zh-CN" ? "Simplified Chinese" : "English"} phrasing where notes are language-specific.`,
  ].join("\n");

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: { mimeType, data: base64Data },
    },
  ]);

  const response = result.response;
  const text = response.text();
  if (!text) throw new Error("Gemini returned empty recognition response");

  const parsed = recognitionResultSchema.parse(parseJsonFromText(text));
  return { ok: true as const, result: parsed };
}

export async function generateRecipesWithGeminiImpl(input: {
  locale: AppLocale;
  ingredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
  preferences: RecipePreferenceInput;
}) {
  const genAI = getGeminiClient();
  if (!genAI) return { ok: false as const, reason: "missing_key" as const };

  const model = genAI.getGenerativeModel({
    model: getGeminiModelName(),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const ingredientText = input.ingredients
    .map(i => {
      const calories = i.estimatedCalories == null ? "calories unknown" : `about ${i.estimatedCalories} kcal`;
      return `${i.displayNameEn} (${i.normalizedName}) - ${i.estimatedAmount} - ${calories}`;
    })
    .join("\n");
  const pairingText = input.pairings.length
    ? input.pairings
        .map(p => `${p.sourceIngredient} + ${p.suggestedIngredient}: ${p.reasonEn}`)
        .join("\n")
    : "No external flavor graph pairings available; use standard culinary pairing logic.";

  const prompt = [
    "Generate exactly 3 practical home-cooking recipes.",
    "Prefer the provided recognized ingredients and use the flavor pairing suggestions when useful.",
    "Clearly mark optional missing ingredients.",
    "Avoid unsafe cooking instructions, medical claims, diet-treatment advice, and allergy assumptions.",
    "Return both English and Simplified Chinese content whenever possible.",
    "Use structured JSON only with a top-level recipes array of exactly 3 items.",
    "For each recipe include referenceImageQuery: 3 to 6 English words describing the finished dish for selecting a food reference photo. Use concrete dish/ingredient words, no brands and no punctuation.",
    "",
    "Visible or user-confirmed ingredients:",
    ingredientText || "No ingredients provided.",
    "",
    "Flavor pairing suggestions:",
    pairingText,
    "",
    "Preferences:",
    JSON.stringify(input.preferences),
    "",
    "Return JSON only, matching this exact shape (all string fields must be plain strings, never objects or arrays):",
    JSON.stringify({
      recipes: [
        {
          cuisineStyle: "string",
          difficulty: "easy | medium",
          referenceImageQuery: "tomato egg stir fry",
          estimatedCookingMinutes: 0,
          servings: 0,
          estimatedCaloriesPerServing: 0,
          translations: [
            { locale: "en", title: "string", shortDescription: "string", nutritionDisclaimer: "string" },
            { locale: "zh-CN", title: "string", shortDescription: "string", nutritionDisclaimer: "string" }
          ],
          ingredients: [
            {
              normalizedName: "string",
              nameEn: "string",
              nameZh: "string",
              amount: "string",
              isRecognizedIngredient: true,
              isOptional: false
            }
          ],
          steps: [
            {
              stepNumber: 1,
              estimatedMinutes: 0,
              instructionEn: "string",
              instructionZh: "string"
            }
          ],
          tips: [{ contentEn: "string", contentZh: "string" }],
          missingIngredients: [
            { normalizedName: "string", nameEn: "string", nameZh: "string", isOptional: true }
          ]
        }
      ]
    }),
    "The top-level recipes array must contain exactly 3 items.",
    `The user is currently viewing the app in ${input.locale}.`,
  ].join("\n");

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  if (!text) throw new Error("Gemini returned empty recipe response");

  const parsed = generatedRecipesSchema.parse(parseJsonFromText(text));
  return {
    ok: true as const,
    recipes: parsed.recipes as GeneratedRecipeInput[],
  };
}

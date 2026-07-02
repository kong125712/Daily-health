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
    .map(i => `${i.displayNameEn} (${i.normalizedName}) - ${i.estimatedAmount}`)
    .join("\n");
  const pairingText = input.pairings.length
    ? input.pairings
        .map(p => `${p.sourceIngredient} + ${p.suggestedIngredient}: ${p.reasonEn}`)
        .join("\n")
    : "No external flavor graph pairings available; use standard culinary pairing logic.";

  const prompt = [
    "Generate exactly 3 practical home-cooking recipes with meaningfully different finished dishes.",
    "Prefer the provided recognized ingredients and use the flavor pairing suggestions when useful.",
    "The 3 recipes may share the same main ingredient, but they must not be near-duplicate finished products.",
    "Make each recipe differ from the others in at least two of these ways: cooking method, dish format, sauce or broth texture, cuisine flavor profile, serving style.",
    "Avoid minor variants such as three tomato egg stir-fry/omelet/rice dishes. Prefer clearly distinct forms such as stir-fry, soup, stew, curry, rice bowl, noodle dish, salad, baked or grilled dish, wrap, or sandwich.",
    "Clearly mark optional missing ingredients.",
    "Avoid unsafe cooking instructions, medical claims, diet-treatment advice, and allergy assumptions.",
    "Return both English and Simplified Chinese content whenever possible.",
    "Use structured JSON only with a top-level recipes array of exactly 3 items.",
    "Do not calculate recipe calories yourself. Set estimatedCaloriesPerServing to 0; the server will calculate calories after generation from the final ingredient amounts and seasonings.",
    "For each recipe include referenceImageQuery: 3 to 6 English words describing the finished dish for selecting a food reference photo. Use the most common English dish name when possible, such as tomato egg stir fry or chicken curry. Do not use broad labels such as egg breakfast, protein meal, or healthy bowl. Use concrete dish/ingredient words, no brands and no punctuation.",
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

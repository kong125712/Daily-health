import type {
  EpicurePairingInput,
  GeneratedRecipeInput,
  RecognizedIngredientInput
} from "@/lib/types/domain";
import { callEpicureTool, listEpicureTools } from "./epicureService";

type JsonObject = Record<string, unknown>;

type NutritionEstimate = {
  estimatedCaloriesPerServing: number;
  estimatedProteinGramsPerServing: number;
  estimatedCarbsGramsPerServing: number;
  estimatedFatGramsPerServing: number;
  source: "epicure" | "math";
};

type PartialNutritionEstimate = Partial<Omit<NutritionEstimate, "source">> & {
  source: "epicure";
};

const nutritionTools = [
  /nutrition/i,
  /calorie/i,
  /calories/i,
  /kcal/i,
  /energy/i,
  /macro/i
];

const kcalPer100g: Record<string, number> = {
  apple: 52,
  basil: 23,
  beef: 250,
  bell: 31,
  bread: 265,
  broccoli: 34,
  butter: 717,
  cabbage: 25,
  carrot: 41,
  cheese: 402,
  chicken: 165,
  cilantro: 23,
  corn: 86,
  cucumber: 15,
  egg: 143,
  fish: 206,
  flour: 364,
  garlic: 149,
  ginger: 80,
  honey: 304,
  milk: 42,
  mushroom: 22,
  noodle: 138,
  oil: 884,
  olive: 884,
  onion: 40,
  peanut: 567,
  pepper: 251,
  pork: 242,
  potato: 77,
  rice: 130,
  salmon: 208,
  sauce: 60,
  sesame: 573,
  shrimp: 99,
  soy: 53,
  spinach: 23,
  sugar: 387,
  tofu: 76,
  tomato: 18,
  tuna: 132,
  yogurt: 61
};

const defaultPortionGrams: Record<string, number> = {
  clove: 3,
  egg: 50,
  fillet: 150,
  handful: 30,
  leaf: 1,
  onion: 110,
  piece: 100,
  potato: 170,
  slice: 25,
  tomato: 120
};

const macroPer100g: Record<string, { protein: number; carbs: number; fat: number }> = {
  apple: { protein: 0.3, carbs: 14, fat: 0.2 },
  beef: { protein: 26, carbs: 0, fat: 15 },
  bread: { protein: 9, carbs: 49, fat: 3.2 },
  broccoli: { protein: 2.8, carbs: 6.6, fat: 0.4 },
  butter: { protein: 0.9, carbs: 0.1, fat: 81 },
  cabbage: { protein: 1.3, carbs: 5.8, fat: 0.1 },
  carrot: { protein: 0.9, carbs: 10, fat: 0.2 },
  cheese: { protein: 25, carbs: 1.3, fat: 33 },
  chicken: { protein: 31, carbs: 0, fat: 3.6 },
  corn: { protein: 3.2, carbs: 19, fat: 1.2 },
  cucumber: { protein: 0.7, carbs: 3.6, fat: 0.1 },
  egg: { protein: 13, carbs: 1.1, fat: 10 },
  fish: { protein: 22, carbs: 0, fat: 12 },
  flour: { protein: 10, carbs: 76, fat: 1 },
  garlic: { protein: 6.4, carbs: 33, fat: 0.5 },
  ginger: { protein: 1.8, carbs: 18, fat: 0.8 },
  honey: { protein: 0.3, carbs: 82, fat: 0 },
  milk: { protein: 3.4, carbs: 5, fat: 1 },
  mushroom: { protein: 3.1, carbs: 3.3, fat: 0.3 },
  noodle: { protein: 4.5, carbs: 25, fat: 2.1 },
  oil: { protein: 0, carbs: 0, fat: 100 },
  onion: { protein: 1.1, carbs: 9.3, fat: 0.1 },
  peanut: { protein: 26, carbs: 16, fat: 49 },
  pork: { protein: 27, carbs: 0, fat: 14 },
  potato: { protein: 2, carbs: 17, fat: 0.1 },
  rice: { protein: 2.7, carbs: 28, fat: 0.3 },
  salmon: { protein: 20, carbs: 0, fat: 13 },
  sesame: { protein: 17, carbs: 23, fat: 50 },
  shrimp: { protein: 24, carbs: 0.2, fat: 0.3 },
  spinach: { protein: 2.9, carbs: 3.6, fat: 0.4 },
  tofu: { protein: 8, carbs: 1.9, fat: 4.8 },
  tomato: { protein: 0.9, carbs: 3.9, fat: 0.2 },
  tuna: { protein: 29, carbs: 0, fat: 1 },
  yogurt: { protein: 3.5, carbs: 4.7, fat: 3.3 }
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(text: string) {
  const mixed = text.match(/(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }

  const fraction = text.match(/(\d+)\/(\d+)/);
  if (fraction) {
    return Number(fraction[1]) / Number(fraction[2]);
  }

  const decimal = text.match(/\d+(?:\.\d+)?/);
  return decimal ? Number(decimal[0]) : 1;
}

function kcalForIngredientName(name: string) {
  const normalized = normalize(name);
  const exact = kcalPer100g[normalized];
  if (exact != null) return exact;

  const matchedKey = Object.keys(kcalPer100g)
    .sort((left, right) => right.length - left.length)
    .find((key) => normalized.includes(key));
  if (matchedKey) return kcalPer100g[matchedKey];

  if (normalized.includes("cream")) return 340;
  if (normalized.includes("paste")) return 100;
  if (normalized.includes("stock") || normalized.includes("broth")) return 12;
  if (normalized.includes("spice") || normalized.includes("seasoning")) return 250;
  if (normalized.includes("vegetable")) return 35;
  if (normalized.includes("meat")) return 230;
  return 80;
}

function macrosForIngredientName(name: string) {
  const normalized = normalize(name);
  const exact = macroPer100g[normalized];
  if (exact) return exact;

  const matchedKey = Object.keys(macroPer100g)
    .sort((left, right) => right.length - left.length)
    .find((key) => normalized.includes(key));
  if (matchedKey) return macroPer100g[matchedKey];

  if (normalized.includes("cream")) return { protein: 2, carbs: 3, fat: 36 };
  if (normalized.includes("stock") || normalized.includes("broth")) return { protein: 1, carbs: 1, fat: 0.3 };
  if (normalized.includes("vegetable")) return { protein: 1.5, carbs: 7, fat: 0.2 };
  if (normalized.includes("meat")) return { protein: 24, carbs: 0, fat: 12 };
  if (normalized.includes("sauce")) return { protein: 2, carbs: 10, fat: 1 };
  return { protein: 2, carbs: 15, fat: 1 };
}

function defaultGramsForName(name: string) {
  const normalized = normalize(name);
  const matchedKey = Object.keys(defaultPortionGrams)
    .sort((left, right) => right.length - left.length)
    .find((key) => normalized.includes(key));
  return matchedKey ? defaultPortionGrams[matchedKey] : 100;
}

function estimateGrams(name: string, amount: string) {
  const normalizedAmount = normalize(amount);
  const quantity = parseNumber(normalizedAmount);

  const kg = normalizedAmount.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilogram|kilograms)\b/);
  if (kg) return Number(kg[1]) * 1000;

  const grams = normalizedAmount.match(/(\d+(?:\.\d+)?)\s*(?:g|gram|grams)\b/);
  if (grams) return Number(grams[1]);

  const liters = normalizedAmount.match(/(\d+(?:\.\d+)?)\s*(?:l|liter|liters)\b/);
  if (liters) return Number(liters[1]) * 1000;

  const ml = normalizedAmount.match(/(\d+(?:\.\d+)?)\s*(?:ml|milliliter|milliliters)\b/);
  if (ml) return Number(ml[1]);

  if (/\b(tbsp|tablespoon|tablespoons)\b/.test(normalizedAmount)) return quantity * 15;
  if (/\b(tsp|teaspoon|teaspoons)\b/.test(normalizedAmount)) return quantity * 5;
  if (/\b(cup|cups)\b/.test(normalizedAmount)) return quantity * 150;
  if (/\b(egg|eggs)\b/.test(normalizedAmount) || normalize(name).includes("egg")) return quantity * 50;
  if (/\b(clove|cloves)\b/.test(normalizedAmount)) return quantity * 3;
  if (/\b(slice|slices)\b/.test(normalizedAmount)) return quantity * 25;
  if (/\b(handful|handfuls)\b/.test(normalizedAmount)) return quantity * 30;

  return quantity * defaultGramsForName(name);
}

function deterministicRecipeNutrition(recipe: GeneratedRecipeInput): NutritionEstimate {
  const totals = recipe.ingredients.reduce((sum, ingredient) => {
    if (ingredient.isOptional) return sum;
    const grams = estimateGrams(ingredient.nameEn || ingredient.normalizedName, ingredient.amount);
    const kcal = kcalForIngredientName(`${ingredient.normalizedName} ${ingredient.nameEn}`);
    const macros = macrosForIngredientName(`${ingredient.normalizedName} ${ingredient.nameEn}`);
    return {
      calories: sum.calories + (grams * kcal) / 100,
      protein: sum.protein + (grams * macros.protein) / 100,
      carbs: sum.carbs + (grams * macros.carbs) / 100,
      fat: sum.fat + (grams * macros.fat) / 100
    };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const servings = Math.max(recipe.servings, 1);

  return {
    estimatedCaloriesPerServing: Math.max(0, Math.round(totals.calories / servings)),
    estimatedProteinGramsPerServing: Math.max(0, roundOne(totals.protein / servings)),
    estimatedCarbsGramsPerServing: Math.max(0, roundOne(totals.carbs / servings)),
    estimatedFatGramsPerServing: Math.max(0, roundOne(totals.fat / servings)),
    source: "math"
  };
}

function findNumberByKey(value: unknown, keys: string[]): number | undefined {
  if (!isObject(value) && !Array.isArray(value)) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumberByKey(item, keys);
      if (found != null) return found;
    }
    return undefined;
  }

  for (const key of keys) {
    const direct = asNumber(value[key]);
    if (direct != null) return direct;
  }

  for (const child of Object.values(value)) {
    const found = findNumberByKey(child, keys);
    if (found != null) return found;
  }
  return undefined;
}

function collectItemNutrition(value: unknown): PartialNutritionEstimate[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectItemNutrition);
  }
  if (!isObject(value)) return [];

  const calories = findNumberByKey(value, ["calories", "kcal", "energyKcal", "totalKcal"]);
  const protein = findNumberByKey(value, ["proteinGrams", "protein_g", "protein"]);
  const carbs = findNumberByKey(value, ["carbsGrams", "carbohydrateGrams", "carbohydrates", "carbs_g", "carbs"]);
  const fat = findNumberByKey(value, ["fatGrams", "fat_g", "fat"]);
  const hasFoodName = ["ingredient", "name", "food", "item"].some((key) => typeof value[key] === "string");
  if (hasFoodName && [calories, protein, carbs, fat].some((item) => item != null)) {
    return [{
      estimatedCaloriesPerServing: calories == null ? undefined : Math.round(calories),
      estimatedProteinGramsPerServing: protein == null ? undefined : roundOne(protein),
      estimatedCarbsGramsPerServing: carbs == null ? undefined : roundOne(carbs),
      estimatedFatGramsPerServing: fat == null ? undefined : roundOne(fat),
      source: "epicure"
    }];
  }

  return Object.values(value).flatMap(collectItemNutrition);
}

function nutritionField(
  raw: unknown,
  perServingKeys: string[],
  totalKeys: string[],
  servings: number,
  integer = false
) {
  const perServing = findNumberByKey(raw, perServingKeys);
  if (perServing != null) return integer ? Math.round(perServing) : roundOne(perServing);

  const total = findNumberByKey(raw, totalKeys);
  if (total != null) {
    const value = total / Math.max(servings, 1);
    return integer ? Math.round(value) : roundOne(value);
  }

  return undefined;
}

function parseEpicureNutrition(raw: unknown, servings: number): PartialNutritionEstimate | null {
  const perServing = findNumberByKey(raw, [
    "estimatedCaloriesPerServing",
    "caloriesPerServing",
    "kcalPerServing",
    "perServingCalories",
    "perServingKcal"
  ]);
  const totalCalories = findNumberByKey(raw, ["totalCalories", "totalKcal", "calories", "kcal", "energyKcal"]);
  const result: PartialNutritionEstimate = {
    estimatedCaloriesPerServing: perServing != null
      ? Math.round(perServing)
      : totalCalories == null
        ? undefined
        : Math.round(totalCalories / Math.max(servings, 1)),
    estimatedProteinGramsPerServing: nutritionField(
      raw,
      ["estimatedProteinGramsPerServing", "proteinGramsPerServing", "proteinPerServing", "perServingProteinGrams"],
      ["totalProteinGrams", "proteinTotalGrams", "proteinGramsTotal", "totalProtein"],
      servings
    ),
    estimatedCarbsGramsPerServing: nutritionField(
      raw,
      ["estimatedCarbsGramsPerServing", "carbsGramsPerServing", "carbsPerServing", "carbohydratesPerServing", "perServingCarbsGrams"],
      ["totalCarbsGrams", "totalCarbohydrateGrams", "carbsTotalGrams", "carbohydratesTotalGrams", "totalCarbs"],
      servings
    ),
    estimatedFatGramsPerServing: nutritionField(
      raw,
      ["estimatedFatGramsPerServing", "fatGramsPerServing", "fatPerServing", "perServingFatGrams"],
      ["totalFatGrams", "fatTotalGrams", "fatGramsTotal", "totalFat"],
      servings
    ),
    source: "epicure"
  };

  const itemNutrition = collectItemNutrition(raw);
  if (itemNutrition.length > 0) {
    const itemTotals = itemNutrition.reduce(
      (sum, item) => ({
        calories: sum.calories + (item.estimatedCaloriesPerServing ?? 0),
        protein: sum.protein + (item.estimatedProteinGramsPerServing ?? 0),
        carbs: sum.carbs + (item.estimatedCarbsGramsPerServing ?? 0),
        fat: sum.fat + (item.estimatedFatGramsPerServing ?? 0)
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    result.estimatedCaloriesPerServing ??= Math.round(itemTotals.calories / Math.max(servings, 1));
    result.estimatedProteinGramsPerServing ??= roundOne(itemTotals.protein / Math.max(servings, 1));
    result.estimatedCarbsGramsPerServing ??= roundOne(itemTotals.carbs / Math.max(servings, 1));
    result.estimatedFatGramsPerServing ??= roundOne(itemTotals.fat / Math.max(servings, 1));
  }

  return [
    result.estimatedCaloriesPerServing,
    result.estimatedProteinGramsPerServing,
    result.estimatedCarbsGramsPerServing,
    result.estimatedFatGramsPerServing
  ].some((value) => value != null) ? result : null;
}

function nutritionToolName(tools: Array<{ name: string }>) {
  return tools.find((tool) => nutritionTools.some((pattern) => pattern.test(tool.name)))?.name;
}

async function estimateWithEpicure(
  recipe: GeneratedRecipeInput,
  sourceIngredients: RecognizedIngredientInput[],
  pairings: EpicurePairingInput[]
): Promise<PartialNutritionEstimate | null> {
  const toolName = nutritionToolName(await listEpicureTools());
  if (!toolName) return null;

  const raw = await callEpicureTool(toolName, {
    recipe: {
      title: recipe.translations.find((translation) => translation.locale === "en")?.title ?? recipe.translations[0]?.title,
      cuisineStyle: recipe.cuisineStyle,
      servings: recipe.servings,
      ingredients: recipe.ingredients.map((ingredient) => ({
        normalizedName: ingredient.normalizedName,
        name: ingredient.nameEn,
        amount: ingredient.amount,
        optional: ingredient.isOptional
      }))
    },
    sourceIngredients: sourceIngredients.map((ingredient) => ({
      name: ingredient.normalizedName,
      displayName: ingredient.displayNameEn,
      estimatedAmount: ingredient.estimatedAmount
    })),
    pairings: pairings.slice(0, 20)
  });

  return parseEpicureNutrition(raw, recipe.servings);
}

function mergeNutritionEstimate(base: NutritionEstimate, epicure: PartialNutritionEstimate | null): NutritionEstimate {
  if (!epicure) return base;
  return {
    ...base,
    estimatedCaloriesPerServing: epicure.estimatedCaloriesPerServing ?? base.estimatedCaloriesPerServing,
    estimatedProteinGramsPerServing: epicure.estimatedProteinGramsPerServing ?? base.estimatedProteinGramsPerServing,
    estimatedCarbsGramsPerServing: epicure.estimatedCarbsGramsPerServing ?? base.estimatedCarbsGramsPerServing,
    estimatedFatGramsPerServing: epicure.estimatedFatGramsPerServing ?? base.estimatedFatGramsPerServing
  };
}

export async function applyRecipeNutritionEstimates(input: {
  recipes: GeneratedRecipeInput[];
  sourceIngredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
}) {
  const output: GeneratedRecipeInput[] = [];

  for (const recipe of input.recipes) {
    const deterministic = deterministicRecipeNutrition(recipe);
    let epicure: PartialNutritionEstimate | null = null;
    try {
      epicure = await estimateWithEpicure(recipe, input.sourceIngredients, input.pairings);
    } catch (error) {
      console.warn("Epicure recipe nutrition estimate failed", error);
    }

    const estimate = mergeNutritionEstimate(deterministic, epicure);
    output.push({
      ...recipe,
      estimatedCaloriesPerServing: estimate.estimatedCaloriesPerServing,
      estimatedProteinGramsPerServing: estimate.estimatedProteinGramsPerServing,
      estimatedCarbsGramsPerServing: estimate.estimatedCarbsGramsPerServing,
      estimatedFatGramsPerServing: estimate.estimatedFatGramsPerServing
    });
  }

  return output;
}

import type {
  EpicurePairingInput,
  GeneratedRecipeInput,
  RecognizedIngredientInput
} from "@/lib/types/domain";
import { callEpicureTool, listEpicureTools } from "./epicureService";

type JsonObject = Record<string, unknown>;

type CalorieEstimate = {
  estimatedCaloriesPerServing: number;
  source: "epicure" | "math";
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

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function deterministicRecipeCalories(recipe: GeneratedRecipeInput): CalorieEstimate {
  const totalCalories = recipe.ingredients.reduce((sum, ingredient) => {
    if (ingredient.isOptional) return sum;
    const grams = estimateGrams(ingredient.nameEn || ingredient.normalizedName, ingredient.amount);
    const kcal = kcalForIngredientName(`${ingredient.normalizedName} ${ingredient.nameEn}`);
    return sum + (grams * kcal) / 100;
  }, 0);

  return {
    estimatedCaloriesPerServing: Math.max(0, Math.round(totalCalories / Math.max(recipe.servings, 1))),
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

function collectItemCalories(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectItemCalories);
  }
  if (!isObject(value)) return [];

  const calories = findNumberByKey(value, ["calories", "kcal", "energyKcal", "totalKcal"]);
  const hasFoodName = ["ingredient", "name", "food", "item"].some((key) => typeof value[key] === "string");
  if (calories != null && hasFoodName) return [calories];

  return Object.values(value).flatMap(collectItemCalories);
}

function parseEpicureCalories(raw: unknown, servings: number): CalorieEstimate | null {
  const perServing = findNumberByKey(raw, [
    "estimatedCaloriesPerServing",
    "caloriesPerServing",
    "kcalPerServing",
    "perServingCalories",
    "perServingKcal"
  ]);
  if (perServing != null) {
    return { estimatedCaloriesPerServing: Math.round(perServing), source: "epicure" };
  }

  const total = findNumberByKey(raw, ["totalCalories", "totalKcal", "calories", "kcal", "energyKcal"]);
  if (total != null) {
    return {
      estimatedCaloriesPerServing: Math.round(total / Math.max(servings, 1)),
      source: "epicure"
    };
  }

  const itemCalories = collectItemCalories(raw);
  if (itemCalories.length > 0) {
    const itemTotal = itemCalories.reduce((sum, calories) => sum + calories, 0);
    return {
      estimatedCaloriesPerServing: Math.round(itemTotal / Math.max(servings, 1)),
      source: "epicure"
    };
  }

  return null;
}

function nutritionToolName(tools: Array<{ name: string }>) {
  return tools.find((tool) => nutritionTools.some((pattern) => pattern.test(tool.name)))?.name;
}

async function estimateWithEpicure(
  recipe: GeneratedRecipeInput,
  sourceIngredients: RecognizedIngredientInput[],
  pairings: EpicurePairingInput[]
): Promise<CalorieEstimate | null> {
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

  return parseEpicureCalories(raw, recipe.servings);
}

export async function applyRecipeCalorieEstimates(input: {
  recipes: GeneratedRecipeInput[];
  sourceIngredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
}) {
  const output: GeneratedRecipeInput[] = [];

  for (const recipe of input.recipes) {
    let estimate: CalorieEstimate | null = null;
    try {
      estimate = await estimateWithEpicure(recipe, input.sourceIngredients, input.pairings);
    } catch (error) {
      console.warn("Epicure calorie estimate failed", error);
    }

    estimate ??= deterministicRecipeCalories(recipe);
    output.push({
      ...recipe,
      estimatedCaloriesPerServing: estimate.estimatedCaloriesPerServing
    });
  }

  return output;
}

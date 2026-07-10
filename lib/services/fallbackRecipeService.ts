import type {
  AppLocale,
  EpicurePairingInput,
  GeneratedRecipeInput,
  RecognizedIngredientInput,
  RecipePreferenceInput
} from "@/lib/types/domain";

type DishTemplate = {
  format: "stir-fry" | "soup" | "bowl";
  titleEn: string;
  titleZh: string;
  descriptionEn: string;
  descriptionZh: string;
  imageSuffix: string;
};

const templates: DishTemplate[] = [
  {
    format: "stir-fry",
    titleEn: "Skillet Stir-Fry",
    titleZh: "快手热炒",
    descriptionEn: "A quick pan dish with browned edges, light seasoning, and a glossy finish.",
    descriptionZh: "一道锅气明显、调味清爽、成品带微微光泽的快手热炒。",
    imageSuffix: "stir fry"
  },
  {
    format: "soup",
    titleEn: "Clear Broth Soup",
    titleZh: "清汤料理",
    descriptionEn: "A lighter broth-style dish that keeps the main ingredients distinct and easy to eat.",
    descriptionZh: "一道偏清爽的汤品，保留主要食材口感，适合想吃轻一点的时候。",
    imageSuffix: "clear soup"
  },
  {
    format: "bowl",
    titleEn: "Warm Rice Bowl",
    titleZh: "温热盖饭",
    descriptionEn: "A balanced bowl-style meal with the main ingredients served over a simple base.",
    descriptionZh: "一道盖饭形式的均衡餐，把主要食材集中成更完整的一餐。",
    imageSuffix: "rice bowl"
  }
];

function cleanName(value: string) {
  return value.trim() || "ingredient";
}

function ingredientEn(ingredient: RecognizedIngredientInput) {
  return cleanName(ingredient.displayNameEn || ingredient.normalizedName);
}

function ingredientZh(ingredient: RecognizedIngredientInput) {
  return cleanName(ingredient.displayNameZh || ingredient.displayNameEn || ingredient.normalizedName);
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim() || "ingredient";
}

function cookingMinutes(preferences: RecipePreferenceInput, index: number) {
  if (preferences.cookingTime.includes("15")) return 15;
  if (preferences.cookingTime.includes("30")) return index === 1 ? 25 : 30;
  if (preferences.cookingTime.includes("45")) return index === 1 ? 35 : 40;
  if (preferences.cookingTime.includes("60")) return index === 1 ? 45 : 55;
  return [20, 30, 35][index] ?? 30;
}

function difficulty(preferences: RecipePreferenceInput, index: number): GeneratedRecipeInput["difficulty"] {
  if (preferences.difficulty === "easy" || preferences.difficulty === "medium" || preferences.difficulty === "hard") {
    return preferences.difficulty;
  }
  return index === 2 ? "medium" : "easy";
}

function mainIngredientNames(ingredients: RecognizedIngredientInput[]) {
  const primary = ingredients[0];
  const secondary = ingredients[1];
  return {
    en: [primary ? ingredientEn(primary) : "Simple Ingredients", secondary ? ingredientEn(secondary) : ""].filter(Boolean).join(" & "),
    zh: [primary ? ingredientZh(primary) : "家常食材", secondary ? ingredientZh(secondary) : ""].filter(Boolean).join("和")
  };
}

function recipeIngredients(ingredients: RecognizedIngredientInput[], preferences: RecipePreferenceInput, template: DishTemplate) {
  const base = ingredients.slice(0, 8).map((ingredient) => ({
    normalizedName: normalizeName(ingredient.normalizedName || ingredient.displayNameEn),
    nameEn: ingredientEn(ingredient),
    nameZh: ingredientZh(ingredient),
    amount: ingredient.estimatedAmount || "as available",
    isRecognizedIngredient: true,
    isOptional: false
  }));

  if (!preferences.recognizedOnly && preferences.allowSeasonings) {
    base.push(
      {
        normalizedName: "cooking oil",
        nameEn: "Cooking oil",
        nameZh: "食用油",
        amount: template.format === "soup" ? "1/2 tsp" : "1 tsp",
        isRecognizedIngredient: false,
        isOptional: false
      },
      {
        normalizedName: "salt",
        nameEn: "Salt",
        nameZh: "盐",
        amount: "to taste",
        isRecognizedIngredient: false,
        isOptional: false
      }
    );
  }

  return base;
}

function missingIngredients(preferences: RecipePreferenceInput, template: DishTemplate): GeneratedRecipeInput["missingIngredients"] {
  if (preferences.recognizedOnly || !preferences.allowOptionalExtras) return [];
  if (template.format === "soup") {
    return [
      { normalizedName: "stock", nameEn: "Stock or broth", nameZh: "高汤或清汤", isOptional: true },
      { normalizedName: "spring onion", nameEn: "Spring onion", nameZh: "葱花", isOptional: true }
    ];
  }
  if (template.format === "bowl") {
    return [
      { normalizedName: "cooked rice", nameEn: "Cooked rice", nameZh: "熟米饭", isOptional: true },
      { normalizedName: "egg", nameEn: "Egg", nameZh: "鸡蛋", isOptional: true }
    ];
  }
  return [
    { normalizedName: "garlic", nameEn: "Garlic", nameZh: "蒜", isOptional: true },
    { normalizedName: "soy sauce", nameEn: "Soy sauce", nameZh: "酱油", isOptional: true }
  ];
}

function steps(template: DishTemplate, names: { en: string; zh: string }, minutes: number): GeneratedRecipeInput["steps"] {
  if (template.format === "soup") {
    return [
      {
        stepNumber: 1,
        estimatedMinutes: 5,
        instructionEn: `Trim and cut ${names.en} into even bite-size pieces so they cook at the same speed.`,
        instructionZh: `把${names.zh}整理并切成大小接近的小块，方便受热均匀。`
      },
      {
        stepNumber: 2,
        estimatedMinutes: 3,
        instructionEn: "Warm a pot over medium heat, add a little oil if using aromatics, and stir until fragrant without browning too dark.",
        instructionZh: "锅用中火加热，如有葱蒜或香料可加少量油炒香，避免炒到过深。"
      },
      {
        stepNumber: 3,
        estimatedMinutes: Math.max(8, minutes - 15),
        instructionEn: "Add water or broth, bring to a gentle boil, then simmer until the firmest ingredient is tender.",
        instructionZh: "加入清水或高汤，煮到微沸后转小火，直到最硬的食材变软。"
      },
      {
        stepNumber: 4,
        estimatedMinutes: 3,
        instructionEn: "Season lightly, taste the broth, and stop cooking once the texture is tender but not mushy.",
        instructionZh: "轻轻调味并试汤味，食材熟透但还没有煮烂时关火。"
      },
      {
        stepNumber: 5,
        estimatedMinutes: 2,
        instructionEn: "Rest for 2 minutes before serving so the broth flavor settles.",
        instructionZh: "出锅前静置约 2 分钟，让汤味更稳定。"
      }
    ];
  }

  if (template.format === "bowl") {
    return [
      {
        stepNumber: 1,
        estimatedMinutes: 5,
        instructionEn: `Cut ${names.en} into spoon-friendly pieces and keep wet ingredients separate from dry ones.`,
        instructionZh: `把${names.zh}切成方便入口的大小，湿润食材和干爽食材先分开放。`
      },
      {
        stepNumber: 2,
        estimatedMinutes: 8,
        instructionEn: "Cook the main ingredients in a hot pan over medium-high heat until the edges are lightly browned.",
        instructionZh: "用中大火把主要食材煎炒到边缘微微上色。"
      },
      {
        stepNumber: 3,
        estimatedMinutes: 5,
        instructionEn: "Lower to medium heat, add seasoning and a splash of water, then cook until the sauce lightly coats the ingredients.",
        instructionZh: "转中火，加入调味和少量水，煮到汤汁能薄薄裹住食材。"
      },
      {
        stepNumber: 4,
        estimatedMinutes: 3,
        instructionEn: "Serve over rice, noodles, or a plain base if available, keeping the sauce on top.",
        instructionZh: "如果有米饭、面或其他主食，把食材铺在上面，酱汁淋在表面。"
      },
      {
        stepNumber: 5,
        estimatedMinutes: 2,
        instructionEn: "Finish with any fresh garnish and serve while warm.",
        instructionZh: "最后可撒上新鲜配料，趁热食用。"
      }
    ];
  }

  return [
    {
      stepNumber: 1,
      estimatedMinutes: 5,
      instructionEn: `Pat ${names.en} dry where possible and cut everything into similar sizes for fast stir-frying.`,
      instructionZh: `尽量擦干${names.zh}表面水分，并切成接近大小，方便快炒。`
    },
    {
      stepNumber: 2,
      estimatedMinutes: 3,
      instructionEn: "Heat the pan over medium-high heat until a drop of water sizzles, then add oil.",
      instructionZh: "锅用中大火烧热到水滴会快速滋响，再加入食用油。"
    },
    {
      stepNumber: 3,
      estimatedMinutes: Math.max(6, minutes - 12),
      instructionEn: "Add the firmest ingredients first, stir-fry until the edges pick up color, then add the softer ingredients.",
      instructionZh: "先下较硬的食材，炒到边缘上色后再加入较软的食材。"
    },
    {
      stepNumber: 4,
      estimatedMinutes: 3,
      instructionEn: "Season in small amounts, toss quickly, and stop when the ingredients are cooked through but still juicy.",
      instructionZh: "少量多次调味，快速翻炒，食材熟透但仍保留汁水时关火。"
    },
    {
      stepNumber: 5,
      estimatedMinutes: 1,
      instructionEn: "Plate immediately so the residual heat does not overcook the dish.",
      instructionZh: "马上盛出，避免余温把菜继续焖老。"
    }
  ];
}

function tips(template: DishTemplate): GeneratedRecipeInput["tips"] {
  const shared = [
    {
      contentEn: "Taste before adding more salt because scanned ingredients and packaged foods may already be seasoned.",
      contentZh: "加盐前先试味，因为识别到的食材或包装食品可能本身已经有调味。"
    },
    {
      contentEn: "Keep oil modest if you want the calorie estimate to stay closer to the logged value.",
      contentZh: "如果想让热量估算更接近记录值，烹调用油要尽量稳定且不要过量。"
    }
  ];

  if (template.format === "soup") {
    return [
      ...shared,
      {
        contentEn: "Use a gentle simmer instead of a hard boil to keep the broth clearer.",
        contentZh: "用小滚而不是大滚，汤色会更清，口感也更稳定。"
      }
    ];
  }

  return [
    ...shared,
    {
      contentEn: "Cook in batches if the pan is crowded; overcrowding makes the dish steam instead of brown.",
      contentZh: "如果锅里太满就分批炒，否则容易出水，成品不够香。"
    }
  ];
}

function cuisineStyle(preferences: RecipePreferenceInput) {
  return preferences.cuisine === "No Preference" ? "Home style" : preferences.cuisine;
}

export function generateFallbackRecipes(input: {
  locale: AppLocale;
  ingredients: RecognizedIngredientInput[];
  pairings: EpicurePairingInput[];
  preferences: RecipePreferenceInput;
}): GeneratedRecipeInput[] {
  const names = mainIngredientNames(input.ingredients);
  const pairing = input.pairings[0]?.suggestedIngredient;

  return templates.map((template, index) => {
    const minutes = cookingMinutes(input.preferences, index);
    const pairingTextEn = pairing && !input.preferences.recognizedOnly ? ` with ${pairing}` : "";
    const pairingTextZh = pairing && !input.preferences.recognizedOnly ? `搭配${pairing}` : "";
    return {
      cuisineStyle: cuisineStyle(input.preferences),
      difficulty: difficulty(input.preferences, index),
      referenceImageQuery: `${names.en} ${template.imageSuffix}`.toLowerCase().slice(0, 120),
      estimatedCookingMinutes: minutes,
      servings: 2,
      estimatedCaloriesPerServing: 0,
      estimatedProteinGramsPerServing: 0,
      estimatedCarbsGramsPerServing: 0,
      estimatedFatGramsPerServing: 0,
      translations: [
        {
          locale: "en",
          title: `${names.en} ${template.titleEn}${pairingTextEn}`.slice(0, 140),
          shortDescription: template.descriptionEn,
          nutritionDisclaimer: "Generated locally because the online AI recipe service was unavailable. Nutrition is estimated from ingredient names and portions."
        },
        {
          locale: "zh-CN",
          title: `${names.zh}${template.titleZh}${pairingTextZh}`.slice(0, 140),
          shortDescription: template.descriptionZh,
          nutritionDisclaimer: "在线 AI 菜谱服务暂时不可用时由本地逻辑生成。营养数据会根据食材名称和份量进行估算，仅供日常参考。"
        }
      ],
      ingredients: recipeIngredients(input.ingredients, input.preferences, template),
      steps: steps(template, names, minutes),
      tips: tips(template),
      missingIngredients: missingIngredients(input.preferences, template)
    };
  });
}

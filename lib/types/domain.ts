export type AppLocale = "en" | "zh-CN";

export type ThemeMode = "light" | "dark" | "system";

export type IngredientConfidence = "high" | "medium" | "low";

export type MealCategory = "breakfast" | "lunch" | "dinner" | "snack";

export type FoodLogSource = "manual" | "ingredient_scan" | "recipe";

export type SleepQuality = "poor" | "average" | "good";

export type Difficulty = "easy" | "medium" | "hard";

export type ProfileGender = "male" | "female" | "other";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export type CalorieGoal = "lose" | "maintain" | "gain";

export type ServiceStatusState = "ok" | "warning" | "error";

export type ServiceStatusItem = {
  id: "app" | "database" | "ai" | "nutrition" | "recipeImages" | "epicure" | "mealdb" | "localImage";
  state: ServiceStatusState;
  titleEn: string;
  titleZh: string;
  summaryEn: string;
  summaryZh: string;
  detailsEn: string[];
  detailsZh: string[];
  latencyMs?: number;
};

export type ServiceStatusResponse = {
  checkedAt: string;
  overall: ServiceStatusState;
  items: ServiceStatusItem[];
};

export type RuntimeConnectionMode = "loopback" | "lan" | "public";

export type RuntimeImageGenerationProvider = "disabled" | "gemini" | "local" | "replicate";

export type RuntimeStatusResponse = {
  checkedAt: string;
  state: ServiceStatusState;
  serverOrigin: string;
  serverHost: string;
  protocol: "http" | "https";
  connectionMode: RuntimeConnectionMode;
  isHttps: boolean;
  isLoopback: boolean;
  isPrivateNetwork: boolean;
  apkReachable: boolean;
  lanOrigins: string[];
  imageGeneration: {
    provider: RuntimeImageGenerationProvider;
    location: "disabled" | "server-local" | "cloud";
    configured: boolean;
    requiresServerGpu: boolean;
    requiresInternet: boolean;
    localApi: "comfyui" | "sdwebui" | null;
    endpoint: string | null;
    model: string | null;
  };
  notesEn: string[];
  notesZh: string[];
};

export type UserProfileView = {
  id: string;
  displayName: string | null;
  gender: ProfileGender | null;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel;
  calorieGoal: CalorieGoal;
  dailyCalorieTarget: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CalorieGuidanceView = {
  dailyTotal: number;
  targetCalories: number | null;
  remainingCalories: number | null;
  excessCalories: number | null;
  isOverTarget: boolean;
  profileComplete: boolean;
  calculationNoteEn: string;
  calculationNoteZh: string;
  adviceEn: string[];
  adviceZh: string[];
};

export type RecognizedIngredientInput = {
  normalizedName: string;
  displayNameEn: string;
  displayNameZh: string;
  estimatedAmount: string;
  estimatedCalories?: number | null;
  confidence: IngredientConfidence;
  notes: string;
};

export type IngredientRecognitionResult = {
  overallConfidence: IngredientConfidence;
  uncertaintyNoteEn: string;
  uncertaintyNoteZh: string;
  ingredients: RecognizedIngredientInput[];
};

export type IngredientScanView = {
  id: string;
  imageName: string;
  imageMimeType: string;
  overallConfidence: IngredientConfidence;
  uncertaintyNoteEn: string;
  uncertaintyNoteZh: string;
  confirmedAt: string | null;
  createdAt: string;
  ingredients: Array<RecognizedIngredientInput & { id: string; position: number }>;
};

export type EpicurePairingInput = {
  sourceIngredient: string;
  suggestedIngredient: string;
  score?: number;
  category?: string;
  reasonEn: string;
  reasonZh: string;
};

export type EpicurePairingView = EpicurePairingInput & {
  id: string;
  createdAt: string;
};

export type RecipePreferenceInput = {
  cuisine: string;
  cookingTime: string;
  difficulty: "easy" | "medium" | "hard" | "no_preference";
  dietaryPreference: string;
  equipment: string;
  recognizedOnly: boolean;
  allowSeasonings: boolean;
  allowOptionalExtras: boolean;
};

export type GeneratedRecipeInput = {
  cuisineStyle: string;
  difficulty: Difficulty;
  referenceImageQuery?: string;
  estimatedCookingMinutes: number;
  servings: number;
  estimatedCaloriesPerServing?: number;
  translations: Array<{
    locale: AppLocale;
    title: string;
    shortDescription: string;
    nutritionDisclaimer: string;
  }>;
  ingredients: Array<{
    normalizedName: string;
    nameEn: string;
    nameZh: string;
    amount: string;
    isRecognizedIngredient: boolean;
    isOptional: boolean;
  }>;
  steps: Array<{
    stepNumber: number;
    estimatedMinutes?: number;
    instructionEn: string;
    instructionZh: string;
  }>;
  tips: Array<{
    contentEn: string;
    contentZh: string;
  }>;
  missingIngredients: Array<{
    normalizedName: string;
    nameEn: string;
    nameZh: string;
    isOptional: boolean;
  }>;
};

export type RecipeReferenceImageView = {
  url: string;
  sourceTitle: string;
  sourceUrl: string;
  provider: "ai" | "gemini" | "local" | "replicate" | "themealdb" | "wikipedia" | "wikimedia";
  crop?: {
    xPercent: number;
    yPercent: number;
    zoom: number;
  };
  aiSelected?: boolean;
  aiReason?: string;
};

export type AvoidRecipeInput = {
  title: string;
  cuisineStyle?: string | null;
  referenceImageQuery?: string | null;
};

export type RecipeView = {
  id: string;
  profileId: string;
  sourceScanId: string | null;
  cuisineStyle: string;
  difficulty: Difficulty;
  referenceImageQuery: string | null;
  referenceImage: RecipeReferenceImageView | null;
  estimatedCookingMinutes: number;
  servings: number;
  estimatedCaloriesPerServing: number | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  translations: GeneratedRecipeInput["translations"];
  ingredients: Array<GeneratedRecipeInput["ingredients"][number] & { id: string; position: number }>;
  steps: Array<GeneratedRecipeInput["steps"][number] & { id: string }>;
  tips: Array<GeneratedRecipeInput["tips"][number] & { id: string; position: number }>;
  missingIngredients: Array<GeneratedRecipeInput["missingIngredients"][number] & { id: string }>;
};

export type FoodLogView = {
  id: string;
  recipeId: string | null;
  date: string;
  mealCategory: MealCategory;
  nameEn: string;
  nameZh: string | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  notes: string | null;
  sourceType: FoodLogSource;
  createdAt: string;
  updatedAt: string;
};

export type NutritionSummaryView = {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  proteinCalories: number;
  carbsCalories: number;
  fatCalories: number;
  trackedMacroCalories: number;
  untrackedCalories: number;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
  trackedEntries: number;
};

export type FoodNutritionEstimate = {
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  confidence: IngredientConfidence;
  notesEn: string;
  notesZh: string;
};

export type WaterSummary = {
  date: string;
  entries: Array<{ id: string; amountMl: number; createdAt: string }>;
  totalMl: number;
  targetMl: number;
};

export type ExerciseLogView = {
  id: string;
  type: string;
  durationMinutes: number;
  estimatedCaloriesBurned: number | null;
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SleepLogView = {
  id: string;
  date: string;
  hours: number;
  quality: SleepQuality;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WeightLogView = {
  id: string;
  date: string;
  weightKg: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyHistoryView = {
  date: string;
  foodLogs: FoodLogView[];
  dailyCalories: number;
  water: WaterSummary;
  exerciseLogs: ExerciseLogView[];
  exerciseMinutes: number;
  sleep: SleepLogView | null;
  weight: WeightLogView | null;
  scans: IngredientScanView[];
  recipes: RecipeView[];
};

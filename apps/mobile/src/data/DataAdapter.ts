import type {
  ActivityLevel,
  AppLocale,
  CalorieGoal,
  DailyHistoryView,
  ExerciseLogView,
  FoodLogView,
  IngredientScanView,
  ProfileGender,
  RecognizedIngredientInput,
  RecipePreferenceInput,
  RecipeView,
  SleepLogView,
  ThemeMode,
  UserProfileView,
  WaterSummary,
  WeightLogView
} from "../domain";

export type ProfileInput = {
  displayName?: string | null;
  gender?: ProfileGender | null;
  birthYear?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel;
  calorieGoal?: CalorieGoal;
  dailyCalorieTarget?: number | null;
};

export type Settings = {
  locale: AppLocale;
  theme: ThemeMode;
  defaultWaterTargetMl: number;
};

export type AiProvider = "gemini" | "openai";

export type AiSettings = {
  provider: AiProvider;
  model: string;
  configured: boolean;
  profileKeyConfigured: boolean;
  environmentKeyConfigured: false;
  providers: Record<AiProvider, { configured: boolean; profileKeyConfigured: boolean }>;
};

export type AiSettingsInput = {
  provider: AiProvider;
  apiKey?: string;
  clearApiKey?: boolean;
};

export type ImageInput = {
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** A data URI is deliberate: it works in native, on web, and in a future multipart remote adapter. */
  dataUrl: string;
};

export type IngredientScanInput = {
  image: ImageInput;
  locale: AppLocale;
};

/**
 * This is the only data contract a screen may depend on. New migrated screens
 * add their operation here before adding storage or HTTP code.
 */
export interface DataAdapter {
  readonly mode: "local" | "remote" | "mirror";

  ensureProfile(): Promise<{ profile: UserProfileView; settings: Settings }>;
  getProfile(): Promise<UserProfileView>;
  saveProfile(input: ProfileInput): Promise<UserProfileView>;
  getSettings(): Promise<Settings>;
  saveSettings(input: Partial<Settings>): Promise<Settings>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(input: AiSettingsInput): Promise<AiSettings>;

  analyzeIngredients(input: IngredientScanInput): Promise<IngredientScanView>;
  getIngredientScans(): Promise<IngredientScanView[]>;
  saveIngredientScan(
    scanId: string,
    input: { ingredients: RecognizedIngredientInput[]; confirmed?: boolean }
  ): Promise<IngredientScanView>;

  getRecipes(): Promise<RecipeView[]>;
  generateRecipes(input: { scanId: string; locale: AppLocale; preferences: RecipePreferenceInput }): Promise<RecipeView[]>;

  getWater(date: string): Promise<WaterSummary>;
  addWater(input: { date: string; amountMl: number }): Promise<WaterSummary>;
  setWaterTarget(input: { date: string; targetMl: number }): Promise<WaterSummary>;
  resetWater(date: string): Promise<WaterSummary>;

  getFoodLogs(date: string): Promise<FoodLogView[]>;
  saveFoodLog(input: Omit<FoodLogView, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<FoodLogView>;
  deleteFoodLog(id: string): Promise<boolean>;

  getExercise(date: string): Promise<ExerciseLogView[]>;
  saveExercise(input: Omit<ExerciseLogView, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<ExerciseLogView>;
  deleteExercise(id: string): Promise<boolean>;

  getSleep(date: string): Promise<SleepLogView | null>;
  saveSleep(input: Omit<SleepLogView, "id" | "createdAt" | "updatedAt">): Promise<SleepLogView>;
  deleteSleep(date: string): Promise<boolean>;
  getWeight(date: string): Promise<WeightLogView | null>;
  getRecentWeights(): Promise<WeightLogView[]>;
  saveWeight(input: Omit<WeightLogView, "id" | "createdAt" | "updatedAt">): Promise<WeightLogView>;
  deleteWeight(date: string): Promise<boolean>;
  getHistory(date: string): Promise<DailyHistoryView>;
}

export class DataAdapterError extends Error {
  constructor(message: string, readonly statusCode: number | null = null, readonly code?: string) {
    super(message);
    this.name = "DataAdapterError";
  }
}

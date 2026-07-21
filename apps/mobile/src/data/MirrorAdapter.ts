import type {
  DailyHistoryView,
  ExerciseLogView,
  FoodLogView,
  IngredientScanView,
  RecipeView,
  RecognizedIngredientInput,
  SleepLogView,
  UserProfileView,
  WaterSummary,
  WeightLogView
} from "../domain";
import { LocalAdapter } from "./LocalAdapter";
import type {
  AiSettings,
  AiSettingsInput,
  DataAdapter,
  IngredientScanInput,
  ProfileInput,
  Settings
} from "./DataAdapter";

/**
 * Server-first cache mirror. It never turns a successful cloud write into a
 * failure because a cache write failed. Offline queued writes are intentionally
 * a later sync-manager feature, not silently faked here.
 */
export class MirrorAdapter implements DataAdapter {
  readonly mode = "mirror" as const;

  constructor(private readonly primary: DataAdapter, private readonly mirror: LocalAdapter) {}

  async ensureProfile() {
    const value = await this.primary.ensureProfile();
    void this.mirror.saveProfile(value.profile).catch(() => undefined);
    void this.mirror.saveSettings(value.settings).catch(() => undefined);
    return value;
  }

  async getProfile() {
    const value = await this.primary.getProfile();
    void this.mirror.saveProfile(value).catch(() => undefined);
    return value;
  }

  async saveProfile(input: ProfileInput): Promise<UserProfileView> {
    const value = await this.primary.saveProfile(input);
    void this.mirror.saveProfile(value).catch(() => undefined);
    return value;
  }

  async getSettings() {
    const value = await this.primary.getSettings();
    void this.mirror.saveSettings(value).catch(() => undefined);
    return value;
  }

  async saveSettings(input: Partial<Settings>) {
    const value = await this.primary.saveSettings(input);
    void this.mirror.saveSettings(value).catch(() => undefined);
    return value;
  }

  getAiSettings(): Promise<AiSettings> {
    return this.primary.getAiSettings();
  }

  saveAiSettings(input: AiSettingsInput): Promise<AiSettings> {
    return this.primary.saveAiSettings(input);
  }

  async analyzeIngredients(input: IngredientScanInput) {
    const value = await this.primary.analyzeIngredients(input);
    void this.mirror.upsertIngredientScan(value).catch(() => undefined);
    return value;
  }

  async getIngredientScans() {
    const value = await this.primary.getIngredientScans();
    for (const scan of value) {
      void this.mirror.upsertIngredientScan(scan).catch(() => undefined);
    }
    return value;
  }

  async saveIngredientScan(scanId: string, input: { ingredients: RecognizedIngredientInput[]; confirmed?: boolean }): Promise<IngredientScanView> {
    const value = await this.primary.saveIngredientScan(scanId, input);
    void this.mirror.upsertIngredientScan(value).catch(() => undefined);
    return value;
  }

  async getRecipes(): Promise<RecipeView[]> {
    const value = await this.primary.getRecipes();
    for (const recipe of value) void this.mirror.upsertRecipe(recipe).catch(() => undefined);
    return value;
  }

  async generateRecipes(input: { scanId: string; locale: "en" | "zh-CN"; preferences: import("../domain").RecipePreferenceInput }): Promise<RecipeView[]> {
    const value = await this.primary.generateRecipes(input);
    for (const recipe of value) void this.mirror.upsertRecipe(recipe).catch(() => undefined);
    return value;
  }

  async setRecipeFavorite(recipeId: string, isFavorite: boolean): Promise<RecipeView> {
    const value = await this.primary.setRecipeFavorite(recipeId, isFavorite);
    void this.mirror.upsertRecipe(value).catch(() => undefined);
    return value;
  }

  async getWater(date: string): Promise<WaterSummary> {
    const value = await this.primary.getWater(date);
    void this.mirror.replaceWaterSummary(value).catch(() => undefined);
    return value;
  }

  async addWater(input: { date: string; amountMl: number }): Promise<WaterSummary> {
    const value = await this.primary.addWater(input);
    void this.mirror.replaceWaterSummary(value).catch(() => undefined);
    return value;
  }

  async setWaterTarget(input: { date: string; targetMl: number }): Promise<WaterSummary> {
    const value = await this.primary.setWaterTarget(input);
    void this.mirror.replaceWaterSummary(value).catch(() => undefined);
    return value;
  }

  async resetWater(date: string): Promise<WaterSummary> {
    const value = await this.primary.resetWater(date);
    void this.mirror.replaceWaterSummary(value).catch(() => undefined);
    return value;
  }

  async getFoodLogs(date: string): Promise<FoodLogView[]> {
    const value = await this.primary.getFoodLogs(date);
    for (const log of value) void this.mirror.upsertFoodLog(log).catch(() => undefined);
    return value;
  }

  async saveFoodLog(input: Omit<FoodLogView, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<FoodLogView> {
    const value = await this.primary.saveFoodLog(input);
    void this.mirror.upsertFoodLog(value).catch(() => undefined);
    return value;
  }

  async deleteFoodLog(id: string): Promise<boolean> {
    const value = await this.primary.deleteFoodLog(id);
    if (value) void this.mirror.deleteFoodLog(id).catch(() => undefined);
    return value;
  }

  async getExercise(date: string): Promise<ExerciseLogView[]> {
    const value = await this.primary.getExercise(date);
    for (const log of value) void this.mirror.upsertExercise(log).catch(() => undefined);
    return value;
  }

  async saveExercise(input: Omit<ExerciseLogView, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<ExerciseLogView> {
    const value = await this.primary.saveExercise(input);
    void this.mirror.upsertExercise(value).catch(() => undefined);
    return value;
  }

  async deleteExercise(id: string): Promise<boolean> {
    const value = await this.primary.deleteExercise(id);
    if (value) void this.mirror.deleteExercise(id).catch(() => undefined);
    return value;
  }

  async getSleep(date: string): Promise<SleepLogView | null> {
    const value = await this.primary.getSleep(date);
    if (value) void this.mirror.upsertSleep(value).catch(() => undefined);
    else void this.mirror.deleteSleep(date).catch(() => undefined);
    return value;
  }

  async saveSleep(input: Omit<SleepLogView, "id" | "createdAt" | "updatedAt">): Promise<SleepLogView> {
    const value = await this.primary.saveSleep(input);
    void this.mirror.upsertSleep(value).catch(() => undefined);
    return value;
  }

  async deleteSleep(date: string): Promise<boolean> {
    const value = await this.primary.deleteSleep(date);
    if (value) void this.mirror.deleteSleep(date).catch(() => undefined);
    return value;
  }

  async getWeight(date: string): Promise<WeightLogView | null> {
    const value = await this.primary.getWeight(date);
    if (value) void this.mirror.upsertWeight(value).catch(() => undefined);
    else void this.mirror.deleteWeight(date).catch(() => undefined);
    return value;
  }

  async getRecentWeights(): Promise<WeightLogView[]> {
    const value = await this.primary.getRecentWeights();
    for (const weight of value) void this.mirror.upsertWeight(weight).catch(() => undefined);
    return value;
  }

  async saveWeight(input: Omit<WeightLogView, "id" | "createdAt" | "updatedAt">): Promise<WeightLogView> {
    const value = await this.primary.saveWeight(input);
    void this.mirror.upsertWeight(value).catch(() => undefined);
    return value;
  }

  async deleteWeight(date: string): Promise<boolean> {
    const value = await this.primary.deleteWeight(date);
    if (value) void this.mirror.deleteWeight(date).catch(() => undefined);
    return value;
  }

  async getHistory(date: string): Promise<DailyHistoryView> {
    const value = await this.primary.getHistory(date);
    void this.mirror.replaceWaterSummary(value.water).catch(() => undefined);
    for (const item of value.foodLogs) void this.mirror.upsertFoodLog(item).catch(() => undefined);
    for (const item of value.exerciseLogs) void this.mirror.upsertExercise(item).catch(() => undefined);
    if (value.sleep) void this.mirror.upsertSleep(value.sleep).catch(() => undefined);
    if (value.weight) void this.mirror.upsertWeight(value.weight).catch(() => undefined);
    for (const item of value.scans) void this.mirror.upsertIngredientScan(item).catch(() => undefined);
    for (const item of value.recipes) void this.mirror.upsertRecipe(item).catch(() => undefined);
    return value;
  }
}

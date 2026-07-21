import type { DataAdapter } from "./DataAdapter";
import { DataAdapterError } from "./DataAdapter";

/**
 * The hosted web build is cloud-only. Keep Expo's native SQLite module out of
 * Metro's web graph; it is loaded by LocalAdapter.ts on Android instead.
 */
export class LocalAdapter implements DataAdapter {
  readonly mode = "local" as const;

  constructor(readonly profileId: string) {}

  private unavailable(): Promise<never> {
    return Promise.reject(
      new DataAdapterError("Local-only storage is available in the Android app. Use a cloud session in the web version.", 501, "WEB_LOCAL_UNAVAILABLE")
    );
  }

  ensureProfile: DataAdapter["ensureProfile"] = () => this.unavailable();
  getProfile: DataAdapter["getProfile"] = () => this.unavailable();
  saveProfile: DataAdapter["saveProfile"] = () => this.unavailable();
  getSettings: DataAdapter["getSettings"] = () => this.unavailable();
  saveSettings: DataAdapter["saveSettings"] = () => this.unavailable();
  getAiSettings: DataAdapter["getAiSettings"] = () => this.unavailable();
  saveAiSettings: DataAdapter["saveAiSettings"] = () => this.unavailable();
  analyzeIngredients: DataAdapter["analyzeIngredients"] = () => this.unavailable();
  getIngredientScans: DataAdapter["getIngredientScans"] = () => this.unavailable();
  saveIngredientScan: DataAdapter["saveIngredientScan"] = () => this.unavailable();
  getRecipes: DataAdapter["getRecipes"] = () => this.unavailable();
  generateRecipes: DataAdapter["generateRecipes"] = () => this.unavailable();
  setRecipeFavorite: DataAdapter["setRecipeFavorite"] = () => this.unavailable();
  getWater: DataAdapter["getWater"] = () => this.unavailable();
  addWater: DataAdapter["addWater"] = () => this.unavailable();
  setWaterTarget: DataAdapter["setWaterTarget"] = () => this.unavailable();
  resetWater: DataAdapter["resetWater"] = () => this.unavailable();
  getFoodLogs: DataAdapter["getFoodLogs"] = () => this.unavailable();
  saveFoodLog: DataAdapter["saveFoodLog"] = () => this.unavailable();
  deleteFoodLog: DataAdapter["deleteFoodLog"] = () => this.unavailable();
  getExercise: DataAdapter["getExercise"] = () => this.unavailable();
  saveExercise: DataAdapter["saveExercise"] = () => this.unavailable();
  deleteExercise: DataAdapter["deleteExercise"] = () => this.unavailable();
  getSleep: DataAdapter["getSleep"] = () => this.unavailable();
  saveSleep: DataAdapter["saveSleep"] = () => this.unavailable();
  deleteSleep: DataAdapter["deleteSleep"] = () => this.unavailable();
  getWeight: DataAdapter["getWeight"] = () => this.unavailable();
  getRecentWeights: DataAdapter["getRecentWeights"] = () => this.unavailable();
  saveWeight: DataAdapter["saveWeight"] = () => this.unavailable();
  deleteWeight: DataAdapter["deleteWeight"] = () => this.unavailable();
  getHistory: DataAdapter["getHistory"] = () => this.unavailable();
}

import type { FoodLogView, NutritionSummaryView } from "@/lib/types/domain";

function round(value: number) {
  return Math.round(value);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function macroPercent(macroCalories: number, totalMacroCalories: number) {
  if (totalMacroCalories <= 0) return 0;
  return round((macroCalories / totalMacroCalories) * 100);
}

export function buildNutritionSummary(logs: FoodLogView[], dailyCalories: number): NutritionSummaryView {
  const proteinGrams = roundOne(logs.reduce((sum, log) => sum + (log.proteinGrams ?? 0), 0));
  const carbsGrams = roundOne(logs.reduce((sum, log) => sum + (log.carbsGrams ?? 0), 0));
  const fatGrams = roundOne(logs.reduce((sum, log) => sum + (log.fatGrams ?? 0), 0));
  const proteinCalories = round(proteinGrams * 4);
  const carbsCalories = round(carbsGrams * 4);
  const fatCalories = round(fatGrams * 9);
  const trackedMacroCalories = proteinCalories + carbsCalories + fatCalories;

  return {
    proteinGrams,
    carbsGrams,
    fatGrams,
    proteinCalories,
    carbsCalories,
    fatCalories,
    trackedMacroCalories,
    untrackedCalories: Math.max(dailyCalories - trackedMacroCalories, 0),
    proteinPercent: macroPercent(proteinCalories, trackedMacroCalories),
    carbsPercent: macroPercent(carbsCalories, trackedMacroCalories),
    fatPercent: macroPercent(fatCalories, trackedMacroCalories),
    trackedEntries: logs.filter((log) => log.proteinGrams != null || log.carbsGrams != null || log.fatGrams != null).length
  };
}

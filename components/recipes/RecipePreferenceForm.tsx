"use client";

import type { RecipePreferenceInput } from "@/lib/types/domain";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translations";

type Option = {
  value: string;
  key: TranslationKey;
};

const cuisines: Option[] = [
  { value: "No Preference", key: "option.noPreference" },
  { value: "Chinese", key: "option.chinese" },
  { value: "Malaysian", key: "option.malaysian" },
  { value: "Western", key: "option.western" },
  { value: "Japanese", key: "option.japanese" },
  { value: "Korean", key: "option.korean" },
  { value: "Thai", key: "option.thai" }
];

const cookingTimes: Option[] = [
  { value: "No Preference", key: "option.noPreference" },
  { value: "Within 15 minutes", key: "option.15" },
  { value: "Within 30 minutes", key: "option.30" },
  { value: "Within 45 minutes", key: "option.45" },
  { value: "Within 60 minutes", key: "option.60" }
];

const dietary: Option[] = [
  { value: "No Preference", key: "option.noPreference" },
  { value: "High Protein", key: "option.highProtein" },
  { value: "Light", key: "option.light" },
  { value: "Low Oil", key: "option.lowOil" },
  { value: "Vegetarian", key: "option.vegetarian" },
  { value: "No Beef", key: "option.noBeef" },
  { value: "No Pork", key: "option.noPork" },
  { value: "No Seafood", key: "option.noSeafood" }
];

const equipment: Option[] = [
  { value: "No Preference", key: "option.noPreference" },
  { value: "Frying Pan", key: "option.fryingPan" },
  { value: "Wok", key: "option.wok" },
  { value: "Air Fryer", key: "option.airFryer" },
  { value: "Oven", key: "option.oven" },
  { value: "Rice Cooker", key: "option.riceCooker" },
  { value: "Microwave", key: "option.microwave" }
];

export const defaultPreferences: RecipePreferenceInput = {
  cuisine: "No Preference",
  cookingTime: "No Preference",
  difficulty: "no_preference",
  dietaryPreference: "No Preference",
  equipment: "No Preference",
  recognizedOnly: false,
  allowSeasonings: true,
  allowOptionalExtras: true
};

export function RecipePreferenceForm({
  value,
  onChange
}: {
  value: RecipePreferenceInput;
  onChange: (value: RecipePreferenceInput) => void;
}) {
  const { t } = useApp();

  function patch(update: Partial<RecipePreferenceInput>) {
    onChange({ ...value, ...update });
  }

  return (
    <section className="panel grid gap-4">
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("recipes.preferences")}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="grid gap-1">
          <span className="field-label">{t("recipes.cuisine")}</span>
          <select className="field-input" value={value.cuisine} onChange={(event) => patch({ cuisine: event.target.value })}>
            {cuisines.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("recipes.cookingTime")}</span>
          <select className="field-input" value={value.cookingTime} onChange={(event) => patch({ cookingTime: event.target.value })}>
            {cookingTimes.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("recipes.difficulty")}</span>
          <select
            className="field-input"
            value={value.difficulty}
            onChange={(event) => patch({ difficulty: event.target.value as RecipePreferenceInput["difficulty"] })}
          >
            <option value="no_preference">{t("option.noPreference")}</option>
            <option value="easy">{t("option.easy")}</option>
            <option value="medium">{t("option.medium")}</option>
            <option value="hard">{t("option.hard")}</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("recipes.dietary")}</span>
          <select className="field-input" value={value.dietaryPreference} onChange={(event) => patch({ dietaryPreference: event.target.value })}>
            {dietary.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="field-label">{t("recipes.equipment")}</span>
          <select className="field-input" value={value.equipment} onChange={(event) => patch({ equipment: event.target.value })}>
            {equipment.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={value.recognizedOnly} onChange={(event) => patch({ recognizedOnly: event.target.checked })} />
          {t("recipes.recognizedOnly")}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={value.allowSeasonings} onChange={(event) => patch({ allowSeasonings: event.target.checked })} />
          {t("recipes.allowSeasonings")}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={value.allowOptionalExtras} onChange={(event) => patch({ allowOptionalExtras: event.target.checked })} />
          {t("recipes.allowExtras")}
        </label>
      </div>
    </section>
  );
}

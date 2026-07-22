import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { estimateRecipeNutrition } from "../../../../lib/services/recipeNutritionService";
import type { FoodLogView, IngredientScanView, RecipePreferenceInput, RecipeView } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";
import { isoToday } from "../../src/utils/date";

const defaultPreferences: RecipePreferenceInput = {
  cuisine: "No Preference",
  cookingTime: "No Preference",
  difficulty: "no_preference",
  dietaryPreference: "No Preference",
  equipment: "No Preference",
  recognizedOnly: false,
  allowSeasonings: true,
  allowOptionalExtras: true
};

const preferenceOptions = {
  cuisine: ["No Preference", "Chinese", "Malay", "Japanese", "Western"],
  cookingTime: ["No Preference", "15 minutes", "30 minutes", "60 minutes"],
  difficulty: ["no_preference", "easy", "medium", "hard"],
  dietaryPreference: ["No Preference", "Vegetarian", "High protein", "Low carb"],
  equipment: ["No Preference", "Stovetop", "Oven", "Air fryer"]
} as const;

type PreferenceKey = keyof typeof preferenceOptions;

function recipeTitle(recipe: RecipeView, locale: "en" | "zh-CN") {
  return recipe.translations.find((item) => item.locale === locale)?.title ?? recipe.translations.find((item) => item.locale === "en")?.title ?? recipe.cuisineStyle;
}

export default function RecipesScreen() {
  const { adapter, locale, t } = useApp();
  const router = useRouter();
  const { saved } = useLocalSearchParams<{ saved?: string }>();
  const [scans, setScans] = useState<IngredientScanView[]>([]);
  const [selectedScanId, setSelectedScanId] = useState("");
  const [recipes, setRecipes] = useState<RecipeView[]>([]);
  const [preferences, setPreferences] = useState<RecipePreferenceInput>(defaultPreferences);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [showSavedOnly, setShowSavedOnly] = useState(saved === "1");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [foodLogCategory, setFoodLogCategory] = useState<FoodLogView["mealCategory"]>("dinner");
  const [addingRecipeId, setAddingRecipeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([adapter.getIngredientScans(), adapter.getRecipes()])
      .then(([nextScans, savedRecipes]) => {
        if (!active) return;
        const confirmed = nextScans.filter((scan) => Boolean(scan.confirmedAt));
        setScans(confirmed);
        setSelectedScanId(confirmed[0]?.id ?? "");
        setRecipes(savedRecipes);
      })
      .catch((error: unknown) => active && setMessage(error instanceof Error ? error.message : t("common.error")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [adapter, t]);

  async function generate() {
    if (!selectedScanId) {
      setMessage(t("smart.confirmFirst"));
      return;
    }
    setGenerating(true);
    setMessage(null);
    try {
      await adapter.generateRecipes({ scanId: selectedScanId, locale, preferences });
      setRecipes(await adapter.getRecipes());
      setExpandedRecipeId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setGenerating(false);
    }
  }

  function setPreference(key: PreferenceKey, value: string) {
    setPreferences((current) => ({ ...current, [key]: value } as RecipePreferenceInput));
  }

  function preferenceField(label: string, key: PreferenceKey) {
    return <View style={{ gap: 6 }}>
      <Text style={shared.label}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{preferenceOptions[key].map((value) => <Pressable key={value} onPress={() => setPreference(key, value)} style={[shared.secondaryButton, preferences[key] === value && { backgroundColor: colors.mint }]}><Text style={shared.secondaryButtonText}>{value === "no_preference" ? "No Preference" : value}</Text></Pressable>)}</View>
    </View>;
  }

  async function toggleFavorite(recipe: RecipeView) {
    try {
      const updated = await adapter.setRecipeFavorite(recipe.id, !recipe.isFavorite);
      setRecipes((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.error"));
    }
  }

  function nutritionFor(recipe: RecipeView) {
    const fallback = estimateRecipeNutrition(recipe.ingredients, 0, recipe.servings);
    return {
      calories: recipe.estimatedCaloriesPerServing ?? fallback.calories,
      proteinGrams: recipe.estimatedProteinGramsPerServing ?? fallback.proteinGrams,
      carbsGrams: recipe.estimatedCarbsGramsPerServing ?? fallback.carbsGrams,
      fatGrams: recipe.estimatedFatGramsPerServing ?? fallback.fatGrams
    };
  }

  async function addRecipeToFoodLog(recipe: RecipeView) {
    const nutrition = nutritionFor(recipe);
    setAddingRecipeId(recipe.id);
    setMessage(null);
    try {
      await adapter.saveFoodLog({
        recipeId: recipe.id,
        date: isoToday(),
        mealCategory: foodLogCategory,
        nameEn: recipeTitle(recipe, "en"),
        nameZh: recipe.translations.find((item) => item.locale === "zh-CN")?.title ?? null,
        calories: nutrition.calories,
        proteinGrams: nutrition.proteinGrams,
        carbsGrams: nutrition.carbsGrams,
        fatGrams: nutrition.fatGrams,
        notes: "One recipe serving.",
        sourceType: "recipe"
      });
      router.push("/(tabs)/food-log");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setAddingRecipeId(null);
    }
  }

  const savedRecipes = useMemo(() => recipes.filter((recipe) => recipe.isFavorite), [recipes]);
  const visibleRecipes = showSavedOnly ? savedRecipes : recipes;

  if (loading) return <SafeAreaView style={shared.page}><View style={[shared.content, { alignItems: "center", paddingTop: 48 }]}><ActivityIndicator color={colors.leaf} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={shared.page} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={shared.header}><Text style={shared.title}>{t("recipes.title")}</Text><Text style={shared.subtitle}>{t("recipes.subtitle")}</Text></View>
        {message ? <Text style={shared.error}>{message}</Text> : null}
        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("recipes.source")}</Text>
          {scans.length === 0 ? <Text style={shared.helper}>{t("smart.confirmFirst")}</Text> : scans.map((scan) => {
            const selected = selectedScanId === scan.id;
            return <Pressable key={scan.id} onPress={() => setSelectedScanId(scan.id)} style={{ borderWidth: 1, borderColor: selected ? colors.leaf : colors.line, borderRadius: 8, padding: 12, backgroundColor: selected ? colors.mint : "#FFF" }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{scan.ingredients.map((item) => locale === "zh-CN" ? item.displayNameZh : item.displayNameEn).join(", ")}</Text>
              <Text style={shared.helper}>{new Date(scan.createdAt).toLocaleString()}</Text>
            </Pressable>;
          })}
          <Text style={shared.helper}>{t("recipes.localFallbackMessage")}</Text>
        </View>
        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>Recipe preferences</Text>
          {preferenceField("Cuisine", "cuisine")}
          {preferenceField("Cooking time", "cookingTime")}
          {preferenceField("Difficulty", "difficulty")}
          {preferenceField("Dietary preference", "dietaryPreference")}
          {preferenceField("Equipment", "equipment")}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {(["recognizedOnly", "allowSeasonings", "allowOptionalExtras"] as const).map((key) => <Pressable key={key} onPress={() => setPreferences((current) => ({ ...current, [key]: !current[key] }))} style={[shared.secondaryButton, preferences[key] && { backgroundColor: colors.mint }]}><Text style={shared.secondaryButtonText}>{key === "recognizedOnly" ? "Recognized ingredients only" : key === "allowSeasonings" ? "Allow seasonings" : "Allow optional extras"}</Text></Pressable>)}
          </View>
          <Pressable style={[shared.primaryButton, (!selectedScanId || generating) && { opacity: 0.55 }]} disabled={!selectedScanId || generating} onPress={() => void generate()}>
            {generating ? <ActivityIndicator color="white" /> : <Text style={shared.primaryButtonText}>{t("recipes.generate")}</Text>}
          </Pressable>
        </View>
        <View style={shared.panel}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}><Text style={shared.sectionTitle}>Saved recipes</Text><Text style={shared.helper}>{savedRecipes.length} saved on this device or cloud profile.</Text></View>
            <Pressable style={shared.secondaryButton} onPress={() => setShowSavedOnly((value) => !value)}><Text style={shared.secondaryButtonText}>{showSavedOnly ? "Show all" : "Show saved"}</Text></Pressable>
          </View>
        </View>
        <View style={[shared.panel, { gap: 8 }]}>
          <Text style={shared.sectionTitle}>Add recipe to food log</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {(["breakfast", "lunch", "dinner", "snack"] as const).map((category) => <Pressable key={category} onPress={() => setFoodLogCategory(category)} style={[shared.secondaryButton, foodLogCategory === category && { backgroundColor: colors.mint }]}><Text style={shared.secondaryButtonText}>{category}</Text></Pressable>)}
          </View>
          <Text style={shared.helper}>Recipe actions add one serving to this meal today.</Text>
        </View>
        {visibleRecipes.length === 0 ? <View style={shared.panel}><Text style={shared.helper}>{showSavedOnly ? "No saved recipes yet." : t("recipes.noRecipes")}</Text></View> : null}
        {visibleRecipes.map((recipe) => {
          const translation = recipe.translations.find((item) => item.locale === locale) ?? recipe.translations.find((item) => item.locale === "en") ?? recipe.translations[0];
          const nutrition = nutritionFor(recipe);
          return <View key={recipe.id} style={shared.panel}>
            <Text style={shared.sectionTitle}>{recipeTitle(recipe, locale)}</Text>
            {translation ? <Text style={shared.helper}>{translation.shortDescription}</Text> : null}
            {recipe.referenceImage?.url ? <Image source={{ uri: recipe.referenceImage.url }} style={{ width: "100%", height: 190, borderRadius: 8, backgroundColor: colors.mint }} resizeMode="cover" /> : null}
            <Text style={shared.helper}>{recipe.estimatedCookingMinutes} {t("common.minutes")} | {recipe.difficulty} | {recipe.servings} servings</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Calories", nutrition.calories, "kcal"],
                ["Protein", nutrition.proteinGrams, "g"],
                ["Carbs", nutrition.carbsGrams, "g"],
                ["Fat", nutrition.fatGrams, "g"]
              ].map(([label, value, unit]) => <View key={String(label)} style={{ minWidth: "44%", flexGrow: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, gap: 2 }}><Text style={shared.helper}>{label}</Text><Text style={{ color: colors.text, fontWeight: "700" }}>{value ?? "-"} {unit}</Text></View>)}
            </View>
            <View style={shared.row}>
              <Pressable style={[shared.secondaryButton, shared.flex, recipe.isFavorite && { backgroundColor: colors.mint }]} onPress={() => void toggleFavorite(recipe)}><Text style={shared.secondaryButtonText}>{recipe.isFavorite ? "Saved recipe" : "Save recipe"}</Text></Pressable>
              <Pressable style={[shared.secondaryButton, shared.flex]} onPress={() => setExpandedRecipeId((current) => current === recipe.id ? null : recipe.id)}><Text style={shared.secondaryButtonText}>{expandedRecipeId === recipe.id ? "Hide details" : "View details"}</Text></Pressable>
            </View>
            <Pressable disabled={addingRecipeId === recipe.id} style={[shared.primaryButton, addingRecipeId === recipe.id && { opacity: 0.55 }]} onPress={() => void addRecipeToFoodLog(recipe)}>
              {addingRecipeId === recipe.id ? <ActivityIndicator color="white" /> : <Text style={shared.primaryButtonText}>Add 1 serving to food log</Text>}
            </Pressable>
            {expandedRecipeId === recipe.id ? <>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{t("recipes.ingredients")}</Text>
              {recipe.ingredients.map((ingredient) => <Text key={ingredient.id} style={shared.helper}>- {locale === "zh-CN" ? ingredient.nameZh : ingredient.nameEn}: {ingredient.amount}</Text>)}
              <Text style={{ color: colors.text, fontWeight: "700" }}>{t("recipes.steps")}</Text>
              {recipe.steps.map((step) => <Text key={step.id} style={shared.helper}>{step.stepNumber}. {locale === "zh-CN" ? step.instructionZh : step.instructionEn}</Text>)}
              {recipe.tips.length ? <><Text style={{ color: colors.text, fontWeight: "700" }}>Tips</Text>{recipe.tips.map((tip) => <Text key={tip.id} style={shared.helper}>- {locale === "zh-CN" ? tip.contentZh : tip.contentEn}</Text>)}</> : null}
              {translation ? <Text style={shared.helper}>{translation.nutritionDisclaimer}</Text> : null}
            </> : null}
          </View>;
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

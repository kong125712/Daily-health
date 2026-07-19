import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { IngredientScanView, RecipePreferenceInput, RecipeView } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";

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

function recipeTitle(recipe: RecipeView, locale: "en" | "zh-CN") {
  return recipe.translations.find((item) => item.locale === locale)?.title ?? recipe.translations.find((item) => item.locale === "en")?.title ?? recipe.cuisineStyle;
}

export default function RecipesScreen() {
  const { adapter, locale, t } = useApp();
  const [scans, setScans] = useState<IngredientScanView[]>([]);
  const [selectedScanId, setSelectedScanId] = useState("");
  const [recipes, setRecipes] = useState<RecipeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
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
      const next = await adapter.generateRecipes({ scanId: selectedScanId, locale, preferences: defaultPreferences });
      setRecipes(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setGenerating(false);
    }
  }

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
            return <Pressable key={scan.id} onPress={() => setSelectedScanId(scan.id)} style={{ borderWidth: 1, borderColor: selected ? colors.leaf : colors.line, borderRadius: 10, padding: 12, backgroundColor: selected ? colors.mint : "#FFF" }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{scan.ingredients.map((item) => locale === "zh-CN" ? item.displayNameZh : item.displayNameEn).join(", ")}</Text>
              <Text style={shared.helper}>{new Date(scan.createdAt).toLocaleString()}</Text>
            </Pressable>;
          })}
          <Text style={shared.helper}>{t("recipes.localFallbackMessage")}</Text>
          <Pressable style={[shared.primaryButton, (!selectedScanId || generating) && { opacity: 0.55 }]} disabled={!selectedScanId || generating} onPress={() => void generate()}>
            {generating ? <ActivityIndicator color="white" /> : <Text style={shared.primaryButtonText}>{t("recipes.generate")}</Text>}
          </Pressable>
        </View>
        {recipes.length === 0 ? <View style={shared.panel}><Text style={shared.helper}>{t("recipes.noRecipes")}</Text></View> : null}
        {recipes.map((recipe) => <View key={recipe.id} style={shared.panel}>
          <Text style={shared.sectionTitle}>{recipeTitle(recipe, locale)}</Text>
          <Text style={shared.helper}>{recipe.estimatedCookingMinutes} {t("common.minutes")} · {recipe.difficulty}</Text>
          <Text style={{ color: colors.text, fontWeight: "700" }}>{t("recipes.ingredients")}</Text>
          {recipe.ingredients.map((ingredient) => <Text key={ingredient.id} style={shared.helper}>• {locale === "zh-CN" ? ingredient.nameZh : ingredient.nameEn} — {ingredient.amount}</Text>)}
          <Text style={{ color: colors.text, fontWeight: "700" }}>{t("recipes.steps")}</Text>
          {recipe.steps.map((step) => <Text key={step.id} style={shared.helper}>{step.stepNumber}. {locale === "zh-CN" ? step.instructionZh : step.instructionEn}</Text>)}
        </View>)}
      </ScrollView>
    </SafeAreaView>
  );
}

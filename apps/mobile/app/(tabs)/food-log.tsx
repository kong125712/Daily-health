import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { FoodLogView } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";
import { isoToday, numeric } from "../../src/utils/date";

type Category = "breakfast" | "lunch" | "dinner" | "snack";
const categories: Category[] = ["breakfast", "lunch", "dinner", "snack"];
const blank = { name: "", calories: "", protein: "", carbs: "", fat: "", notes: "" };

export default function FoodLogScreen() {
  const { adapter, locale, t } = useApp();
  const [date, setDate] = useState(isoToday());
  const [logs, setLogs] = useState<FoodLogView[]>([]);
  const [category, setCategory] = useState<Category>("breakfast");
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { setBusy(true); try { setLogs(await adapter.getFoodLogs(date)); } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); } finally { setBusy(false); } }, [adapter, date, t]);
  useEffect(() => { void load(); }, [load]);
  const total = logs.reduce((sum, item) => sum + (item.calories ?? 0), 0);

  async function save() {
    if (!form.name.trim()) { setMessage("Enter a food name."); return; }
    setBusy(true); setMessage(null);
    try {
      await adapter.saveFoodLog({ recipeId: null, date, mealCategory: category, nameEn: form.name.trim(), nameZh: locale === "zh-CN" ? form.name.trim() : null, calories: numeric(form.calories), proteinGrams: numeric(form.protein), carbsGrams: numeric(form.carbs), fatGrams: numeric(form.fat), notes: form.notes || null, sourceType: "manual" });
      setForm(blank); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); } finally { setBusy(false); }
  }
  async function remove(id: string) { setBusy(true); try { await adapter.deleteFoodLog(id); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); } finally { setBusy(false); } }
  const field = (placeholder: string, value: string, onChangeText: (text: string) => void, keyboardType: "default" | "numeric" = "default") => <TextInput placeholder={placeholder} value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={shared.input} />;

  return <SafeAreaView style={shared.page} edges={["left", "right"]}><ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
    <View style={shared.header}><Text style={shared.title}>{t("food.title")}</Text><Text style={shared.subtitle}>{total} kcal {t("food.dailyTotal").toLowerCase()}</Text></View>
    {message ? <Text style={shared.error}>{message}</Text> : null}
    <View style={shared.panel}>
      <Text style={shared.label}>{t("common.date")}</Text><TextInput value={date} onChangeText={setDate} style={shared.input} placeholder="YYYY-MM-DD" />
      <Text style={shared.label}>Meal</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[shared.secondaryButton, category === item && { backgroundColor: colors.mint }]}><Text style={shared.secondaryButtonText}>{item}</Text></Pressable>)}</View>
      {field("Food name", form.name, (name) => setForm({ ...form, name }))}
      <View style={shared.row}><View style={shared.flex}>{field("Calories", form.calories, (calories) => setForm({ ...form, calories }), "numeric")}</View><View style={shared.flex}>{field("Protein g", form.protein, (protein) => setForm({ ...form, protein }), "numeric")}</View></View>
      <View style={shared.row}><View style={shared.flex}>{field("Carbs g", form.carbs, (carbs) => setForm({ ...form, carbs }), "numeric")}</View><View style={shared.flex}>{field("Fat g", form.fat, (fat) => setForm({ ...form, fat }), "numeric")}</View></View>
      {field("Notes (optional)", form.notes, (notes) => setForm({ ...form, notes }))}
      <Pressable disabled={busy} style={[shared.primaryButton, busy && { opacity: 0.6 }]} onPress={() => void save()}>{busy ? <ActivityIndicator color="white" /> : <Text style={shared.primaryButtonText}>{t("common.save")}</Text>}</Pressable>
    </View>
    <View style={shared.panel}><Text style={shared.sectionTitle}>{t("food.dailyTotal")} · {total} kcal</Text>{logs.length === 0 ? <Text style={shared.helper}>{t("food.empty")}</Text> : categories.map((item) => <View key={item} style={{ gap: 6 }}><Text style={{ color: colors.text, fontWeight: "700", textTransform: "capitalize" }}>{item}</Text>{logs.filter((log) => log.mealCategory === item).map((log) => <View key={log.id} style={{ borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 8, gap: 3 }}><Text style={{ color: colors.text, fontWeight: "700" }}>{locale === "zh-CN" ? log.nameZh ?? log.nameEn : log.nameEn}</Text><Text style={shared.helper}>{log.calories ?? 0} kcal · P {log.proteinGrams ?? 0}g · C {log.carbsGrams ?? 0}g · F {log.fatGrams ?? 0}g</Text><Pressable disabled={busy} onPress={() => void remove(log.id)}><Text style={{ color: colors.danger, fontWeight: "700" }}>{t("common.delete")}</Text></Pressable></View>)}</View>)}</View>
  </ScrollView></SafeAreaView>;
}

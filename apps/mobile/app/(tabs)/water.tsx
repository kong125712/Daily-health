import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { WaterSummary } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";
import { isoToday, numeric, recentIsoDates } from "../../src/utils/date";

export default function WaterScreen() {
  const { adapter, t } = useApp();
  const [date, setDate] = useState(isoToday());
  const [water, setWater] = useState<WaterSummary | null>(null);
  const [recent, setRecent] = useState<WaterSummary[]>([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [summary, summaries] = await Promise.all([adapter.getWater(date), Promise.all(recentIsoDates(7).map((item) => adapter.getWater(item)))]);
      setWater(summary);
      setTarget(String(summary.targetMl));
      setRecent(summaries);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }, [adapter, date, t]);

  useEffect(() => { void load(); }, [load]);

  async function update(operation: () => Promise<WaterSummary>) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await operation();
      setWater(next);
      setTarget(String(next.targetMl));
      void Promise.all(recentIsoDates(7).map((item) => adapter.getWater(item))).then(setRecent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return <SafeAreaView style={shared.page} edges={["left", "right"]}><ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
    <View style={shared.header}><Text style={shared.title}>{t("water.title")}</Text><Text style={shared.subtitle}>Log drinks directly to your selected data adapter.</Text></View>
    {message ? <Text style={shared.error}>{message}</Text> : null}
    <View style={shared.panel}>
      <Text style={shared.label}>{t("common.date")}</Text>
      <TextInput value={date} onChangeText={setDate} autoCapitalize="none" style={shared.input} placeholder="YYYY-MM-DD" />
      {busy && !water ? <ActivityIndicator color={colors.leaf} /> : <>
        <Text style={shared.sectionTitle}>{water?.totalMl ?? 0} / {water?.targetMl ?? 2000} ml</Text>
        <View style={{ height: 10, borderRadius: 8, backgroundColor: colors.mint, overflow: "hidden" }}><View style={{ height: 10, width: `${Math.min(100, ((water?.totalMl ?? 0) / Math.max(1, water?.targetMl ?? 2000)) * 100)}%`, backgroundColor: colors.leaf }} /></View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{[200, 250, 350, 500].map((amount) => <Pressable key={amount} disabled={busy} style={shared.secondaryButton} onPress={() => void update(() => adapter.addWater({ date, amountMl: amount }))}><Text style={shared.secondaryButtonText}>+{amount} ml</Text></Pressable>)}</View>
        <Text style={shared.label}>{t("water.target")}</Text>
        <View style={shared.row}><TextInput value={target} onChangeText={setTarget} keyboardType="numeric" style={[shared.input, shared.flex]} /><Pressable disabled={busy} style={shared.primaryButton} onPress={() => void update(() => adapter.setWaterTarget({ date, targetMl: numeric(target) ?? 0 }))}><Text style={shared.primaryButtonText}>{t("common.save")}</Text></Pressable></View>
        <Pressable disabled={busy} style={shared.secondaryButton} onPress={() => void update(() => adapter.resetWater(date))}><Text style={shared.secondaryButtonText}>{t("water.resetToday")}</Text></Pressable>
      </>}
    </View>
    <View style={shared.panel}><Text style={shared.sectionTitle}>{t("water.history")}</Text>{recent.map((item) => <View key={item.date} style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={shared.helper}>{item.date}</Text><Text style={{ color: colors.leaf, fontWeight: "700" }}>{item.totalMl} / {item.targetMl} ml</Text></View>)}</View>
  </ScrollView></SafeAreaView>;
}

import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DailyHistoryView, UserProfileView, WeightLogView } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";
import { isoToday } from "../../src/utils/date";

const dashboardLinks = [
  { href: "/(tabs)/food-log", label: "Food log" },
  { href: "/(tabs)/water", label: "Water" },
  { href: "/(tabs)/exercise", label: "Exercise" },
  { href: "/(tabs)/wellness", label: "Wellness" },
  { href: "/(tabs)/history", label: "History" },
  { href: "/(tabs)/settings", label: "Settings" }
] as const;

export default function HomeScreen() {
  const { adapter, t } = useApp();
  const [history, setHistory] = useState<DailyHistoryView | null>(null);
  const [profile, setProfile] = useState<UserProfileView | null>(null);
  const [latestWeight, setLatestWeight] = useState<WeightLogView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([adapter.getHistory(isoToday()), adapter.getProfile(), adapter.getRecentWeights()])
      .then(([nextHistory, nextProfile, weights]) => {
        if (!active) return;
        setHistory(nextHistory);
        setProfile(nextProfile);
        setLatestWeight(weights[0] ?? null);
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : t("common.error")));
    return () => { active = false; };
  }, [adapter, t]);

  if (!history) {
    return <SafeAreaView style={shared.page}><View style={[shared.content, { alignItems: "center", paddingTop: 48, gap: 12 }]}>{error ? <Text style={shared.error}>{error}</Text> : <ActivityIndicator color={colors.leaf} />}</View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={shared.page} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={shared.header}>
          <Text style={shared.title}>{t("dashboard.title")}</Text>
          <Text style={shared.subtitle}>{profile?.displayName ? `${t("dashboard.subtitle")} · ${profile.displayName}` : t("dashboard.subtitle")}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {[
            [t("dashboard.foodToday"), `${history.dailyCalories} kcal`, `${history.foodLogs.length} ${t("nav.foodLog")}`],
            [t("dashboard.waterToday"), `${history.water.totalMl} ml`, `${history.water.targetMl} ml ${t("water.target")}`],
            [t("dashboard.exerciseToday"), `${history.exerciseMinutes} ${t("common.minutes")}`, `${history.exerciseLogs.length} ${t("nav.exercise")}`],
            [t("dashboard.sleepLatest"), history.sleep ? `${history.sleep.hours} h` : "-", history.sleep?.date ?? t("common.empty")],
            [t("dashboard.weightLatest"), latestWeight ? `${latestWeight.weightKg} kg` : "-", latestWeight?.date ?? t("common.empty")]
          ].map(([label, value, detail]) => <View key={label} style={[shared.panel, { flexGrow: 1, flexBasis: "46%", padding: 14, gap: 4 }]}><Text style={shared.helper}>{label}</Text><Text style={{ color: colors.leafDark, fontSize: 22, fontWeight: "700" }}>{value}</Text><Text style={shared.helper}>{detail}</Text></View>)}
        </View>
        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("dashboard.weeklySummary")}</Text>
          <Text style={shared.helper}>{t("food.dailyTotal")}: {history.dailyCalories} kcal</Text>
          <Text style={shared.helper}>{t("water.total")}: {history.water.totalMl} ml</Text>
          <Text style={shared.helper}>{t("exercise.totalMinutes")}: {history.exerciseMinutes}</Text>
        </View>
        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>Track today</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {dashboardLinks.map((item) => <Link key={item.href} href={item.href} style={{ color: colors.leaf, borderWidth: 1, borderColor: colors.leaf, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontWeight: "700" }}>{item.label}</Link>)}
          </View>
        </View>
        <Link href="/(tabs)/smart-scan" style={{ color: colors.leaf, fontWeight: "700", fontSize: 16 }}>Start a Smart Scan →</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

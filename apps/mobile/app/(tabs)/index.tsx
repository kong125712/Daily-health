import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { calculateHealthScore } from "../../../../lib/services/healthScore";
import type { DailyHistoryView, UserProfileView, WeightLogView } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";
import { isoToday, recentIsoDates } from "../../src/utils/date";

const dashboardLinks = [
  { href: "/(tabs)/food-log", label: "Food log" },
  { href: "/(tabs)/water", label: "Water" },
  { href: "/(tabs)/exercise", label: "Exercise" },
  { href: "/(tabs)/wellness", label: "Sleep & weight" },
  { href: "/(tabs)/history", label: "History" },
  { href: "/(tabs)/settings", label: "Settings" }
] as const;

export default function HomeScreen() {
  const { adapter, t } = useApp();
  const [history, setHistory] = useState<DailyHistoryView | null>(null);
  const [profile, setProfile] = useState<UserProfileView | null>(null);
  const [latestWeight, setLatestWeight] = useState<WeightLogView | null>(null);
  const [recentHistories, setRecentHistories] = useState<DailyHistoryView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    let active = true;
    setError(null);
    const dates = recentIsoDates(7).reverse();
    void Promise.all([
      adapter.getHistory(isoToday()),
      adapter.getProfile(),
      adapter.getRecentWeights(),
      Promise.all(dates.map((date) => adapter.getHistory(date)))
    ])
      .then(([nextHistory, nextProfile, weights, nextRecentHistories]) => {
        if (!active) return;
        setHistory(nextHistory);
        setProfile(nextProfile);
        setLatestWeight(weights[0] ?? null);
        setRecentHistories(nextRecentHistories);
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : t("common.error")));
    return () => { active = false; };
  }, [adapter, t]);

  // Refresh when returning from a tracker so today's water and food totals stay current.
  useFocusEffect(loadDashboard);

  if (!history) {
    return <SafeAreaView style={shared.page}><View style={[shared.content, { alignItems: "center", paddingTop: 48, gap: 12 }]}>{error ? <Text style={shared.error}>{error}</Text> : <ActivityIndicator color={colors.leaf} />}</View></SafeAreaView>;
  }

  const healthScore = profile ? calculateHealthScore({ history, profile }) : null;
  const score = healthScore?.score ?? 0;
  const trend = profile ? recentHistories.map((item) => ({ date: item.date, score: calculateHealthScore({ history: item, profile }).score })) : [];

  return (
    <SafeAreaView style={shared.page} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={shared.header}>
          <Text style={shared.title}>{t("dashboard.title")}</Text>
          <Text style={shared.subtitle}>{profile?.displayName ? `${t("dashboard.subtitle")} - ${profile.displayName}` : t("dashboard.subtitle")}</Text>
        </View>
        <View style={[shared.panel, { gap: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <View style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 9, borderColor: score >= 70 ? colors.leaf : score >= 45 ? "#D97706" : colors.line, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.text, fontSize: 32, fontWeight: "800" }}>{score}</Text>
              <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "600" }}>/ 100</Text>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={shared.sectionTitle}>{t("dashboard.healthScore")}</Text>
              <Text style={shared.helper}>{healthScore ? t(healthScore.statusKey) : t("dashboard.advice.completeProfile")}</Text>
              <Text style={shared.helper}>{healthScore ? healthScore.adviceKeys.map((key) => t(key)).join(" | ") : t("dashboard.advice.logFood")}</Text>
            </View>
          </View>
          {healthScore ? <View style={{ gap: 9 }}>
            {healthScore.metrics.map((metric) => <View key={metric.key} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={shared.helper}>{t(metric.labelKey)}</Text><Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{metric.value} | {metric.points}/{metric.maxPoints}</Text></View>
              <View style={{ height: 7, borderRadius: 4, backgroundColor: colors.mint, overflow: "hidden" }}><View style={{ height: "100%", width: `${metric.percent}%`, backgroundColor: metric.tone === "good" ? colors.leaf : metric.tone === "warning" ? "#D97706" : colors.danger }} /></View>
            </View>)}
          </View> : null}
        </View>
        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("dashboard.weeklySummary")}</Text>
          <Text style={shared.helper}>Health score trend</Text>
          <View style={{ height: 126, flexDirection: "row", alignItems: "flex-end", gap: 7, paddingTop: 8 }}>
            {trend.map((item) => <View key={item.date} style={{ flex: 1, alignItems: "center", gap: 5 }}>
              <Text style={{ color: colors.muted, fontSize: 10 }}>{item.score}</Text>
              <View style={{ width: "100%", minHeight: 5, height: Math.max(5, item.score), borderRadius: 4, backgroundColor: item.score >= 70 ? colors.leaf : item.score >= 45 ? "#D97706" : colors.line }} />
              <Text style={{ color: colors.muted, fontSize: 9 }}>{item.date.slice(5)}</Text>
            </View>)}
          </View>
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
          <Text style={shared.sectionTitle}>Track today</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {dashboardLinks.map((item) => <Link key={item.href} href={item.href} style={{ color: colors.leaf, borderWidth: 1, borderColor: colors.leaf, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontWeight: "700" }}>{item.label}</Link>)}
          </View>
        </View>
        <Link href="/(tabs)/smart-scan" style={{ color: colors.leaf, fontWeight: "700", fontSize: 16 }}>Start a Smart Scan</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

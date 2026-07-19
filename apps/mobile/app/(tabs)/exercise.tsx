import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ExerciseLogView } from "../../src/domain";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";
import { isoToday, numeric } from "../../src/utils/date";

export default function ExerciseScreen() {
  const { adapter, t } = useApp();
  const [date, setDate] = useState(isoToday());
  const [logs, setLogs] = useState<ExerciseLogView[]>([]);
  const [kind, setKind] = useState("");
  const [minutes, setMinutes] = useState("");
  const [calories, setCalories] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { setBusy(true); try { setLogs(await adapter.getExercise(date)); } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); } finally { setBusy(false); } }, [adapter, date, t]);
  useEffect(() => { void load(); }, [load]);
  const total = logs.reduce((sum, item) => sum + item.durationMinutes, 0);
  async function save() {
    const durationMinutes = numeric(minutes);
    if (!kind.trim() || durationMinutes == null) { setMessage("Enter an activity and duration."); return; }
    setBusy(true); setMessage(null);
    try { await adapter.saveExercise({ type: kind, durationMinutes, estimatedCaloriesBurned: numeric(calories), date, notes: notes || null }); setKind(""); setMinutes(""); setCalories(""); setNotes(""); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); } finally { setBusy(false); }
  }
  async function remove(id: string) { setBusy(true); try { await adapter.deleteExercise(id); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : t("common.error")); } finally { setBusy(false); } }
  return <SafeAreaView style={shared.page} edges={["left", "right"]}><ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
    <View style={shared.header}><Text style={shared.title}>{t("exercise.title")}</Text><Text style={shared.subtitle}>{total} {t("common.minutes")} {t("exercise.totalMinutes").toLowerCase()}</Text></View>
    {message ? <Text style={shared.error}>{message}</Text> : null}
    <View style={shared.panel}><Text style={shared.label}>{t("common.date")}</Text><TextInput value={date} onChangeText={setDate} style={shared.input} placeholder="YYYY-MM-DD" /><TextInput value={kind} onChangeText={setKind} style={shared.input} placeholder={t("exercise.type")} /><View style={shared.row}><TextInput value={minutes} onChangeText={setMinutes} keyboardType="numeric" style={[shared.input, shared.flex]} placeholder={t("exercise.duration")} /><TextInput value={calories} onChangeText={setCalories} keyboardType="numeric" style={[shared.input, shared.flex]} placeholder={t("exercise.caloriesBurned")} /></View><TextInput value={notes} onChangeText={setNotes} style={shared.input} placeholder={t("common.notes")} /><Pressable disabled={busy} style={shared.primaryButton} onPress={() => void save()}>{busy ? <ActivityIndicator color="white" /> : <Text style={shared.primaryButtonText}>{t("common.save")}</Text>}</Pressable></View>
    <View style={shared.panel}><Text style={shared.sectionTitle}>{t("exercise.totalMinutes")}: {total}</Text>{logs.length === 0 ? <Text style={shared.helper}>{t("common.empty")}</Text> : logs.map((log) => <View key={log.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 3 }}><Text style={{ color: colors.text, fontWeight: "700" }}>{log.type} · {log.durationMinutes} {t("common.minutes")}</Text><Text style={shared.helper}>{log.estimatedCaloriesBurned ?? 0} kcal {log.notes ? `· ${log.notes}` : ""}</Text><Pressable disabled={busy} onPress={() => void remove(log.id)}><Text style={{ color: colors.danger, fontWeight: "700" }}>{t("common.delete")}</Text></Pressable></View>)}</View>
  </ScrollView></SafeAreaView>;
}

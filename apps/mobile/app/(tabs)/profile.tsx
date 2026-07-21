import { useEffect, useMemo, useState } from "react";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { calculateDailyCalorieTarget } from "../../../../lib/services/calorieTargets";
import type { ActivityLevel, CalorieGoal, ProfileGender, UserProfileView } from "../../src/domain";
import type { AiProvider } from "../../src/data/DataAdapter";
import { useApp } from "../../src/state/AppProvider";
import { colors, shared } from "../../src/ui/styles";

type ProfileForm = {
  displayName: string;
  gender: "" | ProfileGender;
  birthYear: string;
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel;
  calorieGoal: CalorieGoal;
  dailyCalorieTarget: string;
};

const emptyForm: ProfileForm = {
  displayName: "", gender: "", birthYear: "", heightCm: "", weightKg: "",
  activityLevel: "sedentary", calorieGoal: "maintain", dailyCalorieTarget: ""
};

function formFromProfile(profile: UserProfileView): ProfileForm {
  return {
    displayName: profile.displayName ?? "",
    gender: profile.gender ?? "",
    birthYear: profile.birthYear?.toString() ?? "",
    heightCm: profile.heightCm?.toString() ?? "",
    weightKg: profile.weightKg?.toString() ?? "",
    activityLevel: profile.activityLevel,
    calorieGoal: profile.calorieGoal,
    dailyCalorieTarget: profile.dailyCalorieTarget?.toString() ?? ""
  };
}

function numberOrNull(value: string) {
  const valueAsNumber = Number(value.trim());
  return value.trim() && Number.isFinite(valueAsNumber) ? valueAsNumber : null;
}

function SegmentedField<T extends string>({ label, value, values, onChange }: {
  label: string;
  value: T;
  values: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={shared.label}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {values.map((item) => (
          <Pressable key={item.value} accessibilityRole="button" onPress={() => onChange(item.value)} style={{
            borderWidth: 1, borderColor: value === item.value ? colors.leaf : colors.line,
            backgroundColor: value === item.value ? colors.mint : "#FFFFFF", borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9
          }}>
            <Text style={{ color: value === item.value ? colors.leafDark : colors.muted, fontWeight: value === item.value ? "700" : "500", fontSize: 13 }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { adapter, locale, t } = useApp();
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([adapter.getProfile(), adapter.getAiSettings()])
      .then(([profile, aiSettings]) => {
        if (!active) return;
        setForm(formFromProfile(profile));
        setProvider(aiSettings.provider);
        setKeyConfigured(aiSettings.providers[aiSettings.provider].configured);
      })
      .catch((error: unknown) => active && setMessage({ type: "error", text: error instanceof Error ? error.message : t("common.error") }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [adapter, t]);

  const targetPreview = useMemo(() => calculateDailyCalorieTarget({
    id: "preview", displayName: form.displayName || null, gender: form.gender || null,
    birthYear: numberOrNull(form.birthYear), heightCm: numberOrNull(form.heightCm), weightKg: numberOrNull(form.weightKg),
    activityLevel: form.activityLevel, calorieGoal: form.calorieGoal, dailyCalorieTarget: numberOrNull(form.dailyCalorieTarget),
    createdAt: "", updatedAt: ""
  }), [form]);

  async function saveProfile() {
    setSaving(true);
    try {
      const saved = await adapter.saveProfile({
        displayName: form.displayName || null,
        gender: form.gender || null,
        birthYear: numberOrNull(form.birthYear),
        heightCm: numberOrNull(form.heightCm),
        weightKg: numberOrNull(form.weightKg),
        activityLevel: form.activityLevel,
        calorieGoal: form.calorieGoal,
        dailyCalorieTarget: numberOrNull(form.dailyCalorieTarget)
      });
      setForm(formFromProfile(saved));
      setMessage({ type: "success", text: t("common.success") });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  async function saveAiKey(clearApiKey = false) {
    setSaving(true);
    try {
      const saved = await adapter.saveAiSettings({ provider, apiKey: apiKey || undefined, clearApiKey });
      setApiKey("");
      setKeyConfigured(saved.providers[provider].configured);
      setMessage({ type: "success", text: clearApiKey ? t("profile.apiKeyCleared") : t("profile.apiKeySaved") });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  const input = (label: string, value: string, onChangeText: (value: string) => void, keyboardType: "default" | "numeric" = "default") => (
    <View style={{ gap: 2 }}>
      <Text style={shared.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={shared.input} />
    </View>
  );

  if (loading) {
    return <SafeAreaView style={shared.page}><View style={[shared.content, { alignItems: "center", paddingTop: 48 }]}><ActivityIndicator color={colors.leaf} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={shared.page} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <View style={shared.header}>
          <Text style={shared.title}>{t("profile.title")}</Text>
          <Text style={shared.subtitle}>{t("profile.subtitle")}</Text>
        </View>
        {message ? <Text style={message.type === "error" ? shared.error : { color: colors.leaf, fontSize: 13 }}>{message.text}</Text> : null}

        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("profile.bodyInfo")}</Text>
          {input(t("profile.displayName"), form.displayName, (value) => setForm({ ...form, displayName: value }))}
          <SegmentedField label={t("profile.gender")} value={form.gender} onChange={(gender) => setForm({ ...form, gender })} values={[
            { value: "", label: t("profile.notSet") }, { value: "male", label: t("profile.male") }, { value: "female", label: t("profile.female") }, { value: "other", label: t("profile.other") }
          ]} />
          <View style={shared.row}>
            <View style={shared.flex}>{input(t("profile.birthYear"), form.birthYear, (birthYear) => setForm({ ...form, birthYear }), "numeric")}</View>
            <View style={shared.flex}>{input(t("profile.heightCm"), form.heightCm, (heightCm) => setForm({ ...form, heightCm }), "numeric")}</View>
          </View>
          {input(t("profile.weightKg"), form.weightKg, (weightKg) => setForm({ ...form, weightKg }), "numeric")}
          <SegmentedField label={t("profile.activityLevel")} value={form.activityLevel} onChange={(activityLevel) => setForm({ ...form, activityLevel })} values={[
            { value: "sedentary", label: t("profile.activitySedentary") }, { value: "light", label: t("profile.activityLight") }, { value: "moderate", label: t("profile.activityModerate") }, { value: "active", label: t("profile.activityActive") }, { value: "very_active", label: t("profile.activityVeryActive") }
          ]} />
          <SegmentedField label={t("profile.calorieGoal")} value={form.calorieGoal} onChange={(calorieGoal) => setForm({ ...form, calorieGoal })} values={[
            { value: "lose", label: t("profile.goalLose") }, { value: "maintain", label: t("profile.goalMaintain") }, { value: "gain", label: t("profile.goalGain") }
          ]} />
          {input(t("profile.manualTarget"), form.dailyCalorieTarget, (dailyCalorieTarget) => setForm({ ...form, dailyCalorieTarget }), "numeric")}
          <Pressable style={[shared.primaryButton, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void saveProfile()}><Text style={shared.primaryButtonText}>{saving ? t("common.loading") : t("common.save")}</Text></Pressable>
        </View>

        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("profile.dailyTarget")}</Text>
          <Text style={{ fontSize: 30, fontWeight: "700", color: colors.text }}>{targetPreview.targetCalories ? `${targetPreview.targetCalories} kcal` : "-"}</Text>
          <Text style={shared.helper}>{locale === "zh-CN" ? targetPreview.calculationNoteZh : targetPreview.calculationNoteEn}</Text>
        </View>

        {adapter.mode === "local" ? <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("profile.aiSettings")}</Text>
          <Text style={shared.helper}>{t("profile.aiSettingsDescription")}</Text>
          <SegmentedField label={t("profile.aiProvider")} value={provider} onChange={(value) => { setProvider(value); setKeyConfigured(false); }} values={[
            { value: "gemini", label: t("profile.aiProviderGemini") }, { value: "openai", label: t("profile.aiProviderOpenai") }
          ]} />
          <View style={{ gap: 2 }}>
            <Text style={shared.label}>{t("profile.apiKey")}</Text>
            <TextInput value={apiKey} onChangeText={setApiKey} placeholder={t("profile.apiKeyPlaceholder")} autoCapitalize="none" autoCorrect={false} secureTextEntry style={shared.input} />
          </View>
          <Text style={shared.helper}>{keyConfigured ? t("profile.apiKeyConfigured") : t("profile.apiKeyMissing")}</Text>
          <View style={shared.row}>
            <Pressable style={[shared.primaryButton, shared.flex, saving && { opacity: 0.6 }]} disabled={saving} onPress={() => void saveAiKey()}><Text style={shared.primaryButtonText}>{t("profile.saveApiKey")}</Text></Pressable>
            {keyConfigured ? <Pressable style={[shared.secondaryButton, shared.flex]} disabled={saving} onPress={() => void saveAiKey(true)}><Text style={shared.secondaryButtonText}>{t("profile.clearApiKey")}</Text></Pressable> : null}
          </View>
        </View> : <View style={shared.panel}>
          <Text style={shared.sectionTitle}>{t("profile.aiSettings")}</Text>
          <Text style={shared.helper}>Cloud AI is managed by your active subscription. Your personal provider keys are never uploaded to the cloud service.</Text>
        </View>}

        <View style={shared.panel}>
          <Text style={shared.sectionTitle}>App tools</Text>
          <Text style={shared.helper}>Review app status, update preferences, or revisit your daily records.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Link href="/(tabs)/settings" style={shared.secondaryButton}>Settings</Link>
            <Link href="/(tabs)/status" style={shared.secondaryButton}>Service status</Link>
            <Link href="/(tabs)/history" style={shared.secondaryButton}>Daily history</Link>
            <Link href={{ pathname: "/(tabs)/my-recipes", params: { saved: "1" } }} style={shared.secondaryButton}>Saved recipes</Link>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

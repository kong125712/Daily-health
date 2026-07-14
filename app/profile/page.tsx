"use client";

import { Eye, EyeOff, KeyRound, Save, Target, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { useApp } from "@/lib/i18n/I18nProvider";
import { calculateDailyCalorieTarget } from "@/lib/services/calorieTargets";
import type { ActivityLevel, CalorieGoal, ProfileGender, UserProfileView } from "@/lib/types/domain";
import { Toast, type ToastState } from "@/components/shared/Toast";

type ProfileResponse = {
  profile: UserProfileView;
};

type AiProvider = "gemini" | "openai";

type AiSettingsResponse = {
  aiSettings: {
    provider: AiProvider;
    model: string;
    configured: boolean;
    profileKeyConfigured: boolean;
    environmentKeyConfigured: boolean;
    providers: Record<AiProvider, { configured: boolean; profileKeyConfigured: boolean }>;
  };
};

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
  displayName: "",
  gender: "",
  birthYear: "",
  heightCm: "",
  weightKg: "",
  activityLevel: "sedentary",
  calorieGoal: "maintain",
  dailyCalorieTarget: ""
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
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formToProfileView(profileId: string, form: ProfileForm): UserProfileView {
  return {
    id: profileId,
    displayName: form.displayName.trim() || null,
    gender: form.gender || null,
    birthYear: numberOrNull(form.birthYear),
    heightCm: numberOrNull(form.heightCm),
    weightKg: numberOrNull(form.weightKg),
    activityLevel: form.activityLevel,
    calorieGoal: form.calorieGoal,
    dailyCalorieTarget: numberOrNull(form.dailyCalorieTarget),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export default function ProfilePage() {
  const { profileId, locale, t } = useApp();
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettingsResponse["aiSettings"] | null>(null);
  const [savingAi, setSavingAi] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    if (!profileId) return;
    setLoading(true);
    apiFetch<ProfileResponse>("/api/profile", { profileId, locale })
      .then((response) => setForm(formFromProfile(response.profile)))
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : t("common.error"), "error"))
      .finally(() => setLoading(false));
  }, [locale, profileId, t]);

  useEffect(() => {
    if (!profileId) return;
    apiFetch<AiSettingsResponse>("/api/ai-settings", { profileId, locale })
      .then((response) => {
        setAiSettings(response.aiSettings);
        setAiProvider(response.aiSettings.provider);
      })
      .catch((error: unknown) => showToast(error instanceof Error ? error.message : t("common.error"), "error"));
  }, [locale, profileId, t]);

  const targetPreview = useMemo(() => {
    if (!profileId) return null;
    return calculateDailyCalorieTarget(formToProfileView(profileId, form));
  }, [form, profileId]);

  async function save() {
    if (!profileId) return;
    setSaving(true);
    try {
      const response = await apiFetch<ProfileResponse>("/api/profile", {
        method: "PATCH",
        profileId,
        locale,
        body: {
          profileId,
          displayName: form.displayName.trim() || null,
          gender: form.gender || null,
          birthYear: numberOrNull(form.birthYear),
          heightCm: numberOrNull(form.heightCm),
          weightKg: numberOrNull(form.weightKg),
          activityLevel: form.activityLevel,
          calorieGoal: form.calorieGoal,
          dailyCalorieTarget: numberOrNull(form.dailyCalorieTarget)
        }
      });
      setForm(formFromProfile(response.profile));
      showToast(t("common.success"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("common.error"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveAiSettings(clearApiKey = false) {
    if (!profileId) return;
    const trimmedKey = apiKey.trim();
    if (!clearApiKey && trimmedKey && trimmedKey.length < 20) {
      showToast(t("profile.apiKeyInvalid"), "error");
      return;
    }

    setSavingAi(true);
    try {
      const response = await apiFetch<AiSettingsResponse>("/api/ai-settings", {
        method: "PATCH",
        profileId,
        locale,
        body: {
          profileId,
          provider: aiProvider,
          apiKey: clearApiKey || !trimmedKey ? undefined : trimmedKey,
          clearApiKey
        }
      });
      setAiSettings(response.aiSettings);
      setAiProvider(response.aiSettings.provider);
      setApiKey("");
      setShowApiKey(false);
      showToast(t(clearApiKey ? "profile.apiKeyCleared" : "profile.apiKeySaved"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("common.error"), "error");
    } finally {
      setSavingAi(false);
    }
  }

  return (
    <main className="page-shell">
      <Toast toast={toast} />
      <section className="page-header">
        <h1 className="page-title">{t("profile.title")}</h1>
        <p className="page-subtitle">{t("profile.subtitle")}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <form className="panel grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-leaf" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("profile.bodyInfo")}</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="field-label">{t("profile.displayName")}</span>
              <input className="field-input" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="field-label">{t("profile.gender")}</span>
              <select className="field-input" value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as ProfileForm["gender"] })}>
                <option value="">{t("profile.notSet")}</option>
                <option value="male">{t("profile.male")}</option>
                <option value="female">{t("profile.female")}</option>
                <option value="other">{t("profile.other")}</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="field-label">{t("profile.birthYear")}</span>
              <input className="field-input" type="number" min="1900" max={new Date().getFullYear()} value={form.birthYear} onChange={(event) => setForm({ ...form, birthYear: event.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="field-label">{t("profile.heightCm")}</span>
              <input className="field-input" type="number" min="80" max="250" step="0.1" value={form.heightCm} onChange={(event) => setForm({ ...form, heightCm: event.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="field-label">{t("profile.weightKg")}</span>
              <input className="field-input" type="number" min="20" max="400" step="0.1" value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="field-label">{t("profile.activityLevel")}</span>
              <select className="field-input" value={form.activityLevel} onChange={(event) => setForm({ ...form, activityLevel: event.target.value as ActivityLevel })}>
                <option value="sedentary">{t("profile.activitySedentary")}</option>
                <option value="light">{t("profile.activityLight")}</option>
                <option value="moderate">{t("profile.activityModerate")}</option>
                <option value="active">{t("profile.activityActive")}</option>
                <option value="very_active">{t("profile.activityVeryActive")}</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="field-label">{t("profile.calorieGoal")}</span>
              <select className="field-input" value={form.calorieGoal} onChange={(event) => setForm({ ...form, calorieGoal: event.target.value as CalorieGoal })}>
                <option value="lose">{t("profile.goalLose")}</option>
                <option value="maintain">{t("profile.goalMaintain")}</option>
                <option value="gain">{t("profile.goalGain")}</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="field-label">{t("profile.manualTarget")}</span>
              <input className="field-input" type="number" min="800" max="6000" value={form.dailyCalorieTarget} onChange={(event) => setForm({ ...form, dailyCalorieTarget: event.target.value })} />
            </label>
          </div>

          <button className="btn-primary justify-self-start" type="submit" disabled={saving || loading}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? t("common.loading") : t("common.save")}
          </button>
        </form>

        <section className="panel grid content-start gap-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-leaf" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("profile.dailyTarget")}</h2>
          </div>
          <div>
            <p className="text-3xl font-semibold text-slate-950 dark:text-white">
              {targetPreview?.targetCalories ? `${targetPreview.targetCalories} kcal` : "-"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {locale === "zh-CN" ? targetPreview?.calculationNoteZh : targetPreview?.calculationNoteEn}
            </p>
          </div>
        </section>
      </section>

      <section className="panel mt-4 grid gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-mint text-leaf dark:bg-emerald-950 dark:text-emerald-200">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("profile.aiSettings")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{t("profile.aiSettingsDescription")}</p>
          </div>
        </div>

        <form className="grid gap-4 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]" onSubmit={(event) => { event.preventDefault(); void saveAiSettings(); }}>
          <label className="grid gap-1">
            <span className="field-label">{t("profile.aiProvider")}</span>
            <select className="field-input" value={aiProvider} onChange={(event) => setAiProvider(event.target.value as AiProvider)} disabled={savingAi}>
              <option value="gemini">{t("profile.aiProviderGemini")}</option>
              <option value="openai">{t("profile.aiProviderOpenai")}</option>
            </select>
          </label>

          <label className="grid gap-1">
            <span className="field-label">{t("profile.apiKey")}</span>
            <span className="relative block">
              <input
                className="field-input pr-11"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                placeholder={t("profile.apiKeyPlaceholder")}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={savingAi}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <button
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 transition hover:text-leaf disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:text-emerald-300"
                type="button"
                title={showApiKey ? t("profile.hideApiKey") : t("profile.showApiKey")}
                aria-label={showApiKey ? t("profile.hideApiKey") : t("profile.showApiKey")}
                disabled={savingAi}
                onClick={() => setShowApiKey((current) => !current)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </span>
          </label>

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {aiSettings?.providers[aiProvider].configured ? t("profile.apiKeyConfigured") : t("profile.apiKeyMissing")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {aiSettings?.providers[aiProvider].profileKeyConfigured ? (
                <button
                  className="icon-button"
                  type="button"
                  title={t("profile.clearApiKey")}
                  aria-label={t("profile.clearApiKey")}
                  disabled={savingAi}
                  onClick={() => void saveAiSettings(true)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
              <button className="btn-primary" type="submit" disabled={savingAi}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {savingAi ? t("common.loading") : t("profile.saveApiKey")}
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}

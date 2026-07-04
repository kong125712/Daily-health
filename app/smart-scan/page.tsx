"use client";

import { CheckCircle2, ClipboardCheck, Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { IngredientScanView, RecognizedIngredientInput } from "@/lib/types/domain";
import { IngredientEditor } from "@/components/ingredients/IngredientEditor";
import { IngredientRecognitionResult } from "@/components/ingredients/IngredientRecognitionResult";
import { IngredientUploader } from "@/components/ingredients/IngredientUploader";
import { Toast, type ToastState } from "@/components/shared/Toast";

type ImageDraft = {
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string;
};

export default function SmartScanPage() {
  const { profileId, locale, t } = useApp();
  const router = useRouter();
  const [image, setImage] = useState<ImageDraft | null>(null);
  const [scan, setScan] = useState<IngredientScanView | null>(null);
  const [ingredients, setIngredients] = useState<RecognizedIngredientInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingConfirmation, setSavingConfirmation] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  async function analyze() {
    if (!profileId || !image) return;
    setLoading(true);
    try {
      const response = await apiFetch<{ scan: IngredientScanView }>("/api/analyze-ingredients", {
        method: "POST",
        profileId,
        locale,
        body: {
          profileId,
          locale,
          imageName: image.fileName,
          imageMimeType: image.mimeType,
          imageDataUrl: image.dataUrl
        }
      });
      setScan(response.scan);
      setIngredients(response.scan.ingredients);
      setShowEditor(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("common.error"), "error");
    } finally {
      setLoading(false);
    }
  }

  function updateIngredients(nextIngredients: RecognizedIngredientInput[]) {
    setIngredients(nextIngredients);
    if (scan?.confirmedAt) {
      setScan({ ...scan, confirmedAt: null });
    }
  }

  function canConfirmIngredients() {
    return (
      ingredients.length > 0 &&
      ingredients.every((ingredient) =>
        ingredient.normalizedName.trim() &&
        ingredient.displayNameEn.trim() &&
        ingredient.displayNameZh.trim() &&
        ingredient.estimatedAmount.trim()
      )
    );
  }

  async function confirmIngredients() {
    if (!profileId || !scan) return;
    if (!canConfirmIngredients()) {
      showToast(t("smart.needIngredients"), "error");
      return;
    }
    setSavingConfirmation(true);
    try {
      const response = await apiFetch<{ scan: IngredientScanView }>(`/api/ingredient-scans/${scan.id}`, {
        method: "PATCH",
        profileId,
        locale,
        body: { profileId, ingredients, confirmed: true }
      });
      setScan(response.scan);
      setIngredients(response.scan.ingredients);
      showToast(t("smart.confirmedToast"), "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("common.error"), "error");
    } finally {
      setSavingConfirmation(false);
    }
  }

  async function generateRecipes() {
    if (!profileId || !scan) return;
    if (!scan.confirmedAt) {
      showToast(t("smart.confirmFirst"), "error");
      return;
    }
    router.push(`/recipes?scanId=${scan.id}`);
  }

  const currentStep = scan?.confirmedAt ? 3 : scan ? 2 : 1;

  return (
    <main className="page-shell">
      <Toast toast={toast} />
      <section className="page-header">
        <h1 className="page-title">{t("smart.title")}</h1>
        <p className="page-subtitle">{t("smart.subtitle")}</p>
      </section>
      <section className="panel grid gap-3 sm:grid-cols-3">
        {[
          { step: 1, label: t("smart.stepUpload") },
          { step: 2, label: t("smart.stepReview") },
          { step: 3, label: t("smart.stepConfirmed") }
        ].map((item) => (
          <div key={item.step} className={`flex items-center gap-3 rounded-md p-3 ${currentStep >= item.step ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100" : "bg-slate-50 text-slate-500 dark:bg-slate-950 dark:text-slate-400"}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${currentStep >= item.step ? "bg-leaf text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
              {currentStep > item.step ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : item.step}
            </span>
            <span className="text-sm font-medium">{item.label}</span>
          </div>
        ))}
      </section>
      <IngredientUploader image={image} onImage={setImage} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" type="button" disabled={!image || loading} onClick={() => void analyze()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          {scan ? t("smart.again") : t("smart.start")}
        </button>
        <button
          className="btn-secondary"
          type="button"
          onClick={() => {
            setImage(null);
            setScan(null);
            setIngredients([]);
            setShowEditor(false);
          }}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t("smart.again")}
        </button>
      </div>
      <p className="rounded-md bg-white/80 p-3 text-sm leading-6 text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">{t("smart.notice")}</p>
      {scan ? <IngredientRecognitionResult scan={{ ...scan, ingredients: ingredients.map((ingredient, index) => ({ ...ingredient, id: scan.ingredients[index]?.id ?? `${index}`, position: index })) }} /> : null}
      {scan ? (
        <>
          <section className="panel flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-leaf" aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("smart.confirmTitle")}</h2>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {scan.confirmedAt ? t("smart.readyForRecipes") : t("smart.confirmSubtitle")}
                </p>
              </div>
              {scan.confirmedAt ? (
                <span className="rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100">
                  {t("smart.confirmed")}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" type="button" disabled={!canConfirmIngredients() || savingConfirmation} onClick={() => void confirmIngredients()}>
                {savingConfirmation ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                {scan.confirmedAt ? t("smart.confirmAgain") : t("smart.confirmIngredients")}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setShowEditor((visible) => !visible)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {showEditor ? t("smart.doneEditing") : t("smart.edit")}
              </button>
              {scan.confirmedAt ? (
                <button className="btn-primary" type="button" onClick={() => void generateRecipes()}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  {t("smart.generate")}
                </button>
              ) : null}
            </div>
            {!canConfirmIngredients() ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">{t("smart.needIngredients")}</p>
            ) : null}
          </section>
          {showEditor ? <IngredientEditor ingredients={ingredients} onChange={updateIngredients} /> : null}
        </>
      ) : null}
    </main>
  );
}

"use client";

import { Droplets } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { WaterSummary } from "@/lib/types/domain";
import { LoadingState } from "@/components/shared/LoadingState";

export function WaterTracker({ date, onChange }: { date: string; onChange?: () => void }) {
  const { profileId, locale, t, defaultWaterTargetMl, setDefaultWaterTargetMl } = useApp();
  const [water, setWater] = useState<WaterSummary | null>(null);
  const [custom, setCustom] = useState("");
  const [target, setTarget] = useState(defaultWaterTargetMl.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const showError = useCallback((error: unknown) => {
    setError(error instanceof Error ? error.message : t("common.error"));
  }, [t]);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      setError("");
      const response = await apiFetch<{ water: WaterSummary }>(`/api/water?date=${date}`, { profileId, locale });
      setWater(response.water);
      setTarget(response.water.targetMl.toString());
      onChange?.();
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [date, locale, onChange, profileId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(amountMl: number) {
    if (!profileId) return;
    try {
      setError("");
      const response = await apiFetch<{ water: WaterSummary }>("/api/water", {
        method: "POST",
        profileId,
        locale,
        body: { profileId, date, amountMl }
      });
      setWater(response.water);
      onChange?.();
    } catch (error) {
      showError(error);
    }
  }

  async function saveTarget() {
    if (!profileId) return;
    const next = Number(target);
    try {
      setError("");
      const response = await apiFetch<{ water: WaterSummary }>("/api/water", {
        method: "PATCH",
        profileId,
        locale,
        body: { profileId, date, targetMl: next }
      });
      setWater(response.water);
      setDefaultWaterTargetMl(next);
      onChange?.();
    } catch (error) {
      showError(error);
    }
  }

  async function reset() {
    if (!profileId) return;
    try {
      setError("");
      const response = await apiFetch<{ water: WaterSummary }>("/api/water", {
        method: "DELETE",
        profileId,
        locale,
        body: { profileId, date }
      });
      setWater(response.water);
      onChange?.();
    } catch (error) {
      showError(error);
    }
  }

  if (loading && !water) {
    return <LoadingState />;
  }

  const percent = water ? Math.min(100, Math.round((water.totalMl / water.targetMl) * 100)) : 0;

  return (
    <section className="panel grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("water.total")}</h2>
        <Droplets className="h-5 w-5 text-leaf" aria-hidden="true" />
      </div>
      {error ? <p className="rounded border border-berry/30 bg-berry/10 px-3 py-2 text-sm font-medium text-berry">{error}</p> : null}
      <div>
        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
          <span>{water?.totalMl ?? 0} ml</span>
          <span>{percent}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-leaf transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" type="button" onClick={() => void add(250)}>
          {t("water.add250")}
        </button>
        <button className="btn-secondary" type="button" onClick={() => void add(500)}>
          {t("water.add500")}
        </button>
        <input className="field-input max-w-40" type="number" min="1" value={custom} placeholder="ml" onChange={(event) => setCustom(event.target.value)} />
        <button className="btn-primary" type="button" onClick={() => custom && void add(Number(custom))}>
          {t("common.add")}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1">
          <span className="field-label">{t("water.target")}</span>
          <input className="field-input" type="number" min="250" value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <button className="btn-secondary self-end" type="button" onClick={() => void saveTarget()}>
          {t("water.changeTarget")}
        </button>
      </div>
      <button className="btn-danger justify-self-start" type="button" onClick={() => void reset()}>
        {t("water.resetToday")}
      </button>
    </section>
  );
}

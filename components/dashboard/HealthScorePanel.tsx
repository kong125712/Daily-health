"use client";

import Link from "next/link";
import { Activity, Droplets, HeartPulse, Moon, Utensils } from "lucide-react";
import { useApp } from "@/lib/i18n/I18nProvider";
import type { HealthScoreMetric, HealthScoreView } from "@/lib/services/healthScore";

const iconMap: Record<HealthScoreMetric["key"], typeof Utensils> = {
  calories: Utensils,
  hydration: Droplets,
  activity: Activity,
  sleep: Moon
};

const barColor: Record<HealthScoreMetric["tone"], string> = {
  good: "bg-leaf",
  warning: "bg-amber-500",
  danger: "bg-rose-500"
};

function scoreColor(score: number) {
  if (score >= 85) return "#059669";
  if (score >= 70) return "#0f766e";
  if (score >= 50) return "#d97706";
  return "#e11d48";
}

function MetricRow({ metric }: { metric: HealthScoreMetric }) {
  const { t } = useApp();
  const Icon = iconMap[metric.key];

  return (
    <div className="grid gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{t(metric.labelKey)}</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">
          {metric.points}/{metric.maxPoints}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-full rounded-full ${barColor[metric.tone]}`} style={{ width: `${metric.percent}%` }} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{metric.value}</p>
    </div>
  );
}

export function HealthScorePanel({ healthScore }: { healthScore: HealthScoreView }) {
  const { t } = useApp();
  const color = scoreColor(healthScore.score);

  return (
    <section className="panel">
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div
            className="flex h-36 w-36 items-center justify-center rounded-full p-2"
            style={{
              background: `conic-gradient(${color} ${healthScore.score * 3.6}deg, rgba(148, 163, 184, 0.22) 0deg)`
            }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-inner dark:bg-slate-900">
              <HeartPulse className="mb-1 h-6 w-6" style={{ color }} aria-hidden="true" />
              <span className="text-4xl font-semibold text-slate-950 dark:text-white">{healthScore.score}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{t("dashboard.scoreOutOf100")}</span>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("dashboard.healthScore")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t(healthScore.statusKey)}</p>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {healthScore.metrics.map((metric) => (
              <MetricRow key={metric.key} metric={metric} />
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("dashboard.healthAdvice")}</p>
              <ul className="mt-1 grid gap-1 text-sm text-slate-500 dark:text-slate-400">
                {healthScore.adviceKeys.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </div>
            {healthScore.adviceKeys.includes("dashboard.advice.completeProfile") ? (
              <Link className="btn-secondary shrink-0 justify-center" href="/profile">
                {t("food.completeProfile")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

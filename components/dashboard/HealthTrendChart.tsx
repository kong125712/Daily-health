"use client";

import { TrendingUp } from "lucide-react";
import { useApp } from "@/lib/i18n/I18nProvider";

export type HealthTrendPoint = {
  date: string;
  score: number;
  calories: number;
  waterMl: number;
  exerciseMinutes: number;
  sleepHours: number | null;
};

function averageScore(points: HealthTrendPoint[]) {
  if (points.length === 0) return 0;
  return Math.round(points.reduce((sum, point) => sum + point.score, 0) / points.length);
}

function bestPoint(points: HealthTrendPoint[]) {
  return points.reduce<HealthTrendPoint | null>((best, point) => {
    if (!best || point.score > best.score) return point;
    return best;
  }, null);
}

function dotColor(score: number) {
  if (score >= 75) return "#059669";
  if (score >= 50) return "#d97706";
  return "#e11d48";
}

export function HealthTrendChart({ points }: { points: HealthTrendPoint[] }) {
  const { t } = useApp();
  const latest = points.at(-1);
  const best = bestPoint(points);
  const average = averageScore(points);
  const width = 360;
  const height = 150;
  const padding = { top: 14, right: 12, bottom: 24, left: 34 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const linePoints = points.map((point, index) => {
    const x = padding.left + (points.length > 1 ? (index / (points.length - 1)) * chartWidth : chartWidth / 2);
    const y = padding.top + ((100 - point.score) / 100) * chartHeight;
    return { x, y, point };
  });

  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-leaf dark:text-emerald-300" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{t("dashboard.healthTrend")}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("dashboard.healthTrendSubtitle")}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right text-sm">
          <div>
            <p className="text-slate-500 dark:text-slate-400">{t("dashboard.latestScore")}</p>
            <p className="mt-1 font-semibold text-slate-950 dark:text-white">{latest ? `${latest.score}/100` : "0/100"}</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400">{t("dashboard.sevenDayAverage")}</p>
            <p className="mt-1 font-semibold text-slate-950 dark:text-white">{average}/100</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-400">{t("dashboard.bestDay")}</p>
            <p className="mt-1 font-semibold text-slate-950 dark:text-white">
              {best ? `${best.date.slice(5)} ${best.score}` : "-"}
            </p>
          </div>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t("dashboard.noTrendData")}
        </p>
      ) : (
        <div className="mt-5 h-48 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
          <svg className="h-full w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("dashboard.healthTrend")}>
            {[0, 50, 100].map((value) => {
              const y = padding.top + ((100 - value) / 100) * chartHeight;
              return (
                <g key={value}>
                  <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />
                  <text x="4" y={y + 4} className="fill-slate-400 text-[10px]">{value}</text>
                </g>
              );
            })}
            <polyline
              points={linePoints.map(({ x, y }) => `${x},${y}`).join(" ")}
              fill="none"
              stroke="currentColor"
              className="text-emerald-600 dark:text-emerald-300"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            {linePoints.map(({ x, y, point }) => (
              <circle key={point.date} cx={x} cy={y} r="4" fill={dotColor(point.score)} stroke="white" strokeWidth="2">
                <title>{`${point.date}: ${point.score}/100`}</title>
              </circle>
            ))}
            {points.map((point, index) => {
              const x = padding.left + (points.length > 1 ? (index / (points.length - 1)) * chartWidth : chartWidth / 2);
              return (
                <text key={`${point.date}-label`} x={x} y={height - 5} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  {point.date.slice(5)}
                </text>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}

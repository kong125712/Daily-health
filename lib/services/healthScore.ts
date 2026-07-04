import type { TranslationKey } from "@/lib/i18n/translations";
import type { DailyHistoryView, UserProfileView } from "@/lib/types/domain";
import { calculateDailyCalorieTarget } from "@/lib/services/calorieTargets";

type MetricTone = "good" | "warning" | "danger";

export type HealthScoreMetric = {
  key: "calories" | "hydration" | "activity" | "sleep";
  labelKey: TranslationKey;
  value: string;
  points: number;
  maxPoints: number;
  percent: number;
  tone: MetricTone;
};

export type HealthScoreView = {
  score: number;
  statusKey: TranslationKey;
  adviceKeys: TranslationKey[];
  metrics: HealthScoreMetric[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number) {
  return Math.round(value);
}

function metricTone(percent: number): MetricTone {
  if (percent >= 75) return "good";
  if (percent >= 45) return "warning";
  return "danger";
}

function buildMetric(input: Omit<HealthScoreMetric, "percent" | "tone">): HealthScoreMetric {
  const percent = round((input.points / input.maxPoints) * 100);
  return {
    ...input,
    points: round(input.points),
    percent,
    tone: metricTone(percent)
  };
}

function uniqueAdvice(keys: TranslationKey[]) {
  return [...new Set(keys)].slice(0, 3);
}

function calorieMetric(profile: UserProfileView, history: DailyHistoryView) {
  const maxPoints = 35;
  const target = calculateDailyCalorieTarget(profile).targetCalories;
  const total = history.dailyCalories;
  const advice: TranslationKey[] = [];

  if (!target) {
    advice.push("dashboard.advice.completeProfile");
    if (history.foodLogs.length === 0) {
      advice.push("dashboard.advice.logFood");
    }

    return {
      metric: buildMetric({
        key: "calories",
        labelKey: "dashboard.metric.calories",
        value: target ? `${total} / ${target} kcal` : `${total} kcal`,
        points: history.foodLogs.length ? 18 : 0,
        maxPoints
      }),
      advice
    };
  }

  if (history.foodLogs.length === 0) {
    advice.push("dashboard.advice.logFood");
    return {
      metric: buildMetric({
        key: "calories",
        labelKey: "dashboard.metric.calories",
        value: `${total} / ${target} kcal`,
        points: 0,
        maxPoints
      }),
      advice
    };
  }

  const points =
    total <= target
      ? 22 + (clamp(total / target, 0, 1) * 13)
      : maxPoints * (1 - clamp((total - target) / (target * 0.4), 0, 1));

  if (total > target) {
    advice.push("dashboard.advice.reduceCalories");
  } else if (total < target * 0.55) {
    advice.push("dashboard.advice.addBalancedMeal");
  }

  return {
    metric: buildMetric({
      key: "calories",
      labelKey: "dashboard.metric.calories",
      value: `${total} / ${target} kcal`,
      points,
      maxPoints
    }),
    advice
  };
}

function hydrationMetric(history: DailyHistoryView) {
  const maxPoints = 25;
  const target = Math.max(history.water.targetMl, 1);
  const total = history.water.totalMl;
  const ratio = clamp(total / target, 0, 1);
  const advice: TranslationKey[] = [];

  if (ratio < 0.75) {
    advice.push("dashboard.advice.drinkWater");
  }

  return {
    metric: buildMetric({
      key: "hydration",
      labelKey: "dashboard.metric.hydration",
      value: `${total} / ${target} ml`,
      points: ratio * maxPoints,
      maxPoints
    }),
    advice
  };
}

function activityMetric(history: DailyHistoryView) {
  const maxPoints = 20;
  const dailyGoalMinutes = 30;
  const minutes = history.exerciseMinutes;
  const ratio = clamp(minutes / dailyGoalMinutes, 0, 1);
  const advice: TranslationKey[] = [];

  if (minutes < 20) {
    advice.push("dashboard.advice.moveMore");
  }

  return {
    metric: buildMetric({
      key: "activity",
      labelKey: "dashboard.metric.activity",
      value: `${minutes} / ${dailyGoalMinutes} min`,
      points: ratio * maxPoints,
      maxPoints
    }),
    advice
  };
}

function sleepMetric(history: DailyHistoryView) {
  const maxPoints = 20;
  const sleep = history.sleep;
  const advice: TranslationKey[] = [];

  if (!sleep) {
    advice.push("dashboard.advice.logSleep");
    return {
      metric: buildMetric({
        key: "sleep",
        labelKey: "dashboard.metric.sleep",
        value: "-",
        points: 0,
        maxPoints
      }),
      advice
    };
  }

  const durationRatio = clamp(1 - (Math.abs(sleep.hours - 8) / 4), 0, 1);
  const qualityRatio = sleep.quality === "good" ? 1 : sleep.quality === "average" ? 0.75 : 0.45;
  const points = maxPoints * ((durationRatio * 0.7) + (qualityRatio * 0.3));

  if (sleep.hours < 6.5) {
    advice.push("dashboard.advice.sleepMore");
  }
  if (sleep.quality === "poor") {
    advice.push("dashboard.advice.sleepQuality");
  }

  return {
    metric: buildMetric({
      key: "sleep",
      labelKey: "dashboard.metric.sleep",
      value: `${sleep.hours} h`,
      points,
      maxPoints
    }),
    advice
  };
}

function statusKey(score: number): TranslationKey {
  if (score >= 85) return "dashboard.status.excellent";
  if (score >= 70) return "dashboard.status.good";
  if (score >= 50) return "dashboard.status.fair";
  return "dashboard.status.low";
}

export function calculateHealthScore(input: {
  profile: UserProfileView;
  history: DailyHistoryView;
}): HealthScoreView {
  const sections = [
    calorieMetric(input.profile, input.history),
    hydrationMetric(input.history),
    activityMetric(input.history),
    sleepMetric(input.history)
  ];

  const metrics = sections.map((section) => section.metric);
  const score = clamp(round(metrics.reduce((sum, metric) => sum + metric.points, 0)), 0, 100);
  const adviceKeys = uniqueAdvice(sections.flatMap((section) => section.advice));

  return {
    score,
    statusKey: statusKey(score),
    adviceKeys: adviceKeys.length ? adviceKeys : ["dashboard.advice.keepSteady"],
    metrics
  };
}

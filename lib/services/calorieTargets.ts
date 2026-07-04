import type { ActivityLevel, CalorieGuidanceView, UserProfileView } from "@/lib/types/domain";

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};

function roundToNearestTen(value: number) {
  return Math.round(value / 10) * 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function currentYear() {
  return new Date().getFullYear();
}

function sexOffset(profile: UserProfileView) {
  if (profile.gender === "male") return 5;
  if (profile.gender === "female") return -161;
  return -78;
}

export function calculateDailyCalorieTarget(profile: UserProfileView) {
  if (profile.dailyCalorieTarget) {
    return {
      targetCalories: profile.dailyCalorieTarget,
      profileComplete: true,
      calculationNoteEn: "Using your manual daily calorie target from Profile.",
      calculationNoteZh: "正在使用你在个人资料中手动设置的每日热量目标。"
    };
  }

  if (!profile.gender || !profile.birthYear || !profile.heightCm || !profile.weightKg) {
    return {
      targetCalories: null,
      profileComplete: false,
      calculationNoteEn: "Complete your profile to calculate a personalized daily calorie target.",
      calculationNoteZh: "请先完善个人资料，系统才能计算个性化每日热量目标。"
    };
  }

  const age = clamp(currentYear() - profile.birthYear, 10, 100);
  const bmr = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * age) + sexOffset(profile);
  const maintenance = bmr * activityMultipliers[profile.activityLevel];
  const goalAdjustment = profile.calorieGoal === "lose" ? -400 : profile.calorieGoal === "gain" ? 300 : 0;
  const targetCalories = clamp(roundToNearestTen(maintenance + goalAdjustment), 800, 6000);

  return {
    targetCalories,
    profileComplete: true,
    calculationNoteEn: "Estimated from your profile using BMR, activity level, and goal. Use it as everyday guidance only.",
    calculationNoteZh: "根据你的基础代谢、活动水平和目标估算，仅供日常参考。"
  };
}

function overTargetAdvice(excessCalories: number) {
  const levelEn =
    excessCalories >= 500
      ? "You are clearly above today's target."
      : excessCalories >= 200
        ? "You are moderately above today's target."
        : "You are slightly above today's target.";
  const levelZh =
    excessCalories >= 500
      ? "今天已经明显超过目标。"
      : excessCalories >= 200
        ? "今天已经中等程度超过目标。"
        : "今天已经稍微超过目标。";

  return {
    adviceEn: [
      `${levelEn} Keep the next meal lighter with lean protein, vegetables, soup, or fruit.`,
      "Avoid compensating by skipping meals completely; return to a steady routine tomorrow.",
      "If the extra calories came from drinks, snacks, or cooking oil, adjust those first next time."
    ],
    adviceZh: [
      `${levelZh} 下一餐可以选择更清淡的瘦蛋白、蔬菜、汤品或水果。`,
      "不建议用完全不吃下一餐来补偿，明天回到稳定节奏更重要。",
      "如果超出的热量来自饮料、零食或烹调用油，下次可以优先从这些地方调整。"
    ]
  };
}

export function buildCalorieGuidance(profile: UserProfileView, dailyTotal: number): CalorieGuidanceView {
  const target = calculateDailyCalorieTarget(profile);
  if (!target.targetCalories) {
    return {
      dailyTotal,
      targetCalories: null,
      remainingCalories: null,
      excessCalories: null,
      isOverTarget: false,
      profileComplete: target.profileComplete,
      calculationNoteEn: target.calculationNoteEn,
      calculationNoteZh: target.calculationNoteZh,
      adviceEn: ["Add your height, weight, birth year, sex, activity level, and goal in Profile to enable daily calorie guidance."],
      adviceZh: ["请先在个人资料中填写身高、体重、出生年份、性别、活动水平和目标，系统才会启用每日热量判断。"]
    };
  }

  const difference = target.targetCalories - dailyTotal;
  const isOverTarget = difference < 0;
  const advice = isOverTarget
    ? overTargetAdvice(Math.abs(difference))
    : {
        adviceEn: ["You are within today's calorie target. Keep portions steady and leave room for protein, vegetables, and hydration."],
        adviceZh: ["今天仍在目标范围内。保持份量稳定，并给蛋白质、蔬菜和补水留出空间。"]
      };

  return {
    dailyTotal,
    targetCalories: target.targetCalories,
    remainingCalories: Math.max(difference, 0),
    excessCalories: isOverTarget ? Math.abs(difference) : 0,
    isOverTarget,
    profileComplete: target.profileComplete,
    calculationNoteEn: target.calculationNoteEn,
    calculationNoteZh: target.calculationNoteZh,
    adviceEn: advice.adviceEn,
    adviceZh: advice.adviceZh
  };
}

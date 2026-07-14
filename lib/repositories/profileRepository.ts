import { prisma } from "@/lib/db";
import type { ActivityLevel, CalorieGoal, ProfileGender } from "@/lib/types/domain";
import { serializeAppSettings, serializeProfile } from "@/lib/repositories/serializers";
import { ensureAppSettingsSchema } from "@/lib/repositories/settingsSchema";
import { profileIdSchema } from "@/lib/validation/schemas";

export async function ensureProfile(profileId: string) {
  const id = profileIdSchema.parse(profileId);
  await ensureAppSettingsSchema();

  await prisma.profile.upsert({
    where: { id },
    update: {},
    create: { id }
  });

  const settings = await prisma.appSettings.upsert({
    where: { profileId: id },
    update: {},
    create: {
      profileId: id,
      locale: "en",
      theme: "light",
      defaultWaterTargetMl: 2000
    }
  });

  return {
    profile: serializeProfile(await prisma.profile.findUniqueOrThrow({ where: { id } })),
    settings: serializeAppSettings(settings)
  };
}

export async function getProfile(profileId: string) {
  const result = await ensureProfile(profileId);
  return result.profile;
}

export async function updateProfile(input: {
  profileId: string;
  displayName?: string | null;
  gender?: ProfileGender | null;
  birthYear?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel;
  calorieGoal?: CalorieGoal;
  dailyCalorieTarget?: number | null;
}) {
  await ensureProfile(input.profileId);

  const profile = await prisma.profile.update({
    where: { id: input.profileId },
    data: {
      displayName: input.displayName,
      gender: input.gender,
      birthYear: input.birthYear,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      activityLevel: input.activityLevel,
      calorieGoal: input.calorieGoal,
      dailyCalorieTarget: input.dailyCalorieTarget
    }
  });

  return serializeProfile(profile);
}

export async function deleteProfile(profileId: string) {
  return prisma.profile.delete({ where: { id: profileId } });
}

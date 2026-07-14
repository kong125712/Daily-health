import { prisma } from "@/lib/db";
import type { AppLocale, ThemeMode } from "@/lib/types/domain";
import { ensureAppSettingsSchema } from "@/lib/repositories/settingsSchema";

export async function getOrCreateSettings(profileId: string) {
  await ensureAppSettingsSchema();
  await prisma.profile.upsert({
    where: { id: profileId },
    update: {},
    create: { id: profileId }
  });

  return prisma.appSettings.upsert({
    where: { profileId },
    update: {},
    create: {
      profileId,
      locale: "en",
      theme: "light",
      defaultWaterTargetMl: 2000
    }
  });
}

export async function updateSettings(input: {
  profileId: string;
  locale?: AppLocale;
  theme?: ThemeMode;
  defaultWaterTargetMl?: number;
}) {
  await getOrCreateSettings(input.profileId);

  return prisma.appSettings.update({
    where: { profileId: input.profileId },
    data: {
      locale: input.locale,
      theme: input.theme,
      defaultWaterTargetMl: input.defaultWaterTargetMl
    }
  });
}

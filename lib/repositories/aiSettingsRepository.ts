import { prisma } from "@/lib/db";
import { getOrCreateSettings } from "@/lib/repositories/settingsRepository";

export type AiProvider = "gemini" | "openai";

export async function getAiSettings(profileId: string) {
  await getOrCreateSettings(profileId);
  return prisma.appSettings.findUniqueOrThrow({ where: { profileId } });
}

export async function updateAiSettings(input: {
  profileId: string;
  provider: AiProvider;
  apiKey?: string;
  clearApiKey?: boolean;
}) {
  await getOrCreateSettings(input.profileId);

  return prisma.appSettings.update({
    where: { profileId: input.profileId },
    data: {
      aiProvider: input.provider,
      ...(input.clearApiKey
        ? input.provider === "gemini"
          ? { geminiApiKey: null }
          : { openaiApiKey: null }
        : input.apiKey
          ? input.provider === "gemini"
            ? { geminiApiKey: input.apiKey }
            : { openaiApiKey: input.apiKey }
          : {})
    }
  });
}

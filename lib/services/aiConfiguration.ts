import { getAiSettings } from "@/lib/repositories/aiSettingsRepository";
import type { AiProvider } from "@/lib/repositories/aiSettingsRepository";

function savedProvider(value: string | null | undefined): AiProvider | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "gemini" || normalized === "openai") return normalized;
  return null;
}

function environmentKey(provider: AiProvider) {
  return provider === "gemini"
    ? process.env.GEMINI_API_KEY?.trim() || null
    : process.env.OPENAI_API_KEY?.trim() || null;
}

export function defaultAiProvider(): AiProvider {
  return savedProvider(process.env.AI_PROVIDER) ?? "openai";
}

export function aiModelName(provider: AiProvider) {
  return provider === "gemini"
    ? process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite"
    : "gpt-4o-mini";
}

export async function resolveAiConfiguration(profileId: string) {
  const settings = await getAiSettings(profileId);
  const provider = savedProvider(settings.aiProvider) ?? defaultAiProvider();
  const storedKey = provider === "gemini" ? settings.geminiApiKey?.trim() : settings.openaiApiKey?.trim();
  const fallbackKey = environmentKey(provider);

  return {
    provider,
    apiKey: storedKey || fallbackKey || null,
    usesProfileKey: Boolean(storedKey),
    model: aiModelName(provider)
  };
}

export async function resolveGeminiApiKey(profileId: string) {
  const settings = await getAiSettings(profileId);
  return settings.geminiApiKey?.trim() || environmentKey("gemini") || null;
}

export async function getAiSettingsView(profileId: string) {
  const settings = await getAiSettings(profileId);
  const provider = savedProvider(settings.aiProvider) ?? defaultAiProvider();
  const geminiProfileKeyConfigured = Boolean(settings.geminiApiKey?.trim());
  const openaiProfileKeyConfigured = Boolean(settings.openaiApiKey?.trim());
  const profileKeyConfigured = provider === "gemini" ? geminiProfileKeyConfigured : openaiProfileKeyConfigured;
  const environmentKeyConfigured = Boolean(environmentKey(provider));

  return {
    provider,
    model: aiModelName(provider),
    configured: profileKeyConfigured || environmentKeyConfigured,
    profileKeyConfigured,
    environmentKeyConfigured,
    providers: {
      gemini: {
        configured: geminiProfileKeyConfigured || Boolean(environmentKey("gemini")),
        profileKeyConfigured: geminiProfileKeyConfigured
      },
      openai: {
        configured: openaiProfileKeyConfigured || Boolean(environmentKey("openai")),
        profileKeyConfigured: openaiProfileKeyConfigured
      }
    }
  };
}
